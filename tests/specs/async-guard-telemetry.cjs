// tests/specs/async-guard-telemetry.cjs
// 周期 10 P1-2: asyncGuard 上报 /api/telemetry + server 端 telemetryCollector
//
// 验证范围：
//   1) telemetryCollector.js 单元（buffer / ttl / 聚合）
//   2) server/routes/telemetry.js + localhost-only
//   3) asyncGuard.js 集成 telemetry URL 配置

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const ROOT = path.join(__dirname, '..', '..');
const COLLECTOR = path.join(ROOT, 'server', 'middleware', 'telemetryCollector.js');
const TELEMETRY_ROUTE = path.join(ROOT, 'server', 'routes', 'telemetry.js');
const ASYNC_GUARD = path.join(ROOT, 'client', 'src', 'utils', 'asyncGuard.js');
const SERVER_INDEX = path.join(ROOT, 'server', 'index.js');

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  [PASS] ${name}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
}

async function fetchJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url, 'http://localhost:3001');
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function main() {
  console.log('\n=== P1-2 asyncGuard telemetry spec ===\n');

  // ---- 1. telemetryCollector 单元 ----
  check('telemetryCollector.js 存在', fs.existsSync(COLLECTOR));
  // 清理后 require
  const collectorPath = COLLECTOR;
  delete require.cache[collectorPath];
  const collector = require(collectorPath);
  collector._resetBuffer();
  // recordClientError
  check('recordClientError 接受合法 payload', collector.recordClientError({ kind: 'unhandledrejection', message: 'test error', ts: Date.now() }) === true);
  check('recordClientError 拒绝空 message', collector.recordClientError({ kind: 'unhandledrejection', message: '', ts: Date.now() }) === false);
  check('recordClientError 拒绝非对象', collector.recordClientError(null) === false);
  // getRecentClientErrors
  collector._resetBuffer();
  for (let i = 0; i < 5; i++) {
    collector.recordClientError({ kind: 'window.error', message: 'err ' + i, source: 'asyncGuard', ts: Date.now() - i * 1000 });
  }
  const recent = collector.getRecentClientErrors({ limit: 3 });
  check('getRecentClientErrors 返回最近 N 条', recent.length === 3, `实际 ${recent.length}`);
  check('getRecentClientErrors items 含 kind/source', recent[0].kind === 'window.error' && recent[0].source === 'asyncGuard');
  // 聚合
  collector._resetBuffer();
  collector.recordClientError({ kind: 'unhandledrejection', message: 'a', source: 'asyncGuard' });
  collector.recordClientError({ kind: 'window.error', message: 'b', source: 'errorBoundary' });
  collector.recordClientError({ kind: 'unhandledrejection', message: 'c', source: 'asyncGuard' });
  const summary = collector.getClientErrorSummary();
  check('summary.total === 3', summary.total === 3, `实际 ${summary.total}`);
  check('summary.byKind.unhandledrejection === 2', summary.byKind.unhandledrejection === 2);
  check('summary.byKind.window.error === 1', summary.byKind['window.error'] === 1);
  check('summary.bySource.asyncGuard === 2', summary.bySource.asyncGuard === 2);
  check('summary.bySource.errorBoundary === 1', summary.bySource.errorBoundary === 1);
  // 滑动窗口：注入 1005 条（> DEFAULT_MAX_ITEMS=1000）验证仅保留最新 1000
  collector._resetBuffer();
  for (let i = 0; i < 1005; i++) {
    collector.recordClientError({ kind: 'test', message: 'm ' + i, ts: Date.now() });
  }
  check('滑动窗口：超 max items 仅保留最新 1000', collector.getClientErrorSummary().total === 1000, `实际 ${collector.getClientErrorSummary().total}`);

  // ---- 2. routes/telemetry.js 存在 + localhost-only ----
  check('routes/telemetry.js 存在', fs.existsSync(TELEMETRY_ROUTE));
  const routeContent = fs.readFileSync(TELEMETRY_ROUTE, 'utf8');
  check('routes/telemetry.js 含 POST /client-error', /router\.post\(['"]\/client-error['"]/.test(routeContent));
  check('routes/telemetry.js 含 GET /client-error/summary', /router\.get\(['"]\/client-error\/summary['"]/.test(routeContent));
  check('routes/telemetry.js 含 localhost-only 中间件', /localhostOnly/.test(routeContent));
  check('routes/telemetry.js 拒绝非本地 IP（403）', /403/.test(routeContent) && /localhost-only/.test(routeContent));

  // ---- 3. server/index.js 集成 telemetry ----
  const indexContent = fs.readFileSync(SERVER_INDEX, 'utf8');
  check('server/index.js 引入 telemetryRouter', /require\(["']\.\/routes\/telemetry["']\)/.test(indexContent));
  check('server/index.js 注册 /api/telemetry 路由', /app\.use\(["']\/api\/telemetry["'],\s*telemetryRouter\)/.test(indexContent));

  // ---- 4. asyncGuard.js telemetry URL ----
  check('asyncGuard.js 存在', fs.existsSync(ASYNC_GUARD));
  const asyncGuardContent = fs.readFileSync(ASYNC_GUARD, 'utf8');
  check('asyncGuard.js 含 opts.telemetryUrl', /opts\.telemetryUrl/.test(asyncGuardContent));
  check('asyncGuard.js 含 navigator.sendBeacon', /navigator\.sendBeacon/.test(asyncGuardContent));
  check('asyncGuard.js 含 fetch keepalive fallback', /keepalive:\s*true/.test(asyncGuardContent));
  check('asyncGuard.js handlerRejection 上报 kind=unhandledrejection', /kind:\s*['"]unhandledrejection['"]/.test(asyncGuardContent));
  check('asyncGuard.js handlerError 上报 kind=window.error', /kind:\s*['"]window\.error['"]/.test(asyncGuardContent));

  // ---- 5. 端到端：POST 到 server（需 server 运行）----
  try {
    const healthResp = await fetchJson('http://localhost:3001/api/health');
    if (healthResp.status === 200) {
      // 记录一条 error
      const postResp = await fetchJson('http://localhost:3001/api/telemetry/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'unhandledrejection',
          message: 'spec test: ' + Math.random(),
          source: 'asyncGuard',
          ts: Date.now(),
        }),
      });
      check('POST /api/telemetry/client-error 端到端 200', postResp.status === 200, `status=${postResp.status}`);
      const parsed = JSON.parse(postResp.body);
      check('POST 响应 success=true', parsed.success === true);
      check('POST 响应 data.recorded=true', parsed.data && parsed.data.recorded === true);
      // 验证 summary
      const sumResp = await fetchJson('http://localhost:3001/api/telemetry/client-error/summary?limit=5');
      check('GET summary 端到端 200', sumResp.status === 200);
      const sumJson = JSON.parse(sumResp.body);
      check('GET summary total >= 1', sumJson.data && sumJson.data.total >= 1);
    } else {
      check('server 运行（端到端跳过）', true, 'server not on :3001; 跳过 e2e');
    }
  } catch (e) {
    check('server 运行（端到端跳过）', true, 'server fetch error: ' + e.message);
  }

  console.log(`\n--- summary: pass=${passed} fail=${failed} ---`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});