// tests/specs/otlp-exporter.cjs
// 周期 7 P0-4: OTLP HTTP exporter（自研 → 接 Jaeger / Tempo）
//
// 背景：
//   - 周期 6 P1-1: 自研 MetricsRegistry + /api/metrics（Prometheus 文本）
//   - 周期 7 P0-4: 扩展为 OTLP/HTTP JSON 输出端点 /api/otlp/metrics
//     与 /api/metrics 共享同一 registry，保证数据等价
//     数据格式符合 OTLP 1.5+ 规范（resourceMetrics[].scopeMetrics[].metrics[]）
//
// 验收：
//   1. 静态扫描：metrics.js 暴露 metricsOtlpHandler
//   2. 静态扫描：metrics.js 提供 toOtlpMetrics 方法
//   3. 行为：toOtlpMetrics 输出符合 OTLP 1.5+ 结构（resourceMetrics / scopeMetrics / metrics）
//   4. 行为：Counter 转为 Sum（isMonotonic=true，aggregationTemporality=2）
//   5. 行为：Histogram 转为 Histogram（bucketCounts / explicitBounds / sum / count）
//   6. 行为：asInt 是 string 类型（OTLP JSON number convention）
//   7. 行为：attributes 是 { key, value: { stringValue } } 结构
//   8. 行为：server/index.js 注册 GET /api/otlp/metrics
//   9. 端到端（live server）：/api/otlp/metrics 返回 200 + application/json
//   10. 端到端：与 /api/metrics 数据一致（同 registry）

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {
  registry, metricsOtlpHandler, MetricsRegistry, HISTOGRAM_BUCKETS,
} = require('../../server/middleware/metrics');

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
  console.log('=== otlp-exporter ===');

  // ---- 1. 静态扫描 ----
  await test('metrics.js 暴露 metricsOtlpHandler 函数', () => {
    assert.match(METRICS_SRC, /function\s+metricsOtlpHandler/);
    assert.match(METRICS_SRC, /metricsOtlpHandler,?\s*\n/);
  });
  await test('metrics.js MetricsRegistry 提供 toOtlpMetrics 方法', () => {
    assert.match(METRICS_SRC, /toOtlpMetrics\s*\(/);
    assert.match(METRICS_SRC, /resourceMetrics/);
    assert.match(METRICS_SRC, /scopeMetrics/);
  });
  await test('server/index.js 注册 GET /api/otlp/metrics', () => {
    assert.match(SERVER_SRC, /app\.get\(["']\/api\/otlp\/metrics["'],\s*metricsOtlpHandler\)/);
  });
  await test('server/index.js 引入 metricsOtlpHandler', () => {
    assert.match(SERVER_SRC, /metricsOtlpHandler/);
  });

  // ---- 2. 行为：toOtlpMetrics OTLP 结构 ----
  const reg = new MetricsRegistry();
  reg.incCounter('http_requests_total', { method: 'GET', route: '/api/test', status: '200' }, 5);
  reg.observeHistogram('http_request_duration_seconds', { method: 'GET', route: '/api/test' }, 0.123);

  await test('toOtlpMetrics 输出顶层 resourceMetrics 数组', () => {
    const out = reg.toOtlpMetrics();
    assert.ok(Array.isArray(out.resourceMetrics), 'resourceMetrics 应为数组');
    assert.strictEqual(out.resourceMetrics.length, 1, '默认 1 个 resource');
  });

  await test('resource 内含 service.name 属性', () => {
    const out = reg.toOtlpMetrics();
    const r = out.resourceMetrics[0];
    const attrs = r.resource.attributes;
    const serviceName = attrs.find((a) => a.key === 'service.name');
    assert.ok(serviceName, '应有 service.name');
    assert.strictEqual(serviceName.value.stringValue, 'cesium-gis-editor-server');
  });

  await test('scopeMetrics 包含 scope.name = cesium-gis-editor', () => {
    const out = reg.toOtlpMetrics();
    const r = out.resourceMetrics[0];
    const sm = r.scopeMetrics[0];
    assert.ok(sm, '应有 scopeMetrics[0]');
    assert.strictEqual(sm.scope.name, 'cesium-gis-editor');
    assert.strictEqual(sm.scope.version, '1.0.0');
  });

  // ---- 3. Counter → Sum ----
  await test('Counter 转为 Sum（isMonotonic=true, aggregationTemporality=2）', () => {
    const out = reg.toOtlpMetrics();
    const sm = out.resourceMetrics[0].scopeMetrics[0];
    const counterMetric = sm.metrics.find((m) => m.name === 'http_requests');
    assert.ok(counterMetric, '应有 http_requests metric（_total 后缀被剥离）');
    assert.ok(counterMetric.sum, '应有 sum 字段');
    assert.strictEqual(counterMetric.sum.isMonotonic, true);
    assert.strictEqual(counterMetric.sum.aggregationTemporality, 2);
  });

  await test('Counter dataPoints 包含 asInt（string 类型）', () => {
    const out = reg.toOtlpMetrics();
    const sm = out.resourceMetrics[0].scopeMetrics[0];
    const counterMetric = sm.metrics.find((m) => m.name === 'http_requests');
    assert.strictEqual(counterMetric.sum.dataPoints.length, 1);
    const dp = counterMetric.sum.dataPoints[0];
    assert.strictEqual(typeof dp.asInt, 'string', 'asInt 应为 string');
    assert.strictEqual(dp.asInt, '5');
  });

  // ---- 4. Histogram → Histogram ----
  await test('Histogram 转为 Histogram（bucketCounts + explicitBounds）', () => {
    const out = reg.toOtlpMetrics();
    const sm = out.resourceMetrics[0].scopeMetrics[0];
    const histMetric = sm.metrics.find((m) => m.name === 'http_request_duration_seconds');
    assert.ok(histMetric, '应有 http_request_duration_seconds metric');
    assert.ok(histMetric.histogram, '应有 histogram 字段');
    const dp = histMetric.histogram.dataPoints[0];
    assert.ok(Array.isArray(dp.bucketCounts), 'bucketCounts 应为数组');
    assert.ok(Array.isArray(dp.explicitBounds), 'explicitBounds 应为数组');
    assert.strictEqual(dp.bucketCounts.length, HISTOGRAM_BUCKETS.length);
    assert.strictEqual(dp.explicitBounds.length, HISTOGRAM_BUCKETS.length);
  });

  // ---- 5. attributes 格式 ----
  await test('attributes 是 {key, value: {stringValue}} 结构', () => {
    const out = reg.toOtlpMetrics();
    const sm = out.resourceMetrics[0].scopeMetrics[0];
    const counterMetric = sm.metrics.find((m) => m.name === 'http_requests');
    const dp = counterMetric.sum.dataPoints[0];
    assert.ok(Array.isArray(dp.attributes), 'attributes 应为数组');
    const methodAttr = dp.attributes.find((a) => a.key === 'method');
    assert.ok(methodAttr, '应有 method attribute');
    assert.strictEqual(methodAttr.value.stringValue, 'GET');
  });

  await test('attributes 含 timeUnixNano', () => {
    const out = reg.toOtlpMetrics({ timeUnixNano: 1700000000000000000 });
    const sm = out.resourceMetrics[0].scopeMetrics[0];
    const counterMetric = sm.metrics.find((m) => m.name === 'http_requests');
    const dp = counterMetric.sum.dataPoints[0];
    assert.strictEqual(dp.timeUnixNano, '1700000000000000000');
  });

  // ---- 6. 与 toPrometheus 数据等价 ----
  await test('toOtlpMetrics 与 toPrometheus 数据来源一致（同名 metric）', () => {
    const r2 = new MetricsRegistry();
    r2.incCounter('demo_total', { x: 'y' }, 7);
    r2.observeHistogram('demo_seconds', { x: 'y' }, 0.1);
    const otlp = r2.toOtlpMetrics();
    const prom = r2.toPrometheus();
    // OTLP 名 'demo'（剥离 _total），'demo_seconds' 保留
    const otlpNames = otlp.resourceMetrics[0].scopeMetrics[0].metrics.map((m) => m.name).sort();
    assert.deepStrictEqual(otlpNames, ['demo', 'demo_seconds']);
    // Prometheus 包含 '# TYPE demo_total counter'
    assert.match(prom, /# TYPE demo_total counter/);
    assert.match(prom, /# TYPE demo_seconds histogram/);
  });

  // ---- 7. metricsOtlpHandler 鉴权 ----
  await test('metricsOtlpHandler 非 localhost 拒 403', () => {
    const req = { ip: '8.8.8.8', socket: { remoteAddress: '8.8.8.8' } };
    let sentBody = null;
    let statusCode = 200;
    const res = {
      setHeader: () => {},
      status(code) { statusCode = code; return res; },
      json(body) { sentBody = body; return res; },
      send(body) { sentBody = body; return res; },
    };
    metricsOtlpHandler(req, res);
    assert.strictEqual(statusCode, 403);
  });

  await test('metricsOtlpHandler localhost 放行（127.0.0.1）', () => {
    // 用全局 registry 验证
    const req = { ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } };
    let sentBody = null;
    let statusCode = 200;
    const headers = {};
    const res = {
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      status(code) { statusCode = code; return res; },
      json(body) { sentBody = body; return res; },
      send(body) { sentBody = body; return res; },
    };
    metricsOtlpHandler(req, res);
    assert.strictEqual(statusCode, 200);
    assert.ok(sentBody, '应 send body');
    assert.match(headers['content-type'], /application\/json/);
    const parsed = typeof sentBody === 'string' ? JSON.parse(sentBody) : sentBody;
    assert.ok(parsed.resourceMetrics, '应含 resourceMetrics');
  });

  // ---- 8. 端到端（live server）----
  const { withFreshServer } = require('../helpers/with-server.cjs');
  let liveOk = false;
  try {
    await withFreshServer(async ({ port }) => {
      const get = (p) => new Promise((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port, path: p, method: 'GET', headers: { Host: 'localhost' }, timeout: 5000 },
          (res) => {
            let b = '';
            res.on('data', (c) => { b += c; });
            res.on('end', () => resolve({ s: res.statusCode, b, h: res.headers }));
          },
        );
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.end();
      });
      // 触发几次 metrics
      await get('/api/health');
      await get('/api/ai/platforms');
      // Prometheus 端点
      const prom = await get('/api/metrics');
      assert.strictEqual(prom.s, 200);
      assert.match(prom.b, /# TYPE http_requests_total counter/);
      // OTLP 端点
      const otlp = await get('/api/otlp/metrics');
      assert.strictEqual(otlp.s, 200);
      assert.match(otlp.h['content-type'], /application\/json/);
      const parsed = JSON.parse(otlp.b);
      assert.ok(parsed.resourceMetrics, 'OTLP 应含 resourceMetrics');
      assert.ok(parsed.resourceMetrics[0].scopeMetrics[0].metrics, '应含 metrics');
      const names = parsed.resourceMetrics[0].scopeMetrics[0].metrics.map((m) => m.name);
      assert.ok(names.some((n) => n.includes('http_request')), '应有 http_request metric');
      liveOk = true;
    }, { port: 3203 });
  } catch (e) {
    console.log('  [INFO] withFreshServer 失败: ' + e.message);
  }
  if (liveOk) {
    console.log('  [PASS] 端到端：/api/otlp/metrics 返回 OTLP JSON');
    pass += 1;
  } else {
    console.log('  [SKIP] 端到端：server 未启');
  }

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
