// tests/specs/otel-traceid.cjs
// 周期 4 P1-1: W3C traceparent 解析 + 透传 + traceId 注入日志
//
// 背景：周期 3 logger 仅串联 reqId；周期 4 升级为 W3C Trace Context 标准
//   - parseTraceparent(header) → { version, traceId, parentId, flags, sampled }
//   - generateTraceparent(parent?) → '00-<traceId>-<spanId>-<flags>'
//   - httpLoggerMiddleware 透传 traceparent 头（请求 + 响应）
//   - logger.info 在 ALS 内自动注入 traceId 字段
//
// 验收：
//   - parseTraceparent 接受规范 55 字符字符串
//   - parseTraceparent 拒非法格式 / 全 0 traceId / 版本不是 00
//   - generateTraceparent 生成 55 字符标准串
//   - generateTraceparent(parent) 复用 traceId
//   - httpLoggerMiddleware 接收 traceparent 头 → ALS 上下文有 traceId
//   - logger 输出 JSON 含 traceId
//   - 性能 benchmark：emit 10000 次 < 200ms（pino 5x 目标：本实现 2-3x 预期）

'use strict';

const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const {
  parseTraceparent, generateTraceparent, httpLoggerMiddleware, logger, runWithRequestContext, getRequestContext,
} = require('../../server/middleware/logger');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

