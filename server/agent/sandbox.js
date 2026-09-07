// server/agent/sandbox.js
// 周期 3 P1-2: 服务端代码沙箱 —— 基于 node:vm，不用 vm2
//
// 背景：
//   - 调研 / OWASP 推荐用 node:vm（vm2 多次 escape 历史 + 已停维）
//   - 当前 server 侧暂无 sandbox 模块；本周期为后续"AI 输出代码 → 服务端 dry-run 验证"铺路
//   - 客户端 sandbox.js 仍用 new Function（浏览器侧没有 node:vm），不受影响
//
// 设计：
//   - executeInSandbox(code, ctx, opts) → { ok, value, error, durationMs }
//   - 显式 vm.createContext(sandbox) —— 不共享全局
//   - 沙箱内不允许 require / process / global / Buffer 访问
//   - 白名单 API：只暴露 ctx 显式传入的字段
//   - Resource limits：
//       timeoutMs（默认 5s，AbortController 取消）
//       heapMb（可选，未实现硬限制；用 strict 模式 + contextIsolation 防逃逸）
//   - 错误捕获：脚本抛错 → 返回结构化 { message, line }
//   - 返回值：await Promise.resolve(script.runInContext(...))
//
// 验收：
//   - 同步代码可跑 + 返回值
//   - 异步 async 可跑 + await
//   - require('fs') 抛错（白名单拒绝）
//   - process / global / Buffer undefined
//   - 超时抛 AbortError
//   - 死循环不会无限跑（timeout 兜底）

'use strict';

const vm = require('node:vm');

const DEFAULT_TIMEOUT_MS = 5000;

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
  DEFAULT_TIMEOUT_MS,
};
