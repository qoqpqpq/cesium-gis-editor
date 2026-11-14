// tests/specs/asi03-workload-identity.cjs
// 周期 15 R3: ASI03 Identity & Privilege Abuse — SPIFFE-lite Workload Identity
// 目标：≥ 18 PASS
//
// 覆盖：
//   - 模块导出
//   - createWorkloadIdentity（三元组创建 + privilege 验证）
//   - signWorkloadIdentity（HMAC-SHA256 签名）
//   - verifyWorkloadIdentity（签名验证 + ts 过期 + nonce 防重放）
//   - checkIdentityPrivilege（权限级别检查）
//   - withWorkloadIdentity（工具包装）
//   - 集成：完整身份验证流程

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const {
  createWorkloadIdentity,
  signWorkloadIdentity,
  verifyWorkloadIdentity,
  checkIdentityPrivilege,
  withWorkloadIdentity,
  PRIVILEGE_LEVELS,
  _hmacSha256Hex,
  _timingSafeEqualHex,
  _stableStringify,
  _generateNonce,
} = require(path.join(__dirname, '../../server/middleware/aiGuardrails'));

let pass = 0;
let fail = 0;

function ok(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      pass += 1;
      console.log(`  [PASS] ${label}`);
    })
    .catch((e) => {
      fail += 1;
      console.error(`  [FAIL] ${label}: ${e.message}`);
    });
}

