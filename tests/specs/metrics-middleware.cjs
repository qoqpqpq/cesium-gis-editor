// tests/specs/metrics-middleware.cjs
// 周期 19 R3: metrics.js 指标中间件测试
// 目标：≥ 20 PASS
//
// 覆盖：
//   - MetricsRegistry 类（incCounter/getCounter/observeHistogram/toPrometheus/toOtlpMetrics）
//   - httpMetricsMiddleware HTTP 指标中间件
//   - metricsHandler Prometheus 端点
//   - metricsOtlpHandler OTLP 端点
//   - CIDR 白名单（isMetricsTrusted/parseTrustedCidrs/matchIpv4Cidr/ipv4ToInt）
//   - 辅助函数（labelsKey/labelsFromKey/formatLabels/labelsToAttributes）

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const METRICS_SRC = fs.readFileSync(path.join(ROOT, 'server/middleware/metrics.js'), 'utf8');

let pass = 0;
let fail = 0;

function ok(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      pass += 1;
      console.log(`  [PASS] ${label}`);
    })
    .catch((e) => {
      fail += 1;
      console.error(`  [FAIL] ${label}: ${e.message}`);
    });
}

(async function main() {
  console.log('=== metrics-middleware ===');

  // ============ Group A: 静态扫描 - 导出验证 ============
  await ok('A1: 导出 registry', () => {
    assert.match(METRICS_SRC, /const\s+registry\s*=\s*new\s+MetricsRegistry/);
  });
  await ok('A2: 导出 httpMetricsMiddleware', () => {
    assert.match(METRICS_SRC, /function\s+httpMetricsMiddleware/);
  });
  await ok('A3: 导出 metricsHandler', () => {
    assert.match(METRICS_SRC, /function\s+metricsHandler/);
  });
  await ok('A4: 导出 metricsOtlpHandler', () => {
    assert.match(METRICS_SRC, /function\s+metricsOtlpHandler/);
  });
  await ok('A5: 导出 processMetricsCollector', () => {
    assert.match(METRICS_SRC, /function\s+processMetricsCollector/);
  });
  await ok('A6: 导出 HISTOGRAM_BUCKETS', () => {
    assert.match(METRICS_SRC, /const\s+HISTOGRAM_BUCKETS\s*=\s*\[/);
  });
  await ok('A7: 导出 MetricsRegistry 类', () => {
    assert.match(METRICS_SRC, /class\s+MetricsRegistry/);
  });
  await ok('A8: 导出 isMetricsTrusted', () => {
    assert.match(METRICS_SRC, /function\s+isMetricsTrusted/);
  });
  await ok('A9: 导出 getTrustedCidrs', () => {
    assert.match(METRICS_SRC, /function\s+getTrustedCidrs/);
  });
  await ok('A10: 导出 parseTrustedCidrs', () => {
    assert.match(METRICS_SRC, /function\s+parseTrustedCidrs/);
  });
  await ok('A11: 导出 matchIpv4Cidr', () => {
    assert.match(METRICS_SRC, /function\s+matchIpv4Cidr/);
  });
  await ok('A12: 导出 ipv4ToInt', () => {
    assert.match(METRICS_SRC, /function\s+ipv4ToInt/);
  });
  await ok('A13: 导出 _resetTrustedCidrsCache', () => {
    assert.match(METRICS_SRC, /function\s+_resetTrustedCidrsCache/);
  });

  // ============ Group B: 静态扫描 - 常量定义 ============
  await ok('B1: 定义 HISTOGRAM_BUCKETS', () => {
    assert.match(METRICS_SRC, /0\.005\s*,\s*0\.01\s*,\s*0\.025/);
  });

  // ============ Group C: MetricsRegistry 类验证 ============
  await ok('C1: 构造函数初始化 counters Map', () => {
    assert.match(METRICS_SRC, /this\.counters\s*=\s*new\s+Map/);
  });
  await ok('C2: 构造函数初始化 histograms Map', () => {
    assert.match(METRICS_SRC, /this\.histograms\s*=\s*new\s+Map/);
  });
  await ok('C3: incCounter 方法', () => {
    assert.match(METRICS_SRC, /incCounter\s*\(\s*name\s*,\s*labels\s*=\s*\{\}\s*,\s*value\s*=\s*1\s*\)/);
  });
  await ok('C4: getCounter 方法', () => {
    assert.match(METRICS_SRC, /getCounter\s*\(\s*name\s*,\s*labels\s*\)/);
  });
  await ok('C5: observeHistogram 方法', () => {
    assert.match(METRICS_SRC, /observeHistogram\s*\(\s*name\s*,\s*labels\s*,\s*value\s*\)/);
  });
  await ok('C6: toPrometheus 方法', () => {
    assert.match(METRICS_SRC, /toPrometheus\s*\(\s*\)/);
  });
  await ok('C7: toOtlpMetrics 方法', () => {
    assert.match(METRICS_SRC, /toOtlpMetrics\s*\(\s*opts\s*=\s*\{\}\s*\)/);
  });
  await ok('C8: reset 方法', () => {
    assert.match(METRICS_SRC, /reset\s*\(\s*\)/);
  });

  // ============ Group D: toPrometheus 逻辑验证 ============
  await ok('D1: 输出 # TYPE counter', () => {
    assert.match(METRICS_SRC, /TYPE\s+\$\{name\}\s+counter/);
  });
  await ok('D2: 输出 counter 值', () => {
    assert.match(METRICS_SRC, /\$\{name\}\$\{formatLabels\(labels\)\}\s+\$\{v\}/);
  });
  await ok('D3: 输出 # TYPE histogram', () => {
    assert.match(METRICS_SRC, /TYPE\s+\$\{name\}\s+histogram/);
  });
  await ok('D4: 输出 histogram bucket', () => {
    assert.match(METRICS_SRC, /_bucket/);
  });
  await ok('D5: 输出 +Inf bucket', () => {
    assert.match(METRICS_SRC, /le:\s*['"]\+Inf['"]/);
  });
  await ok('D6: 输出 _count', () => {
    assert.match(METRICS_SRC, /_count/);
  });
  await ok('D7: 输出 _sum', () => {
    assert.match(METRICS_SRC, /_sum/);
  });

  // ============ Group E: toOtlpMetrics 逻辑验证 ============
  await ok('E1: 返回 resourceMetrics', () => {
    assert.match(METRICS_SRC, /resourceMetrics\s*:\s*\[/);
  });
  await ok('E2: 设置 resource attributes', () => {
    assert.match(METRICS_SRC, /service\.name/);
  });
  await ok('E3: 设置 scope name/version', () => {
    assert.match(METRICS_SRC, /scope\s*:\s*\{\s*name:\s*scopeName/);
  });
  await ok('E4: Counter → Sum', () => {
    assert.match(METRICS_SRC, /sum\s*:\s*\{/);
  });
  await ok('E5: Histogram → Histogram', () => {
    assert.match(METRICS_SRC, /histogram\s*:\s*\{/);
  });
  await ok('E6: 设置 aggregationTemporality', () => {
    assert.match(METRICS_SRC, /aggregationTemporality:\s*2/);
  });
  await ok('E7: 设置 isMonotonic', () => {
    assert.match(METRICS_SRC, /isMonotonic:\s*true/);
  });

  // ============ Group F: httpMetricsMiddleware 逻辑验证 ============
  await ok('F1: 记录开始时间', () => {
    assert.match(METRICS_SRC, /performance\.now\s*\(\s*\)/);
  });
  await ok('F2: 监听 finish 事件', () => {
    assert.match(METRICS_SRC, /res\.on\s*\(\s*['"]finish['"]/);
  });
  await ok('F3: 计算持续时间（秒）', () => {
    assert.match(METRICS_SRC, /1000/);
  });
  await ok('F4: 获取 route', () => {
    assert.match(METRICS_SRC, /req\.route\.path/);
  });
  await ok('F5: 设置 labels', () => {
    assert.match(METRICS_SRC, /method:\s*req\.method/);
    assert.match(METRICS_SRC, /status:\s*String\s*\(\s*res\.statusCode\s*\)/);
  });
  await ok('F6: incCounter', () => {
    assert.match(METRICS_SRC, /incCounter\s*\(\s*['"]http_requests_total['"]/);
  });
  await ok('F7: observeHistogram', () => {
    assert.match(METRICS_SRC, /observeHistogram\s*\(\s*['"]http_request_duration_seconds['"]/);
  });

  // ============ Group G: metricsHandler 逻辑验证 ============
  await ok('G1: 检查 IP', () => {
    assert.match(METRICS_SRC, /req\.ip/);
  });
  await ok('G2: isMetricsTrusted 检查', () => {
    assert.match(METRICS_SRC, /isMetricsTrusted\s*\(/);
  });
  await ok('G3: 未授权返回 403', () => {
    assert.match(METRICS_SRC, /status\s*\(\s*403\s*\)/);
  });
  await ok('G4: 设置 Content-Type', () => {
    assert.match(METRICS_SRC, /text\/plain/);
  });
  await ok('G5: 返回 Prometheus 格式', () => {
    assert.match(METRICS_SRC, /toPrometheus\s*\(\s*\)/);
  });

  // ============ Group H: metricsOtlpHandler 逻辑验证 ============
  await ok('H1: 检查 IP', () => {
    assert.match(METRICS_SRC, /req\.ip/);
  });
  await ok('H2: isMetricsTrusted 检查', () => {
    assert.match(METRICS_SRC, /isMetricsTrusted\s*\(/);
  });
  await ok('H3: 未授权返回 403', () => {
    assert.match(METRICS_SRC, /status\s*\(\s*403\s*\)/);
  });
  await ok('H4: 设置 Content-Type JSON', () => {
    assert.match(METRICS_SRC, /application\/json/);
  });
  await ok('H5: 返回 OTLP JSON', () => {
    assert.match(METRICS_SRC, /toOtlpMetrics\s*\(\s*\)/);
  });

  // ============ Group I: CIDR 白名单逻辑验证 ============
  await ok('I1: parseTrustedCidrs 空值返回 []', () => {
    assert.match(METRICS_SRC, /!\s*envValue\s*\|\|\s*typeof\s*envValue\s*!==\s*['"]string['"]\s*\)\s+return\s+\[\]/);
  });
  await ok('I2: parseTrustedCidrs 按逗号分割', () => {
    assert.match(METRICS_SRC, /split\s*\(\s*['"],['"]\s*\)/);
  });
  await ok('I3: getTrustedCidrs 缓存', () => {
    assert.match(METRICS_SRC, /_trustedCidrsCache/);
  });
  await ok('I4: ipv4ToInt 处理 IPv4-mapped IPv6', () => {
    assert.match(METRICS_SRC, /::ffff/);
  });
  await ok('I5: ipv4ToInt 检查范围', () => {
    assert.match(METRICS_SRC, /a\s*>\s*255\s*\|\|\s*b\s*>\s*255/);
  });
  await ok('I6: matchIpv4Cidr 检查 bits 范围', () => {
    assert.match(METRICS_SRC, /bits\s*<\s*0\s*\|\|\s*bits\s*>\s*32/);
  });
  await ok('I7: matchIpv4Cidr bits=0 返回 true', () => {
    assert.match(METRICS_SRC, /bits\s*===\s*0\s*\)\s+return\s+true/);
  });
  await ok('I8: isMetricsTrusted 检查 localhost', () => {
    assert.match(METRICS_SRC, /127\.0\.0\.1/);
    assert.match(METRICS_SRC, /::1/);
  });

  // ============ Group J: 辅助函数验证 ============
  await ok('J1: labelsKey 稳定排序', () => {
    assert.match(METRICS_SRC, /Object\.keys\s*\(\s*labels\s*\)\.sort\s*\(\s*\)/);
  });
  await ok('J2: labelsFromKey 解析 JSON', () => {
    assert.match(METRICS_SRC, /JSON\.parse\s*\(\s*k\s*\)/);
  });
  await ok('J3: formatLabels 空对象返回空字符串', () => {
    assert.match(METRICS_SRC, /keys\.length\s*===\s*0\s*\)\s+return\s+['"]['"]/);
  });
  await ok('J4: formatLabels 转义特殊字符', () => {
    assert.match(METRICS_SRC, /replace\s*\(\s*\/\\\\\/g/);
  });
  await ok('J5: labelsToAttributes 空对象返回 []', () => {
    assert.match(METRICS_SRC, /keys\.length\s*===\s*0\s*\)\s+return\s+\[\]/);
  });

  // ============ Group K: 实际测试 - MetricsRegistry ============
  const { MetricsRegistry, HISTOGRAM_BUCKETS } = require(path.join(ROOT, 'server/middleware/metrics.js'));

  await ok('K1: incCounter 递增计数', () => {
    const reg = new MetricsRegistry();
    reg.incCounter('test_counter', { key: 'value' });
    assert.equal(reg.getCounter('test_counter', { key: 'value' }), 1);
  });

  await ok('K2: incCounter 多次递增', () => {
    const reg = new MetricsRegistry();
    reg.incCounter('test_counter', { key: 'value' });
    reg.incCounter('test_counter', { key: 'value' });
    reg.incCounter('test_counter', { key: 'value' });
    assert.equal(reg.getCounter('test_counter', { key: 'value' }), 3);
  });

  await ok('K3: incCounter 不同 labels 独立计数', () => {
    const reg = new MetricsRegistry();
    reg.incCounter('test_counter', { key: 'value1' });
    reg.incCounter('test_counter', { key: 'value2' });
    assert.equal(reg.getCounter('test_counter', { key: 'value1' }), 1);
    assert.equal(reg.getCounter('test_counter', { key: 'value2' }), 1);
  });

  await ok('K4: getCounter 不存在的返回 0', () => {
    const reg = new MetricsRegistry();
    assert.equal(reg.getCounter('nonexistent', {}), 0);
  });

  await ok('K5: observeHistogram 记录观测', () => {
    const reg = new MetricsRegistry();
    reg.observeHistogram('test_histogram', { key: 'value' }, 0.05);
    // 检查 Prometheus 输出
    const prom = reg.toPrometheus();
    assert.match(prom, /test_histogram_bucket/);
  });

  await ok('K6: observeHistogram 多次观测', () => {
    const reg = new MetricsRegistry();
    reg.observeHistogram('test_histogram', { key: 'value' }, 0.05);
    reg.observeHistogram('test_histogram', { key: 'value' }, 0.1);
    reg.observeHistogram('test_histogram', { key: 'value' }, 0.2);
    const prom = reg.toPrometheus();
    assert.match(prom, /test_histogram_count/);
    assert.match(prom, /test_histogram_sum/);
  });

  await ok('K7: toPrometheus 空 registry', () => {
    const reg = new MetricsRegistry();
    const prom = reg.toPrometheus();
    assert.equal(prom, '\n');
  });

  await ok('K8: toOtlpMetrics 空 registry', () => {
    const reg = new MetricsRegistry();
    const otlp = reg.toOtlpMetrics();
    assert.deepEqual(otlp.resourceMetrics[0].scopeMetrics[0].metrics, []);
  });

  await ok('K9: toOtlpMetrics 有 counter', () => {
    const reg = new MetricsRegistry();
    reg.incCounter('test_total', { key: 'value' });
    const otlp = reg.toOtlpMetrics();
    assert.equal(otlp.resourceMetrics[0].scopeMetrics[0].metrics.length, 1);
    assert.match(otlp.resourceMetrics[0].scopeMetrics[0].metrics[0].name, /test/);
  });

  await ok('K10: toOtlpMetrics 有 histogram', () => {
    const reg = new MetricsRegistry();
    reg.observeHistogram('test_seconds', { key: 'value' }, 0.05);
    const otlp = reg.toOtlpMetrics();
    assert.equal(otlp.resourceMetrics[0].scopeMetrics[0].metrics.length, 1);
    assert.equal(otlp.resourceMetrics[0].scopeMetrics[0].metrics[0].histogram.dataPoints.length, 1);
  });

  await ok('K11: reset 清空 registry', () => {
    const reg = new MetricsRegistry();
    reg.incCounter('test_total', { key: 'value' });
    reg.reset();
    assert.equal(reg.getCounter('test_total', { key: 'value' }), 0);
  });

  await ok('K12: HISTOGRAM_BUCKETS 包含 11 个桶', () => {
    assert.equal(HISTOGRAM_BUCKETS.length, 11);
  });

  await ok('K13: HISTOGRAM_BUCKETS 递增', () => {
    for (let i = 1; i < HISTOGRAM_BUCKETS.length; i++) {
      assert.ok(HISTOGRAM_BUCKETS[i] > HISTOGRAM_BUCKETS[i - 1]);
    }
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
