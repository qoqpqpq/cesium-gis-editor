// tests/specs/multi-agent-planner.cjs
// 周期 15 P0-1: multiAgentPlanner (planner + executor + verifier) 单元测试
// 目标：≥ 25 子断言 PASS

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {
  createMultiAgentOrchestrator,
  normalizeStep,
  detectCycle,
  DEFAULT_DANGEROUS_ACTIONS,
} = require(path.join(__dirname, '../../server/agent/multiAgentPlanner'));

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

// 构造一个 GIS 工具目录（capability + phase），用于 planner 按能力编排
function gisToolCatalog() {
  return {
    getCameraState: { name: 'getCameraState', description: '获取相机', capability: 'camera', phase: 'prepare', inputSchema: { type: 'object' } },
    flyTo: { name: 'flyTo', description: '飞行', capability: 'camera', phase: 'act', inputSchema: { type: 'object' } },
    addMarker: { name: 'addMarker', description: '加 marker', capability: 'marker', phase: 'act', inputSchema: { type: 'object' } },
    spatialQuery: { name: 'spatialQuery', description: '空间查询', capability: 'analysis', phase: 'act', inputSchema: { type: 'object' } },
    screenshot: { name: 'screenshot', description: '截图', capability: 'capture', phase: 'capture', inputSchema: { type: 'object' } },
  };
}

