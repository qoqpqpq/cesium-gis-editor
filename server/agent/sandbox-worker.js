// server/agent/sandbox-worker.js
// 周期 4 P1-2: worker 端脚本
// 在独立 V8 isolate 里跑用户代码；postMessage 返回结果
//
// 通信契约：
//   workerData = { code, ctx, timeoutMs }
//   on('message'): 启动执行
//   postMessage(result) → { ok, value?, error?, logs? }
//   父线程：worker.terminate()（超时兜底）

'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const vm = require('node:vm');
const v8 = require('node:v8');
const path = require('node:path');
const os = require('node:os');

function run() {
  const { code, ctx = {}, timeoutMs = 5000, cpuLimitMs = 0 } = workerData;
  // 与 sandbox.js 周期 3 镜像：显式屏蔽 require/process/global/Buffer
  const logs = [];
  const wrapConsole = () => {
    const w = (level) => (...args) => {
      try {
        logs.push({
          level,
          args: args.map((a) => {
            if (a instanceof Error) return a.message;
            if (typeof a === 'string' || typeof a === 'number' || typeof a === 'boolean' || a === null) return a;
            try { return JSON.stringify(a); } catch (_) { return String(a); }
          }),
        });
      } catch (_) {}
    };
    const c = {
      log: w('log'), info: w('info'), warn: w('warn'), error: w('error'), debug: w('log'),
    };
    c.__sandboxLogs = logs;
    return c;
  };
  const safeTimer = (name) => (...args) => {
    if (name === 'setTimeout') return setImmediate(() => args[0]?.(...args.slice(1)));
    if (name === 'setInterval') {
      const tick = () => { args[0]?.(...args.slice(1)); setTimeout(tick, args[1]); };
      return setTimeout(tick, args[1]);
    }
    return undefined;
  };

  // 周期 5 P1-2: CPU watchdog —— 累计 process.cpuUsage() delta
  //   - 同步阻塞代码（纯 while(true)）仍依赖 vm.runInContext timeout（周期 4 P1-2）
  //   - 间歇性 busy loop（while (Date.now() - start < 5000) { ... }）可被本 watchdog catch
  //   - 默认 50ms 采样一次；累计 > cpuLimitMs 触发 abort
  let cpuAccum = 0; // 微秒
  let lastCpu = process.cpuUsage();
  let cpuWatchdog = null;
  function startCpuWatchdog(limitMs) {
    if (typeof limitMs !== 'number' || limitMs <= 0) return;
    const sampleMs = 50;
    const limitUs = limitMs * 1000;
    cpuWatchdog = setInterval(() => {
      const cur = process.cpuUsage(lastCpu);
      cpuAccum += cur.user + cur.system;
      lastCpu = process.cpuUsage();
      if (cpuAccum > limitUs) {
        if (cpuWatchdog) clearInterval(cpuWatchdog);
        cpuWatchdog = null;
        parentPort.postMessage({
          event: 'cpu_abort',
          message: `CPU 超阈值（累计 ${(cpuAccum / 1000).toFixed(0)}ms > ${limitMs}ms）`,
          code: 'SANDBOX_CPU_LIMIT',
          cpuAccumMs: Math.round(cpuAccum / 1000),
        });
      }
    }, sampleMs);
  }
  function stopCpuWatchdog() {
    if (cpuWatchdog) {
      clearInterval(cpuWatchdog);
      cpuWatchdog = null;
    }
  }

  const sandbox = {
    ...ctx,
    console: wrapConsole(),
    Math, JSON, Promise,
    setTimeout: safeTimer('setTimeout'),
    setInterval: safeTimer('setInterval'),
    clearTimeout, clearInterval,
    require: undefined, module: undefined, exports: undefined,
    process: undefined, global: undefined, globalThis: undefined,
    Buffer: undefined, __dirname: undefined, __filename: undefined,
    sandboxMarker: 'cesium-gis-editor-sandbox-worker-v1',
  };
  vm.createContext(sandbox);
  const wrapped = `(async (__ctx) => {\n${code}\n})(__ctx);`;

  try {
    const script = new vm.Script(wrapped, { filename: 'sandbox-worker.js' });
    sandbox.__ctx = Object.fromEntries(Object.keys(ctx).map((k) => [k, sandbox[k]]));
    let timer;
    startCpuWatchdog(cpuLimitMs);
    const value = script.runInContext(sandbox, { displayErrors: true, timeout: timeoutMs });
    Promise.resolve(value)
      .then((v) => {
        clearTimeout(timer);
        // 周期 5 P1-2: postMessage 后延迟退出（100ms 给 cpu watchdog 至少 2 个 sample 机会）
        //   主线程 message handler 缓存 ok 到 pendingOk，exit 触发再 resolve
        parentPort.postMessage({ ok: true, value: v, logs });
          setTimeout(() => process.exit(0), 300);
        })
        .catch((e) => {
          clearTimeout(timer);
          parentPort.postMessage({
            ok: false,
            error: { message: e.message, code: e.code },
            logs,
          });
          setTimeout(() => process.exit(0), 300);
        });
  } catch (e) {
    parentPort.postMessage({
      ok: false,
      error: { message: e.message, code: e.code },
      logs,
    });
    setTimeout(() => process.exit(0), 300);
  }
}

try {
  run();
} catch (e) {
  parentPort.postMessage({
    ok: false,
    error: { message: e.message, code: e.code || 'WORKER_BOOT_ERROR' },
  });
  setImmediate(() => process.exit(0));
}

// 周期 6 P1-2 续: 监听 snapshot_request
//   - 父线程请求时 v8.writeHeapSnapshot(path) → 写临时文件 → 通知主线程
if (parentPort) {
  parentPort.on('message', (m) => {
    if (m && m.event === 'snapshot_request') {
      try {
        const tmpPath = path.join(os.tmpdir(), `sandbox-snap-${process.pid}-${Date.now()}.heapsnapshot`);
        const written = v8.writeHeapSnapshot(tmpPath);
        parentPort.postMessage({ event: 'snapshot_done', path: written });
      } catch (e) {
        parentPort.postMessage({ event: 'snapshot_error', message: e.message });
      }
    }
  });
}
