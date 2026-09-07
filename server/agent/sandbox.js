// server/agent/sandbox.js
// 周期 3 P1-2: 服务端代码沙箱 —— 基于 node:vm，不用 vm2
// 周期 4 P1-2: 沙箱升级 —— worker_threads 隔离 + Resource limits
//
// 背景：
//   - 周期 3 用 node:vm + createContext + 显式白名单；仅时间隔离
//   - 周期 4 升级为真线程隔离（worker_threads）+ Resource limits：
//     1. heapMb 限制（V8 --max-old-space-size）
//     2. timeoutMs（worker.terminate 兜底）
//     3. CPU / mem 采样 watchdog（可选）
//   - 周期 3 旧 API executeInSandbox 保留不变；新增 executeInSandboxWorker
//
// 设计：
//   - executeInSandbox(code, ctx, opts) → { ok, value, error, durationMs }
//   - executeInSandboxWorker(code, ctx, opts) → { ok, value, error, durationMs, workerId }
//     用 worker_threads 跑，worker 脚本在 sandbox-worker.js
//   - 显式 vm.createContext(sandbox) —— 不共享全局（executeInSandbox 行为不变）
//   - 沙箱内不允许 require / process / global / Buffer 访问
//   - 白名单 API：只暴露 ctx 显式传入的字段
//   - Resource limits（worker 版）：
//       timeoutMs（默认 5s）
//       heapMb（默认 64）
//   - 错误捕获：脚本抛错 → 返回结构化 { message, line }
//   - 返回值：await Promise.resolve(script.runInContext(...))
//
// 验收（executeInSandboxWorker）：
//   - 同步代码可跑 + 返回值
//   - 异步 async 可跑 + await
//   - require('fs') 抛错
//   - process / global / Buffer undefined
//   - 超时 → worker.terminate
//   - 死循环 → 不会卡死主线程（worker 独立）
//   - heap 超限 → worker 抛 RangeError

'use strict';

const vm = require('node:vm');
const { Worker } = require('node:worker_threads');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_WORKER_HEAP_MB = 64;

// 周期 6 P1-2 续: heap snapshot 配置
//   - 触发条件：worker 异常退出 / CPU 超限 / heap 超限 / 显式调用
//   - 落盘目录：SNAPSHOT_DIR（默认 ./tmp/snapshots）
//   - 节流：相同 trigger 在 1s 内不重复
//   - 保留：最近 5 个 LIFO
const SNAPSHOT_DIR = process.env.SANDBOX_SNAPSHOT_DIR || path.join(os.tmpdir(), 'cesium-sandbox-snapshots');
const SNAPSHOT_RETAIN = parseInt(process.env.SANDBOX_SNAPSHOT_RETAIN || '5', 10);
const SNAPSHOT_THROTTLE_MS = parseInt(process.env.SANDBOX_SNAPSHOT_THROTTLE_MS || '1000', 10);
const _lastSnapshotAt = new Map(); // trigger -> ms timestamp

function ensureSnapshotDir() {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
}

function pruneOldSnapshots() {
  // 保留最近 N 个（LIFO 按 mtime）
  try {
    const files = fs.readdirSync(SNAPSHOT_DIR)
      .filter((f) => f.endsWith('.heapsnapshot'))
      .map((f) => ({ f, mtime: fs.statSync(path.join(SNAPSHOT_DIR, f)).mtimeMs }));
    files.sort((a, b) => b.mtime - a.mtime);
    for (const { f } of files.slice(SNAPSHOT_RETAIN)) {
      fs.unlinkSync(path.join(SNAPSHOT_DIR, f));
    }
  } catch (_) { /* 兜底 */ }
}

/**
 * 周期 6 P1-2 续: 触发 worker heap snapshot
 * - worker 端通过 parentPort.postMessage('snapshot') 请求（worker 内部 v8 调用）
 * - 主线程：调 worker.evaluate (v8.writeHeapSnapshot) → 拿 buffer → 落盘
 * - 用 promise + 节流
 * - 失败兜底：catch + console.error，不影响主流程
 */
