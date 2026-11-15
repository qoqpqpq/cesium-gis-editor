// scripts/css-duplication-audit.cjs
// 周期 46 UR-2: CSS 重复声明审计（为「更简洁」提供可量化基线与字号阶梯提案）
//
// 目的：UR-2「布局与密度简化」第一步。量化 styles.css 的声明重复度，
//       重点产出「字号阶梯提案」（font-size 硬编码收敛为 token 的依据）。
//
// 口径：
//   - 只扫 .css 文件（本轮 styles.css + theme.css）。
//   - 统计「声明行」频次（如 font-size: 12px;），识别最高频重复。
//   - 产出 font-size 阶梯提案：把高频 px 字号映射到语义 token（--fs-xs/sm/base/lg...）。
//
// 用法：
//   node scripts/css-duplication-audit.cjs           # 人类可读报告
//   node scripts/css-duplication-audit.cjs --json    # JSON（供 spec 断言）
//   node scripts/css-duplication-audit.cjs --prop font-size   # 只看某属性

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CLIENT_SRC = path.join(__dirname, '..', 'client', 'src');

function collectCssFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collectCssFiles(full, acc);
    else if (e.isFile() && e.name.endsWith('.css')) acc.push(full);
  }
  return acc;
}

function analyze(opts = {}) {
  const propFilter = opts.prop || null;
  const files = collectCssFiles(CLIENT_SRC).sort();
  const declCounter = new Map();   // "prop: value" -> count
  const fontSizeCounter = new Map(); // "12px" -> count
  let totalDecls = 0;
  let totalLines = 0;
  const perFile = [];

  for (const f of files) {
    const rel = path.relative(path.join(__dirname, '..'), f);
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    let fileDecls = 0;
    let inBlock = false;
    for (const line of lines) {
      totalLines += 1;
      const st = line.trim();
      // 统计声明行 prop: value;
      const m = st.match(/^([a-zA-Z-]+)\s*:\s*([^;]+);$/);
      if (m) {
        const prop = m[1].toLowerCase();
        const val = m[2].trim();
        if (propFilter && prop !== propFilter) continue;
        totalDecls += 1;
        fileDecls += 1;
        const key = `${prop}: ${val}`;
        declCounter.set(key, (declCounter.get(key) || 0) + 1);
        if (prop === 'font-size') {
          fontSizeCounter.set(val, (fontSizeCounter.get(val) || 0) + 1);
        }
      }
    }
    perFile.push({ file: rel, lines: lines.length, decls: fileDecls });
  }

  // 字号阶梯提案：按 px 值聚合
  const fontSizes = [...fontSizeCounter.entries()]
    .map(([size, count]) => ({ size, count }))
    .sort((a, b) => {
      const pa = parseFloat(a.size), pb = parseFloat(b.size);
      if (!isNaN(pa) && !isNaN(pb)) return pa - pb;
      return b.count - a.count;
    });

  const topDecl = [...declCounter.entries()]
    .map(([k, count]) => ({ decl: k, count }))
    .sort((a, b) => b.count - a.count);

  return { files: perFile, totalLines, totalDecls, topDecl, fontSizes, propFilter };
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const propIdx = argv.indexOf('--prop');
  const prop = propIdx !== -1 ? argv[propIdx + 1] : null;

  const r = analyze({ prop });

  if (asJson) {
    console.log(JSON.stringify({
      totalLines: r.totalLines,
      totalDecls: r.totalDecls,
      propFilter: r.propFilter,
      files: r.files,
      topDecl: r.topDecl.slice(0, 20),
      fontSizes: r.fontSizes,
    }, null, 2));
    process.exit(0);
  }

  console.log('=== CSS 重复声明审计（UR-2 基线）===');
  console.log(`扫描文件: ${r.files.length}  总行数: ${r.totalLines}  声明总数: ${r.totalDecls}${r.propFilter ? `  (过滤属性: ${r.propFilter})` : ''}`);
  console.log('');
  console.log('按文件:');
  for (const f of r.files) console.log(`  ${f.file.padEnd(36)} 行 ${String(f.lines).padStart(5)}  声明 ${String(f.decls).padStart(4)}`);
  console.log('');
  console.log('Top 重复声明（去重后按频次）:');
  for (const d of r.topDecl.slice(0, 15)) console.log(`  ${String(d.count).padStart(4)}×  ${d.decl}`);
  console.log('');
  console.log('font-size 阶梯（px 升序，收敛为 token 的依据）:');
  for (const f of r.fontSizes) console.log(`  ${String(f.count).padStart(4)}×  ${f.size}`);
  process.exit(0);
}

main();