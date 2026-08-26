// server/utils/redact.js
// 共享的密钥 redact 工具。
// 在 server/index.js 与 server/agent/observability/trace.js 之间共用，避免在
// AI agent 的 transcript / 日志 / PR 评论里泄露 API key / GitHub PAT 等。
//
// 用法：
//   const { redactSecret } = require('../utils/redact');
//   const safe = redactSecret(text);

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bghp_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bkey=[A-Za-z0-9._-]{16,}/gi,
  /\bapi[_-]?key[=:]\s*[A-Za-z0-9._-]{16,}/gi,
];

function redactSecret(text) {
  if (!text || typeof text !== "string") return text;
  let out = text;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "***redacted***");
  return out;
}

// 递归 redact：对象 / 数组里的字符串字段全部脱敏
function redactDeep(value) {
  if (typeof value === "string") return redactSecret(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v);
    return out;
  }
  return value;
}

module.exports = { redactSecret, redactDeep, SECRET_PATTERNS };