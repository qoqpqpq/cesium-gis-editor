// scripts/design-token-audit.cjs
// 周期 38 UR-1: 设计 token 审计（区分「token 定义」vs「组件硬编码用法」）
//
// 目的：为 UI 重构 UR-1「设计审计与 token 收敛」提供可量化、可复现的基线与验收口径。
// 关键口径：
//   - 「token 定义」= 在 :root / [data-theme] 等选择器块内声明 `--var: <value>`，是合法的 token 源，不计入硬编码。
//   - 「组件硬编码用法」= 在组件规则（:root 之外）里直接写 #hex / rgb() / rgba()，应迁移为 var(--token)，计入硬编码。
//   - 仅统计 CSS 文件（.css），不扫描 JS/JSX 内联样式（后续阶段再评估）。
//
// 用法：
//   node scripts/design-token-audit.cjs                 # 打印报告 + 退出码（有硬编码→0，纯报告不 fail）
//   node scripts/design-token-audit.cjs --json          # 输出 JSON（供 spec 断言）
//   node scripts/design-token-audit.cjs --max N         # 组件硬编码用法超过 N 则 exit 1（验收用）
//
// 退出码：0 = 正常（无论是否有硬编码）；1 = --max 阈值被超过 或 致命错误。

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CLIENT_SRC = path.join(__dirname, '..', 'client', 'src');

/** 递归收集 CSS 文件 */
function collectCssFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectCssFiles(full, acc);
    else if (entry.isFile() && entry.name.endsWith('.css')) acc.push(full);
  }
  return acc;
}

/** 判断某行是否在「token 定义块」内（:root / [data-theme] / :root[data-theme] 等）*/
function analyzeFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const lines = src.split('\n');
  const HEX_RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
  const RGB_RE = /\brgba?\(\s*\d+\s*,/g;

  let inTokenBlock = false;
  let blockDepth = 0;
  let tokenDefs = 0;        // token 定义条目数（块内 --var: 声明）
  let componentHex = 0;     // 组件规则硬编码 hex
  let componentRgb = 0;     // 组件规则硬编码 rgb/rgba
  const hotspots = [];      // 组件硬编码热点行

  for (let ln = 1; ln <= lines.length; ln++) {
    const line = lines[ln - 1];
    const trimmed = line.trim();

    // 进入 token 定义块（:root / [data-theme...]）
    if (!inTokenBlock && /(^|[\s,])(:root|\[data-theme[^\]]*\])\s*\{/.test(line)) {
      inTokenBlock = true;
      blockDepth = lineCountBrace(line);
      // 本行可能同时有 token 定义
      tokenDefs += countTokenDefs(line);
      continue;
    }
    if (inTokenBlock) {
      blockDepth += countBraceDelta(line);
      tokenDefs += countTokenDefs(line);
      if (blockDepth <= 0) inTokenBlock = false;
      continue;
    }

    // 组件规则（token 块外）——统计硬编码颜色
    // 跳过纯注释行
    if (trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
    // 周期 43 技术债偿还: 排除 var(--tok, #fallback) 内的 fallback 颜色。
    //   fallback 是「token 缺失时的兜底」，本身已在用 token，不应计为硬编码。
    //   做法: 先摘掉所有 var(...) 整段，再统计剩余的真硬编码颜色。
    const strippedLine = line.replace(/var\(\s*--[a-zA-Z0-9-]+[^)]*\)/g, '');
    const hexes = strippedLine.match(HEX_RE) || [];
    const rgbs = strippedLine.match(RGB_RE) || [];
    if (hexes.length || rgbs.length) {
      componentHex += hexes.length;
      componentRgb += rgbs.length;
      hotspots.push({ line: ln, count: hexes.length + rgbs.length, snippet: trimmed.slice(0, 80) });
    }
  }

  return {
    file: path.relative(path.join(__dirname, '..'), filePath),
    tokenDefs,
    componentHex,
    componentRgb,
    componentTotal: componentHex + componentRgb,
    hotspots: hotspots.sort((a, b) => b.count - a.count),
  };
}

function countBraceDelta(line) {
  return (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
}
function lineCountBrace(line) {
  return (line.match(/\{/g) || []).length;
}
function countTokenDefs(line) {
  // 形如 `--some-var: value;`
  return (line.match(/^\s*--[a-zA-Z0-9-]+\s*:/gm) || []).length;
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const maxIdx = argv.indexOf('--max');
  const max = maxIdx !== -1 ? parseInt(argv[maxIdx + 1], 10) : null;

  if (!fs.existsSync(CLIENT_SRC)) {
    console.error(`client/src 不存在: ${CLIENT_SRC}`);
    process.exit(1);
  }
  const files = collectCssFiles(CLIENT_SRC).sort();
  const results = files.map(analyzeFile);

  const totalTokenDefs = results.reduce((a, r) => a + r.tokenDefs, 0);
  const totalComponent = results.reduce((a, r) => a + r.componentTotal, 0);
  const totalHex = results.reduce((a, r) => a + r.componentHex, 0);
  const totalRgb = results.reduce((a, r) => a + r.componentRgb, 0);

  if (asJson) {
    console.log(JSON.stringify({
      files: results.map((r) => ({ file: r.file, tokenDefs: r.tokenDefs, componentTotal: r.componentTotal })),
      totalTokenDefs,
      totalComponent,
      totalHex,
      totalRgb,
    }, null, 2));
    process.exit(0);
  }

  console.log('=== 设计 token 审计（UR-1 基线）===');
  console.log(`扫描 CSS 文件: ${files.length}`);
  console.log(`token 定义条目（:root/[data-theme] 块内 --var:）: ${totalTokenDefs}`);
  console.log(`组件规则硬编码颜色（应迁移为 var(--token)）: ${totalComponent}  (hex ${totalHex} / rgb ${totalRgb})`);
  console.log('');
  console.log('按文件:');
  for (const r of results) {
    if (r.componentTotal > 0 || r.tokenDefs > 0) {
      console.log(`  ${r.file.padEnd(40)} token定义 ${String(r.tokenDefs).padStart(4)}  组件硬编码 ${String(r.componentTotal).padStart(4)}`);
    }
  }
  console.log('');
  console.log('Top 硬编码热点（组件规则）:');
  const allHot = results.flatMap((r) => r.hotspots.map((h) => ({ ...h, file: r.file })))
    .sort((a, b) => b.count - a.count).slice(0, 12);
  for (const h of allHot) {
    console.log(`  ${h.file}:${h.line} x${h.count}  ${h.snippet}`);
  }

  if (max !== null) {
    if (totalComponent > max) {
      console.error(`\n[FAIL] 组件硬编码颜色 ${totalComponent} 超过阈值 ${max}`);
      process.exit(1);
    }
    console.log(`\n[PASS] 组件硬编码颜色 ${totalComponent} ≤ 阈值 ${max}`);
  }
  process.exit(0);
}

main();