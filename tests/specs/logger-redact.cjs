// tests/specs/logger-redact.cjs
// 周期 3 P1-3: 可观察性 —— redact apiKey/baseUrl + AsyncLocalStorage requestId + JSON 结构化
//
// 验收：
//   - logger.info({apiKey:'sk-...'}, 'msg') 输出 JSON 含 "[REDACTED]" 而非 sk-...
//   - AsyncLocalStorage.run 跨 await 串联 reqId
//   - httpLoggerMiddleware 设 X-Request-Id 响应头 + 输出 http_start / http_end
//   - redact 函数递归处理嵌套对象 + 数组
//   - installGlobalHandlers 注册 uncaughtException/unhandledRejection

'use strict';

const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const {
  logger, redact, httpLoggerMiddleware,
  runWithRequestContext, getRequestId,
  REDACT_PATHS,
} = require('../../server/middleware/logger');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

// 捕获 stdout
let stdoutBuf = '';
const origWrite = process.stdout.write.bind(process.stdout);
function captureStdout(fn) {
  stdoutBuf = '';
  process.stdout.write = (chunk) => { stdoutBuf += chunk; return true; };
  return Promise.resolve().then(() => fn()).finally(() => {
    process.stdout.write = origWrite;
  });
}

function parseLines(buf) {
  return buf.split('\n').filter(Boolean).map((s) => {
    try { return JSON.parse(s); } catch (_) { return { _invalid: s }; }
  });
}

