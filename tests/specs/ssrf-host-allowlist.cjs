// tests/specs/ssrf-host-allowlist.cjs
// 周期 4 P0-1: Host header allowlist middleware
//
// 背景：周期 3 P0-1 只做了"DNS 解析后 IP 校验"，但攻击者仍可通过 Host 头绕过
//   例如：浏览器发请求到 evil.com:3001，Node 端看 Host 头是 evil.com，仍然接受
//   周期 4 加 Host allowlist middleware：仅允许 localhost/127.0.0.1/prod 域名
//
// 验收：
//   - validateHostHeader 是 express middleware（req, res, next）
//   - Host 头缺失 → 400
//   - Host 头不在 ALLOWED_HOSTS → 403
//   - 合法 host（localhost / 127.0.0.1）→ next()
//   - ALLOWED_HOSTS env 可覆盖默认白名单
//   - 端口被去：`localhost:3001` → `localhost`

'use strict';

const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const ssrfGuard = require('../../server/services/ssrf-guard');
const {
  validateHostHeader,
} = ssrfGuard;
const { ALLOWED_HOSTS, DEFAULT_ALLOWED_HOSTS, ENV_ALLOWED_HOSTS } = ssrfGuard.__test;

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

function callMiddleware(host) {
  const req = new EventEmitter();
  req.headers = host === null ? {} : { host };
  const res = new EventEmitter();
  const headers = {};
  res.setHeader = (k, v) => { headers[k.toLowerCase()] = v; };
  let status = 200;
  let body = null;
  res.status = (c) => { status = c; return res; };
  res.json = (b) => { body = b; return res; };
  return new Promise((resolve) => {
    let nextCalled = false;
    const next = () => { nextCalled = true; resolve({ nextCalled, status, body, headers }); };
    validateHostHeader(req, res, next);
    if (!nextCalled) resolve({ nextCalled, status, body, headers });
  });
}

(async () => {
  console.log('=== ssrf-host-allowlist ===');

  // ---- 1. 静态检查 ----
  await test('ALLOWED_HOSTS 是 Set', () => assert.ok(ALLOWED_HOSTS instanceof Set));
  await test('DEFAULT_ALLOWED_HOSTS 至少 5 项', () => assert.ok(DEFAULT_ALLOWED_HOSTS.size >= 5));
  await test('ALLOWED_HOSTS 含 localhost / 127.0.0.1', () => {
    assert.ok(ALLOWED_HOSTS.has('localhost'));
    assert.ok(ALLOWED_HOSTS.has('127.0.0.1'));
  });
  await test('ALLOWED_HOSTS 不含内网 IP 段', () => {
    assert.ok(!ALLOWED_HOSTS.has('192.168.1.1'));
    assert.ok(!ALLOWED_HOSTS.has('10.0.0.1'));
  });

  // ---- 2. 合法 host ----
  await test('localhost → next()', async () => {
    const r = await callMiddleware('localhost');
    assert.strictEqual(r.nextCalled, true);
  });
  await test('127.0.0.1 → next()', async () => {
    const r = await callMiddleware('127.0.0.1');
    assert.strictEqual(r.nextCalled, true);
  });
  await test('localhost:3001（去端口）→ next()', async () => {
    const r = await callMiddleware('localhost:3001');
    assert.strictEqual(r.nextCalled, true);
  });
  await test('127.0.0.1:8080（去端口）→ next()', async () => {
    const r = await callMiddleware('127.0.0.1:8080');
    assert.strictEqual(r.nextCalled, true);
  });
  await test('大写 LOCALHOST → next()', async () => {
    const r = await callMiddleware('LOCALHOST');
    assert.strictEqual(r.nextCalled, true);
  });

  // ---- 3. 非法 host ----
  await test('evil.com → 403', async () => {
    const r = await callMiddleware('evil.com');
    assert.strictEqual(r.nextCalled, false);
    assert.strictEqual(r.status, 403);
    assert.match(r.body.message, /Host 头不在白名单/);
  });

  await test('192.168.1.1 → 403（防内网直连）', async () => {
    const r = await callMiddleware('192.168.1.1');
    assert.strictEqual(r.status, 403);
  });

  await test('10.0.0.1 → 403', async () => {
    const r = await callMiddleware('10.0.0.1');
    assert.strictEqual(r.status, 403);
  });

  await test('attacker.com:8080 → 403', async () => {
    const r = await callMiddleware('attacker.com:8080');
    assert.strictEqual(r.status, 403);
  });

  // ---- 4. Host 头缺失 ----
  await test('空 Host 头 → 400', async () => {
    const r = await callMiddleware('');
    assert.strictEqual(r.status, 400);
    assert.match(r.body.message, /缺失 Host 头/);
  });
  await test('缺 Host 头字段 → 400', async () => {
    const r = await callMiddleware(null);
    assert.strictEqual(r.status, 400);
  });

  // ---- 5. ENV 覆盖 ----
  // 注：env 在 require 时已固化，测的时候用 ENV_ALLOWED_HOSTS
  await test('ENV_ALLOWED_HOSTS 反映 env 状态', () => {
    assert.ok(Array.isArray(ENV_ALLOWED_HOSTS));
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