async function captureWorkerHeapSnapshot(worker, trigger) {
  const now = Date.now();
  const last = _lastSnapshotAt.get(trigger) || 0;
  if (now - last < SNAPSHOT_THROTTLE_MS) {
    return { skipped: true, reason: 'throttled' };
  }
  _lastSnapshotAt.set(trigger, now);
  try {
    ensureSnapshotDir();
    const ts = new Date(now).toISOString().replace(/[:.]/g, '-');
    const filename = path.join(SNAPSHOT_DIR, `${trigger}-${ts}.heapsnapshot`);
    // worker 线程内 v8.writeHeapSnapshot 返回 string（文件路径）
    const filePath = await worker.workerData ? Promise.resolve() : null;
    // 实际：v8.writeHeapSnapshot 仅在 worker 线程内可调；用 worker.postMessage 协议
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        resolve({ ok: false, reason: 'snapshot-timeout' });
      }, 3000);
      const onMsg = (m) => {
        if (done) return;
        if (m && m.event === 'snapshot_done') {
          done = true;
          clearTimeout(timer);
          worker.off('message', onMsg);
          // worker 把 heap buffer 发回来；主线程落盘
          if (m.bufferBase64) {
            try {
              const buf = Buffer.from(m.bufferBase64, 'base64');
              fs.writeFileSync(filename, buf);
              pruneOldSnapshots();
              resolve({ ok: true, path: filename, size: buf.length });
            } catch (e) {
              resolve({ ok: false, reason: e.message });
            }
          } else if (m.path) {
            // worker 端 v8.writeHeapSnapshot 直接写盘
            try {
              if (fs.existsSync(m.path)) {
                const content = fs.readFileSync(m.path);
                fs.writeFileSync(filename, content);
                fs.unlinkSync(m.path);
                pruneOldSnapshots();
                resolve({ ok: true, path: filename, size: content.length });
              } else {
                resolve({ ok: false, reason: 'worker-side file missing' });
              }
            } catch (e) {
              resolve({ ok: false, reason: e.message });
            }
          } else {
            resolve({ ok: false, reason: 'no buffer or path in worker response' });
          }
        } else if (m && m.event === 'snapshot_error') {
          done = true;
          clearTimeout(timer);
          worker.off('message', onMsg);
          resolve({ ok: false, reason: m.message });
        }
      };
      worker.on('message', onMsg);
      worker.postMessage({ event: 'snapshot_request' });
    });
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

/**
 * 在沙箱里跑一段 JS 代码
 * @param {string} code - 要跑的脚本
 * @param {object} [ctx] - 注入沙箱的对象（viewer/Cesium/scene 等业务命名）
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=5000]
 * @param {string} [opts.filename='sandbox.js']
 * @returns {Promise<{ok: boolean, value?: any, error?: {message:string,line?:number}, durationMs:number, logs: Array}>}
 */
async function executeInSandbox(code, ctx = {}, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const filename = opts.filename ?? 'sandbox.js';

  // 1. 构造沙箱上下文
  //    显式列字段（防止 ctx 里有 process/fs）
  //    显式把"危险全局"设为 undefined（防逃逸）
  const sandbox = {
    // 业务命名（白名单内）
    ...ctx,
    // 最小全局：console + Math + JSON + Promise + setTimeout / clearTimeout
    console: wrapConsole(),
    Math,
    JSON,
    Promise,
    setTimeout: safeTimer('setTimeout'),
    setInterval: safeTimer('setInterval'),
    clearTimeout,
    clearInterval,
    // 显式屏蔽
    require: undefined,
    module: undefined,
    exports: undefined,
    process: undefined,
    global: undefined,
    globalThis: undefined,
    Buffer: undefined,
    __dirname: undefined,
    __filename: undefined,
    // 标记：沙箱内抛错用
    sandboxMarker: 'cesium-gis-editor-sandbox-v1',
  };
  vm.createContext(sandbox);

  // 2. 包成 async IIFE，runner 接受 ctx 字段作参数（从 sandbox 解构）
  //    把 ctx 的 key 显式列出来作为参数名
  const ctxKeys = Object.keys(ctx);
  const paramNames = ['__ctx'].concat(ctxKeys);
  // 用 "new Function" 风格：不写 'use strict'（这样顶层允许 return）
  // 改成显式 IIFE 形式：await (async () => { ... })()
  const wrapped = `(async (__ctx) => {\n${code}\n})(__ctx);`;
  const script = new vm.Script(wrapped, { filename });

  // 3. 超时控制（vm.runInContext 不支持 AbortSignal；用 race）
  const t0 = Date.now();
  const execPromise = (async () => {
    // 把 sandbox 里 ctx 字段名 -> 值，构造 __ctx 对象传给脚本
    const ctxObj = {};
    for (const k of ctxKeys) ctxObj[k] = sandbox[k];
    sandbox.__ctx = ctxObj;
    return script.runInContext(sandbox, {
      displayErrors: true,
      timeout: timeoutMs, // node 19+ 支持；本项目 Node >= 18，先 try
    });
  })();

  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error(`sandbox 执行超时（${timeoutMs}ms）`);
      e.code = 'SANDBOX_TIMEOUT';
      reject(e);
    }, timeoutMs + 200); // 给 vm 内 timeout 200ms 余地
  });

  try {
    const value = await Promise.race([execPromise, timeoutPromise]);
    clearTimeout(timer);
    return {
      ok: true,
      value: await Promise.resolve(value),
      durationMs: Date.now() - t0,
      logs: (sandbox.console && sandbox.console.__sandboxLogs) || [],
    };
  } catch (e) {
    clearTimeout(timer);
    return {
      ok: false,
      error: parseSandboxError(e, wrapped),
      durationMs: Date.now() - t0,
      logs: (sandbox.console && sandbox.console.__sandboxLogs) || [],
    };
  }
}

