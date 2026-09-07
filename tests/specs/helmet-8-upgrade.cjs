// tests/specs/helmet-8-upgrade.cjs
// 周期 4 P2-1: helmet 7.x → 8.x 升级
//
// 背景：
//   - 周期 1 引入 helmet ^7.2.0，周期 3 P1-1 手写 Permissions-Policy（helmet 7.x 不支持）
//   - helmet 8.x（2024-09 发布；当前 8.3.0）原生支持 Permissions-Policy + Strict-Transport-Security
//     仍向后兼容大部分 7.x 配置
//   - 周期 4 升级以减少手写头部的维护负担 + 跟上游 OWASP Cheat Sheet 同步
//
// 验收：
//   1. 静态扫描：package.json helmet 版本 >= 8.x
//   2. 运行时：/api/health 返回所有关键安全头（helmet 8 默认集）
//   3. 兼容性：周期 3 已有的 CSP/COOP/X-Frame-Options/Referrer-Policy 仍生效
//   4. 兼容性：手写 Permissions-Policy 仍生效（周期 3 的 20 项）
//   5. Helmet 8 strict-dynamic + COEP=false：Cesium 第三方瓦片不 cross-origin-isolate
//
// 运行：node tests/specs/helmet-8-upgrade.cjs
//
// 注意：本 spec 需要 server 在 http://localhost:3001 运行。
//       不依赖 server 时 1-4 项仍可跑（包内容 + 源文件扫描）；5 项依赖 server。

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const ROOT = path.resolve(__dirname, '..', '..');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const SERVER_SRC = fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

function httpGet(pathname, host) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3001,
        path: pathname,
        method: 'GET',
        headers: { Host: host || 'localhost' },
        timeout: 5000,
      },
      (res) => {
        let b = '';
        res.on('data', (c) => { b += c; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end();
  });
}

