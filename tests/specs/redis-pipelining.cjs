// tests/specs/redis-pipelining.cjs
// 周期 5 P0-2: Redis EVAL atomic + Lua 脚本
//
// 验收：
//   - RedisClient.eval() 接受 script + numkeys + args
//   - 单元：encodeCommand('EVAL', 'return 1', '0') → RESP 格式正确
//   - 真实 Redis：EVAL 简单脚本 → 返回正确
//   - 真实 Redis：RedisStore.LUA_SLIDING_WINDOW 一次 EVAL → 完整 ZADD+ZREM+ZCARD+EXPIRE
//   - 真实 Redis：Lua 脚本的 race-free（并发 100 次只 1 个超限）
//   - 真实 Redis：degraded 兜底（不可达 Redis）
//   - 多级限流 multiLevelLimiter：IP / user / apikey 三维度独立计数

'use strict';

const assert = require('node:assert');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { RedisClient, encodeCommand } = require('../../server/middleware/redisClient');
const { RedisStore, InMemoryStore } = require('../../server/middleware/rateLimitStore');
const { slidingWindow, multiLevelLimiter } = require('../../server/middleware/rateLimit');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

(async () => {
  console.log('=== redis-pipelining ===');

  // ---- 1. 编码 EVAL RESP ----
  await test('encodeCommand("EVAL", "return 1", "0") 编码正确', () => {
    const buf = encodeCommand(['EVAL', 'return 1', '0']);
    // "return 1" 是 8 字节
    assert.strictEqual(buf.toString('ascii'), '*3\r\n$4\r\nEVAL\r\n$8\r\nreturn 1\r\n$1\r\n0\r\n');
  });
  await test('encodeCommand("EVALSHA", sha1, "1", key) 编码正确', () => {
    const sha = 'a'.repeat(40);
    const buf = encodeCommand(['EVALSHA', sha, '1', 'mykey']);
    assert.match(buf.toString('ascii'), /EVALSHA/);
    assert.match(buf.toString('ascii'), /a{40}/);
  });

  // ---- 2. 静态扫描：RedisStore.LUA_SLIDING_WINDOW 存在 ----
  const rateLimitStoreSrc = fs.readFileSync(
    path.resolve(__dirname, '../../server/middleware/rateLimitStore.js'),
    'utf8',
  );
  await test('RedisStore.LUA_SLIDING_WINDOW 含 ZREMRANGEBYSCORE', () => {
    assert.match(rateLimitStoreSrc, /ZREMRANGEBYSCORE/);
  });
  await test('RedisStore.LUA_SLIDING_WINDOW 含 ZADD + ZCARD + EXPIRE', () => {
    assert.match(rateLimitStoreSrc, /redis\.call\('ZADD'/);
    assert.match(rateLimitStoreSrc, /redis\.call\('ZCARD'/);
    assert.match(rateLimitStoreSrc, /redis\.call\('EXPIRE'/);
  });
  await test('RedisStore.hit() 调 client.eval', () => {
    assert.match(rateLimitStoreSrc, /client\.eval\(/);
  });

  // ---- 3. 真实 Redis 集成测试 ----
  const redisReachable = await new Promise((resolve) => {
    const s = net.createConnection({ host: '127.0.0.1', port: 6379 });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    setTimeout(() => { s.destroy(); resolve(false); }, 200);
  });
  if (redisReachable) {
    console.log('  [INFO] 本地 Redis 可达，测 EVAL 集成...');
    const client = new RedisClient();
    await test('RedisClient.ping() → "PONG"', async () => {
      const r = await client.ping();
      assert.strictEqual(r, 'PONG');
    });
    await test('RedisClient.eval("return 1") → 1', async () => {
      const r = await client.eval('return 1', 0);
      assert.strictEqual(r, 1);
    });
    await test('RedisClient.eval("return {1, 2, 3}") → [1, 2, 3]', async () => {
      const r = await client.eval('return {1, 2, 3}', 0);
      assert.deepStrictEqual(r, [1, 2, 3]);
    });
    await test('RedisClient.eval("return tonumber(ARGV[1])", 0, "42") → 42', async () => {
      const r = await client.eval('return tonumber(ARGV[1])', 0, '42');
      assert.strictEqual(r, 42);
    });
    await test('RedisClient.eval("redis.call(\'PING\')") → "PONG"', async () => {
      const r = await client.eval("return redis.call('PING')", 0);
      assert.strictEqual(r, 'PONG');
    });
    await test('RedisClient.scriptLoad + evalsha', async () => {
      const sha = await client.scriptLoad('return 1 + 1');
      assert.match(sha, /^[0-9a-f]{40}$/);
      const r = await client.evalsha(sha, 0);
      assert.strictEqual(r, 2);
    });

    // ---- 4. RedisStore + LUA_SLIDING_WINDOW 真实 ----
    const store = new RedisStore({ client, keyPrefix: 'cycle5-spec:', storeName: 'lua-test' });
    // 清理
    await client.del('cycle5-spec:lua-test:key1');
    await test('RedisStore.hit 一次 → count=1, allowed=true', async () => {
      const r = await store.hit('key1', 5000, 3);
      assert.strictEqual(r.allowed, true);
      assert.strictEqual(r.count, 1);
    });
    await test('RedisStore.hit 第 3 次仍 allowed', async () => {
      await store.hit('key1', 5000, 3);
      const r = await store.hit('key1', 5000, 3);
      assert.strictEqual(r.allowed, true);
      assert.strictEqual(r.count, 3);
    });
    await test('RedisStore.hit 第 4 次拒', async () => {
      const r = await store.hit('key1', 5000, 3);
      assert.strictEqual(r.allowed, false);
      assert.strictEqual(r.count, 4);
    });
    await test('RedisStore.hit race-free：并发 100 次只 1 个超限', async () => {
      await client.del('cycle5-spec:lua-test:key2');
      const s = new RedisStore({ client, keyPrefix: 'cycle5-spec:', storeName: 'lua-test' });
      const results = await Promise.all(
        Array.from({ length: 100 }, () => s.hit('key2', 5000, 5))
      );
      const allowedCount = results.filter((r) => r.allowed).length;
      const deniedCount = results.filter((r) => !r.allowed).length;
      // Lua atomic：恰好 5 个 allowed，95 个 denied
      assert.strictEqual(allowedCount, 5, `应恰好 5 个 allowed: ${allowedCount}`);
      assert.strictEqual(deniedCount, 95, `应恰好 95 个 denied: ${deniedCount}`);
    });
    await client.close();
  } else {
    console.log('  [SKIP] 本地 Redis 不可达，跳过 EVAL 集成测试（127.0.0.1:6379）');
    await test('SKIP: 本地无 Redis', () => assert.ok(true));
  }

  // ---- 5. 不可达 Redis：degraded 兜底 ----
  await test('RedisStore 不可达 → degraded:true + allowed:true', async () => {
    const store = new RedisStore({ host: '127.0.0.1', port: 1, keyPrefix: 'cycle5-spec:', storeName: 'down' });
    const r = await store.hit('k', 1000, 3);
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.degraded, true);
  });

  // ---- 6. multiLevelLimiter 三级独立计数（用 InMemory store）----
  function callMw(mw, req) {
    return new Promise((resolve) => {
      const res = {
        statusCode: 200,
        setHeader: () => {},
        status: function (c) { this.statusCode = c; return this; },
        json: function (b) { this.body = b; return this; },
      };
      let nextCalled = false;
      mw(req, res, () => { nextCalled = true; resolve({ nextCalled, status: res.statusCode, body: res.body }); });
      // 异步 middleware 不会立即调 next
      setImmediate(() => {
        if (!nextCalled) resolve({ nextCalled, status: res.statusCode, body: res.body });
      });
    });
  }

  await test('multiLevelLimiter IP 维度 limit=2 → 第 3 次拒', async () => {
    const store = new InMemoryStore();
    const mw = multiLevelLimiter({
      windowMs: 1000, limit: 2,
      userIdKey: (req) => req.userId, userLimit: 100,
      apiKeyKey: (req) => req.apiKey, apiKeyLimit: 100,
      store,
    });
    // 第 1-2 次 IP 维度 allowed
    for (let i = 0; i < 2; i++) {
      const r = await callMw(mw, { ip: '5.5.5.5', userId: 'u1', apiKey: 'ak1', socket: {} });
      assert.strictEqual(r.nextCalled, true, `第 ${i + 1} 次应放行`);
    }
    // 第 3 次 IP 超限
    const r = await callMw(mw, { ip: '5.5.5.5', userId: 'u1', apiKey: 'ak1', socket: {} });
    assert.strictEqual(r.nextCalled, false, '第 3 次 IP 应拒');
    assert.strictEqual(r.status, 429);
  });

  await test('multiLevelLimiter 不同 IP 独立计数', async () => {
    const store = new InMemoryStore();
    const mw = multiLevelLimiter({
      windowMs: 1000, limit: 2,
      userIdKey: (req) => req.userId, userLimit: 100,
      store,
    });
    // IP 1 第 1-2 次
    for (let i = 0; i < 2; i++) {
      const r = await callMw(mw, { ip: '7.7.7.1', userId: 'u9', socket: {} });
      assert.strictEqual(r.nextCalled, true);
    }
    // IP 2 第 1-2 次（userId 相同 → 累计 4 次，但 userLimit=100 未超）
    for (let i = 0; i < 2; i++) {
      const r = await callMw(mw, { ip: '7.7.7.2', userId: 'u9', socket: {} });
      assert.strictEqual(r.nextCalled, true);
    }
    // IP 2 第 3 次 → IP 维度超限
    const r = await callMw(mw, { ip: '7.7.7.2', userId: 'u9', socket: {} });
    assert.strictEqual(r.nextCalled, false, 'IP 2 第 3 次 IP 维度超限');
    assert.strictEqual(r.status, 429);
  });

  await test('multiLevelLimiter 无 userId / apiKey 仍工作', async () => {
    const store = new InMemoryStore();
    const mw = multiLevelLimiter({ windowMs: 1000, limit: 2, store });
    // 不传 userIdKey / apiKeyKey → 仅 IP 维度
    for (let i = 0; i < 2; i++) {
      const r = await callMw(mw, { ip: '8.8.8.1', socket: {} });
      assert.strictEqual(r.nextCalled, true);
    }
    const r = await callMw(mw, { ip: '8.8.8.1', socket: {} });
    assert.strictEqual(r.nextCalled, false);
  });

  await test('multiLevelLimiter apikey 截短（不存原始 key）', () => {
    // 静态检查：源码用 ak.slice(0, 8) 截短
    const rateLimitSrc = fs.readFileSync(
      path.resolve(__dirname, '../../server/middleware/rateLimit.js'),
      'utf8',
    );
    assert.match(rateLimitSrc, /ak\.slice\(0,\s*8\)/);
    assert.match(rateLimitSrc, /ak\.slice\(0,\s*8\)|apiKey\.slice\(0,\s*8\)/);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
