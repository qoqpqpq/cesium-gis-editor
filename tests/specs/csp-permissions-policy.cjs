// tests/specs/csp-permissions-policy.cjs
// 周期 3 P1-1: CSP 全面审计 —— Permissions-Policy / COOP / Referrer-Policy / X-Frame-Options
//
// 背景：周期 1/2 只补了 CSP connect-src localhost；周期 3 对照 OWASP HTTP Headers Cheat Sheet
//   把缺的 4 项 header 补齐：Permissions-Policy + COOP + Referrer-Policy + X-Frame-Options
//
// 验收（不依赖 express 启动）：
//   - 静态扫描 server/index.js 确认新 header 配置存在
//   - 用 helmet + Permissions-Policy middleware 启个 in-memory express
//     测每个 header 实际生效

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const helmet = require('helmet');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../server/index.js'),
  'utf8',
);

// ---- 1. 静态扫描：4 项 header 配置都在源文件里 ----
const staticChecks = [
  ['Permissions-Policy 头', /res\.setHeader\(\s*['"]Permissions-Policy['"]/.test(SRC)],
  ['camera=() 限制', /camera=\(\)/.test(SRC)],
  ['geolocation=() 限制', /geolocation=\(\)/.test(SRC)],
  ['microphone=() 限制', /microphone=\(\)/.test(SRC)],
  ['payment=() 限制', /payment=\(\)/.test(SRC)],
  ['COOP same-origin', /crossOriginOpenerPolicy:\s*\{\s*policy:\s*['"]same-origin['"]/.test(SRC)],
  ['X-Frame-Options DENY', /xFrameOptions:\s*\{\s*action:\s*['"]deny['"]/.test(SRC)],
  ['Referrer-Policy strict-origin-when-cross-origin', /referrerPolicy:\s*\{\s*policy:\s*['"]strict-origin-when-cross-origin['"]/.test(SRC)],
];

(async () => {
  console.log('=== csp-permissions-policy ===');

  for (const [name, ok] of staticChecks) {
    await test(name, () => assert.ok(ok));
  }

  // ---- 2. 启 in-memory express，验证 helmet + 手写 middleware 输出 ----
  const app = express();
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      xFrameOptions: { action: 'deny' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use((req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      [
        'camera=()',
        'geolocation=()',
        'microphone=()',
        'payment=()',
        'usb=()',
        'fullscreen=(self)',
      ].join(', '),
    );
    next();
  });
  app.get('/test', (req, res) => res.json({ ok: true }));

  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;

  function get(path) {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}${path}`, (res) => {
        resolve(res);
      }).on('error', reject);
    });
  }

  await test('X-Frame-Options: DENY', async () => {
    const r = await get('/test');
    assert.strictEqual(r.headers['x-frame-options'], 'DENY');
  });

  await test('Referrer-Policy: strict-origin-when-cross-origin', async () => {
    const r = await get('/test');
    assert.strictEqual(r.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  });

  await test('Cross-Origin-Opener-Policy: same-origin', async () => {
    const r = await get('/test');
    assert.strictEqual(r.headers['cross-origin-opener-policy'], 'same-origin');
  });

  await test('Cross-Origin-Resource-Policy: cross-origin', async () => {
    const r = await get('/test');
    assert.strictEqual(r.headers['cross-origin-resource-policy'], 'cross-origin');
  });

  await test('Permissions-Policy 含 camera=()', async () => {
    const r = await get('/test');
    assert.match(r.headers['permissions-policy'], /camera=\(\)/);
    assert.match(r.headers['permissions-policy'], /geolocation=\(\)/);
    assert.match(r.headers['permissions-policy'], /microphone=\(\)/);
    assert.match(r.headers['permissions-policy'], /payment=\(\)/);
    assert.match(r.headers['permissions-policy'], /fullscreen=\(self\)/);
  });

  await test('Permissions-Policy 不含 cross-origin-isolated', async () => {
    const r = await get('/test');
    // COEP false → cross-origin-isolated 不应被限制
    // （本 middleware 没列出来）
    assert.doesNotMatch(r.headers['permissions-policy'], /cross-origin-isolated=/);
  });

  await test('Cross-Origin-Embedder-Policy 应不存在（COEP=false）', async () => {
    const r = await get('/test');
    assert.strictEqual(r.headers['cross-origin-embedder-policy'], undefined);
  });

  // ---- 3. 源文件 Permissions-Policy 至少 10 项关键 API ----
  await test('Permissions-Policy 至少 10 项（源文件）', async () => {
    // 从源码里统计 `"xxx=()"` 数量
    const matches = SRC.match(/['"][a-z-]+=\(\)|['"][a-z-]+=\(self\)['"]/g) || [];
    assert.ok(matches.length >= 10, `源文件实际 ${matches.length} 项`);
  });

  srv.close();

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
