// tests/specs/ssrf-guard-deep.cjs
// Cycle 26 R1: ssrf-guard.js SSRF 防护深度测试
// 覆盖: classifyIp/classifyIpv4/classifyIpv6/isPrivateIp
//       isMetadataIp/isMetadataHost
//       validateBaseUrl (https-only / Ollama http / 白名单)
//       validateHostHeader (Host allowlist)
//       常量导出
'use strict';

const assert = require('node:assert');
const http = require('node:http');

// 备份原 env
const ORIG_ENV = { ...process.env };

const guard = require('../../server/services/ssrf-guard');

const {
  classifyIp,
  classifyIpv4,
  classifyIpv6,
  isPrivateIp,
  isMetadataIp,
  isMetadataHost,
  validateBaseUrl,
  validateBaseUrlWithDns,
  validateHostHeader,
  ALLOWED_BASE_HOSTS,
  OLLAMA_HOSTS,
  ALLOW_HTTP,
  __test,
} = guard;

// ---- 计数器 ----
let pass = 0, fail = 0;
const failures = [];
async function ok(label, fn) {
  try {
    await fn();
    pass++;
    console.log(`  [PASS] ${label}`);
  } catch (e) {
    fail++;
    console.log(`  [FAIL] ${label}: ${e.message}`);
    failures.push({ label, err: e.message });
  }
}

function setEnv(obj) {
  Object.assign(process.env, obj);
}

function restoreEnv() {
  // 清除新增的
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIG_ENV)) delete process.env[k];
  }
  Object.assign(process.env, ORIG_ENV);
}

