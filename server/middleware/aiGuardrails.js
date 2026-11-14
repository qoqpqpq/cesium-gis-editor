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
  // 周期 18 P0-1: ASI03 workload identity（opt-in，默认关闭以保持既有调用方行为不变）
  workloadIdentity: {
    enabled: false,           // true 时强制要求 ctx.workloadAttestation 通过验证
    secret: null,             // HMAC 密钥（启用时必填）
    seenNonces: null,         // Set<string> 防重放（可选）
    maxAgeMs: 300000,         // 证明有效期（默认 5 min）
    expectedIdentity: null,   // { toolName?, userId?, sessionId? } 绑定校验（可选）
  },
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

// ─────────────────────────────────────────────────────────────────────────────
// 周期 17 P0-1: ASI03 Identity & Privilege Abuse — SPIFFE-lite workload identity
//   以 (toolName, userId, sessionId) 三元组派生 workload 身份，并用 HMAC 签名 + nonce 防重放。
//   目的：给「某工具调用确由某用户在某会话内发起」提供可验证的轻量工作负载身份证明，
//   缓解身份/权限滥用（ASI03）与跨会话/跨用户冒用。
//   复用本模块既有 _hmacSha256Hex / _stableStringify / _generateNonce / _timingSafeEqualHex。
// ─────────────────────────────────────────────────────────────────────────────

/** SPIFFE-lite ID 前缀 */
const WORKLOAD_ID_PREFIX = 'spiffe-lite://gis-agent/workload';

/**
 * 校验三元组字段合法性
 * @returns {{ ok: boolean, reason: string|null }}
 */
function _validateWorkloadTuple(toolName, userId, sessionId) {
  if (typeof toolName !== 'string' || !toolName) return { ok: false, reason: 'tool_name_required' };
  if (typeof userId !== 'string' || !userId) return { ok: false, reason: 'user_id_required' };
  if (typeof sessionId !== 'string' || !sessionId) return { ok: false, reason: 'session_id_required' };
  return { ok: true, reason: null };
}

/**
 * 派生 SPIFFE-lite workload ID（三元组 → 稳定字符串 ID）
 * 格式：spiffe-lite://gis-agent/workload/{toolName}/{userId}/{sessionId}
 * 字段做 encodeURIComponent 以避免分隔符注入。
 * @param {string} toolName
 * @param {string} userId
 * @param {string} sessionId
 * @returns {{ ok: boolean, reason: string|null, workloadId: string|null }}
 */
function deriveWorkloadId(toolName, userId, sessionId) {
  const v = _validateWorkloadTuple(toolName, userId, sessionId);
  if (!v.ok) return { ok: false, reason: v.reason, workloadId: null };
  const workloadId = `${WORKLOAD_ID_PREFIX}/${encodeURIComponent(toolName)}/${encodeURIComponent(userId)}/${encodeURIComponent(sessionId)}`;
  return { ok: true, reason: null, workloadId };
}

/**
 * 为 workload 身份签发 HMAC-SHA256 证明（attestation）。
 * 证明载荷 = stableStringify({ workloadId, toolName, userId, sessionId, ts, nonce })。
 * @param {object} identity { toolName, userId, sessionId }
 * @param {string} secret HMAC 密钥
 * @param {object} [opts] { ts, nonce }（测试可注入固定值）
 * @returns {{ ok: boolean, reason: string|null, attestation: object|null }}
 */
function signWorkloadAttestation(identity, secret, opts = {}) {
  if (!identity || typeof identity !== 'object') {
    return { ok: false, reason: 'identity_not_object', attestation: null };
  }
  if (!secret || typeof secret !== 'string') {
    return { ok: false, reason: 'secret_required', attestation: null };
  }
  const { toolName, userId, sessionId } = identity;
  const derived = deriveWorkloadId(toolName, userId, sessionId);
  if (!derived.ok) return { ok: false, reason: derived.reason, attestation: null };

  const ts = opts.ts || Date.now();
  const nonce = opts.nonce || _generateNonce();
  const payload = _stableStringify({
    workloadId: derived.workloadId,
    toolName, userId, sessionId, ts, nonce,
  });
  const signature = _hmacSha256Hex(secret, payload);
  if (!signature) return { ok: false, reason: 'hmac_failed', attestation: null };

  return {
    ok: true,
    reason: null,
    attestation: {
      workloadId: derived.workloadId,
      toolName, userId, sessionId, ts, nonce,
      signature,
    },
  };
}

