// tests/specs/ratelimit-standard-headers.cjs
// 周期 6 P0-2 续: IETF draft-ietf-httpapi-ratelimit-headers 标准 header
//
// 背景：周期 2/3/4 限流用 X-RateLimit-* 前缀。IETF 标准化去掉 X- 前缀。
//   周期 6 P0-2 续：slidingWindow + tokenBucket 同时写两套（兼容老 client）。
//
// 验收：
//   1. slidingWindow 超限响应有 RateLimit-* 三项 + X-* 三项
//   2. slidingWindow 成功响应有 RateLimit-* + X-*（remaining）
//   3. tokenBucket 超限响应有 RateLimit-* + X-*
//   4. tokenBucket 成功响应有 RateLimit-* + X-*
//   5. 数字格式：RateLimit-Limit 为正整数
//   6. RateLimit-Reset 是绝对秒数（> now）
//   7. RateLimit-Remaining 在 0..Limit 之间
//   8. 全局 rateLimit factory 仍支持 'draft-7'（不破坏 express-rate-limit 老行为）

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const {
  slidingWindow, tokenBucket,
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

function fakeReqRes(key) {
  const req = { ip: '8.8.8.8', socket: { remoteAddress: '8.8.8.8' } };
  const headers = {};
  const res = new EventEmitter();
  res.statusCode = 200;
  res.setHeader = (k, v) => { headers[k.toLowerCase()] = v; };
  res.set = res.setHeader;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return { req, res, headers, key };
}

async function runMiddleware(mw, key) {
  return new Promise((resolve) => {
    const { req, res, headers } = fakeReqRes(key);
    mw(req, res, () => resolve({ headers, res, calledNext: true }));
    setImmediate(() => resolve({ headers, res, calledNext: false }));
  });
}

(async () => {
  console.log('=== ratelimit-standard-headers ===');

  // ---- 1. 静态扫描 ----
  await test('rateLimit.js 写 RateLimit-Limit header', () => {
    assert.match(RATE_LIMIT_SRC, /setHeader\(['"]RateLimit-Limit['"]/);
  });
  await test('rateLimit.js 写 RateLimit-Remaining header', () => {
    assert.match(RATE_LIMIT_SRC, /setHeader\(['"]RateLimit-Remaining['"]/);
  });
  await test('rateLimit.js 写 RateLimit-Reset header', () => {
    assert.match(RATE_LIMIT_SRC, /setHeader\(['"]RateLimit-Reset['"]/);
  });
  await test('rateLimit.js 仍写 X-RateLimit-* 兼容老 client', () => {
    assert.match(RATE_LIMIT_SRC, /setHeader\(['"]X-RateLimit-Limit['"]/);
  });

  // ---- 2. slidingWindow 超限 ----
  await test('slidingWindow 超限：RateLimit-Limit / Remaining / Reset + X-*', async () => {
    const mw = slidingWindow({ windowMs: 10000, limit: 2, keyBy: () => 'std-1' });
    await runMiddleware(mw, 'std-1');
    await runMiddleware(mw, 'std-1');
    const { headers, res } = await runMiddleware(mw, 'std-1');
    assert.strictEqual(res.statusCode, 429);
    assert.strictEqual(headers['ratelimit-limit'], '2');
    assert.strictEqual(headers['ratelimit-remaining'], '0');
    assert.ok(headers['ratelimit-reset'] !== undefined);
    assert.ok(parseInt(headers['ratelimit-reset'], 10) > 0);
    // 兼容
    assert.strictEqual(headers['x-ratelimit-limit'], '2');
    assert.strictEqual(headers['x-ratelimit-remaining'], '0');
  });

  // ---- 3. slidingWindow 成功 ----
  await test('slidingWindow 成功：RateLimit-Limit / Remaining', async () => {
    const mw = slidingWindow({ windowMs: 10000, limit: 5, keyBy: () => 'std-2' });
    const { headers, res } = await runMiddleware(mw, 'std-2');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(headers['ratelimit-limit'], '5');
    assert.strictEqual(headers['ratelimit-remaining'], '4');
    assert.strictEqual(headers['x-ratelimit-remaining'], '4');
  });

  // ---- 4. tokenBucket 超限 ----
  await test('tokenBucket 超限：RateLimit-* + X-*', async () => {
    const mw = tokenBucket({ windowMs: 10000, limit: 2, keyBy: () => 'std-3' });
    await runMiddleware(mw, 'std-3');
    await runMiddleware(mw, 'std-3');
    const { headers, res } = await runMiddleware(mw, 'std-3');
    assert.strictEqual(res.statusCode, 429);
    assert.strictEqual(headers['ratelimit-limit'], '2');
    assert.strictEqual(headers['ratelimit-remaining'], '0');
    assert.ok(headers['ratelimit-reset'] !== undefined);
    assert.strictEqual(headers['x-ratelimit-limit'], '2');
  });

  // ---- 5. tokenBucket 成功 ----
  await test('tokenBucket 成功：RateLimit-Limit / Remaining (整数)', async () => {
    const mw = tokenBucket({ windowMs: 1000, limit: 5, keyBy: () => 'std-4' });
    const { headers } = await runMiddleware(mw, 'std-4');
    assert.strictEqual(headers['ratelimit-limit'], '5');
    const remaining = parseInt(headers['ratelimit-remaining'], 10);
    assert.ok(Number.isInteger(remaining));
    assert.ok(remaining >= 0 && remaining <= 5);
  });

  // ---- 6. RateLimit-Reset 绝对秒数（> now）----
  await test('RateLimit-Reset 是 > 0 的整数', async () => {
    const mw = slidingWindow({ windowMs: 10000, limit: 1, keyBy: () => 'std-5' });
    await runMiddleware(mw, 'std-5');
    const { headers } = await runMiddleware(mw, 'std-5');
    const reset = parseInt(headers['ratelimit-reset'], 10);
    assert.ok(Number.isInteger(reset));
    assert.ok(reset > 0, `reset 应 > 0，实际 ${reset}`);
  });

  // ---- 7. RateLimit-Limit 始终是正整数 ----
  await test('RateLimit-Limit 是正整数', async () => {
    const mw = tokenBucket({ windowMs: 1000, limit: 7, keyBy: () => 'std-6' });
    const { headers } = await runMiddleware(mw, 'std-6');
    const lim = parseInt(headers['ratelimit-limit'], 10);
    assert.ok(Number.isInteger(lim));
    assert.ok(lim > 0);
  });

  // ---- 8. 全文：rateLimit factory (express-rate-limit) 仍用 draft-7（不破坏老调用）----
  await test('全局 rateLimit factory 仍用 standardHeaders: draft-7', () => {
    assert.match(RATE_LIMIT_SRC, /standardHeaders:\s*['"]draft-7['"]/);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
