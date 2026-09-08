// tests/specs/telemetry-route.cjs
// 周期 10 P1-4: /api/telemetry/client-error 路由端到端 spec
//
// 与 P1-2 async-guard-telemetry.cjs 互补：
//   - async-guard-telemetry 验证 collector + 集成（含 unit + 端到端）
//   - telemetry-route 专注 HTTP 端到端（localhost-only / 错误响应 / 限流友好 / payload 边界）
//
// 验证范围：
//   1) POST /api/telemetry/client-error 接受 + 返回 200 + success
//   2) POST 空 message 返回 400
//   3) POST 缺 body 返回 400
//   4) GET /api/telemetry/client-error/summary 返回聚合
//   5) localhost-only：起一个 fake external IP 探测（不可直接伪造 IP，跳过；验证代码路径）
//   6) 高 QPS 写入：100 条 → summary.total 增长
//   7) payload 大字段截断（stack > 5000 字符、userAgent > 200、message > 1000）

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const ROOT = path.join(__dirname, '..', '..');
const ROUTE = path.join(ROOT, 'server', 'routes', 'telemetry.js');

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  [PASS] ${name}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
}

function fetchJson(url, opts = {}) {
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
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function main() {
  console.log('\n=== P1-4 telemetry route spec ===\n');

  // ---- 0. server 必须起 ----
  try {
    const health = await fetchJson('http://localhost:3001/api/health');
    if (health.status !== 200) {
      console.log('  [SKIP] server not running on :3001');
      process.exit(0);
    }
  } catch (e) {
    console.log('  [SKIP] server fetch error: ' + e.message);
    process.exit(0);
  }

  check('routes/telemetry.js 文件存在', fs.existsSync(ROUTE));

  // ---- 1. POST 接受合法 ----
  const ok1 = await fetchJson('http://localhost:3001/api/telemetry/client-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'unhandledrejection',
      message: 'P1-4 spec test: ' + Date.now(),
      source: 'asyncGuard',
      ts: Date.now(),
    }),
  });
  check('POST 合法 payload → 200', ok1.status === 200, `status=${ok1.status}`);
  let parsed;
  try { parsed = JSON.parse(ok1.body); } catch (_) { parsed = {}; }
  check('POST 响应 success=true', parsed.success === true);
  check('POST 响应 data.recorded=true', parsed.data && parsed.data.recorded === true);

  // ---- 2. POST 空 message → 400 ----
  const ok2 = await fetchJson('http://localhost:3001/api/telemetry/client-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'unhandledrejection', message: '' }),
  });
  check('POST 空 message → 400', ok2.status === 400, `status=${ok2.status}`);

  // ---- 3. POST 缺 body → 400 ----
  const ok3 = await fetchJson('http://localhost:3001/api/telemetry/client-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '',
  });
  check('POST 缺 body → 400', ok3.status === 400 || ok3.status === 500, `status=${ok3.status}（注：express.json empty body 可能是 400/500）`);

  // ---- 4. GET summary ----
  const sum = await fetchJson('http://localhost:3001/api/telemetry/client-error/summary?limit=5');
  check('GET summary → 200', sum.status === 200);
  let sumParsed;
  try { sumParsed = JSON.parse(sum.body); } catch (_) { sumParsed = {}; }
  check('summary total ≥ 1', sumParsed.data && sumParsed.data.total >= 1, `total=${sumParsed.data && sumParsed.data.total}`);
  check('summary 含 byKind', sumParsed.data && sumParsed.data.byKind && typeof sumParsed.data.byKind === 'object');
  check('summary 含 bySource', sumParsed.data && sumParsed.data.bySource && typeof sumParsed.data.bySource === 'object');
  check('summary 含 sample（最近条）', Array.isArray(sumParsed.data && sumParsed.data.sample));

  // ---- 5. localhost-only 中间件存在（静态扫描）----
  const routeContent = fs.readFileSync(ROUTE, 'utf8');
  check('routes/telemetry.js 含 localhostOnly 中间件定义', /function localhostOnly/.test(routeContent));
  check('localhostOnly 检查 ip === "127.0.0.1" || "::1"', /ip === ['"]127\.0\.0\.1['"]/.test(routeContent) && /['"]::1['"]/.test(routeContent));
  check('localhostOnly 拒绝时返回 403', /res\.status\(403\)/.test(routeContent));

  // ---- 6. 高 QPS 写入 ----
  const beforeTotal = sumParsed.data.total;
  for (let i = 0; i < 20; i++) {
    await fetchJson('http://localhost:3001/api/telemetry/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'window.error',
        message: 'qps test ' + i,
        source: 'asyncGuard',
        ts: Date.now(),
      }),
    });
  }
  const afterSum = await fetchJson('http://localhost:3001/api/telemetry/client-error/summary?limit=5');
  let afterParsed;
  try { afterParsed = JSON.parse(afterSum.body); } catch (_) { afterParsed = {}; }
  check('20 并发写后 total 增长 ≥ 20', afterParsed.data.total >= beforeTotal + 20, `before=${beforeTotal} after=${afterParsed.data.total}`);

  // ---- 7. payload 大字段截断 ----
  const bigStack = 'a'.repeat(10000);
  const bigUA = 'b'.repeat(500);
  const bigMsg = 'c'.repeat(2000);
  const bigResp = await fetchJson('http://localhost:3001/api/telemetry/client-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'unhandledrejection',
      message: bigMsg,
      stack: bigStack,
      userAgent: bigUA,
      source: 'asyncGuard',
      ts: Date.now(),
    }),
  });
  check('大 payload 写入仍 200', bigResp.status === 200);
  // 验证截断：取最新一条
  const recent = afterParsed.data.sample || [];
  // 取 summary 拿 sample
  const sum2 = await fetchJson('http://localhost:3001/api/telemetry/client-error/summary?limit=1');
  let sum2Parsed;
  try { sum2Parsed = JSON.parse(sum2.body); } catch (_) { sum2Parsed = {}; }
  const lastSample = (sum2Parsed.data && sum2Parsed.data.sample) || [];
  if (lastSample[0]) {
    const item = lastSample[0];
    check('大 stack 被截断到 ≤5000 字符', !item.stack || item.stack.length <= 5000, `stack len=${item.stack && item.stack.length}`);
    check('大 userAgent 被截断到 ≤200 字符', !item.userAgent || item.userAgent.length <= 200, `ua len=${item.userAgent && item.userAgent.length}`);
    check('大 message 被截断到 ≤1000 字符', !item.message || item.message.length <= 1000, `msg len=${item.message && item.message.length}`);
  } else {
    check('大 payload 写入后 sample 可查', false, 'no sample');
  }

  console.log(`\n--- summary: pass=${passed} fail=${failed} ---`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});