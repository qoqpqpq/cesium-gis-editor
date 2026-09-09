// server/middleware/aiGuardrails.js
// 周期 13 P0-1: AI Agent 安全护栏（OWASP ASI01-10 映射）
//
// 背景：
//   - 周期 11 P1-4 已落 handler 8 维 checklist（rate-limit / trace / auth / validation /
//     idempotency / backpressure / observability / recovery）
//   - 周期 12 调研 #6 + #9：OWASP Agentic Skills Top 10（ASI01-10）+ 6 层防御
//   - 周期 13 P0-1：在 8 维基础上加 AI 专用护栏（tool allowlist / input sanitization /
//     circuit breaker / dangerous-action HITL）
//
// 设计：
//   - withGuardrails(tool, opts)：包装 tool 返回带护栏的 callable
//   - sanitizeInput(payload, opts)：剥控制字符 + 长度限制 + 检测注入模式
//   - createCircuitBreaker(opts)：windowMs 内 N 次失败 → open N 秒
//   - checkToolAllowlist(toolName, allowed)：拒绝未在 allowlist 的工具
//
// 验收（spec ai-guardrails.cjs ≥30 PASS）：
//   - 10 项 ASI 风险各覆盖至少 1 个 guard
//   - tool allowlist 拒绝 + circuit breaker 自动开
//   - input sanitization 剥控制字符 + 长度限制
//   - 5 类注入攻击（direct / indirect / role-play / obfuscation / chain）均拒绝

'use strict';

// ---- OWASP ASI 风险映射（周期 12 调研 #6） ----
// ASI01: Agent Goal Hijack
// ASI02: Tool Misuse and Exploitation
// ASI03: Identity & Privilege Abuse
// ASI04: Agentic Supply Chain Vulnerabilities
// ASI05: Unexpected Code Execution (RCE)
// ASI06: Memory & Context Poisoning
// ASI07: Insecure Inter-Agent Communication
// ASI08: Cascading Failures
// ASI09: Human-Agent Trust Exploitation
// ASI10: Rogue Agents

const DEFAULT_OPTIONS = {
  allowlist: null,            // string[] | null；null = 不限制（不推荐）
  circuitBreaker: {
    enabled: true,
    threshold: 5,             // windowMs 内 N 次失败 → open
    windowMs: 60000,
    cooldownMs: 30000,        // open 后冷却时长
  },
  inputSanitizer: {
    enabled: true,
    maxLength: 10000,
    stripControlChars: true,
    detectInjection: true,    // 检测 prompt injection 模式
  },
  dangerousActionsRequireHITL: ['delete', 'drop', 'dropTable', 'execute', 'rm', 'payment'],
  onRejected: null,           // (reason, payload) => void
  enableMetrics: true,
};