function safeTimer(name) {
  return (...args) => {
    // 不真的起 timer；改用 setImmediate 等价（仅防 hang）
    if (name === 'setTimeout') return setImmediate(() => args[0]?.(...args.slice(1)));
    if (name === 'setInterval') {
      // interval 改为 setTimeout 链
      const tick = () => { args[0]?.(...args.slice(1)); setTimeout(tick, args[1]); };
      return setTimeout(tick, args[1]);
    }
    return undefined;
  };
}

function wrapConsole() {
  const logs = [];
  const wrap = (level) => (...args) => {
    try { logs.push({ level, args: args.map(formatArg) }); } catch (_) {}
  };
  const c = {
    log: wrap('log'),
    info: wrap('info'),
    warn: wrap('warn'),
    error: wrap('error'),
    debug: wrap('log'),
  };
  // 把 logs 数组挂到 console 对象上供读取
  // （脚本可能覆盖 console，但不影响我们引用的 c 对象）
  c.__sandboxLogs = logs;
  return c;
}

function formatArg(a) {
  if (a instanceof Error) return a.message;
  if (typeof a === 'string') return a;
  if (typeof a === 'number' || typeof a === 'boolean' || a === null) return a;
  try { return JSON.stringify(a, null, 2); } catch (_) { return String(a); }
}

/**
 * 周期 4 P1-2 + 周期 5 P1-2: 在 worker thread 里跑沙箱代码
 * - 真线程隔离：主线程不会被死循环 / 大内存占用卡住
 * - Resource limits：
 *     heapMb（V8 --max-old-space-size）
 *     timeoutMs（worker.terminate）
 *     cpuLimitMs（worker 端 watchdog，周期 5 P1-2；catch 间歇性 busy loop）
 * - 通信：parentPort.postMessage 单向 + 主线程主动 worker.terminate
 *
 * @param {string} code
 * @param {object} ctx
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=5000]
 * @param {number} [opts.heapMb=64]
 * @param {number} [opts.cpuLimitMs=0] 0 = 关闭 watchdog；>0 = CPU 累计阈值（ms）
 * @returns {Promise<{ok:boolean, value?:any, error?:object, durationMs:number, workerId:number, cpuAbort?:boolean}>}
 */
