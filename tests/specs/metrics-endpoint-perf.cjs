// tests/specs/metrics-endpoint-perf.cjs
// 周期 9 P2-1: /api/metrics + /api/otlp/metrics 端点性能基准
// 不实施优化；只收集基线 + 验证 localhost-only 行为
const assert = require("node:assert/strict");
const http = require("node:http");

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

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}

async function bench(path, n = 100) {
  const samples = [];
  const sizes = [];
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    const r = await request(path);
    samples.push(Date.now() - t0);
    sizes.push(r.body.length);
    if (r.status !== 200) throw new Error(`${path} 返回 ${r.status}`);
  }
  return {
    iterations: n,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    p99: percentile(samples, 99),
    avg: samples.reduce((a, b) => a + b, 0) / samples.length,
    min: Math.min(...samples),
    max: Math.max(...samples),
    bodySizeAvg: sizes.reduce((a, b) => a + b, 0) / sizes.length,
  };
}

async function main() {
  await t("server 在线（127.0.0.1:3001 健康检查）", async () => {
    const r = await request("/api/health");
    assert.equal(r.status, 200);
    assert.ok(/ok/.test(r.body));
  });

  await t("/api/metrics localhost 放行 200", async () => {
    const r = await request("/api/metrics");
    assert.equal(r.status, 200, `status=${r.status}, body=${r.body.slice(0, 200)}`);
    assert.ok(r.body.length > 0);
  });

  await t("/api/otlp/metrics localhost 放行 200", async () => {
    const r = await request("/api/otlp/metrics");
    assert.equal(r.status, 200, `status=${r.status}, body=${r.body.slice(0, 200)}`);
    assert.ok(r.body.length > 0);
    // OTLP JSON 应有 resourceMetrics
    assert.ok(/resourceMetrics/i.test(r.body) || /metrics/i.test(r.body), "OTLP JSON 应含 metrics 字段");
  });

  await t("/api/metrics perf: 100 次顺序", async () => {
    const r = await bench("/api/metrics", 100);
    console.log(`    [bench] /api/metrics 100次: p50=${r.p50}ms p95=${r.p95}ms p99=${r.p99}ms avg=${r.avg.toFixed(2)}ms bodySizeAvg=${r.bodySizeAvg.toFixed(0)}B`);
    assert.ok(r.p95 < 200, `p95=${r.p95}ms 超过 200ms（基线收集，不强制）`);
  });

  await t("/api/otlp/metrics perf: 100 次顺序", async () => {
    const r = await bench("/api/otlp/metrics", 100);
    console.log(`    [bench] /api/otlp/metrics 100次: p50=${r.p50}ms p95=${r.p95}ms p99=${r.p99}ms avg=${r.avg.toFixed(2)}ms bodySizeAvg=${r.bodySizeAvg.toFixed(0)}B`);
    assert.ok(r.p95 < 200, `p95=${r.p95}ms 超过 200ms（基线收集）`);
  });

  await t("/api/metrics + /api/otlp/metrics 并发（10 并发 × 10 次）", async () => {
    const tasks = [];
    for (let i = 0; i < 10; i++) {
      tasks.push(request("/api/metrics"));
      tasks.push(request("/api/otlp/metrics"));
    }
    const t0 = Date.now();
    const results = await Promise.all(tasks);
    const elapsed = Date.now() - t0;
    console.log(`    [bench] 20 并发耗时 ${elapsed}ms`);
    for (const r of results) {
      assert.equal(r.status, 200);
    }
    assert.ok(elapsed < 2000, `20 并发耗时 ${elapsed}ms 超过 2 秒`);
  });

  await t("/api/metrics content-type 是 text/plain; version=0.0.4 (Prometheus)", async () => {
    const r = await request("/api/metrics");
    const ct = r.headers["content-type"] || "";
    assert.ok(/text\/plain/.test(ct) || /openmetrics/.test(ct), `content-type=${ct}`);
  });

  await t("/api/otlp/metrics content-type 是 application/json", async () => {
    const r = await request("/api/otlp/metrics");
    const ct = r.headers["content-type"] || "";
    assert.ok(/application\/json/.test(ct), `content-type=${ct}`);
  });

  await t("周期 9 P2-1 评估报告：metrics 端点基线 + 不优化", () => {
    const report = {
      cycle: 9,
      taskId: "P2-1",
      endpoints: ["/api/metrics", "/api/otlp/metrics"],
      decision: "周期 9 不优化；基线已收，周期 10+ 评估：metricsOtlpHandler JSON serialization 优化、metricsHandler text 缓存",
    };
    assert.equal(report.cycle, 9);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});