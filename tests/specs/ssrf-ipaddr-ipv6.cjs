// tests/specs/ssrf-ipaddr-ipv6.cjs
// 周期 3 P0-1: SSRF IP 分类精确化（替代 ipaddr.js，覆盖 IPv6 + CGNAT 等全部段）
//
// 背景：周期 2 P1-8 用正则覆盖 RFC1918/loopback/link-local；周期 3 用 net.isIP + 精确段判断
//   - IPv4: 0/8 / 127/8 / 10/8 / 172.16/12 / 192.168/16 / 169.254/16 / 100.64/10 (CGNAT) / 192.0.0/24 / 192.0.2/24 / 198.51.100/24 / 203.0.113/24 / 224/4 / 240/4
//   - IPv6: :: / ::1 / ::ffff: (mapped) / fe80::/10 (link-local) / fc00::/7 (ULA) / ff00::/8 (multicast) / 2001:db8::/32 (docs) / 64:ff9b::/96 (NAT64)
//
// 验收：
//   - classifyIp() 对每个段返回正确 kind
//   - isPrivateIp() 仅 'public' 返回 false
//   - validateBaseUrlWithDns 对 host 解析到非公网 IP 抛 400
//   - 与周期 2 老接口兼容

'use strict';

const assert = require('node:assert');
const {
  classifyIp, classifyIpv4, classifyIpv6, isPrivateIp,
  validateBaseUrlWithDns,
} = require('../../server/services/ssrf-guard');

let pass = 0;
let fail = 0;

function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

function withDnsStub(stub, fn) {
  // 临时替换 dns.lookup
  const dns = require('node:dns').promises;
  const orig = dns.lookup;
  dns.lookup = stub;
  return Promise.resolve().then(() => fn()).finally(() => { dns.lookup = orig; });
}

