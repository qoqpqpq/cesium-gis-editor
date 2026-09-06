// server/agent/protocol/parse.js
// AI agent 的工具调用协议：<tool>name(args)</tool>
//
// 这个协议源于 client/src/pages/gis/aiAgent.js + sandbox.js。本文件是
// Node 端（server/agent/）的 CommonJS 副本，与浏览器侧保持字面一致。
// 修改时务必同步 sandbox.js（或者反之）。
//
// 设计要点：
// - args 内不能含 ')' / '/' / '{' （sandbox 沙箱规则，对应 aiAgent.js:parseToolTags 的正则）
// - 流式未闭合时返回 pending（让 caller 决定要不要等）
// - 流式已完成部分也可能含 pending + 已完成 tools 的混合

const { randomUUID } = require('crypto');

const TOOL_RE = /<tool>([a-z_][a-z0-9_]*)\(([^)]*)\)<\/tool>/gi;

/**
 * 从文本中提取所有完整的工具调用
 * @param {string} text
 * @returns {{ tools: Array<{id, type, function: {name, arguments}, raw, index}>, pending: string|null }}
 */
function parseToolTags(text) {
  const tools = [];
  let m;
  TOOL_RE.lastIndex = 0;
  while ((m = TOOL_RE.exec(text)) !== null) {
    // 周期 1 P1-4: 用 crypto.randomUUID() 替代 Date.now() 拼接的 id，
    //   避免同一毫秒多个 tool 时 id 冲突
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
  const lastOpen = text.lastIndexOf('<tool>');
  const lastClose = text.lastIndexOf('</tool>');
  let pending = null;
  if (lastOpen > lastClose) pending = text.slice(lastOpen);
  return { tools, pending };
}

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
  for (let i = 0; i < s.length; i++) {
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

module.exports = { parseToolTags, parseArgs, TOOL_RE };