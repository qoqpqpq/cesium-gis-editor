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

/**
 * 周期 13 P1-1: worker 入口包装
 * 在 carrier context 内执行 fn（从 workerData._traceCarrier 恢复 traceparent）
 * @param {object} carrier
 * @param {Function} fn
 * @returns {*}
 */
function withWorkerContext(carrier, fn) {
  if (typeof fn !== 'function') return undefined;
  if (!carrier || typeof carrier !== 'object' || !carrier.traceparent) {
    return fn();
  }
  // 尝试从 traceparent 解析 traceId（32+16+2 hex）
  let parsedTraceId = carrier.traceId || null;
  if (!parsedTraceId && typeof carrier.traceparent === 'string') {
    const m = carrier.traceparent.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})/i);
    if (m) parsedTraceId = m[1];
  }
  if (!parsedTraceId) parsedTraceId = require('node:crypto').randomBytes(16).toString('hex');
  const ctx = {
    spanName: 'worker:anonymous',
    traceId: parsedTraceId,
    spanId: require('node:crypto').randomBytes(8).toString('hex'),
    parentId: carrier.parentSpanId || null,
    traceparent: carrier.traceparent,
    requestId: carrier.requestId || null,
    ts: Date.now(),
  };
  return _als.run(ctx, fn);
}

/**
 * 周期 13 P1-1: 导出 W3C traceparent（从当前 ALS store 生成新 spanId）
 * @returns {string|null}
 */
function getCurrentTraceparent() {
  const ctx = _als.getStore();
  if (!ctx) return null;
  const traceId = ctx.traceId;
  if (!traceId) return null;
  const spanId = require('node:crypto').randomBytes(8).toString('hex');
  return `00-${traceId}-${spanId}-01`;
}

// ---- 周期 14 P1-1: worker SDK 安装 + LLM semantic span ----

/**
 * 周期 14 P1-1: 在 worker 入口尝试安装 OTel SDK
 * - 自动 install()；缺包 graceful fallback（与 install() 行为一致）
 * - 返回 worker scope 的 trace context
 * @param {object} carrier - { traceId?, traceparent?, requestId? }
 * @returns {{ installed: boolean, sdkLoaded: boolean, traceId: string, reason: string }}
 */
function installWorkerSdk(carrier) {
  const installResult = install();
  let traceId = carrier && carrier.traceId;
  if (!traceId && carrier && typeof carrier.traceparent === 'string') {
    const m = carrier.traceparent.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})/i);
    if (m) traceId = m[1];
  }
  if (!traceId) traceId = require('node:crypto').randomBytes(16).toString('hex');
  return {
    installed: installResult.installed,
    sdkLoaded: installResult.installed,
    traceId,
    reason: installResult.reason,
  };
}

/**
 * 周期 14 P1-1: LLM semantic span attribute 收集
 * OpenTelemetry GenAI semantic conventions（2026）：
 *   - gen_ai.system: 'openai' | 'anthropic' | 'claude' | 'gemini' | ...
 *   - gen_ai.request.model
 *   - gen_ai.usage.input_tokens
 *   - gen_ai.usage.output_tokens
 *   - gen_ai.response.finish_reason
 *   - llm.platform (本项目扩展)
 *   - llm.prompt_tokens / llm.completion_tokens
 *
 * @param {object} opts - { platform, model, messages, response, usage, finishReason }
 * @returns {object} span attributes
 */
function buildLlmSpanAttributes(opts) {
  const o = opts || {};
  const attrs = {};
  if (o.platform) {
    attrs['gen_ai.system'] = o.platform;
    attrs['llm.platform'] = o.platform;
  }
  if (o.model) {
    attrs['gen_ai.request.model'] = o.model;
    attrs['llm.model'] = o.model;
  }
  if (o.messages && Array.isArray(o.messages)) {
    attrs['gen_ai.request.message_count'] = o.messages.length;
  }
  if (o.usage) {
    if (typeof o.usage.prompt_tokens === 'number') {
      attrs['gen_ai.usage.input_tokens'] = o.usage.prompt_tokens;
      attrs['llm.prompt_tokens'] = o.usage.prompt_tokens;
    }
    if (typeof o.usage.completion_tokens === 'number') {
      attrs['gen_ai.usage.output_tokens'] = o.usage.completion_tokens;
      attrs['llm.completion_tokens'] = o.usage.completion_tokens;
    }
    if (typeof o.usage.total_tokens === 'number') {
      attrs['gen_ai.usage.total_tokens'] = o.usage.total_tokens;
    }
  }
  if (o.finishReason) {
    attrs['gen_ai.response.finish_reason'] = o.finishReason;
  }
  if (typeof o.elapsedMs === 'number') {
    attrs['llm.elapsed_ms'] = o.elapsedMs;
  }
  return attrs;
}

/**
 * 周期 14 P1-1: 在 runWithSpan 内执行 fn，并附 LLM semantic attributes
 * @param {string} name
 * @param {Function} fn
 * @param {object} llmAttrs - buildLlmSpanAttributes() 输出
 * @returns {*}
 */
function runWithLlmSpan(name, fn, llmAttrs) {
  return runWithSpan(name, () => {
    const ctx = _als.getStore();
    if (ctx && llmAttrs && typeof llmAttrs === 'object') {
      ctx.llmAttributes = Object.assign({}, ctx.llmAttributes || {}, llmAttrs);
    }
    return fn();
  });
}

/**
 * 周期 14 P1-1: 取出当前 span 的 LLM attributes（用于 exporter）
 * @returns {object|null}
 */
function getCurrentLlmAttributes() {
  const ctx = _als.getStore();
  return (ctx && ctx.llmAttributes) || null;
}

/**
 * 周期 14 P1-1: 重置 _state（仅测试使用）
 */
function _resetState() {
  _state.installed = false;
  _state.sdk = null;
  _state.tracer = null;
  _state.exporter = null;
  _state.errors = [];
}

module.exports = {
  install,
  uninstall,
  runWithSpan,
  getSpanContext,
  getTraceId,
  isInstalled,
  getStats,
  withWorkerContext,           // 周期 13 P1-1：worker 入口包装
  getCurrentTraceparent,       // 周期 13 P1-1：导出 W3C traceparent
  installWorkerSdk,            // 周期 14 P1-1：worker SDK 安装
  buildLlmSpanAttributes,      // 周期 14 P1-1：LLM semantic attributes
  runWithLlmSpan,              // 周期 14 P1-1：附 LLM span 执行
  getCurrentLlmAttributes,     // 周期 14 P1-1：取出当前 LLM attrs
  _als,                        // 测试可访问
  _state,                      // 测试可访问
  _resetState,                 // 周期 14 P1-1：测试 reset
};