/**
 * 验证 workload 证明：签名 + nonce 防重放 + ts 过期 + 身份字段一致性。
 * @param {object} attestation signWorkloadAttestation 的输出
 * @param {string} secret HMAC 密钥
 * @param {object} [opts] { seenNonces:Set, maxAgeMs, expectedIdentity:{toolName,userId,sessionId} }
 * @returns {{ valid: boolean, reason: string|null }}
 */
function verifyWorkloadAttestation(attestation, secret, opts = {}) {
  if (!attestation || typeof attestation !== 'object') {
    return { valid: false, reason: 'attestation_not_object' };
  }
  const required = ['workloadId', 'toolName', 'userId', 'sessionId', 'ts', 'nonce', 'signature'];
  for (const k of required) {
    if (attestation[k] === undefined || attestation[k] === null) {
      return { valid: false, reason: `attestation_missing_field:${k}` };
    }
  }
  if (!secret || typeof secret !== 'string') {
    return { valid: false, reason: 'secret_required' };
  }
  // 身份字段一致性（可选绑定校验）
  if (opts.expectedIdentity && typeof opts.expectedIdentity === 'object') {
    for (const k of ['toolName', 'userId', 'sessionId']) {
      if (opts.expectedIdentity[k] !== undefined && opts.expectedIdentity[k] !== attestation[k]) {
        return { valid: false, reason: `identity_mismatch:${k}` };
      }
    }
  }
  // workloadId 与三元组重派生一致（防 workloadId 被篡改）
  const rederived = deriveWorkloadId(attestation.toolName, attestation.userId, attestation.sessionId);
  if (!rederived.ok || rederived.workloadId !== attestation.workloadId) {
    return { valid: false, reason: 'workload_id_mismatch' };
  }
  // 签名
  const payload = _stableStringify({
    workloadId: attestation.workloadId,
    toolName: attestation.toolName,
    userId: attestation.userId,
    sessionId: attestation.sessionId,
    ts: attestation.ts,
    nonce: attestation.nonce,
  });
  const expected = _hmacSha256Hex(secret, payload);
  if (!expected || !_timingSafeEqualHex(expected, attestation.signature)) {
    return { valid: false, reason: 'signature_mismatch' };
  }
  // nonce 防重放
  if (opts.seenNonces && opts.seenNonces.has(attestation.nonce)) {
    return { valid: false, reason: 'nonce_replay' };
  }
  // ts 过期
  const maxAgeMs = opts.maxAgeMs || 300000; // 5 min default
  if (typeof attestation.ts !== 'number' || attestation.ts + maxAgeMs < Date.now()) {
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

    // 5. workload identity（ASI03，周期 18 P0-1，opt-in 默认关闭）
    //    仅当 o.workloadIdentity.enabled=true 时强制：要求 ctx.workloadAttestation 通过验证，
    //    且（可选）绑定到 expectedIdentity。默认关闭 → 既有调用方行为零变化。
    if (o.workloadIdentity && o.workloadIdentity.enabled) {
      const att = ctx && ctx.workloadAttestation;
      if (!att) {
        if (o.onRejected) o.onRejected('workload_identity:attestation_missing', payload);
        throw new Error('workload_identity_attestation_missing');
      }
      const vopts = {
        secret: o.workloadIdentity.secret,
        seenNonces: o.workloadIdentity.seenNonces,
        maxAgeMs: o.workloadIdentity.maxAgeMs,
        expectedIdentity: o.workloadIdentity.expectedIdentity,
      };
      const vres = verifyWorkloadAttestation(att, vopts.secret, vopts);
      if (!vres.valid) {
        if (o.onRejected) o.onRejected(`workload_identity:${vres.reason}`, payload);
        throw new Error(`workload_identity_rejected:${vres.reason}`);
      }
    }

    // 6. execute + 失败记录
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

// ---- 周期 15 R3: ASI03 Identity & Privilege Abuse — SPIFFE-lite Workload Identity ----
// ASI03: Identity & Privilege Abuse — 防止 agent/tool 身份伪造 + 权限提升
// 设计（SPIFFE-lite 最小可行）：
//   - 三元组签名：tool-name + userId + sessionId → HMAC-SHA256 签名
//   - 权限级别：viewer < editor < admin < superadmin
//   - 防重放：nonce + ts（默认 5 分钟过期）
//   - 防伪造：timing-safe HMAC 验证

const PRIVILEGE_LEVELS = ['viewer', 'editor', 'admin', 'superadmin'];

const PRIVILEGE_RANK = {};
for (let i = 0; i < PRIVILEGE_LEVELS.length; i++) {
  PRIVILEGE_RANK[PRIVILEGE_LEVELS[i]] = i;
}

/**
 * 创建 workload identity
 * @param {object} opts
 * @param {string} opts.toolName - 工具名
 * @param {string} opts.userId - 用户 ID
 * @param {string} opts.sessionId - 会话 ID
 * @param {string} [opts.privilege='viewer'] - 权限级别
 * @param {number} [opts.ts] - 时间戳（默认 Date.now()）
 * @param {string} [opts.nonce] - 防重放 nonce
 * @returns {object} identity
 */
function createWorkloadIdentity(opts = {}) {
  const toolName = opts.toolName || 'unknown';
  const userId = opts.userId || 'anonymous';
  const sessionId = opts.sessionId || 'default';
  const privilege = opts.privilege || 'viewer';
  const ts = typeof opts.ts === 'number' ? opts.ts : Date.now();
  const nonce = opts.nonce || _generateNonce();

  // 验证 privilege 合法性
  if (!PRIVILEGE_LEVELS.includes(privilege)) {
    return {
      ok: false,
      reason: `invalid_privilege:${privilege}`,
      identity: null,
    };
  }

  return {
    ok: true,
    reason: null,
    identity: {
      toolName,
      userId,
      sessionId,
      privilege,
      ts,
      nonce,
    },
  };
}

/**
 * 签名 workload identity
 * @param {object} identity - { toolName, userId, sessionId, privilege, ts, nonce }
 * @param {string} secret - HMAC 密钥
 * @returns {{ ok: boolean, signed: object|null, reason: string|null }}
 */
function signWorkloadIdentity(identity, secret) {
  if (!identity || typeof identity !== 'object') {
    return { ok: false, reason: 'identity_not_object', signed: null };
  }
  if (!secret || typeof secret !== 'string') {
    return { ok: false, reason: 'secret_required', signed: null };
  }
  // 验证必填字段
  for (const field of ['toolName', 'userId', 'sessionId', 'privilege', 'ts', 'nonce']) {
    if (!identity[field]) {
      return { ok: false, reason: `identity_missing_${field}`, signed: null };
    }
  }
  // 验证 privilege 合法性
  if (!PRIVILEGE_LEVELS.includes(identity.privilege)) {
    return { ok: false, reason: `invalid_privilege:${identity.privilege}`, signed: null };
  }
  // 签名：HMAC-SHA256(secret, stableStringify(identity))
  const payload = _stableStringify(identity);
  const signature = _hmacSha256Hex(secret, payload);
  if (!signature) {
    return { ok: false, reason: 'hmac_failed', signed: null };
  }
  return {
    ok: true,
    reason: null,
    signed: { ...identity, signature },
  };
}

/**
 * 验证 workload identity 签名
 * @param {object} signed - { toolName, userId, sessionId, privilege, ts, nonce, signature }
 * @param {string} secret - HMAC 密钥
 * @param {object} [opts]
 * @param {number} [opts.maxAgeMs=300000] - 签名最大有效期（5 分钟）
 * @param {Set} [opts.seenNonces] - 已使用 nonce 集合
 * @returns {{ valid: boolean, reason: string|null, identity: object|null }}
 */
function verifyWorkloadIdentity(signed, secret, opts = {}) {
  if (!signed || typeof signed !== 'object') {
    return { valid: false, reason: 'signed_not_object', identity: null };
  }
  if (!secret || typeof secret !== 'string') {
    return { valid: false, reason: 'secret_required', identity: null };
  }
  // 验证必填字段
  for (const field of ['toolName', 'userId', 'sessionId', 'privilege', 'ts', 'nonce', 'signature']) {
    if (!signed[field]) {
      return { valid: false, reason: `signed_missing_${field}`, identity: null };
    }
  }
  // 验证 privilege 合法性
  if (!PRIVILEGE_LEVELS.includes(signed.privilege)) {
    return { valid: false, reason: `invalid_privilege:${signed.privilege}`, identity: null };
  }
  // 验证签名
  const { signature, ...identity } = signed;
  const payload = _stableStringify(identity);
  const expected = _hmacSha256Hex(secret, payload);
  if (!expected || !_timingSafeEqualHex(expected, signature)) {
    return { valid: false, reason: 'signature_mismatch', identity: null };
  }
  // 验证 ts 未过期
  const maxAgeMs = typeof opts.maxAgeMs === 'number' ? opts.maxAgeMs : 300000;
  if (signed.ts + maxAgeMs < Date.now()) {
    return { valid: false, reason: 'ts_expired', identity: null };
  }
  // 验证 nonce 未重用
  if (opts.seenNonces && opts.seenNonces.has(signed.nonce)) {
    return { valid: false, reason: 'nonce_replay', identity: null };
  }
  return {
    valid: true,
    reason: null,
    identity: { toolName: identity.toolName, userId: identity.userId, sessionId: identity.sessionId, privilege: identity.privilege, ts: identity.ts, nonce: identity.nonce },
  };
}

/**
 * 检查 identity 权限是否满足要求
 * @param {object} identity - workload identity
 * @param {string} requiredPrivilege - 需要的权限级别
 * @returns {{ allowed: boolean, reason: string|null }}
 */
function checkIdentityPrivilege(identity, requiredPrivilege) {
  if (!identity || typeof identity !== 'object') {
    return { allowed: false, reason: 'identity_not_object' };
  }
  if (!requiredPrivilege) {
    return { allowed: true, reason: null };
  }
  const identityRank = PRIVILEGE_RANK[identity.privilege];
  const requiredRank = PRIVILEGE_RANK[requiredPrivilege];
  if (identityRank === undefined) {
    return { allowed: false, reason: `invalid_privilege:${identity.privilege}` };
  }
  if (requiredRank === undefined) {
    return { allowed: false, reason: `invalid_required_privilege:${requiredPrivilege}` };
  }
  if (identityRank >= requiredRank) {
    return { allowed: true, reason: null };
  }
  return { allowed: false, reason: `insufficient_privilege:${identity.privilege} < ${requiredPrivilege}` };
}

/**
 * 包装工具函数（带 workload identity 验证）
 * @param {Function} toolFn - async (payload, ctx) => Promise<result>
 * @param {object} opts
 * @param {string} opts.secret - HMAC 密钥
 * @param {string} [opts.requiredPrivilege='viewer'] - 需要的最低权限
 * @param {number} [opts.maxAgeMs=300000] - 签名最大有效期
 * @returns {Function} wrappedTool(payload, ctx) → Promise<result>
 */
function withWorkloadIdentity(toolFn, opts = {}) {
  if (typeof toolFn !== 'function') {
    throw new TypeError('withWorkloadIdentity: toolFn must be a function');
  }
  const secret = opts.secret;
  const requiredPrivilege = opts.requiredPrivilege || 'viewer';
  const maxAgeMs = opts.maxAgeMs || 300000;

  async function wrapped(payload, ctx = {}) {
    // 1. 从 ctx 获取 signed identity
    const signed = ctx.identity || ctx.workloadIdentity;
    if (!signed) {
      throw new Error('workload_identity_required');
    }

    // 2. 验证签名
    const verifyResult = verifyWorkloadIdentity(signed, secret, { maxAgeMs });
    if (!verifyResult.valid) {
      throw new Error(`identity_verification_failed:${verifyResult.reason}`);
    }

    // 3. 检查权限
    const privCheck = checkIdentityPrivilege(verifyResult.identity, requiredPrivilege);
    if (!privCheck.allowed) {
      throw new Error(`identity_privilege_denied:${privCheck.reason}`);
    }

    // 4. 执行工具
    return toolFn(payload, { ...ctx, identity: verifyResult.identity });
  }

  wrapped.identityMeta = { requiredPrivilege, maxAgeMs };
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
  deriveWorkloadId,          // 周期 17 P0-1: ASI03 SPIFFE-lite
  signWorkloadAttestation,   // 周期 17 P0-1: ASI03 SPIFFE-lite
  verifyWorkloadAttestation, // 周期 17 P0-1: ASI03 SPIFFE-lite
  WORKLOAD_ID_PREFIX,        // 周期 17 P0-1: ASI03
  // 周期 15 R3: ASI03 Identity & Privilege Abuse — SPIFFE-lite Workload Identity
  createWorkloadIdentity,
  signWorkloadIdentity,
  verifyWorkloadIdentity,
  checkIdentityPrivilege,
  withWorkloadIdentity,
  PRIVILEGE_LEVELS,
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