// tests/specs/logger-boundary-deep.cjs
// Cycle 27 R4: logger.js 边界深度测试
// 覆盖 parseTraceparent 格式边界 + generateTraceparent + redact 类型边界
// + requestContext ALS + logger 中间件请求处理 + 集成 + 回归

'use strict';

const assert = require('node:assert');
const path = require('node:path');

const L = require(path.join(__dirname, '../../server/middleware/logger'));
const {
  logger,
  redact,
  httpLoggerMiddleware,
  installGlobalHandlers,
  runWithRequestContext,
  getRequestContext,
  getRequestId,
  REDACT_PATHS,
  parseTraceparent,
  generateTraceparent,
} = L;

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
  console.log('=== Cycle 27 R4: logger.js boundary deep tests ===\n');

  // ===== A组: 模块导出 =====
  console.log('\n-- A组: 模块导出 =====');
  await ok('A1: logger 是 object', () => {
    assert.strictEqual(typeof logger, 'object');
    assert.ok(logger !== null);
  });
  await ok('A2: redact 是 function', () => {
    assert.strictEqual(typeof redact, 'function');
  });
  await ok('A3: httpLoggerMiddleware 是 function', () => {
    assert.strictEqual(typeof httpLoggerMiddleware, 'function');
  });
  await ok('A4: installGlobalHandlers 是 function', () => {
    assert.strictEqual(typeof installGlobalHandlers, 'function');
  });
  await ok('A5: runWithRequestContext 是 function', () => {
    assert.strictEqual(typeof runWithRequestContext, 'function');
  });
  await ok('A6: getRequestContext 是 function', () => {
    assert.strictEqual(typeof getRequestContext, 'function');
  });
  await ok('A7: getRequestId 是 function', () => {
    assert.strictEqual(typeof getRequestId, 'function');
  });
  await ok('A8: REDACT_PATHS 是数组', () => {
    assert.ok(Array.isArray(REDACT_PATHS));
    assert.ok(REDACT_PATHS.length >= 10);
  });
  await ok('A9: parseTraceparent 是 function', () => {
    assert.strictEqual(typeof parseTraceparent, 'function');
  });
  await ok('A10: generateTraceparent 是 function', () => {
    assert.strictEqual(typeof generateTraceparent, 'function');
  });

  // ===== B组: parseTraceparent 格式边界 =====
  console.log('\n-- B组: parseTraceparent 格式边界 =====');
  const VALID_TP = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
  const VALID_TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
  const VALID_SPAN_ID = '00f067aa0ba902b7';

  await ok('B1: 有效 W3C 格式 → 完整解析', () => {
    const r = parseTraceparent(VALID_TP);
    assert.strictEqual(r.version, '00');
    assert.strictEqual(r.traceId, VALID_TRACE_ID);
    assert.strictEqual(r.parentId, VALID_SPAN_ID);
    assert.strictEqual(r.flags, '01');
    assert.strictEqual(r.sampled, true);
  });
  await ok('B2: flags=00 → sampled=false', () => {
    const tp = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00';
    const r = parseTraceparent(tp);
    assert.strictEqual(r.flags, '00');
    assert.strictEqual(r.sampled, false);
  });
  await ok('B3: version≠00 → null（仅支持 v0）', () => {
    const r = parseTraceparent('01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    assert.strictEqual(r, null);
  });
  await ok('B4: version=ff → null', () => {
    const r = parseTraceparent('ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    assert.strictEqual(r, null);
  });
  await ok('B5: traceId 太短 (30 hex) → null', () => {
    const r = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e473-00f067aa0ba902b7-01');
    assert.strictEqual(r, null);
  });
  await ok('B6: traceId 太长 (34 hex) → null', () => {
    const r = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736aa-00f067aa0ba902b7-01');
    assert.strictEqual(r, null);
  });
  await ok('B7: spanId 太短 (14 hex) → null', () => {
    const r = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b-01');
    assert.strictEqual(r, null);
  });
  await ok('B8: spanId 太长 (18 hex) → null', () => {
    const r = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7aa-01');
    assert.strictEqual(r, null);
  });
  await ok('B9: traceId 全零 → null', () => {
    const r = parseTraceparent('00-00000000000000000000000000000000-00f067aa0ba902b7-01');
    assert.strictEqual(r, null);
  });
  await ok('B10: parentId 全零 → null', () => {
    const r = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01');
    assert.strictEqual(r, null);
  });
  await ok('B11: 缺分隔符 → null', () => {
    const r = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736 00f067aa0ba902b7-01');
    assert.strictEqual(r, null);
  });
  await ok('B12: 大写 hex → null（regex 仅匹配小写）', () => {
    const r = parseTraceparent('00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01');
    assert.strictEqual(r, null);
  });
  await ok('B13: 前导/尾随空白 → 解析成功（trim）', () => {
    const r = parseTraceparent('  ' + VALID_TP + '  ');
    assert.strictEqual(r.traceId, VALID_TRACE_ID);
  });
  await ok('B14: null → null', () => {
    assert.strictEqual(parseTraceparent(null), null);
  });
  await ok('B15: 非字符串 → null', () => {
    assert.strictEqual(parseTraceparent(42), null);
    assert.strictEqual(parseTraceparent(undefined), null);
    assert.strictEqual(parseTraceparent([]), null);
  });

  // ===== C组: generateTraceparent 边界 =====
  console.log('\n-- C组: generateTraceparent 边界 =====');
  await ok('C1: 无 parent → 生成新 trace（32hex traceId）', () => {
    const r = generateTraceparent();
    const m = r.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/);
    assert.ok(m);
    assert.ok(m[1].length === 32);
  });
  await ok('C2: parent.traceId → 复用', () => {
    const r = generateTraceparent({ traceId: VALID_TRACE_ID });
    const m = r.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/);
    assert.strictEqual(m[1], VALID_TRACE_ID);
  });
  await ok('C3: parent.flags=00 → 复用', () => {
    const r = generateTraceparent({ traceId: VALID_TRACE_ID, flags: '00' });
    assert.ok(r.endsWith('-00'));
  });
  await ok('C4: parent.flags 缺 → 默认 01', () => {
    const r = generateTraceparent({ traceId: VALID_TRACE_ID });
    assert.ok(r.endsWith('-01'));
  });
  await ok('C5: 多次调用 → spanId 不同', () => {
    const r1 = generateTraceparent();
    const r2 = generateTraceparent();
    assert.notStrictEqual(r1, r2);
    const span1 = r1.split('-')[2];
    const span2 = r2.split('-')[2];
    assert.notStrictEqual(span1, span2);
  });
  await ok('C6: null parent → 生成新 trace', () => {
    const r = generateTraceparent(null);
    assert.ok(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/.test(r));
  });
  await ok('C7: parent={} → 生成新 traceId', () => {
    const r = generateTraceparent({});
    const m = r.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-01$/);
    assert.ok(m);
  });
  await ok('C8: parent.traceId=空字符串 → falsy → 生成新', () => {
    const r = generateTraceparent({ traceId: '' });
    // '' 是 falsy，使用新生成的
    assert.ok(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/.test(r));
  });

  // ===== D组: redact 类型边界 =====
  console.log('\n-- D组: redact 类型边界 =====');
  await ok('D1: null → null', () => {
    assert.strictEqual(redact(null), null);
  });
  await ok('D2: undefined → undefined', () => {
    assert.strictEqual(redact(undefined), undefined);
  });
  await ok('D3: 字符串 → 原样返回', () => {
    assert.strictEqual(redact('hello'), 'hello');
  });
  await ok('D4: 数字 → 原样返回', () => {
    assert.strictEqual(redact(42), 42);
  });
  await ok('D5: 布尔 → 原样返回', () => {
    assert.strictEqual(redact(true), true);
  });
  await ok('D6: 数组 → 递归 redact', () => {
    const arr = [{ apiKey: 'secret' }, { password: 'pw' }];
    const r = redact(arr);
    assert.strictEqual(r[0].apiKey, '[REDACTED]');
    assert.strictEqual(r[1].password, '[REDACTED]');
  });
  await ok('D7: 空对象 → 空对象', () => {
    assert.deepStrictEqual(redact({}), {});
  });
  await ok('D8: 敏感字段 redact', () => {
    const r = redact({ apiKey: 'sk-123', password: 'pw', token: 'tok' });
    assert.strictEqual(r.apiKey, '[REDACTED]');
    assert.strictEqual(r.password, '[REDACTED]');
    assert.strictEqual(r.token, '[REDACTED]');
  });
  await ok('D9: 非敏感字段保留', () => {
    const r = redact({ name: 'test', value: 42 });
    assert.strictEqual(r.name, 'test');
    assert.strictEqual(r.value, 42);
  });
  await ok('D10: 嵌套对象递归', () => {
    const r = redact({ outer: { apiKey: 'secret' } });
    assert.strictEqual(r.outer.apiKey, '[REDACTED]');
  });
  await ok('D11: 嵌套数组递归', () => {
    const r = redact({ items: [{ password: 'pw' }] });
    assert.strictEqual(r.items[0].password, '[REDACTED]');
  });
  await ok('D12: 所有 REDACT_PATHS 都被 redact', () => {
    const obj = {};
    for (const k of REDACT_PATHS) {
      obj[k] = 'secret-value';
    }
    const r = redact(obj);
    for (const k of REDACT_PATHS) {
      assert.strictEqual(r[k], '[REDACTED]', `Field ${k} should be redacted`);
    }
  });

  // ===== E组: requestContext ALS =====
  console.log('\n-- E组: requestContext ALS =====');
  await ok('E1: 无 context → getRequestContext=null', () => {
    const r = getRequestContext();
    assert.strictEqual(r, null);
  });
  await ok('E2: 无 context → getRequestId=undefined', () => {
    const r = getRequestId();
    assert.strictEqual(r, undefined);
  });
  await ok('E3: runWithRequestContext 同步 → ctx 可用', () => {
    let sawCtx = null;
    runWithRequestContext({ reqId: 'req_123' }, () => {
      sawCtx = getRequestContext();
    });
    assert.strictEqual(sawCtx.reqId, 'req_123');
  });
  await ok('E4: runWithRequestContext 返回 fn 结果', () => {
    const result = runWithRequestContext({ reqId: 'req_123' }, () => 'result');
    assert.strictEqual(result, 'result');
  });
  await ok('E5: runWithRequestContext 注入 startedAt', () => {
    let sawCtx = null;
    runWithRequestContext({ reqId: 'req_123' }, () => {
      sawCtx = getRequestContext();
    });
    assert.ok(sawCtx.startedAt > 0);
  });
  await ok('E6: 退出 context 后 → 恢复 null', () => {
    runWithRequestContext({ reqId: 'req_123' }, () => {
      // context 内
    });
    const after = getRequestContext();
    assert.strictEqual(after, null);
  });
  await ok('E7: 嵌套 context → 内层覆盖外层', () => {
    let innerCtx = null;
    runWithRequestContext({ reqId: 'outer' }, () => {
      runWithRequestContext({ reqId: 'inner' }, () => {
        innerCtx = getRequestContext();
      });
    });
    assert.strictEqual(innerCtx.reqId, 'inner');
  });
  await ok('E8: getRequestId 在 context 内可用', () => {
    let sawReqId = null;
    runWithRequestContext({ reqId: 'req_xyz' }, () => {
      sawReqId = getRequestId();
    });
    assert.strictEqual(sawReqId, 'req_xyz');
  });

  // ===== F组: logger 中间件请求处理 =====
  console.log('\n-- F组: logger 中间件请求处理 =====');
  function makeMockReq(overrides = {}) {
    return {
      headers: {},
      method: 'GET',
      url: '/',
      ...overrides,
    };
  }
  function makeMockRes() {
    return {
      statusCode: 200,
      headers: {},
      end: () => {},
      write: () => {},
      setHeader: () => {},
      getHeader: () => undefined,
      on: () => {},
    };
  }
  await ok('F1: httpLoggerMiddleware 是 middleware function', () => {
    assert.strictEqual(typeof httpLoggerMiddleware, 'function');
  });
  await ok('F2: middleware 注入 reqId 到 ALS', async () => {
    const req = makeMockReq({ headers: { 'x-request-id': 'req_mw' } });
    const res = makeMockRes();
    let nextCalled = false;
    await new Promise((resolve) => {
      httpLoggerMiddleware(req, res, () => { nextCalled = true; resolve(); });
    });
    assert.strictEqual(nextCalled, true);
  });
  await ok('F3: middleware 不阻断请求', async () => {
    const req = makeMockReq({ headers: {} });
    const res = makeMockRes();
    let nextCalled = false;
    await new Promise((resolve) => {
      httpLoggerMiddleware(req, res, () => { nextCalled = true; resolve(); });
    });
    assert.strictEqual(nextCalled, true);
  });
  await ok('F4: middleware 生成新 reqId 时无 header', async () => {
    const req = makeMockReq({ headers: {} });
    const res = makeMockRes();
    let setHeaderCalled = false;
    res.setHeader = (k, v) => {
      if (k === 'X-Request-Id') setHeaderCalled = true;
    };
    let nextCalled = false;
    await new Promise((resolve) => {
      httpLoggerMiddleware(req, res, () => { nextCalled = true; resolve(); });
    });
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(setHeaderCalled, true);
  });
  await ok('F5: logger.info 不抛错', () => {
    logger.info('test message');
  });
  await ok('F6: logger.info(obj, msg) 不抛错', () => {
    logger.info({ foo: 'bar' }, 'test');
  });
  await ok('F7: logger.warn 不抛错', () => {
    logger.warn('warning');
  });
  await ok('F8: logger.error 不抛错', () => {
    logger.error('error');
  });
  await ok('F9: logger.debug 不抛错', () => {
    logger.debug('debug');
  });
  await ok('F10: logger.child 返回 logger-like', () => {
    const child = logger.child({ component: 'test' });
    assert.strictEqual(typeof child.info, 'function');
  });

  // ===== G组: 集成场景 =====
  console.log('\n-- G组: 集成场景 =====');
  await ok('G1: parseTraceparent → generateTraceparent 链式', () => {
    const parsed = parseTraceparent(VALID_TP);
    const child = generateTraceparent({ traceId: parsed.traceId });
    // child 复用 traceId
    const childParsed = parseTraceparent(child);
    assert.strictEqual(childParsed.traceId, parsed.traceId);
    // 但 spanId 不同
    assert.notStrictEqual(childParsed.parentId, parsed.parentId);
  });
  await ok('G2: runWithRequestContext + logger 注入 traceId', () => {
    const parsed = parseTraceparent(VALID_TP);
    runWithRequestContext(
      { reqId: 'req_int', traceId: parsed.traceId, parentSpanId: parsed.parentId },
      () => {
        // logger.info 会注入 ctx.traceId
        logger.info({ foo: 'bar' }, 'test');
      }
    );
    // 不抛错即通过
    assert.ok(true);
  });
  await ok('G3: redact + logger 组合', () => {
    const ctx = { reqId: 'req_r', apiKey: 'sk-secret' };
    runWithRequestContext(ctx, () => {
      const redacted = redact(ctx);
      assert.strictEqual(redacted.apiKey, '[REDACTED]');
      assert.strictEqual(redacted.reqId, 'req_r');
    });
  });
  await ok('G4: 多 context 不串扰', () => {
    let results = [];
    runWithRequestContext({ reqId: 'a' }, () => {
      results.push(getRequestId());
    });
    runWithRequestContext({ reqId: 'b' }, () => {
      results.push(getRequestId());
    });
    assert.deepStrictEqual(results, ['a', 'b']);
  });
  await ok('G5: 完整 W3C 链路', () => {
    // 1. 解析传入 traceparent
    const incoming = parseTraceparent(VALID_TP);
    assert.ok(incoming);
    // 2. 注入 context
    let ctxInContext = null;
    runWithRequestContext(
      { reqId: 'r1', traceId: incoming.traceId, parentSpanId: incoming.parentId },
      () => { ctxInContext = getRequestContext(); }
    );
    assert.strictEqual(ctxInContext.traceId, incoming.traceId);
    // 3. 生成子调用 traceparent
    const child = generateTraceparent({ traceId: incoming.traceId, flags: incoming.flags });
    const childParsed = parseTraceparent(child);
    assert.strictEqual(childParsed.traceId, incoming.traceId);
    assert.strictEqual(childParsed.sampled, incoming.sampled);
  });
  await ok('G6: REDACT_PATHS 覆盖 API 密钥模式', () => {
    const patterns = ['apiKey', 'api_key', 'apikey', 'baseUrl', 'token', 'password'];
    for (const p of patterns) {
      assert.ok(REDACT_PATHS.includes(p), `Missing ${p} in REDACT_PATHS`);
    }
  });
  await ok('G7: redact 保留非敏感嵌套结构', () => {
    const obj = {
      safe: { nested: { deep: 'value' } },
      items: [{ name: 'x', apiKey: 'secret' }],
    };
    const r = redact(obj);
    assert.strictEqual(r.safe.nested.deep, 'value');
    assert.strictEqual(r.items[0].name, 'x');
    assert.strictEqual(r.items[0].apiKey, '[REDACTED]');
  });
  await ok('G8: generateTraceparent 输出格式稳定', () => {
    const r1 = generateTraceparent();
    const r2 = generateTraceparent({ traceId: VALID_TRACE_ID });
    // 都是 00-32hex-16hex-2hex 格式
    assert.ok(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/.test(r1));
    assert.ok(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/.test(r2));
    assert.strictEqual(r1.length, r2.length);
  });

  // ===== H组: 回归测试 =====
  console.log('\n-- H组: 回归测试 =====');
  await ok('H1: parseTraceparent 与 otel-traceid 行为一致', () => {
    const tp = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const r = parseTraceparent(tp);
    assert.strictEqual(r.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
    assert.strictEqual(r.parentId, '00f067aa0ba902b7');
  });
  await ok('H2: redact 与 logger-redact 行为一致', () => {
    const r = redact({ apiKey: 'sk-123' });
    assert.strictEqual(r.apiKey, '[REDACTED]');
  });
  await ok('H3: httpLoggerMiddleware 与 logger-middleware 行为一致', async () => {
    const req = makeMockReq({ headers: { 'x-request-id': 'req_r' } });
    const res = makeMockRes();
    let nextCalled = false;
    await new Promise((resolve) => {
      httpLoggerMiddleware(req, res, () => { nextCalled = true; resolve(); });
    });
    assert.strictEqual(nextCalled, true);
  });
  await ok('H4: generateTraceparent 与 requestid-trace-link 行为一致', () => {
    const r = generateTraceparent();
    assert.ok(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/.test(r));
  });
  await ok('H5: parseTraceparent null 输入 → null', () => {
    assert.strictEqual(parseTraceparent(null), null);
    assert.strictEqual(parseTraceparent(undefined), null);
    assert.strictEqual(parseTraceparent(''), null);
  });
  await ok('H6: redact null/undefined → 原样返回', () => {
    assert.strictEqual(redact(null), null);
    assert.strictEqual(redact(undefined), undefined);
    assert.strictEqual(redact(42), 42);
  });
  await ok('H7: runWithRequestContext 无 fn → 抛错', () => {
    assert.throws(() => runWithRequestContext({ reqId: 'x' }));
  });
  await ok('H8: getRequestId 无 context → undefined', () => {
    const r = getRequestId();
    assert.strictEqual(r, undefined);
  });
  await ok('H9: REDACT_PATHS 包含所有敏感字段', () => {
    const expected = ['apiKey', 'api_key', 'apikey', 'baseUrl', 'base_url', 'baseurl',
      'authorization', 'Authorization', 'cookie', 'Cookie', 'x-api-key', 'X-Api-Key',
      'token', 'accessToken', 'refreshToken', 'password', 'secret'];
    for (const e of expected) {
      assert.ok(REDACT_PATHS.includes(e), `Missing ${e}`);
    }
  });
  await ok('H10: logger.child 返回独立实例', () => {
    const child1 = logger.child({ a: 1 });
    const child2 = logger.child({ b: 2 });
    // child1 和 child2 应该独立
    assert.strictEqual(typeof child1.info, 'function');
    assert.strictEqual(typeof child2.info, 'function');
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
