// tests/specs/workload-identity-asi03.cjs
// 周期 17 P0-1: ASI03 SPIFFE-lite workload identity 单元测试
// 目标：≥ 18 子断言 PASS；既有 ai-guardrails / ai-guardrails-deep 零回归

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {
  deriveWorkloadId,
  signWorkloadAttestation,
  verifyWorkloadAttestation,
  WORKLOAD_ID_PREFIX,
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

const SECRET = 'test-workload-secret-key';
const IDENTITY = { toolName: 'flyTo', userId: 'user-123', sessionId: 'sess-abc' };

(async function main() {
  console.log('=== workload-identity-asi03 ===');

  // ============ Group A: deriveWorkloadId ============
  await ok('A1: 合法三元组派生 workloadId（含前缀）', () => {
    const r = deriveWorkloadId('flyTo', 'user-123', 'sess-abc');
    assert.equal(r.ok, true);
    assert.ok(r.workloadId.startsWith(WORKLOAD_ID_PREFIX));
  });
  await ok('A2: workloadId 编码三元组（tool/user/session 顺序）', () => {
    const r = deriveWorkloadId('flyTo', 'u1', 's1');
    assert.match(r.workloadId, /flyTo\/u1\/s1$/);
  });
  await ok('A3: 缺 toolName → 抛 tool_name_required', () => {
    const r = deriveWorkloadId('', 'u1', 's1');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'tool_name_required');
    assert.equal(r.workloadId, null);
  });
  await ok('A4: 缺 userId → user_id_required', () => {
    const r = deriveWorkloadId('flyTo', '', 's1');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'user_id_required');
  });
  await ok('A5: 缺 sessionId → session_id_required', () => {
    const r = deriveWorkloadId('flyTo', 'u1', '');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'session_id_required');
  });
  await ok('A6: 含分隔符的字段被 encodeURIComponent（防注入）', () => {
    const r = deriveWorkloadId('a/b', 'u', 's');
    assert.equal(r.ok, true);
    assert.ok(!r.workloadId.includes('a/b/'), '分隔符应被编码');
    assert.ok(r.workloadId.includes(encodeURIComponent('a/b')));
  });
  await ok('A7: 确定性（同输入同 ID）', () => {
    const a = deriveWorkloadId('flyTo', 'u1', 's1').workloadId;
    const b = deriveWorkloadId('flyTo', 'u1', 's1').workloadId;
    assert.equal(a, b);
  });

  // ============ Group B: signWorkloadAttestation ============
  await ok('B1: 合法签名产出 attestation（含 signature/nonce/ts）', () => {
    const r = signWorkloadAttestation(IDENTITY, SECRET);
    assert.equal(r.ok, true);
    assert.ok(r.attestation.signature);
    assert.ok(r.attestation.nonce);
    assert.ok(typeof r.attestation.ts === 'number');
    assert.equal(r.attestation.workloadId, deriveWorkloadId(IDENTITY.toolName, IDENTITY.userId, IDENTITY.sessionId).workloadId);
  });
  await ok('B2: 缺 secret → secret_required', () => {
    const r = signWorkloadAttestation(IDENTITY, '');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'secret_required');
    assert.equal(r.attestation, null);
  });
  await ok('B3: identity 非对象 → identity_not_object', () => {
    const r = signWorkloadAttestation(null, SECRET);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'identity_not_object');
  });
  await ok('B4: 身份非法（缺字段）→ 透传派生错误', () => {
    const r = signWorkloadAttestation({ toolName: '', userId: 'u', sessionId: 's' }, SECRET);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'tool_name_required');
  });
  await ok('B5: 可注入固定 ts/nonce（确定性测试）', () => {
    const a = signWorkloadAttestation(IDENTITY, SECRET, { ts: 1000, nonce: 'n1' }).attestation;
    const b = signWorkloadAttestation(IDENTITY, SECRET, { ts: 1000, nonce: 'n1' }).attestation;
    assert.equal(a.signature, b.signature);
    assert.equal(a.ts, 1000);
    assert.equal(a.nonce, 'n1');
  });
  await ok('B6: 不同身份 → 不同签名', () => {
    const a = signWorkloadAttestation(IDENTITY, SECRET, { ts: 1, nonce: 'n' }).attestation.signature;
    const b = signWorkloadAttestation({ ...IDENTITY, userId: 'other' }, SECRET, { ts: 1, nonce: 'n' }).attestation.signature;
    assert.notEqual(a, b);
  });

  // ============ Group C: verifyWorkloadAttestation ============
  await ok('C1: 合法证明验证通过', () => {
    const { attestation } = signWorkloadAttestation(IDENTITY, SECRET);
    const v = verifyWorkloadAttestation(attestation, SECRET);
    assert.equal(v.valid, true);
    assert.equal(v.reason, null);
  });
  await ok('C2: 篡改签名 → signature_mismatch', () => {
    const { attestation } = signWorkloadAttestation(IDENTITY, SECRET);
    const v = verifyWorkloadAttestation({ ...attestation, signature: 'deadbeef' }, SECRET);
    assert.equal(v.valid, false);
    assert.equal(v.reason, 'signature_mismatch');
  });
  await ok('C3: 错误 secret → signature_mismatch', () => {
    const { attestation } = signWorkloadAttestation(IDENTITY, SECRET);
    const v = verifyWorkloadAttestation(attestation, 'wrong-secret');
    assert.equal(v.valid, false);
    assert.equal(v.reason, 'signature_mismatch');
  });
  await ok('C4: 篡改身份字段（userId）→ 被拒（workload_id 重派生不一致先命中）', () => {
    const { attestation } = signWorkloadAttestation(IDENTITY, SECRET);
    const v = verifyWorkloadAttestation({ ...attestation, userId: 'evil' }, SECRET);
    assert.equal(v.valid, false);
    // verify 先做 workloadId 重派生一致性检查：userId 被篡改 → 重派生 ID 与证明不符
    assert.equal(v.reason, 'workload_id_mismatch');
  });
  await ok('C5: 篡改 workloadId（与三元组不符）→ workload_id_mismatch', () => {
    const { attestation } = signWorkloadAttestation(IDENTITY, SECRET);
    const v = verifyWorkloadAttestation({ ...attestation, workloadId: WORKLOAD_ID_PREFIX + '/x/y/z' }, SECRET);
    assert.equal(v.valid, false);
    assert.equal(v.reason, 'workload_id_mismatch');
  });
  await ok('C6: 缺字段 → attestation_missing_field', () => {
    const { attestation } = signWorkloadAttestation(IDENTITY, SECRET);
    const { nonce, ...missing } = attestation;
    const v = verifyWorkloadAttestation(missing, SECRET);
    assert.equal(v.valid, false);
    assert.match(v.reason, /attestation_missing_field:nonce/);
  });
  await ok('C7: attestation 非对象 → attestation_not_object', () => {
    const v = verifyWorkloadAttestation(null, SECRET);
    assert.equal(v.valid, false);
    assert.equal(v.reason, 'attestation_not_object');
  });
  await ok('C8: 缺 secret → secret_required', () => {
    const { attestation } = signWorkloadAttestation(IDENTITY, SECRET);
    const v = verifyWorkloadAttestation(attestation, '');
    assert.equal(v.valid, false);
    assert.equal(v.reason, 'secret_required');
  });
  await ok('C9: nonce 重放 → nonce_replay', () => {
    const { attestation } = signWorkloadAttestation(IDENTITY, SECRET, { nonce: 'replay-n' });
    const seen = new Set();
    const first = verifyWorkloadAttestation(attestation, SECRET, { seenNonces: seen });
    assert.equal(first.valid, true);
    seen.add(attestation.nonce);
    const second = verifyWorkloadAttestation(attestation, SECRET, { seenNonces: seen });
    assert.equal(second.valid, false);
    assert.equal(second.reason, 'nonce_replay');
  });
  await ok('C10: ts 过期 → ts_expired', () => {
    const { attestation } = signWorkloadAttestation(IDENTITY, SECRET, { ts: Date.now() - 10 * 60 * 1000 });
    const v = verifyWorkloadAttestation(attestation, SECRET, { maxAgeMs: 60000 });
    assert.equal(v.valid, false);
    assert.equal(v.reason, 'ts_expired');
  });
  await ok('C11: ts 非数字 → 被拒（篡改检测，非数字 ts 改变签名载荷）', () => {
    const { attestation } = signWorkloadAttestation(IDENTITY, SECRET);
    const v = verifyWorkloadAttestation({ ...attestation, ts: 'not-a-number' }, SECRET);
    assert.equal(v.valid, false);
    // ts 进入签名载荷，被篡改为字符串 → 先命中签名失配（篡改检测生效）
    assert.equal(v.reason, 'signature_mismatch');
  });
  await ok('C12: expectedIdentity 绑定校验 — 不匹配 → identity_mismatch', () => {
    const { attestation } = signWorkloadAttestation(IDENTITY, SECRET);
    const v = verifyWorkloadAttestation(attestation, SECRET, { expectedIdentity: { userId: 'someone-else' } });
    assert.equal(v.valid, false);
    assert.match(v.reason, /identity_mismatch:userId/);
  });
  await ok('C13: expectedIdentity 匹配 → 通过', () => {
    const { attestation } = signWorkloadAttestation(IDENTITY, SECRET);
    const v = verifyWorkloadAttestation(attestation, SECRET, { expectedIdentity: { toolName: 'flyTo', userId: 'user-123', sessionId: 'sess-abc' } });
    assert.equal(v.valid, true);
  });

  // ============ Group D: 端到端 sign→verify 往返 + 常量 ============
  await ok('D1: 完整 sign→verify 往返（真实 nonce/ts）', () => {
    const { attestation } = signWorkloadAttestation(IDENTITY, SECRET);
    const v = verifyWorkloadAttestation(attestation, SECRET);
    assert.equal(v.valid, true);
  });
  await ok('D2: WORKLOAD_ID_PREFIX 值正确', () => {
    assert.equal(WORKLOAD_ID_PREFIX, 'spiffe-lite://gis-agent/workload');
  });
  await ok('D3: 不同 session（跨会话冒用）→ 签名不同 + 绑定校验拦截', () => {
    const legit = signWorkloadAttestation(IDENTITY, SECRET).attestation;
    // 攻击者用同一 secret 但不同 session 伪造
    const forged = signWorkloadAttestation({ ...IDENTITY, sessionId: 'sess-other' }, SECRET).attestation;
    assert.notEqual(legit.signature, forged.signature);
    // 受害会话绑定校验拒绝伪造证明
    const v = verifyWorkloadAttestation(forged, SECRET, { expectedIdentity: { sessionId: 'sess-abc' } });
    assert.equal(v.valid, false);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});