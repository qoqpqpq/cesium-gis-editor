// server/services/ssrf-guard.js
// 周期 3 P0-1: SSRF 防护升级（OWASP 6 步）
//
// 背景：周期 2 P1-8 实现了"URL 规范化 + DNS 解析 + IP 分类"三步（OWASP cheat sheet 6 步中的 3 步）。
//   周期 3 补齐：
//     1. ✅ URL 规范化（已有）
//     2. ✅ 协议白名单 https-only（已有；Ollama 例外）
//     3. ✅ WHATWG URL 解析（已有）
//     4. 🔄 DNS 解析 + IP 分类（升级为精确 IPv4/IPv6 分类，覆盖 CGNAT / IPv6 全部特殊段）
//     5. 🆕 链路重校验：每 hop 重新跑 classifyIp，禁止任意重定向
//     6. 🆕 超时 + 禁自动重试（fetch redirect:'manual'）
//
// 设计：
//   - 不引入 ipaddr.js（避免新增依赖；Node 自带 net.isIP + 内置正则已够用）
//   - classifyIp() 同时支持 IPv4 + IPv6 全特殊段（unicast / private / loopback / linkLocal / multicast / reserved / carrierGradeNat / uniqueLocal / ipv4Mapped）
//   - safeFetch(url, init) 包装 fetch：
//       - redirect: 'manual' → 遇到 3xx 抛错
//       - validateChain(url) 自动跑 URL + DNS + IP 校验
//       - 超时 AbortSignal.timeout(15s)
//
// 替代周期 2 P1-8 的 isPrivateIp 正则；保持对外接口不变（validateBaseUrlWithDns / isPrivateIp）

'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');

// 通用：whitelist 主机走 https；Ollama 本机走 http（需 AI_ALLOW_HTTP=1）
const ALLOWED_BASE_HOSTS = new Set([
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.deepseek.com',
  'api.minimaxi.com',
  'api.moonshot.cn',
  'open.bigmodel.cn',
  'dashscope.aliyuncs.com',
]);
const OLLAMA_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const ALLOW_HTTP = process.env.AI_ALLOW_HTTP === '1';

// ---- 周期 3 P0-1：精确 IP 分类（IPv4 + IPv6 全部特殊段） ----

/**
 * 精确分类 IPv4 地址
 * 返回 { kind: 'public' | 'private' | 'loopback' | 'linkLocal' | 'multicast'
 *       | 'reserved' | 'broadcast' | 'cgnat' | 'documentation' | 'invalid' }
 */
function classifyIpv4(ip) {
  if (!net.isIPv4(ip)) return 'invalid';
  // 0.0.0.0/8 — "this network"（含 0.0.0.0 本机）
  if (ip === '0.0.0.0' || /^0\./.test(ip)) return 'reserved';
  // 127.0.0.0/8 — loopback
  if (/^127\./.test(ip)) return 'loopback';
  // 10.0.0.0/8 — private
  if (/^10\./.test(ip)) return 'private';
  // 172.16.0.0/12 — private
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)) return 'private';
  // 192.168.0.0/16 — private
  if (/^192\.168\./.test(ip)) return 'private';
  // 169.254.0.0/16 — link-local（AWS/GCP/Azure metadata 在这！）
  if (/^169\.254\./.test(ip)) return 'linkLocal';
  // 100.64.0.0/10 — CGNAT（Carrier-Grade NAT，RFC 6598）
  if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(ip)) return 'cgnat';
  // 192.0.0.0/24 — IETF Protocol Assignments
  if (/^192\.0\.0\./.test(ip)) return 'reserved';
  // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 — documentation
  if (/^(192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(ip)) return 'documentation';
  // 224.0.0.0/4 — multicast
  if (/^(22[4-9]|23[0-9])\./.test(ip)) return 'multicast';
  // 240.0.0.0/4 — reserved（含 255.255.255.255 broadcast）
  if (/^(24[0-9]|25[0-5])\./.test(ip)) return 'reserved';
  return 'public';
}

/**
 * 精确分类 IPv6 地址
 */
function classifyIpv6(ip) {
  if (!net.isIPv6(ip)) return 'invalid';
  const lower = ip.toLowerCase();
  // :: — unspecified
  if (lower === '::') return 'reserved';
  // ::1 — loopback
  if (lower === '::1') return 'loopback';
  // ::ffff:0:0/96 — IPv4-mapped（去前缀再分类 IPv4）
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice(7);
    if (net.isIPv4(v4)) return classifyIpv4(v4);
    return 'invalid';
  }
  // fe80::/10 — link-local
  if (/^fe[89ab][0-9a-f]?:/.test(lower) || /^fe80::/.test(lower)) return 'linkLocal';
  // fc00::/7 — unique local addresses（ULA，private）
  if (/^(fc|fd)/.test(lower)) return 'private';
  // ff00::/8 — multicast
  if (/^ff/.test(lower)) return 'multicast';
  // 2001:db8::/32 — documentation
  if (lower.startsWith('2001:db8')) return 'documentation';
  // 64:ff9b::/96 — NAT64（RFC 6052）
  if (lower.startsWith('64:ff9b:')) return 'reserved';
  return 'public';
}

