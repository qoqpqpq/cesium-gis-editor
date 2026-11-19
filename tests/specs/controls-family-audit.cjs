'use strict';
/**
 * 门禁：controls-family-audit（周期 133 / UR-4 Slice3 回归保护）
 *
 * Slice3 把按钮/表单/输入控件族（.btn* / .btn-primary / .input / .tag / .badge / .chip / .row / .divider / .error）
 * 统一到 Geo Dark 控件规范。本门禁只约束该簇，防后续回归：
 *   死回退 / 裸 px / 值命名半径 / 硬编码过渡 / 实心 hover / link 色分裂。
 *
 * 运行：node tests/specs/controls-family-audit.cjs
 */

const fs = require('fs');
const path = require('path');

const STYLES = path.resolve(__dirname, '..', '..', 'client', 'src', 'styles.css');
const css = fs.readFileSync(STYLES, 'utf8');

// 大括号配对解析：selector -> body
const rules = new Map();
{
  let i = 0, depth = 0, curSel = null, curStart = 0, selStart = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '{') {
      if (depth === 0) {
        curSel = css.slice(selStart, i).trim().replace(/\/\*[\s\S]*?\*\//g, '').trim();
        curStart = i + 1;
      }
      depth += 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth === 0 && curSel !== null) {
        rules.set(curSel, css.slice(curStart, i));
        curSel = null;
        selStart = i + 1;
      }
    } else if (depth === 0 && c === ';') {
      selStart = i + 1;
    }
    i += 1;
  }
}

const CLUSTER = [
  '.btn', '.btn:hover', '.btn:disabled', '.btn.primary', '.btn.primary:hover', '.btn.danger',
  '.btn-link', '.btn-link:hover', '.btn-primary', '.btn-primary:hover', '.btn-primary:disabled',
  '.input', '.input:focus', 'textarea.input',
  '.tag', '.tag.small', '.badge', '.chip', '.chip:hover', '.chip.small',
  '.row', '.row-between', '.divider', '.error',
];

let pass = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) { pass += 1; console.log(`  [PASS] ${name}${detail ? '：' + detail : ''}`); }
  else { fails.push(name); console.log(`  [FAIL] ${name}${detail ? '：' + detail : ''}`); }
}

console.log('--- controls-family-audit（周期 133 / 控件族统一）---');

const missing = CLUSTER.filter((s) => !rules.has(s));
check('C0: 目标簇选择器全部存在', missing.length === 0, missing.length ? `缺失：${missing.join('、')}` : `${CLUSTER.length}/${CLUSTER.length}`);

const bodies = CLUSTER.filter((s) => rules.has(s)).map((s) => rules.get(s)).join('\n');
const stripped = bodies.replace(/\/\*[\s\S]*?\*\//g, '');

// C1: spacing/radius 属性零裸 px（先剥 var()，避免把 --gap-4px 值命名档误判）
const SPACING_RE = /^\s*(padding[a-z-]*|margin[a-z-]*|gap|row-gap|column-gap|border-radius|top|right|bottom|left)\s*:/i;
const pxHits = [];
for (const decl of stripped.split(';')) {
  if (SPACING_RE.test(decl)) {
    const m = decl.replace(/var\([^)]*\)/g, '').match(/\b\d+(?:\.\d+)?px\b/g);
    if (m) pxHits.push(decl.trim().slice(0, 40));
  }
}
check('C1: 间距/圆角类属性零裸 px', pxHits.length === 0, pxHits.length ? `命中 ${pxHits.length} 处：${pxHits[0]}` : '0 处');

check(
  'C2: .btn-primary 无死回退且 bg=--primary',
  /background:\s*var\(--primary\)/.test(rules.get('.btn-primary') || '') &&
    !/var\(--accent,\s*var\(--primary-500\)\)/.test(rules.get('.btn-primary') || ''),
  '归一到 .btn 基座（azure）',
);

const radius6 = (stripped.match(/--radius-6/g) || []).length;
const bareRadius = (stripped.replace(/var\([^)]*\)/g, '').match(/border-radius:\s*[^;]*\d+(?:\.\d+)?px/g) || []).length;
check('C3: 零 --radius-6 且零裸 radius px', radius6 === 0 && bareRadius === 0,
  `--radius-6=${radius6}、裸 radius=${bareRadius}`);

const hardcodedTrans = (stripped.match(/(?:0\.\d+s|\d+s)\b/g) || []).length;
check('C4: transition 全走 var(--duration)（零硬编码秒）', hardcodedTrans === 0, `命中 ${hardcodedTrans}`);

const btnHover = rules.get('.btn:hover') || '';
check(
  'C5: .btn:hover = azure 微光（--primary-18 + --primary 边框）',
  /background:\s*var\(--primary-18\)/.test(btnHover) && /border-color:\s*var\(--primary\)/.test(btnHover) &&
    !/var\(--on-primary\)/.test(btnHover),
  '实心填充 → 克制微光',
);

check('C6: .btn-link color == --link（azure，与站点链接一致）',
  /color:\s*var\(--link\)/.test(rules.get('.btn-link') || ''),
  '不再用 --accent cyan');

console.log(`--- summary: pass=${pass} fail=${fails.length} ---`);
if (fails.length) { console.log(`--- ${fails.join('、')} ---`); process.exit(1); }