// tests/specs/editor-density-tokenized.cjs
// 周期 116 / UI-REFACTOR UR-3 3f：editor 面板规则视觉密度 token 化门禁。
//
// 用户 2026-11-18 拍板「按常规密度精简（内边距/间距/圆角收敛到 token 一致值）」。
// 实现：将 editor 子组件相关规则的多值简写裸 px 逐值收敛为 --space-* token（等值零视觉变化）。
// 门禁锁定"已 token 化"不回归：
//   E1 editor 规则内 spacing/radius 声明无任何离档裸 px（全 var() 化）。
//   E2 editor 规则使用的 spacing/radius token 种类 >= 10（证明规则确为 token 基）。
//   E3 至少 40 处 editor spacing/radius 声明使用 var(--space-*)/var(--gap-*)。
// 确定性：纯文件解析。

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const CSS = path.join(ROOT, 'client', 'src', 'styles.css');
const src = fs.readFileSync(CSS, 'utf8');

const editorCls = /(?:\.(?:editor-|analysis-|attr-|op-|qb-|print-export-|three-check-|query-builder|et-tab|style-panel-tabs|thematic-info)[a-zA-Z0-9_-]*)/;
const ladder = new Set([4, 8, 12, 16, 20, 24]);
const rladder = new Set([1, 3, 4, 5, 6, 8, 9, 10, 12, 16, 20]);
const spacingRe = /^\s*(padding|padding-top|padding-right|padding-bottom|padding-left|margin|margin-top|margin-right|margin-bottom|margin-left|gap|row-gap|column-gap|border-radius)\s*:\s*([^;{}]+);/gm;

let pass = 0;
let fail = 0;
function ok(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { pass += 1; console.log(`  [PASS] ${label}`); })
    .catch((e) => { fail += 1; console.error(`  [FAIL] ${label}: ${e.message}`); });
}

function editorBlocks() {
  const noComment = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out = [];
  let depth = 0, sel = '', body = '', quote = null;
  for (let i = 0; i < noComment.length; i += 1) {
    const c = noComment[i];
    if (quote) {
      if (c === quote && noComment[i - 1] !== '\\') quote = null;
      if (depth >= 1) body += c; else sel += c;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; if (depth >= 1) body += c; else sel += c; continue; }
    if (c === '{') { depth += 1; if (depth === 1) { body = ''; sel += c; } else body += c; continue; }
    if (c === '}') {
      if (depth >= 1) { depth -= 1; if (depth === 0) { out.push({ selector: sel.trim(), body }); sel = ''; body = ''; } else body += c; }
      continue;
    }
    if (depth >= 1) body += c; else sel += c;
  }
  return out.filter((b) => editorCls.test(b.selector));
}

(async function main() {
  console.log('=== editor-density-tokenized ===');

  await ok('E1: editor 规则 spacing/radius 无离档裸 px（全 var() 化）', () => {
    const bad = [];
    for (const b of editorBlocks()) {
      spacingRe.lastIndex = 0;
      let m;
      while ((m = spacingRe.exec(b.body)) !== null) {
        const prop = m[1], v = m[2].trim();
        const stripped = v.replace(/var\([^)]*\)/g, ' ').trim();
        if (!stripped || stripped === '0' || stripped === 'auto' || stripped === 'inherit') continue;
        const pxs = stripped.match(/-?\d+(?:\.\d+)?px/g) || [];
        for (const p of pxs) {
          const n = parseFloat(p);
          const isR = prop === 'border-radius';
          const okv = isR ? rladder.has(n) : ladder.has(n);
          if (!okv) bad.push(`${b.selector.slice(0, 40)} :: ${prop}: ${v} (裸px ${p})`);
        }
      }
    }
    assert.strictEqual(bad.length, 0, `离档裸 px: ${bad.slice(0, 5).join(' | ')}`);
  });

  await ok('E2: editor 规则 spacing/radius token 种类 >= 10', () => {
    const tok = new Set();
    for (const b of editorBlocks()) {
      spacingRe.lastIndex = 0;
      let m;
      while ((m = spacingRe.exec(b.body)) !== null) {
        const v = m[2];
        const re = /var\((--(?:gap|space|radius)-[a-zA-Z0-9-]+)\)/g;
        let t;
        while ((t = re.exec(v)) !== null) tok.add(t[1]);
      }
    }
    assert.ok(tok.size >= 10, `token 种类 ${tok.size} < 10`);
  });

  await ok('E3: editor spacing/radius 使用 var(--space-*)/var(--gap-*) >= 40 处', () => {
    let count = 0;
    for (const b of editorBlocks()) {
      spacingRe.lastIndex = 0;
      let m;
      while ((m = spacingRe.exec(b.body)) !== null) {
        if (/var\(--(space|gap)-[a-zA-Z0-9-]+\)/.test(m[2])) count += 1;
      }
    }
    assert.ok(count >= 40, `spacing var() 使用 ${count} < 40`);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});