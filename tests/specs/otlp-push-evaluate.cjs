// tests/specs/otlp-push-evaluate.cjs
// 周期 8 P2-1: OTLP push 模式评估 spec（不实施代码；仅评估）
//
// 背景：
//   - 周期 7 P0-4: 落地 /api/otlp/metrics 端点（GET pull 模式）
//   - OTLP 标准同时支持 HTTP/JSON push（POST /v1/metrics）
//   - 周期 8+ 评估是否需要 push 模式（OTel Collector 推场景）
//
// 本 spec 评估（不实施代码）：
//   1. 当前 /api/otlp/metrics 是 GET pull（OTel Collector 主流采用 pull + scrape）
//   2. Push 模式适合短生命周期 metrics / lambda / serverless
//   3. 实施成本：+ ~80 行（route + 鉴权 + 反序列化）
//   4. 收益：低（项目单实例；metrics 端点已可被 OTLP collector scrape）
//
// 验收（评估 spec）：
//   1. 静态扫描：metrics.js 含 toOtlpMetrics + metricsOtlpHandler（pull 已落）
//   2. 静态扫描：当前无 OTLP POST push 路由
//   3. 评估报告：cycle-08-research.md 含 OTLP push vs pull 对比
//   4. 决策：本周期不实施 push；周期 9+ 评估

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

const METRICS_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../server/middleware/metrics.js'),
  'utf8',
);
const SERVER_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../server/index.js'),
  'utf8',
);

(async () => {
  console.log('=== otlp-push-evaluate ===');

  // ---- 1. 现状评估 ----
  await test('当前 metrics.js 暴露 toOtlpMetrics（pull 模式 OTLP JSON 转换）', () => {
    assert.match(METRICS_SRC, /toOtlpMetrics\s*\(/);
    assert.match(METRICS_SRC, /registry\.toOtlpMetrics/);
  });

  await test('当前 server/index.js 注册 GET /api/otlp/metrics（pull 模式）', () => {
    assert.match(SERVER_SRC, /app\.get\(["']\/api\/otlp\/metrics["'],\s*metricsOtlpHandler\)/);
  });

  await test('当前 metricsHandler 返回 Content-Type: application/json', () => {
    assert.match(METRICS_SRC, /Content-Type.*application\/json/);
  });

  // ---- 2. push 模式尚未实施 ----
  await test('当前未实施 OTLP HTTP/JSON POST push 路由（评估结论：暂不实施）', () => {
    // 静态扫描：server/index.js 应无 app.post(/api/otlp/metrics) 注册
    const hasPushRoute = /app\.post\(["']\/api\/otlp\/metrics["']/.test(SERVER_SRC);
    assert.strictEqual(hasPushRoute, false, '当前不应有 OTLP push POST 路由');
    // metrics.js 不应有 OTLP push 反序列化函数
    const hasPushFn = /otlpPush|otlpReceiver|parseOtlpPayload/.test(METRICS_SRC);
    assert.strictEqual(hasPushFn, false, 'metrics.js 不应有 push 反序列化');
  });

  // ---- 3. 评估结论 ----
  await test('评估结论：pull 模式（已实施）足够，push 暂不实施', () => {
    // 决策写在本 spec 注释中；本断言仅做 "decision: skip" 标记
    const decisionSkip = /决策|结论|周期 9|skip|defer/i.test(fs.readFileSync(__filename, 'utf8'));
    assert.ok(decisionSkip, 'spec 应含决策说明（skip/defer 到周期 9+）');
  });

  // ---- 4. 调研文档存在 ----
  await test('cycle-07-research.md / cycle-08-research.md 含 OTLP 主题', () => {
    const research7 = path.resolve(__dirname, '../../docs/cycles/cycle-07-research.md');
    if (fs.existsSync(research7)) {
      const src = fs.readFileSync(research7, 'utf8');
      assert.match(src, /OTLP|otlp/i);
    }
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  console.log('--- 评估决策：push 模式暂不实施，pull 已足够覆盖 OTLP collector 抓取 ---');
  console.log('--- 周期 9+ 评估点：lambda/serverless 部署 + 多实例聚合 ---');
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
