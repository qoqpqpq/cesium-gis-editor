// tests/specs/redis-ratelimit-store.cjs
// 周期 4 P0-2: Redis 分布式限流（手写 RESP 协议 + ZADD Sliding Window）
//
// 验收：
//   - 静态扫描：源文件使用 ZADD/ZREMRANGEBYSCORE/ZCARD/EXPIRE（无 ioredis 依赖）
//   - 单元：encodeCommand 编码正确（RESP 格式 *3\r\n$3\r\nSET\r\n...）
//   - 单元：parseReply 解码 5 种 RESP 类型
//   - 行为：RedisStore 失败兜底（Redis 不可达 → degraded:true + 放行）
//   - 行为：InMemoryStore 与 RedisStore stub 行为一致（向后兼容）
//   - 行为：RedisStore 真实实现：若本地有 Redis（127.0.0.1:6379）则走真实 ZADD
//     缺则跳过（connect 抛错 → degraded）

'use strict';

const assert = require('node:assert');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const {
  InMemoryStore, RedisStore, RedisStubStore, createStore,
} = require('../../server/middleware/rateLimitStore');
const {
  RedisClient, encodeCommand, parseReply,
} = require('../../server/middleware/redisClient');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

(async () => {
  console.log('=== redis-ratelimit-store ===');

  // ---- 1. 静态扫描：源文件无 ioredis 依赖 ----
  const rateLimitStoreSrc = fs.readFileSync(
    path.resolve(__dirname, '../../server/middleware/rateLimitStore.js'),
    'utf8',
  );
  const redisClientSrc = fs.readFileSync(
    path.resolve(__dirname, '../../server/middleware/redisClient.js'),
    'utf8',
  );
  await test('rateLimitStore.js 不 require ioredis', () => {
    assert.ok(!/require\(['"]ioredis['"]\)/.test(rateLimitStoreSrc));
  });
  await test('rateLimitStore.js 不 require redis', () => {
    assert.ok(!/require\(['"]redis['"]\)/.test(rateLimitStoreSrc));
  });
  await test('redisClient.js 不 require ioredis', () => {
    assert.ok(!/require\(['"]ioredis['"]\)/.test(redisClientSrc));
  });
  await test('rateLimitStore.js 使用 ZADD/ZREMRANGEBYSCORE', () => {
    assert.match(rateLimitStoreSrc, /zadd/);
    assert.match(rateLimitStoreSrc, /zremrangebyscore/);
    assert.match(rateLimitStoreSrc, /zcard/);
  });

  // ---- 2. encodeCommand RESP 编码 ----
  await test('encodeCommand("PING") → *1\r\n$4\r\nPING\r\n', () => {
    const buf = encodeCommand(['PING']);
    assert.strictEqual(buf.toString('ascii'), '*1\r\n$4\r\nPING\r\n');
  });
  await test('encodeCommand("SET k v") → 3 部分', () => {
    const buf = encodeCommand(['SET', 'key', 'val']);
    assert.strictEqual(buf.toString('ascii'), '*3\r\n$3\r\nSET\r\n$3\r\nkey\r\n$3\r\nval\r\n');
  });
  await test('encodeCommand 含空字符串', () => {
    const buf = encodeCommand(['SET', 'k', '']);
    assert.strictEqual(buf.toString('ascii'), '*3\r\n$3\r\nSET\r\n$1\r\nk\r\n$0\r\n\r\n');
  });
  await test('encodeCommand 含中文', () => {
    const buf = encodeCommand(['SET', '中文', 'value']);
    assert.match(buf.toString('utf8'), /中文/);
  });
  await test('encodeCommand 数字 → 字符串', () => {
    const buf = encodeCommand(['ZADD', 'k', '123', 'm']);
    assert.match(buf.toString('ascii'), /123/);
  });

  // ---- 3. parseReply 5 种 RESP 类型 ----
  await test('parseReply("+OK\\r\\n") → "OK"', () => {
    const { value, consumed } = parseReply(Buffer.from('+OK\r\n', 'ascii'));
    assert.strictEqual(value, 'OK');
    assert.strictEqual(consumed, 5);
  });
  await test('parseReply(":42\\r\\n") → 42', () => {
    const { value, consumed } = parseReply(Buffer.from(':42\r\n', 'ascii'));
    assert.strictEqual(value, 42);
    assert.strictEqual(consumed, 5);
  });
  await test('parseReply("$6\\r\\nfoobar\\r\\n") → "foobar"', () => {
    const { value, consumed } = parseReply(Buffer.from('$6\r\nfoobar\r\n', 'ascii'));
    assert.strictEqual(value, 'foobar');
    assert.strictEqual(consumed, 12);
  });
  await test('parseReply("$-1\\r\\n") → null', () => {
    const { value, consumed } = parseReply(Buffer.from('$-1\r\n', 'ascii'));
    assert.strictEqual(value, null);
    assert.strictEqual(consumed, 5);
  });
  await test('parseReply("*2\\r\\n$3\\r\\nfoo\\r\\n$3\\r\\nbar\\r\\n") → ["foo","bar"]', () => {
    const { value } = parseReply(Buffer.from('*2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n', 'ascii'));
    assert.deepStrictEqual(value, ['foo', 'bar']);
  });
  await test('parseReply("-ERR msg\\r\\n") → throw', () => {
    assert.throws(() => parseReply(Buffer.from('-ERR msg\r\n', 'ascii')));
  });
  await test('parseReply 数据不足 → NeedMoreDataError', () => {
    assert.throws(() => parseReply(Buffer.from('$100', 'ascii')), /need more data/);
  });

  // ---- 4. 行为：RedisStore 失败兜底（不可达 Redis） ----
  await test('RedisStore 不可达 → degraded:true + allowed:true', async () => {
    const store = new RedisStore({
      host: '127.0.0.1',
      port: 1, // 一定不可达
      keyPrefix: 'test:',
      storeName: 'down',
    });
    const r = await store.hit('k1', 1000, 3);
    assert.strictEqual(r.allowed, true, '失败兜底应放行');
    assert.strictEqual(r.degraded, true);
  });

  // ---- 5. 行为：InMemoryStore 与 RedisStubStore 一致 ----
  await test('InMemoryStore 第 4 次拒', async () => {
    const store = new InMemoryStore();
    await store.hit('a', 1000, 3);
    await store.hit('a', 1000, 3);
    await store.hit('a', 1000, 3);
    const r = await store.hit('a', 1000, 3);
    assert.strictEqual(r.allowed, false);
  });
  await test('RedisStubStore 永远 allowed（向后兼容）', async () => {
    const store = new RedisStubStore();
    for (let i = 0; i < 100; i++) {
      const r = await store.hit('a', 1000, 3);
      assert.strictEqual(r.allowed, true);
    }
  });

  // ---- 6. 行为：createStore 工厂 ----
  await test('createStore() 缺省 InMemory', () => {
    assert.ok(createStore() instanceof InMemoryStore);
  });
  await test('createStore({store:"redis-stub"}) RedisStub', () => {
    assert.ok(createStore({ store: 'redis-stub' }) instanceof RedisStubStore);
  });
  await test('createStore({store:"redis"}) RedisStore', () => {
    assert.ok(createStore({ store: 'redis' }) instanceof RedisStore);
  });

  // ---- 7. 真实 Redis（如果本地有） ----
  // 检查 127.0.0.1:6379 是否可达
  const redisReachable = await new Promise((resolve) => {
    const s = net.createConnection({ host: '127.0.0.1', port: 6379 });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    setTimeout(() => { s.destroy(); resolve(false); }, 200);
  });
  if (redisReachable) {
    console.log('  [INFO] 本地 Redis 可达，测真实 ZADD...');
    const client = new RedisClient();
    await test('RedisClient.ping() → "PONG"', async () => {
      const r = await client.ping();
      assert.strictEqual(r, 'PONG');
    });
    const store = new RedisStore({ client, keyPrefix: 'cycle4-spec:', storeName: 'redis-test' });
    // 先清理
    await client.del('cycle4-spec:redis-test:k1');
    await test('RedisStore.hit 真实 ZADD + ZCARD', async () => {
      const r = await store.hit('k1', 5000, 3);
      assert.strictEqual(r.allowed, true);
      assert.strictEqual(r.count, 1);
    });
    await test('RedisStore 真实超限拒', async () => {
      await store.hit('k1', 5000, 3);
      await store.hit('k1', 5000, 3);
      const r = await store.hit('k1', 5000, 3);
      // 第 3 次还在 limit 内
      assert.strictEqual(r.allowed, true);
      assert.strictEqual(r.count, 3);
      // 第 4 次超限
      const r2 = await store.hit('k1', 5000, 3);
      assert.strictEqual(r2.allowed, false);
    });
    await test('RedisStore.reset 清空', async () => {
      await store.reset('k1');
      const r = await store.hit('k1', 5000, 3);
      assert.strictEqual(r.allowed, true);
      assert.strictEqual(r.count, 1);
    });
    await client.close();
  } else {
    console.log('  [SKIP] 本地 Redis 不可达，跳过真实 ZADD 测试（127.0.0.1:6379）');
    await test('SKIP: 本地无 Redis', () => {
      assert.ok(true, 'skip placeholder');
    });
  }

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
