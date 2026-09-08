// tests/specs/memory-middleware.cjs
// 周期 8 P1-3: memoryContextMiddleware —— Express ALS 自动注入
//
// 背景：
//   - 周期 7 P1-5 memory.js 提供 ALS + MemoryStore（需显式 withContext 包装）
//   - 周期 8 P1-3 落地 Express middleware，自动从 req 提取 userId/sessionId/requestId
//   - 业务 handler 内 remember() 自动附 userId（无需显式传）
//
// 验收：
//   1. 静态扫描：memory.js 导出 memoryContextMiddleware 函数
//   2. 静态扫描：memory.js 提供默认 userId 提取（x-user-id / req.user.id / req.ip）
//   3. 静态扫描：memory.js 提供默认 sessionId 提取（x-session-id / req.sessionID）
//   4. 静态扫描：memory.js 自动生成 requestId + 写响应头 x-request-id
//   5. 行为：middleware 调用后 ALS context.userId 已注入
//   6. 行为：opts.extractUserId 自定义提取生效
//   7. 行为：多个请求并发 → ALS 隔离（各自 userId）
//   8. 行为：middleware 注入后 remember() 自动附 userId

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { memoryContextMiddleware, conversationContext, MemoryStore } = require('../../server/agent/memory');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

const MEMORY_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../server/agent/memory.js'),
  'utf8',
);

(async () => {
  console.log('=== memory-middleware ===');

  // ---- 1. 静态扫描 ----
  await test('memory.js 导出 memoryContextMiddleware 函数', () => {
    assert.match(MEMORY_SRC, /memoryContextMiddleware/);
    assert.match(MEMORY_SRC, /function\s+memoryContextMiddleware\s*\(/);
    assert.match(MEMORY_SRC, /memoryContextMiddleware,\s*\/\/\s*周期\s*8\s*P1-3/);
  });
  await test('memory.js middleware 默认 userId 提取（x-user-id / req.user.id / req.ip）', () => {
    assert.match(MEMORY_SRC, /x-user-id/);
    assert.match(MEMORY_SRC, /req\.user/);
    assert.match(MEMORY_SRC, /req\.ip/);
  });
  await test('memory.js middleware 默认 sessionId 提取（x-session-id / req.sessionID）', () => {
    assert.match(MEMORY_SRC, /x-session-id/);
    assert.match(MEMORY_SRC, /req\.sessionID/);
  });
  await test('memory.js middleware 自动生成 requestId + 写响应头', () => {
    assert.match(MEMORY_SRC, /req_/);
    assert.match(MEMORY_SRC, /x-request-id/);
    assert.match(MEMORY_SRC, /res\.setHeader\(['"]x-request-id['"]/);
  });
  await test('memory.js middleware 注入 ALS context（conversationContext.run）', () => {
    assert.match(MEMORY_SRC, /conversationContext\.run\s*\(/);
  });
  await test('memory.js 提供 opts.extractUserId 自定义入口', () => {
    assert.match(MEMORY_SRC, /opts\.extractUserId/);
    assert.match(MEMORY_SRC, /opts\.extractSessionId/);
    assert.match(MEMORY_SRC, /opts\.extractRequestId/);
  });

  // ---- 2. 行为：middleware 调用后 ALS context.userId 已注入 ----
  await test('middleware 调用后 ALS context.userId 已注入', (done) => {
    const mw = memoryContextMiddleware();
    const req = { headers: { 'x-user-id': 'alice' }, ip: '127.0.0.1' };
    const res = { setHeader: () => {} };
    let capturedCtx = null;
    mw(req, res, () => {
      capturedCtx = conversationContext.getStore();
      assert.ok(capturedCtx, 'ALS context 应存在');
      assert.strictEqual(capturedCtx.userId, 'alice');
      assert.ok(capturedCtx.requestId, 'requestId 应已生成');
      assert.strictEqual(typeof capturedCtx.ts, 'number');
    });
  });

  // ---- 3. 行为：opts.extractUserId 自定义 ----
  await test('opts.extractUserId 自定义提取生效', (done) => {
    const mw = memoryContextMiddleware({
      extractUserId: (req) => req.headers['x-tenant-id'] + ':' + req.headers['x-user-id'],
    });
    const req = { headers: { 'x-user-id': 'alice', 'x-tenant-id': 'tenant-1' } };
    const res = { setHeader: () => {} };
    mw(req, res, () => {
      const ctx = conversationContext.getStore();
      assert.strictEqual(ctx.userId, 'tenant-1:alice');
    });
  });

  // ---- 4. 行为：多个请求并发 → ALS 隔离 ----
  await test('多个请求并发 → ALS 隔离（各自 userId）', async () => {
    const mw = memoryContextMiddleware();
    const results = await Promise.all([
      new Promise((resolve) => {
        const req = { headers: { 'x-user-id': 'user-a' }, ip: '127.0.0.1' };
        const res = { setHeader: () => {} };
        mw(req, res, () => {
          // 加个 await 模拟异步
          setTimeout(() => {
            resolve(conversationContext.getStore());
          }, 10);
        });
      }),
      new Promise((resolve) => {
        const req = { headers: { 'x-user-id': 'user-b' }, ip: '127.0.0.2' };
        const res = { setHeader: () => {} };
        mw(req, res, () => {
          setTimeout(() => {
            resolve(conversationContext.getStore());
          }, 5);
        });
      }),
    ]);
    assert.strictEqual(results[0].userId, 'user-a');
    assert.strictEqual(results[1].userId, 'user-b');
  });

  // ---- 5. 行为：middleware 注入后 remember() 自动附 userId ----
  await test('middleware 注入后 remember() 自动附 userId（无需显式传）', (done) => {
    const mw = memoryContextMiddleware();
    const store = new MemoryStore({ dbPath: '/tmp/test-mw-' + Date.now() + '.sqlite' });
    const req = { headers: { 'x-user-id': 'auto-alice' }, ip: '127.0.0.1' };
    const res = { setHeader: () => {} };
    mw(req, res, () => {
      // 在 ALS context 内调 remember
      store.remember('mw-key', 'mw-value');
      const r = store.recall('mw-key');
      assert.ok(r, 'recall 应返回');
      assert.strictEqual(r.userId, 'auto-alice', '应自动附 userId');
      store.cleanup();
    });
  });

  // ---- 6. 行为：自动生成的 requestId 写入响应头 ----
  await test('middleware 自动生成 requestId + 写 res.setHeader("x-request-id", ...)', (done) => {
    const mw = memoryContextMiddleware();
    const req = { headers: {}, ip: '127.0.0.1' };
    const headers = {};
    const res = { setHeader: (k, v) => { headers[k.toLowerCase()] = v; } };
    mw(req, res, () => {
      const ctx = conversationContext.getStore();
      assert.ok(ctx.requestId);
      assert.match(ctx.requestId, /^req_\d+_[a-z0-9]+$/, 'requestId 格式: req_<ts>_<rand>');
      assert.strictEqual(headers['x-request-id'], ctx.requestId, '响应头应含 requestId');
    });
  });

  // ---- 7. 行为：用户传入 x-request-id 优先 ----
  await test('用户传入 x-request-id 优先于自动生成', (done) => {
    const mw = memoryContextMiddleware();
    const req = { headers: { 'x-request-id': 'custom-req-123' }, ip: '127.0.0.1' };
    const headers = {};
    const res = { setHeader: (k, v) => { headers[k.toLowerCase()] = v; } };
    mw(req, res, () => {
      const ctx = conversationContext.getStore();
      assert.strictEqual(ctx.requestId, 'custom-req-123');
    });
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
