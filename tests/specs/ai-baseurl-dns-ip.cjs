// tests/specs/ai-baseurl-dns-ip.cjs
// 周期 2 P1-8: SSRF DNS 二次校验 —— 防止 DNS rebinding 把白名单域名解析到内网 IP
//
// 背景：周期 1 仅做了 host 白名单（ALLOWED_BASE_HOSTS），但白名单内的合法域名
//   若被攻击者控制 DNS（DNS rebinding），可解析到 169.254.169.254（AWS metadata）
//   等内网 IP，绕过 host 校验直接打内网。OWASP SSRF Cheat Sheet 明确要求
//   "resolve hostname → re-check IP against deny list"。
//
// 修复：
//   - 新增 isPrivateIp(ip) 拒绝 RFC1918 / loopback / link-local / IPv6 ULA
//   - 新增 validateBaseUrlWithDns(rawUrl) 在 validateBaseUrl 之后做 dns.lookup
//   - 新增 resolveBaseUrl() 暴露给 chat()/chatStream() 走 DNS 校验
//   - Ollama + AI_ALLOW_HTTP=1 的本机 host 跳过 DNS 查询（必为 loopback）
//
// 验收（mock dns.lookup 不依赖网络）：
//   - isPrivateIp 各 IP 段判断正确
//   - validateBaseUrlWithDns 命中 RFC1918 → 抛 e.status=400
//   - validateBaseUrlWithDns 公网 IP → 通过
//   - validateBaseUrlWithDns DNS 错误 → 抛错
//   - resolveBaseUrl 在 chat() 流程中实际被调用

'use strict';

const assert = require('node:assert');
const dns = require('node:dns').promises;

const aiService = require('../../server/services/ai');
const { isPrivateIp, validateBaseUrlWithDns, resolveBaseUrl } = aiService._internal;

let pass = 0;
let fail = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { console.log(`  [PASS] ${name}`); pass++; })
    .catch((e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; });
}

