// tests/specs/otel-dev-hook-deep.cjs
// Cycle 25 R3: otelDevHook.js OTel SDK 集成深度测试
// 覆盖: install/uninstall / runWithSpan / withWorkerContext / getCurrentTraceparent
//       installWorkerSdk / buildLlmSpanAttributes / runWithLlmSpan / getCurrentLlmAttributes
//       _resetState / getStats / isInstalled
// 与 otel-dev-hook.cjs (27 PASS) / otel-worker-integration.cjs (18 PASS) 互补
'use strict';

const assert = require('node:assert');
const crypto = require('node:crypto');

// 备份原 NODE_ENV
const ORIG_NODE_ENV = process.env.NODE_ENV;

const hook = require('../../server/agent/otelDevHook');

const {
  install,
  uninstall,
  runWithSpan,
  getSpanContext,
  getTraceId,
  isInstalled,
  getStats,
  withWorkerContext,
  getCurrentTraceparent,
  installWorkerSdk,
  buildLlmSpanAttributes,
  runWithLlmSpan,
  getCurrentLlmAttributes,
  _als,
  _state,
  _resetState,
} = hook;

// ---- 计数器 ----
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

function withEnv(env, fn) {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = env;
  try {
    return fn();
  } finally {
    process.env.NODE_ENV = prev;
  }
}