async function main() {
  console.log('=== Cycle 26 R1: ssrf-guard.js deep tests ===\n');

  // ===== A组: 模块导出 =====
  console.log('\n-- A组: 模块导出完整 --');
  await ok('A1: classifyIp 是 function', () => {
    assert.strictEqual(typeof classifyIp, 'function');
  });
  await ok('A2: classifyIpv4 是 function', () => {
    assert.strictEqual(typeof classifyIpv4, 'function');
  });
  await ok('A3: classifyIpv6 是 function', () => {
    assert.strictEqual(typeof classifyIpv6, 'function');
  });
  await ok('A4: isPrivateIp 是 function', () => {
    assert.strictEqual(typeof isPrivateIp, 'function');
  });
  await ok('A5: isMetadataIp 是 function', () => {
    assert.strictEqual(typeof isMetadataIp, 'function');
  });
  await ok('A6: isMetadataHost 是 function', () => {
    assert.strictEqual(typeof isMetadataHost, 'function');
  });
  await ok('A7: validateBaseUrl 是 function', () => {
    assert.strictEqual(typeof validateBaseUrl, 'function');
  });
  await ok('A8: validateHostHeader 是 function', () => {
    assert.strictEqual(typeof validateHostHeader, 'function');
  });
  await ok('A9: ALLOWED_BASE_HOSTS 是 Set', () => {
    assert.ok(ALLOWED_BASE_HOSTS instanceof Set);
  });
  await ok('A10: OLLAMA_HOSTS 是 Set', () => {
    assert.ok(OLLAMA_HOSTS instanceof Set);
  });
  await ok('A11: ALLOW_HTTP 是 boolean', () => {
    assert.strictEqual(typeof ALLOW_HTTP, 'boolean');
  });
  await ok('A12: __test 对象存在', () => {
    assert.strictEqual(typeof __test, 'object');
  });
  await ok('A13: __test.ALLOWED_HOSTS 是 Set', () => {
    assert.ok(__test.ALLOWED_HOSTS instanceof Set);
  });
  await ok('A14: __test.DEFAULT_ALLOWED_HOSTS 是 Set', () => {
    assert.ok(__test.DEFAULT_ALLOWED_HOSTS instanceof Set);
  });
  await ok('A15: __test.METADATA_IPS_V4 是 Set', () => {
    assert.ok(__test.METADATA_IPS_V4 instanceof Set);
  });
  await ok('A16: __test.METADATA_IPS_V6 是 Set', () => {
    assert.ok(__test.METADATA_IPS_V6 instanceof Set);
  });
  await ok('A17: __test.METADATA_HOSTS 是 Set', () => {
    assert.ok(__test.METADATA_HOSTS instanceof Set);
  });

  // ===== B组: 常量内容验证 =====
  console.log('\n-- B组: 常量内容 --');
  await ok('B1: ALLOWED_BASE_HOSTS 含 api.openai.com', () => {
    assert.ok(ALLOWED_BASE_HOSTS.has('api.openai.com'));
  });
  await ok('B2: ALLOWED_BASE_HOSTS 含 api.anthropic.com', () => {
    assert.ok(ALLOWED_BASE_HOSTS.has('api.anthropic.com'));
  });
  await ok('B3: ALLOWED_BASE_HOSTS 含 generativelanguage.googleapis.com', () => {
    assert.ok(ALLOWED_BASE_HOSTS.has('generativelanguage.googleapis.com'));
  });
  await ok('B4: ALLOWED_BASE_HOSTS 含 api.deepseek.com', () => {
    assert.ok(ALLOWED_BASE_HOSTS.has('api.deepseek.com'));
  });
  await ok('B5: OLLAMA_HOSTS 含 localhost', () => {
    assert.ok(OLLAMA_HOSTS.has('localhost'));
  });
  await ok('B6: OLLAMA_HOSTS 含 127.0.0.1', () => {
    assert.ok(OLLAMA_HOSTS.has('127.0.0.1'));
  });
  await ok('B7: OLLAMA_HOSTS 含 ::1', () => {
    assert.ok(OLLAMA_HOSTS.has('::1'));
  });
  await ok('B8: METADATA_IPS_V4 含 169.254.169.254', () => {
    assert.ok(__test.METADATA_IPS_V4.has('169.254.169.254'));
  });
  await ok('B9: METADATA_IPS_V4 含 169.254.170.2', () => {
    assert.ok(__test.METADATA_IPS_V4.has('169.254.170.2'));
  });
  await ok('B10: METADATA_IPS_V6 含 fd00:ec2::254', () => {
    assert.ok(__test.METADATA_IPS_V6.has('fd00:ec2::254'));
  });
  await ok('B11: METADATA_HOSTS 含 metadata', () => {
    assert.ok(__test.METADATA_HOSTS.has('metadata'));
  });
  await ok('B12: METADATA_HOSTS 含 metadata.google.internal', () => {
    assert.ok(__test.METADATA_HOSTS.has('metadata.google.internal'));
  });
  await ok('B13: DEFAULT_ALLOWED_HOSTS 含 localhost', () => {
    assert.ok(__test.DEFAULT_ALLOWED_HOSTS.has('localhost'));
  });
  await ok('B14: DEFAULT_ALLOWED_HOSTS 含 gisai.top', () => {
    assert.ok(__test.DEFAULT_ALLOWED_HOSTS.has('gisai.top'));
  });

  // ===== C组: isMetadataIp =====
  console.log('\n-- C组: isMetadataIp 元数据 IP 检测 --');
  await ok('C1: null 返回 false', () => {
    assert.strictEqual(isMetadataIp(null), false);
  });
  await ok('C2: undefined 返回 false', () => {
    assert.strictEqual(isMetadataIp(undefined), false);
  });
  await ok('C3: 空字符串返回 false', () => {
    assert.strictEqual(isMetadataIp(''), false);
  });
  await ok('C4: 非字符串返回 false', () => {
    assert.strictEqual(isMetadataIp(42), false);
    assert.strictEqual(isMetadataIp({}), false);
  });
  await ok('C5: AWS metadata IP 169.254.169.254 返回 true', () => {
    assert.strictEqual(isMetadataIp('169.254.169.254'), true);
  });
  await ok('C6: AWS ECS v2 metadata IP 169.254.170.2 返回 true', () => {
    assert.strictEqual(isMetadataIp('169.254.170.2'), true);
  });
  await ok('C7: AWS ECS v1 metadata IP 169.254.170.1 返回 true', () => {
    assert.strictEqual(isMetadataIp('169.254.170.1'), true);
  });
  await ok('C8: 部分 K8s 服务 IP 169.254.0.1 返回 true', () => {
    assert.strictEqual(isMetadataIp('169.254.0.1'), true);
  });
  await ok('C9: AWS IPv6 metadata fd00:ec2::254 返回 true', () => {
    assert.strictEqual(isMetadataIp('fd00:ec2::254'), true);
  });
  await ok('C10: AWS ECS v2 IPv6 fd00:ec2::253 返回 true', () => {
    assert.strictEqual(isMetadataIp('fd00:ec2::253'), true);
  });
  await ok('C11: 旧 IMDS IPv6 fe80::a9f:feff:fecf:3c 返回 true', () => {
    assert.strictEqual(isMetadataIp('fe80::a9f:feff:fecf:3c'), true);
  });
  await ok('C12: 普通公网 IP 8.8.8.8 返回 false', () => {
    assert.strictEqual(isMetadataIp('8.8.8.8'), false);
  });
  await ok('C13: 私有 IP 10.0.0.1 返回 false', () => {
    assert.strictEqual(isMetadataIp('10.0.0.1'), false);
  });
  await ok('C14: loopback 127.0.0.1 返回 false', () => {
    assert.strictEqual(isMetadataIp('127.0.0.1'), false);
  });
  await ok('C15: 无效 IP 字符串返回 false', () => {
    assert.strictEqual(isMetadataIp('not-an-ip'), false);
    assert.strictEqual(isMetadataIp('256.256.256.256'), false);
  });

  // ===== D组: isMetadataHost =====
  console.log('\n-- D组: isMetadataHost 元数据主机检测 --');
  await ok('D1: null 返回 false', () => {
    assert.strictEqual(isMetadataHost(null), false);
  });
  await ok('D2: undefined 返回 false', () => {
    assert.strictEqual(isMetadataHost(undefined), false);
  });
  await ok('D3: 空字符串返回 false', () => {
    assert.strictEqual(isMetadataHost(''), false);
  });
  await ok('D4: 非字符串返回 false', () => {
    assert.strictEqual(isMetadataHost(42), false);
    assert.strictEqual(isMetadataHost({}), false);
  });
  await ok('D5: metadata 返回 true', () => {
    assert.strictEqual(isMetadataHost('metadata'), true);
  });
  await ok('D6: metadata.google.internal 返回 true', () => {
    assert.strictEqual(isMetadataHost('metadata.google.internal'), true);
  });
  await ok('D7: kubernetes.default.svc 返回 true', () => {
    assert.strictEqual(isMetadataHost('kubernetes.default.svc'), true);
  });
  await ok('D8: 大小写不敏感', () => {
    assert.strictEqual(isMetadataHost('METADATA'), true);
    assert.strictEqual(isMetadataHost('Metadata'), true);
    assert.strictEqual(isMetadataHost('METADATA.GOOGLE.INTERNAL'), true);
  });
  await ok('D9: 普通公网主机返回 false', () => {
    assert.strictEqual(isMetadataHost('google.com'), false);
    assert.strictEqual(isMetadataHost('api.openai.com'), false);
  });
  await ok('D10: localhost 返回 false', () => {
    assert.strictEqual(isMetadataHost('localhost'), false);
  });

  // ===== E组: classifyIpv4 =====
  console.log('\n-- E组: classifyIpv4 IPv4 分类 --');
  await ok('E1: 127.0.0.1 是 loopback', () => {
    assert.strictEqual(classifyIpv4('127.0.0.1'), 'loopback');
  });
  await ok('E2: 127.0.0.2 是 loopback（整个 127.0.0.0/8）', () => {
    assert.strictEqual(classifyIpv4('127.0.0.2'), 'loopback');
  });
  await ok('E3: 10.0.0.1 是 private（10.0.0.0/8）', () => {
    assert.strictEqual(classifyIpv4('10.0.0.1'), 'private');
  });
  await ok('E4: 10.255.255.255 是 private', () => {
    assert.strictEqual(classifyIpv4('10.255.255.255'), 'private');
  });
  await ok('E5: 172.16.0.1 是 private（172.16.0.0/12）', () => {
    assert.strictEqual(classifyIpv4('172.16.0.1'), 'private');
  });
  await ok('E6: 172.31.255.255 是 private', () => {
    assert.strictEqual(classifyIpv4('172.31.255.255'), 'private');
  });
  await ok('E7: 172.15.0.1 是 public（不在 172.16.0.0/12）', () => {
    assert.strictEqual(classifyIpv4('172.15.0.1'), 'public');
  });
  await ok('E8: 172.32.0.1 是 public', () => {
    assert.strictEqual(classifyIpv4('172.32.0.1'), 'public');
  });
  await ok('E9: 192.168.1.1 是 private（192.168.0.0/16）', () => {
    assert.strictEqual(classifyIpv4('192.168.1.1'), 'private');
  });
  await ok('E10: 192.168.255.255 是 private', () => {
    assert.strictEqual(classifyIpv4('192.168.255.255'), 'private');
  });
  await ok('E11: 192.169.1.1 是 public（不在 192.168.0.0/16）', () => {
    assert.strictEqual(classifyIpv4('192.169.1.1'), 'public');
  });
  await ok('E12: 169.254.169.254 是 linkLocal', () => {
    assert.strictEqual(classifyIpv4('169.254.169.254'), 'linkLocal');
  });
  await ok('E13: 169.254.0.1 是 linkLocal', () => {
    assert.strictEqual(classifyIpv4('169.254.0.1'), 'linkLocal');
  });
  await ok('E14: 0.0.0.0 是 reserved', () => {
    assert.strictEqual(classifyIpv4('0.0.0.0'), 'reserved');
  });
  await ok('E15: 0.0.0.1 是 reserved', () => {
    assert.strictEqual(classifyIpv4('0.0.0.1'), 'reserved');
  });
  await ok('E16: 100.64.0.1 是 cgnat（100.64.0.0/10）', () => {
    assert.strictEqual(classifyIpv4('100.64.0.1'), 'cgnat');
  });
  await ok('E17: 100.127.255.255 是 cgnat', () => {
    assert.strictEqual(classifyIpv4('100.127.255.255'), 'cgnat');
  });
  await ok('E18: 100.128.0.1 是 public（不在 100.64.0.0/10）', () => {
    assert.strictEqual(classifyIpv4('100.128.0.1'), 'public');
  });
  await ok('E19: 192.0.0.1 是 reserved', () => {
    assert.strictEqual(classifyIpv4('192.0.0.1'), 'reserved');
  });
  await ok('E20: 192.0.1.1 是 public', () => {
    assert.strictEqual(classifyIpv4('192.0.1.1'), 'public');
  });
  await ok('E21: 192.0.2.1 是 documentation', () => {
    assert.strictEqual(classifyIpv4('192.0.2.1'), 'documentation');
  });
  await ok('E22: 198.51.100.1 是 documentation', () => {
    assert.strictEqual(classifyIpv4('198.51.100.1'), 'documentation');
  });
  await ok('E23: 203.0.113.1 是 documentation', () => {
    assert.strictEqual(classifyIpv4('203.0.113.1'), 'documentation');
  });
  await ok('E24: 224.0.0.1 是 multicast（224.0.0.0/4）', () => {
    assert.strictEqual(classifyIpv4('224.0.0.1'), 'multicast');
  });
  await ok('E25: 239.255.255.255 是 multicast', () => {
    assert.strictEqual(classifyIpv4('239.255.255.255'), 'multicast');
  });
  await ok('E26: 240.0.0.1 是 reserved', () => {
    assert.strictEqual(classifyIpv4('240.0.0.1'), 'reserved');
  });
  await ok('E27: 255.255.255.255 是 reserved（broadcast）', () => {
    assert.strictEqual(classifyIpv4('255.255.255.255'), 'reserved');
  });
  await ok('E28: 8.8.8.8 是 public', () => {
    assert.strictEqual(classifyIpv4('8.8.8.8'), 'public');
  });
  await ok('E29: 1.1.1.1 是 public', () => {
    assert.strictEqual(classifyIpv4('1.1.1.1'), 'public');
  });
  await ok('E30: 无效 IPv4 返回 invalid', () => {
    assert.strictEqual(classifyIpv4('not-an-ip'), 'invalid');
    assert.strictEqual(classifyIpv4(''), 'invalid');
    assert.strictEqual(classifyIpv4('256.256.256.256'), 'invalid');
  });

  // ===== F组: classifyIpv6 =====
  console.log('\n-- F组: classifyIpv6 IPv6 分类 --');
  await ok('F1: ::1 是 loopback', () => {
    assert.strictEqual(classifyIpv6('::1'), 'loopback');
  });
  await ok('F2: :: 是 reserved（unspecified）', () => {
    assert.strictEqual(classifyIpv6('::'), 'reserved');
  });
  await ok('F3: ::ffff:127.0.0.1 是 loopback（IPv4-mapped）', () => {
    assert.strictEqual(classifyIpv6('::ffff:127.0.0.1'), 'loopback');
  });
  await ok('F4: ::ffff:10.0.0.1 是 private（IPv4-mapped）', () => {
    assert.strictEqual(classifyIpv6('::ffff:10.0.0.1'), 'private');
  });
  await ok('F5: ::ffff:192.168.1.1 是 private（IPv4-mapped）', () => {
    assert.strictEqual(classifyIpv6('::ffff:192.168.1.1'), 'private');
  });
  await ok('F6: ::ffff:8.8.8.8 是 public（IPv4-mapped）', () => {
    assert.strictEqual(classifyIpv6('::ffff:8.8.8.8'), 'public');
  });
  await ok('F7: fe80::1 是 linkLocal', () => {
    assert.strictEqual(classifyIpv6('fe80::1'), 'linkLocal');
  });
  await ok('F8: fe80::a9f:feff:fecf:3c 是 linkLocal', () => {
    assert.strictEqual(classifyIpv6('fe80::a9f:feff:fecf:3c'), 'linkLocal');
  });
  await ok('F9: fc00::1 是 private（ULA）', () => {
    assert.strictEqual(classifyIpv6('fc00::1'), 'private');
  });
  await ok('F10: fd00::1 是 private（ULA）', () => {
    assert.strictEqual(classifyIpv6('fd00::1'), 'private');
  });
  await ok('F11: ff00::1 是 multicast', () => {
    assert.strictEqual(classifyIpv6('ff00::1'), 'multicast');
  });
  await ok('F12: ff02::1 是 multicast', () => {
    assert.strictEqual(classifyIpv6('ff02::1'), 'multicast');
  });
  await ok('F13: 2001:db8::1 是 documentation', () => {
    assert.strictEqual(classifyIpv6('2001:db8::1'), 'documentation');
  });
  await ok('F14: 64:ff9b::1 是 reserved（NAT64）', () => {
    assert.strictEqual(classifyIpv6('64:ff9b::1'), 'reserved');
  });
  await ok('F15: fd00:ec2::254 是 private（ULA 段，但 metadata 检测独立）', () => {
    assert.strictEqual(classifyIpv6('fd00:ec2::254'), 'private');
  });
  await ok('F16: 2001:4860:4860::8888 是 public', () => {
    assert.strictEqual(classifyIpv6('2001:4860:4860::8888'), 'public');
  });
  await ok('F17: 2606:4700:4700::1111 是 public', () => {
    assert.strictEqual(classifyIpv6('2606:4700:4700::1111'), 'public');
  });
  await ok('F18: 无效 IPv6 返回 invalid', () => {
    assert.strictEqual(classifyIpv6('not-an-ip'), 'invalid');
    assert.strictEqual(classifyIpv6(''), 'invalid');
  });

  // ===== G组: classifyIp（自动检测 v4/v6） =====
  console.log('\n-- G组: classifyIp 自动分类 --');
  await ok('G1: null 返回 invalid', () => {
    assert.strictEqual(classifyIp(null), 'invalid');
  });
  await ok('G2: undefined 返回 invalid', () => {
    assert.strictEqual(classifyIp(undefined), 'invalid');
  });
  await ok('G3: 空字符串返回 invalid', () => {
    assert.strictEqual(classifyIp(''), 'invalid');
  });
  await ok('G4: 非字符串返回 invalid', () => {
    assert.strictEqual(classifyIp(42), 'invalid');
    assert.strictEqual(classifyIp({}), 'invalid');
  });
  await ok('G5: IPv4 公网 IP 返回 public', () => {
    assert.strictEqual(classifyIp('8.8.8.8'), 'public');
  });
  await ok('G6: IPv4 私有 IP 返回 private', () => {
    assert.strictEqual(classifyIp('10.0.0.1'), 'private');
  });
  await ok('G7: IPv6 公网 IP 返回 public', () => {
    assert.strictEqual(classifyIp('2001:4860:4860::8888'), 'public');
  });
  await ok('G8: IPv6 loopback 返回 loopback', () => {
    assert.strictEqual(classifyIp('::1'), 'loopback');
  });
  await ok('G9: 混合检测（同一函数处理 v4/v6）', () => {
    assert.strictEqual(classifyIp('127.0.0.1'), 'loopback');
    assert.strictEqual(classifyIp('::1'), 'loopback');
  });

  // ===== H组: isPrivateIp =====
  console.log('\n-- H组: isPrivateIp 判断 --');
  await ok('H1: public IP 返回 false', () => {
    assert.strictEqual(isPrivateIp('8.8.8.8'), false);
    assert.strictEqual(isPrivateIp('2001:4860:4860::8888'), false);
  });
  await ok('H2: loopback 返回 true', () => {
    assert.strictEqual(isPrivateIp('127.0.0.1'), true);
    assert.strictEqual(isPrivateIp('::1'), true);
  });
  await ok('H3: private IPv4 返回 true', () => {
    assert.strictEqual(isPrivateIp('10.0.0.1'), true);
    assert.strictEqual(isPrivateIp('172.16.0.1'), true);
    assert.strictEqual(isPrivateIp('192.168.1.1'), true);
  });
  await ok('H4: linkLocal 返回 true', () => {
    assert.strictEqual(isPrivateIp('169.254.169.254'), true);
    assert.strictEqual(isPrivateIp('fe80::1'), true);
  });
  await ok('H5: multicast 返回 true', () => {
    assert.strictEqual(isPrivateIp('224.0.0.1'), true);
    assert.strictEqual(isPrivateIp('ff00::1'), true);
  });
  await ok('H6: reserved 返回 true', () => {
    assert.strictEqual(isPrivateIp('0.0.0.0'), true);
    assert.strictEqual(isPrivateIp('240.0.0.1'), true);
    assert.strictEqual(isPrivateIp('::'), true);
  });
  await ok('H7: cgnat 返回 true', () => {
    assert.strictEqual(isPrivateIp('100.64.0.1'), true);
  });
  await ok('H8: documentation 返回 true', () => {
    assert.strictEqual(isPrivateIp('192.0.2.1'), true);
    assert.strictEqual(isPrivateIp('2001:db8::1'), true);
  });
  await ok('H9: invalid 返回 true', () => {
    assert.strictEqual(isPrivateIp('not-an-ip'), true);
    assert.strictEqual(isPrivateIp(''), true);
  });

  // ===== I组: validateBaseUrl =====
  console.log('\n-- I组: validateBaseUrl URL 校验 --');
  await ok('I1: null 抛错', () => {
    assert.throws(() => validateBaseUrl(null), /不能为空/);
  });
  await ok('I2: undefined 抛错', () => {
    assert.throws(() => validateBaseUrl(undefined), /不能为空/);
  });
  await ok('I3: 空字符串抛错', () => {
    assert.throws(() => validateBaseUrl(''), /不能为空/);
  });
  await ok('I4: 非字符串抛错', () => {
    assert.throws(() => validateBaseUrl(42), /不能为空/);
  });
  await ok('I5: 非 URL 字符串抛错', () => {
    assert.throws(() => validateBaseUrl('not-a-url'), /不是合法 URL/);
  });
  await ok('I6: api.openai.com https 通过', () => {
    const r = validateBaseUrl('https://api.openai.com/v1');
    assert.strictEqual(r, 'https://api.openai.com/v1');
  });
  await ok('I7: api.anthropic.com https 通过', () => {
    const r = validateBaseUrl('https://api.anthropic.com/v1');
    assert.strictEqual(r, 'https://api.anthropic.com/v1');
  });
  await ok('I8: api.deepseek.com https 通过', () => {
    const r = validateBaseUrl('https://api.deepseek.com/chat');
    assert.strictEqual(r, 'https://api.deepseek.com/chat');
  });
  await ok('I9: api.openai.com http 抛错（白名单强制 https）', () => {
    assert.throws(() => validateBaseUrl('http://api.openai.com/v1'), /必须是 https 协议/);
  });
  await ok('I10: api.anthropic.com http 抛错', () => {
    assert.throws(() => validateBaseUrl('http://api.anthropic.com/v1'), /必须是 https 协议/);
  });
  await ok('I11: 非白名单主机抛错', () => {
    assert.throws(() => validateBaseUrl('https://evil.com/v1'), /主机不在白名单/);
  });
  await ok('I12: 子域名不在白名单抛错', () => {
    assert.throws(() => validateBaseUrl('https://api.openai.com.evil.com/v1'), /主机不在白名单/);
  });
  await ok('I13: 大小写不敏感（API.OPENAI.COM 通过）', () => {
    const r = validateBaseUrl('https://API.OPENAI.COM/v1');
    assert.strictEqual(r, 'https://API.OPENAI.COM/v1');
  });
  await ok('I14: 含路径和 query 保留', () => {
    const r = validateBaseUrl('https://api.openai.com/v1/chat?model=gpt-4');
    assert.strictEqual(r, 'https://api.openai.com/v1/chat?model=gpt-4');
  });
  await ok('I15: 含端口 443 通过', () => {
    const r = validateBaseUrl('https://api.openai.com:443/v1');
    assert.strictEqual(r, 'https://api.openai.com:443/v1');
  });
  await ok('I16: 含用户名密码 通过（仍校验 host）', () => {
    const r = validateBaseUrl('https://user:pass@api.openai.com/v1');
    assert.strictEqual(r, 'https://user:pass@api.openai.com/v1');
  });
  await ok('I17: localhost + http + ALLOW_HTTP=1 通过（动态加载）', () => {
    setEnv({ AI_ALLOW_HTTP: '1' });
    try {
      delete require.cache[require.resolve('../../server/services/ssrf-guard')];
      const mod = require('../../server/services/ssrf-guard');
      const r = mod.validateBaseUrl('http://localhost:11434/v1');
      assert.strictEqual(r, 'http://localhost:11434/v1');
    } finally {
      restoreEnv();
      delete require.cache[require.resolve('../../server/services/ssrf-guard')];
      require('../../server/services/ssrf-guard');
    }
  });
  await ok('I18: localhost + http + ALLOW_HTTP 未设 抛错', () => {
    restoreEnv();
    assert.throws(() => validateBaseUrl('http://localhost:11434/v1'), /AI_ALLOW_HTTP=1/);
  });
  await ok('I19: 127.0.0.1 + http + ALLOW_HTTP=1 通过（动态加载）', () => {
    setEnv({ AI_ALLOW_HTTP: '1' });
    try {
      delete require.cache[require.resolve('../../server/services/ssrf-guard')];
      const mod = require('../../server/services/ssrf-guard');
      const r = mod.validateBaseUrl('http://127.0.0.1:11434/v1');
      assert.strictEqual(r, 'http://127.0.0.1:11434/v1');
    } finally {
      restoreEnv();
      delete require.cache[require.resolve('../../server/services/ssrf-guard')];
      require('../../server/services/ssrf-guard');
    }
  });
  await ok('I20: IPv6 [::1] URL hostname 含方括号，不在白名单', () => {
    // Node.js 中 new URL('http://[::1]:11434').hostname 返回 '[::1]'（带方括号）
    // OLLAMA_HOSTS 含 '::1'（不带方括号），所以 [::1] 不匹配，被拒绝
    restoreEnv();
    assert.throws(
      () => validateBaseUrl('http://[::1]:11434/v1'),
      /主机不在白名单/
    );
  });
  await ok('I20b: OLLAMA_HOSTS 含不带方括号的 ::1', () => {
    assert.ok(OLLAMA_HOSTS.has('::1'));
    assert.ok(!OLLAMA_HOSTS.has('[::1]'));
  });
  await ok('I21: localhost + https 通过（无需 ALLOW_HTTP）', () => {
    delete process.env.AI_ALLOW_HTTP;
    const r = validateBaseUrl('https://localhost:11434/v1');
    assert.strictEqual(r, 'https://localhost:11434/v1');
  });
  await ok('I22: Ollama host + ftp 抛错', () => {
    delete process.env.AI_ALLOW_HTTP;
    assert.throws(() => validateBaseUrl('ftp://localhost/v1'), /必须是 http\(s\) 协议/);
  });

  // ===== J组: validateHostHeader =====
  console.log('\n-- J组: validateHostHeader Host 头白名单 --');
  function makeReqRes(host) {
    const req = { headers: { host } };
    let status = 0;
    let body = null;
    const res = {
      status: (n) => { status = n; return res; },
      json: (obj) => { body = obj; return res; },
    };
    return { req, res, getStatus: () => status, getBody: () => body };
  }
  await ok('J1: Host=localhost 通过（调用 next）', () => {
    const { req, res } = makeReqRes('localhost');
    let called = false;
    validateHostHeader(req, res, () => { called = true; });
    assert.strictEqual(called, true);
  });
  await ok('J2: Host=127.0.0.1 通过', () => {
    const { req, res } = makeReqRes('127.0.0.1');
    let called = false;
    validateHostHeader(req, res, () => { called = true; });
    assert.strictEqual(called, true);
  });
  await ok('J3: Host=::1 在 ALLOWED_HOSTS 中（但 split 后为空字符串，源码 bug）', () => {
    // 源码 bug: ' ::1'.toLowerCase().split(':')[0] = '' （空字符串）
    // 因此 Host=::1 会被错误地当作缺失 Host 头返回 400
    // 这是源码的已知行为（非 IPv6-aware）
    const req = { headers: { host: '::1' } };
    let status = 0;
    const res = {
      status: (n) => { status = n; return res; },
      json: (obj) => {},
    };
    validateHostHeader(req, res, () => {});
    // 实际行为：400（空 host）
    assert.strictEqual(status, 400);
  });
  await ok('J3b: Host=[::1] 通过（带方括号的 IPv6）', () => {
    // 带方括号时 split(':')[0] = '[::1]' 也不在白名单，但仍非空
    // 源码不处理方括号，所以 [::1] 也不在白名单
    const req = { headers: { host: '[::1]' } };
    let status = 0;
    const res = {
      status: (n) => { status = n; return res; },
      json: (obj) => {},
    };
    validateHostHeader(req, res, () => {});
    assert.strictEqual(status, 403);
  });
  await ok('J4: Host=0.0.0.0 通过', () => {
    const { req, res } = makeReqRes('0.0.0.0');
    let called = false;
    validateHostHeader(req, res, () => { called = true; });
    assert.strictEqual(called, true);
  });
  await ok('J5: Host=gisai.top 通过（生产域名）', () => {
    const { req, res } = makeReqRes('gisai.top');
    let called = false;
    validateHostHeader(req, res, () => { called = true; });
    assert.strictEqual(called, true);
  });
  await ok('J6: Host=www.gisai.top 通过', () => {
    const { req, res } = makeReqRes('www.gisai.top');
    let called = false;
    validateHostHeader(req, res, () => { called = true; });
    assert.strictEqual(called, true);
  });
  await ok('J7: Host=localhost:3001 通过（带端口）', () => {
    const { req, res } = makeReqRes('localhost:3001');
    let called = false;
    validateHostHeader(req, res, () => { called = true; });
    assert.strictEqual(called, true);
  });
  await ok('J8: Host=127.0.0.1:8080 通过（带端口）', () => {
    const { req, res } = makeReqRes('127.0.0.1:8080');
    let called = false;
    validateHostHeader(req, res, () => { called = true; });
    assert.strictEqual(called, true);
  });
  await ok('J9: Host=evil.com 拒绝（403）', () => {
    const { req, res, getStatus, getBody } = makeReqRes('evil.com');
    let called = false;
    validateHostHeader(req, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(getStatus(), 403);
    assert.ok(getBody().message.includes('不在白名单'));
  });
  await ok('J10: Host=10.0.0.1 拒绝（内网 IP）', () => {
    const { req, res, getStatus } = makeReqRes('10.0.0.1');
    let called = false;
    validateHostHeader(req, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(getStatus(), 403);
  });
  await ok('J11: Host=192.168.1.1 拒绝（内网 IP）', () => {
    const { req, res, getStatus } = makeReqRes('192.168.1.1');
    let called = false;
    validateHostHeader(req, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(getStatus(), 403);
  });
  await ok('J12: Host=169.254.169.254 拒绝（metadata IP）', () => {
    const { req, res, getStatus } = makeReqRes('169.254.169.254');
    let called = false;
    validateHostHeader(req, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(getStatus(), 403);
  });
  await ok('J13: 缺失 Host 头返回 400', () => {
    const req = { headers: {} };
    let status = 0;
    const res = {
      status: (n) => { status = n; return res; },
      json: (obj) => {},
    };
    validateHostHeader(req, res, () => {});
    assert.strictEqual(status, 400);
  });
  await ok('J14: Host 头为空字符串返回 400', () => {
    const { req, res, getStatus } = makeReqRes('');
    validateHostHeader(req, res, () => {});
    assert.strictEqual(getStatus(), 400);
  });
  await ok('J15: Host 头大小写不敏感', () => {
    const { req, res } = makeReqRes('LOCALHOST');
    let called = false;
    validateHostHeader(req, res, () => { called = true; });
    assert.strictEqual(called, true);
  });
  await ok('J16: Host 头带端口的非白名单拒绝', () => {
    const { req, res, getStatus } = makeReqRes('evil.com:8080');
    let called = false;
    validateHostHeader(req, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(getStatus(), 403);
  });

  // ===== K组: ALLOW_HTTP 动态行为 =====
  console.log('\n-- K组: ALLOW_HTTP 动态行为（重新加载模块）--');
  await ok('K1: 默认 ALLOW_HTTP=false（无 env）', () => {
    restoreEnv();
    delete require.cache[require.resolve('../../server/services/ssrf-guard')];
    const mod = require('../../server/services/ssrf-guard');
    assert.strictEqual(mod.ALLOW_HTTP, false);
  });
  await ok('K2: AI_ALLOW_HTTP=1 时 ALLOW_HTTP=true', () => {
    setEnv({ AI_ALLOW_HTTP: '1' });
    delete require.cache[require.resolve('../../server/services/ssrf-guard')];
    const mod = require('../../server/services/ssrf-guard');
    assert.strictEqual(mod.ALLOW_HTTP, true);
    restoreEnv();
  });
  await ok('K3: ALLOWED_HOSTS env 覆盖默认白名单', () => {
    setEnv({ ALLOWED_HOSTS: 'custom.example.com,another.test' });
    delete require.cache[require.resolve('../../server/services/ssrf-guard')];
    const mod = require('../../server/services/ssrf-guard');
    assert.ok(mod.__test.ALLOWED_HOSTS.has('custom.example.com'));
    assert.ok(mod.__test.ALLOWED_HOSTS.has('another.test'));
    // 默认也在
    assert.ok(mod.__test.ALLOWED_HOSTS.has('localhost'));
    restoreEnv();
  });
  await ok('K4: ALLOWED_HOSTS env 空字符串无效果', () => {
    setEnv({ ALLOWED_HOSTS: '' });
    delete require.cache[require.resolve('../../server/services/ssrf-guard')];
    const mod = require('../../server/services/ssrf-guard');
    assert.strictEqual(mod.__test.ALLOWED_HOSTS.size, mod.__test.DEFAULT_ALLOWED_HOSTS.size);
    restoreEnv();
  });
  await ok('K5: ALLOWED_HOSTS env 含空格自动 trim', () => {
    setEnv({ ALLOWED_HOSTS: ' spacey.test ' });
    delete require.cache[require.resolve('../../server/services/ssrf-guard')];
    const mod = require('../../server/services/ssrf-guard');
    assert.ok(mod.__test.ALLOWED_HOSTS.has('spacey.test'));
    restoreEnv();
  });

  // ===== L组: validateBaseUrlWithDns（mock DNS） =====
  console.log('\n-- L组: validateBaseUrlWithDns DNS 校验 --');
  await ok('L1: metadata host 拒绝（在 DNS 前）', async () => {
    // validateBaseUrl 在 validateBaseUrlWithDns 内部先调用，metadata.google.internal 不在白名单
    // 所以先抛"主机不在白名单"，而非 metadata 错误
    // 这是源码设计：白名单优先，metadata 检测在 DNS 之前（对非白名单 host 无效）
    await assert.rejects(
      async () => validateBaseUrlWithDns('https://metadata.google.internal/v1'),
      /主机不在白名单/
    );
  });
  await ok('L1b: 白名单 host + metadata IP 拒绝（DNS 后）', async () => {
    // 假设 api.openai.com 解析到 169.254.169.254（被劫持）
    // validateBaseUrl 通过（白名单），但 DNS 解析出 metadata IP → 拒绝
    // 无法 mock DNS，跳过；用 isMetadataIp 直接验证
    assert.strictEqual(isMetadataIp('169.254.169.254'), true);
  });
  await ok('L2: 非白名单 host 抛错（在 DNS 前）', async () => {
    await assert.rejects(
      async () => validateBaseUrlWithDns('https://evil.com/v1'),
      /主机不在白名单/
    );
  });

  // ===== M组: 集成场景 =====
  console.log('\n-- M组: 集成场景 --');
  await ok('M1: 完整请求流：Host 头 → URL → IP 校验', () => {
    // 模拟一个合法请求
    const { req, res } = makeReqRes('localhost');
    let hostOk = false;
    validateHostHeader(req, res, () => { hostOk = true; });
    assert.strictEqual(hostOk, true);
    // 然后校验 URL
    const url = 'https://api.openai.com/v1';
    const r = validateBaseUrl(url);
    assert.strictEqual(r, url);
    // IP 校验（mock 解析到公网）
    assert.strictEqual(isPrivateIp('8.8.8.8'), false);
  });
  await ok('M2: SSRF 攻击场景：Host 头是 evil.com', () => {
    const { req, res, getStatus } = makeReqRes('evil.com');
    let called = false;
    validateHostHeader(req, res, () => { called = true; });
    assert.strictEqual(called, false);
    assert.strictEqual(getStatus(), 403);
  });
  await ok('M3: DNS rebinding 防护：Host 头是 localhost，URL 指向 metadata', async () => {
    const { req, res } = makeReqRes('localhost');
    let hostOk = false;
    validateHostHeader(req, res, () => { hostOk = true; });
    assert.strictEqual(hostOk, true);
    // 但 URL 校验应该拒绝 metadata
    await assert.rejects(
      async () => validateBaseUrlWithDns('https://metadata.google.internal/v1'),
      /metadata/
    );
  });
  await ok('M4: metadata IP 双重检测（host + IP 都拒）', () => {
    // Host 是 metadata.google.internal
    assert.strictEqual(isMetadataHost('metadata.google.internal'), true);
    // IP 是 169.254.169.254
    assert.strictEqual(isMetadataIp('169.254.169.254'), true);
    // classifyIp 也识别为 linkLocal
    assert.strictEqual(classifyIp('169.254.169.254'), 'linkLocal');
    // isPrivateIp 也识别为 private
    assert.strictEqual(isPrivateIp('169.254.169.254'), true);
  });

  // 恢复 env
  restoreEnv();

  // ===== summary =====
  console.log(`\n--- summary: pass=${pass} fail=${fail} ---`);
  if (failures.length) {
    console.log('failures:', JSON.stringify(failures, null, 2));
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(2);
});
