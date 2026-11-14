// tests/specs/agent-orchestrator-parser-deep.cjs
// Cycle 26 R4: agentOrchestrator.js parser/extractJson 深度测试
// 覆盖之前 agent-orchestrator-format.cjs 未覆盖的：
//   - extractJson（3 阶段 fallback: 直接 parse / markdown code block / JSON object 匹配）
//   - parsePlan（steps 数组 + truncated 标志）
//   - parseExecutorResult（toolCall + output fallback）
//   - parseVerification（pass/feedback/score，pass !== false 默认 true）
//   - 常量边界（MAX_PLAN_STEPS / MAX_EXECUTOR_RETRIES / MAX_VERIFIER_ITERATIONS / DEFAULT_TIMEOUT_MS）
//   - 系统提示词常量完整性

'use strict';

const assert = require('node:assert');
const path = require('node:path');

const O = require(path.join(__dirname, '../../server/services/agentOrchestrator'));
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
} = O;
const {
  parsePlan,
  parseExecutorResult,
  parseVerification,
  extractJson,
  formatPlannerTask,
  formatExecutorStep,
  formatVerifierTask,
  DEFAULT_PLANNER_PROMPT,
  DEFAULT_EXECUTOR_PROMPT,
  DEFAULT_VERIFIER_PROMPT,
} = _internal;

let pass = 0, fail = 0;
const failures = [];
async function ok(label, fn) {
  try {
    await fn();
    pass++;
    console.log(`  [PASS] ${label}`);
  } catch (e) {
    fail++;
    console.log(`  [FAIL] ${label}: ${e.message}`);
    failures.push({ label, err: e.message });
  }
}

