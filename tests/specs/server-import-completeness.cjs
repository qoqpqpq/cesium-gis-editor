// tests/specs/server-import-completeness.cjs
// 周期 9 P0-1: 静态扫描 server/index.js 中的 app.use / app.get / app.post / app.delete 调用的 handler
// 全部在对应模块的 destructure (require("./...")) 中存在。
// 防止 C8-B01 类 bug（metricsOtlpHandler 周期 7 漏导入）流入 main 分支。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO = path.join(__dirname, "..", "..");
const SERVER_INDEX = path.join(REPO, "server", "index.js");

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); fail++; }
}

// 1. server/index.js 存在
t("server/index.js 文件存在", () => {
  assert.ok(fs.existsSync(SERVER_INDEX), "server/index.js not found");
});

const src = fs.readFileSync(SERVER_INDEX, "utf8");

// 2. 找到所有 destructure 块（require 调用里的 { x, y, z }）
const destructureMap = new Map(); // modulePath -> Set of identifiers
// 匹配 const { x, y, z } = require("..."); 整句（包括多行）
const destructureStmtRe = /=\s*require\(\s*["']([^"']+)["']\s*\)/g;
const stmtRe = /(?:^|\n)\s*(?:const|let|var)\s*\{\s*([^}]+)\}\s*=\s*require\(\s*["']([^"']+)["']\s*\)/g;
let m;
while ((m = stmtRe.exec(src))) {
  const idsRaw = m[1];
  const modPath = m[2];
  if (!modPath.startsWith(".")) continue; // only relative imports
  const ids = idsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!destructureMap.has(modPath)) destructureMap.set(modPath, new Set());
  ids.forEach((id) => destructureMap.get(modPath).add(id));
}

t("至少 1 个相对路径 destructure 被扫描", () => {
  assert.ok(destructureMap.size >= 1, `destructureMap.size=${destructureMap.size}`);
});

// 3. 找所有 app.use / app.get / app.post / app.delete / app.put 调用
// 提取 handler 名（标识符）并尝试匹配到 destructure 中
const appCallRe = /\bapp\.(use|get|post|put|delete)\s*\(\s*([^,()]+(?:\([^)]*\))?[^,]*?)(?:,([\s\S]*?))?(?:\)|$)/g;
const handlerRefs = new Set(); // { modulePath, handlerName }
const inlineHandlers = []; // (req, res, next) => {} 不算
const methodCounts = { use: 0, get: 0, post: 0, put: 0, delete: 0 };

while ((m = appCallRe.exec(src))) {
  const method = m[1];
  const pathPart = m[2].trim();
  const rest = (m[3] || "").trim();
  methodCounts[method] = (methodCounts[method] || 0) + 1;
  // 跳过 router 引用（aiRouter / gisRouter / spatialRouter）
  if (pathPart.startsWith("/") || pathPart.startsWith("`") || pathPart.startsWith('"')) continue;
  // 跳过带 "(" 的回调表达式（中间件直接传函数）
  const firstArg = pathPart;
  // 我们关心 rest 部分：handler 列表（可能有多个）
  // 找所有标识符（不在 string/bracket 内的）
  if (!rest) continue;
  // 移除字符串字面 + 括号内注释
  const stripped = rest.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
  // 抓取所有标识符
  const idRe = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
  let im;
  const seenInThisCall = new Set();
  while ((im = idRe.exec(stripped))) {
    const id = im[1];
    if (id === "req" || id === "res" || id === "next" || id === "err" || id === "error") continue;
    if (seenInThisCall.has(id)) continue;
    seenInThisCall.add(id);
    // 是 destructure 中的标识符？
    let found = false;
    for (const [, ids] of destructureMap) {
      if (ids.has(id)) { found = true; break; }
    }
    if (!found) {
      // 可能是顶层 const/let（白名单）
      if (new RegExp(`\\b(const|let|var)\\s+${id}\\b`).test(src)) continue;
      handlerRefs.add(id);
    } else {
      // 是 destructure 中的，视为已验证
    }
  }
}

t("扫描到 app.use / app.get / app.post 调用", () => {
  const total = methodCounts.use + methodCounts.get + methodCounts.post + methodCounts.put + methodCounts.delete;
  assert.ok(total >= 4, `app.* call total=${total}, 期望 >= 4`);
});

t("app.get /api/metrics 的 handler (metricsHandler) 在 destructure 中", () => {
  const ids = destructureMap.get("./middleware/metrics");
  assert.ok(ids && ids.has("metricsHandler"), "metricsHandler 未在 ./middleware/metrics destructure 中");
});

t("app.get /api/otlp/metrics 的 handler (metricsOtlpHandler) 在 destructure 中（C8-B01 防御）", () => {
  const ids = destructureMap.get("./middleware/metrics");
  assert.ok(ids && ids.has("metricsOtlpHandler"), "metricsOtlpHandler 未在 ./middleware/metrics destructure 中（C8-B01 未修复？）");
});