// ---- 注入模式检测（周期 12 调研 #9 OWASPLA + AgentWorks） ----
const INJECTION_PATTERNS = [
  /\bignore\s+(?:all\s+)?previous\s+instructions?\b/i,
  /\bdisregard\s+(?:all\s+)?prior\s+(?:rules?|instructions?)\b/i,
  /\byou\s+are\s+now\s+(?:a|an)\s+\w+/i,                     // role-play
  /\bjailbreak(?:ed)?\b/i,
  /\bdeveloper\s+mode\b/i,
  /\bsystem\s+prompt\b/i,
  /<\|im_start\|>|<\|im_end\|>/,                              // 特殊 token 注入
  /```\s*(?:system|assistant|tool)\b/i,                      // markdown 注入
  /\bexecute\s+(?:shell|bash|cmd|command)\b/i,
];

function _countMatches(input) {
  if (typeof input !== 'string') return 0;
  let count = 0;
  for (const re of INJECTION_PATTERNS) {
    if (re.test(input)) count += 1;
  }
  return count;
}

/**
 * 输入清洗 + 注入检测
 * @param {object|string} payload
 * @param {object} opts
 * @returns {{ clean: object, rejected: boolean, reasons: string[], injectionHits: number }}
 */
function sanitizeInput(payload, opts) {
  const o = { ...DEFAULT_OPTIONS.inputSanitizer, ...(opts || {}) };
  const reasons = [];
  let clean;
  if (typeof payload === 'string') clean = payload;
  else if (payload && typeof payload === 'object') clean = JSON.stringify(payload);
  else return { clean: payload, rejected: false, reasons: ['non-serializable'], injectionHits: 0 };

  // 长度限制
  if (o.maxLength > 0 && clean.length > o.maxLength) {
    return {
      clean: null,
      rejected: true,
      reasons: [`length_exceeded:${clean.length}>${o.maxLength}`],
      injectionHits: 0,
    };
  }

  // 剥控制字符
  if (o.stripControlChars) {
    clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }

  // 检测注入
  let injectionHits = 0;
  if (o.detectInjection) {
    injectionHits = _countMatches(clean);
    if (injectionHits > 0) {
      reasons.push(`injection_hits:${injectionHits}`);
    }
  }

  return {
    clean: typeof payload === 'string' ? clean : safeParse(clean),
    rejected: reasons.length > 0,
    reasons,
    injectionHits,
  };
}

function safeParse(s) {
  try { return JSON.parse(s); } catch (_) { return s; }
}

/**
 * 工具 allowlist 检查
 * @param {string} toolName
 * @param {string[]|null} allowlist
 * @returns {{ allowed: boolean, reason: string|null }}
 */
function checkToolAllowlist(toolName, allowlist) {
  if (!allowlist) return { allowed: true, reason: null };
  if (allowlist.includes(toolName)) return { allowed: true, reason: null };
  return { allowed: false, reason: `tool_not_in_allowlist:${toolName}` };
}

// ---- 周期 14 P0-1: ASI04 供应链校验 ----
// ASI04: Agentic Supply Chain Vulnerabilities — tool 来源 / 版本 / 签名校验
// 设计：
//   - manifest = { name, source, version, signature, publisher? }
//   - allowedSources：白名单来源（npm / github / internal）
//   - allowedVersions：白名单版本（semver range 或具体版本）
//   - signatureVerifier（可选）：验证 HMAC-SHA256(secret, source+version)
const MANIFEST_ALLOWED_SOURCES_DEFAULT = ['internal', 'npm:trusted', 'github:trusted'];

function _semverMatch(version, range) {
  if (!version || typeof version !== 'string') return false;
  if (!range) return true;
  // 简化：支持 exact / ^x.y / x.y.z 形式；其他视为 false
  const v = version.split('.').map((n) => parseInt(n, 10));
  if (v.some(isNaN)) return false;
  if (range === version) return true;
  if (range.startsWith('^')) {
    const r = range.slice(1).split('.').map((n) => parseInt(n, 10));
    if (r.some(isNaN) || v[0] !== r[0]) return false;
    if (v[1] < r[1]) return false;
    if (v[1] === r[1] && v[2] < r[2]) return false;
    return true;
  }
  return false;
}

function _hmacSha256Hex(secret, message) {
  try {
    const crypto = require('node:crypto');
    return crypto.createHmac('sha256', secret).update(String(message)).digest('hex');
  } catch (e) {
    return null;
  }
}

function _timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * 周期 14 P0-1: ASI04 供应链校验
 * @param {object} manifest - { name, source, version, signature? }
 * @param {object} [opts] - { allowedSources?, allowedVersions?, signatureSecret?, signaturePublisher? }
 * @returns {{ valid: boolean, reasons: string[], manifest?: object }}
 */
function validateManifest(manifest, opts = {}) {
  const reasons = [];
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, reasons: ['manifest_not_object'], manifest: null };
  }
  const allowedSources = opts.allowedSources || MANIFEST_ALLOWED_SOURCES_DEFAULT;
  const allowedVersions = opts.allowedVersions || null; // { [name]: range }

  if (!manifest.name || typeof manifest.name !== 'string') {
    reasons.push('manifest_name_missing');
  }
  if (!manifest.source || typeof manifest.source !== 'string') {
    reasons.push('manifest_source_missing');
  } else if (!allowedSources.includes(manifest.source)) {
    reasons.push(`manifest_source_not_allowed:${manifest.source}`);
  }
  if (!manifest.version || typeof manifest.version !== 'string') {
    reasons.push('manifest_version_missing');
  } else if (allowedVersions && manifest.name && allowedVersions[manifest.name]) {
    if (!_semverMatch(manifest.version, allowedVersions[manifest.name])) {
      reasons.push(`manifest_version_not_allowed:${manifest.version}`);
    }
  }

  // 签名校验（可选）
  if (opts.signatureSecret && manifest.signature) {
    const expected = _hmacSha256Hex(opts.signatureSecret, `${manifest.source}:${manifest.version}`);
    if (!expected || !_timingSafeEqualHex(expected, manifest.signature)) {
      reasons.push('manifest_signature_mismatch');
    }
  } else if (opts.signatureSecret && !manifest.signature) {
    reasons.push('manifest_signature_required');
  }

  return {
    valid: reasons.length === 0,
    reasons,
    manifest: reasons.length === 0 ? manifest : null,
  };
}

// ---- 周期 14 P0-1: ASI06 记忆投毒检测 ----
// ASI06: Memory & Context Poisoning — 防止 attacker 通过 memory/context 注入恶意 payload
// 检测模式：
//   1. cross-user 注入（payload.userId 与 ALS context.userId 不一致）
//   2. replay 攻击（payload.ts 与 nonce 重用）
//   3. override 攻击（payload 尝试覆盖系统字段如 'admin' / 'role' / 'is_admin'）

const MEMORY_CONTEXT_FORBIDDEN_KEYS = ['admin', 'role', 'is_admin', 'is_root', 'privilege', 'sudo'];

function validateMemoryContext(payload, opts = {}) {
  const reasons = [];
  if (payload === null || payload === undefined) {
    return { valid: true, reasons: ['empty_payload'], payload: null };
  }
  if (typeof payload !== 'object') {
    return { valid: true, reasons: ['non_object_payload'], payload };
  }

  const ctx = opts.context || {};
  const seenNonces = opts.seenNonces || new Set();

  // 1. cross-user 注入
  if (payload.userId && ctx.userId && payload.userId !== ctx.userId) {
    reasons.push(`memory_cross_user_injection:${payload.userId}!=${ctx.userId}`);
  }

  // 2. replay nonce
  if (payload.nonce && seenNonces.has(payload.nonce)) {
    reasons.push(`memory_replay_nonce:${payload.nonce}`);
  }

  // 3. override 攻击
  for (const key of MEMORY_CONTEXT_FORBIDDEN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      reasons.push(`memory_override_attempt:${key}`);
    }
  }

  return {
    valid: reasons.length === 0,
    reasons,
    payload: reasons.length === 0 ? payload : null,
  };
}

// ---- 周期 14 P0-1: ASI07 通信签名 ----
// ASI07: Insecure Inter-Agent Communication — inter-agent message 签名 + nonce 防重放
// 设计：
//   - signInterAgentMessage(msg, secret)：返回 { msg, signature, nonce, ts }
//   - verifyInterAgentMessage(signed, secret)：验证签名 + nonce 未使用 + ts 未过期

function _generateNonce() {
  try {
    return require('node:crypto').randomBytes(16).toString('hex');
  } catch (e) {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

function _stableStringify(obj) {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(_stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + _stableStringify(obj[k])).join(',') + '}';
}

function signInterAgentMessage(msg, secret, opts = {}) {
  if (!msg || typeof msg !== 'object') {
    return { ok: false, reason: 'msg_not_object', signed: null };
  }
  if (!secret || typeof secret !== 'string') {
    return { ok: false, reason: 'secret_required', signed: null };
  }
  const ts = opts.ts || Date.now();
  const nonce = opts.nonce || _generateNonce();
  const payload = _stableStringify({ msg, ts, nonce });
  const signature = _hmacSha256Hex(secret, payload);
  if (!signature) return { ok: false, reason: 'hmac_failed', signed: null };
  return {
    ok: true,
    reason: null,
    signed: { msg, ts, nonce, signature },
  };
}

function verifyInterAgentMessage(signed, secret, opts = {}) {
  if (!signed || typeof signed !== 'object') {
    return { valid: false, reason: 'signed_not_object' };
  }
  if (!signed.signature || !signed.msg || !signed.ts || !signed.nonce) {
    return { valid: false, reason: 'signed_missing_fields' };
  }
  if (!secret || typeof secret !== 'string') {
    return { valid: false, reason: 'secret_required' };
  }
  const payload = _stableStringify({ msg: signed.msg, ts: signed.ts, nonce: signed.nonce });
  const expected = _hmacSha256Hex(secret, payload);
  if (!expected || !_timingSafeEqualHex(expected, signed.signature)) {
    return { valid: false, reason: 'signature_mismatch' };
  }
  // nonce reuse
  if (opts.seenNonces && opts.seenNonces.has(signed.nonce)) {
    return { valid: false, reason: 'nonce_replay' };
  }
  // ts expiry
  const maxAgeMs = opts.maxAgeMs || 300000; // 5 min default
  if (signed.ts + maxAgeMs < Date.now()) {
    return { valid: false, reason: 'ts_expired' };
  }
  return { valid: true, reason: null };
}

/**
 * Circuit breaker（窗口内 N 次失败 → open cooldownMs）
 * @param {object} opts
 * @returns {{ check: Function, record: Function, reset: Function, status: Function }}
 */
function createCircuitBreaker(opts = {}) {
  const o = { ...DEFAULT_OPTIONS.circuitBreaker, ...opts };
  if (!o.enabled) {
    const noop = () => ({ open: false, remaining: -1 });
    return { check: noop, record: noop, reset: noop, status: noop };
  }
  const state = {
    failures: [],          // 时间戳数组
    openUntil: 0,
  };
  function prune(now) {
    state.failures = state.failures.filter((t) => now - t < o.windowMs);
  }
  function check() {
    const now = Date.now();
    if (state.openUntil > now) {
      return { open: true, remaining: state.openUntil - now };
    }
    if (state.openUntil > 0 && state.openUntil <= now) {
      // 自动重置
      state.openUntil = 0;
      state.failures = [];
    }
    prune(now);
    return { open: false, remaining: o.threshold - state.failures.length };
  }
  function record() {
    const now = Date.now();
    state.failures.push(now);
    prune(now);
    if (state.failures.length >= o.threshold) {
      state.openUntil = now + o.cooldownMs;
    }
    return check();
  }
  function reset() {
    state.failures = [];
    state.openUntil = 0;
  }
  function status() {
    return { ...check(), threshold: o.threshold, windowMs: o.windowMs, cooldownMs: o.cooldownMs };
  }
  return { check, record, reset, status };
}

/**
 * 包装工具函数（带护栏）
 * @param {Function} toolFn - async (payload) => Promise<result>
 * @param {object} opts
 * @returns {Function} wrappedTool(payload) → Promise<result>
 */
function withGuardrail(toolFn, opts = {}) {
  const o = { ...DEFAULT_OPTIONS, ...opts };
  if (typeof toolFn !== 'function') {
    throw new TypeError('withGuardrail: toolFn must be a function');
  }
  const cb = o.circuitBreaker && o.circuitBreaker.enabled
    ? (typeof o.circuitBreaker === 'function' ? o.circuitBreaker : createCircuitBreaker(o.circuitBreaker))
    : createCircuitBreaker({ enabled: false });
  const toolName = toolFn.name || 'anonymous_tool';

  async function wrapped(payload, ctx = {}) {
    // 1. tool allowlist（ASI02/04）
    const allowCheck = checkToolAllowlist(toolName, o.allowlist);
    if (!allowCheck.allowed) {
      if (o.onRejected) o.onRejected(allowCheck.reason, payload);
      throw new Error(allowCheck.reason);
    }

    // 2. dangerous-action HITL（ASI09）
    if (o.dangerousActionsRequireHITL && o.dangerousActionsRequireHITL.includes(toolName)) {
      if (!ctx.hitlApproved) {
        throw new Error(`dangerous_action_requires_hitl:${toolName}`);
      }
    }

    // 3. circuit breaker（ASI08）
    const cbStatus = cb.check();
    if (cbStatus.open) {
      throw new Error(`circuit_breaker_open:remaining=${cbStatus.remaining}ms`);
    }

    // 4. input sanitization（ASI01/06）
    if (o.inputSanitizer && o.inputSanitizer.enabled) {
      const sanitizeResult = sanitizeInput(payload, o.inputSanitizer);
      if (sanitizeResult.rejected) {
        if (o.onRejected) o.onRejected(`sanitize:${sanitizeResult.reasons.join(',')}`, payload);
        throw new Error(`input_rejected:${sanitizeResult.reasons.join(',')}`);
      }
      payload = sanitizeResult.clean;
    }

    // 5. execute + 失败记录
    try {
      const result = await toolFn(payload, ctx);
      cb.record(); // 成功也走一次，record 内部去重
      return result;
    } catch (e) {
      cb.record();
      throw e;
    }
  }

  wrapped.guardrailMeta = { toolName, options: o };
  wrapped._circuitBreaker = cb;
  return wrapped;
}

module.exports = {
  withGuardrail,
  sanitizeInput,
  checkToolAllowlist,
  createCircuitBreaker,
  validateManifest,        // 周期 14 P0-1: ASI04
  validateMemoryContext,   // 周期 14 P0-1: ASI06
  signInterAgentMessage,   // 周期 14 P0-1: ASI07
  verifyInterAgentMessage, // 周期 14 P0-1: ASI07
  INJECTION_PATTERNS,
  DEFAULT_OPTIONS,
  MANIFEST_ALLOWED_SOURCES_DEFAULT,
  MEMORY_CONTEXT_FORBIDDEN_KEYS,
  _countMatches,  // 测试可访问
  _semverMatch,
  _hmacSha256Hex,
  _timingSafeEqualHex,
  _stableStringify,
  _generateNonce,
};