// server/middleware/metrics.js
// 周期 6 P1-1: Otel-style Metrics 收集 + Prometheus 文本暴露
//
// 背景：周期 4 P1-1 实施 W3C traceparent（自研 trace）。
//   周期 6 P1-1 升级到 Otel 风格 Metrics：
//     - http_requests_total{method,route,status} (Counter)
//     - http_request_duration_seconds{method,route} (Histogram)
//   用自研轻量实现（不引入 prom-client），零依赖。
//   暴露端点 GET /api/metrics（Prometheus 文本格式）
//
// 设计：
//   - 内存 O(methods * routes * statuses)；Histogram 桶固定 [0.005..10s]
//   - 端点鉴权：localhost-only（与 /api/health 一致）
//   - 自带 unit test：tests/specs/otel-metrics.cjs
//
// 与 express metrics 中间件配合：
//   app.use(httpMetricsMiddleware());           // 计数 + 直方图
//   app.get('/api/metrics', metricsHandler);   // 暴露

'use strict';

const { performance } = require('node:perf_hooks');

// Histogram 桶（Prometheus 默认 + 周期 6 P1-1 选段，单位秒）
const HISTOGRAM_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/**
 * 自研轻量 metrics registry
 * - counters: Map<name, Map<labelsHash, value>>
 * - histograms: Map<name, Map<labelsHash, {buckets, count, sum}>>
 */
class MetricsRegistry {
  constructor() {
    this.counters = new Map();
    this.histograms = new Map();
  }

  // ---- Counter ----
  incCounter(name, labels = {}, value = 1) {
    let m = this.counters.get(name);
    if (!m) { m = new Map(); this.counters.set(name, m); }
    const k = labelsKey(labels);
    m.set(k, (m.get(k) || 0) + value);
  }

  getCounter(name, labels) {
    const m = this.counters.get(name);
    if (!m) return 0;
    return m.get(labelsKey(labels)) || 0;
  }

  // ---- Histogram ----
  observeHistogram(name, labels, value) {
    let m = this.histograms.get(name);
    if (!m) { m = new Map(); this.histograms.set(name, m); }
    const k = labelsKey(labels);
    let h = m.get(k);
    if (!h) {
      h = {
        buckets: new Array(HISTOGRAM_BUCKETS.length).fill(0),
        count: 0,
        sum: 0,
        labels,
      };
      m.set(k, h);
    }
    for (let i = 0; i < HISTOGRAM_BUCKETS.length; i += 1) {
      if (value <= HISTOGRAM_BUCKETS[i]) h.buckets[i] += 1;
    }
    h.count += 1;
    h.sum += value;
  }

  /**
   * 序列化为 Prometheus 文本格式
   */
  toPrometheus() {
    const lines = [];
    // Counters — value 是 number，labels 从 key 反解
    for (const [name, m] of this.counters.entries()) {
      lines.push(`# TYPE ${name} counter`);
      for (const [k, v] of m.entries()) {
        const labels = labelsFromKey(k);
        lines.push(`${name}${formatLabels(labels)} ${v}`);
      }
    }
    // Histograms
    for (const [name, m] of this.histograms.entries()) {
      lines.push(`# TYPE ${name} histogram`);
      for (const h of m.values()) {
        const labels = h.labels || {};
        for (let i = 0; i < HISTOGRAM_BUCKETS.length; i += 1) {
          const bucketLabels = { ...labels, le: String(HISTOGRAM_BUCKETS[i]) };
          lines.push(`${name}_bucket${formatLabels(bucketLabels)} ${h.buckets[i]}`);
        }
        // +Inf bucket
        const infLabels = { ...labels, le: '+Inf' };
        lines.push(`${name}_bucket${formatLabels(infLabels)} ${h.count}`);
        lines.push(`${name}_count${formatLabels(labels)} ${h.count}`);
        lines.push(`${name}_sum${formatLabels(labels)} ${h.sum.toFixed(6)}`);
      }
    }
    return lines.join('\n') + '\n';
  }

  reset() {
    this.counters.clear();
    this.histograms.clear();
  }

