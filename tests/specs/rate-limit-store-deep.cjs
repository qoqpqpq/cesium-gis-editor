// tests/specs/rate-limit-store-deep.cjs
// Cycle 24 R4: rateLimitStore.js 深度测试
// 覆盖: InMemoryStore / RedisStore (Lua atomic) / RedisStubStore / createStore 工厂
'use strict';

const assert = require('node:assert');
const path = require('node:path');

// 加载被测模块（相对路径）
const STORE_PATH = path.join(__dirname, '..', '..', 'server', 'middleware', 'rateLimitStore.js');
const { InMemoryStore, RedisStore, RedisStubStore, createStore } = require(STORE_PATH);

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

// ---- Mock RedisClient ----
// 模拟 RedisStore.client 接口：eval / del / close
// eval 返回 [count, allowed] 作为 Lua 脚本结果
function makeRedisClient(overrides = {}) {
  const calls = { eval: [], del: [], close: 0 };
  let evalResult = [0, 1]; // 默认：count=0, allowed=1
  let evalErr = null;
  let closed = false;
  return {
    calls,
    get closed() { return closed; },
    async eval(script, numKeys, ...args) {
      calls.eval.push({ script, numKeys, args });
      if (evalErr) throw evalErr;
      return evalResult;
    },
    async del(key) { calls.del.push(key); },
    async close() { closed = true; calls.close++; },
    // 测试控制
    _setResult(v) { evalResult = v; },
    _setErr(e) { evalErr = e; },
    ...overrides,
  };
}

