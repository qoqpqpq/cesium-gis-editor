// tests/specs/otel-worker-sdk-integration.cjs
// 周期 14 P1-1: OTel worker SDK 集成 + LLM semantic span
//
// 覆盖：
//   - installWorkerSdk() 自动 install + carrier traceId 解析
//   - buildLlmSpanAttributes() OTel GenAI semantic conventions
//   - runWithLlmSpan() 在 ALS 内附 LLM attrs
//   - getCurrentLlmAttributes() 取出 attrs
//   - ai.js wrapWithLlmSpan() 不破坏 result 结构
//   - 周期 13 OTel API 零回归

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const otelPath = path.join(ROOT, 'server', 'agent', 'otelDevHook.js');
const aiPath = path.join(ROOT, 'server', 'services', 'ai.js');

let total = 0;
const failed = [];

function it(name, fn) {
  total += 1;
  try {
    fn();
    process.stdout.write(`  [PASS] ${name}\n`);
  } catch (e) {
    failed.push({ name, error: e });
    process.stdout.write(`  [FAIL] ${name} — ${e.message}\n`);
  }
}

// 强制 reset 状态（之前测试可能 install 过）
const otel = require(otelPath);
otel._resetState();

const ai = require(aiPath);

// ===== 1. installWorkerSdk =====
it('OTEL-W1: installWorkerSdk 返回 installed / sdkLoaded / traceId', () => {
  otel._resetState();
  const r = otel.installWorkerSdk({});
  assert.strictEqual(typeof r.installed, 'boolean');
  assert.strictEqual(typeof r.sdkLoaded, 'boolean');
  assert.strictEqual(typeof r.traceId, 'string');
  assert.ok(r.traceId.length === 32);
});

it('OTEL-W2: installWorkerSdk 接受 carrier.traceparent 解析 traceId', () => {
  otel._resetState();
  const traceId = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const r = otel.installWorkerSdk({
    traceparent: `00-${traceId}-1234567890123456-01`,
  });
  assert.strictEqual(r.traceId, traceId);
});

it('OTEL-W3: installWorkerSdk carrier.traceId 优先级最高', () => {
  otel._resetState();
  const r = otel.installWorkerSdk({
    traceId: 'my-custom-trace-32-chars-aaaaaaaa',
    traceparent: '00-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-1234567890123456-01',
  });
  assert.strictEqual(r.traceId, 'my-custom-trace-32-chars-aaaaaaaa');
});

it('OTEL-W4: installWorkerSdk 无 carrier 自动生成 traceId', () => {
  otel._resetState();
  const r = otel.installWorkerSdk(undefined);
  assert.ok(/^[0-9a-f]{32}$/.test(r.traceId));
});

// ===== 2. buildLlmSpanAttributes =====
it('OTEL-L1: buildLlmSpanAttributes 完整字段', () => {
  const attrs = otel.buildLlmSpanAttributes({
    platform: 'openai',
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    finishReason: 'stop',
    elapsedMs: 1234,
  });
  assert.strictEqual(attrs['gen_ai.system'], 'openai');
  assert.strictEqual(attrs['llm.platform'], 'openai');
  assert.strictEqual(attrs['gen_ai.request.model'], 'gpt-4o');
  assert.strictEqual(attrs['gen_ai.request.message_count'], 2);
  assert.strictEqual(attrs['gen_ai.usage.input_tokens'], 100);
  assert.strictEqual(attrs['gen_ai.usage.output_tokens'], 50);
  assert.strictEqual(attrs['gen_ai.usage.total_tokens'], 150);
  assert.strictEqual(attrs['llm.prompt_tokens'], 100);
  assert.strictEqual(attrs['llm.completion_tokens'], 50);
  assert.strictEqual(attrs['gen_ai.response.finish_reason'], 'stop');
  assert.strictEqual(attrs['llm.elapsed_ms'], 1234);
});

it('OTEL-L2: buildLlmSpanAttributes 缺 usage 不报错', () => {
  const attrs = otel.buildLlmSpanAttributes({
    platform: 'anthropic',
    model: 'claude-3.5',
  });
  assert.strictEqual(attrs['gen_ai.system'], 'anthropic');
  assert.ok(!('gen_ai.usage.input_tokens' in attrs));
});

it('OTEL-L3: buildLlmSpanAttributes 空 opts 返回空对象', () => {
  const attrs = otel.buildLlmSpanAttributes({});
  assert.deepStrictEqual(attrs, {});
});

it('OTEL-L4: buildLlmSpanAttributes null opts 返回空对象', () => {
  const attrs = otel.buildLlmSpanAttributes(null);
  assert.deepStrictEqual(attrs, {});
});

