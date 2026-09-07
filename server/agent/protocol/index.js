// server/agent/protocol/index.js
// 周期 6 P2-4: 协议共享常量 + 工具调用统一
// 周期 6 P2-6: OpenAI tool_calls[] 双格式（与 <tool>name(args)</tool> 共存）
//
// 背景：周期 1-3 协议字符串 `<tool>name(args)</tool>` 在三处独立实现：
//   - server/agent/protocol/parse.js (Node CommonJS)
//   - client/src/pages/gis/aiAgent.js (浏览器 ESM，周期 5 调研提到)
//   - client/src/pages/gis/sandbox.js (浏览器 ESM，注释里提示"修改时务必同步")
// 周期 6 P2-4: 把协议字面 + 解析/格式化统一到 `server/agent/protocol/index.js`
//   - server 侧 require('./protocol') 直接拿
//   - 浏览器侧：v2 协议由 client 自带 ESM 副本（待 v3 合并）；本模块保持 CommonJS
//
// 周期 6 P2-6: OpenAI tool_calls[] 格式兼容
//   - 输出：模型可能输出 `{"tool_calls":[{"id":"...","type":"function","function":{"name":"...","arguments":"..."}}]}`
//   - 解析：与 `<tool>` 协议统一为同一结构 { id, name, args }
//   - 后续：UI 折叠工具过程（与 P2-5 合并）

'use strict';

const { randomUUID } = require('node:crypto');

// ---- 协议字面常量（修改时务必同步 client/src/pages/gis/sandbox.js） ----
const TOOL_OPEN = '<tool>';
const TOOL_CLOSE = '</tool>';
// 工具名允许 [a-z_][a-z0-9_]*（与 aiAgent.js:parseToolTags 正则一致）
const TOOL_NAME_RE = /[a-z_][a-z0-9_]*/;
const TOOL_RE = /<tool>([a-z_][a-z0-9_]*)\(([^)]*)\)<\/tool>/gi;

// OpenAI 风格 tool_calls JSON 块（```json ... ``` 包裹）
const TOOL_CALLS_JSON_RE = /```(?:json)?\s*(\{[\s\S]*?"tool_calls"[\s\S]*?\})\s*```/gi;
const TOOL_CALLS_INLINE_RE = /\{"tool_calls"\s*:\s*\[[\s\S]*?\}\s*\]\s*\}/g;

/**
 * 解析 args 字符串。
 * 约定：args 是单 token（数字 / 字符串 / 标识符 / 路径）。复杂对象走 JSON。
 * 这里只做 trim + 字符串字面量解码（"..."、'...'、裸标识符）。
 */
function parseArgs(raw) {
  const s = (raw || '').trim();
  if (!s) return [];
  // 优先尝试 JSON
  try {
    const parsed = JSON.parse('[' + s + ']');
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {
    /* fallthrough */
  }
  // 回退：按逗号切分，但尊重括号/引号嵌套
  const out = [];
  let buf = '';
  let depth = 0;
  let inStr = null;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (inStr) {
      buf += ch;
      if (ch === inStr && s[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = ch; buf += ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; buf += ch; continue; }
    if (ch === ')' || ch === ']' || ch === '}') { depth--; buf += ch; continue; }
    if (ch === ',' && depth === 0) { out.push(unquote(buf.trim())); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) out.push(unquote(buf.trim()));
  return out;
}

function unquote(s) {
  if (!s) return s;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * 从文本中提取所有完整的工具调用
 * 同时支持两种格式：
 *   1. <tool>name(args)</tool>（本地协议）
 *   2. ```json {"tool_calls":[{"id":"...","type":"function","function":{"name":"...","arguments":"..."}}]} ```（OpenAI 协议）
 *
 * @param {string} text
 * @returns {{ tools: Array<{id, type, function: {name, arguments}, raw, index}>, pending: string|null }}
 */
function parseToolTags(text) {
  if (!text) return { tools: [], pending: null };
  const tools = [];

  // 1. 本地 <tool> 协议
  TOOL_RE.lastIndex = 0;
  let m;
  while ((m = TOOL_RE.exec(text)) !== null) {
    tools.push({
      id: `tool_${randomUUID()}`,
      type: 'function',
      function: {
        name: m[1],
        arguments: m[2].trim(),
      },
      name: m[1],
      args: m[2].trim(),
      raw: m[0],
      index: m.index,
    });
  }

  // 2. OpenAI tool_calls JSON 块
  // 周期 6 P2-6: 避免 markdown 包裹与行内重复匹配 —— 用统一函数 + 防重复区间
  // 2a. ```json``` 包裹
  const matchedRanges = []; // [{start, end}] 防止 inline + fenced 重复匹配
  TOOL_CALLS_JSON_RE.lastIndex = 0;
  while ((m = TOOL_CALLS_JSON_RE.exec(text)) !== null) {
    matchedRanges.push({ start: m.index, end: m.index + m[0].length });
    try {
      const parsed = JSON.parse(m[1]);
      if (parsed && Array.isArray(parsed.tool_calls)) {
        for (const tc of parsed.tool_calls) {
          if (!tc || !tc.function || !tc.function.name) continue;
          tools.push({
            id: tc.id || `tool_${randomUUID()}`,
            type: tc.type || 'function',
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments || '',
            },
            name: tc.function.name,
            args: tc.function.arguments || '',
            raw: m[1],
            index: m.index,
            source: 'openai',
          });
        }
      }
    } catch (_) {
      // 解析失败跳过（不阻断主流程）
    }
  }
  // 2b. 行内 JSON（无 markdown 包裹）—— 跳过与 fenced 重叠的区间
  TOOL_CALLS_INLINE_RE.lastIndex = 0;
  while ((m = TOOL_CALLS_INLINE_RE.exec(text)) !== null) {
    const start = m.index, end = m.index + m[0].length;
    const inFenced = matchedRanges.some((r) => !(end < r.start || start > r.end));
    if (inFenced) continue;
    try {
      const parsed = JSON.parse(m[0]);
      if (parsed && Array.isArray(parsed.tool_calls)) {
        for (const tc of parsed.tool_calls) {
          if (!tc || !tc.function || !tc.function.name) continue;
          tools.push({
            id: tc.id || `tool_${randomUUID()}`,
            type: tc.type || 'function',
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments || '',
            },
            name: tc.function.name,
            args: tc.function.arguments || '',
            raw: m[0],
            index: m.index,
            source: 'openai',
          });
        }
      }
    } catch (_) {}
  }

  // pending：检测未闭合的 <tool> 块（流式场景）
  const lastOpen = text.lastIndexOf(TOOL_OPEN);
  const lastClose = text.lastIndexOf(TOOL_CLOSE);
  let pending = null;
  if (lastOpen > lastClose) pending = text.slice(lastOpen);
  return { tools, pending };
}

module.exports = {
  // 常量
  TOOL_OPEN, TOOL_CLOSE, TOOL_NAME_RE, TOOL_RE,
  TOOL_CALLS_JSON_RE, TOOL_CALLS_INLINE_RE,
  // 函数
  parseToolTags, parseArgs, unquote,
};