(async () => {
  console.log('=== otel-traceid ===');

  // ---- 1. parseTraceparent 接受规范字符串 ----
  await test('parseTraceparent 标准串', () => {
    const r = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    assert.ok(r);
    assert.strictEqual(r.version, '00');
    assert.strictEqual(r.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
    assert.strictEqual(r.parentId, '00f067aa0ba902b7');
    assert.strictEqual(r.flags, '01');
    assert.strictEqual(r.sampled, true);
  });
  await test('parseTraceparent flags=00 → sampled=false', () => {
    const r = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00');
    assert.strictEqual(r.sampled, false);
  });
  await test('parseTraceparent 前后空格容忍', () => {
    const r = parseTraceparent('  00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01  ');
    assert.ok(r);
  });

  // ---- 2. parseTraceparent 拒绝 ----
  await test('parseTraceparent null → null', () => assert.strictEqual(parseTraceparent(null), null));
  await test('parseTraceparent undefined → null', () => assert.strictEqual(parseTraceparent(undefined), null));
  await test('parseTraceparent 空字符串 → null', () => assert.strictEqual(parseTraceparent(''), null));
  await test('parseTraceparent 非字符串 → null', () => assert.strictEqual(parseTraceparent(123), null));
  await test('parseTraceparent 全 0 traceId → null', () => {
    const r = parseTraceparent('00-00000000000000000000000000000000-00f067aa0ba902b7-01');
    assert.strictEqual(r, null);
  });
  await test('parseTraceparent 全 0 parentId → null', () => {
    const r = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01');
    assert.strictEqual(r, null);
  });
  await test('parseTraceparent 版本 != 00 → null', () => {
    const r = parseTraceparent('01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    assert.strictEqual(r, null);
  });
  await test('parseTraceparent traceId 太短 → null', () => {
    const r = parseTraceparent('00-4bf92f3577b34da6-00f067aa0ba902b7-01');
    assert.strictEqual(r, null);
  });

  // ---- 3. generateTraceparent ----
  await test('generateTraceparent() → 55 字符标准串', () => {
    const tp = generateTraceparent();
    assert.match(tp, /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
    assert.strictEqual(tp.length, 55);
  });
  await test('generateTraceparent(parent) 复用 traceId', () => {
    const parent = { traceId: 'a'.repeat(32), flags: '01' };
    const tp = generateTraceparent(parent);
    assert.match(tp, /^00-a{32}-[0-9a-f]{16}-01$/);
  });
  await test('generateTraceparent(parent) 生成新 spanId', () => {
    const tp1 = generateTraceparent({ traceId: 'a'.repeat(32) });
    const tp2 = generateTraceparent({ traceId: 'a'.repeat(32) });
    const span1 = tp1.split('-')[2];
    const span2 = tp2.split('-')[2];
    assert.notStrictEqual(span1, span2, '新 child spanId 应不同');
  });

  // ---- 4. httpLoggerMiddleware 透传 traceparent ----
  function callMiddleware(headers = {}) {
    const req = new EventEmitter();
    req.headers = headers;
    req.method = 'GET';
    req.originalUrl = '/api/test';
    req.ip = '127.0.0.1';
    req.socket = { remoteAddress: '127.0.0.1' };
    const res = new EventEmitter();
    const outHeaders = {};
    res.setHeader = (k, v) => { outHeaders[k.toLowerCase()] = v; };
    res.statusCode = 200;

    let capturedCtx = null;
    return new Promise((resolve) => {
      httpLoggerMiddleware(req, res, () => {
        capturedCtx = getRequestContext();
        setImmediate(() => {
          res.emit('finish');
          setImmediate(() => setImmediate(() => resolve({ capturedCtx, outHeaders })));
        });
      });
    });
  }

  await test('Middleware 接收 traceparent 头 → ctx.traceId 设置', async () => {
    const { capturedCtx } = await callMiddleware({
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    });
    assert.strictEqual(capturedCtx.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
    assert.strictEqual(capturedCtx.parentSpanId, '00f067aa0ba902b7');
  });

  await test('Middleware 无 traceparent 头 → ctx.traceId 自动生成', async () => {
    const { capturedCtx } = await callMiddleware({});
    assert.match(capturedCtx.traceId, /^[0-9a-f]{32}$/);
    assert.match(capturedCtx.parentSpanId, /^[0-9a-f]{16}$/);
  });

  // ---- 5. logger 输出含 traceId ----
  let stdoutBuf = '';
  const origWrite = process.stdout.write.bind(process.stdout);
  function captureStdout(fn) {
    stdoutBuf = '';
    process.stdout.write = (chunk) => { stdoutBuf += chunk; return true; };
    return Promise.resolve().then(() => fn()).finally(() => { process.stdout.write = origWrite; });
  }
  function parseLines(buf) {
    return buf.split('\n').filter(Boolean).map((s) => {
      try { return JSON.parse(s); } catch (_) { return { _invalid: s }; }
    });
  }

  await captureStdout(async () => {
    await runWithRequestContext({ reqId: 'rid-1', traceId: 't-1', parentSpanId: 's-1' }, async () => {
      logger.info({ event: 'test' }, 'inside als with trace');
    });
  });
  const lines = parseLines(stdoutBuf);
  await test('logger.info 在 ALS 内输出 traceId', () => {
    assert.strictEqual(lines[0].traceId, 't-1');
    assert.strictEqual(lines[0].parentSpanId, 's-1');
    assert.strictEqual(lines[0].reqId, 'rid-1');
  });

  // ---- 6. performance benchmark（pino 等价目标） ----
  await test('emit 10000 次 < 200ms（自研 logger 性能）', async () => {
    let buf = '';
    process.stdout.write = (chunk) => { buf += chunk; return true; };
    try {
      const t0 = Date.now();
      for (let i = 0; i < 10000; i++) {
        logger.info({ i, event: 'perf' }, 'perf test');
      }
      const ms = Date.now() - t0;
      console.log(`    [INFO] 10000 emit took ${ms}ms`);
      assert.ok(ms < 200, `too slow: ${ms}ms`);
    } finally {
      process.stdout.write = origWrite;
    }
  });

  // ---- 7. 周期 3 行为兼容 ----
  await test('logger.info 字符串 → 输出', async () => {
    await captureStdout(async () => {
      logger.info('hello compat');
    });
    const lines2 = parseLines(stdoutBuf);
    assert.strictEqual(lines2[0].msg, 'hello compat');
  });

  await test('logger.child 合并 bindings', async () => {
    await captureStdout(async () => {
      logger.child({ component: 'cycle-4' }).info({ x: 1 }, 'child msg');
    });
    const lines3 = parseLines(stdoutBuf);
    assert.strictEqual(lines3[0].component, 'cycle-4');
    assert.strictEqual(lines3[0].msg, 'child msg');
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
