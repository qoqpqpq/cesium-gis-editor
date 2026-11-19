'use strict';
/**
 * 门禁：panel-family-audit（周期 136 / UR-4 Slice6 回归保护）
 *
 * Slice6 把面板/会话/键位族（.panel-* / .session-* / .key-* / .usage-panel-* /
 * .usage-session-summary / .ai-panel-header / .ai-key-btn / .col-collapse-bar）的裸 px
 * token 化，陈旧字面量 #1f242d 清零（面板族）。
 *
 * 运行：node tests/specs/panel-family-audit.cjs
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const css = fs.readFileSync(path.join(ROOT, 'client', 'src', 'styles.css'), 'utf8');

const FAM = ['panel', 'session', 'key-', 'key_', 'editor-style', 'editor-section',
  'editor-layer', 'collapsible', 'collapse', 'editor-panel', 'style-panel', 'usage-'];

// 按选择器拆分块
const rules = new Map();
const lines = css.split('\n');
let i = 0;
while (i < lines.length) {
  const m = lines[i].match(/^\s*([.#][^{]*)\{/);
  if (m) {
    const sel = m[1].trim();
    let depth = 0, body = [], j = i;
    do { depth += (lines[j].match(/\{/g) || []).length - (lines[j].match(/\}/g) || []).length; if (depth > 0) body.push(lines[j]); j++; } while (j < lines.length && depth > 0);
    rules.set(sel, body.join('\n'));
    i = j;
  } else i++;
}

let pass = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) { pass += 1; console.log(`  [PASS] ${name}${detail ? '：' + detail : ''}`); }
  else { fails.push(name); console.log(`  [FAIL] ${name}${detail ? '：' + detail : ''}`); }
}

console.log('--- panel-family-audit（周期 136 / 面板头部与节）---');

const famRules = [...rules.entries()].filter(([sel]) => FAM.some((f) => sel.includes(f)));
const stripped = famRules.map(([, v]) => v).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');

// P1: 面板族 spacing 零裸 px
const SPACING_RE = /^\s*(padding[a-z-]*|margin[a-z-]*|gap|row-gap|column-gap)\s*:/i;
const pxHits = [];
for (const decl of stripped.split(';')) {
  if (SPACING_RE.test(decl)) {
    const b = decl.replace(/var\([^)]*\)/g, '').match(/\b\d+(?:\.\d+)?px\b/g);
    if (b) pxHits.push(decl.trim().slice(0, 40));
  }
}
check('P1: 面板族 spacing 零裸 px', pxHits.length === 0, pxHits.length ? `命中 ${pxHits.length}：${pxHits[0]}` : '0 处');

// P2: 面板族零陈旧 rgba/hex（无 var() 值）
const stale = [];
for (const decl of stripped.split(';')) {
  if (/(rgba\(|#[0-9a-fA-F]{3,8})/.test(decl) && !/var\(--/.test(decl)) stale.push(decl.trim().slice(0, 40));
}
check('P2: 面板族零陈旧 rgba/hex', stale.length === 0, stale.length ? `命中 ${stale.length}：${stale[0]}` : '0 处');

// P3: 关键面板头部已 token 化
check('P3: .panel-header/.panel-content padding token 化',
  /padding:\s*var\(--space-10px\) var\(--space-14px\)/.test(rules.get('.panel-header') || '') &&
  /padding:\s*var\(--space-3\) var\(--space-14px\)/.test(rules.get('.panel-content') || ''),
  '10px 14px / 12px 14px → token');

// P4: 会话/键位已 token 化
check('P4: .session-item/.key-badge/.key-switcher h4 token 化',
  /padding:\s*var\(--space-2\) var\(--space-10px\)/.test(rules.get('.session-item') || '') &&
  /padding:\s*var\(--space-2px\) var\(--space-6px\)/.test(rules.get('.key-badge') || '') &&
  /margin:\s*0 0 var\(--space-2\) 0/.test(rules.get('.key-switcher h4') || ''),
  'session-item / key-badge / key-switcher h4');

// P5: 编辑层面板头部已 token 化（spacing 零裸 px 且零陈旧字面量）
const editorHead = ['.editor-style-panel', '.editor-style-panel-header', '.editor-section-title', '.editor-section-meta'];
const ehStale = [];
let ehPx = [];
for (const s of editorHead) {
  const body = rules.get(s) || '';
  for (const decl of body.split(';')) {
    if (SPACING_RE.test(decl)) {
      const b = decl.replace(/var\([^)]*\)/g, '').match(/\b\d+(?:\.\d+)?px\b/g);
      if (b) ehPx.push(s + ':' + decl.trim().slice(0, 30));
    }
    if (/(rgba\(|#[0-9a-fA-F]{3,8})/.test(decl) && !/var\(--/.test(decl)) ehStale.push(s + ':' + decl.trim().slice(0, 30));
  }
}
check('P5: 编辑层面板头部零裸 px/陈旧字面量', ehPx.length === 0 && ehStale.length === 0,
  ehPx.length ? `spacing px：${ehPx[0]}` : (ehStale.length ? `陈旧：${ehStale[0]}` : '0 处'));

console.log(`--- summary: pass=${pass} fail=${fails.length} ---`);
if (fails.length) { console.log(`--- ${fails.join('、')} ---`); process.exit(1); }