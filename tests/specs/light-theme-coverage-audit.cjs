'use strict';
/**
 * 门禁：light-theme-coverage-audit（周期 137 / UR-4 Slice7 回归保护）
 *
 * Slice7 补齐亮主题缺失的主题相关 token（暗定义·亮未覆盖·被使用），
 * 使亮主题与 Geo Dark 成对，双主题不破。
 *
 * 运行：node tests/specs/light-theme-coverage-audit.cjs
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const sc = fs.readFileSync(path.join(ROOT, 'client', 'src', 'styles.css'), 'utf8');
const tc = fs.readFileSync(path.join(ROOT, 'client', 'src', 'theme.css'), 'utf8');

function rootBlock(s) {
  const m = s.match(/^:root\s*\{/m); const b = s.indexOf('{', m.index); let d = 0;
  for (let j = b; j < s.length; j++) { d += { '{': 1, '}': -1 }[s[j]] || 0; if (d === 0) return s.slice(b + 1, j); }
}
function lightBlock(s) {
  const m = s.match(/:root\[data-theme="light"\]\s*\{/); const b = s.indexOf('{', m.index); let d = 0;
  for (let j = b; j < s.length; j++) { d += { '{': 1, '}': -1 }[s[j]] || 0; if (d === 0) return s.slice(b + 1, j); }
}

const dark = rootBlock(sc) + rootBlock(tc);
const light = lightBlock(tc);
const darkT = new Set(dark.match(/--([\w-]+)\s*:/g).map((x) => x.replace(/--|\s*:/g, '')));
const lightT = new Set(light.match(/--([\w-]+)\s*:/g).map((x) => x.replace(/--|\s*:/g, '')));
const used = new Set((sc + tc).match(/var\(--([\w-]+)\)/g).map((x) => x.replace(/var\(--|\)/g, '')));
const AGN = /^(space|gap|radius|fs|fw|lh|ls|tracking|duration|ease|color-|surface-dark-|shadow-|indigo-|theme-transition)/;
// 自动适配别名：值引用其它 token，经亮覆写基 token 正确解析
const ALIAS = new Set(['border-default', 'surface-1', 'text-primary', 'card', 'card-strong']);

let pass = 0; const fails = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  [PASS] ${name}${detail ? '：' + detail : ''}`); }
  else { fails.push(name); console.log(`  [FAIL] ${name}${detail ? '：' + detail : ''}`); }
}

console.log('--- light-theme-coverage-audit（周期 137 / 亮主题成对）---');

// L1: 暗定义·被使用·主题相关 token 均有亮覆写（仅允许自动适配别名）
const gap = [...darkT].filter((t) => !lightT.has(t) && !AGN.test(t) && used.has(t) && !ALIAS.has(t));
check('L1: 暗定义且被使用的主题相关 token 均有亮覆写', gap.length === 0, gap.length ? `缺 ${gap.join('、')}` : '0 缺口');

// L2: --grad-brand 亮覆写为 light primary/accent 渐变
const gb = light.match(/--grad-brand\s*:\s*([^;]+);/);
check('L2: --grad-brand 亮覆写（primary/accent 同源）', !!gb && /#4f6cff/.test(gb[1]) && /#0891b2/.test(gb[1]), gb ? gb[1].trim() : '未定义');

// L3: --danger-soft-fg 亮覆写为深红（浅底可读）
const dsf = light.match(/--danger-soft-fg\s*:\s*([^;]+);/);
check('L3: --danger-soft-fg 亮覆写深红', !!dsf && /#b91c1c/.test(dsf[1]), dsf ? dsf[1].trim() : '未定义');

// L4: --overlay-92 亮覆写为浅色
const ov = light.match(/--overlay-92\s*:\s*([^;]+);/);
check('L4: --overlay-92 亮覆写浅色', !!ov && /255,\s*255,\s*255/.test(ov[1]), ov ? ov[1].trim() : '未定义');

// L5: --success-active-bg 亮覆写存在（与 --success-bg 同源）
const sab = light.match(/--success-active-bg\s*:\s*([^;]+);/);
check('L5: --success-active-bg 亮覆写', !!sab && /22,\s*163,\s*74/.test(sab[1]), sab ? sab[1].trim() : '未定义');

// L6: theme.css 括号配平
let d = 0; for (const c of tc) { d += { '{': 1, '}': -1 }[c] || 0; }
check('L6: theme.css 括号配平', d === 0, `netDepth=${d}`);

console.log(`--- summary: pass=${pass} fail=${fails.length} ---`);
if (fails.length) { console.log(`--- ${fails.join('、')} ---`); process.exit(1); }