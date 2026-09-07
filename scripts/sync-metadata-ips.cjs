#!/usr/bin/env node
// scripts/sync-metadata-ips.cjs
// 周期 6 P0-1 续：metadata IP 黑名单"自动同步"脚本
//
// 背景：
//   周期 5 P0-1 已建立维护文档 `docs/security/metadata-ips.md` +
//   `tests/specs/metadata-ip-maintenance.cjs` 季度 cron 验证。
//   但 cron 只是"校验一致性"——不会主动发现新 IP。
//   本脚本做"半自动同步"：
//     1. 解析 docs/security/metadata-ips.md 的黑名单表（提取 IP + 厂商 + 备注）
//     2. 解析 server/services/ssrf-guard.js 的 METADATA_IPS_V4/V6 Set
//     3. 比对三方一致（文档 / 源文件 / runtime isMetadataIp）
//     4. 报告 diff（不修改文件，仅打印）
//     5. 可选：跑 DNS 验证 metadata host（metadata / metadata.google.internal）仍能解析到表内 IP
//
// 季度使用：
//   node scripts/sync-metadata-ips.cjs
//
// 退出码：
//   0 = 三方一致 + DNS 验证通过（或 DNS 不可达但有提示）
//   1 = 三方不一致
//   2 = 致命错误（文件缺失 / 解析失败）
//
// 设计原则：
//   - 不引入新依赖（Node 内置 fs + dns）
//   - 解析 markdown 表与 JS Set 字符串（不依赖 AST）
//   - 打印"建议修改"清单供 security-team 确认

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns').promises;

const ROOT = path.resolve(__dirname, '..');
const MD_PATH = path.join(ROOT, 'docs', 'security', 'metadata-ips.md');
const SRC_PATH = path.join(ROOT, 'server', 'services', 'ssrf-guard.js');

let pass = 0;
let fail = 0;
function record(name, ok, detail) {
  const tag = ok ? 'PASS' : 'FAIL';
  process.stdout.write(`  [${tag}] ${name}${detail ? ' — ' + detail : ''}\n`);
  if (ok) pass += 1; else fail += 1;
}

function die(msg, code = 2) {
  process.stderr.write(`FATAL: ${msg}\n`);
  process.exit(code);
}

function parseMarkdownTable(md) {
  // 解析 markdown 表格：找到 "### IPv4" / "### IPv6" 段下的 | ... | 行
  //   - 进入 section 后只在新一级 heading（##）或 EOF 时退出（不因空行 / 段落退出）
  //   - | --- 分隔行只跳过
  //   - | ... | 表格行提取第一个 backtick 包裹的 token
  const out = { v4: [], v6: [], host: [] };
  const lines = md.split(/\r?\n/);
  let cur = null;
  for (const line of lines) {
    // 一级或二级 heading 切换 section
    if (/^##\s+/.test(line)) {
      cur = null;
    }
    if (/^###\s+IPv4/i.test(line)) { cur = 'v4'; continue; }
    if (/^###\s+IPv6/i.test(line)) { cur = 'v6'; continue; }
    if (/^###\s+(主机|host|Hostname)/i.test(line)) { cur = 'host'; continue; }
    if (!cur) continue;
    if (/^\|\s*`([^`]+)`\s*\|/.test(line)) {
      const m = line.match(/^\|\s*`([^`]+)`\s*\|/);
      if (m) out[cur].push(m[1]);
    }
  }
  return out;
}

function parseSourceSet(src) {
  // 解析 ssrf-guard.js 的 METADATA_IPS_V4 = new Set([...])
  const out = { v4: [], v6: [] };
  const v4Match = src.match(/METADATA_IPS_V4\s*=\s*new\s+Set\(\[\s*([\s\S]*?)\s*\]\)/);
  if (v4Match) {
    const re = /'([^']+)'/g;
    let m;
    while ((m = re.exec(v4Match[1])) !== null) out.v4.push(m[1]);
  }
  const v6Match = src.match(/METADATA_IPS_V6\s*=\s*new\s+Set\(\[\s*([\s\S]*?)\s*\]\)/);
  if (v6Match) {
    const re = /'([^']+)'/g;
    let m;
    while ((m = re.exec(v6Match[1])) !== null) out.v6.push(m[1]);
  }
  return out;
}

function isIPv4(s) { return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s); }
function isIPv6(s) { return s.includes(':') && !s.includes(' '); }

function diffSets(arrA, arrB) {
  const a = new Set(arrA);
  const b = new Set(arrB);
  const onlyA = [...a].filter((x) => !b.has(x));
  const onlyB = [...b].filter((x) => !a.has(x));
  return { onlyA, onlyB };
}

async function checkDns(host, expectedIps) {
  try {
    const addrs = await dns.resolve4(host).catch(() => []);
    const v6 = await dns.resolve6(host).catch(() => []);
    const all = [...addrs, ...v6];
    const matched = expectedIps.filter((ip) => all.includes(ip));
    return { all, matched, ok: matched.length > 0 || all.length === 0 };
  } catch (e) {
    return { all: [], matched: [], ok: true /* unreachable OK */, error: e.message };
  }
}

