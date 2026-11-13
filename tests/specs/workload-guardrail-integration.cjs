// tests/specs/workload-guardrail-integration.cjs
// 周期 18 P0-1: withGuardrail 集成 ASI03 workload identity（opt-in）单元测试
// 目标：≥ 18 子断言 PASS；既有 ai-guardrails / ai-guardrails-deep / workload-identity-asi03 零回归

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {
  withGuardrail,
  signWorkloadAttestation,
  verifyWorkloadAttestation,
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

const SECRET = 'test-integration-secret';

// 一个最简工具函数（命名以便 toolName）
function flyToTool(payload) {
  return { flown: true, payload };
}

(async function main() {
  console.log('=== workload-guardrail-integration ===');

  const goodAttest = signWorkloadAttestation(
    { toolName: 'flyToTool', userId: 'u1', sessionId: 's1' }, SECRET,
  ).attestation;

  // ============ Group A: 默认关闭（既有行为不变） ============
  await ok('A1: 默认（不传 workloadIdentity）无证明也能执行 — 行为不变', async () => {
    const guarded = withGuardrail(flyToTool, {});
    const r = await guarded({ x: 1 }, {});
    assert.equal(r.flown, true);
  });
  await ok('A2: 默认 workloadIdentity.enabled === false', () => {
    const guarded = withGuardrail(flyToTool, {});
    assert.equal(guarded.guardrailMeta.options.workloadIdentity.enabled, false);
  });
  await ok('A3: 默认关闭时即使缺 attestation 也不阻塞', async () => {
    const guarded = withGuardrail(flyToTool, { workloadIdentity: { enabled: false } });
    const r = await guarded({}, {}); // 无 ctx.workloadAttestation
    assert.equal(r.flown, true);
  });
  await ok('A4: withGuardrail 签名不变（toolFn, opts）→ wrapped 函数', () => {
    const guarded = withGuardrail(flyToTool, {});
    assert.equal(typeof guarded, 'function');
    assert.equal(guarded.guardrailMeta.toolName, 'flyToTool');
  });

  // ============ Group B: 启用后强制校验 ============
  await ok('B1: 启用 + 缺 attestation → workload_identity_attestation_missing', async () => {
    const guarded = withGuardrail(flyToTool, { workloadIdentity: { enabled: true, secret: SECRET } });
    await assert.rejects(
      () => guarded({}, {}),
      /workload_identity_attestation_missing/,
    );
  });
  await ok('B2: 启用 + 缺 secret → 被拒（secret_required）', async () => {
    const guarded = withGuardrail(flyToTool, { workloadIdentity: { enabled: true } }); // 无 secret
    await assert.rejects(
      () => guarded({}, { workloadAttestation: goodAttest }),
      /workload_identity_rejected:secret_required/,
    );
  });
  await ok('B3: 启用 + 合法 attestation → 执行成功', async () => {
    const guarded = withGuardrail(flyToTool, { workloadIdentity: { enabled: true, secret: SECRET } });
    const r = await guarded({ x: 1 }, { workloadAttestation: goodAttest });
    assert.equal(r.flown, true);
  });
  await ok('B4: 启用 + 篡改签名 → workload_identity_rejected:signature_mismatch', async () => {
    const bad = { ...goodAttest, signature: 'deadbeef' };
    const guarded = withGuardrail(flyToTool, { workloadIdentity: { enabled: true, secret: SECRET } });
    await assert.rejects(
      () => guarded({}, { workloadAttestation: bad }),
      /workload_identity_rejected:signature_mismatch/,
    );
  });
  await ok('B5: 启用 + 过期证明 → workload_identity_rejected:ts_expired', async () => {
    const old = signWorkloadAttestation(
      { toolName: 'flyToTool', userId: 'u1', sessionId: 's1' }, SECRET,
      { ts: Date.now() - 10 * 60 * 1000 },
    ).attestation;
    const guarded = withGuardrail(flyToTool, { workloadIdentity: { enabled: true, secret: SECRET, maxAgeMs: 60000 } });
    await assert.rejects(
      () => guarded({}, { workloadAttestation: old }),
      /workload_identity_rejected:ts_expired/,
    );
  });

  // ============ Group C: onRejected 回调 ============
  await ok('C1: onRejected 在缺 attestation 时被调用', async () => {
    let rejected = null;
    const guarded = withGuardrail(flyToTool, {
      workloadIdentity: { enabled: true, secret: SECRET },
      onRejected: (reason) => { rejected = reason; },
    });
    await guarded({}, {}).catch(() => {});
    assert.equal(rejected, 'workload_identity:attestation_missing');
  });
  await ok('C2: onRejected 在签名失配时被调用', async () => {
    let rejected = null;
    const bad = { ...goodAttest, signature: 'ff' };
    const guarded = withGuardrail(flyToTool, {
      workloadIdentity: { enabled: true, secret: SECRET },
      onRejected: (reason) => { rejected = reason; },
    });
    await guarded({}, { workloadAttestation: bad }).catch(() => {});
    assert.equal(rejected, 'workload_identity:signature_mismatch');
  });

  // ============ Group D: expectedIdentity 绑定 + nonce 防重放 ============
  await ok('D1: expectedIdentity 绑定不匹配 → identity_mismatch', async () => {
    const guarded = withGuardrail(flyToTool, {
      workloadIdentity: {
        enabled: true, secret: SECRET,
        expectedIdentity: { userId: 'someone-else' },
      },
    });
    await assert.rejects(
      () => guarded({}, { workloadAttestation: goodAttest }),
      /workload_identity_rejected:identity_mismatch/,
    );
  });
  await ok('D2: expectedIdentity 匹配 → 执行成功', async () => {
    const guarded = withGuardrail(flyToTool, {
      workloadIdentity: {
        enabled: true, secret: SECRET,
        expectedIdentity: { userId: 'u1', sessionId: 's1' },
      },
    });
    const r = await guarded({}, { workloadAttestation: goodAttest });
    assert.equal(r.flown, true);
  });
  await ok('D3: nonce 防重放（共享 seenNonces）→ 第二次被拒', async () => {
    const seen = new Set();
    const mkOpts = () => withGuardrail(flyToTool, {
      workloadIdentity: { enabled: true, secret: SECRET, seenNonces: seen },
    });
    const att = signWorkloadAttestation({ toolName: 'flyToTool', userId: 'u1', sessionId: 's1' }, SECRET).attestation;
    await mkOpts()({}, { workloadAttestation: att }); // 第一次通过
    seen.add(att.nonce);
    await assert.rejects(
      () => mkOpts()({}, { workloadAttestation: att }),
      /workload_identity_rejected:nonce_replay/,
    );
  });

  // ============ Group E: 与其它门共存 + 端到端 ============
  await ok('E1: workload identity 与 allowlist 共存 — allowlist 拒绝优先', async () => {
    const guarded = withGuardrail(flyToTool, {
      allowlist: ['otherTool'], // flyToTool 不在白名单
      workloadIdentity: { enabled: true, secret: SECRET },
    });
    await assert.rejects(() => guarded({}, { workloadAttestation: goodAttest }), /tool_not_in_allowlist/);
  });
  await ok('E2: workload identity 与 HITL 共存 — HITL 拒绝优先', async () => {
    function dropTool() { return { dropped: true }; }
    const guarded = withGuardrail(dropTool, {
      dangerousActionsRequireHITL: ['dropTool'],
      workloadIdentity: { enabled: true, secret: SECRET },
    });
    // 无 hitlApproved → HITL 先拦截
    await assert.rejects(
      () => guarded({}, { workloadAttestation: goodAttest }),
      /dangerous_action_requires_hitl/,
    );
  });
  await ok('E3: 端到端 sign→guard→execute 全绿（合法工作负载）', async () => {
    const att = signWorkloadAttestation({ toolName: 'flyToTool', userId: 'u1', sessionId: 's1' }, SECRET).attestation;
    const guarded = withGuardrail(flyToTool, { workloadIdentity: { enabled: true, secret: SECRET } });
    const r = await guarded({ lat: 39.9 }, { workloadAttestation: att });
    assert.deepEqual(r.payload, { lat: 39.9 });
    assert.equal(r.flown, true);
  });
  await ok('E4: verifyWorkloadAttestation 直接复用一致（防御回归）', () => {
    const att = signWorkloadAttestation({ toolName: 'flyToTool', userId: 'u1', sessionId: 's1' }, SECRET).attestation;
    assert.equal(verifyWorkloadAttestation(att, SECRET).valid, true);
  });
  await ok('E5: 启用但 ctx 为空对象 → attestation_missing（不抛 TypeError）', async () => {
    const guarded = withGuardrail(flyToTool, { workloadIdentity: { enabled: true, secret: SECRET } });
    await assert.rejects(() => guarded({}), /workload_identity_attestation_missing/);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});