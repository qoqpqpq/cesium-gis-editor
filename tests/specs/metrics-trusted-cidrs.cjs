// tests/specs/metrics-trusted-cidrs.cjs
// 周期 8 P1-4: METRICS_TRUSTED_CIDRS 放宽 metrics 端点 IP 校验（RFC1918 + 共享 loopback）
//
// 背景：
//   - 周期 6 P1-1: metrics 端点 localhost-only
//   - 周期 8 P1-4: docker / k8s / 内网部署常用 10.0.0.0/8 等；通过 env 加白名单
//   - 默认仍仅 localhost；CIDR 留空时不放行任何外部 IP
//
// 验收：
//   1. 静态扫描：metrics.js 导出 isMetricsTrusted / matchIpv4Cidr / ipv4ToInt / parseTrustedCidrs
//   2. 静态扫描：metrics.js 含 METRICS_TRUSTED_CIDRS 环境变量读取
//   3. 行为：localhost（127.0.0.1 / ::1 / ::ffff:127.0.0.1）始终放行
//   4. 行为：未设 METRICS_TRUSTED_CIDRS → 外部 IP 拒绝 403
//   5. 行为：设 METRICS_TRUSTED_CIDRS=10.0.0.0/8 → 10.x.x.x 放行
//   6. 行为：多 CIDR（10.0.0.0/8,172.16.0.0/12,192.168.0.0/16）三段都生效
//   7. 行为：CIDR 边界（192.168.0.0/16 不匹配 192.169.0.0）
//   8. 行为：metricsHandler / metricsOtlpHandler 复用 isMetricsTrusted
//   9. 行为：非法 CIDR（不合法 IP / 位数越界）跳过不报错
//   10. 行为：metrics OTel spec 端到端默认仍 PASS（metrics_handler localhost 走通）

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {
  isMetricsTrusted,
  getTrustedCidrs,
  parseTrustedCidrs,
  matchIpv4Cidr,
  ipv4ToInt,
  metricsHandler,
  metricsOtlpHandler,
  _resetTrustedCidrsCache,
} = require('../../server/middleware/metrics');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

const METRICS_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../server/middleware/metrics.js'),
  'utf8',
);