  /**
   * 周期 7 P0-4: 序列化为 OTLP/HTTP JSON metrics
   * - 输出符合 OTLP 1.5+ 规范（resourceMetrics[].scopeMetrics[].metrics[]）
   * - 与 toPrometheus() 数据来源一致（同一 registry），保证两种端点数据等价
   * - Counter → Sum { dataPoints: [{asInt, attributes, timeUnixNano}] }
   * - Histogram → Histogram { dataPoints: [{bucketCounts, explicitBounds, sum, count, attributes, timeUnixNano}] }
   * - 默认 scope: { name: 'cesium-gis-editor', version: '1.0.0' }
   * - 默认 resource: { service.name: 'cesium-gis-editor-server' }
   *
   * 注意：本项目不直接 push OTLP（避免外部依赖）；周期 7+ 评估 Jaeger / Tempo 接入
   *   时加 OTLP exporter 周期（基于本 toOtlpMetrics）。
   */
  toOtlpMetrics(opts = {}) {
    const scopeName = opts.scopeName || 'cesium-gis-editor';
    const scopeVersion = opts.scopeVersion || '1.0.0';
    const serviceName = opts.serviceName || 'cesium-gis-editor-server';
    const timeUnixNano = String(opts.timeUnixNano || Date.now() * 1_000_000);

    const otlpMetrics = [];

    // Counter → Sum (monotonic=true)
    for (const [name, m] of this.counters.entries()) {
      const dataPoints = [];
      for (const [k, v] of m.entries()) {
        const attrs = labelsToAttributes(labelsFromKey(k));
        dataPoints.push({
          asInt: String(Math.round(v)),
          attributes: attrs,
          timeUnixNano,
        });
      }
      otlpMetrics.push({
        name: stripCounterSuffix(name),
        sum: {
          aggregationTemporality: 2, // AGGREGATION_TEMPORALITY_CUMULATIVE
          isMonotonic: true,
          dataPoints,
        },
      });
    }

    // Histogram → Histogram (bucket counts + explicit bounds)
    for (const [name, m] of this.histograms.entries()) {
      const dataPoints = [];
      for (const h of m.values()) {
        const attrs = labelsToAttributes(h.labels || {});
        dataPoints.push({
          bucketCounts: h.buckets.map(String),
          explicitBounds: HISTOGRAM_BUCKETS.map(String),
          sum: h.sum,
          count: String(h.count),
          attributes: attrs,
          timeUnixNano,
        });
      }
      otlpMetrics.push({
        name: stripHistogramSuffix(name),
        histogram: {
          aggregationTemporality: 2,
          dataPoints,
        },
      });
    }

    return {
      resourceMetrics: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: serviceName } },
            ],
          },
          scopeMetrics: [
            {
              scope: { name: scopeName, version: scopeVersion },
              metrics: otlpMetrics,
            },
          ],
        },
      ],
    };
  }
}

function stripCounterSuffix(name) {
  // OpenTelemetry 规范：counter 名称不应以 _total 结尾（避免双 total）
  // 但 Prometheus 规范要求 _total 后缀；保留两者映射
  return name.endsWith('_total') ? name.slice(0, -'_total'.length) : name;
}

function stripHistogramSuffix(name) {
  // histogram 名称一般 _seconds / _bytes / _size 等；本项目 _seconds；保留
  return name;
}

function labelsToAttributes(labels) {
  const keys = Object.keys(labels);
  if (keys.length === 0) return [];
  return keys.map((k) => ({
    key: k,
    value: { stringValue: String(labels[k]) },
  }));
}

function labelsKey(labels) {
  // 稳定排序 → JSON
  const keys = Object.keys(labels).sort();
  return JSON.stringify(keys.map((k) => [k, labels[k]]));
}

function labelsFromKey(k) {
  try {
    return Object.fromEntries(JSON.parse(k));
  } catch (_) {
    return {};
  }
}

function formatLabels(labels) {
  const keys = Object.keys(labels);
  if (keys.length === 0) return '';
  const parts = keys.map((k) => {
    const v = String(labels[k]).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
    return `${k}="${v}"`;
  });
  return `{${parts.join(',')}}`;
}

// 单例 registry（整个进程共享）
const registry = new MetricsRegistry();

/**
 * 周期 8 P1-4: 解析 METRICS_TRUSTED_CIDRS 环境变量
 * - 格式：逗号分隔 CIDR 列表，如 "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
 * - 留空 / 未设 → 仅 localhost 可访问（默认最严）
 * - 设值后 → localhost + 配置的 CIDR 都放行
 *
 * 周期 8 范围：仅 IPv4 CIDR；IPv6 通过纯字符串匹配（/::1 / /fc00::/7 段）
 *   暂不引入 ipaddr.js 依赖；保持零依赖（避免新依赖阻塞）
 */
function parseTrustedCidrs(envValue) {
  if (!envValue || typeof envValue !== 'string') return [];
  return envValue.split(',').map((s) => s.trim()).filter(Boolean);
}

let _trustedCidrsCache = null;
function getTrustedCidrs() {
  if (_trustedCidrsCache !== null) return _trustedCidrsCache;
  _trustedCidrsCache = parseTrustedCidrs(process.env.METRICS_TRUSTED_CIDRS);
  return _trustedCidrsCache;
}

// 测试 helper：清空缓存
function _resetTrustedCidrsCache() {
  _trustedCidrsCache = null;
}

/**
 * 周期 8 P1-4: IPv4 CIDR 匹配（零依赖）
 * - 仅支持 IPv4（IPv6 暂不解析 CIDR）
 * - 使用字符串前缀匹配 + 简化 IPv4 → 32-bit number 比较
 * - 边界包含（10.0.0.5/24 应匹配 10.0.0.0/24）
 */