(async function main() {
  console.log('=== asi03-workload-identity ===');

  // ============ Group A: 模块导出 ============
  await ok('A1: createWorkloadIdentity 已导出', () => {
    assert.equal(typeof createWorkloadIdentity, 'function');
  });
  await ok('A2: signWorkloadIdentity 已导出', () => {
    assert.equal(typeof signWorkloadIdentity, 'function');
  });
  await ok('A3: verifyWorkloadIdentity 已导出', () => {
    assert.equal(typeof verifyWorkloadIdentity, 'function');
  });
  await ok('A4: checkIdentityPrivilege 已导出', () => {
    assert.equal(typeof checkIdentityPrivilege, 'function');
  });
  await ok('A5: withWorkloadIdentity 已导出', () => {
    assert.equal(typeof withWorkloadIdentity, 'function');
  });
  await ok('A6: PRIVILEGE_LEVELS 完整', () => {
    assert.deepEqual(PRIVILEGE_LEVELS, ['viewer', 'editor', 'admin', 'superadmin']);
  });

  // ============ Group B: createWorkloadIdentity ============
  await ok('B1: 基本创建（三元组）', () => {
    const r = createWorkloadIdentity({
      toolName: 'readTool',
      userId: 'user123',
      sessionId: 'sess456',
    });
    assert.equal(r.ok, true);
    assert.equal(r.identity.toolName, 'readTool');
    assert.equal(r.identity.userId, 'user123');
    assert.equal(r.identity.sessionId, 'sess456');
    assert.equal(r.identity.privilege, 'viewer');
    assert.ok(r.identity.ts > 0);
    assert.ok(r.identity.nonce);
  });
  await ok('B2: 指定 privilege', () => {
    const r = createWorkloadIdentity({
      toolName: 'writeTool',
      userId: 'user123',
      sessionId: 'sess456',
      privilege: 'admin',
    });
    assert.equal(r.identity.privilege, 'admin');
  });
  await ok('B3: 非法 privilege → 拒绝', () => {
    const r = createWorkloadIdentity({
      toolName: 'tool',
      userId: 'user',
      sessionId: 'sess',
      privilege: 'hacker',
    });
    assert.equal(r.ok, false);
    assert.match(r.reason, /invalid_privilege/);
  });
  await ok('B4: 缺省值（空 opts）', () => {
    const r = createWorkloadIdentity({});
    assert.equal(r.ok, true);
    assert.equal(r.identity.toolName, 'unknown');
    assert.equal(r.identity.userId, 'anonymous');
    assert.equal(r.identity.sessionId, 'default');
    assert.equal(r.identity.privilege, 'viewer');
  });
  await ok('B5: 指定 ts + nonce', () => {
    const r = createWorkloadIdentity({
      toolName: 'tool',
      userId: 'user',
      sessionId: 'sess',
      ts: 1234567890,
      nonce: 'custom-nonce',
    });
    assert.equal(r.identity.ts, 1234567890);
    assert.equal(r.identity.nonce, 'custom-nonce');
  });

  // ============ Group C: signWorkloadIdentity ============
  const SECRET = 'test-secret-key-2026';
  await ok('C1: 基本签名', () => {
    const { identity } = createWorkloadIdentity({
      toolName: 'readTool',
      userId: 'user123',
      sessionId: 'sess456',
      privilege: 'viewer',
    });
    const r = signWorkloadIdentity(identity, SECRET);
    assert.equal(r.ok, true);
    assert.ok(r.signed.signature);
    assert.equal(r.signed.toolName, 'readTool');
  });
  await ok('C2: 签名可验证', () => {
    const { identity } = createWorkloadIdentity({
      toolName: 'readTool',
      userId: 'user123',
      sessionId: 'sess456',
    });
    const { signed } = signWorkloadIdentity(identity, SECRET);
    const verify = verifyWorkloadIdentity(signed, SECRET);
    assert.equal(verify.valid, true);
  });
  await ok('C3: 错误 secret → 签名不匹配', () => {
    const { identity } = createWorkloadIdentity({
      toolName: 'readTool',
      userId: 'user123',
      sessionId: 'sess456',
    });
    const { signed } = signWorkloadIdentity(identity, SECRET);
    const verify = verifyWorkloadIdentity(signed, 'wrong-secret');
    assert.equal(verify.valid, false);
    assert.equal(verify.reason, 'signature_mismatch');
  });
  await ok('C4: 缺字段 → 拒绝签名', () => {
    const r = signWorkloadIdentity({ toolName: 'tool' }, SECRET);
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes('missing'));
  });
  await ok('C5: 非法 privilege → 拒绝签名', () => {
    const r = signWorkloadIdentity(
      { toolName: 'tool', userId: 'u', sessionId: 's', privilege: 'hacker', ts: 1, nonce: 'n' },
      SECRET
    );
    assert.equal(r.ok, false);
    assert.match(r.reason, /invalid_privilege/);
  });
  await ok('C6: 缺 secret → 拒绝', () => {
    const { identity } = createWorkloadIdentity({
      toolName: 'tool',
      userId: 'user',
      sessionId: 'sess',
    });
    const r = signWorkloadIdentity(identity, null);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'secret_required');
  });

  // ============ Group D: verifyWorkloadIdentity ============
  await ok('D1: 正确签名 → 验证通过', () => {
    const { identity } = createWorkloadIdentity({
      toolName: 'readTool',
      userId: 'user123',
      sessionId: 'sess456',
    });
    const { signed } = signWorkloadIdentity(identity, SECRET);
    const r = verifyWorkloadIdentity(signed, SECRET);
    assert.equal(r.valid, true);
    assert.equal(r.identity.userId, 'user123');
  });
  await ok('D2: ts 过期 → 拒绝', () => {
    const { identity } = createWorkloadIdentity({
      toolName: 'readTool',
      userId: 'user123',
      sessionId: 'sess456',
      ts: Date.now() - 3600000, // 1 小时前
    });
    const { signed } = signWorkloadIdentity(identity, SECRET);
    const r = verifyWorkloadIdentity(signed, SECRET, { maxAgeMs: 300000 });
    assert.equal(r.valid, false);
    assert.equal(r.reason, 'ts_expired');
  });
  await ok('D3: nonce 防重放', () => {
    const { identity } = createWorkloadIdentity({
      toolName: 'readTool',
      userId: 'user123',
      sessionId: 'sess456',
    });
    const { signed } = signWorkloadIdentity(identity, SECRET);
    const seenNonces = new Set([signed.nonce]);
    const r = verifyWorkloadIdentity(signed, SECRET, { seenNonces });
    assert.equal(r.valid, false);
    assert.equal(r.reason, 'nonce_replay');
  });
  await ok('D4: 篡改 payload → 签名不匹配', () => {
    const { identity } = createWorkloadIdentity({
      toolName: 'readTool',
      userId: 'user123',
      sessionId: 'sess456',
    });
    const { signed } = signWorkloadIdentity(identity, SECRET);
    // 篡改 userId
    const tampered = { ...signed, userId: 'hacker' };
    const r = verifyWorkloadIdentity(tampered, SECRET);
    assert.equal(r.valid, false);
    assert.equal(r.reason, 'signature_mismatch');
  });
  await ok('D5: 缺字段 → 拒绝', () => {
    const r = verifyWorkloadIdentity({ toolName: 'tool' }, SECRET);
    assert.equal(r.valid, false);
    assert.ok(r.reason.includes('missing'));
  });

  // ============ Group E: checkIdentityPrivilege ============
  await ok('E1: viewer 有 viewer 权限', () => {
    const r = checkIdentityPrivilege({ privilege: 'viewer' }, 'viewer');
    assert.equal(r.allowed, true);
  });
  await ok('E2: admin 有 editor 权限', () => {
    const r = checkIdentityPrivilege({ privilege: 'admin' }, 'editor');
    assert.equal(r.allowed, true);
  });
  await ok('E3: superadmin 有 admin 权限', () => {
    const r = checkIdentityPrivilege({ privilege: 'superadmin' }, 'admin');
    assert.equal(r.allowed, true);
  });
  await ok('E4: viewer 无 admin 权限', () => {
    const r = checkIdentityPrivilege({ privilege: 'viewer' }, 'admin');
    assert.equal(r.allowed, false);
    assert.match(r.reason, /insufficient_privilege/);
  });
  await ok('E5: 非法 privilege → 拒绝', () => {
    const r = checkIdentityPrivilege({ privilege: 'hacker' }, 'viewer');
    assert.equal(r.allowed, false);
    assert.match(r.reason, /invalid_privilege/);
  });
  await ok('E6: 空 requiredPrivilege → 全允许', () => {
    const r = checkIdentityPrivilege({ privilege: 'viewer' }, null);
    assert.equal(r.allowed, true);
  });
  await ok('E7: 无 identity → 拒绝', () => {
    const r = checkIdentityPrivilege(null, 'viewer');
    assert.equal(r.allowed, false);
    assert.equal(r.reason, 'identity_not_object');
  });

  // ============ Group F: withWorkloadIdentity 包装 ============
  await ok('F1: 正确 identity → 工具执行', async () => {
    async function readTool(payload, ctx) {
      return { ok: true, userId: ctx.identity.userId };
    }
    const safe = withWorkloadIdentity(readTool, { secret: SECRET, requiredPrivilege: 'viewer' });
    const { identity } = createWorkloadIdentity({
      toolName: 'readTool',
      userId: 'user123',
      sessionId: 'sess456',
    });
    const { signed } = signWorkloadIdentity(identity, SECRET);
    const r = await safe({}, { identity: signed });
    assert.equal(r.ok, true);
    assert.equal(r.userId, 'user123');
  });
  await ok('F2: 缺 identity → 拒绝', async () => {
    async function readTool() { return 'ok'; }
    const safe = withWorkloadIdentity(readTool, { secret: SECRET });
    await assert.rejects(safe({}), /workload_identity_required/);
  });
  await ok('F3: 无效签名 → 拒绝', async () => {
    async function readTool() { return 'ok'; }
    const safe = withWorkloadIdentity(readTool, { secret: SECRET });
    const { signed } = signWorkloadIdentity(
      { toolName: 'readTool', userId: 'u', sessionId: 's', privilege: 'viewer', ts: Date.now(), nonce: 'n' },
      'wrong-secret'
    );
    await assert.rejects(safe({}, { identity: signed }), /identity_verification_failed/);
  });
  await ok('F4: 权限不足 → 拒绝', async () => {
    async function adminTool() { return 'ok'; }
    const safe = withWorkloadIdentity(adminTool, { secret: SECRET, requiredPrivilege: 'admin' });
    const { identity } = createWorkloadIdentity({
      toolName: 'adminTool',
      userId: 'viewer',
      sessionId: 'sess',
      privilege: 'viewer',
    });
    const { signed } = signWorkloadIdentity(identity, SECRET);
    await assert.rejects(safe({}, { identity: signed }), /identity_privilege_denied/);
  });
  await ok('F5: 权限满足 → 执行', async () => {
    async function adminTool(payload) { return { ok: true, action: 'deleted' }; }
    const safe = withWorkloadIdentity(adminTool, { secret: SECRET, requiredPrivilege: 'admin' });
    const { identity } = createWorkloadIdentity({
      toolName: 'adminTool',
      userId: 'admin',
      sessionId: 'sess',
      privilege: 'admin',
    });
    const { signed } = signWorkloadIdentity(identity, SECRET);
    const r = await safe({}, { identity: signed });
    assert.equal(r.action, 'deleted');
  });
  await ok('F6: toolFn 非函数 → 抛错', () => {
    assert.throws(() => withWorkloadIdentity(null, {}), /must be a function/);
  });

  // ============ Group G: 集成 + 边界 ============
  await ok('G1: 完整流程：创建 → 签名 → 验证 → 权限检查 → 执行', async () => {
    async function writeTool(payload, ctx) {
      return { ok: true, userId: ctx.identity.userId, privilege: ctx.identity.privilege };
    }
    const safe = withWorkloadIdentity(writeTool, { secret: SECRET, requiredPrivilege: 'editor' });
    const { identity } = createWorkloadIdentity({
      toolName: 'writeTool',
      userId: 'editor1',
      sessionId: 'sess-write',
      privilege: 'editor',
    });
    const { signed } = signWorkloadIdentity(identity, SECRET);
    const r = await safe({ content: 'test' }, { identity: signed });
    assert.equal(r.ok, true);
    assert.equal(r.userId, 'editor1');
    assert.equal(r.privilege, 'editor');
  });
  await ok('G2: _stableStringify 确定性', () => {
    const obj1 = { a: 1, b: 2, c: 3 };
    const obj2 = { c: 3, a: 1, b: 2 };
    assert.equal(_stableStringify(obj1), _stableStringify(obj2));
  });
  await ok('G3: _timingSafeEqualHex 不泄露时间', () => {
    assert.equal(_timingSafeEqualHex('abc', 'abc'), true);
    assert.equal(_timingSafeEqualHex('abc', 'abd'), false);
    assert.equal(_timingSafeEqualHex('abc', 'abcd'), false);
  });
  await ok('G4: _generateNonce 唯一性', () => {
    const nonces = new Set();
    for (let i = 0; i < 100; i++) {
      nonces.add(_generateNonce());
    }
    assert.equal(nonces.size, 100);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
