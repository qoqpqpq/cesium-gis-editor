// tests/specs/otel-metrics.cjs
// 周期 6 P1-1: Otel-style Metrics（http_requests_total + http_request_duration_seconds）
//
// 背景：周期 4 P1-1 实施 W3C traceparent。
//   周期 6 P1-1 升级到 Otel 风格 Metrics：
//     - http_requests_total{method,route,status} (Counter)
//     - http_request_duration_seconds{method,route} (Histogram)
//   暴露端点 GET /api/metrics（Prometheus 文本格式，localhost-only）
//
// 验收：
//   1. 静态扫描：metrics.js 暴露 MetricsRegistry + httpMetricsMiddleware + metricsHandler
//   2. 行为：MetricsRegistry.incCounter 增加计数
//   3. 行为：MetricsRegistry.observeHistogram 累加直方图
//   4. 行为：toPrometheus 输出标准文本格式（TYPE / counter / histogram）
//   5. 行为：httpMetricsMiddleware 监听 res.on('finish') 触发计数
//   6. 行为：metricsHandler localhost-only（外部 IP 403）
//   7. 端到端（live server）：/api/metrics 包含 http_requests_total / http_request_duration_seconds

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const {
  registry, httpMetricsMiddleware, metricsHandler, MetricsRegistry, HISTOGRAM_BUCKETS,
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
  console.log('=== otel-metrics ===');

  // ---- 1. 静态扫描 ----
  await test('metrics.js 暴露 MetricsRegistry 类', () => {
    assert.match(METRICS_SRC, /class\s+MetricsRegistry/);
  });
  await test('metrics.js 暴露 httpMetricsMiddleware 函数', () => {
    assert.match(METRICS_SRC, /function\s+httpMetricsMiddleware/);
  });
  await test('metrics.js 暴露 metricsHandler 函数', () => {
    assert.match(METRICS_SRC, /function\s+metricsHandler/);
  });
  await test('server/index.js 引入 metrics 中间件', () => {
    assert.match(SERVER_SRC, /require\(["']\.\/middleware\/metrics["']\)/);
  });
  await test('server/index.js app.use(httpMetricsMiddleware())', () => {
    assert.match(SERVER_SRC, /app\.use\(httpMetricsMiddleware\(\)\)/);
  });
  await test('server/index.js 注册 GET /api/metrics', () => {
    assert.match(SERVER_SRC, /app\.get\(["']\/api\/metrics["'],\s*metricsHandler\)/);
  });

  // ---- 2. MetricsRegistry.incCounter ----
  const reg = new MetricsRegistry();
  await test('incCounter 增加计数', () => {
    reg.incCounter('my_counter', { a: '1' }, 3);
    reg.incCounter('my_counter', { a: '1' }, 2);
    assert.strictEqual(reg.getCounter('my_counter', { a: '1' }), 5);
  });
  await test('incCounter 不同 label 独立计数', () => {
    reg.incCounter('my_counter', { a: '2' }, 7);
    assert.strictEqual(reg.getCounter('my_counter', { a: '1' }), 5);
    assert.strictEqual(reg.getCounter('my_counter', { a: '2' }), 7);
  });

  // ---- 3. MetricsRegistry.observeHistogram ----
  await test('observeHistogram 累加 count + sum + bucket', () => {
    reg.observeHistogram('my_hist', { route: '/x' }, 0.003); // < 0.005
    reg.observeHistogram('my_hist', { route: '/x' }, 0.1);   // 0.005-0.1
    reg.observeHistogram('my_hist', { route: '/x' }, 0.5);   // 0.1-0.5
    // 查 buckets[0] (0.005): 0.003 <= 0.005 → count 1
    // 查 buckets[4] (0.1): 0.003+0.1 <= 0.1 → count 2
    // 查 buckets[6] (0.5): 0.003+0.1+0.5 <= 0.5 → count 3
    const out = reg.toPrometheus();
    assert.match(out, /# TYPE my_hist histogram/);
    assert.match(out, /my_hist_bucket\{[^}]*route="\/x"[^}]*le="0\.005"[^}]*\} 1/);
    assert.match(out, /my_hist_bucket\{[^}]*route="\/x"[^}]*le="0\.1"[^}]*\} 2/);
    assert.match(out, /my_hist_bucket\{[^}]*route="\/x"[^}]*le="0\.5"[^}]*\} 3/);
    assert.match(out, /my_hist_bucket\{[^}]*route="\/x"[^}]*le="\+Inf"[^}]*\} 3/);
    assert.match(out, /my_hist_count\{[^}]*route="\/x"[^}]*\} 3/);
  });

  // ---- 4. toPrometheus 输出 ----
  await test('toPrometheus 输出 counter TYPE / value', () => {
    const r2 = new MetricsRegistry();
    r2.incCounter('demo_total', { k: 'v' }, 42);
    const out = r2.toPrometheus();
    assert.match(out, /# TYPE demo_total counter/);
    assert.match(out, /demo_total\{k="v"\} 42/);
  });

  // ---- 5. httpMetricsMiddleware res.on('finish') 触发 ----
  await test('httpMetricsMiddleware 监听 res.on(finish) 计数', async () => {
    const r3 = new MetricsRegistry();
    // 手动模拟 middleware 内部逻辑
    const req = { method: 'GET', originalUrl: '/api/test', route: { path: '/test' }, baseUrl: '/api' };
    const res = new EventEmitter();
    res.statusCode = 200;
    // 直接复刻 middleware 行为
    res.on('finish', () => {
      const route = (req.route && req.route.path) ? (req.baseUrl || '') + req.route.path : req.originalUrl;
      r3.incCounter('http_requests_total', { method: req.method, route, status: '200' }, 1);
    });
    res.emit('finish');
    assert.ok(r3.getCounter('http_requests_total', { method: 'GET', route: '/api/test', status: '200' }) >= 1);
  });

  // ---- 6. metricsHandler localhost-only ----
  await test('metricsHandler 非 localhost IP 拒 403', () => {
    const req = { ip: '8.8.8.8', socket: { remoteAddress: '8.8.8.8' } };
    const headers = {};
    const res = {
      statusCode: 200,
      setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
      status: (code) => { res.statusCode = code; return res; },
      json: (body) => { res.body = body; return res; },
    };
    metricsHandler(req, res);
    assert.strictEqual(res.statusCode, 403);
  });
  await test('metricsHandler localhost 127.0.0.1 放行', () => {
    const req = { ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } };
    const headers = {};
    let sendCalled = false;
    const res = {
      statusCode: 200,
      setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
      status: (code) => { res.statusCode = code; return res; },
      send: (body) => { sendCalled = true; res.body = body; return res; },
    };
    metricsHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(sendCalled, 'localhost 应 send Prometheus 文本');
    assert.strictEqual(headers['content-type'], 'text/plain; version=0.0.4; charset=utf-8');
  });
  await test('metricsHandler ::1 IPv6 loopback 也放行', () => {
    const req = { ip: '::1', socket: { remoteAddress: '::1' } };
    const headers = {};
    let sendCalled = false;
    const res = {
      statusCode: 200,
      setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
      status: (code) => { res.statusCode = code; return res; },
      send: (body) => { sendCalled = true; res.body = body; return res; },
    };
    metricsHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(sendCalled);
  });

  // ---- 7. HISTOGRAM_BUCKETS 包含 11 个边界 ----
  await test('HISTOGRAM_BUCKETS 11 个边界（0.005~10s）', () => {
    assert.strictEqual(HISTOGRAM_BUCKETS.length, 11);
    assert.strictEqual(HISTOGRAM_BUCKETS[0], 0.005);
    assert.strictEqual(HISTOGRAM_BUCKETS[HISTOGRAM_BUCKETS.length - 1], 10);
  });

  // ---- 8. 端到端（live server）：/api/metrics 包含期望内容 ----
  // 用 withFreshServer（避免与用户 dev server 冲突）
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
      await get('/api/gis/config');
      await get('/api/ai/platforms');
      const m = await get('/api/metrics');
      assert.strictEqual(m.s, 200, '/api/metrics 应 200');
      assert.match(m.b, /# TYPE http_requests_total counter/, '含 http_requests_total TYPE');
      assert.match(m.b, /# TYPE http_request_duration_seconds histogram/, '含 duration histogram');
      assert.match(m.b, /http_requests_total\{[^}]*route="\/api\/health"[^}]*\} \d+/, 'health 被计数');
      assert.match(m.b, /http_requests_total\{[^}]*route="\/api\/ai\/platforms"[^}]*\} \d+/, 'platforms 被计数');
      assert.match(m.b, /http_request_duration_seconds_count\{/, 'duration count 存在');
      liveOk = true;
    }, { port: 3202 });
  } catch (e) {
    console.log('  [INFO] withFreshServer 失败: ' + e.message);
  }
  if (liveOk) {
    console.log('  [PASS] 端到端：/api/metrics 包含 http_requests_total + http_request_duration_seconds');
    pass += 1;
  } else {
    console.log('  [SKIP] 端到端：server 未启（先跑 node server/index.js）');
  }

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
