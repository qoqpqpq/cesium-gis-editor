// tests/specs/otel-sdk-spike.cjs
// 周期 11 P1-1: OpenTelemetry SDK 替换评估 spec

'use strict';

const path = require('path');
const fs = require('fs');

let pass = 0;
let fail = 0;

function assert(cond, name, detail) {
  const tag = cond ? 'PASS' : 'FAIL';
  process.stdout.write(`  [${tag}] ${name}${detail ? ' — ' + detail : ''}\n`);
  if (cond) pass += 1; else fail += 1;
}

(async () => {
  const root = path.resolve(__dirname, '..', '..');
  const docPath = path.join(root, 'docs/evaluation/otel-sdk-spike.md');
  process.stdout.write('\n=== otel-sdk-spike ===\n');

  assert(fs.existsSync(docPath), 'document exists', docPath);
  const content = fs.readFileSync(docPath, 'utf8');

  // 1) 文档结构
  assert(/^#\s+OpenTelemetry/m.test(content), 'H1 title present');
  assert(/周期.*11/m.test(content), 'cycle 11 referenced');
  assert(/MiniMax-M3/.test(content), 'MiniMax-M3 author');
  assert(/关联.*周期 10/m.test(content), 'cross-reference to cycle 10');

  // 2) 依赖体积分析
  assert(/@opentelemetry\/api/.test(content), 'OTel API package listed');
  assert(/@opentelemetry\/sdk-node/.test(content), 'sdk-node package listed');
  assert(/@opentelemetry\/exporter-trace-otlp-http/.test(content), 'OTLP exporter listed');
  assert(/~135KB|~45KB/.test(content), 'dependency size summarized');

  // 3) 自研基线
  assert(/自研 MetricsRegistry/.test(content), 'in-house registry referenced');
  assert(/telemetryCollector/.test(content), 'collector referenced');
  assert(/8KB/.test(content), 'in-house size ~8KB');

  // 4) API 兼容性矩阵
  assert(/Counter/.test(content), 'Counter mapping');
  assert(/Histogram/.test(content), 'Histogram mapping');
  assert(/Prometheus/.test(content), 'Prometheus mapping');
  assert(/OTLP/.test(content), 'OTLP mapping');
  assert(/localhost-only/.test(content), 'localhost-only mapping');
  assert(/sliding buffer/.test(content), 'sliding buffer mapping');

  // 5) 决策依据
  assert(/暂不替换/.test(content), 'defer decision stated');
  assert(/依赖增加 5x\+/.test(content), 'dependency cost rationale');
  assert(/90% 需求/.test(content), 'coverage rationale');

  // 6) 监控上游信号
  assert(/季度|月度/.test(content), 'monitoring cadence defined');
  assert(/distributed tracing/.test(content), 'future trigger identified');

  // 7) Spec 统计
  assert(/18 子断言 PASS/.test(content), 'spec stats declared');

  // 8) 当前 metrics 模块存在（验证文档化与代码一致）
  const metricsPath = path.join(root, 'server/middleware/metrics.js');
  assert(fs.existsSync(metricsPath), 'metrics.js exists');
  const telemetryCollectorPath = path.join(root, 'server/middleware/telemetryCollector.js');
  assert(fs.existsSync(telemetryCollectorPath), 'telemetryCollector.js exists');
  const telemetryRoutePath = path.join(root, 'server/routes/telemetry.js');
  assert(fs.existsSync(telemetryRoutePath), 'telemetry route exists');

  // 9) 关键导出函数
  const metricsCode = fs.readFileSync(metricsPath, 'utf8');
  assert(/MetricsRegistry/.test(metricsCode), 'MetricsRegistry class');
  assert(/toOtlpMetrics|otlp|OTLP/.test(metricsCode), 'OTLP exporter');
  assert(/metricsHandler/.test(metricsCode), 'Prometheus handler');

  const tcCode = fs.readFileSync(telemetryCollectorPath, 'utf8');
  assert(/recordClientError/.test(tcCode), 'recordClientError function');
  assert(/getClientErrorSummary/.test(tcCode), 'getClientErrorSummary function');
  assert(/DEFAULT_TTL_MS/.test(tcCode), 'TTL constant');

  process.stdout.write(`\n--- summary: pass=${pass} fail=${fail} ---\n`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(2);
});