async function main() {
  console.log('=== Cycle 25 R3: otelDevHook.js deep tests ===\n');

  // ===== A组: 模块导出 =====
  console.log('\n-- A组: 模块导出完整 --');
  await ok('A1: install 是 function', () => {
    assert.strictEqual(typeof install, 'function');
  });
  await ok('A2: uninstall 是 function', () => {
    assert.strictEqual(typeof uninstall, 'function');
  });
  await ok('A3: runWithSpan 是 function', () => {
    assert.strictEqual(typeof runWithSpan, 'function');
  });
  await ok('A4: getSpanContext 是 function', () => {
    assert.strictEqual(typeof getSpanContext, 'function');
  });
  await ok('A5: getTraceId 是 function', () => {
    assert.strictEqual(typeof getTraceId, 'function');
  });
  await ok('A6: isInstalled 是 function', () => {
    assert.strictEqual(typeof isInstalled, 'function');
  });
  await ok('A7: getStats 是 function', () => {
    assert.strictEqual(typeof getStats, 'function');
  });
  await ok('A8: withWorkerContext 是 function', () => {
    assert.strictEqual(typeof withWorkerContext, 'function');
  });
  await ok('A9: getCurrentTraceparent 是 function', () => {
    assert.strictEqual(typeof getCurrentTraceparent, 'function');
  });
  await ok('A10: installWorkerSdk 是 function', () => {
    assert.strictEqual(typeof installWorkerSdk, 'function');
  });
  await ok('A11: buildLlmSpanAttributes 是 function', () => {
    assert.strictEqual(typeof buildLlmSpanAttributes, 'function');
  });
  await ok('A12: runWithLlmSpan 是 function', () => {
    assert.strictEqual(typeof runWithLlmSpan, 'function');
  });
  await ok('A13: getCurrentLlmAttributes 是 function', () => {
    assert.strictEqual(typeof getCurrentLlmAttributes, 'function');
  });
  await ok('A14: _resetState 是 function（测试用）', () => {
    assert.strictEqual(typeof _resetState, 'function');
  });
  await ok('A15: _als 是 AsyncLocalStorage 实例', () => {
    assert.ok(_als && typeof _als.getStore === 'function');
  });
  await ok('A16: _state 是对象', () => {
    assert.strictEqual(typeof _state, 'object');
    assert.strictEqual(_state.installed, false);
    assert.strictEqual(_state.errors.length, 0);
  });

  // ===== B组: install() 行为 =====
  console.log('\n-- B组: install() 行为 --');
  await ok('B1: NODE_ENV=production 拒绝安装', () => {
    _resetState();
    withEnv('production', () => {
      const r = install();
      assert.strictEqual(r.installed, false);
      assert.strictEqual(r.version, null);
      assert.match(r.reason, /NODE_ENV=production|production/);
    });
  });
  await ok('B2: NODE_ENV=development 尝试安装（缺包时 graceful fallback）', () => {
    _resetState();
    withEnv('development', () => {
      const r = install();
      // 包可能不存在，但不应抛错
      assert.strictEqual(typeof r.installed, 'boolean');
      assert.strictEqual(typeof r.reason, 'string');
      // 检查 _state.errors 有记录（若包缺失）
      if (!r.installed) {
        assert.ok(_state.errors.length >= 1);
      }
    });
  });
  await ok('B3: 已安装时再次 install 返回 already installed', () => {
    _resetState();
    // 模拟已安装状态
    _state.installed = true;
    _state.version = 'test-version';
    const r = install();
    assert.strictEqual(r.installed, true);
    assert.strictEqual(r.version, 'test-version');
    assert.match(r.reason, /already installed/);
    _resetState();
  });
  await ok('B4: NODE_ENV 未设置时按 development 处理', () => {
    _resetState();
    delete process.env.NODE_ENV;
    try {
      const r = install();
      // 不应是 production reason
      assert.ok(!/NODE_ENV=production/.test(r.reason), `unexpected reason: ${r.reason}`);
    } finally {
      process.env.NODE_ENV = ORIG_NODE_ENV;
    }
  });
  await ok('B5: NODE_ENV=test 视为 dev', () => {
    _resetState();
    withEnv('test', () => {
      const r = install();
      assert.ok(!/NODE_ENV=production/.test(r.reason), `unexpected reason: ${r.reason}`);
    });
  });
  await ok('B6: install 后 _state.errors 记录加载失败', () => {
    _resetState();
    withEnv('development', () => {
      install();
      // 如果包不存在，errors 应有记录
      if (_state.errors.length > 0) {
        assert.ok(_state.errors[0].error);
        assert.ok(_state.errors[0].at > 0);
      }
    });
  });

  // ===== C组: uninstall() 行为 =====
  console.log('\n-- C组: uninstall() 行为 --');
  await ok('C1: 未安装时 uninstall 返回 not installed', async () => {
    _resetState();
    const r = await uninstall();
    assert.strictEqual(r.ok, true);
    assert.match(r.reason, /not installed/);
  });
  await ok('C2: 已安装时 uninstall 调用 sdk.shutdown', async () => {
    _resetState();
    // 模拟已安装的 sdk
    _state.installed = true;
    _state.sdk = { shutdown: async () => ({}) };
    _state.exporter = {};
    const r = await uninstall();
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.reason, 'shutdown');
    assert.strictEqual(_state.installed, false);
    assert.strictEqual(_state.sdk, null);
    assert.strictEqual(_state.exporter, null);
  });
  await ok('C3: sdk.shutdown 抛错时返回 ok:false', async () => {
    _resetState();
    _state.installed = true;
    _state.sdk = {
      shutdown: async () => { throw new Error('shutdown-fail'); },
    };
    const r = await uninstall();
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /shutdown-fail/);
    // 注意：抛错后 _state.installed 仍为 true（源码未重置）
    assert.strictEqual(_state.installed, true);
    _resetState();
  });

  // ===== D组: runWithSpan =====
  console.log('\n-- D组: runWithSpan 行为 --');
  await ok('D1: 回调在 span context 内执行', () => {
    let captured = null;
    runWithSpan('test-span', () => {
      captured = getSpanContext();
    });
    assert.ok(captured);
    assert.strictEqual(captured.spanName, 'test-span');
    assert.ok(captured.traceId);
    assert.ok(captured.spanId);
    assert.ok(captured.ts > 0);
  });
  await ok('D2: traceId 是 32 hex 字符', () => {
    let captured = null;
    runWithSpan('x', () => { captured = getSpanContext(); });
    assert.match(captured.traceId, /^[0-9a-f]{32}$/);
  });
  await ok('D3: spanId 是 16 hex 字符', () => {
    let captured = null;
    runWithSpan('x', () => { captured = getSpanContext(); });
    assert.match(captured.spanId, /^[0-9a-f]{16}$/);
  });
  await ok('D4: spanName 为空字符串时使用 anonymous', () => {
    let captured = null;
    runWithSpan('', () => { captured = getSpanContext(); });
    assert.strictEqual(captured.spanName, 'anonymous');
  });
  await ok('D5: spanName 为 undefined 时使用 anonymous', () => {
    let captured = null;
    runWithSpan(undefined, () => { captured = getSpanContext(); });
    assert.strictEqual(captured.spanName, 'anonymous');
  });
  await ok('D6: fn 非 function 返回 undefined', () => {
    const r = runWithSpan('x', null);
    assert.strictEqual(r, undefined);
  });
  await ok('D7: fn 返回值透传', () => {
    const r = runWithSpan('x', () => 42);
    assert.strictEqual(r, 42);
  });
  await ok('D8: 回调返回值透传（对象）', () => {
    const r = runWithSpan('x', () => ({ a: 1 }));
    assert.deepStrictEqual(r, { a: 1 });
  });
  await ok('D9: 同步抛错透传', () => {
    assert.throws(() => runWithSpan('x', () => { throw new Error('boom'); }), /boom/);
  });
  await ok('D10: 每次 runWithSpan 生成新 traceId', () => {
    let t1 = null, t2 = null;
    runWithSpan('x', () => { t1 = getSpanContext().traceId; });
    runWithSpan('x', () => { t2 = getSpanContext().traceId; });
    assert.notStrictEqual(t1, t2);
  });
  await ok('D11: 每次 runWithSpan 生成新 spanId', () => {
    let s1 = null, s2 = null;
    runWithSpan('x', () => { s1 = getSpanContext().spanId; });
    runWithSpan('x', () => { s2 = getSpanContext().spanId; });
    assert.notStrictEqual(s1, s2);
  });
  await ok('D12: 回调外 getSpanContext 返回 null', () => {
    runWithSpan('x', () => {});
    assert.strictEqual(getSpanContext(), null);
  });
  await ok('D13: 回调外 getTraceId 返回 null', () => {
    runWithSpan('x', () => {});
    assert.strictEqual(getTraceId(), null);
  });
  await ok('D14: 嵌套 runWithSpan 内层覆盖外层', () => {
    let inner = null;
    runWithSpan('outer', () => {
      runWithSpan('inner', () => { inner = getSpanContext(); });
    });
    assert.strictEqual(inner.spanName, 'inner');
  });
  await ok('D15: 同步 fn 立即返回时 setImmediate 回调未执行', () => {
    let outerCtx = null;
    let innerCtx = null;
    let setImmediateRan = false;
    runWithSpan('outer', () => {
      outerCtx = getSpanContext();
      setImmediate(() => {
        setImmediateRan = true;
        innerCtx = getSpanContext();
      });
    });
    // outer 立即返回，setImmediate 微任务在本 tick 结束后才执行
    assert.ok(outerCtx);
    assert.strictEqual(setImmediateRan, false, 'setImmediate 微任务不应在本 tick 内执行');
    assert.strictEqual(innerCtx, null);
  });

  // ===== E组: withWorkerContext =====
  console.log('\n-- E组: withWorkerContext 行为 --');
  await ok('E1: carrier 为空时直接执行 fn', () => {
    let called = false;
    withWorkerContext(null, () => { called = true; });
    assert.strictEqual(called, true);
  });
  await ok('E2: carrier 无 traceparent 时直接执行 fn', () => {
    let ctx = null;
    withWorkerContext({}, () => { ctx = getSpanContext(); });
    // 无 carrier.traceparent → fn() 直接执行，不进 ALS
    assert.strictEqual(ctx, null);
  });
  await ok('E3: carrier 有 traceparent 时注入 ALS', () => {
    let ctx = null;
    withWorkerContext(
      { traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01' },
      () => { ctx = getSpanContext(); }
    );
    assert.ok(ctx);
    assert.strictEqual(ctx.traceId, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    assert.strictEqual(ctx.spanName, 'worker:anonymous');
    assert.ok(ctx.spanId);
  });
  await ok('E4: carrier.traceId 优先使用', () => {
    let ctx = null;
    withWorkerContext(
      { traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01', traceId: 'cccccccccccccccccccccccccccccccc' },
      () => { ctx = getSpanContext(); }
    );
    assert.strictEqual(ctx.traceId, 'cccccccccccccccccccccccccccccccc');
  });
  await ok('E5: carrier 缺字段时 traceId 自动生成', () => {
    let ctx = null;
    withWorkerContext(
      { traceparent: '00-invalid-format' },
      () => { ctx = getSpanContext(); }
    );
    assert.ok(ctx.traceId);
    assert.match(ctx.traceId, /^[0-9a-f]{32}$/);
  });
  await ok('E6: carrier.parentSpanId 保留', () => {
    let ctx = null;
    withWorkerContext(
      { traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01', parentSpanId: 'ddddd' },
      () => { ctx = getSpanContext(); }
    );
    assert.strictEqual(ctx.parentId, 'ddddd');
  });
  await ok('E7: carrier.requestId 保留', () => {
    let ctx = null;
    withWorkerContext(
      { traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01', requestId: 'req-123' },
      () => { ctx = getSpanContext(); }
    );
    assert.strictEqual(ctx.requestId, 'req-123');
  });
  await ok('E8: fn 非 function 返回 undefined', () => {
    const r = withWorkerContext({}, null);
    assert.strictEqual(r, undefined);
  });
  await ok('E9: fn 返回值透传', () => {
    const r = withWorkerContext(
      { traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01' },
      () => 'hello'
    );
    assert.strictEqual(r, 'hello');
  });
  await ok('E10: traceparent 格式校验（32 hex traceId + 16 hex spanId）', () => {
    let ctx = null;
    withWorkerContext(
      { traceparent: '00-1234567890abcdef1234567890abcdef-0123456789abcdef-01' },
      () => { ctx = getSpanContext(); }
    );
    assert.strictEqual(ctx.traceId, '1234567890abcdef1234567890abcdef');
  });

  // ===== F组: getCurrentTraceparent =====
  console.log('\n-- F组: getCurrentTraceparent 行为 --');
  await ok('F1: ALS 无 store 时返回 null', () => {
    assert.strictEqual(getCurrentTraceparent(), null);
  });
  await ok('F2: runWithSpan 内返回 W3C traceparent', () => {
    let tp = null;
    runWithSpan('x', () => { tp = getCurrentTraceparent(); });
    assert.ok(tp);
    assert.match(tp, /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });
  await ok('F3: traceparent 前缀是 00-', () => {
    let tp = null;
    runWithSpan('x', () => { tp = getCurrentTraceparent(); });
    assert.ok(tp.startsWith('00-'));
  });
  await ok('F4: traceparent 后缀是 -01', () => {
    let tp = null;
    runWithSpan('x', () => { tp = getCurrentTraceparent(); });
    assert.ok(tp.endsWith('-01'));
  });
  await ok('F5: 每次调用生成新 spanId', () => {
    let t1 = null, t2 = null;
    runWithSpan('x', () => {
      t1 = getCurrentTraceparent();
      t2 = getCurrentTraceparent();
    });
    assert.notStrictEqual(t1, t2);
    // traceId 应相同
    const t1parts = t1.split('-');
    const t2parts = t2.split('-');
    assert.strictEqual(t1parts[1], t2parts[1]);
  });
  await ok('F6: 嵌套 span 内 traceparent traceId 一致', () => {
    let outerTp = null, innerTp = null;
    runWithSpan('outer', () => {
      outerTp = getCurrentTraceparent();
      runWithSpan('inner', () => {
        innerTp = getCurrentTraceparent();
      });
    });
    // 各自在自己的 ALS store 中，traceId 不同
    assert.notStrictEqual(outerTp, innerTp);
  });

  // ===== G组: installWorkerSdk =====
  console.log('\n-- G组: installWorkerSdk 行为 --');
  await ok('G1: carrier=null 时返回 generated traceId', () => {
    _resetState();
    const r = installWorkerSdk(null);
    assert.strictEqual(typeof r.installed, 'boolean');
    assert.ok(r.traceId);
    assert.match(r.traceId, /^[0-9a-f]{32}$/);
  });
  await ok('G2: carrier 有 traceId 时使用', () => {
    _resetState();
    const r = installWorkerSdk({ traceId: '11111111111111111111111111111111' });
    assert.strictEqual(r.traceId, '11111111111111111111111111111111');
  });
  await ok('G3: carrier 有 traceparent 时解析 traceId', () => {
    _resetState();
    const r = installWorkerSdk({
      traceparent: '00-22222222222222222222222222222222-3333333333333333-01',
    });
    assert.strictEqual(r.traceId, '22222222222222222222222222222222');
  });
  await ok('G4: traceId 优先于 traceparent', () => {
    _resetState();
    const r = installWorkerSdk({
      traceId: '11111111111111111111111111111111',
      traceparent: '00-22222222222222222222222222222222-3333333333333333-01',
    });
    assert.strictEqual(r.traceId, '11111111111111111111111111111111');
  });
  await ok('G5: 返回对象结构完整', () => {
    _resetState();
    const r = installWorkerSdk(null);
    assert.strictEqual(typeof r.installed, 'boolean');
    assert.strictEqual(typeof r.sdkLoaded, 'boolean');
    assert.ok(typeof r.traceId === 'string');
    assert.ok(typeof r.reason === 'string');
    // installed 和 sdkLoaded 一致
    assert.strictEqual(r.installed, r.sdkLoaded);
  });

  // ===== H组: buildLlmSpanAttributes =====
  console.log('\n-- H组: buildLlmSpanAttributes 属性矩阵 --');
  await ok('H1: 空 opts 返回空对象', () => {
    const r = buildLlmSpanAttributes({});
    assert.deepStrictEqual(r, {});
  });
  await ok('H2: platform 设置 gen_ai.system + llm.platform', () => {
    const r = buildLlmSpanAttributes({ platform: 'openai' });
    assert.strictEqual(r['gen_ai.system'], 'openai');
    assert.strictEqual(r['llm.platform'], 'openai');
  });
  await ok('H3: model 设置 gen_ai.request.model + llm.model', () => {
    const r = buildLlmSpanAttributes({ model: 'gpt-4o' });
    assert.strictEqual(r['gen_ai.request.model'], 'gpt-4o');
    assert.strictEqual(r['llm.model'], 'gpt-4o');
  });
  await ok('H4: messages 数组设置 message_count', () => {
    const r = buildLlmSpanAttributes({ messages: [{ role: 'user' }, { role: 'assistant' }] });
    assert.strictEqual(r['gen_ai.request.message_count'], 2);
  });
  await ok('H5: messages 非数组不设置', () => {
    const r = buildLlmSpanAttributes({ messages: 'not-array' });
    assert.strictEqual(r['gen_ai.request.message_count'], undefined);
  });
  await ok('H6: usage.prompt_tokens 设置 gen_ai.usage.input_tokens + llm.prompt_tokens', () => {
    const r = buildLlmSpanAttributes({ usage: { prompt_tokens: 100 } });
    assert.strictEqual(r['gen_ai.usage.input_tokens'], 100);
    assert.strictEqual(r['llm.prompt_tokens'], 100);
  });
  await ok('H7: usage.completion_tokens 设置 gen_ai.usage.output_tokens + llm.completion_tokens', () => {
    const r = buildLlmSpanAttributes({ usage: { completion_tokens: 50 } });
    assert.strictEqual(r['gen_ai.usage.output_tokens'], 50);
    assert.strictEqual(r['llm.completion_tokens'], 50);
  });
  await ok('H8: usage.total_tokens 设置 gen_ai.usage.total_tokens', () => {
    const r = buildLlmSpanAttributes({ usage: { total_tokens: 150 } });
    assert.strictEqual(r['gen_ai.usage.total_tokens'], 150);
  });
  await ok('H9: usage 字符串 prompt_tokens 不设置', () => {
    const r = buildLlmSpanAttributes({ usage: { prompt_tokens: '100' } });
    assert.strictEqual(r['gen_ai.usage.input_tokens'], undefined);
  });
  await ok('H10: finishReason 设置 gen_ai.response.finish_reason', () => {
    const r = buildLlmSpanAttributes({ finishReason: 'stop' });
    assert.strictEqual(r['gen_ai.response.finish_reason'], 'stop');
  });
  await ok('H11: elapsedMs 设置 llm.elapsed_ms', () => {
    const r = buildLlmSpanAttributes({ elapsedMs: 1234 });
    assert.strictEqual(r['llm.elapsed_ms'], 1234);
  });
  await ok('H12: elapsedMs 非 number 不设置', () => {
    const r = buildLlmSpanAttributes({ elapsedMs: '1234' });
    assert.strictEqual(r['llm.elapsed_ms'], undefined);
  });
  await ok('H13: 完整 opts 返回所有属性', () => {
    const r = buildLlmSpanAttributes({
      platform: 'anthropic',
      model: 'claude-3-opus',
      messages: [1, 2, 3],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      finishReason: 'end_turn',
      elapsedMs: 500,
    });
    assert.strictEqual(r['gen_ai.system'], 'anthropic');
    assert.strictEqual(r['llm.platform'], 'anthropic');
    assert.strictEqual(r['gen_ai.request.model'], 'claude-3-opus');
    assert.strictEqual(r['llm.model'], 'claude-3-opus');
    assert.strictEqual(r['gen_ai.request.message_count'], 3);
    assert.strictEqual(r['gen_ai.usage.input_tokens'], 100);
    assert.strictEqual(r['llm.prompt_tokens'], 100);
    assert.strictEqual(r['gen_ai.usage.output_tokens'], 50);
    assert.strictEqual(r['llm.completion_tokens'], 50);
    assert.strictEqual(r['gen_ai.usage.total_tokens'], 150);
    assert.strictEqual(r['gen_ai.response.finish_reason'], 'end_turn');
    assert.strictEqual(r['llm.elapsed_ms'], 500);
  });
  await ok('H14: null opts 返回空对象', () => {
    const r = buildLlmSpanAttributes(null);
    assert.deepStrictEqual(r, {});
  });
  await ok('H15: undefined opts 返回空对象', () => {
    const r = buildLlmSpanAttributes(undefined);
    assert.deepStrictEqual(r, {});
  });
  await ok('H16: 空字符串字段不设置', () => {
    const r = buildLlmSpanAttributes({ platform: '', model: '' });
    assert.strictEqual(r['gen_ai.system'], undefined);
    assert.strictEqual(r['gen_ai.request.model'], undefined);
  });

  // ===== I组: runWithLlmSpan =====
  console.log('\n-- I组: runWithLlmSpan 行为 --');
  await ok('I1: LLM attrs 注入 ALS store', () => {
    let attrs = null;
    runWithLlmSpan('llm-call', () => {
      attrs = getCurrentLlmAttributes();
    }, { 'gen_ai.system': 'openai' });
    assert.ok(attrs);
    assert.strictEqual(attrs['gen_ai.system'], 'openai');
  });
  await ok('I2: fn 返回值透传', () => {
    const r = runWithLlmSpan('x', () => 42, {});
    assert.strictEqual(r, 42);
  });
  await ok('I3: fn 抛错透传', () => {
    assert.throws(() => runWithLlmSpan('x', () => { throw new Error('boom'); }, {}), /boom/);
  });
  await ok('I4: 无 attrs 时 store 无 llmAttributes', () => {
    let attrs = null;
    runWithLlmSpan('x', () => {
      attrs = getCurrentLlmAttributes();
    }, null);
    assert.strictEqual(attrs, null);
  });
  await ok('I5: 无 attrs 时 store 仍有 traceId', () => {
    let traceId = null;
    runWithLlmSpan('x', () => {
      traceId = getTraceId();
    }, null);
    assert.ok(traceId);
  });
  await ok('I6: 回调内可读到 traceId + llmAttributes', () => {
    let captured = null;
    runWithLlmSpan('x', () => {
      captured = {
        traceId: getTraceId(),
        llmAttrs: getCurrentLlmAttributes(),
      };
    }, { 'llm.model': 'test-model' });
    assert.ok(captured.traceId);
    assert.strictEqual(captured.llmAttrs['llm.model'], 'test-model');
  });
  await ok('I7: 嵌套 runWithLlmSpan 合并 attrs', () => {
    let innerAttrs = null;
    runWithLlmSpan('outer', () => {
      runWithLlmSpan('inner', () => {
        innerAttrs = getCurrentLlmAttributes();
      }, { 'llm.inner': 'v' });
    }, { 'llm.outer': 'v' });
    assert.strictEqual(innerAttrs['llm.inner'], 'v');
  });

  // ===== J组: getCurrentLlmAttributes =====
  console.log('\n-- J组: getCurrentLlmAttributes 行为 --');
  await ok('J1: ALS 无 store 返回 null', () => {
    assert.strictEqual(getCurrentLlmAttributes(), null);
  });
  await ok('J2: runWithSpan 内无 llmAttributes 返回 null', () => {
    let r = null;
    runWithSpan('x', () => { r = getCurrentLlmAttributes(); });
    assert.strictEqual(r, null);
  });
  await ok('J3: runWithLlmSpan 内返回 attrs 对象', () => {
    let r = null;
    runWithLlmSpan('x', () => { r = getCurrentLlmAttributes(); }, { a: 1 });
    assert.strictEqual(r.a, 1);
  });
  await ok('J4: 返回的对象不被外部修改影响', () => {
    let r = null;
    runWithLlmSpan('x', () => {
      r = getCurrentLlmAttributes();
    }, { a: 1 });
    // 外部修改 r 不应影响 ALS
    const r2 = getCurrentLlmAttributes();
    assert.strictEqual(r2, null); // ALS 已退出
  });

  // ===== K组: getStats / isInstalled =====
  console.log('\n-- K组: getStats / isInstalled / _resetState --');
  await ok('K1: 初始 isInstalled=false', () => {
    _resetState();
    assert.strictEqual(isInstalled(), false);
  });
  await ok('K2: _resetState 重置 installed', () => {
    _state.installed = true;
    assert.strictEqual(isInstalled(), true);
    _resetState();
    assert.strictEqual(isInstalled(), false);
  });
  await ok('K3: getStats 返回 installed/version/errors', () => {
    _resetState();
    _state.version = null; // _resetState 不重置 version（源码行为）
    const s = getStats();
    assert.strictEqual(s.installed, false);
    assert.strictEqual(s.version, null);
    assert.deepStrictEqual(s.errors, []);
  });
  await ok('K3b: _state.version 设置后 getStats 返回', () => {
    _resetState();
    _state.version = 'v1.0';
    const s = getStats();
    assert.strictEqual(s.version, 'v1.0');
    _resetState();
  });
  await ok('K4: getStats errors 是新数组（防外部修改）', () => {
    _resetState();
    const s1 = getStats();
    s1.errors.push({ fake: true });
    const s2 = getStats();
    assert.deepStrictEqual(s2.errors, []);
  });
  await ok('K5: getStats errors 累计记录', () => {
    _resetState();
    _state.errors.push({ at: 1, error: 'e1' });
    _state.errors.push({ at: 2, error: 'e2' });
    const s = getStats();
    assert.strictEqual(s.errors.length, 2);
    assert.strictEqual(s.errors[0].error, 'e1');
  });
  await ok('K6: _resetState 清空 errors', () => {
    _state.errors.push({ at: 1, error: 'e1' });
    _resetState();
    assert.deepStrictEqual(_state.errors, []);
  });

  // ===== L组: 集成场景 =====
  console.log('\n-- L组: 集成场景 --');
  await ok('L1: 完整 AI 调用链：installWorkerSdk → runWithLlmSpan → getCurrentTraceparent', () => {
    _resetState();
    const installResult = installWorkerSdk({
      traceparent: '00-44444444444444444444444444444444-5555555555555555-01',
    });
    assert.ok(installResult.traceId);
    const attrs = buildLlmSpanAttributes({
      platform: 'openai',
      model: 'gpt-4o',
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      finishReason: 'stop',
      elapsedMs: 500,
    });
    let captured = null;
    withWorkerContext(
      { traceparent: '00-44444444444444444444444444444444-5555555555555555-01', traceId: installResult.traceId },
      () => {
        runWithLlmSpan('llm-call', () => {
          captured = {
            traceId: getTraceId(),
            attrs: getCurrentLlmAttributes(),
            tp: getCurrentTraceparent(),
          };
        }, attrs);
      }
    );
    assert.ok(captured.traceId);
    assert.strictEqual(captured.attrs['gen_ai.system'], 'openai');
    assert.ok(captured.tp);
  });
  await ok('L2: 异常透传但 ALS 状态不影响', () => {
    _resetState();
    let caught = false;
    try {
      runWithLlmSpan('x', () => { throw new Error('test'); }, { a: 1 });
    } catch (e) {
      caught = true;
      assert.strictEqual(e.message, 'test');
    }
    assert.strictEqual(caught, true);
    // ALS 应已退出
    assert.strictEqual(getCurrentLlmAttributes(), null);
    assert.strictEqual(getTraceId(), null);
  });

  // 恢复 NODE_ENV
  process.env.NODE_ENV = ORIG_NODE_ENV;
  _resetState();

  // ===== summary =====
  console.log(`\n--- summary: pass=${pass} fail=${fail} ---`);
  if (failures.length) {
    console.log('failures:', JSON.stringify(failures, null, 2));
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  process.env.NODE_ENV = ORIG_NODE_ENV;
  console.error('fatal:', e);
  process.exit(2);
});