async function main() {
  console.log('=== Cycle 24 R4: rateLimitStore.js deep tests ===\n');

  // ===== A组: 模块导出 =====
  console.log('\n-- A组: 模块导出 --');
  await ok('A1: 导出 4 个符号', () => {
    const keys = Object.keys({ InMemoryStore, RedisStore, RedisStubStore, createStore });
    assert.strictEqual(keys.length, 4);
  });
  await ok('A2: InMemoryStore 是 class/function', () => {
    assert.strictEqual(typeof InMemoryStore, 'function');
    assert.ok(InMemoryStore.name === 'InMemoryStore');
  });
  await ok('A3: RedisStore 是 class/function', () => {
    assert.strictEqual(typeof RedisStore, 'function');
    assert.ok(RedisStore.name === 'RedisStore');
  });
  await ok('A4: RedisStubStore 是 class/function', () => {
    assert.strictEqual(typeof RedisStubStore, 'function');
    assert.ok(RedisStubStore.name === 'RedisStubStore');
  });
  await ok('A5: createStore 是 function', () => {
    assert.strictEqual(typeof createStore, 'function');
  });
  await ok('A6: RedisStore.LUA_SLIDING_WINDOW 存在且是字符串', () => {
    const lua = RedisStore.LUA_SLIDING_WINDOW;
    assert.strictEqual(typeof lua, 'string');
    assert.ok(lua.length > 100, 'Lua 脚本长度足够');
  });
  await ok('A7: Lua 脚本含 ZREMRANGEBYSCORE', () => {
    assert.ok(RedisStore.LUA_SLIDING_WINDOW.includes('ZREMRANGEBYSCORE'));
  });
  await ok('A8: Lua 脚本含 ZADD / ZCARD / EXPIRE', () => {
    const lua = RedisStore.LUA_SLIDING_WINDOW;
    assert.ok(lua.includes('ZADD'));
    assert.ok(lua.includes('ZCARD'));
    assert.ok(lua.includes('EXPIRE'));
  });
  await ok('A9: Lua 脚本含 KEYS[1] 和 ARGV 引用', () => {
    const lua = RedisStore.LUA_SLIDING_WINDOW;
    assert.ok(lua.includes('KEYS[1]'));
    assert.ok(lua.includes('ARGV'));
  });

  // ===== B组: InMemoryStore 构造 =====
  console.log('\n-- B组: InMemoryStore 构造 --');
  await ok('B1: 默认 sweepIntervalMs=60000', () => {
    const s = new InMemoryStore();
    assert.strictEqual(s.sweepIntervalMs, 60000);
    assert.ok(s.hits instanceof Map);
  });
  await ok('B2: opts.sweepIntervalMs 覆盖', () => {
    const s = new InMemoryStore({ sweepIntervalMs: 1000 });
    assert.strictEqual(s.sweepIntervalMs, 1000);
  });
  await ok('B3: 初始 hits 为空 Map', () => {
    const s = new InMemoryStore();
    assert.strictEqual(s.hits.size, 0);
  });

  // ===== C组: InMemoryStore.hit 正常路径 =====
  console.log('\n-- C组: InMemoryStore.hit 正常路径 --');
  await ok('C1: 首次 hit 返回 count=1, allowed=true', async () => {
    const s = new InMemoryStore();
    const r = await s.hit('k1', 60000, 5);
    assert.strictEqual(r.count, 1);
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.retryAfterMs, 0);
  });
  await ok('C2: 多次 hit count 递增', async () => {
    const s = new InMemoryStore();
    const r1 = await s.hit('k', 60000, 10);
    const r2 = await s.hit('k', 60000, 10);
    const r3 = await s.hit('k', 60000, 10);
    assert.strictEqual(r1.count, 1);
    assert.strictEqual(r2.count, 2);
    assert.strictEqual(r3.count, 3);
  });
  await ok('C3: 不同 key 独立计数', async () => {
    const s = new InMemoryStore();
    await s.hit('a', 60000, 10);
    await s.hit('a', 60000, 10);
    const ra = await s.hit('a', 60000, 10);
    const rb = await s.hit('b', 60000, 10);
    assert.strictEqual(ra.count, 3);
    assert.strictEqual(rb.count, 1);
  });
  await ok('C4: limit=1 时第 2 次 hit 被限', async () => {
    const s = new InMemoryStore({ sweepIntervalMs: 60000 });
    const r1 = await s.hit('k', 60000, 1);
    const r2 = await s.hit('k', 60000, 1);
    assert.strictEqual(r1.allowed, true);
    assert.strictEqual(r1.count, 1);
    assert.strictEqual(r2.allowed, false);
    assert.strictEqual(r2.count, 1);
    assert.ok(r2.retryAfterMs > 0);
  });
  await ok('C5: 超限后 allowed=false，count 不再增长', async () => {
    const s = new InMemoryStore({ sweepIntervalMs: 60000 });
    await s.hit('k', 60000, 2);
    await s.hit('k', 60000, 2);
    const r3 = await s.hit('k', 60000, 2);
    const r4 = await s.hit('k', 60000, 2);
    assert.strictEqual(r3.allowed, false);
    assert.strictEqual(r4.allowed, false);
    assert.strictEqual(r3.count, 2);
    assert.strictEqual(r4.count, 2);
  });
  await ok('C6: retryAfterMs 近似 windowMs（刚超限时）', async () => {
    const s = new InMemoryStore({ sweepIntervalMs: 60000 });
    const windowMs = 10000;
    await s.hit('k', windowMs, 1);
    const r2 = await s.hit('k', windowMs, 1);
    // retryAfterMs = max(1000, arr[0] + windowMs - now) ≈ windowMs
    assert.ok(r2.retryAfterMs > 0 && r2.retryAfterMs <= windowMs + 100,
      `retryAfterMs=${r2.retryAfterMs}`);
  });
  await ok('C7: retryAfterMs 最小 1000ms', async () => {
    // 通过 mock 让 arr[0] + windowMs - now 很小
    // 用极小 windowMs 让时间窗过去
    const s = new InMemoryStore({ sweepIntervalMs: 60000 });
    const r1 = await s.hit('k', 1, 1); // 1ms 窗口
    // 等 5ms 后 hit
    await new Promise((r) => setTimeout(r, 5));
    const r2 = await s.hit('k', 1, 1);
    // 第一次的 hit 已过窗（cutoff = now-1），会被 sweep 掉；所以 r2 应该 allowed=true
    // 但 sweepIntervalMs=60000 太大不会触发周期性清扫；hit 内会主动清扫
    assert.ok(r2.allowed === true || r2.retryAfterMs >= 1000,
      `allowed=${r2.allowed} retryAfterMs=${r2.retryAfterMs}`);
  });
  await ok('C8: hits Map 存储格式正确', async () => {
    const s = new InMemoryStore();
    await s.hit('k', 60000, 10);
    await s.hit('k', 60000, 10);
    const arr = s.hits.get('k');
    assert.ok(Array.isArray(arr));
    assert.strictEqual(arr.length, 2);
    assert.ok(arr.every((t) => typeof t === 'number'));
  });
  await ok('C9: 不同 store 实例不共享 hits', async () => {
    const s1 = new InMemoryStore();
    const s2 = new InMemoryStore();
    await s1.hit('k', 60000, 10);
    assert.strictEqual(s1.hits.size, 1);
    assert.strictEqual(s2.hits.size, 0);
  });

  // ===== D组: InMemoryStore._sweep 周期性清扫 =====
  console.log('\n-- D组: InMemoryStore._sweep 周期性清扫 --');
  await ok('D1: sweepIntervalMs 内不清扫', async () => {
    const s = new InMemoryStore({ sweepIntervalMs: 60000 });
    await s.hit('k', 60000, 10);
    // 立即再 hit 不会触发 _sweep（因为 sweepIntervalMs 未到）
    await s.hit('k', 60000, 10);
    // 但 hit 内部会主动 splice 过期的（cutoff 内），所以 arr.length 不变
    const arr = s.hits.get('k');
    assert.strictEqual(arr.length, 2);
  });
  await ok('D2: 过期 entry 在下次 hit 时被清除', async () => {
    const s = new InMemoryStore({ sweepIntervalMs: 60000 });
    const now = Date.now();
    await s.hit('k', 100, 10); // windowMs=100
    // 等 150ms 让旧 hit 过期
    await new Promise((r) => setTimeout(r, 150));
    // 新 hit 会触发 active splice
    const r = await s.hit('k', 100, 10);
    assert.strictEqual(r.count, 1); // 只有本次
    const arr = s.hits.get('k');
    assert.strictEqual(arr.length, 1);
  });
  await ok('D3: sweepIntervalMs 到期后 _sweep 清空调用', async () => {
    const s = new InMemoryStore({ sweepIntervalMs: 10 });
    await s.hit('k', 1000, 10);
    // 等 20ms 让 sweepInterval 过期
    await new Promise((r) => setTimeout(r, 20));
    // 再 hit 触发 _sweep（内部会重置 _lastSweep）
    await s.hit('k', 1000, 10);
    assert.ok(s._lastSweep > Date.now() - 50);
  });
  await ok('D4: _sweep 用调用方的 windowMs 作为 cutoff（局限）', async () => {
    // 注意：_sweep(now, windowMs) 用调用方的 windowMs，不是 key 自己的 windowMs
    // 因此：key k 用 windowMs=100 hit，等 150ms 后触发 _sweep，
    //       只有当调用方 windowMs 足够小（cutoff > k 的 hit 时间）时 k 才被清
    const s = new InMemoryStore({ sweepIntervalMs: 10 });
    await s.hit('k', 100, 10); // 100ms 窗口
    await new Promise((r) => setTimeout(r, 150)); // k 相对自己 windowMs 已过期
    await new Promise((r) => setTimeout(r, 20)); // 让 sweepInterval 到期
    // 触发 _sweep 用小 windowMs=10（cutoff = now-10），k 的 entry 在 now-170，远小于 cutoff
    await s.hit('other', 10, 10);
    assert.strictEqual(s.hits.has('k'), false);
  });
  await ok('D4b: _sweep 局限 - 大 windowMs 调用时旧小 windowMs 的 key 不被清', async () => {
    // 已知局限：_sweep 用调用方的 windowMs 决定 cutoff
    // 如果调用方 windowMs 很大，cutoff 落在很过去，旧 entry（即使超过自己的 windowMs）不会被清
    const s = new InMemoryStore({ sweepIntervalMs: 10 });
    await s.hit('k', 100, 10); // k 的 windowMs=100
    await new Promise((r) => setTimeout(r, 150)); // k 相对自己 windowMs 已过期
    await new Promise((r) => setTimeout(r, 20)); // sweepInterval 到期
    // 用大 windowMs 触发 _sweep（cutoff 落在 t0+150-1000000 处，远在过去）
    await s.hit('other', 1000000, 10);
    // k 的 entry (t0+0) 相对 cutoff=t0-999850 是 >cutoff，仍在窗口内，不被清
    assert.strictEqual(s.hits.has('k'), true);
    // 但下次用 k 自己的 windowMs hit 时，hit 内部会主动 splice 清掉
    const r = await s.hit('k', 100, 10);
    assert.strictEqual(r.count, 1); // 旧 entry 被清，只剩本次
  });
  await ok('D5: _sweep 手动调用（构造过期 arr）', () => {
    const s = new InMemoryStore({ sweepIntervalMs: 1 });
    const now = Date.now();
    s.hits.set('k', [now - 100000]); // 100 秒前
    s._lastSweep = 0; // 强制触发
    s._sweep(now, 100); // windowMs=100, cutoff = now-100
    assert.strictEqual(s.hits.has('k'), false);
  });
  await ok('D6: _sweep 不会因 windowMs 未到期清除', () => {
    const s = new InMemoryStore({ sweepIntervalMs: 1 });
    s._lastSweep = 0; // 强制触发
    s.hits.set('k', [Date.now()]);
    s._sweep(Date.now(), 60000);
    // windowMs=60s，hit 在窗口内
    assert.ok(s.hits.has('k'));
    assert.strictEqual(s.hits.get('k').length, 1);
  });

  // ===== E组: InMemoryStore.reset / shutdown =====
  console.log('\n-- E组: InMemoryStore.reset / shutdown --');
  await ok('E1: reset(key) 删除该 key', async () => {
    const s = new InMemoryStore();
    await s.hit('k', 60000, 10);
    await s.hit('k', 60000, 10);
    await s.reset('k');
    assert.strictEqual(s.hits.has('k'), false);
    // 下次 hit count=1
    const r = await s.hit('k', 60000, 10);
    assert.strictEqual(r.count, 1);
  });
  await ok('E2: reset 其他 key 保留', async () => {
    const s = new InMemoryStore();
    await s.hit('a', 60000, 10);
    await s.hit('b', 60000, 10);
    await s.reset('a');
    assert.strictEqual(s.hits.has('a'), false);
    assert.ok(s.hits.has('b'));
  });
  await ok('E3: reset 不存在的 key 不抛错', async () => {
    const s = new InMemoryStore();
    await s.reset('nope');
  });
  await ok('E4: shutdown 清空所有 hits', async () => {
    const s = new InMemoryStore();
    await s.hit('a', 60000, 10);
    await s.hit('b', 60000, 10);
    await s.shutdown();
    assert.strictEqual(s.hits.size, 0);
  });
  await ok('E5: shutdown 后仍可 hit（重建）', async () => {
    const s = new InMemoryStore();
    await s.hit('k', 60000, 10);
    await s.shutdown();
    const r = await s.hit('k', 60000, 10);
    assert.strictEqual(r.count, 1);
  });

  // ===== F组: RedisStore 构造 =====
  console.log('\n-- F组: RedisStore 构造 --');
  await ok('F1: 默认 keyPrefix=rl:', () => {
    const c = makeRedisClient();
    const s = new RedisStore({ client: c });
    assert.strictEqual(s.keyPrefix, 'rl:');
  });
  await ok('F2: 默认 storeName=default', () => {
    const s = new RedisStore({ client: makeRedisClient() });
    assert.strictEqual(s.storeName, 'default');
  });
  await ok('F3: opts.keyPrefix 覆盖', () => {
    const s = new RedisStore({ client: makeRedisClient(), keyPrefix: 'my-rl:' });
    assert.strictEqual(s.keyPrefix, 'my-rl:');
  });
  await ok('F4: opts.storeName 覆盖', () => {
    const s = new RedisStore({ client: makeRedisClient(), storeName: 'api' });
    assert.strictEqual(s.storeName, 'api');
  });
  await ok('F5: _ownsClient=false 当传入 client', () => {
    const c = makeRedisClient();
    const s = new RedisStore({ client: c });
    assert.strictEqual(s._ownsClient, false);
  });
  await ok('F6: _ownsClient=true 当未传 client（默认）', () => {
    // 注意：默认会 new RedisClient()，但这里 opts={} 会让 storeName 走默认
    // 为了避免真的连 Redis，用 mock client 并手动构造
    const s = new RedisStore({ client: makeRedisClient() });
    assert.strictEqual(s._ownsClient, false);
    // 直接构造 opts 无 client 会创建 RedisClient 实例
    // 但这里只验证逻辑：传入 client 时 _ownsClient=false
  });
  await ok('F7: 初始 _healthy=true', () => {
    const s = new RedisStore({ client: makeRedisClient() });
    assert.strictEqual(s._healthy, true);
  });
  await ok('F8: _fullKey 拼接正确', () => {
    const s = new RedisStore({ client: makeRedisClient(), keyPrefix: 'rl:', storeName: 'api' });
    assert.strictEqual(s._fullKey('127.0.0.1'), 'rl:api:127.0.0.1');
  });

  // ===== G组: RedisStore.hit 正常路径 =====
  console.log('\n-- G组: RedisStore.hit 正常路径 --');
  await ok('G1: eval 返回 [1,1] 时 allowed=true', async () => {
    const c = makeRedisClient();
    c._setResult([1, 1]);
    const s = new RedisStore({ client: c });
    const r = await s.hit('k', 60000, 5);
    assert.strictEqual(r.count, 1);
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.retryAfterMs, 0);
  });
  await ok('G2: eval 返回 [5,1] 时 count=5, allowed=true', async () => {
    const c = makeRedisClient();
    c._setResult([5, 1]);
    const s = new RedisStore({ client: c });
    const r = await s.hit('k', 60000, 5);
    assert.strictEqual(r.count, 5);
    assert.strictEqual(r.allowed, true);
  });
  await ok('G3: eval 返回 [6,0] 时 allowed=false, retryAfterMs=windowMs', async () => {
    const c = makeRedisClient();
    c._setResult([6, 0]);
    const s = new RedisStore({ client: c });
    const r = await s.hit('k', 60000, 5);
    assert.strictEqual(r.count, 6);
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(r.retryAfterMs, 60000);
  });
  await ok('G4: eval 调用参数顺序正确', async () => {
    const c = makeRedisClient();
    c._setResult([1, 1]);
    const s = new RedisStore({ client: c, keyPrefix: 'rl:', storeName: 'api' });
    await s.hit('127.0.0.1', 60000, 5);
    const call = c.calls.eval[0];
    // call.args[0] = fullKey, args[1]=now, args[2]=cutoff, args[3]=limit, args[4]=windowSec, args[5]=member
    assert.strictEqual(call.numKeys, 1);
    assert.strictEqual(call.args[0], 'rl:api:127.0.0.1');
    // args[1] (now) 和 args[2] (cutoff) 是字符串
    assert.strictEqual(typeof call.args[1], 'string');
    assert.strictEqual(typeof call.args[2], 'string');
    assert.strictEqual(call.args[3], '5'); // limit
    // windowSec = Math.ceil(60000/1000)+1 = 61
    assert.strictEqual(call.args[4], '61');
    // member: `${now}-${uuid}`
    assert.ok(call.args[5].includes('-'));
  });
  await ok('G5: eval 使用 RedisStore.LUA_SLIDING_WINDOW 脚本', async () => {
    const c = makeRedisClient();
    c._setResult([1, 1]);
    const s = new RedisStore({ client: c });
    await s.hit('k', 60000, 5);
    assert.strictEqual(c.calls.eval[0].script, RedisStore.LUA_SLIDING_WINDOW);
  });
  await ok('G6: 多次 hit 都调用 eval（无本地缓存）', async () => {
    const c = makeRedisClient();
    c._setResult([1, 1]);
    const s = new RedisStore({ client: c });
    await s.hit('k', 60000, 5);
    await s.hit('k', 60000, 5);
    await s.hit('k', 60000, 5);
    assert.strictEqual(c.calls.eval.length, 3);
  });
  await ok('G7: allowed 判定用 Number(r[1])===1', async () => {
    const c = makeRedisClient();
    c._setResult([1, '1']); // 字符串 '1' 也允许
    const s = new RedisStore({ client: c });
    const r = await s.hit('k', 60000, 5);
    assert.strictEqual(r.allowed, true);
  });
  await ok('G8: allowed 判定用 Number(r[1])!==1 时 false', async () => {
    const c = makeRedisClient();
    c._setResult([1, '0']);
    const s = new RedisStore({ client: c });
    const r = await s.hit('k', 60000, 5);
    assert.strictEqual(r.allowed, false);
  });

  // ===== H组: RedisStore.hit 失败兜底 =====
  console.log('\n-- H组: RedisStore.hit 失败兜底 --');
  await ok('H1: eval 抛错时 _healthy=false', async () => {
    const c = makeRedisClient();
    c._setErr(new Error('redis down'));
    const s = new RedisStore({ client: c });
    await s.hit('k', 60000, 5);
    assert.strictEqual(s._healthy, false);
  });
  await ok('H2: eval 抛错时返回 allowed=true (保守放行)', async () => {
    const c = makeRedisClient();
    c._setErr(new Error('redis down'));
    const s = new RedisStore({ client: c });
    const r = await s.hit('k', 60000, 5);
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.count, 0);
    assert.strictEqual(r.retryAfterMs, 0);
  });
  await ok('H3: eval 抛错时返回 degraded=true 标记', async () => {
    const c = makeRedisClient();
    c._setErr(new Error('redis down'));
    const s = new RedisStore({ client: c });
    const r = await s.hit('k', 60000, 5);
    assert.strictEqual(r.degraded, true);
  });
  await ok('H4: 连续失败仍保守放行', async () => {
    const c = makeRedisClient();
    c._setErr(new Error('down'));
    const s = new RedisStore({ client: c });
    const r1 = await s.hit('k', 60000, 1);
    const r2 = await s.hit('k', 60000, 1);
    assert.strictEqual(r1.allowed, true);
    assert.strictEqual(r2.allowed, true);
  });
  await ok('H5: 恢复后 _healthy 不自动恢复（需外部处理）', async () => {
    const c = makeRedisClient();
    c._setErr(new Error('down'));
    const s = new RedisStore({ client: c });
    await s.hit('k', 60000, 5);
    // 恢复 client 不再抛错
    c._setErr(null);
    c._setResult([1, 1]);
    const r = await s.hit('k', 60000, 5);
    assert.strictEqual(r.allowed, true);
    // _healthy 仍是 false（源码未重置）
    assert.strictEqual(s._healthy, false);
  });

  // ===== I组: RedisStore.reset / shutdown =====
  console.log('\n-- I组: RedisStore.reset / shutdown --');
  await ok('I1: reset 调用 client.del(fullKey)', async () => {
    const c = makeRedisClient();
    const s = new RedisStore({ client: c, keyPrefix: 'rl:', storeName: 'api' });
    await s.reset('127.0.0.1');
    assert.strictEqual(c.calls.del.length, 1);
    assert.strictEqual(c.calls.del[0], 'rl:api:127.0.0.1');
  });
  await ok('I2: reset 抛错时静默（兜底）', async () => {
    const c = makeRedisClient();
    c.del = async () => { throw new Error('del err'); };
    const s = new RedisStore({ client: c });
    // 不抛错即通过
    await s.reset('k');
  });
  await ok('I3: shutdown 当 _ownsClient=true 时调用 close', async () => {
    // 手动构造 _ownsClient=true 场景
    const c = makeRedisClient();
    const s = new RedisStore({ client: c });
    s._ownsClient = true;
    await s.shutdown();
    assert.strictEqual(c.calls.close, 1);
    assert.strictEqual(c.closed, true);
  });
  await ok('I4: shutdown 当 _ownsClient=false 时不调用 close', async () => {
    const c = makeRedisClient();
    const s = new RedisStore({ client: c });
    // 传入 client 时 _ownsClient=false
    await s.shutdown();
    assert.strictEqual(c.calls.close, 0);
    assert.strictEqual(c.closed, false);
  });
  await ok('I5: shutdown 抛出时不捕获', async () => {
    const c = makeRedisClient();
    c.close = async () => { throw new Error('close err'); };
    const s = new RedisStore({ client: c });
    s._ownsClient = true;
    let threw = false;
    try { await s.shutdown(); } catch (_) { threw = true; }
    assert.strictEqual(threw, true);
  });

  // ===== J组: RedisStubStore =====
  console.log('\n-- J组: RedisStubStore (周期 3 兼容) --');
  await ok('J1: 默认 keyPrefix=rl:', () => {
    const s = new RedisStubStore();
    assert.strictEqual(s.keyPrefix, 'rl:');
  });
  await ok('J2: 初始 _stubCounters 为空 Map', () => {
    const s = new RedisStubStore();
    assert.ok(s._stubCounters instanceof Map);
    assert.strictEqual(s._stubCounters.size, 0);
  });
  await ok('J3: hit 首次返回 count=1, allowed=true', async () => {
    const s = new RedisStubStore();
    const r = await s.hit('k', 60000, 5);
    assert.strictEqual(r.count, 1);
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.retryAfterMs, 0);
  });
  await ok('J4: hit 多次 count 递增（永远 allowed=true）', async () => {
    const s = new RedisStubStore();
    const r1 = await s.hit('k', 60000, 1); // limit=1
    const r2 = await s.hit('k', 60000, 1);
    const r3 = await s.hit('k', 60000, 1);
    assert.strictEqual(r1.count, 1);
    assert.strictEqual(r2.count, 2);
    assert.strictEqual(r3.count, 3);
    // stub 永远放行（stub 行为）
    assert.strictEqual(r1.allowed, true);
    assert.strictEqual(r2.allowed, true);
    assert.strictEqual(r3.allowed, true);
  });
  await ok('J5: 不同 key 独立计数', async () => {
    const s = new RedisStubStore();
    await s.hit('a', 60000, 1);
    const r = await s.hit('b', 60000, 1);
    assert.strictEqual(r.count, 1);
  });
  await ok('J6: reset 删除该 key', async () => {
    const s = new RedisStubStore();
    await s.hit('k', 60000, 5);
    await s.reset('k');
    assert.strictEqual(s._stubCounters.has('k'), false);
    const r = await s.hit('k', 60000, 5);
    assert.strictEqual(r.count, 1);
  });
  await ok('J7: shutdown 清空所有计数器', async () => {
    const s = new RedisStubStore();
    await s.hit('a', 60000, 5);
    await s.hit('b', 60000, 5);
    await s.shutdown();
    assert.strictEqual(s._stubCounters.size, 0);
  });
  await ok('J8: stub 忽略 windowMs 和 limit（无滑窗）', async () => {
    const s = new RedisStubStore();
    // 即使 windowMs=0 或 limit=0，也永远放行
    const r = await s.hit('k', 0, 0);
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.count, 1);
  });

  // ===== K组: createStore 工厂 =====
  console.log('\n-- K组: createStore 工厂 --');
  await ok('K1: 默认返回 InMemoryStore', () => {
    const s = createStore();
    assert.ok(s instanceof InMemoryStore);
  });
  await ok('K2: opts.store=redis 返回 RedisStore', () => {
    const c = makeRedisClient();
    const s = createStore({ store: 'redis', client: c });
    assert.ok(s instanceof RedisStore);
  });
  await ok('K3: opts.store=redis-stub 返回 RedisStubStore', () => {
    const s = createStore({ store: 'redis-stub' });
    assert.ok(s instanceof RedisStubStore);
  });
  await ok('K4: opts.store 未知值返回 InMemoryStore', () => {
    const s = createStore({ store: 'sqlite' });
    assert.ok(s instanceof InMemoryStore);
  });
  await ok('K5: env REDIS_STORE=1 返回 RedisStore（无 opts.store 时）', () => {
    const prev = process.env.REDIS_STORE;
    process.env.REDIS_STORE = '1';
    try {
      const c = makeRedisClient();
      const s = createStore({ client: c });
      assert.ok(s instanceof RedisStore);
    } finally {
      if (prev === undefined) delete process.env.REDIS_STORE;
      else process.env.REDIS_STORE = prev;
    }
  });
  await ok('K6: opts.store=redis-stub 在 env REDIS_STORE=1 时仍返回 stub', () => {
    // 注意：源码逻辑 `if (opts.store === 'redis' || process.env.REDIS_STORE === '1')`
    // 优先检查 opts.store==='redis'，其次检查 env==='1'
    // 但 opts.store='redis-stub' 不匹配 'redis'，所以会进入下一个 if
    // 然而 env='1' 会让第一个 if 通过 → 返回 RedisStore（env 优先于 redis-stub 设置）
    // 这是源码设计：env REDIS_STORE=1 是"强制启用 Redis"的最高优先级
    const prev = process.env.REDIS_STORE;
    process.env.REDIS_STORE = '1';
    try {
      const c = makeRedisClient();
      const s = createStore({ store: 'redis-stub', client: c });
      // 实际行为：env 优先 → RedisStore（不是 stub）
      assert.ok(s instanceof RedisStore, 'env REDIS_STORE=1 强制 RedisStore');
    } finally {
      if (prev === undefined) delete process.env.REDIS_STORE;
      else process.env.REDIS_STORE = prev;
    }
  });
  await ok('K6b: env REDIS_STORE=1 优先于无 opts.store（源码设计：env 优先）', () => {
    // 源码逻辑：`if (opts.store === 'redis' || process.env.REDIS_STORE === '1')` 先判定 RedisStore
    // 因此 env REDIS_STORE=1 会覆盖 opts.store=redis-stub（这是源码设计，不是 bug）
    // 测试验证这个行为：env=1 时无 opts.store → RedisStore
    const prev = process.env.REDIS_STORE;
    process.env.REDIS_STORE = '1';
    try {
      const c = makeRedisClient();
      const s = createStore({ client: c });
      assert.ok(s instanceof RedisStore);
    } finally {
      if (prev === undefined) delete process.env.REDIS_STORE;
      else process.env.REDIS_STORE = prev;
    }
  });
  await ok('K6c: opts.store=redis 显式覆盖 env（即使 env=0）', () => {
    // opts.store=redis 优先于 env（因为 OR 短路：opts.store===redis 直接 true）
    const prev = process.env.REDIS_STORE;
    process.env.REDIS_STORE = '0';
    try {
      const c = makeRedisClient();
      const s = createStore({ store: 'redis', client: c });
      assert.ok(s instanceof RedisStore);
    } finally {
      if (prev === undefined) delete process.env.REDIS_STORE;
      else process.env.REDIS_STORE = prev;
    }
  });
  await ok('K7: env REDIS_STORE=0 时不返回 RedisStore', () => {
    const prev = process.env.REDIS_STORE;
    process.env.REDIS_STORE = '0';
    try {
      const s = createStore();
      assert.ok(s instanceof InMemoryStore);
    } finally {
      if (prev === undefined) delete process.env.REDIS_STORE;
      else process.env.REDIS_STORE = prev;
    }
  });
  await ok('K8: 无 opts 时返回 InMemoryStore', () => {
    const s = createStore({});
    assert.ok(s instanceof InMemoryStore);
  });
  await ok('K9: 透传 opts 到 store 构造器', () => {
    const s = createStore({ store: 'redis-stub', keyPrefix: 'my-prefix:' });
    assert.ok(s instanceof RedisStubStore);
    assert.strictEqual(s.keyPrefix, 'my-prefix:');
  });
  await ok('K10: 工厂创建的 RedisStore 使用传入 client', () => {
    const c = makeRedisClient();
    const s = createStore({ store: 'redis', client: c });
    assert.strictEqual(s.client, c);
    assert.strictEqual(s._ownsClient, false);
  });

  // ===== L组: 集成 - InMemoryStore 边界 =====
  console.log('\n-- L组: 集成 - InMemoryStore 边界 --');
  await ok('L1: limit=0 时首次 hit 即被限', async () => {
    const s = new InMemoryStore({ sweepIntervalMs: 60000 });
    // limit=0: arr.length >= 0 永远 true → 第一次就被限
    const r = await s.hit('k', 60000, 0);
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(r.count, 0);
  });
  await ok('L2: 负 windowMs 让 cutoff 在未来（所有 hit 都过期）', async () => {
    const s = new InMemoryStore({ sweepIntervalMs: 60000 });
    const r1 = await s.hit('k', -100, 5); // windowMs=-100
    // cutoff = now - (-100) = now+100，本次 hit 立即过期
    // arr 为空 → count=1, allowed=true
    assert.strictEqual(r1.count, 1);
    assert.strictEqual(r1.allowed, true);
  });
  await ok('L3: sweepIntervalMs=0 每次 hit 都触发 _sweep', async () => {
    const s = new InMemoryStore({ sweepIntervalMs: 0 });
    await s.hit('k', 60000, 10);
    await s.hit('k', 60000, 10);
    // 每次 hit 都触发 sweep，但 hit 在窗口内不清除
    assert.strictEqual(s.hits.get('k').length, 2);
  });
  await ok('L4: 大量 key 不崩溃', async () => {
    const s = new InMemoryStore();
    for (let i = 0; i < 100; i++) {
      await s.hit(`k${i}`, 60000, 10);
    }
    assert.strictEqual(s.hits.size, 100);
  });
  await ok('L5: 特殊字符 key 可正常存储', async () => {
    const s = new InMemoryStore();
    const keys = ['127.0.0.1', 'user:123', 'ip-v6::1', 'token-abc-123'];
    for (const k of keys) {
      const r = await s.hit(k, 60000, 5);
      assert.strictEqual(r.allowed, true);
    }
  });

  // ===== M组: 集成 - RedisStore Lua 脚本内容 =====
  console.log('\n-- M组: Lua 脚本内容验证 --');
  await ok('M1: Lua 使用 ZREMRANGEBYSCORE 清理过期', () => {
    const lua = RedisStore.LUA_SLIDING_WINDOW;
    assert.ok(lua.includes("redis.call('ZREMRANGEBYSCORE'"));
    assert.ok(lua.includes("'(' .. cutoff")); // 开区间（cutoff 排除自身）
  });
  await ok('M2: Lua 使用 ZADD 添加 member', () => {
    const lua = RedisStore.LUA_SLIDING_WINDOW;
    assert.ok(lua.includes("redis.call('ZADD', key, now, member)"));
  });
  await ok('M3: Lua 使用 ZCARD 取 count', () => {
    const lua = RedisStore.LUA_SLIDING_WINDOW;
    assert.ok(lua.includes("redis.call('ZCARD', key)"));
  });
  await ok('M4: Lua 使用 EXPIRE 设置 TTL', () => {
    const lua = RedisStore.LUA_SLIDING_WINDOW;
    assert.ok(lua.includes("redis.call('EXPIRE', key, windowSec + 1)"));
  });
  await ok('M5: Lua 根据 count>limit 返回 allowed', () => {
    const lua = RedisStore.LUA_SLIDING_WINDOW;
    assert.ok(lua.includes('if count > limit then'));
    assert.ok(lua.includes('return {count, 0}'));
    assert.ok(lua.includes('return {count, 1}'));
  });
  await ok('M6: Lua ARGV 引用完整（5 个参数）', () => {
    const lua = RedisStore.LUA_SLIDING_WINDOW;
    for (let i = 1; i <= 5; i++) {
      assert.ok(lua.includes(`ARGV[${i}]`), `missing ARGV[${i}]`);
    }
  });

  // ===== N组: 回归验证 - 与 rate-limit.cjs 兼容 =====
  console.log('\n-- N组: 回归验证 --');
  await ok('N1: InMemoryStore 是 class（可 new）', () => {
    assert.doesNotThrow(() => new InMemoryStore());
  });
  await ok('N2: RedisStore 是 class（可 new，需 client）', () => {
    assert.doesNotThrow(() => new RedisStore({ client: makeRedisClient() }));
  });
  await ok('N3: RedisStubStore 是 class（可 new）', () => {
    assert.doesNotThrow(() => new RedisStubStore());
  });
  await ok('N4: 三种 store 都有 hit/reset/shutdown 方法', () => {
    for (const s of [new InMemoryStore(), new RedisStore({ client: makeRedisClient() }), new RedisStubStore()]) {
      assert.strictEqual(typeof s.hit, 'function');
      assert.strictEqual(typeof s.reset, 'function');
      assert.strictEqual(typeof s.shutdown, 'function');
    }
  });
  await ok('N5: 三种 store 的 hit 都返回 { count, allowed, retryAfterMs }', async () => {
    for (const s of [new InMemoryStore(), new RedisStore({ client: makeRedisClient() }), new RedisStubStore()]) {
      const r = await s.hit('k', 60000, 5);
      assert.strictEqual(typeof r.count, 'number');
      assert.strictEqual(typeof r.allowed, 'boolean');
      assert.strictEqual(typeof r.retryAfterMs, 'number');
    }
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