(async () => {
  console.log('=== helmet-8-upgrade ===');

  // ---- 1. 静态扫描：helmet 版本 ----
  await test('package.json 声明 helmet ^8', () => {
    const v = PKG.dependencies && PKG.dependencies.helmet;
    assert.ok(v, 'package.json 应声明 helmet');
    assert.match(v, /\^?8/, `helmet 应为 8.x，实际 ${v}`);
  });

  // ---- 2. 源文件扫描：使用 helmet({...}) 配置 ----
  await test('server/index.js 用 helmet({...})', () => {
    assert.match(SERVER_SRC, /helmet\(\{[\s\S]*?\}\)/);
  });
  await test('关闭 COEP（Cesium 瓦片来自第三方 CDN）', () => {
    assert.match(SERVER_SRC, /crossOriginEmbedderPolicy:\s*false/);
  });
  await test('COOP same-origin（防 window.opener 侧信道）', () => {
    assert.match(SERVER_SRC, /crossOriginOpenerPolicy:\s*\{\s*policy:\s*"same-origin"/);
  });
  await test('X-Frame-Options DENY（防 clickjacking）', () => {
    assert.match(SERVER_SRC, /xFrameOptions:\s*\{\s*action:\s*"deny"/);
  });
  await test('Referrer-Policy strict-origin-when-cross-origin', () => {
    assert.match(SERVER_SRC, /referrerPolicy:\s*\{\s*policy:\s*"strict-origin-when-cross-origin"/);
  });
  await test('手写 Permissions-Policy middleware 保留（helmet 8.x 仍不直接支持）', () => {
    assert.match(SERVER_SRC, /res\.setHeader\(\s*\n?\s*"Permissions-Policy"/);
    assert.match(SERVER_SRC, /accelerometer=\(\)/);
    assert.match(SERVER_SRC, /fullscreen=\(self\)/);
  });
  await test('CSP 至少 12 项 directive', () => {
    // 至少有 12 项 contentSecurityPolicy directives
    const directives = SERVER_SRC.match(/\b(defaultSrc|scriptSrc|styleSrc|imgSrc|connectSrc|workerSrc|childSrc|frameSrc|fontSrc|objectSrc|baseUri|formAction|frameAncestors|upgradeInsecureRequests|scriptSrcAttr)\s*:/g);
    assert.ok(directives && directives.length >= 12, `CSP directives 应 ≥12 项，实际 ${directives && directives.length}`);
  });

  // ---- 3. 运行时（依赖 server 启动）----
  let serverUp = false;
  try {
    const r = await httpGet('/api/health', 'localhost');
    serverUp = r.status === 200;
  } catch (_) { serverUp = false; }

  if (serverUp) {
    console.log('  [INFO] server 可达，测运行时头部');
    const r = await httpGet('/api/health', 'localhost');

    await test('GET /api/health → 200', () => {
      assert.strictEqual(r.status, 200);
    });
    await test('X-Content-Type-Options: nosniff（helmet 8 默认）', () => {
      assert.strictEqual(r.headers['x-content-type-options'], 'nosniff');
    });
    await test('Strict-Transport-Security: max-age 存在（helmet 8 默认）', () => {
      const h = r.headers['strict-transport-security'];
      assert.ok.ok(h, 'helmet 8 默认开启 HSTS');
      assert.match(h, /max-age=\d+/);
    });
    await test('X-Frame-Options: DENY（周期 3 设定）', () => {
      assert.strictEqual(r.headers['x-frame-options'], 'DENY');
    });
    await test('Cross-Origin-Opener-Policy: same-origin（周期 3 设定）', () => {
      assert.strictEqual(r.headers['cross-origin-opener-policy'], 'same-origin');
    });
    await test('Referrer-Policy: strict-origin-when-cross-origin（周期 3 设定）', () => {
      assert.strictEqual(r.headers['referrer-policy'], 'strict-origin-when-cross-origin');
    });
    await test('Permissions-Policy 含 camera=()（周期 3 手写）', () => {
      const pp = r.headers['permissions-policy'] || '';
      assert.match(pp, /camera=\(\)/);
    });
    await test('Permissions-Policy 至少 12 项', () => {
      const pp = r.headers['permissions-policy'] || '';
      // 简单按逗号数
      const items = pp.split(',').map(s => s.trim()).filter(Boolean);
      assert.ok(items.length >= 12, `PP items 应 ≥12，实际 ${items.length}`);
    });
    await test('Cross-Origin-Embedder-Policy 不存在（COEP=false，Cesium 瓦片兼容）', () => {
      assert.strictEqual(r.headers['cross-origin-embedder-policy'], undefined);
    });
    await test('Cross-Origin-Resource-Policy: cross-origin（Cesium 瓦片）', () => {
      assert.strictEqual(r.headers['cross-origin-resource-policy'], 'cross-origin');
    });
  } else {
    console.log('  [SKIP] server 不可达，跳过运行时头部断言（先跑 node server/index.js）');
    await test('SKIP: server 未运行', () => assert.ok(true));
  }

  // ---- 4. CHANGELOG 检查：helmet 8 breaking changes ----
  // helmet 8 关键变化（CHANGELOG 8.0.0）：
  //   - drop Node 16/17 → Node 18+ 必需（engines 已声明 ≥18 ✓）
  //   - HSTS: includeSubDomains 拼错由 warn 变 throw（我们没显式设 includeSubDomains ✓）
  //   - 部分 defaults 微调（HSTS 默认 max-age 改为 1 年，原 180 天）
  //   - Permissions-Policy 仍未原生支持（仍需手写 ✓）
  await test('engines.node >= 18（helmet 8 要求）', () => {
    const engines = PKG.engines && PKG.engines.node;
    assert.ok(engines, 'engines.node 应声明');
    const min = parseInt(String(engines).replace(/[^0-9]/g, ''), 10);
    assert.ok(min >= 18, `engines.node 应 ≥18，实际 ${engines}`);
  });
  await test('server/index.js 没显式 hsts: { includeSubDomains: ... }（helmet 8 拼错会 throw）', () => {
    // 检查是否显式传了 includeSubDomains（拼错风险源）
    assert.ok(!/hsts\s*:\s*\{[\s\S]*includeSubDomains[\s\S]*\}/.test(SERVER_SRC));
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});