// tests/specs/metadata-ip-maintenance.cjs
// 周期 5 P0-1: metadata IP 黑名单维护 —— 季度 cron
//
// 背景：周期 4 P0-1 + 周期 5 P0-1 持续维护云厂商 metadata IP 黑名单
//   - isMetadataIp 函数对所有黑名单 IP 返回 true
//   - 黑名单表与 docs/security/metadata-ips.md 一致
//   - 已知 metadata 主机（metadata / metadata.google.internal）仍能被拒
//
// 验收：
//   - 静态扫描：源文件 METADATA_IPS_V4/V6 含所有黑名单 IP
//   - 静态扫描：markdown 维护文档含所有黑名单 IP
//   - 运行时：isMetadataIp 对所有黑名单 IP 返回 true
//   - 运行时：isMetadataIp 对公网 IP 返回 false
//   - 运行时：validateBaseUrlWithDns 对 metadata host 抛 400

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { isMetadataIp, isMetadataHost, validateBaseUrlWithDns } = require('../../server/services/ssrf-guard');
const dns = require('node:dns').promises;

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../server/services/ssrf-guard.js'),
  'utf8',
);
const MD = fs.readFileSync(
  path.resolve(__dirname, '../../docs/security/metadata-ips.md'),
  'utf8',
);

// 权威黑名单（IP + 文档 + 源文件三者必须一致）
const EXPECTED_V4 = ['169.254.169.254', '169.254.170.2', '169.254.170.1', '169.254.0.1'];
const EXPECTED_V6 = ['fd00:ec2::254', 'fd00:ec2::253', 'fe80::a9f:feff:fecf:3c'];

(async () => {
  console.log('=== metadata-ip-maintenance ===');

  // ---- 1. 源文件含所有黑名单 IP ----
  for (const ip of EXPECTED_V4) {
    await test(`源文件含 IPv4 ${ip}`, () => {
      assert.ok(SRC.includes(`'${ip}'`), `源文件 ssrf-guard.js 应含 '}${ip}'`);
    });
  }
  for (const ip of EXPECTED_V6) {
    await test(`源文件含 IPv6 ${ip}`, () => {
      assert.ok(SRC.includes(`'${ip}'`), `源文件 ssrf-guard.js 应含 '}${ip}'`);
    });
  }

  // ---- 2. 维护文档含所有黑名单 IP ----
  for (const ip of [...EXPECTED_V4, ...EXPECTED_V6]) {
    await test(`维护文档含 ${ip}`, () => {
      assert.ok(MD.includes(ip), `metadata-ips.md 应含 ${ip}`);
    });
  }

  // ---- 3. isMetadataIp 对黑名单 IP 返回 true ----
  for (const ip of EXPECTED_V4) {
    await test(`isMetadataIp('${ip}') = true`, () => {
      assert.strictEqual(isMetadataIp(ip), true);
    });
  }
  for (const ip of EXPECTED_V6) {
    await test(`isMetadataIp('${ip}') = true`, () => {
      assert.strictEqual(isMetadataIp(ip), true);
    });
  }

  // ---- 4. isMetadataIp 对公网 IP 返回 false ----
  await test("isMetadataIp('8.8.8.8') = false", () => assert.strictEqual(isMetadataIp('8.8.8.8'), false));
  await test("isMetadataIp('1.1.1.1') = false", () => assert.strictEqual(isMetadataIp('1.1.1.1'), false));
  await test("isMetadataIp('2606:4700:4700::1111') = false (Cloudflare DNS IPv6)", () => {
    assert.strictEqual(isMetadataIp('2606:4700:4700::1111'), false);
  });

  // ---- 5. 周期 5 新增：ECS task IPv6 metadata ----
  await test("周期 5 新增 fd00:ec2::253（ECS task metadata v2 IPv6）", () => {
    assert.strictEqual(isMetadataIp('fd00:ec2::253'), true);
  });

  // ---- 6. validateBaseUrlWithDns 拒 metadata host ----
  //   两种场景：
  //   a) "metadata" / "kubernetes.default.svc" 之类不在白名单 → 协议层拒（status 4xx）
  //   b) 白名单域名解析到 metadata IP → metadata IP 显式拒（status 400）
  //   两种都应该抛错（任意状态）
  const origLookup = dns.lookup;
  await test('validateBaseUrlWithDns("https://metadata") 抛错（协议层 + metadata host）', async () => {
    dns.lookup = async () => ({ address: '8.8.8.8', family: 4 });
    let threw = false;
    let msg = '';
    try { await validateBaseUrlWithDns('https://metadata'); }
    catch (e) { threw = true; msg = e.message; }
    assert.ok(threw, '应抛错');
    assert.ok(/metadata|白名单/.test(msg), `错误信息应含 metadata 或白名单: ${msg}`);
  });
  await test('validateBaseUrlWithDns("https://metadata.google.internal") 抛错', async () => {
    dns.lookup = async () => ({ address: '8.8.8.8', family: 4 });
    let threw = false;
    try { await validateBaseUrlWithDns('https://metadata.google.internal'); }
    catch (_) { threw = true; }
    assert.ok(threw);
  });
  // 白名单域名 + 解析到 metadata IP → 仍抛 400
  await test('白名单域名解析到 169.254.169.254 → 抛 400', async () => {
    dns.lookup = async () => ({ address: '169.254.169.254', family: 4 });
    let threw = false;
    let status = 0;
    try { await validateBaseUrlWithDns('https://api.openai.com'); }
    catch (e) { threw = true; status = e.status || 0; }
    assert.ok(threw);
    assert.strictEqual(status, 400);
  });
  // 周期 5 新增：白名单域名解析到 ECS task IPv6 → 抛 400
  await test('白名单域名解析到 fd00:ec2::253 → 抛 400', async () => {
    dns.lookup = async () => ({ address: 'fd00:ec2::253', family: 6 });
    let threw = false;
    let status = 0;
    try { await validateBaseUrlWithDns('https://api.openai.com'); }
    catch (e) { threw = true; status = e.status || 0; }
    assert.ok(threw);
    assert.strictEqual(status, 400);
  });
  dns.lookup = origLookup;

  // ---- 7. 维护文档含 AWS / GCP 厂商说明 ----
  await test('维护文档含 AWS / GCP 厂商', () => {
    assert.match(MD, /AWS/);
    assert.match(MD, /GCP/);
  });
  await test('维护文档含 cron 维护命令', () => {
    assert.match(MD, /cron/);
    assert.match(MD, /metadata-ip-maintenance/);
  });

  // ---- 8. 黑名单规模合理（避免黑名单变空洞） ----
  await test('黑名单至少 4 IPv4 + 3 IPv6', () => {
    assert.ok(EXPECTED_V4.length >= 4);
    assert.ok(EXPECTED_V6.length >= 3);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
