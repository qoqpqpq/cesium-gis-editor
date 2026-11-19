'use strict';
/**
 * 门禁：chrome-secondary-audit（周期 135 / UR-4 Slice5 回归保护）
 *
 * Slice5 把全局 chrome + 二级控件（.nav-item / .tabs+.tab / .toast / .sandcastle-* /
 * .output-send-ai / .ai-auto-toggle / .ai-chip / .file-loader-btn / .file-drop-zone /
 * .editor-toolbar-btn / .editor-tool-btn / .editor-action-row .btn-link / .model-chip / .key-item）
 * 的硬编码过渡收敛 var(--duration) var(--ease)、裸 px token 化、toast 背景 token 化、
 * azure→cyan 渐变统一 --grad-brand、新增 --space-7px。
 *
 * 运行：node tests/specs/chrome-secondary-audit.cjs
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const css = fs.readFileSync(path.join(ROOT, 'client', 'src', 'styles.css'), 'utf8');

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

const CLUSTER = ['.nav-item', '.tab', '.toast', '.sandcastle-ai-btn', '.output-send-ai',
  '.ai-auto-toggle', '.ai-chip', '.sandcastle-run-btn', '.sandcastle-icon-btn',
  '.file-loader-btn', '.file-drop-zone', '.editor-toolbar-btn', '.editor-tool-btn',
  '.editor-action-row .btn-link', '.model-chip', '.key-item'];

let pass = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) { pass += 1; console.log(`  [PASS] ${name}${detail ? '：' + detail : ''}`); }
  else { fails.push(name); console.log(`  [FAIL] ${name}${detail ? '：' + detail : ''}`); }
}

console.log('--- chrome-secondary-audit（周期 135 / 全局 chrome + 二级控件）---');

const missing = CLUSTER.filter((s) => !rules.has(s));
check('K0: 簇内 16 个选择器全部存在', missing.length === 0, missing.length ? `缺失：${missing.join('、')}` : '16/16');

const bodies = CLUSTER.filter((s) => rules.has(s)).map((s) => rules.get(s)).join('\n');
const stripped = bodies.replace(/\/\*[\s\S]*?\*\//g, '');

// K1: 全站零硬编码过渡
const hardTrans = (css.replace(/\/\*[\s\S]*?\*\//g, '').match(/transition:[^;]*\b0\.\d+s\b/g) || []);
check('K1: 全站零硬编码过渡秒（transition 全走 var(--duration)）', hardTrans.length === 0,
  `命中 ${hardTrans.length}`);

// K2: 簇内间距/圆角零裸 px
const SPACING_RE = /^\s*(padding[a-z-]*|margin[a-z-]*|gap|row-gap|column-gap|border-radius)\s*:/i;
const pxHits = [];
for (const decl of stripped.split(';')) {
  if (SPACING_RE.test(decl)) {
    const m = decl.replace(/var\([^)]*\)/g, '').match(/\b\d+(?:\.\d+)?px\b/g);
    if (m) pxHits.push(decl.trim().slice(0, 40));
  }
}
check('K2: 簇内间距/圆角零裸 px', pxHits.length === 0, pxHits.length ? `命中 ${pxHits.length}：${pxHits[0]}` : '0 处');

check('K3: .toast 背景 token 化（--overlay-92）',
  /background:\s*var\(--overlay-92\)/.test(rules.get('.toast') || ''), 'rgba → token');

const brandGrad = (css.match(/linear-gradient\(\s*135deg,\s*var\(--primary\),\s*var\(--accent\)\s*\)/g) || []).length;
check('K4: 零未收敛 azure→cyan 渐变（全走 --grad-brand）', brandGrad === 0, `命中 ${brandGrad}`);

const space7 = (css.match(/--space-7px\s*:\s*7px/g) || []).length;
const tabUses7 = /padding:\s*var\(--space-7px\)/.test(rules.get('.tab') || '');
check('K5: --space-7px 已定义且 .tab 使用', space7 === 1 && tabUses7, `定义=${space7}、使用=${tabUses7}`);

check('K6: 簇内零死回退 var(--accent, var(--accent-500))',
  !/var\(--accent,\s*var\(--accent-500\)\)/.test(stripped));

console.log(`--- summary: pass=${pass} fail=${fails.length} ---`);
if (fails.length) { console.log(`--- ${fails.join('、')} ---`); process.exit(1); }