// ===== 3. runWithLlmSpan + getCurrentLlmAttributes =====
it('OTEL-L5: runWithLlmSpan 在 ALS 内附 LLM attrs', () => {
  otel._resetState();
  const attrs = otel.buildLlmSpanAttributes({ platform: 'openai', model: 'gpt-4' });
  let result;
  otel.runWithLlmSpan('test-span', () => {
    result = otel.getCurrentLlmAttributes();
    return 'done';
  }, attrs);
  assert.ok(result);
  assert.strictEqual(result['gen_ai.system'], 'openai');
});

it('OTEL-L6: runWithLlmSpan 跨 ALS exit 后 attrs 不可见', () => {
  otel._resetState();
  const attrs = otel.buildLlmSpanAttributes({ platform: 'gemini' });
  otel.runWithLlmSpan('inner-span', () => {
    return 'inside';
  }, attrs);
  // ALS exit 后 attrs 不可见
  const result = otel.getCurrentLlmAttributes();
  assert.strictEqual(result, null);
});

// ===== 4. ai.wrapWithLlmSpan =====
it('OTEL-A1: ai.wrapWithLlmSpan 不破坏 result 结构', () => {
  const result = {
    platform: 'openai',
    model: 'gpt-4o',
    content: 'Hello',
    usage: { prompt_tokens: 5, completion_tokens: 1 },
  };
  const r = ai.wrapWithLlmSpan(result, { messages: [{ role: 'user', content: 'hi' }] });
  assert.strictEqual(r.platform, 'openai');
  assert.strictEqual(r.model, 'gpt-4o');
  assert.strictEqual(r.content, 'Hello');
});

it('OTEL-A2: ai.wrapWithLlmSpan null result 返回 null', () => {
  assert.strictEqual(ai.wrapWithLlmSpan(null), null);
});

it('OTEL-A3: ai.wrapWithLlmSpan 缺包 graceful（不抛错）', () => {
  // 即使 otelDevHook 不可用也不抛错
  const result = { platform: 'x', model: 'y', content: 'z', usage: {} };
  assert.doesNotThrow(() => ai.wrapWithLlmSpan(result));
});

// ===== 5. 向后兼容：周期 12-13 OTel API =====
it('OTEL-BC1: install() 仍可用', () => {
  otel._resetState();
  const r = otel.install();
  assert.strictEqual(typeof r.installed, 'boolean');
  assert.strictEqual(typeof r.reason, 'string');
});

it('OTEL-BC2: runWithSpan() 仍可用', () => {
  otel._resetState();
  const result = otel.runWithSpan('span', () => 42);
  assert.strictEqual(result, 42);
});

it('OTEL-BC3: getTraceId() 在 ALS 内返回 string', () => {
  otel._resetState();
  otel.runWithSpan('span', () => {
    const tid = otel.getTraceId();
    assert.strictEqual(typeof tid, 'string');
    assert.ok(tid.length === 32);
  });
});

it('OTEL-BC4: withWorkerContext 仍工作（周期 13）', () => {
  otel._resetState();
  let traceId;
  otel.withWorkerContext({
    traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1234567890123456-01',
  }, () => {
    traceId = otel.getTraceId();
  });
  assert.strictEqual(traceId, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
});

it('OTEL-BC5: getCurrentTraceparent 仍工作', () => {
  otel._resetState();
  let tp;
  otel.runWithSpan('span', () => {
    tp = otel.getCurrentTraceparent();
  });
  assert.ok(tp);
  assert.match(tp, /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
});

// ===== 6. 综合：buildLlmSpanAttributes 完整 OpenTelemetry 规范 =====
it('OTEL-Z1: 所有 OTel GenAI semantic conventions 字段名规范', () => {
  const attrs = otel.buildLlmSpanAttributes({
    platform: 'openai',
    model: 'gpt-4',
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    finishReason: 'stop',
  });
  const required = [
    'gen_ai.system',
    'gen_ai.request.model',
    'gen_ai.usage.input_tokens',
    'gen_ai.usage.output_tokens',
    'gen_ai.usage.total_tokens',
    'gen_ai.response.finish_reason',
  ];
  for (const r of required) {
    assert.ok(r in attrs, `Missing required OTel field: ${r}`);
  }
});

// ===== 总结 =====
process.stdout.write(`\n--- otel-worker-sdk-integration: pass=${total - failed.length} fail=${failed.length} ---\n`);
if (failed.length > 0) {
  process.stdout.write(`FAIL DETAILS:\n${failed.map((f) => `  - ${f.name}: ${f.error.message}`).join('\n')}\n`);
  process.exit(1);
}
process.exit(0);
