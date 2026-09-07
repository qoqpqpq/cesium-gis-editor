// tests/specs/ratelimit-store-interface.cjs
// 周期 3 P2-2: RateLimiterStore 接口（InMemory + Redis stub）+ slidingWindow 接受 store
//
// 验收：
//   - InMemoryStore.hit() 行为正确：超限返回 allowed=false
//   - RedisStore.hit() stub：当前不限制（永远 allowed=true，TODO 周期 4）
//   - slidingWindow({store: new InMemoryStore()}) 与原周期 2 行为一致
//   - slidingWindow({store: new RedisStore()}) 不限制请求（stub 阶段预期）
//   - createStore() 工厂从 env 选 store

'use strict';

const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { slidingWindow, InMemoryStore, RedisStore, createStore } = require('../../server/middleware/rateLimit');
const {
  InMemoryStore: InMemoryStoreDirect,
  RedisStore: RedisStoreDirect,
  createStore: createStoreDirect,
} = require('../../server/middleware/rateLimitStore');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

function makeReqRes(ip = '1.2.3.4') {
  const headers = {};
  const req = { ip, socket: { remoteAddress: ip } };
  const res = new EventEmitter();
  res.statusCode = 200;
  res.setHeader = (k, v) => { headers[k.toLowerCase()] = v; };
  res.getHeader = (k) => headers[k.toLowerCase()];
  res.status = function (c) { this.statusCode = c; return this; };
  res.json = function (b) { this.body = b; return this; };
  return { req, res, headers };
}

function call(mw, ip) {
  const ctx = makeReqRes(ip);
  return new Promise((resolve) => {
    const { req, res, headers } = ctx;
    let nextCalled = false;
    const next = () => { nextCalled = true; resolve({ nextCalled, status: res.statusCode, body: res.body, headers }); };
    try {
      const r = mw(req, res, next);
      if (r && typeof r.then === 'function') {
        r.then(() => { if (!nextCalled) resolve({ nextCalled, status: res.statusCode, body: res.body, headers }); });
      } else {
        setImmediate(() => { if (!nextCalled) resolve({ nextCalled, status: res.statusCode, body: res.body, headers }); });
      }
    } catch (e) {
      resolve({ nextCalled, status: res.statusCode, body: res.body, headers, error: e });
    }
  });
}