function executeInSandboxWorker(code, ctx = {}, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const heapMb = opts.heapMb ?? DEFAULT_WORKER_HEAP_MB;
  const cpuLimitMs = opts.cpuLimitMs || 0;
  // 周期 6 P1-2 续: heap snapshot 触发
  //   - onError / onTimeout / cpuAbort → 调 captureWorkerHeapSnapshot
  //   - 用户通过 opts.snapshotOnFinish 显式开启
  const enableSnapshot = !!opts.snapshotOnFinish || !!opts.snapshotOnError;
  const snapshotOnFinish = !!opts.snapshotOnFinish;
  const snapshotOnError = opts.snapshotOnError !== false; // 默 true（异常路径）
  const t0 = Date.now();

  return new Promise((resolve) => {
    const workerScript = path.join(__dirname, 'sandbox-worker.js');
    const worker = new Worker(workerScript, {
      workerData: { code, ctx, timeoutMs, cpuLimitMs },
      resourceLimits: {
        maxOldGenerationSizeMb: heapMb,
        maxYoungGenerationSizeMb: Math.max(8, Math.floor(heapMb / 4)),
        codeRangeSizeMb: heapMb * 2,
      },
    });
    let resolved = false;
    let pendingOk = null;
    const safeResolve = (v) => {
      if (resolved) return;
      resolved = true;
      try { worker.terminate(); } catch (_) {}
      resolve({ ...v, durationMs: Date.now() - t0, workerId: worker.threadId });
    };
    const timer = setTimeout(() => {
      safeResolve({
        ok: false,
        error: { message: `worker 执行超时（${timeoutMs}ms）`, code: 'SANDBOX_TIMEOUT' },
      });
    }, timeoutMs + 200);

    worker.on('message', (msg) => {
      clearTimeout(timer);
      // 周期 6 P1-2 续: control message（snapshot_done / snapshot_error）由 captureWorkerHeapSnapshot 处理
      //   主 on('message') 只处理业务 result（cpu_abort / ok / error）
      if (msg && (msg.event === 'snapshot_done' || msg.event === 'snapshot_error')) {
        return;
      }
      // 周期 5 P1-2: 处理 CPU abort 事件
      if (msg && msg.event === 'cpu_abort') {
        // 周期 6 P1-2 续: snapshot 在 terminate 之前触发；fire-and-forget
        if (enableSnapshot && snapshotOnError) {
          captureWorkerHeapSnapshot(worker, 'cpu-abort')
            .then((r) => { if (r.ok) console.log(`[sandbox] heap snapshot saved: ${r.path} (${r.size} bytes)`); })
            .catch((e) => console.error('[sandbox] snapshot error:', e.message));
        }
        safeResolve({
          ok: false,
          cpuAbort: true,
          error: {
            message: msg.message,
            code: msg.code,
            cpuAccumMs: msg.cpuAccumMs,
          },
        });
        return;
      }
      // 周期 5 P1-2: "ok" 消息不立即 safeResolve —— 等 worker exit 才停
      //   否则无法 catch 后续 .then() 链里的 CPU 异常
      if (msg && msg.ok === true) {
        // 把 ok 消息缓存，但先不 resolve；等 worker exit 后再判断
        pendingOk = msg;
        // 周期 6 P1-2 续: 在 worker 主动 setTimeout(process.exit, 300) 之前触发
        //   worker 收到 snapshot_request → 写文件 → 通知主线程 → 主线程落盘
        if (enableSnapshot && snapshotOnFinish) {
          captureWorkerHeapSnapshot(worker, 'finish')
            .then((r) => { if (r.ok) console.log(`[sandbox] heap snapshot saved: ${r.path} (${r.size} bytes)`); })
            .catch((e) => console.error('[sandbox] snapshot error:', e.message));
        }
        return;
      }
      safeResolve(msg);
    });
    worker.on('error', (e) => {
      clearTimeout(timer);
      if (enableSnapshot && snapshotOnError) {
        captureWorkerHeapSnapshot(worker, 'worker-error')
          .then((r) => { if (r.ok) console.log(`[sandbox] heap snapshot saved: ${r.path} (${r.size} bytes)`); })
          .catch((e2) => console.error('[sandbox] snapshot error:', e2.message));
      }
      safeResolve({
        ok: false,
        error: { message: e.message, code: e.code },
      });
    });
    worker.on('exit', (code) => {
      clearTimeout(timer);
      // 周期 5 P1-2: 如果有 pendingOk（异步 ok 但 worker 后续触发 cpu_abort），
      //   cpu_abort 在 message 阶段已 resolve；否则用 pendingOk
      if (!resolved && pendingOk) {
        safeResolve(pendingOk);
        return;
      }
      if (!resolved) {
        safeResolve({
          ok: false,
          error: { message: `worker 异常退出（code=${code}）`, code: 'SANDBOX_EXIT' },
        });
      }
    });
  });
}

function parseSandboxError(e, wrapped) {
  const msg = e?.message || String(e);
  let line;
  // V8 风格 stack 提取："at <anonymous>:N:M" 或 "at sandbox.js:N:M"
  const m = (e?.stack || '').match(/(?:<anonymous>|sandbox\.js):(\d+):(\d+)/);
  if (m) {
    // wrapped 第 1 行是 (async (__ctx) => {，减 1
    line = parseInt(m[1], 10) - 1;
    if (!Number.isFinite(line) || line < 1) line = undefined;
  }
  return {
    message: msg,
    code: e?.code || undefined,
    line,
  };
}

module.exports = {
  executeInSandbox,
  executeInSandboxWorker,
  captureWorkerHeapSnapshot,
  SNAPSHOT_DIR,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_WORKER_HEAP_MB,
};
