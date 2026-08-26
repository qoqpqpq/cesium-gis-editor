// server/agent/protocol/format.js
// 工具结果回灌的格式工具 — 镜像 client/src/pages/gis/aiAgent.js:formatToolResult。
//
// 协议：
//   <<<TOOL_RESULT <name> OK>>>     ← 成功
//   <<<TOOL_RESULT <name> ERROR>>>   ← 失败
//   <body>
//   <<<END>>>
// 配套 SYSTEM_NOTE（重复检测 / 引导收尾）：
//   <<<SYSTEM_NOTE>>>
//   <body>
//   <<<END>>>

const TOOL_RESULT_RE = /^<<<TOOL_RESULT\s+([a-z_][a-z0-9_]*)\s+(OK|ERROR)>>>\n([\s\S]*?)\n<<<END>>>$/;

function formatToolResult(name, ok, result) {
  const tag = `<<<TOOL_RESULT ${name} ${ok ? 'OK' : 'ERROR'}>>>`;
  const end = '<<<END>>>';
  const body = typeof result === 'string' ? result : JSON.stringify(result, null, 0);
  return `${tag}\n${body}\n${end}`;
}

function formatSystemNote(body) {
  return `<<<SYSTEM_NOTE>>>\n${body}\n<<<END>>>`;
}

/**
 * 检测一段文本里最近一次 TOOL_RESULT / SYSTEM_NOTE 块的签名。
 * 给 runtime 做"重复工具调用"检测用 —— 不解析 args，只看 name + status。
 */
function lastToolSignature(text) {
  const m = text.match(TOOL_RESULT_RE);
  return m ? `${m[1]}:${m[2]}` : null;
}

module.exports = {
  formatToolResult,
  formatSystemNote,
  lastToolSignature,
  TOOL_RESULT_RE,
};