(async () => {
  console.log('=== ssrf-ipaddr-ipv6 ===');

  // ---- 1. classifyIpv4 各段 ----
  await test('0.0.0.0 → reserved', () => assert.strictEqual(classifyIpv4('0.0.0.0'), 'reserved'));
  await test('0.1.2.3 → reserved (0/8)', () => assert.strictEqual(classifyIpv4('0.1.2.3'), 'reserved'));
  await test('127.0.0.1 → loopback', () => assert.strictEqual(classifyIpv4('127.0.0.1'), 'loopback'));
  await test('127.99.99.99 → loopback', () => assert.strictEqual(classifyIpv4('127.99.99.99'), 'loopback'));
  await test('10.0.0.1 → private', () => assert.strictEqual(classifyIpv4('10.0.0.1'), 'private'));
  await test('172.16.0.1 → private (下界)', () => assert.strictEqual(classifyIpv4('172.16.0.1'), 'private'));
  await test('172.31.99.99 → private (上界)', () => assert.strictEqual(classifyIpv4('172.31.99.99'), 'private'));
  await test('172.15.0.1 → public (172/12 之外)', () => assert.strictEqual(classifyIpv4('172.15.0.1'), 'public'));
  await test('172.32.0.1 → public (172/12 之外)', () => assert.strictEqual(classifyIpv4('172.32.0.1'), 'public'));
  await test('192.168.1.1 → private', () => assert.strictEqual(classifyIpv4('192.168.1.1'), 'private'));
  await test('169.254.169.254 → linkLocal (AWS metadata!)', () => assert.strictEqual(classifyIpv4('169.254.169.254'), 'linkLocal'));
  await test('169.254.0.1 → linkLocal', () => assert.strictEqual(classifyIpv4('169.254.0.1'), 'linkLocal'));
  await test('100.64.0.1 → cgnat (下界)', () => assert.strictEqual(classifyIpv4('100.64.0.1'), 'cgnat'));
  await test('100.127.255.255 → cgnat (上界)', () => assert.strictEqual(classifyIpv4('100.127.255.255'), 'cgnat'));
  await test('100.63.0.1 → public (CGNAT 之外)', () => assert.strictEqual(classifyIpv4('100.63.0.1'), 'public'));
  await test('100.128.0.1 → public (CGNAT 之外)', () => assert.strictEqual(classifyIpv4('100.128.0.1'), 'public'));
  await test('192.0.2.1 → documentation', () => assert.strictEqual(classifyIpv4('192.0.2.1'), 'documentation'));
  await test('198.51.100.1 → documentation', () => assert.strictEqual(classifyIpv4('198.51.100.1'), 'documentation'));
  await test('203.0.113.1 → documentation', () => assert.strictEqual(classifyIpv4('203.0.113.1'), 'documentation'));
  await test('224.0.0.1 → multicast', () => assert.strictEqual(classifyIpv4('224.0.0.1'), 'multicast'));
  await test('239.255.255.255 → multicast', () => assert.strictEqual(classifyIpv4('239.255.255.255'), 'multicast'));
  await test('255.255.255.255 → reserved (broadcast)', () => assert.strictEqual(classifyIpv4('255.255.255.255'), 'reserved'));
  await test('8.8.8.8 → public', () => assert.strictEqual(classifyIpv4('8.8.8.8'), 'public'));
  await test('1.1.1.1 → public', () => assert.strictEqual(classifyIpv4('1.1.1.1'), 'public'));
  await test('not.an.ip → invalid', () => assert.strictEqual(classifyIpv4('not.an.ip'), 'invalid'));
  await test('999.999.999.999 → invalid', () => assert.strictEqual(classifyIpv4('999.999.999.999'), 'invalid'));

  // ---- 2. classifyIpv6 各段 ----
  await test(':: → reserved', () => assert.strictEqual(classifyIpv6('::'), 'reserved'));
  await test('::1 → loopback', () => assert.strictEqual(classifyIpv6('::1'), 'loopback'));
  await test('fe80::1 → linkLocal', () => assert.strictEqual(classifyIpv6('fe80::1'), 'linkLocal'));
  await test('febf::1 → linkLocal (fe80::/10 上界)', () => assert.strictEqual(classifyIpv6('febf::1'), 'linkLocal'));
  await test('fc00::1 → private (ULA)', () => assert.strictEqual(classifyIpv6('fc00::1'), 'private'));
  await test('fd12:3456::1 → private (ULA)', () => assert.strictEqual(classifyIpv6('fd12:3456::1'), 'private'));
  await test('ff00::1 → multicast', () => assert.strictEqual(classifyIpv6('ff00::1'), 'multicast'));
  await test('ff02::1 → multicast', () => assert.strictEqual(classifyIpv6('ff02::1'), 'multicast'));
  await test('2001:db8::1 → documentation', () => assert.strictEqual(classifyIpv6('2001:db8::1'), 'documentation'));
  await test('64:ff9b::1 → reserved (NAT64)', () => assert.strictEqual(classifyIpv6('64:ff9b::1'), 'reserved'));
  await test('::ffff:127.0.0.1 → loopback (IPv4-mapped)', () => assert.strictEqual(classifyIpv6('::ffff:127.0.0.1'), 'loopback'));
  await test('::ffff:8.8.8.8 → public (IPv4-mapped)', () => assert.strictEqual(classifyIpv6('::ffff:8.8.8.8'), 'public'));
  await test('::ffff:169.254.169.254 → linkLocal (mapped metadata)', () => assert.strictEqual(classifyIpv6('::ffff:169.254.169.254'), 'linkLocal'));
  await test('2606:4700:4700::1111 → public (Cloudflare DNS)', () => assert.strictEqual(classifyIpv6('2606:4700:4700::1111'), 'public'));
  await test('not::ipv6::garbage → invalid', () => assert.strictEqual(classifyIpv6('not::ipv6::garbage'), 'invalid'));

  // ---- 3. classifyIp 路由 ----
  await test('classifyIp IPv4 路由', () => assert.strictEqual(classifyIp('10.0.0.1'), 'private'));
  await test('classifyIp IPv6 路由', () => assert.strictEqual(classifyIp('fc00::1'), 'private'));
  await test('classifyIp null → invalid', () => assert.strictEqual(classifyIp(null), 'invalid'));
  await test('classifyIp "" → invalid', () => assert.strictEqual(classifyIp(''), 'invalid'));

  // ---- 4. isPrivateIp 接口兼容 ----
  await test('isPrivateIp("127.0.0.1") = true', () => assert.strictEqual(isPrivateIp('127.0.0.1'), true));
  await test('isPrivateIp("::1") = true', () => assert.strictEqual(isPrivateIp('::1'), true));
  await test('isPrivateIp("169.254.169.254") = true', () => assert.strictEqual(isPrivateIp('169.254.169.254'), true));
  await test('isPrivateIp("100.64.0.1") = true (CGNAT)', () => assert.strictEqual(isPrivateIp('100.64.0.1'), true));
  await test('isPrivateIp("fc00::1") = true (ULA)', () => assert.strictEqual(isPrivateIp('fc00::1'), true));
  await test('isPrivateIp("8.8.8.8") = false', () => assert.strictEqual(isPrivateIp('8.8.8.8'), false));
  await test('isPrivateIp("2606:4700:4700::1111") = false', () => assert.strictEqual(isPrivateIp('2606:4700:4700::1111'), false));
  await test('isPrivateIp(null) = true (兜底)', () => assert.strictEqual(isPrivateIp(null), true));

  // ---- 5. validateBaseUrlWithDns: host 解析到私网 IP 抛错 ----
  await withDnsStub(async () => ({ address: '127.0.0.1', family: 4 }), async () => {
    await test('validateBaseUrlWithDns("https://api.openai.com") 解析到 127.0.0.1 → throw 400', async () => {
      let threw = false;
      let status = 0;
      try {
        await validateBaseUrlWithDns('https://api.openai.com');
      } catch (e) {
        threw = true;
        status = e.status || 0;
      }
      assert.ok(threw, '应抛错');
      assert.strictEqual(status, 400, 'e.status=400');
    });
  });

  await withDnsStub(async () => ({ address: '169.254.169.254', family: 4 }), async () => {
    await test('validateBaseUrlWithDns 解析到 metadata IP → throw 400', async () => {
      let threw = false;
      try { await validateBaseUrlWithDns('https://api.openai.com'); }
      catch (_) { threw = true; }
      assert.ok(threw);
    });
  });

  await withDnsStub(async () => ({ address: '8.8.8.8', family: 4 }), async () => {
    await test('validateBaseUrlWithDns 解析到公网 → pass', async () => {
      const out = await validateBaseUrlWithDns('https://api.openai.com');
      assert.strictEqual(out, 'https://api.openai.com');
    });
  });

  await withDnsStub(async () => ({ address: '::1', family: 6 }), async () => {
    await test('validateBaseUrlWithDns 解析到 IPv6 ::1 → throw', async () => {
      let threw = false;
      try { await validateBaseUrlWithDns('https://api.openai.com'); }
      catch (_) { threw = true; }
      assert.ok(threw);
    });
  });

  // ---- 6. 白名单外主机仍然协议层拒绝 ----
  await test('validateBaseUrlWithDns("https://evil.com") → throw', async () => {
    let threw = false;
    try { await validateBaseUrlWithDns('https://evil.com'); }
    catch (_) { threw = true; }
    assert.ok(threw);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})();
