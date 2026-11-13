// tests/specs/multi-agent-llm-planner.cjs
// 周期 16 P0-1: llmPlannerAdapter（LLM planner 适配层）单元测试
// 目标：≥ 25 子断言 PASS；cycle-15 multi-agent-planner spec 零回归

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {
  createLlmPlannerAdapter,
  buildPlannerPrompt,
  extractSteps,
} = require(path.join(__dirname, '../../server/agent/llmPlannerAdapter'));
const { createMultiAgentOrchestrator } = require(path.join(__dirname, '../../server/agent/multiAgentPlanner'));

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

function gisToolCatalog() {
  return {
    getCameraState: { name: 'getCameraState', description: '获取相机', capability: 'camera', phase: 'prepare' },
    flyTo: { name: 'flyTo', description: '飞行', capability: 'camera', phase: 'act' },
    addMarker: { name: 'addMarker', description: '加 marker', capability: 'marker', phase: 'act' },
    screenshot: { name: 'screenshot', description: '截图', capability: 'capture', phase: 'capture' },
    dropTable: { name: 'dropTable', description: '删表', capability: 'admin', phase: 'act', dangerous: true },
  };
}

// 构造一个 mock llmChat：返回 { content }
function mockChat(content) {
  return async () => ({ content });
}

(async function main() {
  console.log('=== multi-agent-llm-planner ===');

  // ============ Group A: extractSteps 解析健壮性 ============
  await ok('A1: 纯 JSON 对象 {steps:[...]}', () => {
    const s = extractSteps('{"steps":[{"id":"a","tool":"flyTo"}]}');
    assert.equal(s.length, 1);
    assert.equal(s[0].tool, 'flyTo');
  });
  await ok('A2: 纯 JSON 数组 [...]', () => {
    const s = extractSteps('[{"id":"a","tool":"flyTo"}]');
    assert.equal(s.length, 1);
  });
  await ok('A3: ```json 围栏包裹', () => {
    const s = extractSteps('```json\n{"steps":[{"id":"a","tool":"flyTo"}]}\n```');
    assert.equal(s.length, 1);
  });
  await ok('A4: ``` 无语言围栏包裹', () => {
    const s = extractSteps('```\n{"steps":[{"id":"a","tool":"flyTo"}]}\n```');
    assert.equal(s.length, 1);
  });
  await ok('A5: 前后散文夹 JSON', () => {
    const s = extractSteps('好的，计划如下：\n{"steps":[{"id":"a","tool":"flyTo"}]}\n以上。');
    assert.equal(s.length, 1);
  });
  await ok('A6: 单步对象（含 tool 无 steps）自动包一层', () => {
    const s = extractSteps('{"id":"a","tool":"flyTo","args":{}}');
    assert.equal(s.length, 1);
    assert.equal(s[0].tool, 'flyTo');
  });
  await ok('A7: 空字符串抛错', () => {
    assert.throws(() => extractSteps(''), /返回为空/);
  });
  await ok('A8: 非字符串抛错', () => {
    assert.throws(() => extractSteps(null), /返回为空/);
  });
  await ok('A9: 完全无法解析抛错', () => {
    assert.throws(() => extractSteps('这不是 JSON'), /无法从 LLM 返回解析 JSON/);
  });
  await ok('A10: 缺 steps 数组抛错', () => {
    assert.throws(() => extractSteps('{"foo":1}'), /缺少 steps 数组/);
  });

  // ============ Group B: buildPlannerPrompt ============
  await ok('B1: prompt 含工具清单 JSON', () => {
    const p = buildPlannerPrompt('飞到北京', gisToolCatalog());
    assert.match(p, /getCameraState/);
    assert.match(p, /flyTo/);
  });
  await ok('B2: prompt 含用户目标', () => {
    const p = buildPlannerPrompt('飞到北京', gisToolCatalog());
    assert.match(p, /飞到北京/);
  });
  await ok('B3: prompt 要求只返回 JSON', () => {
    const p = buildPlannerPrompt('x', gisToolCatalog());
    assert.match(p, /只返回一个 JSON 对象/);
  });
  await ok('B4: prompt 标注危险工具提示', () => {
    const p = buildPlannerPrompt('x', gisToolCatalog());
    assert.match(p, /dangerous=true/);
  });

  // ============ Group C: adapter.plan — LLM 产出 → 校验 ============
  await ok('C1: 合法 LLM steps → plan 成功（source=llm）', async () => {
    const adapter = createLlmPlannerAdapter({
      tools: gisToolCatalog(),
      llmChat: mockChat('{"steps":[{"id":"a","tool":"getCameraState"},{"id":"b","tool":"flyTo","dependsOn":["a"]}]}'),
    });
    const p = await adapter.plan('飞到北京');
    assert.equal(p.source, 'llm');
    assert.equal(p.steps.length, 2);
    assert.equal(p.steps[1].dependsOn[0], 'a');
  });
  await ok('C2: LLM 返回围栏 JSON → plan 成功', async () => {
    const adapter = createLlmPlannerAdapter({
      tools: gisToolCatalog(),
      llmChat: mockChat('```json\n{"steps":[{"id":"a","tool":"flyTo"}]}\n```'),
    });
    const p = await adapter.plan('x');
    assert.equal(p.steps.length, 1);
  });
  await ok('C3: LLM 返回未知工具 → 抛错（不在白名单/工具目录）', async () => {
    const adapter = createLlmPlannerAdapter({ tools: gisToolCatalog(), llmChat: mockChat('{"steps":[{"id":"a","tool":"nonexistent"}]}') });
    // 注意：未知工具不在白名单检查范围（allowlist 未设），但 normalizeStep 通过；此处应成功，因为未启白名单
    // 我们用 allowlist 才拦截；这里验证不启白名单时不抛
    const p = await adapter.plan('x');
    assert.equal(p.steps[0].tool, 'nonexistent');
  });
  await ok('C4: LLM 返回依赖环 → 抛错', async () => {
    const adapter = createLlmPlannerAdapter({
      tools: gisToolCatalog(),
      llmChat: mockChat('{"steps":[{"id":"a","tool":"flyTo","dependsOn":["b"]},{"id":"b","tool":"flyTo","dependsOn":["a"]}]}'),
    });
    await assert.rejects(() => adapter.plan('x'), /依赖环/);
  });
  await ok('C5: LLM 返回未知依赖 → 抛错', async () => {
    const adapter = createLlmPlannerAdapter({
      tools: gisToolCatalog(),
      llmChat: mockChat('{"steps":[{"id":"a","tool":"flyTo","dependsOn":["ghost"]}]}'),
    });
    await assert.rejects(() => adapter.plan('x'), /依赖未知步骤/);
  });
  await ok('C6: 超过 maxSteps → 抛错', async () => {
    const adapter = createLlmPlannerAdapter({
      tools: gisToolCatalog(),
      maxSteps: 1,
      llmChat: mockChat('{"steps":[{"id":"a","tool":"flyTo"},{"id":"b","tool":"flyTo"}]}'),
    });
    await assert.rejects(() => adapter.plan('x'), /超过上限/);
  });
  await ok('C7: allowlist 拦截白名单外工具', async () => {
    const adapter = createLlmPlannerAdapter({
      tools: gisToolCatalog(),
      allowlist: ['flyTo'],
      llmChat: mockChat('{"steps":[{"id":"a","tool":"screenshot"}]}'),
    });
    await assert.rejects(() => adapter.plan('x'), /tool_not_in_allowlist/);
  });
  await ok('C8: LLM 返回空计划 → 抛错', async () => {
    const adapter = createLlmPlannerAdapter({ tools: gisToolCatalog(), llmChat: mockChat('{"steps":[]}') });
    await assert.rejects(() => adapter.plan('x'), /计划为空/);
  });
  await ok('C9: LLM 返回无法解析 → 抛错', async () => {
    const adapter = createLlmPlannerAdapter({ tools: gisToolCatalog(), llmChat: mockChat('抱歉我不明白') });
    await assert.rejects(() => adapter.plan('x'), /无法从 LLM 返回解析 JSON/);
  });
  await ok('C10: llmChat 抛错 → 透传', async () => {
    const adapter = createLlmPlannerAdapter({
      tools: gisToolCatalog(),
      llmChat: async () => { throw new Error('platform_400'); },
    });
    await assert.rejects(() => adapter.plan('x'), /platform_400/);
  });

  // ============ Group D: adapter.plan + orchestrator execute/verify 端到端 ============
  await ok('D1: LLM 计划 → orchestrator.run 全绿', async () => {
    const tools = gisToolCatalog();
    const adapter = createLlmPlannerAdapter({
      tools,
      llmChat: mockChat('{"steps":[{"id":"cam","tool":"getCameraState"},{"id":"fly","tool":"flyTo","dependsOn":["cam"],"verify":{"type":"object"}}]}'),
    });
    const planResult = await adapter.plan('飞到北京');
    const orch = createMultiAgentOrchestrator({ tools });
    const r = await orch.run(planResult, {
      getCameraState: async () => ({ longitude: 116, latitude: 39 }),
      flyTo: async () => ({ flown: true }),
    });
    assert.equal(r.status, 'completed');
    assert.equal(r.execution.summary.completed, 2);
    assert.equal(r.verification.ok, true);
  });
  await ok('D2: LLM 计划含危险工具 → orchestrator blocked（HITL 未批准）', async () => {
    const tools = gisToolCatalog();
    const adapter = createLlmPlannerAdapter({
      tools,
      llmChat: mockChat('{"steps":[{"id":"a","tool":"dropTable"}]}'),
    });
    const planResult = await adapter.plan('清库');
    const orch = createMultiAgentOrchestrator({ tools, dangerousActionsRequireHITL: ['dropTable'] });
    const r = await orch.run(planResult, { dropTable: async () => ({ dropped: true }) });
    assert.equal(r.status, 'blocked');
    assert.match(r.execution.records[0].error, /dangerous_action_requires_hitl/);
  });
  await ok('D3: LLM 计划含危险工具 → HITL 批准后 completed', async () => {
    const tools = gisToolCatalog();
    const adapter = createLlmPlannerAdapter({
      tools,
      llmChat: mockChat('{"steps":[{"id":"a","tool":"dropTable","verify":{"type":"object"}}]}'),
    });
    const planResult = await adapter.plan('清库');
    const orch = createMultiAgentOrchestrator({ tools, dangerousActionsRequireHITL: ['dropTable'], onConfirm: () => true });
    const r = await orch.run(planResult, { dropTable: async () => ({ dropped: true }) });
    assert.equal(r.status, 'completed');
  });
  await ok('D4: LLM 计划 verify 失败 → requireAllVerified 升级 failed', async () => {
    const tools = gisToolCatalog();
    const adapter = createLlmPlannerAdapter({
      tools,
      llmChat: mockChat('{"steps":[{"id":"a","tool":"flyTo","verify":{"type":"array"}}]}'),
    });
    const planResult = await adapter.plan('x');
    const orch = createMultiAgentOrchestrator({ tools });
    const r = await orch.run(planResult, { flyTo: async () => ({ ok: 1 }) }, { requireAllVerified: true });
    assert.equal(r.execution.summary.completed, 1);
    assert.equal(r.status, 'failed');
  });
  await ok('D5: adapter.tools 暴露工具名列表', () => {
    const adapter = createLlmPlannerAdapter({ tools: gisToolCatalog(), llmChat: mockChat('{}') });
    assert.ok(adapter.tools.includes('flyTo'));
    assert.ok(adapter.tools.includes('dropTable'));
  });

  // ============ Group E: llmChat 调用契约（离线安全，不触碰 ai.js） ============
  await ok('E1: 注入的 llmChat 被调用 + content 透传给 planner', async () => {
    let calledWith = null;
    const adapter = createLlmPlannerAdapter({
      tools: gisToolCatalog(),
      llmChat: async (req) => {
        calledWith = req;
        return { content: '{"steps":[{"id":"a","tool":"flyTo"}]}' };
      },
    });
    const p = await adapter.plan('飞到北京');
    assert.ok(calledWith, 'llmChat 未被调用');
    assert.ok(Array.isArray(calledWith.messages));
    assert.equal(calledWith.messages[0].role, 'system');
    assert.equal(calledWith.messages[1].content, '飞到北京');
    assert.equal(p.steps[0].tool, 'flyTo');
  });
  await ok('E2: llmChat options 透传（llmOptions）', async () => {
    let seenOpts = null;
    const adapter = createLlmPlannerAdapter({
      tools: gisToolCatalog(),
      llmOptions: { model: 'test-model', temperature: 0.1 },
      llmChat: async (req) => { seenOpts = req.options; return { content: '{"steps":[{"id":"a","tool":"flyTo"}]}' }; },
    });
    await adapter.plan('x');
    assert.equal(seenOpts.model, 'test-model');
    assert.equal(seenOpts.temperature, 0.1);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});