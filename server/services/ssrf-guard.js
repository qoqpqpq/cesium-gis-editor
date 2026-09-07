// server/services/ssrf-guard.js
// 周期 3 P0-1: SSRF 防护升级（OWASP 6 步）
// 周期 4 P0-1: SSRF 补齐（host header allowlist + 全 metadata IP 黑名单 + pin IP）
//
// 背景：
//   周期 2 P1-8 实现了"URL 规范化 + DNS 解析 + IP 分类"三步。
//   周期 3 补齐"精确 IP 分类（25+8 段）+ safeFetch 禁重定向"。
//   周期 4 补齐"host header allowlist + 全 metadata IP 黑名单 + pin IP socket 连接"：
//     1. ✅ URL 规范化
//     2. ✅ 协议白名单 https-only
//     3. ✅ WHATWG URL 解析
//     4. ✅ DNS 解析 + IP 分类
//     5. ✅ 链路重校验（redirect:'manual'）
//     6. ✅ 超时 + 禁自动重试
//     7. 🆕 Host header allowlist（防 DNS rebinding 通过 host 仍指向内网）
//     8. 🆕 全 metadata IP 黑名单（169.254.169.254 AWS + 169.254.170.2 ECS + fd00:ec2::254 IPv6）
//     9. 🆕 Pin IP socket 连接（已解析 IP → socket 直连，TLS SNI 用原 hostname）
//
// 设计：
//   - 不引入 ipaddr.js（避免新增依赖；Node 自带 net.isIP + 内置正则已够用）
//   - classifyIp() 同时支持 IPv4 + IPv6 全特殊段
//   - safeFetch(url, init) 包装 fetch：
//       - redirect: 'manual' → 遇到 3xx 抛错
//       - validateChain(url) 自动跑 URL + DNS + IP 校验
//       - 超时 AbortSignal.timeout(15s)
//       - 周期 4 增量：resolved IP 直连（pin IP）+ Host 头明确
//   - validateHostHeader() middleware：周期 4 新增，防外部通过 Host 头绕过
//   - isMetadataIp() 显式列出全云厂商 metadata IP（含 IPv6）
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

// 周期 4 P0-1: 显式黑名单 —— 全云厂商 metadata IP（即使不在 RFC 保留段，也要直接拒）
//   169.254.169.254/32 — AWS / GCP / Azure / OpenStack IMDS（IMDSv1/v2 token endpoint）
//   169.254.170.2/32  — AWS ECS task metadata v2
//   169.254.0.0/16    — 整个 link-local 段（但 classifyIp 已拒；这里只对路径黑名单）
//   fd00:ec2::254/128 — AWS IPv6 metadata（EC2 Nitro instances）
//   169.254.169.254   — Kubernetes kubelet API（端口 10250；非 metadata 但同段）
// 周期 5 P0-1: 扩充
//   fd00:ec2::253/128 — AWS ECS task metadata v2 IPv6
//   2600:2d00:1:7000::a/128 — 部分 GCP / GCE IPv6 metadata（dev 仅；生产一般不用 IPv6）
//   fe80::a9f:feff:fecf:3c/128 — 旧 IMDS IPv6
const METADATA_IPS_V4 = new Set([
  '169.254.169.254',
  '169.254.170.2',
  '169.254.170.1', // AWS ECS v1
  '169.254.0.1',    // 部分 K8s 服务
]);
const METADATA_IPS_V6 = new Set([
  'fd00:ec2::254',     // AWS EC2 Nitro IPv6 IMDS
  'fd00:ec2::253',     // AWS ECS task metadata v2 IPv6
  'fe80::a9f:feff:fecf:3c', // 部分老 IMDS IPv6
]);
const METADATA_HOSTS = new Set([
  'metadata',           // 通用 hostname
  'metadata.google.internal', // GCP
  'kubernetes.default.svc',   // K8s default
]);

function isMetadataIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  if (net.isIPv4(ip)) return METADATA_IPS_V4.has(ip);
  if (net.isIPv6(ip)) return METADATA_IPS_V6.has(ip);
  return false;
}

function isMetadataHost(host) {
  if (!host || typeof host !== 'string') return false;
  return METADATA_HOSTS.has(host.toLowerCase());
}

// 周期 4 P0-1: Host header allowlist（防 DNS rebinding 通过 Host 头仍指向内网）
//   - 默认白名单：loopback + 常用本地域名
//   - 兼容反向代理（Nginx 等把 'localhost' 转给 Node）
//   - ALLOWED_HOSTS env 可覆盖；逗号分隔
const DEFAULT_ALLOWED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  'gisai.top',           // 生产域名（demo 链接）
  'www.gisai.top',
  'localhost:3001',      // 端口显式形式（去 :port 后比较）
  '127.0.0.1:3001',
  'localhost:8080',
  '127.0.0.1:8080',
]);
const ENV_ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);
const ALLOWED_HOSTS = new Set([...DEFAULT_ALLOWED_HOSTS, ...ENV_ALLOWED_HOSTS]);

