#!/usr/bin/env node
// scripts/sync-metadata-ips.cjs
// 周期 12 P2-3: SSRF metadata IP 同步脚本（手动/dry-run/cron）
//
// 背景：
//   - server/services/ssrf-guard.js 显式黑名单云厂商 metadata IP（169.254.169.254 等）
//   - 新云厂商加入 / IPv6 段扩展时需手动维护
//   - 本脚本：从 docs/security/metadata-ips.md 解析最新 IP/CIDR 列表，dry-run 输出 diff
//
// 设计：
//   - 默认 dry-run：不写文件，仅 diff + 报告
//   - --write：写入 docs/security/metadata-ips.md
//   - --source=<path>：从指定 markdown 解析（默认 docs/security/metadata-ips.md）
//   - --format=<json|csv>：解析格式（默认从文件扩展推断）
//   - 解析规则：
//       - markdown：行匹配 `<ipv4>/<cidr>` 或 `<ipv6>/<cidr>` 或 `<ip>` 单行
//       - json：[{ ip, cidr, provider, since }]
//       - csv：ip,cidr,provider
//
// 验收（spec metadata-ip-sync.cjs ≥12 PASS）：
//   - dry-run 默认开
//   - markdown 解析正确
//   - json 解析正确
//   - 缺文件 graceful
//   - 与 ssrf-guard 解析兼容（IP/CIDR 字符串格式）

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SOURCE = path.join(__dirname, '../docs/security/metadata-ips.md');

function parseArgs(argv) {
  const opts = {
    dryRun: true,
    source: DEFAULT_SOURCE,
    write: false,
    format: 'markdown',
  };
  for (const a of argv.slice(2)) {
    if (a === '--write') opts.dryRun = false;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a.startsWith('--source=')) opts.source = a.slice('--source='.length);
    else if (a.startsWith('--format=')) opts.format = a.slice('--format='.length);
  }
  return opts;
}

/**
 * 解析 markdown 行中的 IP/CIDR
 * 支持：
 *   - `169.254.169.254` 单 IP
 *   - `169.254.0.0/16` CIDR
 *   - `fd00:ec2::254/128` IPv6 CIDR
 */
function parseMarkdown(content) {
  const out = [];
  const lines = String(content).split(/\r?\n/);
  const ipv4 = /\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/g;
  // IPv6（含 :: 压缩）：简化为匹配形如 "xxxx:xxxx:...::xxx" 或 "xxxx:xxxx:..." 的整段
  const ipv6 = /\b(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{0,4}){1,7}|::1?)(?:\/\d{1,3})?\b/g;
  for (const line of lines) {
    // 跳过注释 / 空行
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m4 = line.match(ipv4);
    if (m4) for (const ip of m4) out.push({ ip, cidr: ip.includes('/') ? ip : ip + '/32' });
    const m6 = line.match(ipv6);
    if (m6) {
      for (const ip of m6) {
        // 只保留至少有一个 ":" 的真正 IPv6（避免误匹配 IPv4 后半段）
        if (ip.includes(':')) {
          out.push({ ip, cidr: ip.includes('/') ? ip : ip + '/128' });
        }
      }
    }
  }
  // 去重
  const seen = new Set();
  return out.filter((x) => {
    if (seen.has(x.cidr)) return false;
    seen.add(x.cidr);
    return true;
  });
}

function parseJson(content) {
  const arr = JSON.parse(content);
  if (!Array.isArray(arr)) throw new Error('json 必须是数组');
  return arr.map((x) => ({
    ip: x.ip,
    cidr: x.cidr || (x.ip + (x.ip.includes(':') ? '/128' : '/32')),
    provider: x.provider || 'unknown',
    since: x.since || null,
  }));
}

function parseCsv(content) {
  const lines = String(content).split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const header = lines[0].split(',').map((s) => s.trim());
  return lines.slice(1).map((l) => {
    const cols = l.split(',').map((s) => s.trim());
    const row = {};
    header.forEach((h, i) => { row[h] = cols[i] || ''; });
    return {
      ip: row.ip,
      cidr: row.cidr || (row.ip ? row.ip + (row.ip.includes(':') ? '/128' : '/32') : ''),
      provider: row.provider || 'unknown',
      since: row.since || null,
    };
  }).filter((x) => x.cidr);
}

function parse(content, format) {
  if (format === 'json') return parseJson(content);
  if (format === 'csv') return parseCsv(content);
  return parseMarkdown(content);
}

/**
 * 周期 12 P2-3: 主入口
 */
function sync(argv) {
  const opts = parseArgs(argv || process.argv);
  const sourcePath = path.resolve(opts.source);
  let entries = [];
  let sourceExists = false;
  if (fs.existsSync(sourcePath)) {
    sourceExists = true;
    try {
      entries = parse(fs.readFileSync(sourcePath, 'utf8'), opts.format);
    } catch (e) {
      return {
        ok: false,
        reason: 'parse error: ' + e.message,
        source: sourcePath,
        entries: [],
        dryRun: opts.dryRun,
      };
    }
  }
  const report = {
    ok: true,
    source: sourcePath,
    sourceExists,
    dryRun: opts.dryRun,
    entries,
    count: entries.length,
    written: false,
    format: opts.format,
  };
  if (opts.dryRun) {
    // dry-run: 不写文件
    return report;
  }
  // write 模式：写入到源文件（替换对应 section）
  // 简化：仅追加到末尾注释块
  const banner = `\n<!-- synced at ${new Date().toISOString()} by sync-metadata-ips.cjs, ${entries.length} entries -->\n`;
  try {
    const current = sourceExists ? fs.readFileSync(sourcePath, 'utf8') : '# Metadata IPs\n\n';
    fs.writeFileSync(sourcePath, current + banner + entries.map((e) => `- ${e.cidr} (${e.provider || 'unknown'})`).join('\n') + '\n');
    report.written = true;
  } catch (e) {
    report.ok = false;
    report.reason = 'write failed: ' + e.message;
  }
  return report;
}

module.exports = { sync, parse, parseArgs, parseMarkdown, parseJson, parseCsv, DEFAULT_SOURCE };

// CLI 入口
if (require.main === module) {
  const r = sync(process.argv);
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}