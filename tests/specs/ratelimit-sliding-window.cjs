// tests/specs/ratelimit-sliding-window.cjs
// 周期 2 P1-9: Sliding Window Log 限流 —— 替换 express-rate-limit 默认 Fixed Window
//
// 背景：express-rate-limit 7.x 默认 MemoryStore 是 Fixed Window
//   - 边界处会突发 2×limit（如 600/min 实际可在 2s 内 1200 次）
//   - Sliding Window 按时间戳滑窗更平滑
//
// 修复：新增 slidingWindow() 中间件
//   - 每个 IP 一个时间戳数组
//   - 每次请求清理 < now - windowMs 的旧时间戳
//   - 剩余 ≥ limit → 429
//   - 周期清扫避免内存泄漏
//
// 验收（不依赖 express，直接调用中间件函数）：
//   - 单元：参数校验、limit 触发、滑动窗口、headers
//   - skip 函数：loopback 跳过
//   - 并发/时间窗：3 个请求在 1s 内 → 第 3 个被拒；等 1.1s 后又能放行

'use strict';

const assert = require('node:assert');
const { slidingWindow } = require('../../server/middleware/rateLimit');

let pass = 0;
let fail = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { console.log(`  [PASS] ${name}`); pass++; })
    .catch((e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; });
}

function makeReqRes(ip = '1.2.3.4') {
  const headers = {};
  const req = { ip, socket: { remoteAddress: ip } };
  const res = {
    statusCode: 200,
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    getHeader: (k) => headers[k.toLowerCase()],
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  return { req, res, headers };
}

function call(mw, ip) {
  const ctx = makeReqRes(ip);
  return new Promise((resolve) => {
    const { req, res, headers } = ctx;
    let called = false;
    const next = () => { called = true; resolve({ nextCalled: true, status: res.statusCode, body: res.body, headers }); };
    try {
      const r = mw(req, res, next);
      if (r && typeof r.then === 'function') {
        r.then(() => { if (!called) resolve({ nextCalled: false, status: res.statusCode, body: res.body, headers }); });
      } else if (!called) {
        setImmediate(() => { if (!called) resolve({ nextCalled: false, status: res.statusCode, body: res.body, headers }); });
      }
    } catch (e) {
      resolve({ nextCalled: false, status: res.statusCode, body: res.body, headers, error: e });
    }
  });
}

(async () => {
  console.log('=== ratelimit-sliding-window ===');

  // ---- 1. 参数校验 ----
  await test('windowMs 非法 → throw', () => {
    assert.throws(() => slidingWindow({ windowMs: 0, limit: 5 }));
    assert.throws(() => slidingWindow({ windowMs: -1, limit: 5 }));
  });
  await test('limit 非法 → throw', () => {
    assert.throws(() => slidingWindow({ windowMs: 1000, limit: 0 }));
    assert.throws(() => slidingWindow({ windowMs: 1000, limit: -1 }));
  });

  // ---- 2. 基本行为 ----
  await test('limit=3 内 3 次 → 全部 next()', async () => {
    const mw = slidingWindow({ windowMs: 1000, limit: 3 });
    for (let i = 0; i < 3; i += 1) {
      const r = await call(mw, '1.1.1.1');
      assert.strictEqual(r.nextCalled, true, `第 ${i+1} 次应放行`);
    }
  });

  await test('limit=3 第 4 次 → 429 + body + Retry-After', async () => {
    const mw = slidingWindow({ windowMs: 1000, limit: 3 });
    for (let i = 0; i < 3; i += 1) {
      await call(mw, '2.2.2.2');
    }
    const r = await call(mw, '2.2.2.2');
    assert.strictEqual(r.nextCalled, false, '第 4 次应被拒');
    assert.strictEqual(r.status, 429);
    assert.strictEqual(r.body.success, false);
    assert.match(r.body.message, /频繁/);
    assert.ok(r.headers['retry-after'], '应设置 Retry-After');
    assert.ok(r.headers['x-ratelimit-remaining'] === '0');
  });

  await test('不同 IP 独立计数', async () => {
    const mw = slidingWindow({ windowMs: 1000, limit: 2 });
    const a1 = await call(mw, '3.0.0.1');
    const a2 = await call(mw, '3.0.0.1');
    const a3 = await call(mw, '3.0.0.1');
    const b1 = await call(mw, '3.0.0.2');
    assert.strictEqual(a1.nextCalled, true);
    assert.strictEqual(a2.nextCalled, true);
    assert.strictEqual(a3.nextCalled, false, '3.0.0.1 第 3 次应拒');
    assert.strictEqual(b1.nextCalled, true, '3.0.0.2 第 1 次应放行');
  });

  await test('时间窗滑出后能再次放行', async () => {
    const mw = slidingWindow({ windowMs: 200, limit: 1 });
    const a1 = await call(mw, '4.0.0.1');
    assert.strictEqual(a1.nextCalled, true);
    const a2 = await call(mw, '4.0.0.1');
    assert.strictEqual(a2.nextCalled, false);
    await new Promise((r) => setTimeout(r, 250));
    const a3 = await call(mw, '4.0.0.1');
    assert.strictEqual(a3.nextCalled, true, '窗口滑出后应放行');
  });

  // ---- 3. skip / 周期 1 P0-2 兼容 ----
  await test('skip=loopback 时 loopback 永远放行', async () => {
    const mw = slidingWindow({ windowMs: 1000, limit: 1, skip: (req) => req.ip === '127.0.0.1' });
    for (let i = 0; i < 5; i += 1) {
      const r = await call(mw, '127.0.0.1');
      assert.strictEqual(r.nextCalled, true, `loopback 第 ${i+1} 次应放行`);
    }
  });

  await test('skip=loopback 时非 loopback 仍限流', async () => {
    const mw = slidingWindow({ windowMs: 1000, limit: 1, skip: (req) => req.ip === '127.0.0.1' });
    const a1 = await call(mw, '5.0.0.1');
    assert.strictEqual(a1.nextCalled, true);
    const a2 = await call(mw, '5.0.0.1');
    assert.strictEqual(a2.nextCalled, false);
  });

  // ---- 4. headers ----
  await test('每次成功放行设置 X-RateLimit-Limit / Remaining', async () => {
    const mw = slidingWindow({ windowMs: 1000, limit: 5 });
    const r = await call(mw, '6.0.0.1');
    assert.strictEqual(r.nextCalled, true);
    assert.strictEqual(r.headers['x-ratelimit-limit'], '5');
    assert.strictEqual(r.headers['x-ratelimit-remaining'], '4');
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})();