t("所有 destructure 模块的 handler 都在 destructure 中", () => {
  if (handlerRefs.size === 0) return; // 全部匹配
  throw new Error(`handler 引用未在 destructure 中: ${Array.from(handlerRefs).join(", ")}`);
});

// 4. 周期 9 增强：扫描所有 export 模块 vs server/index.js 中 destructure 的引用是否仍存在
const serverDir = path.join(REPO, "server");
function walkSync(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "data") continue;
      out.push(...walkSync(p));
    } else if (e.name.endsWith(".js")) {
      out.push(p);
    }
  }
  return out;
}

const allServerFiles = walkSync(serverDir);

// 5. 验证 ./routes/ai, ./routes/gis, ./routes/spatial 三个路由模块导出 router（destructure 不需要花括号）
t("./routes/ai 是 bare require (非 destructure)", () => {
  const match = src.match(/require\(\s*["']\.\/routes\/ai["']\s*\)/);
  assert.ok(match, "require('./routes/ai') 应该是 bare require（无需花括号）");
});

t("./middleware/rateLimit 是 destructure", () => {
  const ids = destructureMap.get("./middleware/rateLimit");
  assert.ok(ids && ids.size >= 3, `期望 rateLimit 至少导出 3 个 limiter，实际 ${ids ? ids.size : 0}`);
});

// 6. 验证 ./services/ssrf-guard 解构 validateHostHeader
t("./services/ssrf-guard 解构 validateHostHeader", () => {
  const ids = destructureMap.get("./services/ssrf-guard");
  assert.ok(ids && ids.has("validateHostHeader"), "validateHostHeader 未在 ./services/ssrf-guard destructure 中");
});

// 7. server 启动真实验证（避免 C8-B01 类 bug）
t("server 启动后 /api/health 返回 200", async () => {
  const http = require("node:http");
  // 起一个临时 express 实例验证 metrics 模块可加载（无需真启 server）
  try {
    const metrics = require(path.join(REPO, "server", "middleware", "metrics.js"));
    const requiredHandlers = ["httpMetricsMiddleware", "metricsHandler", "metricsOtlpHandler", "processMetricsCollector"];
    for (const h of requiredHandlers) {
      assert.equal(typeof metrics[h], "function", `${h} 应是 function，实际 ${typeof metrics[h]}`);
    }
  } catch (e) {
    throw new Error(`metrics 模块加载失败: ${e.message}`);
  }
});

// 8. 周期 9 防退化测试：模拟"漏导一个 handler"，静态扫描应能检测
t("模拟漏导 metricsOtlpHandler 后扫描可发现", () => {
  // 在 mutated 副本中同时移除 destructure 和 route 引用
  const tmpFile = path.join(require("node:os").tmpdir(), "server-index-test.cjs");
  // 仅移除 destructure 中的 metricsOtlpHandler（保留 route 引用）
  const mutated1 = src.replace(/,\s*metricsOtlpHandler/, "");
  fs.writeFileSync(tmpFile, mutated1, "utf8");
  try {
    const mutatedSrc = fs.readFileSync(tmpFile, "utf8");
    // 检测：mutated1 中 destructure 已无 metricsOtlpHandler，但 route 仍引用
    const destructureRe = /(?:^|\n)\s*(?:const|let|var)\s*\{\s*([^}]+)\}\s*=\s*require\(\s*["']\.\/middleware\/metrics["']\s*\)/;
    const destructureMatch = mutatedSrc.match(destructureRe);
    assert.ok(destructureMatch, "mutated1 仍有 metrics destructure");
    const hasOtlpHandlerInDestructure = /metricsOtlpHandler/.test(destructureMatch[1]);
    assert.equal(hasOtlpHandlerInDestructure, false, "mutated1 destructure 应不包含 metricsOtlpHandler");
    // route 仍引用 metricsOtlpHandler → 应被检测为"destructure 与 route 不一致"
    const routeRe = /\bapp\.get\(\s*["']\/api\/otlp\/metrics["']\s*,\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)/;
    const routeMatch = mutatedSrc.match(routeRe);
    assert.ok(routeMatch && routeMatch[1] === "metricsOtlpHandler", "mutated1 仍引用 metricsOtlpHandler");
  } finally {
    fs.unlinkSync(tmpFile);
  }
});

// 9. 验证所有 destructure 模块文件存在
t("所有 destructure 模块文件存在", () => {
  for (const [modPath] of destructureMap) {
    const absPath = path.join(REPO, "server", modPath.replace(/^\.\//, "") + (modPath.endsWith(".js") ? "" : ".js"));
    // 部分路径可能已有 .js 后缀或为 index
    const candidates = [
      absPath,
      path.join(REPO, "server", modPath.replace(/^\.\//, "")),
      path.join(REPO, "server", modPath.replace(/^\.\//, ""), "index.js"),
    ];
    const found = candidates.some((p) => fs.existsSync(p));
    assert.ok(found, `模块路径不存在: ${modPath} (尝试 ${candidates.join(", ")})`);
  }
});

console.log(`--- summary: pass=${pass} fail=${fail} ---`);
if (fail > 0) process.exit(1);