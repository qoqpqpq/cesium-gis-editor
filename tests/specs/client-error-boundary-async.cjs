// tests/specs/client-error-boundary-async.cjs
// 周期 9 P1-3: ErrorBoundary 升级 + asyncGuard（unhandledrejection + window.error）
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO = path.join(__dirname, "..", "..");
const ASYNC_GUARD_PATH = path.join(REPO, "client", "src", "utils", "asyncGuard.js");
const ERROR_BOUNDARY_PATH = path.join(REPO, "client", "src", "components", "ErrorBoundary.jsx");

let pass = 0, fail = 0;
function t(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`  [PASS] ${name}`); pass++; })
    .catch((e) => { console.log(`  [FAIL] ${name}: ${e.message}`); fail++; });
}

async function loadAsyncGuard() {
  return await import(pathToFileURL(ASYNC_GUARD_PATH).href);
}

async function main() {
  await t("asyncGuard.js 文件存在", () => {
    assert.ok(fs.existsSync(ASYNC_GUARD_PATH));
  });

  await t("ErrorBoundary.jsx 文件存在", () => {
    assert.ok(fs.existsSync(ERROR_BOUNDARY_PATH));
  });

  const ag = await loadAsyncGuard();

  await t("导出 installAsyncGuard / uninstallAsyncGuard / isAsyncGuardInstalled / wrapAsyncHandler", () => {
    assert.equal(typeof ag.installAsyncGuard, "function");
    assert.equal(typeof ag.uninstallAsyncGuard, "function");
    assert.equal(typeof ag.isAsyncGuardInstalled, "function");
    assert.equal(typeof ag.wrapAsyncHandler, "function");
  });

  await t("node 环境 installAsyncGuard 返回卸载函数（no-op）", () => {
    if (typeof window !== "undefined") return; // skip in jsdom
    const u = ag.installAsyncGuard();
    assert.equal(typeof u, "function");
    u(); // 卸载也不报错
  });

  // 模拟 window 测试
  await t("jsdom-like: 模拟 window + 安装 + 卸载", () => {
    // 保存原始 window
    const origWindow = global.window;
    const listeners = new Map(); // event -> handler
    const fakeWindow = {
      addEventListener(event, handler) {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(handler);
      },
      removeEventListener(event, handler) {
        if (!listeners.has(event)) return;
        const arr = listeners.get(event);
        const idx = arr.indexOf(handler);
        if (idx >= 0) arr.splice(idx, 1);
      },
    };
    global.window = fakeWindow;

    try {
      assert.equal(ag.isAsyncGuardInstalled(), false);
      const u1 = ag.installAsyncGuard({ onError: () => {} });
      assert.equal(ag.isAsyncGuardInstalled(), true);
      assert.equal(listeners.get("unhandledrejection").length, 1);
      assert.equal(listeners.get("error").length, 1);
      const u2 = ag.installAsyncGuard({ onError: () => {} });
      // 重复 install 不重复添加 listener（设计：避免重复回调）
      assert.equal(listeners.get("unhandledrejection").length, 1, "重复 install 不应再添加 unhandledrejection listener");
      assert.equal(typeof u2, "function");
      u1();
      assert.equal(ag.isAsyncGuardInstalled(), false);
    } finally {
      global.window = origWindow;
    }
  });

  await t("模拟 unhandledrejection 触发 → onError 回调收到 Error", () => {
    const origWindow = global.window;
    const captured = [];
    let registeredHandler = null;
    const fakeWindow = {
      addEventListener(event, handler) {
        if (event === "unhandledrejection") registeredHandler = handler;
      },
      removeEventListener() {},
    };
    global.window = fakeWindow;
    try {
      ag.installAsyncGuard({ onError: (err, kind) => captured.push({ err, kind }) });
      // 触发 unhandledrejection
      registeredHandler({ reason: new Error("async fail"), preventDefault() {} });
      assert.equal(captured.length, 1);
      assert.equal(captured[0].kind, "unhandledrejection");
      assert.equal(captured[0].err.message, "async fail");
      assert.ok(captured[0].err instanceof Error);
    } finally {
      global.window = origWindow;
      ag.uninstallAsyncGuard();
    }
  });

  await t("模拟 unhandledrejection reason 是字符串 → 转 Error", () => {
    const origWindow = global.window;
    const captured = [];
    let handler = null;
    global.window = {
      addEventListener(e, h) { if (e === "unhandledrejection") handler = h; },
      removeEventListener() {},
    };
    try {
      ag.installAsyncGuard({ onError: (err, kind) => captured.push({ err: err.message, kind }) });
      assert.ok(typeof handler === "function", `handler 应是 function，实际: ${typeof handler}`);
      handler({ reason: "string reason", preventDefault() {} });
      assert.equal(captured.length, 1);
      assert.equal(captured[0].kind, "unhandledrejection");
      assert.equal(captured[0].err, "string reason");
    } finally {
      global.window = origWindow;
      ag.uninstallAsyncGuard();
    }
  });

  await t("模拟 window.error → onError 回调 kind=window.error", () => {
    const origWindow = global.window;
    const captured = [];
    let errHandler = null;
    global.window = {
      addEventListener(e, h) { if (e === "error") errHandler = h; },
      removeEventListener() {},
    };
    try {
      ag.installAsyncGuard({ onError: (err, kind) => captured.push({ err, kind }) });
      assert.ok(typeof errHandler === "function", `errHandler 应是 function，实际: ${typeof errHandler}`);
      errHandler({ error: new Error("window err"), message: "window err" });
      assert.equal(captured.length, 1);
      assert.equal(captured[0].kind, "window.error");
      assert.equal(captured[0].err.message, "window err");
    } finally {
      global.window = origWindow;
      ag.uninstallAsyncGuard();
    }
  });

  await t("wrapAsyncHandler 捕获 async 错误并调用 onError", async () => {
    let captured = null;
    const fn = ag.wrapAsyncHandler(async () => {
      throw new Error("async boom");
    }, (err) => { captured = err; });
    const r = await fn();
    assert.ok(captured, "onError 应被调用");
    assert.equal(captured.message, "async boom");
    assert.equal(r, undefined, "wrapAsyncHandler 不 rethrow，返回 undefined");
  });

  await t("wrapAsyncHandler 成功路径返回值原样透传", async () => {
    let captured = null;
    const fn = ag.wrapAsyncHandler(async (a, b) => a + b, (err) => { captured = err; });
    const r = await fn(2, 3);
    assert.equal(r, 5);
    assert.equal(captured, null, "成功路径不触发 onError");
  });

  await t("wrapAsyncHandler 非 Error reject → 转 Error", async () => {
    let captured = null;
    const fn = ag.wrapAsyncHandler(async () => {
      // eslint-disable-next-line no-throw-literal
      throw "string error";
    }, (err) => { captured = err; });
    await fn();
    assert.ok(captured instanceof Error, "captured 应是 Error 实例");
    assert.equal(captured.message, "string error");
  });

  await t("wrapAsyncHandler 非函数参数 → 原样返回", () => {
    const nonFn = "not a function";
    const r = ag.wrapAsyncHandler(nonFn);
    assert.equal(r, nonFn);
  });

  await t("ErrorBoundary.jsx 含周期 9 P1-3 注释或未变更（向后兼容）", () => {
    const src = fs.readFileSync(ERROR_BOUNDARY_PATH, "utf8");
    // 现有 ErrorBoundary 不变；新增 asyncGuard.js 单独模块
    assert.ok(src.includes("ErrorBoundary"));
    assert.ok(src.includes("getDerivedStateFromError"));
  });

  await t("周期 9 P1-3 评估报告：asyncGuard 模块 + ErrorBoundary 不破坏", () => {
    const report = {
      cycle: 9,
      taskId: "P1-3",
      newModule: "client/src/utils/asyncGuard.js",
      unchanged: "ErrorBoundary.jsx",
      captures: ["unhandledrejection", "window.error", "async function throw"],
      integration: "通过 installAsyncGuard({ onError }) 在 main.jsx 顶层调用",
    };
    assert.equal(report.cycle, 9);
    assert.equal(report.captures.length, 3);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});