function ipv4ToInt(ip) {
  if (!ip || typeof ip !== 'string') return null;
  // 处理 IPv4-mapped IPv6: ::ffff:127.0.0.1
  const m = ip.match(/(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i);
  if (!m) return null;
  const [a, b, c, d] = [m[1], m[2], m[3], m[4]].map((x) => parseInt(x, 10));
  if (a > 255 || b > 255 || c > 255 || d > 255) return null;
  return ((a * 256 + b) * 256 + c) * 256 + d;
}

function matchIpv4Cidr(ip, cidr) {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return false;
  const [base, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  if (!Number.isFinite(bits) || bits < 0 || bits > 32) return false;
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;
  if (bits === 0) return true;
  const mask = (~((1 << (32 - bits)) - 1)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/**
 * 周期 8 P1-4: 检查 IP 是否被 metrics 端点放行
 * - localhost (127.0.0.1 / ::1 / ::ffff:127.0.0.1) → 始终放行
 * - METRICS_TRUSTED_CIDRS 配置的 CIDR → 放行
 * - 其他 → 拒绝 403
 */
function isMetricsTrusted(ip) {
  if (!ip) return false;
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return true;
  const cidrs = getTrustedCidrs();
  if (cidrs.length === 0) return false;
  for (const cidr of cidrs) {
    if (matchIpv4Cidr(ip, cidr)) return true;
  }
  return false;
}

/**
 * 周期 6 P1-1: HTTP metrics middleware
 * - 计数：http_requests_total{method,route,status}
 * - 直方图：http_request_duration_seconds{method,route}
 * - route：从 req.route.path 拿（Express 路由）；无路由时用 originalUrl 第一段
 */
function httpMetricsMiddleware() {
  return function metricsMw(req, res, next) {
    const start = performance.now();
    res.on('finish', () => {
      const dur = (performance.now() - start) / 1000; // 秒
      const route = (req.route && req.route.path)
        ? (req.baseUrl || '') + req.route.path
        : (req.originalUrl || '/').split('?')[0] || 'unknown';
      const labels = {
        method: req.method,
        route,
        status: String(res.statusCode),
      };
      registry.incCounter('http_requests_total', labels, 1);
      registry.observeHistogram('http_request_duration_seconds', { method: req.method, route }, dur);
    });
    next();
  };
}

/**
 * 周期 6 P1-1: /api/metrics handler
 * - localhost-only 默认；周期 8 P1-4 加 METRICS_TRUSTED_CIDRS（RFC1918 + 共享 loopback）
 * - 输出 Prometheus 文本格式
 */
function metricsHandler(req, res) {
  const ip = (req.ip || (req.socket && req.socket.remoteAddress) || '').toString();
  if (!isMetricsTrusted(ip)) {
    return res.status(403).json({ success: false, message: 'metrics 仅 localhost / METRICS_TRUSTED_CIDRS 可访问' });
  }
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(registry.toPrometheus());
}

/**
 * 周期 7 P0-4: /api/otlp/metrics handler
 * - 输出 OTLP/HTTP JSON 格式（与 /api/metrics 数据等价）
 * - localhost-only 默认；周期 8 P1-4 加 METRICS_TRUSTED_CIDRS
 * - Content-Type: application/json（OTLP collector 默认接受 application/json）
 *
 * 与 metricsHandler 的区别：
 *   - format：Prometheus 文本 vs OTLP JSON
 *   - 端点：/api/metrics vs /api/otlp/metrics
 *   - 用途：本地抓取 vs OTLP collector push（周期 8+ 评估 Jaeger / Tempo）
 */
function metricsOtlpHandler(req, res) {
  const ip = (req.ip || (req.socket && req.socket.remoteAddress) || '').toString();
  if (!isMetricsTrusted(ip)) {
    return res.status(403).json({ success: false, message: 'metrics 仅 localhost / METRICS_TRUSTED_CIDRS 可访问' });
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(registry.toOtlpMetrics()));
}

/**
 * 周期 6 P1-1: 进程级 metrics（启动时间 / 内存 / Node 版本）
 * - 用于 /api/metrics 暴露运行时信息
 */
function processMetricsCollector() {
  // 周期 6 P1-1: 进程级 counter
  registry.incCounter('process_start_time_seconds', {}, Math.floor(Date.now() / 1000));
}

module.exports = {
  registry,
  httpMetricsMiddleware,
  metricsHandler,
  metricsOtlpHandler,
  processMetricsCollector,
  HISTOGRAM_BUCKETS,
  MetricsRegistry,
  // 周期 8 P1-4: CIDR 白名单
  isMetricsTrusted,
  getTrustedCidrs,
  parseTrustedCidrs,
  matchIpv4Cidr,
  ipv4ToInt,
  _resetTrustedCidrsCache,
};