(async () => {
  console.log('=== metrics-trusted-cidrs ===');

  // ---- 1. 静态扫描 ----
  await test('metrics.js 导出 isMetricsTrusted / matchIpv4Cidr / ipv4ToInt / parseTrustedCidrs', () => {
    assert.match(METRICS_SRC, /function\s+isMetricsTrusted/);
    assert.match(METRICS_SRC, /function\s+matchIpv4Cidr/);
    assert.match(METRICS_SRC, /function\s+ipv4ToInt/);
    assert.match(METRICS_SRC, /function\s+parseTrustedCidrs/);
  });
  await test('metrics.js 含 METRICS_TRUSTED_CIDRS 环境变量读取', () => {
    assert.match(METRICS_SRC, /METRICS_TRUSTED_CIDRS/);
  });
  await test('metrics.js metricsHandler 改用 isMetricsTrusted', () => {
    assert.match(METRICS_SRC, /function\s+metricsHandler[\s\S]*?isMetricsTrusted[\s\S]*?status\(403\)/);
  });
  await test('metrics.js metricsOtlpHandler 改用 isMetricsTrusted', () => {
    assert.match(METRICS_SRC, /function\s+metricsOtlpHandler[\s\S]*?isMetricsTrusted[\s\S]*?status\(403\)/);
  });

  // ---- 2. 行为：localhost 始终放行 ----
  await test('localhost（127.0.0.1）始终放行（无需配置 CIDR）', () => {
    _resetTrustedCidrsCache();
    delete process.env.METRICS_TRUSTED_CIDRS;
    assert.strictEqual(isMetricsTrusted('127.0.0.1'), true);
  });
  await test('localhost（::1）始终放行', () => {
    assert.strictEqual(isMetricsTrusted('::1'), true);
  });
  await test('localhost（::ffff:127.0.0.1）IPv4-mapped IPv6 放行', () => {
    assert.strictEqual(isMetricsTrusted('::ffff:127.0.0.1'), true);
  });

  // ---- 3. 行为：未配置 CIDR → 外部拒绝 ----
  await test('未设 METRICS_TRUSTED_CIDRS → 外部 IP 拒绝', () => {
    _resetTrustedCidrsCache();
    delete process.env.METRICS_TRUSTED_CIDRS;
    assert.strictEqual(isMetricsTrusted('8.8.8.8'), false);
    assert.strictEqual(isMetricsTrusted('10.0.0.1'), false);
    assert.strictEqual(isMetricsTrusted('192.168.1.1'), false);
  });

  // ---- 4. 行为：配 10.0.0.0/8 → 10.x.x.x 放行 ----
  await test('METRICS_TRUSTED_CIDRS=10.0.0.0/8 → 10.x.x.x 放行', () => {
    _resetTrustedCidrsCache();
    process.env.METRICS_TRUSTED_CIDRS = '10.0.0.0/8';
    assert.strictEqual(isMetricsTrusted('10.0.0.1'), true);
    assert.strictEqual(isMetricsTrusted('10.255.255.254'), true);
    assert.strictEqual(isMetricsTrusted('11.0.0.1'), false);
    assert.strictEqual(isMetricsTrusted('8.8.8.8'), false);
  });

  // ---- 5. 行为：多 CIDR 生效 ----
  await test('多 CIDR（10.0.0.0/8,172.16.0.0/12,192.168.0.0/16）三段都生效', () => {
    _resetTrustedCidrsCache();
    process.env.METRICS_TRUSTED_CIDRS = '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16';
    assert.strictEqual(isMetricsTrusted('10.1.2.3'), true, '10.x 应放行');
    assert.strictEqual(isMetricsTrusted('172.16.5.4'), true, '172.16.x 应放行');
    assert.strictEqual(isMetricsTrusted('172.31.255.254'), true, '172.31.x 应放行');
    assert.strictEqual(isMetricsTrusted('192.168.1.1'), true, '192.168.x 应放行');
    assert.strictEqual(isMetricsTrusted('172.32.0.1'), false, '172.32.x 应拒绝（不在 172.16.0.0/12 内）');
    assert.strictEqual(isMetricsTrusted('8.8.8.8'), false);
  });

  // ---- 6. 行为：CIDR 边界 ----
  await test('CIDR 边界正确（192.168.0.0/16 不匹配 192.169.0.0）', () => {
    _resetTrustedCidrsCache();
    process.env.METRICS_TRUSTED_CIDRS = '192.168.0.0/16';
    assert.strictEqual(isMetricsTrusted('192.168.0.0'), true);
    assert.strictEqual(isMetricsTrusted('192.168.255.255'), true);
    assert.strictEqual(isMetricsTrusted('192.169.0.0'), false);
    assert.strictEqual(isMetricsTrusted('192.167.0.0'), false);
  });

  await test('CIDR /24 边界（10.0.0.0/24 只匹配 10.0.0.x）', () => {
    _resetTrustedCidrsCache();
    process.env.METRICS_TRUSTED_CIDRS = '10.0.0.0/24';
    assert.strictEqual(isMetricsTrusted('10.0.0.1'), true);
    assert.strictEqual(isMetricsTrusted('10.0.0.255'), true);
    assert.strictEqual(isMetricsTrusted('10.0.1.0'), false);
  });

  await test('CIDR /0 匹配所有 IPv4（极端情况）', () => {
    _resetTrustedCidrsCache();
    process.env.METRICS_TRUSTED_CIDRS = '0.0.0.0/0';
    assert.strictEqual(isMetricsTrusted('8.8.8.8'), true);
    assert.strictEqual(isMetricsTrusted('1.2.3.4'), true);
  });

  // ---- 7. 行为：metricsHandler / metricsOtlpHandler 复用 ----
  await test('metricsHandler 拒绝非 trusted IP（默认配置）', () => {
    _resetTrustedCidrsCache();
    delete process.env.METRICS_TRUSTED_CIDRS;
    const req = { ip: '8.8.8.8', socket: { remoteAddress: '8.8.8.8' } };
    let statusCode = 200;
    const res = {
      setHeader: () => {},
      status(code) { statusCode = code; return res; },
      json: () => res,
      send: () => res,
    };
    metricsHandler(req, res);
    assert.strictEqual(statusCode, 403);
  });

  await test('metricsHandler 放行 trusted CIDR 内 IP', () => {
    _resetTrustedCidrsCache();
    process.env.METRICS_TRUSTED_CIDRS = '10.0.0.0/8';
    const req = { ip: '10.0.0.5', socket: { remoteAddress: '10.0.0.5' } };
    let statusCode = 200;
    const res = {
      setHeader: () => {},
      status(code) { statusCode = code; return res; },
      json: () => res,
      send: () => res,
    };
    metricsHandler(req, res);
    assert.strictEqual(statusCode, 200);
  });

  await test('metricsOtlpHandler 拒绝非 trusted IP', () => {
    _resetTrustedCidrsCache();
    delete process.env.METRICS_TRUSTED_CIDRS;
    const req = { ip: '8.8.8.8', socket: { remoteAddress: '8.8.8.8' } };
    let statusCode = 200;
    const res = {
      setHeader: () => {},
      status(code) { statusCode = code; return res; },
      json: () => res,
      send: () => res,
    };
    metricsOtlpHandler(req, res);
    assert.strictEqual(statusCode, 403);
  });

  // ---- 8. 行为：辅助函数 ----
  await test('parseTrustedCidrs("10.0.0.0/8, 192.168.0.0/16") → ["10.0.0.0/8","192.168.0.0/16"]', () => {
    const r = parseTrustedCidrs('10.0.0.0/8, 192.168.0.0/16');
    assert.deepStrictEqual(r, ['10.0.0.0/8', '192.168.0.0/16']);
  });

  await test('parseTrustedCidrs 留空 / null → []', () => {
    assert.deepStrictEqual(parseTrustedCidrs(''), []);
    assert.deepStrictEqual(parseTrustedCidrs(null), []);
    assert.deepStrictEqual(parseTrustedCidrs(undefined), []);
  });

  await test('ipv4ToInt("10.0.0.1") → 0x0A000001', () => {
    assert.strictEqual(ipv4ToInt('10.0.0.1'), 0x0A000001);
    assert.strictEqual(ipv4ToInt('127.0.0.1'), 0x7F000001);
    assert.strictEqual(ipv4ToInt('255.255.255.255'), 0xFFFFFFFF);
    assert.strictEqual(ipv4ToInt('not-an-ip'), null);
  });

  await test('ipv4ToInt 处理 IPv4-mapped IPv6（::ffff:10.0.0.1）', () => {
    assert.strictEqual(ipv4ToInt('::ffff:10.0.0.1'), 0x0A000001);
  });

  await test('matchIpv4Cidr 非法 CIDR → false（不报错）', () => {
    _resetTrustedCidrsCache();
    assert.strictEqual(matchIpv4Cidr('10.0.0.1', 'invalid'), false);
    assert.strictEqual(matchIpv4Cidr('10.0.0.1', '10.0.0.0/33'), false); // 位数越界
    assert.strictEqual(matchIpv4Cidr('10.0.0.1', 'not-ip/8'), false);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  // 清理：恢复默认配置
  delete process.env.METRICS_TRUSTED_CIDRS;
  _resetTrustedCidrsCache();
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
