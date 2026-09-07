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

function run() {
  const { code, ctx = {}, timeoutMs = 5000 } = workerData;
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
    const value = script.runInContext(sandbox, { displayErrors: true, timeout: timeoutMs });
    Promise.resolve(value)
      .then((v) => {
        clearTimeout(timer);
        parentPort.postMessage({ ok: true, value: v, logs });
      })
      .catch((e) => {
        clearTimeout(timer);
        parentPort.postMessage({
          ok: false,
          error: { message: e.message, code: e.code },
          logs,
        });
      });
  } catch (e) {
    parentPort.postMessage({
      ok: false,
      error: { message: e.message, code: e.code },
      logs,
    });
  }
}

try {
  run();
} catch (e) {
  parentPort.postMessage({
    ok: false,
    error: { message: e.message, code: e.code || 'WORKER_BOOT_ERROR' },
  });
}
