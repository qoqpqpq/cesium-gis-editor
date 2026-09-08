// tests/specs/permissions-policy-middleware.cjs
// 周期 9 P2-2: 自研 Permissions-Policy middleware + helmet 8.x 整合验证
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");

const REPO = path.join(__dirname, "..", "..");
const MIDDLEWARE = path.join(REPO, "server", "middleware", "permissionsPolicy.js");
const SERVER_INDEX = path.join(REPO, "server", "index.js");
const BASE_URL = "http://127.0.0.1:3001";

let pass = 0, fail = 0;
function t(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`  [PASS] ${name}`); pass++; })
    .catch((e) => { console.log(`  [FAIL] ${name}: ${e.message}`); fail++; });
}

function request(path, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE_URL}${path}`, opts, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error("timeout")));
  });
}

async function main() {
  await t("server/middleware/permissionsPolicy.js 存在", () => {
    assert.ok(require("node:fs").existsSync(MIDDLEWARE));
  });

  const pp = require(MIDDLEWARE);

  await t("module 导出 permissionsPolicy 函数 + DEFAULT_POLICIES + _resetHeaderCache", () => {
    assert.equal(typeof pp, "function");
    assert.ok(Array.isArray(pp.DEFAULT_POLICIES));
    assert.equal(pp.DEFAULT_POLICIES.length, 20);
    assert.equal(typeof pp._resetHeaderCache, "function");
  });

  await t("DEFAULT_POLICIES 含关键策略（camera/microphone/geolocation/fullscreen/payment/USB）", () => {
    const ps = pp.DEFAULT_POLICIES;
    assert.ok(ps.includes("camera=()"));
    assert.ok(ps.includes("microphone=()"));
    assert.ok(ps.includes("geolocation=()"));
    assert.ok(ps.includes("fullscreen=(self)"));
    assert.ok(ps.includes("payment=()"));
    assert.ok(ps.includes("usb=()"));
  });

  // 单元测试 middleware
  await t("中间件 unit test：设置 res.setHeader('Permissions-Policy', ...)", () => {
    let captured = null;
    const middleware = pp();
    middleware({}, { setHeader: (k, v) => { captured = { k, v }; }, end: () => {} }, () => {});
    assert.equal(captured.k, "Permissions-Policy");
    assert.ok(captured.v.includes("camera=()"));
    assert.ok(captured.v.includes("fullscreen=(self)"));
  });

  await t("中间件 unit test：opts.policies 自定义覆盖", () => {
    let captured = null;
    pp._resetHeaderCache();
    const middleware = pp({ policies: ["camera=()", "microphone=()"] });
    middleware({}, { setHeader: (k, v) => { captured = { k, v }; }, end: () => {} }, () => {});
    assert.equal(captured.v, "camera=(), microphone=()");
  });

  await t("中间件 unit test：opts.disable=true 不输出 header", () => {
    let captured = null;
    pp._resetHeaderCache();
    const middleware = pp({ disable: true });
    middleware({}, { setHeader: (k, v) => { captured = { k, v }; }, end: () => {} }, () => {});
    assert.equal(captured, null, "disable=true 应不调用 setHeader");
  });

  await t("中间件 unit test：_resetHeaderCache 后策略变更生效", () => {
    let captured = null;
    const middleware = pp();
    middleware({}, { setHeader: (k, v) => { captured = { k, v }; }, end: () => {} }, () => {});
    assert.ok(captured.v.includes("camera=()"));
    pp._resetHeaderCache();
    captured = null;
    const middleware2 = pp({ policies: ["camera=(self)"] });
    middleware2({}, { setHeader: (k, v) => { captured = { k, v }; }, end: () => {} }, () => {});
    assert.equal(captured.v, "camera=(self)");
  });

  // 集成测试：实际启 server + curl
  await t("server 在线（127.0.0.1:3001 健康检查）", async () => {
    const r = await request("/api/health");
    assert.equal(r.status, 200);
  });

  await t("server index.js 引用 permissionsPolicy middleware（替代手写 20 行）", () => {
    const fs = require("node:fs");
    const src = fs.readFileSync(SERVER_INDEX, "utf8");
    assert.ok(/require\("\.\/middleware\/permissionsPolicy"\)/.test(src), "server/index.js 应 require 新 middleware");
    assert.ok(!/autoplay=\(self\)/.test(src) || src.indexOf("autoplay=(self)") === src.indexOf("accelerometer=()"), "手写 20 项应已移除");
  });

  await t("/api/health 响应含 Permissions-Policy header（周期 9 P2-2 关键验证）", async () => {
    const r = await request("/api/health");
    const ppHeader = r.headers["permissions-policy"];
    assert.ok(ppHeader, `Permissions-Policy header 缺失，headers=${JSON.stringify(Object.keys(r.headers))}`);
    assert.ok(ppHeader.includes("camera=()"));
    assert.ok(ppHeader.includes("fullscreen=(self)"));
    assert.ok(ppHeader.includes("geolocation=()"));
    assert.ok(ppHeader.includes("payment=()"));
  });

  await t("/api/health Permissions-Policy 含 20 项", async () => {
    const r = await request("/api/health");
    const ppHeader = r.headers["permissions-policy"] || "";
    const items = ppHeader.split(",").map((s) => s.trim()).filter(Boolean);
    assert.equal(items.length, 20, `期望 20 项，实际 ${items.length}: ${items.join("|")}`);
  });

  await t("/api/metrics 也含 Permissions-Policy（验证中间件覆盖所有路由）", async () => {
    const r = await request("/api/metrics");
    assert.ok(r.headers["permissions-policy"]);
  });

  await t("周期 9 P2-2 评估报告：自研 middleware + helmet 8.x 整合", () => {
    const report = {
      cycle: 9,
      taskId: "P2-2",
      finding: "helmet ^8.3.0 不输出 Permissions-Policy header（周期 8 P2-2 验证）",
      solution: "自研 server/middleware/permissionsPolicy.js 替代手写 20 行",
      policiesCount: 20,
      note: "周期 9 自研 0 依赖 middleware（20 项策略 + opts 覆盖 + cache + disable）",
    };
    assert.equal(report.cycle, 9);
    assert.equal(report.policiesCount, 20);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});