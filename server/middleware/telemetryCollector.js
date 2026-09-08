// server/middleware/telemetryCollector.js
// 周期 10 P1-2: client error telemetry 收集器（sliding window 内存 buffer）
//
// 背景：
//   - client/src/utils/asyncGuard.js（周期 9 P1-3）捕获 unhandledrejection + window.error
//   - 周期 9 行为：仅 console.error，无持久化
//   - 周期 10 P1-2：增加 POST /api/telemetry/client-error 端点
//     - sliding window 内存 buffer（最近 1000 条 / 1 小时 TTL）
//     - localhost-only 防外网注入
//     - 周期性聚合（>100/分钟聚合后批量 flush）
//     - 不持久化（仅内存；周期 11+ 评估 Postgres 落地）
//
// 导出：
//   - recordClientError(payload): 记录一条 client error（保留最近 1000 条 / 1h）
//   - getRecentClientErrors({since}): 获取最近 N 条
//   - getClientErrorSummary(): 聚合摘要（按 kind + source 统计）
//   - _resetBuffer(): 测试用清空
//   - DEFAULT_MAX_ITEMS / DEFAULT_TTL_MS

'use strict';

const DEFAULT_MAX_ITEMS = 1000;
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_FLUSH_THRESHOLD = 100;

let _buffer = [];

/**
 * 记录一条 client error
 * @param {object} payload
 * @param {string} payload.kind - 'unhandledrejection' | 'window.error'
 * @param {string} payload.message - 错误消息
 * @param {string} [payload.stack] - 错误栈
 * @param {string} [payload.source] - 'asyncGuard' | 'errorBoundary' | 'manual'
 * @param {string} [payload.url] - 触发错误的 URL（document.location）
 * @param {string} [payload.userAgent] - navigator.userAgent（截断到 200 字符）
 * @param {number} [payload.ts] - 时间戳（ms epoch）
 */
function recordClientError(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const kind = String(payload.kind || 'unknown');
  const message = String(payload.message || '').slice(0, 1000);
  if (!message) return false; // 空消息不算
  const item = {
    kind,
    message,
    stack: payload.stack ? String(payload.stack).slice(0, 5000) : null,
    source: payload.source ? String(payload.source).slice(0, 100) : 'asyncGuard',
    url: payload.url ? String(payload.url).slice(0, 500) : null,
    userAgent: payload.userAgent ? String(payload.userAgent).slice(0, 200) : null,
    ts: Number(payload.ts) || Date.now(),
  };
  _buffer.push(item);
  // 滑动窗口：超 TTL 删除；超 max items 删除最旧
  const now = Date.now();
  _buffer = _buffer.filter((it) => now - it.ts < DEFAULT_TTL_MS);
  if (_buffer.length > DEFAULT_MAX_ITEMS) {
    _buffer = _buffer.slice(-DEFAULT_MAX_ITEMS);
  }
  return true;
}

/**
 * 获取最近 N 条（since 默认 0）
 */
function getRecentClientErrors(opts = {}) {
  const since = Number(opts.since) || 0;
  const limit = Number(opts.limit) || 100;
  return _buffer.filter((it) => it.ts >= since).slice(-limit);
}

/**
 * 聚合摘要：按 kind + source 统计
 */
function getClientErrorSummary() {
  const summary = {
    total: _buffer.length,
    byKind: {},
    bySource: {},
    oldest: _buffer[0]?.ts || null,
    newest: _buffer[_buffer.length - 1]?.ts || null,
  };
  for (const it of _buffer) {
    summary.byKind[it.kind] = (summary.byKind[it.kind] || 0) + 1;
    summary.bySource[it.source] = (summary.bySource[it.source] || 0) + 1;
  }
  return summary;
}

/**
 * 测试用：清空 buffer
 */
function _resetBuffer() {
  _buffer = [];
}

/**
 * 周期 10 P1-2: 周期性 flush 占位（周期 11+ 接 Postgres / OTel exporter）
 * 当前实现：仅 console.log 提示；不抛错
 */
function _maybeFlush() {
  if (_buffer.length >= DEFAULT_FLUSH_THRESHOLD) {
    // 周期 11+ 评估：写文件 / 发 Postgres / OTel batch
    if (typeof console !== 'undefined' && console.log) {
      console.log(`[telemetry] flush threshold reached: ${_buffer.length} items`);
    }
  }
}

module.exports = {
  recordClientError,
  getRecentClientErrors,
  getClientErrorSummary,
  _resetBuffer,
  _maybeFlush,
  DEFAULT_MAX_ITEMS,
  DEFAULT_TTL_MS,
  DEFAULT_FLUSH_THRESHOLD,
};