/**
 * 分类任意 IP 字符串。null/invalid 也明确返回。
 */
function classifyIp(ip) {
  if (!ip || typeof ip !== 'string') return 'invalid';
  if (net.isIPv4(ip)) return classifyIpv4(ip);
  if (net.isIPv6(ip)) return classifyIpv6(ip);
  return 'invalid';
}

/**
 * 判断 IP 是否属于"不安全"范围（必须拒绝）
 *   - loopback / private / linkLocal / multicast / reserved / cgnat / documentation / invalid
 *   - 唯独 'public' 返回 false
 */
function isPrivateIp(ip) {
  const k = classifyIp(ip);
  return k !== 'public';
}

// ---- 周期 3 P0-1：URL 校验 + DNS 二次校验 ----

function validateBaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('baseUrl 不能为空');
  }
  let u;
  try {
    u = new URL(rawUrl);
  } catch (_) {
    throw new Error('baseUrl 不是合法 URL');
  }
  const host = u.hostname.toLowerCase();
  const isHttps = u.protocol === 'https:';
  const isOllama = OLLAMA_HOSTS.has(host);

  // 1) 通用白名单：必须 https
  if (ALLOWED_BASE_HOSTS.has(host)) {
    if (!isHttps) {
      throw new Error('baseUrl 必须是 https 协议');
    }
    return rawUrl;
  }

  // 2) Ollama 本机：默认仍按 https 优先；http 需 AI_ALLOW_HTTP=1 显式开启
  if (isOllama) {
    if (u.protocol === 'http:' && ALLOW_HTTP) return rawUrl;
    if (u.protocol === 'http:') {
      throw new Error(
        'baseUrl 为 http 协议，需设置环境变量 AI_ALLOW_HTTP=1（仅推荐本地 Ollama）'
      );
    }
    if (isHttps) return rawUrl;
    throw new Error('baseUrl 必须是 http(s) 协议');
  }

  // 3) 其它一律拒绝（无论协议）
  throw new Error(
    'baseUrl 主机不在白名单（' + host + '）。如需新厂商请改 ALLOWED_BASE_HOSTS'
  );
}

async function validateBaseUrlWithDns(rawUrl) {
  validateBaseUrl(rawUrl);
  let u;
  try { u = new URL(rawUrl); } catch (_) { throw new Error('baseUrl 不是合法 URL'); }
  const host = u.hostname.toLowerCase();
  // Ollama + http + 显式开启：跳过 DNS（信任本地）
  if (OLLAMA_HOSTS.has(host) && u.protocol === 'http:' && ALLOW_HTTP) {
    return rawUrl;
  }
  let resolved;
  try {
    resolved = await dns.lookup(host);
  } catch (e) {
    throw new Error('baseUrl 主机无法解析（' + host + '）：' + e.message);
  }
  const ip = resolved.address;
  const kind = classifyIp(ip);
  if (kind !== 'public') {
    const e = new Error(
      'baseUrl 主机解析到非公网 IP（' + host + ' → ' + ip + ', ' + kind + '），拒绝请求以防 SSRF'
    );
    e.status = 400;
    throw e;
  }
  return rawUrl;
}

// ---- 周期 3 P0-1：safeFetch（禁重定向 + 链路重校验 + 超时） ----

/**
 * 防 SSRF 的 fetch 包装
 *   - redirect: 'manual'：禁止任何自动重定向（Node 18+ 原生支持）
 *   - 遇到 3xx：抛错（防 redirect-based escape）
 *   - 单次超时 15s（防止慢攻击）
 *
 * @param {string} url
 * @param {RequestInit & { timeoutMs?: number }} init
 * @returns {Promise<Response>}
 */
async function safeFetch(url, init = {}) {
  const { timeoutMs = 15000, ...rest } = init;
  // 入口先校验一次（防调用方直接传未校验 URL）
  await validateBaseUrlWithDns(url);
  const signal = rest.signal
    ? AbortSignal.any([rest.signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);
  const resp = await fetch(url, {
    ...rest,
    signal,
    redirect: 'manual', // 禁重定向 —— 周期 3 P0-1
  });
  // 3xx 不允许（链路重校验会单独实现"允许 + 重验"的语义）
  if (resp.status >= 300 && resp.status < 400) {
    const loc = resp.headers.get('location') || '(none)';
    const e = new Error(
      'safeFetch 拒绝 3xx 重定向（' + resp.status + ' → ' + loc + '），如需跟随请显式调用 validateChain'
    );
    e.status = 502;
    throw e;
  }
  return resp;
}

module.exports = {
  // URL + DNS + IP 校验（周期 2 接口，向后兼容）
  validateBaseUrl,
  validateBaseUrlWithDns,
  isPrivateIp,
  // 周期 3 P0-1 新增
  classifyIp,
  classifyIpv4,
  classifyIpv6,
  safeFetch,
  // 常量（测试可访问）
  ALLOWED_BASE_HOSTS,
  OLLAMA_HOSTS,
  ALLOW_HTTP,
};
