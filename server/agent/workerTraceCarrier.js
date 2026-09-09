// server/agent/workerTraceCarrier.js
// 周期 12 P1-3: Worker thread trace carrier 注入与恢复
//
// 背景：
//   - 周期 4 P1-1: server/middleware/logger.js 已实现 W3C traceparent + ALS 上下文
//   - 周期 11 调研 Top5 #4: oneuptime 2026-02 跨线程 context 恢复 + mcp-otel 嵌套 trace
//   - Node worker_threads 默认不继承 ALS context；本模块显式序列化/反序列化
//
// 设计：
//   - attachTraceToWorkerData(req, baseWorkerData)：从 req 提取 traceparent/requestId/parentSpanId
//     注入到 workerData._traceCarrier
//   - restoreTraceFromWorker(carrier)：在 worker 内部从 carrier 恢复 context；
//     返回 { traceparent, requestId, parentSpanId, traceId } 或 null
//   - runInTraceContext(carrier, fn)：worker 入口包装，自动 runWithRequestContext
//   - parseTraceCarrier(carrier)：防御性解析，缺字段返回 null
//
// 验收（tests/specs/worker-trace-carrier.cjs）：
//   - attach 写入字段正确
//   - restore 解析回 ALS 兼容对象
//   - carrier 缺失字段不抛错
//   - runInTraceContext 回调中可拿 context
//   - 多 worker 并发 trace 独立不串扰

'use strict';

const { parseTraceparent } = require('../middleware/logger');
const { runWithRequestContext } = require('../middleware/logger');

const CARRIER_KEY = '_traceCarrier';

/**
 * 从 req 提取 trace context 并附加到 workerData
 * @param {object} req - Express req
 * @param {object} [baseWorkerData] - 原始 workerData
 * @returns {object} 新 workerData（包含 _traceCarrier）
 */
function attachTraceToWorkerData(req, baseWorkerData = {}) {
  if (!req || typeof req !== 'object') return { ...baseWorkerData, [CARRIER_KEY]: null };
  const headers = req.headers || {};
  const carrier = {
    traceparent: headers.traceparent || null,
    requestId: headers['x-request-id'] || null,
    parentSpanId: null,
    traceId: null,
    ts: Date.now(),
  };
  if (carrier.traceparent) {
    try {
      const parsed = parseTraceparent(carrier.traceparent);
      if (parsed && typeof parsed === 'object') {
        carrier.traceId = parsed.traceId || null;
        carrier.parentSpanId = parsed.parentId || null;
      }
    } catch (_) {
      // ignore parse failure
    }
  }
  return { ...baseWorkerData, [CARRIER_KEY]: carrier };
}

/**
 * 防御性解析 carrier；缺字段或非对象返回 null
 * @param {any} carrier
 * @returns {object|null}
 */
function parseTraceCarrier(carrier) {
  if (!carrier || typeof carrier !== 'object') return null;
  // 必须是 plain object
  if (Array.isArray(carrier)) return null;
  return {
    traceparent: typeof carrier.traceparent === 'string' ? carrier.traceparent : null,
    requestId: typeof carrier.requestId === 'string' ? carrier.requestId : null,
    parentSpanId: typeof carrier.parentSpanId === 'string' ? carrier.parentSpanId : null,
    traceId: typeof carrier.traceId === 'string' ? carrier.traceId : null,
    ts: typeof carrier.ts === 'number' ? carrier.ts : Date.now(),
  };
}

/**
 * 从 workerData 取出 carrier 并恢复
 * @param {object} workerData
 * @returns {object|null}
 */
function restoreTraceFromWorker(workerData) {
  if (!workerData || typeof workerData !== 'object') return null;
  return parseTraceCarrier(workerData[CARRIER_KEY]);
}

/**
 * worker 入口包装：在 carrier context 内执行 fn
 * @param {any} carrier
 * @param {Function} fn - 在 context 内同步执行
 * @returns {*}
 */
function runInTraceContext(carrier, fn) {
  const ctx = parseTraceCarrier(carrier);
  if (!ctx || typeof fn !== 'function') {
    if (typeof fn === 'function') return fn();
    return undefined;
  }
  return runWithRequestContext(ctx, fn);
}

/**
 * 生成子 worker 调用所需的 traceparent（不重置 traceId，仅生成新 spanId）
 * @param {object} carrier
 * @returns {string|null}
 */
function childTraceparent(carrier) {
  const parsed = parseTraceCarrier(carrier);
  if (!parsed || !parsed.traceId) return null;
  // 16 hex
  const newSpanId = require('node:crypto').randomBytes(8).toString('hex');
  return `00-${parsed.traceId}-${newSpanId}-01`;
}

module.exports = {
  attachTraceToWorkerData,
  parseTraceCarrier,
  restoreTraceFromWorker,
  runInTraceContext,
  childTraceparent,
  CARRIER_KEY,
};