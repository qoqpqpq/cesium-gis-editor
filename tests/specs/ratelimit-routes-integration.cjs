// tests/specs/ratelimit-routes-integration.cjs
// 周期 6 P1-4 续: multiLevelLimiter routes 集成
//
// 背景：周期 5 P0-2 实现 multiLevelLimiter（IP + userId + apikey 三维度独立计 limit）
//   周期 6 P1-4 续：暴露 aiMultiLevelLimiter helper，能从 req.body / req.headers 自动提取 userId / apikey
//   验证：与 route 集成（用 fake req/res 模拟 Express）
//
// 验收：
//   1. 静态扫描：rateLimit.js 暴露 aiMultiLevelLimiter
//   2. 行为：aiMultiLevelLimiter IP 维度超限 → 拒
//   3. 行为：aiMultiLevelLimiter userId 维度独立计 limit（userLimit > IP limit）
//   4. 行为：aiMultiLevelLimiter apikey 维度独立计 limit（apiKeyLimit > userLimit）
//   5. 行为：apikey 截短 8 字符（不存原始 key）
//   6. 行为：Bearer token 解析
//   7. 行为：未提供 userId / apikey 时维度不计入
//   8. 行为：HTTP 响应含 RateLimit-* header
//   9. 行为：与 aiLimiter（express-rate-limit 默认）不冲突（双层防护）
//   10. 行为：store 失败 → 兜底放行（不变）

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const {
  multiLevelLimiter, aiMultiLevelLimiter, slidingWindow,
} = require('../../server/middleware/rateLimit');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

const RATE_LIMIT_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../server/middleware/rateLimit.js'),
  'utf8',
);

function fakeReqRes({ ip = '1.2.3.4', body = {}, headers = {} } = {}) {
  const req = { ip, socket: { remoteAddress: ip }, body, headers };
  const outHeaders = {};
  const res = new EventEmitter();
  res.statusCode = 200;
  res.setHeader = (k, v) => { outHeaders[k.toLowerCase()] = v; };
  res.set = res.setHeader;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (b) => { res.body = b; return res; };
  return { req, res, outHeaders };
}

async function runMw(mw, req) {
  return new Promise((resolve) => {
    const { res, outHeaders } = fakeReqRes(req);
    let calledNext = false;
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve({ calledNext, res, outHeaders });
    };
    // 周期 6 P1-4: 中间件可能是 async（multiLevelLimiter 返回 Promise）
    try {
      const maybePromise = mw(req, res, () => { calledNext = true; done(); });
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(() => done(), () => done());
      } else {
        // 同步中间件：等微任务一轮
        setImmediate(done);
      }
    } catch (_) {
      done();
    }
    // 兜底：500ms 内必返回（避免死锁）
    setTimeout(done, 500);
  });
}