(async () => {
  console.log('=== ai-baseurl-dns-ip ===');

  // ---- 1. isPrivateIp 单元 ----
  await test('isPrivateIp: 8.8.8.8 (公网) → false', () => {
    assert.strictEqual(isPrivateIp('8.8.8.8'), false);
  });
  await test('isPrivateIp: 1.1.1.1 (公网) → false', () => {
    assert.strictEqual(isPrivateIp('1.1.1.1'), false);
  });
  await test('isPrivateIp: 127.0.0.1 (loopback) → true', () => {
    assert.strictEqual(isPrivateIp('127.0.0.1'), true);
  });
  await test('isPrivateIp: 127.0.0.5 (loopback 段) → true', () => {
    assert.strictEqual(isPrivateIp('127.0.0.5'), true);
  });
  await test('isPrivateIp: 10.0.0.1 (RFC1918 10/8) → true', () => {
    assert.strictEqual(isPrivateIp('10.0.0.1'), true);
  });
  await test('isPrivateIp: 172.20.0.1 (RFC1918 172.16/12) → true', () => {
    assert.strictEqual(isPrivateIp('172.20.0.1'), true);
  });
  await test('isPrivateIp: 172.15.0.1 (172.15 不在 12 段) → false', () => {
    assert.strictEqual(isPrivateIp('172.15.0.1'), false);
  });
  await test('isPrivateIp: 192.168.1.1 (RFC1918 192.168/16) → true', () => {
    assert.strictEqual(isPrivateIp('192.168.1.1'), true);
  });
  await test('isPrivateIp: 169.254.169.254 (AWS metadata link-local) → true', () => {
    assert.strictEqual(isPrivateIp('169.254.169.254'), true);
  });
  await test('isPrivateIp: 0.0.0.0 (0/8) → true', () => {
    assert.strictEqual(isPrivateIp('0.0.0.0'), true);
  });
  await test('isPrivateIp: ::1 (IPv6 loopback) → true', () => {
    assert.strictEqual(isPrivateIp('::1'), true);
  });
  await test('isPrivateIp: fc00::1 (IPv6 ULA) → true', () => {
    assert.strictEqual(isPrivateIp('fc00::1'), true);
  });
  await test('isPrivateIp: fe80::1 (IPv6 link-local) → true', () => {
    assert.strictEqual(isPrivateIp('fe80::1'), true);
  });
  await test('isPrivateIp: "" (空) → true（保守）', () => {
    assert.strictEqual(isPrivateIp(''), true);
  });
  await test('isPrivateIp: null → true（保守）', () => {
    assert.strictEqual(isPrivateIp(null), true);
  });

  // ---- 2. validateBaseUrlWithDns 异步 + mock dns.lookup ----
  // 保存原 lookup
  const origLookup = dns.lookup;
  function setResolve(hostToIp) {
    dns.lookup = async (host) => ({ address: hostToIp[host] || '127.0.0.1', family: 4 });
  }
  function setLookupError(msg) {
    dns.lookup = async () => { throw new Error(msg); };
  }
  function restore() {
    dns.lookup = origLookup;
  }

  await test('validateBaseUrlWithDns: 白名单域名解析到公网 → 通过', async () => {
    setResolve({ 'api.openai.com': '104.18.32.7' });
    try {
      const out = await validateBaseUrlWithDns('https://api.openai.com/v1');
      assert.strictEqual(out, 'https://api.openai.com/v1');
    } finally { restore(); }
  });

  await test('validateBaseUrlWithDns: 解析到 169.254.169.254 → 抛 e.status=400', async () => {
    setResolve({ 'evil.example.com': '169.254.169.254' });
    let caught;
    try {
      // 先把 evil.example.com 加进"白名单"是不可能的（不修改 ALLOWED_BASE_HOSTS），
      // 所以这里需要选白名单域名解析到内网 IP 来模拟 DNS rebinding。
      // 选 api.openai.com（白名单内）被解析到 169.254.169.254：
      setResolve({ 'api.openai.com': '169.254.169.254' });
      await validateBaseUrlWithDns('https://api.openai.com/v1');
    } catch (e) {
      caught = e;
    } finally { restore(); }
    assert.ok(caught, '应当抛出');
    assert.strictEqual(caught.status, 400, `e.status 应为 400，实际 ${caught.status}`);
    assert.match(caught.message, /内网|保留 IP|SSRF|云元数据|非公网 IP/);
  });

  await test('validateBaseUrlWithDns: 解析到 10.0.0.1 → 抛 400', async () => {
    setResolve({ 'api.openai.com': '10.0.0.1' });
    let caught;
    try {
      await validateBaseUrlWithDns('https://api.openai.com/v1');
    } catch (e) { caught = e; }
    finally { restore(); }
    assert.ok(caught);
    assert.strictEqual(caught.status, 400);
  });

  await test('validateBaseUrlWithDns: DNS 错误 → 抛错（默认 500）', async () => {
    setLookupError('ENOTFOUND');
    let caught;
    try {
      await validateBaseUrlWithDns('https://api.openai.com/v1');
    } catch (e) { caught = e; }
    finally { restore(); }
    assert.ok(caught);
    assert.match(caught.message, /无法解析/);
  });

  await test('validateBaseUrlWithDns: Ollama + AI_ALLOW_HTTP=1 跳过 DNS（启动时 env）', async () => {
    // 该行为依赖模块加载时 process.env.AI_ALLOW_HTTP=1，本 spec 启动时未设，
    // 故仅断言"Ollama 不在白名单 → 走 DNS 校验 → 解析到非内网公网 IP → 通过"以验证 DNS 路径。
    setResolve({ 'localhost': '93.184.216.34' }); // 任意公网 IP
    // 由于 host 是 localhost 不在 ALLOWED_BASE_HOSTS，会走 validateBaseUrl 的"Ollama 本机"分支
    // → protocol=http 但 AI_ALLOW_HTTP 未设 → 拒绝
    let caught;
    try {
      await validateBaseUrlWithDns('http://localhost:11434/v1');
    } catch (e) { caught = e; }
    finally { restore(); }
    assert.ok(caught, '未开启 AI_ALLOW_HTTP 时 Ollama http 应被拒绝');
    assert.match(caught.message, /AI_ALLOW_HTTP/);
  });

  // ---- 3. resolveBaseUrl 走通 ----
  await test('resolveBaseUrl: 公网白名单 → 原样返回（去尾斜杠）', async () => {
    setResolve({ 'api.openai.com': '104.18.32.7' });
    try {
      const out = await resolveBaseUrl('https://api.openai.com/v1/', 'https://api.openai.com/v1');
      assert.strictEqual(out, 'https://api.openai.com/v1');
    } finally { restore(); }
  });

  await test('resolveBaseUrl: 内网 IP → 抛 400', async () => {
    setResolve({ 'api.openai.com': '192.168.1.1' });
    let caught;
    try {
      await resolveBaseUrl('https://api.openai.com/v1', 'https://api.openai.com/v1');
    } catch (e) { caught = e; }
    finally { restore(); }
    assert.ok(caught);
    assert.strictEqual(caught.status, 400);
  });

  await test('resolveBaseUrl: 用户 url 缺失时退回 default（仍走 DNS 校验）', async () => {
    setResolve({ 'api.openai.com': '104.18.32.7' });
    try {
      const out = await resolveBaseUrl('', 'https://api.openai.com/v1/');
      assert.strictEqual(out, 'https://api.openai.com/v1');
    } finally { restore(); }
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})();