(async () => {
  console.log('=== ratelimit-store-interface ===');

  // ---- 1. InMemoryStore 直接行为 ----
  await test('InMemoryStore.hit 第 1 次 allowed', async () => {
    const store = new InMemoryStoreDirect();
    const r = await store.hit('1.1.1.1', 1000, 3);
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.count, 1);
  });

  await test('InMemoryStore.hit 第 3 次仍 allowed', async () => {
    const store = new InMemoryStoreDirect();
    await store.hit('2.1.1.1', 1000, 3);
    await store.hit('2.1.1.1', 1000, 3);
    const r = await store.hit('2.1.1.1', 1000, 3);
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.count, 3);
  });

  await test('InMemoryStore.hit 第 4 次拒', async () => {
    const store = new InMemoryStoreDirect();
    for (let i = 0; i < 3; i++) await store.hit('3.1.1.1', 1000, 3);
    const r = await store.hit('3.1.1.1', 1000, 3);
    assert.strictEqual(r.allowed, false);
    assert.ok(r.retryAfterMs > 0);
  });

  await test('InMemoryStore.reset 清空', async () => {
    const store = new InMemoryStoreDirect();
    for (let i = 0; i < 5; i++) await store.hit('4.1.1.1', 1000, 3);
    await store.reset('4.1.1.1');
    const r = await store.hit('4.1.1.1', 1000, 3);
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.count, 1);
  });

  await test('InMemoryStore.shutdown', async () => {
    const store = new InMemoryStoreDirect();
    await store.hit('5.1.1.1', 1000, 3);
    await store.shutdown();
    const r = await store.hit('5.1.1.1', 1000, 3);
    assert.strictEqual(r.count, 1);
  });

  await test('InMemoryStore 不同 key 独立', async () => {
    const store = new InMemoryStoreDirect();
    for (let i = 0; i < 3; i++) await store.hit('6.1.1.1', 1000, 3);
    const r = await store.hit('6.1.1.2', 1000, 3);
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.count, 1);
  });

  // ---- 2. RedisStore 真实实现行为（不可达 → degraded） ----
  await test('RedisStore 不可达 → degraded allowed', async () => {
    const store = new RedisStoreDirect({ host: '127.0.0.1', port: 1 });
    const r = await store.hit('7.1.1.1', 1000, 3);
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.degraded, true);
  });

  // ---- 3. createStore 工厂 ----
  await test('createStore() 缺省返回 InMemoryStore', () => {
    const s = createStoreDirect();
    assert.ok(s instanceof InMemoryStoreDirect);
  });

  await test('createStore({store:"redis"}) 返回 RedisStore', () => {
    const s = createStoreDirect({ store: 'redis' });
    assert.ok(s instanceof RedisStoreDirect);
  });

  // ---- 4. slidingWindow 接受 store ----
  await test('slidingWindow + InMemoryStore：超限 429', async () => {
    const store = new InMemoryStoreDirect();
    const mw = slidingWindow({ windowMs: 1000, limit: 3, store });
    for (let i = 0; i < 3; i++) {
      const r = await call(mw, '10.0.0.1');
      assert.strictEqual(r.nextCalled, true);
    }
    const r = await call(mw, '10.0.0.1');
    assert.strictEqual(r.nextCalled, false);
    assert.strictEqual(r.status, 429);
  });

  await test('slidingWindow + 不可达 Redis：100 次都放行（degraded 兜底）', async () => {
    const store = new RedisStoreDirect({ host: '127.0.0.1', port: 1 });
    const mw = slidingWindow({ windowMs: 1000, limit: 3, store });
    for (let i = 0; i < 10; i++) {
      const r = await call(mw, '11.0.0.1');
      assert.strictEqual(r.nextCalled, true, `第 ${i + 1} 次应放行（degraded 兜底）`);
    }
  });

  await test('slidingWindow 缺省 store：行为与原版一致（向后兼容）', async () => {
    const mw = slidingWindow({ windowMs: 1000, limit: 2 });
    const a1 = await call(mw, '12.0.0.1');
    const a2 = await call(mw, '12.0.0.1');
    const a3 = await call(mw, '12.0.0.1');
    assert.strictEqual(a1.nextCalled, true);
    assert.strictEqual(a2.nextCalled, true);
    assert.strictEqual(a3.nextCalled, false);
    assert.strictEqual(a3.status, 429);
  });

  // ---- 5. 暴露给外层（rateLimit.js 重导出） ----
  await test('rateLimit.js 重导出 InMemoryStore', () => {
    assert.strictEqual(InMemoryStore, InMemoryStoreDirect);
  });
  await test('rateLimit.js 重导出 RedisStore', () => {
    assert.strictEqual(RedisStore, RedisStoreDirect);
  });
  await test('rateLimit.js 重导出 createStore', () => {
    assert.strictEqual(createStore, createStoreDirect);
  });

  // ---- 6. slidingWindow + 共享 store：跨中间件计数 ----
  await test('两个 slidingWindow 共享同一 store → 计数共享', async () => {
    const store = new InMemoryStoreDirect();
    const mw1 = slidingWindow({ windowMs: 1000, limit: 3, store });
    const mw2 = slidingWindow({ windowMs: 1000, limit: 3, store });
    // mw1 用 2 次
    await call(mw1, '13.0.0.1');
    await call(mw1, '13.0.0.1');
    // mw2 用 1 次 → 已达 3
    const r = await call(mw2, '13.0.0.1');
    assert.strictEqual(r.nextCalled, true); // 第 3 次仍放行
    // mw1 第 3 次 → 拒
    const r2 = await call(mw1, '13.0.0.1');
    assert.strictEqual(r2.nextCalled, false);
    assert.strictEqual(r2.status, 429);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