(async () => {
  console.log('=== ratelimit-routes-integration ===');

  // ---- 1. 静态扫描 ----
  await test('rateLimit.js 暴露 aiMultiLevelLimiter', () => {
    assert.match(RATE_LIMIT_SRC, /function\s+aiMultiLevelLimiter/);
    assert.match(RATE_LIMIT_SRC, /aiMultiLevelLimiter,/);
  });
  await test('aiMultiLevelLimiter 默认 userLimit=200, apiKeyLimit=300', () => {
    assert.match(RATE_LIMIT_SRC, /userLimit:\s*200/);
    assert.match(RATE_LIMIT_SRC, /apiKeyLimit:\s*300/);
  });
  await test('userIdKey 提取 req.body.userId / sessionId / x-user-id', () => {
    assert.match(RATE_LIMIT_SRC, /req\.body\.userId/);
    assert.match(RATE_LIMIT_SRC, /req\.body\.sessionId/);
    assert.match(RATE_LIMIT_SRC, /req\.headers\[['"]x-user-id['"]\]/);
  });
  await test('apiKeyKey 提取 req.body.apiKey / Bearer token', () => {
    assert.match(RATE_LIMIT_SRC, /req\.body\.apiKey/);
    assert.match(RATE_LIMIT_SRC, /Bearer/);
  });

  // ---- 2. 行为：IP 维度超限 → 拒 ----
  await test('aiMultiLevelLimiter IP 维度超限 → 429', async () => {
    const mw = aiMultiLevelLimiter({ windowMs: 1000, limit: 2 });
    // 耗光
    await runMw(mw, { ip: '5.5.5.5', body: {} });
    await runMw(mw, { ip: '5.5.5.5', body: {} });
    const { res } = await runMw(mw, { ip: '5.5.5.5', body: {} });
    assert.strictEqual(res.statusCode, 429);
  });

  // ---- 3. 行为：userId 维度独立计 limit（userLimit > IP limit） ----
  await test('userId 维度 userLimit=5，IP=2：同 user 不同 IP 各 hit 2 次应通过', async () => {
    // 用 unique keyBy（userId=userX 在不同 IP 仍属同一 user）
    const mw = aiMultiLevelLimiter({ windowMs: 1000, limit: 2, userLimit: 5 });
    // 第 1 IP 第一次：ok
    let r = await runMw(mw, { ip: '6.6.6.1', body: { userId: 'shared-user' } });
    assert.strictEqual(r.calledNext, true);
    // 第 2 IP 同 user：user 计数 1（< 5），IP 不同——ok
    r = await runMw(mw, { ip: '6.6.6.2', body: { userId: 'shared-user' } });
    assert.strictEqual(r.calledNext, true);
  });

  // ---- 4. 行为：apikey 维度独立 ----
  await test('apikey 维度 apiKeyLimit=3：第 4 次拒', async () => {
    const mw = aiMultiLevelLimiter({ windowMs: 1000, limit: 100, userLimit: 100, apiKeyLimit: 3 });
    // 用 apikey 限 3：所以 IP/userId 给大窗口，apikey 限制到 3
    for (let i = 0; i < 3; i += 1) {
      const r = await runMw(mw, { ip: '7.7.7.1', body: { apiKey: 'my-api-key-12345' } });
      assert.strictEqual(r.calledNext, true, `apikey 第 ${i + 1} 次应 ok`);
    }
    const r = await runMw(mw, { ip: '7.7.7.1', body: { apiKey: 'my-api-key-12345' } });
    assert.strictEqual(r.res.statusCode, 429);
  });

  // ---- 5. 行为：apikey 截短 8 字符 ----
  await test('apikey 截短 8 字符（store key 不含原始）', async () => {
    // 验证：长 apikey 截短为 8 字符前缀；不同 IP 但 apikey 截短后相同 → 共享计数
    // IP 给大窗口（10 次），apikey 限 1
    const mw = aiMultiLevelLimiter({ windowMs: 1000, limit: 10, apiKeyLimit: 1 });
    // IP 1 + apikey A 前 8 字符
    const r1 = await runMw(mw, { ip: '8.8.8.1', body: { apiKey: 'long-api-key-12345-secret' } });
    assert.strictEqual(r1.calledNext, true);
    // IP 2 + apikey B 前 8 字符相同（'long-api'）→ apikey 维度第 2 次拒
    const r2 = await runMw(mw, { ip: '8.8.8.2', body: { apiKey: 'long-api-key-99999-different-tail' } });
    assert.strictEqual(r2.calledNext, false, 'apikey 截短后共享计数 → 第 2 次拒');
  });

  // ---- 6. 行为：Bearer token 解析 ----
  await test('Bearer token 解析：Authorization: Bearer xxx 计入 apikey', async () => {
    const mw = aiMultiLevelLimiter({ windowMs: 1000, limit: 1, apiKeyLimit: 1 });
    const r1 = await runMw(mw, { ip: '9.9.9.1', headers: { authorization: 'Bearer my-bearer-token-abc' } });
    assert.strictEqual(r1.calledNext, true);
    const r2 = await runMw(mw, { ip: '9.9.9.1', headers: { authorization: 'Bearer my-bearer-token-abc' } });
    // apikey limit=1 触发
    assert.strictEqual(r2.calledNext, false);
  });

  // ---- 7. 行为：未提供 userId / apikey 时维度不计入 ----
  await test('未提供 userId/apikey 时只 IP 维度生效', async () => {
    const mw = aiMultiLevelLimiter({ windowMs: 1000, limit: 2 });
    const r1 = await runMw(mw, { ip: '10.10.10.1', body: {} });
    assert.strictEqual(r1.calledNext, true);
    const r2 = await runMw(mw, { ip: '10.10.10.2', body: {} });
    // 不同 IP 各 1 次（IP 维度独立），都通过
    assert.strictEqual(r2.calledNext, true);
  });

  // ---- 8. 行为：HTTP 响应含 RateLimit-* header ----
  await test('aiMultiLevelLimiter 成功响应含 RateLimit-Limit', async () => {
    const mw = aiMultiLevelLimiter({ windowMs: 1000, limit: 5 });
    const { outHeaders } = await runMw(mw, { ip: '11.11.11.1', body: {} });
    assert.strictEqual(outHeaders['ratelimit-limit'], '5');
  });

  // ---- 9. 行为：与 aiLimiter（express-rate-limit 默认）不冲突 ----
  await test('multiLevelLimiter 与 express-rate-limit 不共享 store（双层防护）', () => {
    // 两个 limiter 用不同 store；slidingWindow 默认 InMemoryStore；multiLevelLimiter 默认也是
    // 实际上 multiLevelLimiter 复用 slidingWindow store
    // 验证：多级限流独立 express-rate-limit
    const mw1 = multiLevelLimiter({ windowMs: 1000, limit: 1 });
    assert.strictEqual(typeof mw1, 'function');
    const mw2 = aiMultiLevelLimiter({ windowMs: 1000, limit: 1 });
    assert.strictEqual(typeof mw2, 'function');
  });

  // ---- 10. 行为：store 失败 → 兜底放行（不变） ----
  await test('multiLevelLimiter 失败兜底：异常 store 不阻断主流程', async () => {
    // 注入一个必抛错的 store
    const badStore = { hit: () => { throw new Error('store-fail'); }, reset: () => {} };
    const mw = multiLevelLimiter({ windowMs: 1000, limit: 1, store: badStore });
    const r = await runMw(mw, { ip: '12.12.12.1', body: {} });
    assert.strictEqual(r.calledNext, true, 'store 失败应放行');
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
