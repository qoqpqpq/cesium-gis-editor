// tests/specs/ratelimit-token-bucket.cjs
// 周期 6 P0-2 续: Token Bucket 限流（AI 端点）
//
// 背景：周期 2 P1-9 slidingWindow 是"严格"限流（任意 60s 内 60 次就拒）。
//   AI 端点对"用户快速连发"友好：允许瞬时 burst。
//   周期 6 P0-2 续引入 Token Bucket：capacity 桶 + 持续 refill。
//
// 验收：
//   1. 静态扫描：rateLimit.js 暴露 tokenBucket + InMemoryTokenBucketStore
//   2. 行为：capacity=5 → 前 5 次 allowed；第 6 次 allowed:false
//   3. 行为：等待 refillPerSec 时间后又能放行
//   4. 行为：桶满（elapsed 长）→ tokens 不会超过 capacity
//   5. 行为：多 key 独立（key1 用完不影响 key2）
//   6. 行为：HTTP middleware 写 RateLimit-* / X-RateLimit-* 标准 header
//   7. 行为：超限返回 429 + Retry-After
//   8. 与 slidingWindow 差异：burst 场景下 Token Bucket 友好
//
// 运行：node tests/specs/ratelimit-token-bucket.cjs

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const {
  tokenBucket, InMemoryTokenBucketStore,
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

function fakeReqRes(ip = '1.2.3.4') {
  const req = { ip, socket: { remoteAddress: ip } };
  const headers = {};
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = headers;
  res.setHeader = (k, v) => { headers[k.toLowerCase()] = v; };
  res.set = res.setHeader;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return { req, res, headers };
}

async function runMiddleware(mw, req) {
  return new Promise((resolve) => {
    const { res, headers } = fakeReqRes(req.ip || '1.2.3.4');
    let calledNext = false;
    mw(req, res, () => { calledNext = true; resolve({ calledNext, headers, res }); });
    // 给个微小延迟让 async 完成
    setImmediate(() => resolve({ calledNext, headers, res }));
  });
}

(async () => {
  console.log('=== ratelimit-token-bucket ===');

  // ---- 1. 静态扫描 ----
  await test('rateLimit.js 含 tokenBucket 函数', () => {
    assert.match(RATE_LIMIT_SRC, /function\s+tokenBucket/);
  });
  await test('rateLimit.js 含 InMemoryTokenBucketStore 类', () => {
    assert.match(RATE_LIMIT_SRC, /class\s+InMemoryTokenBucketStore/);
  });
  await test('tokenBucket 暴露在 module.exports', () => {
    assert.match(RATE_LIMIT_SRC, /tokenBucket,\s*InMemoryTokenBucketStore/);
  });

  // ---- 2. 行为：capacity=5 → 前 5 次 allowed ----
  const store = new InMemoryTokenBucketStore();
  await test('capacity=5, 前 5 次 hit 全部 allowed', async () => {
    for (let i = 0; i < 5; i += 1) {
      const r = await store.hit('user1', { capacity: 5, refillPerSec: 1 }); // 5/s refill
      assert.strictEqual(r.allowed, true, `第 ${i + 1} 次应 allowed`);
    }
  });

  // ---- 3. 行为：capacity=5, refill 慢 → 第 6 次拒 ----
  await test('capacity=5, refillPerSec=0.1 → 第 6 次拒', async () => {
    // 用不同的 key 避免被前一个测试污染
    for (let i = 0; i < 5; i += 1) {
      await store.hit('user2', { capacity: 5, refillPerSec: 0.1 });
    }
    const r = await store.hit('user2', { capacity: 5, refillPerSec: 0.1 });
    assert.strictEqual(r.allowed, false);
    assert.ok(r.retryAfterMs > 0);
    // refillPerSec=0.1 → 1 token / 10s → retry ≈ 10s
    assert.ok(r.retryAfterMs >= 5000, `retryAfterMs 应 >= 5000ms（1 token 需 10s），实际 ${r.retryAfterMs}`);
  });

  // ---- 4. 行为：等待 refill → 又能放行 ----
  await test('等待 1100ms 后 retryAfterMs 缩短（refill 推进）', async () => {
    // 测 refill 推进
    const r1 = await store.hit('user3', { capacity: 5, refillPerSec: 1 });
    assert.strictEqual(r1.allowed, true);
    // 耗光
    for (let i = 0; i < 4; i += 1) {
      await store.hit('user3', { capacity: 5, refillPerSec: 1 });
    }
    const r2 = await store.hit('user3', { capacity: 5, refillPerSec: 1 });
    assert.strictEqual(r2.allowed, false);
    const r3 = await store.hit('user3', { capacity: 5, refillPerSec: 1 });
    assert.strictEqual(r3.allowed, false);
    // wait 1100ms → 1 token
    await new Promise((r) => setTimeout(r, 1100));
    const r4 = await store.hit('user3', { capacity: 5, refillPerSec: 1 });
    assert.strictEqual(r4.allowed, true, '1.1s 后应能放行（refill 1 token）');
  });

  // ---- 5. 行为：桶满（elapsed 长）→ tokens 不超过 capacity ----
  await test('桶满：长 elapsed 不会超过 capacity', async () => {
    const s2 = new InMemoryTokenBucketStore();
    await s2.hit('k', { capacity: 5, refillPerSec: 100 });
    // 等 5s → 应补充 500 tokens 但 cap = 5
    await new Promise((r) => setTimeout(r, 5000));
    let count = 0;
    // 连续 hit 5 次都应 allowed
    for (let i = 0; i < 5; i += 1) {
      const r = await s2.hit('k', { capacity: 5, refillPerSec: 100 });
      if (r.allowed) count += 1;
    }
    // 第 6 次应拒（桶被耗光）
    const r6 = await s2.hit('k', { capacity: 5, refillPerSec: 100 });
    assert.ok(count === 5, `应允许 5 次，实际 ${count}`);
    assert.strictEqual(r6.allowed, false, '第 6 次应拒（tokens 不会超过 capacity）');
  });

  // ---- 6. 行为：多 key 独立 ----
  await test('多 key 独立：userA 用完不影响 userB', async () => {
    for (let i = 0; i < 5; i += 1) {
      await store.hit('userA', { capacity: 5, refillPerSec: 0.1 });
    }
    const a = await store.hit('userA', { capacity: 5, refillPerSec: 0.1 });
    assert.strictEqual(a.allowed, false);
    const b = await store.hit('userB', { capacity: 5, refillPerSec: 0.1 });
    assert.strictEqual(b.allowed, true, 'userB 独立计数仍能放行');
  });

  // ---- 7. 行为：HTTP middleware 写 RateLimit-* 标准 header ----
  await test('HTTP middleware 写 RateLimit-Limit (IETF draft)', async () => {
    const mw = tokenBucket({ windowMs: 1000, limit: 3, keyBy: () => 'fixed-key' });
    const { headers, calledNext } = await runMiddleware(mw, { ip: '9.9.9.9' });
    assert.strictEqual(headers['ratelimit-limit'], '3');
    assert.ok(headers['ratelimit-remaining'] !== undefined);
    assert.strictEqual(calledNext, true);
  });

  // ---- 8. 行为：HTTP middleware 兼容写 X-RateLimit-* ----
  await test('HTTP middleware 兼容写 X-RateLimit-Limit', async () => {
    const mw = tokenBucket({ windowMs: 1000, limit: 3, keyBy: () => 'fixed-key2' });
    const { headers } = await runMiddleware(mw, { ip: '9.9.9.9' });
    assert.strictEqual(headers['x-ratelimit-limit'], '3');
  });

  // ---- 9. 行为：超限 → 429 + Retry-After ----
  await test('超限 → 429 + Retry-After header', async () => {
    const mw = tokenBucket({
      windowMs: 10000, // 10s refill 3 tokens → 慢
      limit: 3,
      keyBy: () => 'fixed-key3',
    });
    // 耗光
    for (let i = 0; i < 3; i += 1) {
      await runMiddleware(mw, { ip: '9.9.9.9' });
    }
    // 第 4 次应 429
    const { headers, res } = await runMiddleware(mw, { ip: '9.9.9.9' });
    assert.strictEqual(res.statusCode, 429);
    assert.ok(headers['retry-after'] !== undefined);
    assert.ok(parseInt(headers['retry-after'], 10) >= 1);
  });

  // ---- 10. 行为：rateLimit 错误参数抛错 ----
  await test('tokenBucket({windowMs: 0}) 抛错', () => {
    assert.throws(() => tokenBucket({ windowMs: 0, limit: 3 }));
  });
  await test('tokenBucket({limit: 0}) 抛错', () => {
    assert.throws(() => tokenBucket({ windowMs: 1000, limit: 0 }));
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
