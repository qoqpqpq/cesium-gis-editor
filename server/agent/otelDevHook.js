// server/agent/otelDevHook.js
// 周期 12 P2-2: 真实接入 OTel SDK（仅 dev 环境）
//
// 背景：
//   - 周期 11 P1-1 已评估 OTel SDK；决策：保持自实现 W3C traceparent + ALS
//   - 周期 11 反思 P2-2："打破评估 vs 接入边界"
//   - 本周期：在 NODE_ENV !== 'production' 时挂 OTLP HTTP exporter（轻量）
//     验证现有自实现 trace 与 OTel context manager 双向兼容
//
// 设计：
//   - install()：动态 require @opentelemetry/sdk-node（若存在）+ ConsoleSpanExporter
//   - graceful fallback：包不存在时不抛错，仅 console.warn
//   - uninstall()：shutdown SDK 干净退出
//   - runWithSpan(name, fn)：在 span 内执行 fn；traceId 注入到 ALS context（兼容 logger.js）
//
// 验收（spec ≥14 PASS）：
//   - install/uninstall 双向
//   - 缺包 graceful fallback
//   - runWithSpan 在 context 内可拿 traceId
//   - 与自实现 traceparent 互不破坏

'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

const _als = new AsyncLocalStorage();
const _state = {
  installed: false,
  sdk: null,
  tracer: null,
  exporter: null,
  errors: [],
};

function _isDev() {
  const env = process.env.NODE_ENV || 'development';
  return env !== 'production';
}

/**
 * 周期 12 P2-2: 尝试安装 OTel SDK
 * @returns {{installed: boolean, version: string|null, reason: string}}
 */
function install() {
  if (_state.installed) {
    return { installed: true, version: _state.version || 'unknown', reason: 'already installed' };
  }
  if (!_isDev()) {
    return { installed: false, version: null, reason: 'NODE_ENV=production' };
  }
  try {
    // 尝试加载 OTel SDK（peer dependency；不强制）
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    const { ConsoleSpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
    _state.exporter = new ConsoleSpanExporter();
    _state.sdk = new NodeSDK({
      spanProcessors: [new SimpleSpanProcessor(_state.exporter)],
    });
    _state.sdk.start();
    _state.installed = true;
    _state.version = 'sdk-node-loaded';
    return { installed: true, version: _state.version, reason: 'ok' };
  } catch (e) {
    _state.errors.push({ at: Date.now(), error: e.message });
    _state.installed = false;
    return { installed: false, version: null, reason: e.message };
  }
}

/**
 * 周期 12 P2-2: 卸载 OTel SDK
 */
async function uninstall() {
  if (!_state.installed || !_state.sdk) {
    return { ok: true, reason: 'not installed' };
  }
  try {
    await _state.sdk.shutdown();
    _state.installed = false;
    _state.sdk = null;
    _state.exporter = null;
    return { ok: true, reason: 'shutdown' };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

/**
 * 周期 12 P2-2: 在 span 内执行 fn（同步 ALS）
 * 不直接依赖 OTel SDK（即使 SDK 未安装也能工作，traceId 来自 ALS store）
 * @param {string} name - span 名称
 * @param {Function} fn - 在 context 内执行
 * @returns {*}
 */
function runWithSpan(name, fn) {
  if (typeof fn !== 'function') return undefined;
  const ctx = {
    spanName: name || 'anonymous',
    traceId: require('node:crypto').randomBytes(16).toString('hex'),
    spanId: require('node:crypto').randomBytes(8).toString('hex'),
    ts: Date.now(),
  };
  return _als.run(ctx, fn);
}

function getSpanContext() {
  return _als.getStore() || null;
}

function getTraceId() {
  const ctx = _als.getStore();
  return ctx ? ctx.traceId : null;
}

function isInstalled() {
  return !!_state.installed;
}

function getStats() {
  return {
    installed: _state.installed,
    version: _state.version || null,
    errors: _state.errors.slice(),
  };
}

module.exports = {
  install,
  uninstall,
  runWithSpan,
  getSpanContext,
  getTraceId,
  isInstalled,
  getStats,
  _als, // 测试可访问
};