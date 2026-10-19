// tests/specs/agent-orchestrator-format.cjs
// Cycle 22 R1: agentOrchestrator 格式化 helper 函数补强测试
// 目标：≥ 28 PASS
//
// 背景：agent-multi-agent.cjs 已覆盖 parser + create*Agent + runOrchestratedTask，
// 但 _internal.formatPlannerTask / formatExecutorStep / formatVerifierTask
// 三个 prompt 格式化函数完全未测。本 spec 补齐这块覆盖。
//
// 覆盖点：
//   - 空 context vs 非空 context 两种路径
//   - 有/无 tool 参数
//   - 有/无 parameters 参数
//   - JSON 嵌套深度
//   - 特殊字符（中文、引号、换行）
//   - result 序列化为 JSON

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const { _internal } = require(path.join(__dirname, '../../server/services/agentOrchestrator'));

const { formatPlannerTask, formatExecutorStep, formatVerifierTask } = _internal;

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

(async () => {
  console.log('=== agent-orchestrator-format ===');

  // ============ Group A: 导出验证 ============
  await ok('A1: _internal 导出 formatPlannerTask', () => {
    assert.strictEqual(typeof formatPlannerTask, 'function');
  });
  await ok('A2: _internal 导出 formatExecutorStep', () => {
    assert.strictEqual(typeof formatExecutorStep, 'function');
  });
  await ok('A3: _internal 导出 formatVerifierTask', () => {
    assert.strictEqual(typeof formatVerifierTask, 'function');
  });
  await ok('A4: 三个格式化函数都在 _internal 命名空间', () => {
    const keys = Object.keys(_internal).sort();
    assert.ok(keys.includes('formatPlannerTask'));
    assert.ok(keys.includes('formatExecutorStep'));
    assert.ok(keys.includes('formatVerifierTask'));
  });

  // ============ Group B: formatPlannerTask ============
  await ok('B1: 无 context 时仅输出 Task', () => {
    const msg = formatPlannerTask('画个北京地图', null);
    assert.strictEqual(msg, 'Task: 画个北京地图\n');
  });
  await ok('B2: 空 context 时不追加 Context 段', () => {
    const msg = formatPlannerTask('task1', {});
    assert.strictEqual(msg, 'Task: task1\n');
  });
  await ok('B3: 有 context 时追加 JSON Context 段', () => {
    const msg = formatPlannerTask('task1', { user: 'alice' });
    assert.ok(msg.startsWith('Task: task1\n'));
    assert.ok(msg.includes('Context:\n'));
    assert.ok(msg.includes('"user"'));
    assert.ok(msg.includes('"alice"'));
  });
  await ok('B4: context 用 JSON.stringify 缩进 2', () => {
    const msg = formatPlannerTask('t', { a: 1, b: 2 });
    // 缩进格式："  a": 1, "  b": 2
    assert.ok(msg.includes('"a": 1'));
    assert.ok(msg.includes('"b": 2'));
    assert.ok(msg.includes('{'));
    assert.ok(msg.includes('}'));
  });
  await ok('B5: 空字符串 task 也能生成', () => {
    const msg = formatPlannerTask('', null);
    assert.strictEqual(msg, 'Task: \n');
  });
  await ok('B6: 特殊字符中文保留', () => {
    const msg = formatPlannerTask('绘制北京、上海、广州的三维地图', null);
    assert.ok(msg.includes('北京、上海、广州'));
  });
  await ok('B7: context 嵌套对象正确序列化', () => {
    const msg = formatPlannerTask('t', { nested: { deep: '值' } });
    assert.ok(msg.includes('"nested"'));
    assert.ok(msg.includes('"deep"'));
    assert.ok(msg.includes('"值"'));
  });

  // ============ Group C: formatExecutorStep ============
  await ok('C1: 仅 description 时只输出 Step', () => {
    const msg = formatExecutorStep({ description: '画圆' }, null);
    assert.strictEqual(msg, 'Step: 画圆\n');
  });
  await ok('C2: 有 tool 时追加 Tool 行', () => {
    const msg = formatExecutorStep({ description: 'd', tool: 'web_search' }, null);
    assert.ok(msg.includes('Step: d\n'));
    assert.ok(msg.includes('Tool: web_search\n'));
  });
  await ok('C3: 有 parameters 时追加 Parameters 行', () => {
    const msg = formatExecutorStep({ description: 'd', parameters: { q: '北京' } }, null);
    assert.ok(msg.includes('Step: d\n'));
    assert.ok(msg.includes('Parameters: '));
    assert.ok(msg.includes('"q"'));
    assert.ok(msg.includes('"北京"'));
  });
  await ok('C4: tool + parameters 都出现', () => {
    const msg = formatExecutorStep({ description: 'd', tool: 't', parameters: { a: 1 } }, null);
    assert.ok(msg.includes('Tool: t'));
    assert.ok(msg.includes('Parameters:'));
    // 顺序：Step -> Tool -> Parameters
    assert.ok(msg.indexOf('Step:') < msg.indexOf('Tool:'));
    assert.ok(msg.indexOf('Tool:') < msg.indexOf('Parameters:'));
  });
  await ok('C5: 有 context 时追加 Context 段', () => {
    const msg = formatExecutorStep({ description: 'd' }, { user: 'alice' });
    assert.ok(msg.includes('Context:\n'));
    assert.ok(msg.includes('"alice"'));
  });
  await ok('C6: 空 context 时不追加', () => {
    const msg = formatExecutorStep({ description: 'd' }, {});
    assert.ok(!msg.includes('Context:'));
  });
  await ok('C7: parameters 中嵌套对象 JSON 序列化', () => {
    const msg = formatExecutorStep({ description: 'd', parameters: { filter: { type: 'polygon' } } }, null);
    assert.ok(msg.includes('"filter"'));
    assert.ok(msg.includes('"polygon"'));
  });
  await ok('C8: description 含特殊字符保留', () => {
    const msg = formatExecutorStep({ description: '添加 <marker> 到 (39.9, 116.4)' }, null);
    assert.ok(msg.includes('<marker>'));
    assert.ok(msg.includes('39.9'));
  });

  // ============ Group D: formatVerifierTask ============
  await ok('D1: 输出 Step 和 Result 两行', () => {
    const msg = formatVerifierTask({ description: '画圆' }, { success: true }, null);
    assert.ok(msg.includes('Step: 画圆\n'));
    assert.ok(msg.includes('Result:'));
    assert.ok(msg.includes('"success"'));
    assert.ok(msg.includes('true'));
  });
  await ok('D2: result 序列化为 JSON 缩进', () => {
    const msg = formatVerifierTask({ description: 'd' }, { a: 1, b: [1, 2] }, null);
    assert.ok(msg.includes('"a": 1'));
    assert.ok(msg.includes('"b": ['));
  });
  await ok('D3: 有 context 追加 Context 段', () => {
    const msg = formatVerifierTask({ description: 'd' }, { ok: true }, { user: 'alice' });
    assert.ok(msg.includes('Context:\n'));
    assert.ok(msg.includes('"alice"'));
  });
  await ok('D4: 空 context 不追加', () => {
    const msg = formatVerifierTask({ description: 'd' }, { ok: true }, {});
    assert.ok(!msg.includes('Context:'));
  });
  await ok('D5: 顺序 Step -> Result -> Context', () => {
    const msg = formatVerifierTask({ description: 'd' }, { ok: true }, { c: 1 });
    assert.ok(msg.indexOf('Step:') < msg.indexOf('Result:'));
    assert.ok(msg.indexOf('Result:') < msg.indexOf('Context:'));
  });
  await ok('D6: result 为 null 序列化为 "null"', () => {
    const msg = formatVerifierTask({ description: 'd' }, null, null);
    assert.ok(msg.includes('Result: null\n'));
  });
  await ok('D7: result 为空对象序列化为 "{}"', () => {
    const msg = formatVerifierTask({ description: 'd' }, {}, null);
    assert.ok(msg.includes('Result: {}'));
  });
  await ok('D8: step.description 含中文保留', () => {
    const msg = formatVerifierTask({ description: '执行 GIS 操作' }, {}, null);
    assert.ok(msg.includes('GIS 操作'));
  });

  // ============ Group E: 综合集成测试 ============
  await ok('E1: formatPlannerTask + context 嵌套完整输出', () => {
    const msg = formatPlannerTask('绘制地图', { user: 'alice', prefs: { theme: 'dark' } });
    // 验证完整结构
    assert.ok(msg.startsWith('Task: 绘制地图\n'));
    assert.ok(msg.includes('\nContext:\n'));
    assert.ok(msg.includes('"prefs"'));
    assert.ok(msg.includes('"dark"'));
  });
  await ok('E2: formatExecutorStep 完整四段输出', () => {
    const msg = formatExecutorStep(
      { description: '查北京', tool: 'search', parameters: { q: '北京' } },
      { user: 'bob' }
    );
    assert.ok(msg.includes('Step: 查北京'));
    assert.ok(msg.includes('Tool: search'));
    assert.ok(msg.includes('Parameters:'));
    assert.ok(msg.includes('Context:'));
    // 完整顺序
    const s1 = msg.indexOf('Step:');
    const s2 = msg.indexOf('Tool:');
    const s3 = msg.indexOf('Parameters:');
    const s4 = msg.indexOf('Context:');
    assert.ok(s1 < s2 && s2 < s3 && s3 < s4);
  });
  await ok('E3: 三个函数都返回 string', () => {
    assert.strictEqual(typeof formatPlannerTask('t', null), 'string');
    assert.strictEqual(typeof formatExecutorStep({ description: 'd' }, null), 'string');
    assert.strictEqual(typeof formatVerifierTask({ description: 'd' }, {}, null), 'string');
  });
  await ok('E4: 空对象 step 也能处理', () => {
    const msg = formatExecutorStep({}, null);
    // description 为 undefined，不抛错
    assert.ok(msg.includes('Step: undefined'));
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
