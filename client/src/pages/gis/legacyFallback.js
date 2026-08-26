// client/src/pages/gis/legacyFallback.js
// phase-7：判定 SSE 流的 XHR 结果是否需要 fallback 到老端点（/api/ai/chat/stream）
//
// 抽成独立模块：
//   1. 零依赖（不引用任何 ESM-only 模块），方便 tests/phase-7-stream-fallback.spec.cjs 直接 require
//   2. 纯函数语义清晰，便于单元测试覆盖所有边界
//
// 触发条件（任一）：
//   - xhr.status === 404：老后端没这个端点
//   - xhr.status === 405：路由不接收 POST
//   - xhr.status === 0 + readyState === 4：网络层失败（CORS / DNS / 服务端拒绝连接 / 超时）
//
// 不触发：
//   - 5xx（服务端逻辑错，保留原 onerror 提示；不能吞错）
//   - 401/403（认证失败，fallback 没意义）
//   - status 200 + 解析异常（响应体不完整，应该走 done/error 事件处理）

export function shouldFallbackToLegacy(xhrStatus, readyState) {
  if (xhrStatus === 404 || xhrStatus === 405) return true;
  if (xhrStatus === 0 && readyState === 4) return true;
  return false;
}

// 测试用导出：fallback 候选状态集合
export const FALLBACK_STATUSES = new Set([404, 405]);

// 测试用导出：fallback 不应触发的状态集合（防误伤回归）
export const NON_FALLBACK_STATUSES = new Set([200, 400, 401, 403, 500, 502, 503]);