(async function main() {
  console.log('=== multi-agent-planner ===');

  // ============ Group A: normalizeStep ============
  await ok('A1: 合法步骤规范化（补默认 args/dependsOn/phase）', () => {
    const s = normalizeStep({ id: 's1', tool: 'flyTo' }, 0);
    assert.equal(s.id, 's1');
    assert.equal(s.tool, 'flyTo');
    assert.deepEqual(s.args, {});
    assert.deepEqual(s.dependsOn, []);
    assert.equal(s.phase, 'act');
  });
  await ok('A2: 保留显式 args/dependsOn/verify', () => {
    const s = normalizeStep({ id: 's2', tool: 't', args: { a: 1 }, dependsOn: ['s1'], verify: { type: 'object' }, phase: 'prepare' }, 0);
    assert.deepEqual(s.args, { a: 1 });
    assert.deepEqual(s.dependsOn, ['s1']);
    assert.deepEqual(s.verify, { type: 'object' });
    assert.equal(s.phase, 'prepare');
  });
  await ok('A3: 缺 id 抛错', () => {
    assert.throws(() => normalizeStep({ tool: 't' }, 0), /缺少 id/);
  });
  await ok('A4: 缺 tool 抛错', () => {
    assert.throws(() => normalizeStep({ id: 'x' }, 0), /缺少 tool/);
  });
  await ok('A5: 非对象抛错', () => {
    assert.throws(() => normalizeStep(null, 0), /不是对象/);
  });

  // ============ Group B: detectCycle ============
  await ok('B1: 无环返回 null', () => {
    const g = new Map([['a', ['b']], ['b', []]]);
    assert.equal(detectCycle(g), null);
  });
  await ok('B2: 有环返回环中节点', () => {
    const g = new Map([['a', ['b']], ['b', ['a']]]);
    assert.ok(detectCycle(g) !== null);
  });
  await ok('B3: 自环检测', () => {
    const g = new Map([['a', ['a']]]);
    assert.equal(detectCycle(g), 'a');
  });
  await ok('B4: 未知依赖不误判为环（由 plan 层报错）', () => {
    const g = new Map([['a', ['ghost']]]);
    assert.equal(detectCycle(g), null);
  });

  // ============ Group C: planner — 显式 steps ============
  await ok('C1: 显式 steps 生成计划', () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    const p = o.plan({ steps: [{ id: 'a', tool: 'getCameraState' }, { id: 'b', tool: 'flyTo', dependsOn: ['a'] }] });
    assert.equal(p.steps.length, 2);
    assert.equal(p.steps[1].dependsOn[0], 'a');
    assert.ok(p.createdAt);
  });
  await ok('C2: 依赖未知步骤抛错', () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    assert.throws(() => o.plan({ steps: [{ id: 'a', tool: 't', dependsOn: ['ghost'] }] }), /依赖未知步骤/);
  });
  await ok('C3: 依赖环抛错', () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    assert.throws(() => o.plan({ steps: [{ id: 'a', tool: 't', dependsOn: ['b'] }, { id: 'b', tool: 't', dependsOn: ['a'] }] }), /依赖环/);
  });
  await ok('C4: 空计划抛错', () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    assert.throws(() => o.plan({ steps: [] }), /计划为空/);
  });
  await ok('C5: 非法 goal 抛错', () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    assert.throws(() => o.plan({}), /需要 steps 或 capabilities/);
  });
  await ok('C6: 超过 maxSteps 抛错', () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog(), maxSteps: 2 });
    const steps = [{ id: 'a', tool: 'flyTo' }, { id: 'b', tool: 'flyTo' }, { id: 'c', tool: 'flyTo' }];
    assert.throws(() => o.plan({ steps }), /超过上限/);
  });

  // ============ Group D: planner — 按 capability 编排 ============
  await ok('D1: 按 capability 选工具', () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    const p = o.plan({ capabilities: ['camera'] });
    const toolNames = p.steps.map((s) => s.tool).sort();
    assert.deepEqual(toolNames, ['flyTo', 'getCameraState']);
  });
  await ok('D2: 按 phase 排序（prepare 在 act 前）', () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    const p = o.plan({ capabilities: ['camera', 'capture'] });
    const idxCam = p.steps.findIndex((s) => s.tool === 'getCameraState');
    const idxShot = p.steps.findIndex((s) => s.tool === 'screenshot');
    assert.ok(idxCam < idxShot);
  });
  await ok('D3: capability 注入 args', () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    const p = o.plan({ capabilities: ['marker'], args: { addMarker: { longitude: 1, latitude: 2 } } });
    const mk = p.steps.find((s) => s.tool === 'addMarker');
    assert.deepEqual(mk.args, { longitude: 1, latitude: 2 });
  });
  await ok('D4: 未匹配 capability → 空计划抛错', () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    assert.throws(() => o.plan({ capabilities: ['nonexistent'] }), /计划为空/);
  });

  // ============ Group E: planner — 白名单（fail-fast） ============
  await ok('E1: 白名单内工具通过', () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog(), allowlist: ['flyTo', 'addMarker'] });
    const p = o.plan({ steps: [{ id: 'a', tool: 'flyTo' }] });
    assert.equal(p.steps[0].tool, 'flyTo');
  });
  await ok('E2: 白名单外工具抛错', () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog(), allowlist: ['flyTo'] });
    assert.throws(() => o.plan({ steps: [{ id: 'a', tool: 'screenshot' }] }), /tool_not_in_allowlist/);
  });

  // ============ Group F: executor — 基础执行 ============
  await ok('F1: 顺序执行 + 依赖传值', async () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    const calls = [];
    const handlers = {
      getCameraState: async () => { calls.push('cam'); return { longitude: 1, latitude: 2 }; },
      flyTo: async (args) => { calls.push('fly'); return { flown: true, args }; },
    };
    const p = o.plan({ steps: [
      { id: 'cam', tool: 'getCameraState' },
      { id: 'fly', tool: 'flyTo', dependsOn: ['cam'], args: { height: 1000 } },
    ] });
    const ex = await o.execute(p, handlers);
    assert.equal(ex.summary.completed, 2);
    assert.deepEqual(calls, ['cam', 'fly']);
    const flyRec = ex.records.find((r) => r.id === 'fly');
    assert.equal(flyRec.result.flown, true);
  });
  await ok('F2: 独立步骤并行执行', async () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    let active = 0, maxActive = 0;
    const slow = () => new Promise((res) => {
      active += 1; maxActive = Math.max(maxActive, active);
      setTimeout(() => { active -= 1; res({ ok: 1 }); }, 20);
    });
    const p = o.plan({ steps: [
      { id: 'a', tool: 'addMarker' }, { id: 'b', tool: 'addMarker' }, { id: 'c', tool: 'addMarker' },
    ] });
    const ex = await o.execute(p, { addMarker: slow });
    assert.equal(ex.summary.completed, 3);
    assert.ok(maxActive >= 2, `期望并行，maxActive=${maxActive}`);
  });
  await ok('F3: handler 缺失 → failed', async () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    const p = o.plan({ steps: [{ id: 'a', tool: 'flyTo' }] });
    const ex = await o.execute(p, {});
    assert.equal(ex.records[0].status, 'failed');
    assert.match(ex.records[0].error, /handler_not_found/);
  });
  await ok('F4: handler 抛错 → failed 记录错误', async () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    const p = o.plan({ steps: [{ id: 'a', tool: 'flyTo' }] });
    const ex = await o.execute(p, { flyTo: async () => { throw new Error('viewer 未注入'); } });
    assert.equal(ex.records[0].status, 'failed');
    assert.match(ex.records[0].error, /viewer 未注入/);
  });
  await ok('F5: 上游失败 → 下游 skipped（upstream_failed）', async () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    const p = o.plan({ steps: [
      { id: 'a', tool: 'flyTo' }, { id: 'b', tool: 'addMarker', dependsOn: ['a'] },
    ] });
    const ex = await o.execute(p, { flyTo: async () => { throw new Error('boom'); }, addMarker: async () => ({ ok: 1 }) });
    const a = ex.records.find((r) => r.id === 'a');
    const b = ex.records.find((r) => r.id === 'b');
    assert.equal(a.status, 'failed');
    assert.equal(b.status, 'skipped');
    assert.match(b.error, /upstream_failed:a/);
  });

  // ============ Group G: executor — HITL 门 ============
  await ok('G1: 危险操作无 onConfirm → blocked', async () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog(), dangerousActionsRequireHITL: ['rm'] });
    const p = o.plan({ steps: [{ id: 'a', tool: 'rm' }] });
    const ex = await o.execute(p, { rm: async () => ({ deleted: true }) });
    assert.equal(ex.records[0].status, 'blocked');
    assert.match(ex.records[0].error, /dangerous_action_requires_hitl/);
  });
  await ok('G2: HITL 拒绝 → blocked（hitl_rejected）', async () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog(), dangerousActionsRequireHITL: ['rm'], onConfirm: () => false });
    const p = o.plan({ steps: [{ id: 'a', tool: 'rm' }] });
    const ex = await o.execute(p, { rm: async () => ({ deleted: true }) });
    assert.equal(ex.records[0].status, 'blocked');
    assert.match(ex.records[0].error, /hitl_rejected/);
  });
  await ok('G3: HITL 批准 → 正常执行', async () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog(), dangerousActionsRequireHITL: ['rm'], onConfirm: () => true });
    const p = o.plan({ steps: [{ id: 'a', tool: 'rm' }] });
    const ex = await o.execute(p, { rm: async () => ({ deleted: true }) });
    assert.equal(ex.records[0].status, 'completed');
    assert.deepEqual(ex.records[0].result, { deleted: true });
  });
  await ok('G4: 非危险操作不走 HITL', async () => {
    let confirmCalled = false;
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog(), dangerousActionsRequireHITL: ['rm'], onConfirm: () => { confirmCalled = true; return false; } });
    const p = o.plan({ steps: [{ id: 'a', tool: 'flyTo' }] });
    const ex = await o.execute(p, { flyTo: async () => ({ ok: 1 }) });
    assert.equal(ex.records[0].status, 'completed');
    assert.equal(confirmCalled, false);
  });
  await ok('G5: tools 目录 dangerous:true 标记同样触发 HITL', async () => {
    const tools = { purge: { name: 'purge', capability: 'cleanup', phase: 'act', dangerous: true } };
    const o = createMultiAgentOrchestrator({ tools, onConfirm: () => true });
    const p = o.plan({ steps: [{ id: 'a', tool: 'purge' }] });
    const ex = await o.execute(p, { purge: async () => ({ purged: 1 }) });
    assert.equal(ex.records[0].status, 'completed');
  });

  // ============ Group H: verifier ============
  await ok('H1: type 校验通过', async () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    const p = o.plan({ steps: [{ id: 'a', tool: 'flyTo', verify: { type: 'object' } }] });
    const ex = await o.execute(p, { flyTo: async () => ({ ok: 1 }) });
    const v = o.verify(p, ex);
    assert.equal(v.checks[0].ok, true);
    assert.equal(v.ok, true);
  });
  await ok('H2: type 不匹配 → 失败', async () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    const p = o.plan({ steps: [{ id: 'a', tool: 'flyTo', verify: { type: 'array' } }] });
    const ex = await o.execute(p, { flyTo: async () => ({ ok: 1 }) });
    const v = o.verify(p, ex);
    assert.equal(v.checks[0].ok, false);
    assert.match(v.checks[0].reason, /type_mismatch/);
  });
  await ok('H3: required 缺 key → 失败', async () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    const p = o.plan({ steps: [{ id: 'a', tool: 'flyTo', verify: { type: 'object', required: ['x', 'y'] } }] });
    const ex = await o.execute(p, { flyTo: async () => ({ x: 1 }) });
    const v = o.verify(p, ex);
    assert.equal(v.checks[0].ok, false);
    assert.match(v.checks[0].reason, /missing_keys:y/);
  });
  await ok('H4: equals 校验通过/失败', async () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    const pOk = o.plan({ steps: [{ id: 'a', tool: 'flyTo', verify: { equals: { n: 5 } } }] });
    const exOk = await o.execute(pOk, { flyTo: async () => ({ n: 5 }) });
    assert.equal(o.verify(pOk, exOk).ok, true);
    const pBad = o.plan({ steps: [{ id: 'a', tool: 'flyTo', verify: { equals: { n: 6 } } }] });
    const exBad = await o.execute(pBad, { flyTo: async () => ({ n: 5 }) });
    assert.match(o.verify(pBad, exBad).checks[0].reason, /equals_mismatch/);
  });
  await ok('H5: 无契约的 completed 步骤视为通过', async () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    const p = o.plan({ steps: [{ id: 'a', tool: 'flyTo' }] });
    const ex = await o.execute(p, { flyTo: async () => (1) });
    const v = o.verify(p, ex);
    assert.equal(v.checks[0].reason, 'no_contract');
    assert.equal(v.ok, true);
  });
  await ok('H6: 非 completed 步骤 verifier 标记失败', async () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    const p = o.plan({ steps: [{ id: 'a', tool: 'flyTo', verify: { type: 'object' } }] });
    const ex = await o.execute(p, {}); // handler 缺失 → failed
    const v = o.verify(p, ex);
    assert.equal(v.checks[0].ok, false);
    assert.match(v.checks[0].reason, /step_failed/);
  });

  // ============ Group I: run 一站式 + summary ============
  await ok('I1: run 全绿 → status completed', async () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    const r = await o.run(
      { steps: [{ id: 'a', tool: 'flyTo', verify: { type: 'object' } }] },
      { flyTo: async () => ({ ok: 1 }) },
    );
    assert.equal(r.status, 'completed');
    assert.equal(r.execution.summary.completed, 1);
    assert.equal(r.verification.summary.passed, 1);
  });
  await ok('I2: run 含失败 → status failed', async () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    const r = await o.run({ steps: [{ id: 'a', tool: 'flyTo' }] }, {}); // handler 缺失
    assert.equal(r.status, 'failed');
    assert.equal(r.execution.summary.failed, 1);
  });
  await ok('I3: run 含 blocked → status blocked', async () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog(), dangerousActionsRequireHITL: ['rm'] });
    const r = await o.run({ steps: [{ id: 'a', tool: 'rm' }] }, { rm: async () => ({}) });
    assert.equal(r.status, 'blocked');
  });
  await ok('I4: requireAllVerified 把 verify 失败升级为 failed', async () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    const r = await o.run(
      { steps: [{ id: 'a', tool: 'flyTo', verify: { type: 'array' } }] },
      { flyTo: async () => ({ ok: 1 }) },
      { requireAllVerified: true },
    );
    assert.equal(r.execution.summary.completed, 1); // 执行成功
    assert.equal(r.status, 'failed'); // 但 verify 失败 → 升级
  });
  await ok('I5: summary 计数自洽（total = 各状态之和）', async () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    const r = await o.run({ steps: [
      { id: 'a', tool: 'flyTo' }, // completed
      { id: 'b', tool: 'screenshot', dependsOn: ['a'] }, // completed
    ] }, { flyTo: async () => ({ ok: 1 }), screenshot: async () => ({ ok: 1 }) });
    const s = r.execution.summary;
    assert.equal(s.total, s.completed + s.failed + s.blocked + s.skipped);
  });

  // ============ Group J: 常量与边界 ============
  await ok('J1: DEFAULT_DANGEROUS_ACTIONS 含 delete/drop/execute/rm/payment', () => {
    for (const k of ['delete', 'drop', 'execute', 'rm', 'payment']) {
      assert.ok(DEFAULT_DANGEROUS_ACTIONS.includes(k));
    }
  });
  await ok('J2: 空配置（无 tools）plan 显式 steps 仍可用', () => {
    const o = createMultiAgentOrchestrator({});
    const p = o.plan({ steps: [{ id: 'a', tool: 'anything' }] });
    assert.equal(p.steps.length, 1);
  });
  await ok('J3: execute 非法 planResult 抛错', async () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    await assert.rejects(() => o.execute(null, {}), /planResult 非法/);
  });
  await ok('J4: verify 非法 execution 抛错', () => {
    const o = createMultiAgentOrchestrator({ tools: gisToolCatalog() });
    const p = o.plan({ steps: [{ id: 'a', tool: 'flyTo' }] });
    assert.throws(() => o.verify(p, null), /execution 非法/);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});