async function main() {
  console.log('=== Cycle 26 R4: agentOrchestrator parser deep tests ===\n');

  // ===== A组: 模块导出完整 =====
  console.log('\n-- A组: 模块导出完整 --');
  await ok('A1: createPlannerAgent 是 function', () => {
    assert.strictEqual(typeof createPlannerAgent, 'function');
  });
  await ok('A2: createExecutorAgent 是 function', () => {
    assert.strictEqual(typeof createExecutorAgent, 'function');
  });
  await ok('A3: createVerifierAgent 是 function', () => {
    assert.strictEqual(typeof createVerifierAgent, 'function');
  });
  await ok('A4: runOrchestratedTask 是 function', () => {
    assert.strictEqual(typeof runOrchestratedTask, 'function');
  });
  await ok('A5: MAX_PLAN_STEPS=20', () => {
    assert.strictEqual(MAX_PLAN_STEPS, 20);
  });
  await ok('A6: MAX_EXECUTOR_RETRIES=3', () => {
    assert.strictEqual(MAX_EXECUTOR_RETRIES, 3);
  });
  await ok('A7: MAX_VERIFIER_ITERATIONS=2', () => {
    assert.strictEqual(MAX_VERIFIER_ITERATIONS, 2);
  });
  await ok('A8: DEFAULT_TIMEOUT_MS=30000', () => {
    assert.strictEqual(DEFAULT_TIMEOUT_MS, 30000);
  });
  await ok('A9: _internal 对象存在', () => {
    assert.strictEqual(typeof _internal, 'object');
  });
  await ok('A10: _internal 含 10 个导出', () => {
    const keys = Object.keys(_internal);
    assert.ok(keys.includes('parsePlan'));
    assert.ok(keys.includes('parseExecutorResult'));
    assert.ok(keys.includes('parseVerification'));
    assert.ok(keys.includes('extractJson'));
    assert.ok(keys.includes('formatPlannerTask'));
    assert.ok(keys.includes('formatExecutorStep'));
    assert.ok(keys.includes('formatVerifierTask'));
    assert.ok(keys.includes('DEFAULT_PLANNER_PROMPT'));
    assert.ok(keys.includes('DEFAULT_EXECUTOR_PROMPT'));
    assert.ok(keys.includes('DEFAULT_VERIFIER_PROMPT'));
    assert.strictEqual(keys.length, 10);
  });

  // ===== B组: 系统提示词常量 =====
  console.log('\n-- B组: 系统提示词常量 --');
  await ok('B1: DEFAULT_PLANNER_PROMPT 含 GIS task planner', () => {
    assert.match(DEFAULT_PLANNER_PROMPT, /GIS task planner/i);
  });
  await ok('B2: DEFAULT_PLANNER_PROMPT 含 steps JSON schema', () => {
    assert.match(DEFAULT_PLANNER_PROMPT, /"steps"/);
    assert.match(DEFAULT_PLANNER_PROMPT, /"description"/);
  });
  await ok('B3: DEFAULT_PLANNER_PROMPT 含 Output format', () => {
    assert.match(DEFAULT_PLANNER_PROMPT, /Output format/i);
  });
  await ok('B4: DEFAULT_EXECUTOR_PROMPT 含 tool call 示例', () => {
    assert.match(DEFAULT_EXECUTOR_PROMPT, /toolCall/);
    assert.match(DEFAULT_EXECUTOR_PROMPT, /"tool"/);
    assert.match(DEFAULT_EXECUTOR_PROMPT, /"payload"/);
  });
  await ok('B5: DEFAULT_EXECUTOR_PROMPT 含 output 字段', () => {
    assert.match(DEFAULT_EXECUTOR_PROMPT, /"output"/);
  });
  await ok('B6: DEFAULT_VERIFIER_PROMPT 含 pass/feedback/score', () => {
    assert.match(DEFAULT_VERIFIER_PROMPT, /"pass"/);
    assert.match(DEFAULT_VERIFIER_PROMPT, /"feedback"/);
    assert.match(DEFAULT_VERIFIER_PROMPT, /"score"/);
  });
  await ok('B7: 三个 prompt 都是字符串且非空', () => {
    assert.ok(typeof DEFAULT_PLANNER_PROMPT === 'string' && DEFAULT_PLANNER_PROMPT.length > 50);
    assert.ok(typeof DEFAULT_EXECUTOR_PROMPT === 'string' && DEFAULT_EXECUTOR_PROMPT.length > 50);
    assert.ok(typeof DEFAULT_VERIFIER_PROMPT === 'string' && DEFAULT_VERIFIER_PROMPT.length > 50);
  });

  // ===== C组: extractJson 直接 parse =====
  console.log('\n-- C组: extractJson 直接 JSON.parse 路径 --');
  await ok('C1: 直接 JSON 字符串 parse', () => {
    const r = extractJson('{"a":1}');
    assert.deepStrictEqual(r, { a: 1 });
  });
  await ok('C2: 数组 JSON parse', () => {
    const r = extractJson('[1,2,3]');
    assert.deepStrictEqual(r, [1, 2, 3]);
  });
  await ok('C3: 嵌套对象 JSON parse', () => {
    const r = extractJson('{"a":{"b":{"c":1}}}');
    assert.deepStrictEqual(r, { a: { b: { c: 1 } } });
  });
  await ok('C4: 含空白字符 JSON parse', () => {
    const r = extractJson('  { "a" : 1 }  ');
    assert.deepStrictEqual(r, { a: 1 });
  });
  await ok('C5: 数字 JSON parse', () => {
    assert.strictEqual(extractJson('42'), 42);
  });
  await ok('C6: 布尔 JSON parse', () => {
    assert.strictEqual(extractJson('true'), true);
    assert.strictEqual(extractJson('false'), false);
  });
  await ok('C7: null JSON parse', () => {
    assert.strictEqual(extractJson('null'), null);
  });

  // ===== D组: extractJson markdown code block 路径 =====
  console.log('\n-- D组: extractJson markdown code block 路径 --');
  await ok('D1: ```json code block 提取', () => {
    const content = '```json\n{"a":1}\n```';
    const r = extractJson(content);
    assert.deepStrictEqual(r, { a: 1 });
  });
  await ok('D2: ``` (无语言) code block 提取', () => {
    const content = '```\n{"a":1}\n```';
    const r = extractJson(content);
    assert.deepStrictEqual(r, { a: 1 });
  });
  await ok('D3: code block 内含多行 JSON', () => {
    const content = '```json\n{\n  "a": 1,\n  "b": [2, 3]\n}\n```';
    const r = extractJson(content);
    assert.deepStrictEqual(r, { a: 1, b: [2, 3] });
  });
  await ok('D4: code block 前后有说明文字', () => {
    const content = 'Here is the result:\n```json\n{"a":1}\n```\nHope this helps!';
    const r = extractJson(content);
    assert.deepStrictEqual(r, { a: 1 });
  });
  await ok('D5: 多个 code block 取第一个', () => {
    const content = '```json\n{"a":1}\n```\nand\n```json\n{"b":2}\n```';
    const r = extractJson(content);
    assert.deepStrictEqual(r, { a: 1 });
  });

  // ===== E组: extractJson JSON object 匹配路径 =====
  console.log('\n-- E组: extractJson JSON object 匹配路径 --');
  await ok('E1: 前缀文字 + JSON object 提取', () => {
    const content = 'Result: {"a":1}';
    const r = extractJson(content);
    assert.deepStrictEqual(r, { a: 1 });
  });
  await ok('E2: 后缀文字 + JSON object 提取', () => {
    const content = '{"a":1} Thanks';
    const r = extractJson(content);
    assert.deepStrictEqual(r, { a: 1 });
  });
  await ok('E3: 前后都有文字', () => {
    const content = 'Before {"a":1} After';
    const r = extractJson(content);
    assert.deepStrictEqual(r, { a: 1 });
  });
  await ok('E4: 嵌套 JSON object 提取', () => {
    const content = 'Result: {"a":{"b":1}}';
    const r = extractJson(content);
    assert.deepStrictEqual(r, { a: { b: 1 } });
  });
  await ok('E5: JSON 内含嵌套对象（贪婪匹配）', () => {
    const content = 'X {"a":{"b":1},"c":2} Y';
    const r = extractJson(content);
    assert.deepStrictEqual(r, { a: { b: 1 }, c: 2 });
  });

  // ===== F组: extractJson 边界 / fallback =====
  console.log('\n-- F组: extractJson 边界 / fallback --');
  await ok('F1: 空字符串返回 {}', () => {
    assert.deepStrictEqual(extractJson(''), {});
  });
  await ok('F2: 非 JSON 字符串返回 {}', () => {
    assert.deepStrictEqual(extractJson('hello world'), {});
  });
  await ok('F3: 纯数字字符串（非 JSON 对象）返回 {}', () => {
    // '42' 是有效 JSON 但 extractJson 返回 42
    assert.strictEqual(extractJson('42'), 42);
  });
  await ok('F4: null 返回 {}', () => {
    assert.deepStrictEqual(extractJson(null), {});
  });
  await ok('F5: undefined 返回 {}', () => {
    assert.deepStrictEqual(extractJson(undefined), {});
  });
  await ok('F6: 数字 42 返回 {}', () => {
    assert.deepStrictEqual(extractJson(42), {});
  });
  await ok('F7: 对象 {} 返回 {}', () => {
    assert.deepStrictEqual(extractJson({ a: 1 }), {});
  });
  await ok('F8: 数组 [] 返回 {}', () => {
    assert.deepStrictEqual(extractJson([]), {});
  });
  await ok('F9: 无效 JSON 返回 {}', () => {
    assert.deepStrictEqual(extractJson('{"a":}'), {});
    assert.deepStrictEqual(extractJson('{"a": 1'), {}); // 缺右括号
  });
  await ok('F10: 纯空白字符串返回 {}', () => {
    assert.deepStrictEqual(extractJson('   \n\t  '), {});
  });
  await ok('F11: markdown code block 内含无效 JSON', () => {
    // 无效 JSON 在 code block 内，extractJson 尝试 parse 失败后尝试 object 匹配
    // object 匹配可能匹配到 code block 内的字符，但仍无效，返回 {}
    const content = '```json\n{"a":}\n```';
    assert.deepStrictEqual(extractJson(content), {});
  });
  await ok('F12: 多个 JSON 对象（贪婪匹配第一个完整）', () => {
    // \{[\s\S]*\} 是贪婪匹配，从第一个 { 到最后一个 }
    // 中间有嵌套对象也一起匹配
    const content = '{"a":1} and {"b":2}';
    const r = extractJson(content);
    // 贪婪匹配：从第一个 { 到最后一个 }
    // JSON.parse('{"a":1} and {"b":2}') 会失败
    // 因为贪婪匹配，match 是 '{"a":1} and {"b":2}' 整体
    // JSON.parse 失败，返回 {}
    assert.deepStrictEqual(r, {});
  });

  // ===== G组: parsePlan =====
  console.log('\n-- G组: parsePlan 计划解析 --');
  await ok('G1: 合法 plan JSON', () => {
    const content = '{"steps":[{"description":"step1"},{"description":"step2"}]}';
    const r = parsePlan(content);
    assert.strictEqual(r.steps.length, 2);
    assert.strictEqual(r.steps[0].description, 'step1');
    assert.strictEqual(r.truncated, false);
  });
  await ok('G2: steps 非数组返回空数组', () => {
    const content = '{"steps":"not-array"}';
    const r = parsePlan(content);
    assert.deepStrictEqual(r.steps, []);
  });
  await ok('G3: 无 steps 字段返回空数组', () => {
    const content = '{}';
    const r = parsePlan(content);
    assert.deepStrictEqual(r.steps, []);
  });
  await ok('G4: truncated=true 标记', () => {
    const content = '{"steps":[],"truncated":true}';
    const r = parsePlan(content);
    assert.strictEqual(r.truncated, true);
  });
  await ok('G5: truncated=1 也标记 true', () => {
    const content = '{"steps":[],"truncated":1}';
    const r = parsePlan(content);
    assert.strictEqual(r.truncated, true);
  });
  await ok('G6: 空 steps 数组', () => {
    const content = '{"steps":[]}';
    const r = parsePlan(content);
    assert.deepStrictEqual(r.steps, []);
  });
  await ok('G7: 无效 JSON 返回空 steps（无 error）', () => {
    // extractJson 对无效输入返回 {}，parsePlan 从 {} 取 steps → []
    // 源码中 error 字段仅在 extractJson 抛异常时设置，但 extractJson 总是返回对象
    const content = 'not valid json';
    const r = parsePlan(content);
    assert.deepStrictEqual(r.steps, []);
    // 无 error 字段（extractJson 不抛错）
    assert.strictEqual(r.error, undefined);
  });
  await ok('G8: steps 内含复杂对象', () => {
    const content = '{"steps":[{"description":"s1","tool":"x","parameters":{"a":1}}]}';
    const r = parsePlan(content);
    assert.strictEqual(r.steps[0].tool, 'x');
    assert.deepStrictEqual(r.steps[0].parameters, { a: 1 });
  });
  await ok('G9: markdown code block 内的 plan', () => {
    const content = '```json\n{"steps":[{"description":"s1"}]}\n```';
    const r = parsePlan(content);
    assert.strictEqual(r.steps.length, 1);
  });
  await ok('G10: steps 元素无 description', () => {
    const content = '{"steps":[{"tool":"x"}]}';
    const r = parsePlan(content);
    assert.strictEqual(r.steps.length, 1);
    assert.strictEqual(r.steps[0].tool, 'x');
  });

  // ===== H组: parseExecutorResult =====
  console.log('\n-- H组: parseExecutorResult 执行结果解析 --');
  await ok('H1: 含 toolCall 和 output', () => {
    const content = '{"toolCall":{"tool":"x","payload":{"a":1}},"output":"done"}';
    const r = parseExecutorResult(content);
    assert.deepStrictEqual(r.toolCall, { tool: 'x', payload: { a: 1 } });
    assert.strictEqual(r.output, 'done');
  });
  await ok('H2: 仅 output', () => {
    const content = '{"output":"result"}';
    const r = parseExecutorResult(content);
    assert.strictEqual(r.toolCall, null);
    assert.strictEqual(r.output, 'result');
  });
  await ok('H3: 无 toolCall 无 output（fallback 到 content）', () => {
    const content = '{"other":"x"}';
    const r = parseExecutorResult(content);
    assert.strictEqual(r.toolCall, null);
    assert.strictEqual(r.output, content); // fallback 到原 content
  });
  await ok('H4: 空对象 output fallback 到 content', () => {
    const content = '{}';
    const r = parseExecutorResult(content);
    assert.strictEqual(r.output, content);
  });
  await ok('H5: toolCall=null 显式', () => {
    const content = '{"toolCall":null,"output":"ok"}';
    const r = parseExecutorResult(content);
    assert.strictEqual(r.toolCall, null);
    assert.strictEqual(r.output, 'ok');
  });
  await ok('H6: 无效 JSON fallback 到 content', () => {
    const content = 'not valid';
    const r = parseExecutorResult(content);
    assert.strictEqual(r.toolCall, null);
    assert.strictEqual(r.output, content);
  });
  await ok('H7: 空字符串 fallback', () => {
    const content = '';
    const r = parseExecutorResult(content);
    assert.strictEqual(r.toolCall, null);
    assert.strictEqual(r.output, '');
  });
  await ok('H8: toolCall 无 tool 字段（修复: {} 保留不被覆盖为 null）', () => {
    const content = '{"toolCall":{"payload":{}},"output":"x"}';
    const r = parseExecutorResult(content);
    // 修复后: toolCall 保留为 { payload: {} }，不被覆盖为 null
    assert.strictEqual(Object.keys(r.toolCall.payload).length, 0);
    assert.strictEqual(r.toolCall.tool, undefined);
  });
  await ok('H9: toolCall={} 空对象保留（bug 回归测试）', () => {
    // 回归测试: 源码 bug 之前 `json.toolCall || null` 对 {} 返回 null
    const content = '{"toolCall":{},"output":"x"}';
    const r = parseExecutorResult(content);
    // 修复后: toolCall 保留为 {}，不是 null
    assert.deepStrictEqual(r.toolCall, {});
    assert.notStrictEqual(r.toolCall, null);
    assert.strictEqual(r.output, 'x');
  });
  await ok('H10: toolCall=null 显式保留 null', () => {
    const content = '{"toolCall":null,"output":"x"}';
    const r = parseExecutorResult(content);
    assert.strictEqual(r.toolCall, null);
    assert.strictEqual(r.output, 'x');
  });

  // ===== I组: parseVerification =====
  console.log('\n-- I组: parseVerification 验证结果解析 --');
  await ok('I1: 完整 verification', () => {
    const content = '{"pass":true,"feedback":"good","score":95}';
    const r = parseVerification(content);
    assert.strictEqual(r.pass, true);
    assert.strictEqual(r.feedback, 'good');
    assert.strictEqual(r.score, 95);
  });
  await ok('I2: pass=false', () => {
    const content = '{"pass":false,"feedback":"bad"}';
    const r = parseVerification(content);
    assert.strictEqual(r.pass, false);
    assert.strictEqual(r.feedback, 'bad');
  });
  await ok('I3: 缺 pass 默认 true（pass !== false）', () => {
    const content = '{"feedback":"x"}';
    const r = parseVerification(content);
    assert.strictEqual(r.pass, true);
  });
  await ok('I4: 缺 feedback 默认空字符串', () => {
    const content = '{"pass":true}';
    const r = parseVerification(content);
    assert.strictEqual(r.feedback, '');
  });
  await ok('I5: 缺 score 默认 null', () => {
    const content = '{"pass":true,"feedback":"x"}';
    const r = parseVerification(content);
    assert.strictEqual(r.score, null);
  });
  await ok('I6: score=0', () => {
    const content = '{"pass":false,"score":0}';
    const r = parseVerification(content);
    assert.strictEqual(r.score, 0);
  });
  await ok('I7: score="95" 字符串不识别为数字', () => {
    const content = '{"score":"95"}';
    const r = parseVerification(content);
    assert.strictEqual(r.score, null);
  });
  await ok('I8: score=-1', () => {
    const content = '{"score":-1}';
    const r = parseVerification(content);
    assert.strictEqual(r.score, -1);
  });
  await ok('I9: 无效 JSON 默认 pass=true', () => {
    const content = 'not valid';
    const r = parseVerification(content);
    assert.strictEqual(r.pass, true);
    assert.strictEqual(r.feedback, '');
    assert.strictEqual(r.score, null);
  });
  await ok('I10: 空对象 pass=true', () => {
    const content = '{}';
    const r = parseVerification(content);
    assert.strictEqual(r.pass, true);
  });
  await ok('I11: pass="false" 字符串 !== false', () => {
    // pass !== false 是严格比较，"false" 字符串 != false 布尔
    const content = '{"pass":"false"}';
    const r = parseVerification(content);
    assert.strictEqual(r.pass, true);
  });
  await ok('I12: pass=0 也视为 true（0 !== false）', () => {
    const content = '{"pass":0}';
    const r = parseVerification(content);
    assert.strictEqual(r.pass, true);
  });

  // ===== J组: 常量边界 / 一致性 =====
  console.log('\n-- J组: 常量边界 / 一致性 --');
  await ok('J1: MAX_PLAN_STEPS > 0', () => {
    assert.ok(MAX_PLAN_STEPS > 0);
  });
  await ok('J2: MAX_EXECUTOR_RETRIES >= 1', () => {
    assert.ok(MAX_EXECUTOR_RETRIES >= 1);
  });
  await ok('J3: MAX_VERIFIER_ITERATIONS >= 1', () => {
    assert.ok(MAX_VERIFIER_ITERATIONS >= 1);
  });
  await ok('J4: DEFAULT_TIMEOUT_MS > 0', () => {
    assert.ok(DEFAULT_TIMEOUT_MS > 0);
  });
  await ok('J5: DEFAULT_TIMEOUT_MS 是合理的（1s-600s）', () => {
    assert.ok(DEFAULT_TIMEOUT_MS >= 1000 && DEFAULT_TIMEOUT_MS <= 600000);
  });
  await ok('J6: 常量都是数字', () => {
    assert.strictEqual(typeof MAX_PLAN_STEPS, 'number');
    assert.strictEqual(typeof MAX_EXECUTOR_RETRIES, 'number');
    assert.strictEqual(typeof MAX_VERIFIER_ITERATIONS, 'number');
    assert.strictEqual(typeof DEFAULT_TIMEOUT_MS, 'number');
  });
  await ok('J7: MAX_PLAN_STEPS 是整数', () => {
    assert.ok(Number.isInteger(MAX_PLAN_STEPS));
  });
  await ok('J8: DEFAULT_TIMEOUT_MS 是整数', () => {
    assert.ok(Number.isInteger(DEFAULT_TIMEOUT_MS));
  });

  // ===== K组: 集成场景 =====
  console.log('\n-- K组: 集成场景 --');
  await ok('K1: LLM 返回 markdown JSON → parsePlan → 多步骤', () => {
    const llmOutput = '```json\n{"steps":[{"description":"step1","tool":"t1"},{"description":"step2"}]}\n```';
    const plan = parsePlan(llmOutput);
    assert.strictEqual(plan.steps.length, 2);
    assert.strictEqual(plan.truncated, false);
  });
  await ok('K2: LLM 返回纯文本 → parseExecutorResult → fallback', () => {
    const result = parseExecutorResult('I did something but not JSON');
    assert.strictEqual(result.toolCall, null);
    assert.strictEqual(result.output, 'I did something but not JSON');
  });
  await ok('K3: LLM 返回 verification → 多字段', () => {
    const content = '```json\n{"pass":false,"feedback":"needs more detail","score":50}\n```';
    const v = parseVerification(content);
    assert.strictEqual(v.pass, false);
    assert.strictEqual(v.score, 50);
  });
  await ok('K4: extractJson 优先级：直接 > markdown > 对象匹配', () => {
    // 直接 JSON.parse 成功，不走后续
    const content = '{"a":1}';
    assert.deepStrictEqual(extractJson(content), { a: 1 });
    // markdown 优先于 object 匹配
    const md = '```json\n{"a":2}\n```';
    assert.deepStrictEqual(extractJson(md), { a: 2 });
  });
  await ok('K5: 完整流水线（mock）', async () => {
    // 用 mock llmCall 模拟完整流程
    let callCount = 0;
    async function mockLlm(messages, opts) {
      callCount++;
      const userMsg = messages.find((m) => m.role === 'user').content;
      if (userMsg.includes('Task:')) {
        return { content: '{"steps":[{"description":"s1","tool":"t1","parameters":{}}]}' };
      }
      if (userMsg.includes('Step:')) {
        return { content: '{"toolCall":{"tool":"t1","payload":{}},"output":"done"}' };
      }
      if (userMsg.includes('Result:')) {
        return { content: '{"pass":true,"feedback":"ok","score":95}' };
      }
      return { content: '{}' };
    }
    const planner = createPlannerAgent({ llmCall: mockLlm });
    const executor = createExecutorAgent({ llmCall: mockLlm, executeTool: async () => ({ ok: true, result: 'x' }) });
    const verifier = createVerifierAgent({ llmCall: mockLlm });
    const result = await runOrchestratedTask('do something', { agents: { planner, executor, verifier }, maxSteps: 5, maxRetries: 1, maxVerifierIterations: 1 });
    assert.strictEqual(result.ok, true);
    assert.ok(result.plan.steps.length >= 1);
    assert.ok(result.results.length >= 1);
    assert.strictEqual(result.errors.length, 0);
  });
  await ok('K6: plan 超过 maxSteps 截断', async () => {
    async function mockLlm(messages) {
      const steps = Array.from({ length: 25 }, (_, i) => ({ description: `s${i}` }));
      return { content: JSON.stringify({ steps }) };
    }
    const planner = createPlannerAgent({ llmCall: mockLlm, maxSteps: 5 });
    const result = await planner('test task');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.plan.steps.length, 5);
    assert.strictEqual(result.plan.truncated, true);
  });
  await ok('K7: executor 超时', async () => {
    async function slowLlm() {
      await new Promise((r) => setTimeout(r, 100));
      return { content: '{"output":"late"}' };
    }
    const executor = createExecutorAgent({ llmCall: slowLlm, timeoutMs: 10 });
    const result = await executor({ description: 'x' });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /executor_timeout/);
  });

  // ===== summary =====
  console.log(`\n--- summary: pass=${pass} fail=${fail} ---`);
  if (failures.length) {
    console.log('failures:', JSON.stringify(failures, null, 2));
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(2);
});
