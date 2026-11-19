'use strict';
/**
 * 门禁：geo-dark-palette-audit（周期 131 / UR-4 Slice1 回归保护）
 *
 * 用户 2026-11-19 拍板：主题/界面/UI 完全重设计 → 方向「深色专业 GIS 仪表盘」。
 * Slice1 交付了 Geo Dark 主题基底（配色/圆角/地图要素默认色）。本门禁锁死该基线，
 * 防止后续周期在做组件级重构时把配色/密度偷偷改回 indigo-violet 旧体系。
 *
 * 检查项：
 *   D1 暗主题基底 --bg == #0d1117（graphite，非旧 #0b1020）
 *   D2 品牌 --primary-500 == #3b9eff（azure）
 *   D3 旧 indigo/violet 色系字面量（#6c8cff / #c4a3ff / #0b1020）在 client/src 内为 0
 *   D4 圆角收敛：--radius-md <= 8px（专业仪表盘密度）
 *   D5 语义三色齐备（--success/--warn/--danger 均为 Geo Dark 值）
 *   D6 地图要素默认描边 == --primary-500 azure（useDrawing 默认 strokeColor）
 *
 * 运行：node tests/specs/geo-dark-palette-audit.cjs
 * 退出码：0 = 全通过；1 = 有项失败
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const STYLES = path.join(ROOT, 'client', 'src', 'styles.css');
const THEME = path.join(ROOT, 'client', 'src', 'theme.css');
const DRAWING = path.join(ROOT, 'client', 'src', 'pages', 'gis', 'editor', 'hooks', 'useDrawing.js');

const styles = fs.readFileSync(STYLES, 'utf8');
const theme = fs.readFileSync(THEME, 'utf8');
const drawing = fs.readFileSync(DRAWING, 'utf8');

// 递归收集 client/src 下 css/js/jsx，供 D3 全量扫描
const SRC = path.join(ROOT, 'client', 'src');
const walked = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(css|js|jsx)$/.test(entry.name)) walked.push(p);
  }
})(SRC);

let pass = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`  [PASS] ${name}${detail ? '：' + detail : ''}`);
  } else {
    fails.push(name);
    console.log(`  [FAIL] ${name}${detail ? '：' + detail : ''}`);
  }
}

console.log('--- geo-dark-palette-audit（周期 131 / Geo Dark 基线保护）---');

check('D1: 暗主题 --bg == #0d1117', /--bg:\s*#0d1117/i.test(styles), 'graphite 基底');
check('D2: --primary-500 == #3b9eff', /--primary-500:\s*#3b9eff/i.test(theme), 'azure 品牌色');

let legacy = 0;
const legacyRe = /#(6c8cff|c4a3ff|0b1020)\b/gi;
for (const f of walked) {
  const src = fs.readFileSync(f, 'utf8');
  legacy += (src.match(legacyRe) || []).length;
}
check('D3: 旧 indigo/violet 字面量 == 0', legacy === 0, `命中 ${legacy} 处（含注释）`);

const radiusMd = /--radius-md:\s*(\d+(?:\.\d+)?)px/.exec(styles);
check(
  'D4: --radius-md <= 8px（专业密度）',
  Boolean(radiusMd) && parseFloat(radiusMd[1]) <= 8,
  radiusMd ? `当前 ${radiusMd[1]}px` : '未定义',
);

const okSem =
  /--success:\s*#3fb950/i.test(styles) &&
  /--warn:\s*#d29922/i.test(styles) &&
  /--danger:\s*#f85149/i.test(styles);
check('D5: 语义三色齐备（success/warn/danger）', okSem, '#3fb950 / #d29922 / #f85149');

check(
  'D6: 地图要素默认描边 == azure（useDrawing）',
  /strokeColor:\s*['"]#3b9eff['"]/.test(drawing),
  '与 UI 品牌色同源',
);

console.log(`--- summary: pass=${pass} fail=${fails.length} ---`);
if (fails.length) {
  console.log(`--- ${fails.join('、')} ---`);
  process.exit(1);
}