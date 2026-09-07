// tests/specs/ssrf-metadata-ipv6.cjs
// 周期 4 P0-1: 全 metadata IP 黑名单（IPv4 + IPv6）
//
// 背景：周期 3 P0-1 的 classifyIp 已拒 link-local（169.254/16）和 uniqueLocal
//   （fc00::/7）；但部分云厂商的 metadata IP 是 IPv6 私有段，分类不一定都拒
//   周期 4 显式列黑名单：169.254.169.254/32 + 169.254.170.2 + fd00:ec2::254 + metadata 主机名
//
// 验收：
//   - isMetadataIp 显式拒 169.254.169.254 / 169.254.170.2 / fd00:ec2::254
//   - isMetadataHost 显式拒 'metadata' / 'metadata.google.internal' / 'kubernetes.default.svc'
//   - validateBaseUrlWithDns 对 metadata host / metadata IP 抛 400
//   - 周期 3 老测试无回归

'use strict';

const assert = require('node:assert');
const dns = require('node:dns').promises;
const { isMetadataIp, isMetadataHost, validateBaseUrlWithDns } = require('../../server/services/ssrf-guard');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

function withDnsStub(stub, fn) {
  const orig = dns.lookup;
  dns.lookup = stub;
  return Promise.resolve().then(() => fn()).finally(() => { dns.lookup = orig; });
}

(async () => {
  console.log('=== ssrf-metadata-ipv6 ===');

  // ---- 1. isMetadataIp ----
  await test('169.254.169.254 → true（AWS/GCP/Azure IMDS）', () => assert.strictEqual(isMetadataIp('169.254.169.254'), true));
  await test('169.254.170.2 → true（AWS ECS v2）', () => assert.strictEqual(isMetadataIp('169.254.170.2'), true));
  await test('169.254.170.1 → true（AWS ECS v1）', () => assert.strictEqual(isMetadataIp('169.254.170.1'), true));
  await test('169.254.0.1 → true（部分 K8s）', () => assert.strictEqual(isMetadataIp('169.254.0.1'), true));
  await test('fd00:ec2::254 → true（AWS IPv6 IMDS）', () => assert.strictEqual(isMetadataIp('fd00:ec2::254'), true));
  await test('8.8.8.8 → false', () => assert.strictEqual(isMetadataIp('8.8.8.8'), false));
  await test('1.1.1.1 → false', () => assert.strictEqual(isMetadataIp('1.1.1.1'), false));
  await test('127.0.0.1 → false（不是 metadata）', () => assert.strictEqual(isMetadataIp('127.0.0.1'), false));
  await test('null → false（兜底）', () => assert.strictEqual(isMetadataIp(null), false));
  await test('"not-ip" → false', () => assert.strictEqual(isMetadataIp('not-ip'), false));

  // ---- 2. isMetadataHost ----
  await test('"metadata" → true', () => assert.strictEqual(isMetadataHost('metadata'), true));
  await test('"metadata.google.internal" → true', () => assert.strictEqual(isMetadataHost('metadata.google.internal'), true));
  await test('"kubernetes.default.svc" → true', () => assert.strictEqual(isMetadataHost('kubernetes.default.svc'), true));
  await test('"api.openai.com" → false', () => assert.strictEqual(isMetadataHost('api.openai.com'), false));
  await test('大写 METADATA → true', () => assert.strictEqual(isMetadataHost('METADATA'), true));
  await test('null → false', () => assert.strictEqual(isMetadataHost(null), false));

  // ---- 3. validateBaseUrlWithDns 拒 metadata host ----
  await withDnsStub(async () => ({ address: '8.8.8.8', family: 4 }), async () => {
    // 白名单 + metadata host 冲突：先看 host 校验
    await test('validateBaseUrlWithDns("https://metadata") → throw', async () => {
      let threw = false;
      try { await validateBaseUrlWithDns('https://metadata'); }
      catch (_) { threw = true; }
      assert.ok(threw);
    });
    await test('validateBaseUrlWithDns("https://metadata.google.internal") → throw', async () => {
      let threw = false;
      try { await validateBaseUrlWithDns('https://metadata.google.internal'); }
      catch (_) { threw = true; }
      assert.ok(threw);
    });
  });

  // ---- 4. validateBaseUrlWithDns 拒 metadata IP ----
  await withDnsStub(async () => ({ address: '169.254.169.254', family: 4 }), async () => {
    await test('白名单域名解析到 169.254.169.254 → throw 400', async () => {
      let threw = false;
      let status = 0;
      try {
        await validateBaseUrlWithDns('https://api.openai.com');
      } catch (e) {
        threw = true;
        status = e.status || 0;
      }
      assert.ok(threw);
      assert.strictEqual(status, 400);
    });
  });

  await withDnsStub(async () => ({ address: 'fd00:ec2::254', family: 6 }), async () => {
    await test('白名单域名解析到 fd00:ec2::254 → throw 400', async () => {
      let threw = false;
      try { await validateBaseUrlWithDns('https://api.openai.com'); }
      catch (_) { threw = true; }
      assert.ok(threw);
    });
  });

  // ---- 5. 正常路径仍 PASS ----
  await withDnsStub(async () => ({ address: '8.8.8.8', family: 4 }), async () => {
    await test('白名单域名 + 公网 IP → pass', async () => {
      const out = await validateBaseUrlWithDns('https://api.openai.com');
      assert.strictEqual(out, 'https://api.openai.com');
    });
  });

  // ---- 6. 静态扫描：源文件含新增导出 ----
  const fs = require('node:fs');
  const path = require('node:path');
  const SRC = fs.readFileSync(
    path.resolve(__dirname, '../../server/services/ssrf-guard.js'),
    'utf8',
  );
  await test('源文件含 isMetadataIp 函数', () => assert.match(SRC, /function\s+isMetadataIp\s*\(/));
  await test('源文件含 isMetadataHost 函数', () => assert.match(SRC, /function\s+isMetadataHost\s*\(/));
  await test('源文件含 fd00:ec2::254（IPv6 metadata）', () => assert.match(SRC, /fd00:ec2::254/));
  await test('源文件含 169.254.169.254', () => assert.match(SRC, /169\.254\.169\.254/));
  await test('源文件含 pinIp 字段', () => assert.match(SRC, /pinIp/));
  await test('源文件含 X-Forwarded-Pinned-IP header', () => assert.match(SRC, /X-Forwarded-Pinned-IP/));

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