async function main() {
  process.stdout.write('\n=== sync-metadata-ips (周期 6 P0-1 续) ===\n');

  if (!fs.existsSync(MD_PATH)) die(`Markdown 维护文档不存在: ${MD_PATH}`);
  if (!fs.existsSync(SRC_PATH)) die(`源文件不存在: ${SRC_PATH}`);

  const md = fs.readFileSync(MD_PATH, 'utf8');
  const src = fs.readFileSync(SRC_PATH, 'utf8');

  const mdIps = parseMarkdownTable(md);
  const srcIps = parseSourceSet(src);

  // 1. 文档与源文件一致性
  process.stdout.write('\n-- 1. 文档与源文件一致性 --\n');
  const v4Diff = diffSets(mdIps.v4, srcIps.v4);
  const v6Diff = diffSets(mdIps.v6, srcIps.v6);

  record('IPv4 文档 / 源文件 一致', v4Diff.onlyA.length === 0 && v4Diff.onlyB.length === 0,
    v4Diff.onlyA.length === 0
      ? (v4Diff.onlyB.length === 0 ? `n=${srcIps.v4.length}` : `源文件缺: ${v4Diff.onlyB.join(', ')}`)
      : `文档缺: ${v4Diff.onlyA.join(', ')}`);
  record('IPv6 文档 / 源文件 一致', v6Diff.onlyA.length === 0 && v6Diff.onlyB.length === 0,
    v6Diff.onlyA.length === 0
      ? (v6Diff.onlyB.length === 0 ? `n=${srcIps.v6.length}` : `源文件缺: ${v6Diff.onlyB.join(', ')}`)
      : `文档缺: ${v6Diff.onlyA.join(', ')}`);

  // 2. 分类正确性
  process.stdout.write('\n-- 2. 分类正确性 --\n');
  let v4ClassOk = true;
  for (const ip of srcIps.v4) {
    if (!isIPv4(ip)) { v4ClassOk = false; record(`IPv4 格式正确: ${ip}`, false, '格式非 IPv4'); break; }
  }
  if (v4ClassOk) record(`IPv4 全部格式正确 (n=${srcIps.v4.length})`, true);
  let v6ClassOk = true;
  for (const ip of srcIps.v6) {
    if (!isIPv6(ip)) { v6ClassOk = false; record(`IPv6 格式正确: ${ip}`, false, '格式非 IPv6'); break; }
  }
  if (v6ClassOk) record(`IPv6 全部格式正确 (n=${srcIps.v6.length})`, true);

  // 3. 运行时 isMetadataIp
  process.stdout.write('\n-- 3. 运行时 isMetadataIp --\n');
  const { isMetadataIp } = require(path.join(ROOT, 'server', 'services', 'ssrf-guard'));
  for (const ip of srcIps.v4) {
    record(`isMetadataIp('${ip}') = true`, isMetadataIp(ip) === true);
  }
  for (const ip of srcIps.v6) {
    record(`isMetadataIp('${ip}') = true`, isMetadataIp(ip) === true);
  }
  record("isMetadataIp('8.8.8.8') = false", isMetadataIp('8.8.8.8') === false);

  // 4. DNS 验证（可选）
  process.stdout.write('\n-- 4. DNS 验证（可选） --\n');
  const meta = await checkDns('metadata', ['169.254.169.254']);
  record('DNS 解析 metadata 含黑名单 IP', meta.ok, meta.matched.length > 0 ? `matched=${meta.matched.join(',')}` : (meta.error ? `不可达: ${meta.error}` : `实际 IP: ${meta.all.join(',')}`));
  const gcp = await checkDns('metadata.google.internal', ['169.254.169.254']);
  record('DNS 解析 metadata.google.internal', gcp.ok, gcp.matched.length > 0 ? `matched=${gcp.matched.join(',')}` : (gcp.error ? `不可达: ${gcp.error}` : `实际 IP: ${gcp.all.join(',')}`));

  // 5. 输出 diff / 建议（不修改文件）
  process.stdout.write('\n-- 5. 建议清单 --\n');
  if (v4Diff.onlyA.length > 0) {
    process.stdout.write(`  → 源文件缺 IPv4: ${v4Diff.onlyA.join(', ')}（需在 METADATA_IPS_V4 加）\n`);
  }
  if (v4Diff.onlyB.length > 0) {
    process.stdout.write(`  → 文档缺 IPv4: ${v4Diff.onlyB.join(', ')}（需在 metadata-ips.md 表格加）\n`);
  }
  if (v6Diff.onlyA.length > 0) {
    process.stdout.write(`  → 源文件缺 IPv6: ${v6Diff.onlyA.join(', ')}\n`);
  }
  if (v6Diff.onlyB.length > 0) {
    process.stdout.write(`  → 文档缺 IPv6: ${v6Diff.onlyB.join(', ')}\n`);
  }
  if (v4Diff.onlyA.length === 0 && v4Diff.onlyB.length === 0 && v6Diff.onlyA.length === 0 && v6Diff.onlyB.length === 0) {
    process.stdout.write('  → 三方完全一致，无需修改\n');
  }

  process.stdout.write(`\n--- summary: pass=${pass} fail=${fail} ---\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => die(e.message || String(e), 2));
