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
 * - localhost-only（IP 校验）；外部直接 403
 * - 输出 Prometheus 文本格式
 */
function metricsHandler(req, res) {
  const ip = (req.ip || (req.socket && req.socket.remoteAddress) || '').toString();
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!isLocal) {
    return res.status(403).json({ success: false, message: 'metrics 仅 localhost 可访问' });
  }
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(registry.toPrometheus());
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
  processMetricsCollector,
  HISTOGRAM_BUCKETS,
  MetricsRegistry,
};
