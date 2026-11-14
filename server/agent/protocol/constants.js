// server/agent/protocol/constants.js
// 周期 16 R2: 协议常量统一导出
// 供 client/src/pages/gis/sandbox.js 和 server/agent/protocol/index.js 共享
//
// 背景：
// - 周期 6 P2-4: 协议字面 + 解析已抽到 ./index.js
// - 周期 16 R2: 进一步抽出常量，供 client/server 两端共享
// - 修改此文件时，必须运行 scripts/check-protocol-sync.cjs 验证同步

'use strict';

// ---- 协议字面常量（修改时务必同步 client/src/pages/gis/sandbox.js） ----
const TOOL_OPEN = '<tool>';
const TOOL_CLOSE = '</tool>';
const TOOL_NAME_RE = /[a-z_][a-z0-9_]*/;
const TOOL_RE = /<tool>([a-z_][a-z0-9_]*)\(([^)]*)\)<\/tool>/gi;

// OpenAI 风格 tool_calls JSON 块
const TOOL_CALLS_JSON_RE = /```(?:json)?\s*(\{[\s\S]*?"tool_calls"[\s\S]*?\})\s*```/gi;
const TOOL_CALLS_INLINE_RE = /\{"tool_calls"\s*:\s*\[[\s\S]*?\}\s*\]\s*\}/g;

// cycle-18 fallback: OpenAI 风格 <tool_call>{json}</...>
const TOOL_CALL_JSON_RE = /<\u200b?tool_call>\s*(\{[\s\S]*?\})\s*<\/\u200b?tool_call>/gi;

module.exports = {
  TOOL_OPEN,
  TOOL_CLOSE,
  TOOL_NAME_RE,
  TOOL_RE,
  TOOL_CALLS_JSON_RE,
  TOOL_CALLS_INLINE_RE,
  TOOL_CALL_JSON_RE,
};
