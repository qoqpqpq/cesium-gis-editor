// tests/specs/agent-multi-agent.cjs
// 周期 15 R3: Multi-agent GIS Agent — planner + executor + verifier 架构
// 目标：≥ 25 PASS
//
// 覆盖：
//   - 模块导出
//   - parsePlan / parseExecutorResult / parseVerification
//   - extractJson（多种格式）
//   - createPlannerAgent（5 场景）
//   - createExecutorAgent（5 场景）
//   - createVerifierAgent（3 场景）
//   - runOrchestratedTask（8 场景）

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const {
  createPlannerAgent,
  createExecutorAgent,
  createVerifierAgent,
  runOrchestratedTask,
  MAX_PLAN_STEPS,
  MAX_EXECUTOR_RETRIES,
  MAX_VERIFIER_ITERATIONS,
  DEFAULT_TIMEOUT_MS,
  _internal,
} = require(path.join(__dirname, '../../server/services/agentOrchestrator'));

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

// ---- Mock LLM call ----
function mockLlm(response, delayMs = 0) {
  return async (messages, opts) => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    if (response && typeof response === 'function') {
      return { content: response(messages, opts) };
    }
    return { content: response };
  };
}

(async function main() {
  console.log('=== agent-multi-agent ===');

  // ============ Group A: 模块导出 ============
  await ok('A1: createPlannerAgent 已导出', () => {
    assert.equal(typeof createPlannerAgent, 'function');
  });
  await ok('A2: createExecutorAgent 已导出', () => {
    assert.equal(typeof createExecutorAgent, 'function');
  });
  await ok('A3: createVerifierAgent 已导出', () => {
    assert.equal(typeof createVerifierAgent, 'function');
  });
  await ok('A4: runOrchestratedTask 已导出', () => {
    assert.equal(typeof runOrchestratedTask, 'function');
  });
  await ok('A5: 常量导出', () => {
    assert.ok(MAX_PLAN_STEPS > 0);
    assert.ok(MAX_EXECUTOR_RETRIES > 0);
    assert.ok(MAX_VERIFIER_ITERATIONS > 0);
    assert.ok(DEFAULT_TIMEOUT_MS > 0);
  });
  await ok('A6: _internal 导出', () => {
    assert.equal(typeof _internal.parsePlan, 'function');
    assert.equal(typeof _internal.parseExecutorResult, 'function');
    assert.equal(typeof _internal.parseVerification, 'function');
    assert.equal(typeof _internal.extractJson, 'function');
  });

  // ============ Group B: parsePlan ============
  await ok('B1: parsePlan 基本 JSON', () => {
    const r = _internal.parsePlan('{"steps":[{"description":"step1"},{"description":"step2"}]}');
    assert.equal(r.steps.length, 2);
    assert.equal(r.steps[0].description, 'step1');
  });
  await ok('B2: parsePlan markdown code block', () => {
    const r = _internal.parsePlan('```json\n{"steps":[{"description":"step1"}]}\n```');
    assert.equal(r.steps.length, 1);
  });
  await ok('B3: parsePlan 空 steps', () => {
    const r = _internal.parsePlan('{"steps":[]}');
    assert.equal(r.steps.length, 0);
  });
  await ok('B4: parsePlan 无 JSON', () => {
    const r = _internal.parsePlan('no json here');
    assert.equal(r.steps.length, 0);
  });
  await ok('B5: parsePlan truncated', () => {
    const r = _internal.parsePlan('{"steps":[],"truncated":true}');
    assert.equal(r.truncated, true);
  });

  // ============ Group C: parseExecutorResult ============
  await ok('C1: parseExecutorResult 有 toolCall', () => {
    const r = _internal.parseExecutorResult('{"toolCall":{"tool":"fetch","payload":{"url":"x"}},"output":"fetched"}');
    assert.equal(r.toolCall.tool, 'fetch');
    assert.equal(r.output, 'fetched');
  });
  await ok('C2: parseExecutorResult 无 toolCall', () => {
    const r = _internal.parseExecutorResult('{"output":"direct answer"}');
    assert.equal(r.toolCall, null);
    assert.equal(r.output, 'direct answer');
  });
  await ok('C3: parseExecutorResult 非 JSON', () => {
    const r = _internal.parseExecutorResult('plain text output');
    assert.equal(r.toolCall, null);
    assert.equal(r.output, 'plain text output');
  });

  // ============ Group D: parseVerification ============
  await ok('D1: parseVerification pass=true', () => {
    const r = _internal.parseVerification('{"pass":true,"score":95}');
    assert.equal(r.pass, true);
    assert.equal(r.score, 95);
  });
  await ok('D2: parseVerification pass=false + feedback', () => {
    const r = _internal.parseVerification('{"pass":false,"feedback":"wrong result","score":30}');
    assert.equal(r.pass, false);
    assert.equal(r.feedback, 'wrong result');
  });
  await ok('D3: parseVerification 非 JSON', () => {
    const r = _internal.parseVerification('just text');
    assert.equal(r.pass, true);
    assert.equal(r.score, null);
  });

  // ============ Group E: extractJson ============
  await ok('E1: extractJson 直接 JSON', () => {
    const r = _internal.extractJson('{"a":1}');
    assert.equal(r.a, 1);
  });
  await ok('E2: extractJson markdown code block', () => {
    const r = _internal.extractJson('```json\n{"a":1}\n```');
    assert.equal(r.a, 1);
  });
  await ok('E3: extractJson 嵌入文本', () => {
    const r = _internal.extractJson('Here is the result: {"a":1} done');
    assert.equal(r.a, 1);
  });
  await ok('E4: extractJson 无 JSON', () => {
    const r = _internal.extractJson('no json');
    assert.deepEqual(r, {});
  });

  // ============ Group F: createPlannerAgent ============
  await ok('F1: planner 基本调用', async () => {
    const planner = createPlannerAgent({
      llmCall: mockLlm('{"steps":[{"description":"step1"},{"description":"step2"}]}'),
    });
    const r = await planner('test task');
    assert.equal(r.ok, true);
    assert.equal(r.plan.steps.length, 2);
  });
  await ok('F2: planner maxSteps 截断', async () => {
    const steps = Array.from({ length: 25 }, (_, i) => ({ description: `step${i}` }));
    const planner = createPlannerAgent({
      llmCall: mockLlm(JSON.stringify({ steps })),
      maxSteps: 5,
    });
    const r = await planner('test task');
    assert.equal(r.plan.steps.length, 5);
    assert.equal(r.plan.truncated, true);
  });
  await ok('F3: planner LLM 错误', async () => {
    const planner = createPlannerAgent({
      llmCall: async () => { throw new Error('llm_error'); },
    });
    const r = await planner('test task');
    assert.equal(r.ok, false);
    assert.equal(r.error, 'llm_error');
  });
  await ok('F4: planner 缺 llmCall → 抛错', () => {
    assert.throws(() => createPlannerAgent({}), /must be a function/);
  });
  await ok('F5: planner 自定义 systemPrompt', async () => {
    let capturedPrompt = null;
    const planner = createPlannerAgent({
      llmCall: (messages) => {
        capturedPrompt = messages[0].content;
        return Promise.resolve({ content: '{"steps":[]}' });
      },
      systemPrompt: 'CUSTOM PROMPT',
    });
    await planner('test');
    assert.equal(capturedPrompt, 'CUSTOM PROMPT');
  });

  // ============ Group G: createExecutorAgent ============
  await ok('G1: executor 基本调用', async () => {
    const executor = createExecutorAgent({
      llmCall: mockLlm('{"output":"done"}'),
    });
    const r = await executor({ description: 'test step' });
    assert.equal(r.ok, true);
    assert.equal(r.result.output, 'done');
  });
  await ok('G2: executor 工具调用', async () => {
    const executor = createExecutorAgent({
      llmCall: mockLlm('{"toolCall":{"tool":"fetch","payload":{"url":"x"}},"output":"fetching"}'),
      executeTool: async (tool, payload) => ({ ok: true, data: 'result' }),
    });
    const r = await executor({ description: 'fetch data' });
    assert.equal(r.ok, true);
    assert.equal(r.result.toolResult.ok, true);
  });
  await ok('G3: executor 工具调用失败', async () => {
    const executor = createExecutorAgent({
      llmCall: mockLlm('{"toolCall":{"tool":"fetch","payload":{}},"output":"fetching"}'),
      executeTool: async () => { throw new Error('tool_error'); },
    });
    const r = await executor({ description: 'fetch data' });
    assert.equal(r.ok, true);
    assert.equal(r.result.toolResult.ok, false);
    assert.equal(r.result.toolResult.error, 'tool_error');
  });
  await ok('G4: executor 超时', async () => {
    const executor = createExecutorAgent({
      llmCall: mockLlm('{"output":"slow"}', 500),
      timeoutMs: 50,
    });
    const r = await executor({ description: 'test' });
    assert.equal(r.ok, false);
    assert.match(r.error, /timeout/);
  });
  await ok('G5: executor 缺 llmCall → 抛错', () => {
    assert.throws(() => createExecutorAgent({}), /must be a function/);
  });

  // ============ Group H: createVerifierAgent ============
  await ok('H1: verifier pass=true', async () => {
    const verifier = createVerifierAgent({
      llmCall: mockLlm('{"pass":true,"score":95}'),
    });
    const r = await verifier({ description: 'step' }, { output: 'result' });
    assert.equal(r.ok, true);
    assert.equal(r.verification.pass, true);
    assert.equal(r.verification.score, 95);
  });
  await ok('H2: verifier pass=false + feedback', async () => {
    const verifier = createVerifierAgent({
      llmCall: mockLlm('{"pass":false,"feedback":"wrong","score":30}'),
    });
    const r = await verifier({ description: 'step' }, { output: 'result' });
    assert.equal(r.ok, true);
    assert.equal(r.verification.pass, false);
    assert.equal(r.verification.feedback, 'wrong');
  });
  await ok('H3: verifier 缺 llmCall → 抛错', () => {
    assert.throws(() => createVerifierAgent({}), /must be a function/);
  });

  // ============ Group I: runOrchestratedTask ============
  await ok('I1: 完整流程（2 步，全通过）', async () => {
    const planJson = '{"steps":[{"description":"step1"},{"description":"step2"}]}';
    const result = await runOrchestratedTask(
      { description: 'test task' },
      {
        agents: {
          planner: createPlannerAgent({ llmCall: mockLlm(planJson) }),
          executor: createExecutorAgent({ llmCall: mockLlm('{"output":"done"}') }),
          verifier: createVerifierAgent({ llmCall: mockLlm('{"pass":true,"score":100}') }),
        },
      }
    );
    assert.equal(result.ok, true);
    assert.equal(result.results.length, 2);
    assert.equal(result.stats.planned, 2);
    assert.equal(result.stats.executed, 2);
    assert.equal(result.stats.verified, 2);
    assert.equal(result.errors.length, 0);
  });
  await ok('I2: 验证失败 + 重试', async () => {
    let verifyCount = 0;
    const result = await runOrchestratedTask(
      { description: 'test task' },
      {
        agents: {
          planner: createPlannerAgent({ llmCall: mockLlm('{"steps":[{"description":"step1"}]}') }),
          executor: createExecutorAgent({ llmCall: mockLlm('{"output":"result"}') }),
          verifier: createVerifierAgent({
            llmCall: async () => {
              verifyCount += 1;
              if (verifyCount < 3) return { content: '{"pass":false,"feedback":"try again"}' };
              return { content: '{"pass":true,"score":100}' };
            },
          }),
        },
        maxRetries: 3,
      }
    );
    assert.equal(result.ok, true);
    assert.ok(result.stats.retried >= 1);
    assert.ok(verifyCount >= 2);
  });
  await ok('I3: 执行失败', async () => {
    const result = await runOrchestratedTask(
      { description: 'test task' },
      {
        agents: {
          planner: createPlannerAgent({ llmCall: mockLlm('{"steps":[{"description":"step1"}]}') }),
          executor: createExecutorAgent({ llmCall: async () => { throw new Error('exec_error'); } }),
        },
        maxRetries: 1,
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].error, 'exec_error');
  });
  await ok('I4: 缺 planner → 拒绝', async () => {
    const result = await runOrchestratedTask(
      { description: 'test task' },
      { agents: { executor: createExecutorAgent({ llmCall: mockLlm('{"output":"done"}') }) } }
    );
    assert.equal(result.ok, false);
    assert.match(result.error, /planner/);
  });
  await ok('I5: 缺 executor → 拒绝', async () => {
    const result = await runOrchestratedTask(
      { description: 'test task' },
      { agents: { planner: createPlannerAgent({ llmCall: mockLlm('{"steps":[]}') }) } }
    );
    assert.equal(result.ok, false);
    assert.match(result.error, /executor/);
  });
  await ok('I6: 无 verifier（简化流程）', async () => {
    const result = await runOrchestratedTask(
      { description: 'test task' },
      {
        agents: {
          planner: createPlannerAgent({ llmCall: mockLlm('{"steps":[{"description":"step1"}]}') }),
          executor: createExecutorAgent({ llmCall: mockLlm('{"output":"done"}') }),
        },
      }
    );
    assert.equal(result.ok, true);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].verification, null);
    assert.equal(result.stats.verified, 0);
  });
  await ok('I7: 进度回调', async () => {
    const events = [];
    const result = await runOrchestratedTask(
      { description: 'test task' },
      {
        agents: {
          planner: createPlannerAgent({ llmCall: mockLlm('{"steps":[{"description":"step1"}]}') }),
          executor: createExecutorAgent({ llmCall: mockLlm('{"output":"done"}') }),
        },
        onProgress: (event, data) => events.push({ event, data }),
      }
    );
    assert.ok(events.some(e => e.event === 'planning'));
    assert.ok(events.some(e => e.event === 'plan_complete'));
    assert.ok(events.some(e => e.event === 'executing'));
    assert.ok(events.some(e => e.event === 'step_complete'));
  });
  await ok('I8: 多步骤 + 混合成功失败', async () => {
    let execCount = 0;
    const result = await runOrchestratedTask(
      { description: 'complex task' },
      {
        agents: {
          planner: createPlannerAgent({ llmCall: mockLlm('{"steps":[{"description":"s1"},{"description":"s2"},{"description":"s3"}]}') }),
          executor: createExecutorAgent({
            llmCall: async () => {
              execCount += 1;
              if (execCount === 2) throw new Error('mid_task_failure');
              return { content: '{"output":"ok"}' };
            },
          }),
        },
        maxRetries: 1,
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.results.length, 3);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].stepIndex, 1);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
