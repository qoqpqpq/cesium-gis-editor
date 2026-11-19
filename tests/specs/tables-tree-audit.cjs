'use strict';
/**
 * 门禁：tables-tree-audit（周期 134 / UR-4 Slice4 回归保护）
 *
 * Slice4 把表格/树簇（.attr-table* / .editor-layer* / .query-builder* / .qb-* / .usage-table*）
 * 的陈旧字面量清掉、值命名半径 --radius-6 全局收敛 --radius-sm、裸 px token 化。
 *
 * 运行：node tests/specs/tables-tree-audit.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const css = fs.readFileSync(path.join(ROOT, 'client', 'src', 'styles.css'), 'utf8');
const theme = fs.readFileSync(path.join(ROOT, 'client', 'src', 'theme.css'), 'utf8');

// 大括号配对解析
const rules = new Map();
{
  let i = 0, depth = 0, curSel = null, curStart = 0, selStart = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '{') {
      if (depth === 0) { curSel = css.slice(selStart, i).trim().replace(/\/\*[\s\S]*?\*\//g, '').trim(); curStart = i + 1; }
      depth += 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth === 0 && curSel !== null) { rules.set(curSel, css.slice(curStart, i)); curSel = null; selStart = i + 1; }
    } else if (depth === 0 && c === ';') { selStart = i + 1; }
    i += 1;
  }
}

// 表格/树簇选择器（前缀匹配）
const PREFIXES = ['.attr-table', '.attr-add-field', '.attr-drop-label', '.attr-saved-badge',
  '.editor-layer', '.editor-feature', '.query-builder', '.qb-', '.usage-table'];
const cluster = [...rules.keys()].filter((sel) => PREFIXES.some((p) => sel.startsWith(p)));

let pass = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) { pass += 1; console.log(`  [PASS] ${name}${detail ? '：' + detail : ''}`); }
  else { fails.push(name); console.log(`  [FAIL] ${name}${detail ? '：' + detail : ''}`); }
}

console.log('--- tables-tree-audit（周期 134 / 表格与树簇）---');
console.log(`（簇内 ${cluster.length} 个选择器）`);

const bodies = cluster.map((s) => rules.get(s)).join('\n');
const stripped = bodies.replace(/\/\*[\s\S]*?\*\//g, '');

// S1: 陈旧字面量全局清零（不只簇，含注释）
const stale = (css.match(/rgba\(\s*15\s*,\s*18\s*,\s*25|#e2e8f0|rgba\(\s*34\s*,\s*197\s*,\s*94|#0b1020|#6c8cff|var\(--color-blue-400\)|var\(--accent,\s*var\(--accent-500\)\)/g) || []);
check('S1: 陈旧字面量/死回退全局清零', stale.length === 0, stale.length ? `命中：${[...new Set(stale)].join('、')}` : '0 处');

// S2: --radius-6 定义与引用全零
const r6def = (css.match(/--radius-6\s*:/g) || []).length;
const r6ref = (css.match(/var\(--radius-6\)/g) || []).length;
check('S2: --radius-6 定义与引用全零（已收敛 --radius-sm）', r6def === 0 && r6ref === 0,
  `定义=${r6def}、引用=${r6ref}`);

// S3: 簇内 spacing/radius 属性零裸 px（top/right/bottom/left 属定位坐标，非间距，排除）
const SPACING_RE = /^\s*(padding[a-z-]*|margin[a-z-]*|gap|row-gap|column-gap|border-radius)\s*:/i;
const pxHits = [];
for (const decl of stripped.split(';')) {
  if (SPACING_RE.test(decl)) {
    const m = decl.replace(/var\([^)]*\)/g, '').match(/\b\d+(?:\.\d+)?px\b/g);
    if (m) pxHits.push(decl.trim().slice(0, 40));
  }
}
check('S3: 簇内间距/圆角类属性零裸 px', pxHits.length === 0, pxHits.length ? `命中 ${pxHits.length} 处：${pxHits[0]}` : '0 处');

// S4: thead 用 overlay-95
const thead = rules.get('.attr-table thead th') || '';
check('S4: .attr-table thead th 背景 token 化（--overlay-95）',
  /background:\s*var\(--overlay-95\)/.test(thead), 'rgba 字面量 → token');

// S5: btn-link active 无死回退
check('S5: .btn-link.active/.small.active 色 = --link',
  /color:\s*var\(--link\)/.test(rules.get('.btn-link.active, .btn-link.small.active') || ''),
  'Slice3 后续：去 --accent-500 死回退');

// S6: usage-table 无裸 px padding
const usage = (rules.get('.usage-table th,\n.usage-table td') || rules.get('.usage-table th, .usage-table td') || '');
const ut = Object.entries(rules).filter(([k]) => k.startsWith('.usage-table'));
const usageBody = ut.map(([, v]) => v).join('\n');
const usagePx = (usageBody.replace(/var\([^)]*\)/g, '').match(/\b\d+px\b/g) || []);
check('S6: .usage-table* 零裸 px', usagePx.length === 0, `命中 ${usagePx.length}`);

// S7: success-active-bg 已定义且被引用（周期137: 成对 = 暗 :root 1 + 亮块 1）
const saDef = (theme.match(/--success-active-bg\s*:/g) || []).length;
const saUse = /background:\s*var\(--success-active-bg\)/.test(rules.get('.attr-table-btn.primary:hover') || '');
check('S7: --success-active-bg 已定义且被 primary:hover 引用', saDef === 2 && saUse,
  `定义=${saDef}（暗:root+亮块成对）、引用=${saUse}`);

console.log(`--- summary: pass=${pass} fail=${fails.length} ---`);
if (fails.length) { console.log(`--- ${fails.join('、')} ---`); process.exit(1); }