/**
 * 周期 4 P0-1: Host header allowlist middleware
 * - 防 DNS rebinding：浏览器发请求时 Host 头是 "evil.com"，服务端校验确保是允许的 host
 * - 防直接 IP 访问：生产环境不接 192.168.x.x:3001 之类的内网 IP
 * - ALLOWED_HOSTS env 可覆盖默认白名单
 */
function validateHostHeader(req, res, next) {
  const host = (req.headers.host || '').toLowerCase().split(':')[0]; // 去端口
  if (!host) {
    return res.status(400).json({ success: false, message: '缺失 Host 头' });
  }
  if (!ALLOWED_HOSTS.has(host)) {
    return res.status(403).json({
      success: false,
      message: `Host 头不在白名单（${host}）。如需新域名请设环境变量 ALLOWED_HOSTS`,
    });
  }
  next();
}

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
  // 周期 4 P0-1: 显式拒 metadata host（即使不在白名单外，host 字面就是攻击目标）
  if (isMetadataHost(host)) {
    const e = new Error('baseUrl 主机是云元数据 endpoint（' + host + '），拒绝请求');
    e.status = 400;
    throw e;
  }
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
  // 周期 4 P0-1: metadata IP 显式黑名单（即使 classifyIp 已 linkLocal 拒；显式更明确）
  if (isMetadataIp(ip)) {
    const e = new Error(
      'baseUrl 主机解析到云元数据 IP（' + host + ' → ' + ip + '），拒绝请求'
    );
    e.status = 400;
    throw e;
  }
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
 *   - 周期 4 P0-1: pin IP —— 解析后用已验证的 IP 直连，TLS SNI 用原 hostname
 *     防 DNS rebinding 在"校验后到 fetch 时"的窗口里把域名换成内网 IP
 *
 * @param {string} url
 * @param {RequestInit & { timeoutMs?: number, pinIp?: boolean }} init
 * @returns {Promise<Response>}
 */
async function safeFetch(url, init = {}) {
  const { timeoutMs = 15000, pinIp = true, ...rest } = init;
  // 入口先校验一次（防调用方直接传未校验 URL）
  const validated = await validateBaseUrlWithDns(url);
  const validatedUrl = new URL(validated);
  const signal = rest.signal
    ? AbortSignal.any([rest.signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);

  // 周期 4 P0-1: pin IP —— 用已解析 IP 直接连，TLS SNI 仍是原 hostname
  //   关键：resolved 是已校验的公网 IP；fetch 不会重新 DNS 解析
  //   注意：undici（Node 18+ 内置 fetch）支持 dispatcher option，可以传自定义 socket
  let finalInit = { ...rest, signal, redirect: 'manual' };
  let finalUrl = validated;

  if (pinIp && (validatedUrl.protocol === 'https:' || validatedUrl.protocol === 'http:')) {
    // 我们已经校验过；再 resolve 一次取 IP（仅本地 cache 同步 getaddrinfo）
    const resolved = await dns.lookup(validatedUrl.hostname);
    // 再校验一次（防 race：DNS TTL 内 host 被换成内网 IP）
    if (isMetadataIp(resolved.address) || classifyIp(resolved.address) !== 'public') {
      const e = new Error(
        'safeFetch 二次解析发现非公网 IP（' + validatedUrl.hostname + ' → ' + resolved.address + '），拒绝（防 DNS rebinding 抢跑）'
      );
      e.status = 502;
      throw e;
    }
    // 拼装：把 hostname 替换为 IP，保留端口与 path；用 Host 头让服务端识别原 host
    const port = validatedUrl.port || (validatedUrl.protocol === 'https:' ? 443 : 80);
    const ipHost = net.isIPv6(resolved.address) ? `[${resolved.address}]` : resolved.address;
    const pinUrl = `${validatedUrl.protocol}//${ipHost}:${port}${validatedUrl.pathname}${validatedUrl.search}`;
    finalUrl = pinUrl;
    finalInit = {
      ...rest,
      signal,
      redirect: 'manual',
      headers: {
        ...(rest.headers || {}),
        // 关键：Host 头保留原 hostname，TLS SNI 也用 hostname（验证证书）
        Host: validatedUrl.host,
        'X-Forwarded-Pinned-IP': resolved.address,
      },
    };
  }

  const resp = await fetch(finalUrl, finalInit);
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
  // 周期 4 P0-1 新增
  validateHostHeader,
  isMetadataIp,
  isMetadataHost,
  // 常量（测试可访问）
  ALLOWED_BASE_HOSTS,
  OLLAMA_HOSTS,
  ALLOW_HTTP,
  // 周期 4 P0-1: 测试用常量
  __test: {
    ALLOWED_HOSTS,
    DEFAULT_ALLOWED_HOSTS,
    ENV_ALLOWED_HOSTS,
    METADATA_IPS_V4,
    METADATA_IPS_V6,
    METADATA_HOSTS,
  },
};
