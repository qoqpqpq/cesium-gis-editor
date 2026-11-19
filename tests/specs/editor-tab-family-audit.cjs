'use strict';
/**
 * 门禁：editor-tab-family-audit（周期 132 / UR-4 Slice2 回归保护）
 *
 * Slice2 把 editor 的 3 套 tab 族（.et-tab* / .editor-layer-tab* / .style-panel-tab*）
 * 统一到一套 Geo Dark 视觉规范。本门禁只约束该簇，防止后续周期把 tab 又改回
 * hue 混用 / 裸 px / 值命名半径 / 缺 hover 的老状态。
 *
 * 统一规范：
 *   inactive = color --text-soft / bg --white-04 / border --white-08
 *   hover    = bg --white-08
 *   active   = bg --primary-18 / border --primary-30 / color --text
 *   底部指示器型（.et-tab）额外 = border-bottom 2px solid var(--primary)
 *
 * 运行：node tests/specs/editor-tab-family-audit.cjs
 */

const fs = require('fs');
const path = require('path');

const STYLES = path.resolve(__dirname, '..', '..', 'client', 'src', 'styles.css');
const css = fs.readFileSync(STYLES, 'utf8');

// 按大括号配对解析 CSS：selector -> body（正确处理单行规则与多选择器行）
const rules = new Map();
{
  let i = 0;
  let depth = 0;
  let curSel = null;
  let curStart = 0;
  let selStart = 0;
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

// 目标簇：editor 3 套 tab 族 + 高亮块
const CLUSTER = [
  '.et-tabs',
  '.et-tab',
  '.et-tab:hover',
  '.et-tab.active',
  '.et-tab-content',
  '.et-highlight-section',
  '.et-highlight-section .editor-section-title',
  '.editor-layer-tabs',
  '.editor-layer-tab',
  '.editor-layer-tab:hover',
  '.editor-layer-tab.active',
  '.style-panel-tabs',
  '.style-panel-tab',
  '.style-panel-tab:hover',
  '.style-panel-tab:last-child',
  '.style-panel-tab.active',
];

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

console.log('--- editor-tab-family-audit（周期 132 / editor tab 族统一）---');

const missing = CLUSTER.filter((s) => !rules.has(s));
check(
  'T0: 目标簇 16 个选择器全部存在',
  missing.length === 0,
  missing.length ? `缺失：${missing.join('、')}` : '16/16',
);

const bodies = CLUSTER.filter((s) => rules.has(s)).map((s) => rules.get(s)).join('\n');

check(
  'T1: 簇内零 var(--color-blue-400) 死回退',
  !/var\(--color-blue-400\)/.test(bodies),
  `命中 ${String(bodies.match(/var\(--color-blue-400\)/g) || []).length} 处`,
);

check(
  'T2: active 态统一 azure --primary（零裸 --accent）',
  /\.et-tab\.active/.test(css) &&
    /var\(--primary\)/.test(rules.get('.et-tab.active') || '') &&
    !/var\(--accent[,\s)]/.test(rules.get('.et-tab.active') || ''),
  '.et-tab.active 指示线 = --primary',
);

// 去注释后，仅扫描「间距/圆角」类属性的值（边框粗细允许 px，属线条规格而非间距 token）
const stripped = bodies.replace(/\/\*[\s\S]*?\*\//g, '');
const SPACING_RE = /^\s*(padding[a-z-]*|margin[a-z-]*|gap|row-gap|column-gap|border-radius|top|right|bottom|left)\s*:/i;
const pxProps = [];
for (const decl of stripped.split(';')) {
  if (SPACING_RE.test(decl)) {
    // 先剥离 var(...)：--gap-4px / --space-5px 等「值命名档」token 名内的 px 不算裸字面量
    const m = decl.replace(/var\([^)]*\)/g, '').match(/\b\d+(?:\.\d+)?px\b/g);
    if (m) pxProps.push(decl.trim().slice(0, 40) + ' → ' + m.join(','));
  }
}
check('T3: 间距/圆角类属性零裸 px（全走 --space-* / --radius-*）', pxProps.length === 0,
  pxProps.length ? `命中 ${pxProps.length} 处：${pxProps[0]}` : '0 处');

check('T4: 簇内零 --radius-6（已收敛 --radius-sm）', !/--radius-6/.test(stripped));

const inactiveColors = [
  ['.et-tab', rules.get('.et-tab')],
  ['.editor-layer-tab', rules.get('.editor-layer-tab')],
  ['.style-panel-tab', rules.get('.style-panel-tab')],
];
const soft = inactiveColors.filter(([, b]) => b && /color:\s*var\(--text-soft\)/.test(b));
check(
  'T5: 三族 inactive 前景统一 --text-soft',
  soft.length === 3,
  `${soft.length}/3 族`,
);

check(
  'T6: .style-panel-tab 已补 hover 态',
  Boolean(rules.get('.style-panel-tab:hover')) &&
    /background:\s*var\(--white-08\)/.test(rules.get('.style-panel-tab:hover')),
  '此前缺失，Slice2 补齐',
);

console.log(`--- summary: pass=${pass} fail=${fails.length} ---`);
if (fails.length) {
  console.log(`--- ${fails.join('、')} ---`);
  process.exit(1);
}