(async () => {
  console.log('=== logger-redact ===');

  // ---- 1. redact 函数 ----
  await test('redact 顶层 apiKey', () => {
    const out = redact({ apiKey: 'sk-1234' });
    assert.strictEqual(out.apiKey, '[REDACTED]');
  });

  await test('redact 顶层 baseUrl', () => {
    const out = redact({ baseUrl: 'http://x', platform: 'openai' });
    assert.strictEqual(out.baseUrl, '[REDACTED]');
    assert.strictEqual(out.platform, 'openai');
  });

  await test('redact 嵌套对象', () => {
    const out = redact({ user: { apiKey: 'sk-y', name: 'a' } });
    assert.strictEqual(out.user.apiKey, '[REDACTED]');
    assert.strictEqual(out.user.name, 'a');
  });

  await test('redact 数组', () => {
    const out = redact({ keys: [{ apiKey: 'a' }, { apiKey: 'b' }] });
    assert.strictEqual(out.keys[0].apiKey, '[REDACTED]');
    assert.strictEqual(out.keys[1].apiKey, '[REDACTED]');
  });

  await test('redact authorization header', () => {
    const out = redact({ authorization: 'Bearer xyz' });
    assert.strictEqual(out.authorization, '[REDACTED]');
  });

  await test('redact password / token / secret', () => {
    const out = redact({ password: 'p', token: 't', secret: 's', name: 'n' });
    assert.strictEqual(out.password, '[REDACTED]');
    assert.strictEqual(out.token, '[REDACTED]');
    assert.strictEqual(out.secret, '[REDACTED]');
    assert.strictEqual(out.name, 'n');
  });

  await test('redact null / 非对象', () => {
    assert.strictEqual(redact(null), null);
    assert.strictEqual(redact(undefined), undefined);
    assert.strictEqual(redact('string'), 'string');
    assert.strictEqual(redact(42), 42);
  });

  await test('REDACT_PATHS 至少 10 项', () => {
    assert.ok(REDACT_PATHS.length >= 10);
  });

  // ---- 2. logger JSON 输出 ----
  await captureStdout(async () => {
    logger.info({ platform: 'openai', apiKey: 'sk-LIVE' }, 'AI 请求开始');
  });
  let lines = parseLines(stdoutBuf);
  assert.strictEqual(lines.length, 1);
  await test('logger.info 输出 1 行 JSON', () => assert.strictEqual(lines.length, 1));
  const line = lines[0];
  await test('JSON 含 ts/level/msg/reqId', () => {
    assert.ok(line.ts);
    assert.strictEqual(line.level, 'info');
    assert.strictEqual(line.msg, 'AI 请求开始');
    assert.ok(line.reqId === undefined || typeof line.reqId === 'string');
  });
  await test('JSON 自动 redact apiKey', () => {
    assert.strictEqual(line.apiKey, '[REDACTED]');
    assert.ok(!stdoutBuf.includes('sk-LIVE'));
  });
  await test('JSON 保留 platform', () => {
    assert.strictEqual(line.platform, 'openai');
  });

  // ---- 3. logger 多 API ----
  await captureStdout(async () => {
    logger.debug({ a: 1 }, 'debug msg');
    logger.warn({ b: 2 }, 'warn msg');
    logger.error({ c: 3 }, 'error msg');
  });
  lines = parseLines(stdoutBuf);
  await test('logger.debug/info/warn/error 都输出（debug 默认被 level 过滤）', () => {
    assert.strictEqual(lines.length, 2, `应 2 行（debug 被 info level 过滤），实际 ${lines.length}`);
    assert.strictEqual(lines[0].level, 'warn');
    assert.strictEqual(lines[1].level, 'error');
  });

  // ---- 4. logger 接受字符串 ----
  await captureStdout(async () => {
    logger.info('hello world');
  });
  lines = parseLines(stdoutBuf);
  await test('logger.info("string") 输出 msg', () => {
    assert.strictEqual(lines[0].msg, 'hello world');
  });

  // ---- 5. logger.child ----
  await captureStdout(async () => {
    const child = logger.child({ component: 'ai' });
    child.info({ platform: 'openai' }, 'child msg');
  });
  lines = parseLines(stdoutBuf);
  await test('logger.child 合并 bindings', () => {
    assert.strictEqual(lines[0].component, 'ai');
    assert.strictEqual(lines[0].msg, 'child msg');
  });

  // ---- 6. AsyncLocalStorage 跨 await ----
  await test('runWithRequestContext 跨 await 传 reqId', async () => {
    let captured;
    await runWithRequestContext({ reqId: 'abc123' }, async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 5));
      captured = getRequestId();
    });
    assert.strictEqual(captured, 'abc123');
  });

  await test('退出 runWithRequestContext 后 reqId 为 undefined', () => {
    assert.strictEqual(getRequestId(), undefined);
  });

  // ---- 7. logger 在 ALS 内自动取 reqId ----
  await captureStdout(async () => {
    await runWithRequestContext({ reqId: 'xyz789', ip: '1.2.3.4' }, async () => {
      await new Promise((r) => setTimeout(r, 5));
      logger.info({ test: 1 }, 'inside als');
    });
  });
  lines = parseLines(stdoutBuf);
  await test('logger 在 ALS 内输出 reqId', () => {
    assert.strictEqual(lines[0].reqId, 'xyz789');
    assert.strictEqual(lines[0].ip, '1.2.3.4');
  });

  // ---- 8. httpLoggerMiddleware ----
  await test('httpLoggerMiddleware 设 X-Request-Id 响应头', async () => {
    const req = new EventEmitter();
    req.headers = {};
    req.method = 'GET';
    req.originalUrl = '/api/health';
    req.ip = '127.0.0.1';
    req.socket = { remoteAddress: '127.0.0.1' };
    const res = new EventEmitter();
    const headers = {};
    res.setHeader = (k, v) => { headers[k.toLowerCase()] = v; };
    res.statusCode = 200;

    await captureStdout(async () => {
      // 同步：注册 middleware（会 emit http_start）
      httpLoggerMiddleware(req, res, () => {});
      // 同步：emit finish（会触发 emit http_end）
      res.emit('finish');
      // 等微任务队列清空（让 setImmediate 链跑完）
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
    });
    assert.ok(headers['x-request-id'], '应设 X-Request-Id');
    const lines2 = parseLines(stdoutBuf);
    assert.strictEqual(lines2.length, 2, `应 2 行（start + end），实际 ${lines2.length}: ${stdoutBuf}`);
    assert.strictEqual(lines2[0].event, 'http_start');
    assert.strictEqual(lines2[1].event, 'http_end');
    assert.strictEqual(lines2[1].status, 200);
    assert.ok(lines2[1].durationMs >= 0);
  });

  await test('httpLoggerMiddleware 复用 client X-Request-Id', async () => {
    const req = new EventEmitter();
    req.headers = { 'x-request-id': 'from-client-123' };
    req.method = 'POST';
    req.originalUrl = '/api/ai/chat/stream';
    req.ip = '10.0.0.1';
    req.socket = { remoteAddress: '10.0.0.1' };
    const res = new EventEmitter();
    const headers = {};
    res.setHeader = (k, v) => { headers[k.toLowerCase()] = v; };
    res.statusCode = 200;

    await captureStdout(async () => {
      await new Promise((resolve) => {
        httpLoggerMiddleware(req, res, () => resolve());
        setImmediate(() => {
          res.emit('finish');
          setImmediate(() => setImmediate(resolve));
        });
      });
    });
    assert.strictEqual(headers['x-request-id'], 'from-client-123');
    const lines2 = parseLines(stdoutBuf);
    assert.strictEqual(lines2[0].reqId, 'from-client-123');
    assert.strictEqual(lines2[0].ip, '10.0.0.1');
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
