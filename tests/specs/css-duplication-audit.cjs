// tests/specs/css-duplication-audit.cjs
// 周期 46 UR-2: CSS 重复声明审计脚本 单元测试
// 目标：验证 scripts/css-duplication-audit.cjs 正确统计声明频次、产出字号阶梯基线。

'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '../../scripts/css-duplication-audit.cjs');

let pass = 0;
let fail = 0;

function ok(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      pass += 1;
      console.log(`  [PASS] ${label}`);
    })
    .catch((e) => {
      fail += 1;
      console.error(`  [FAIL] ${label}: ${e.message}`);
    });
}

function runJson() {
  const out = execFileSync('node', [SCRIPT, '--json'], { encoding: 'utf8' });
  return JSON.parse(out);
}

(async function main() {
  console.log('=== css-duplication-audit ===');

  await ok('A1: 脚本可执行并输出合法 JSON', () => {
    const j = runJson();
    assert.ok(j && typeof j === 'object');
  });
  await ok('A2: JSON 含必要字段', () => {
    const j = runJson();
    for (const k of ['totalLines', 'totalDecls', 'files', 'topDecl', 'fontSizes']) {
      assert.ok(Object.prototype.hasOwnProperty.call(j, k), `缺字段 ${k}`);
    }
  });
  await ok('A3: totalLines / totalDecls 为正数', () => {
    const j = runJson();
    assert.ok(j.totalLines > 0);
    assert.ok(j.totalDecls > 0);
  });
  await ok('A4: files 覆盖 styles.css 与 theme.css', () => {
    const j = runJson();
    const names = j.files.map((f) => f.file).join(',');
    assert.match(names, /styles\.css/);
    assert.match(names, /theme\.css/);
  });
  await ok('A5: topDecl 按频次降序排列', () => {
    const j = runJson();
    for (let i = 1; i < j.topDecl.length; i++) {
      assert.ok(j.topDecl[i - 1].count >= j.topDecl[i].count);
    }
  });
  await ok('A6: 最高频声明是 display: flex（基线合理性）', () => {
    const j = runJson();
    assert.equal(j.topDecl[0].decl, 'display: flex');
  });
  await ok('A7: fontSizes 非空（存在 font-size 声明）', () => {
    const j = runJson();
    assert.ok(Array.isArray(j.fontSizes));
    assert.ok(j.fontSizes.length > 0);
  });
  await ok('A8: fontSizes 按 px 数值升序（px 在前，rem/em 在后）', () => {
    const j = runJson();
    const px = j.fontSizes.filter((f) => f.size.endsWith('px'));
    for (let i = 1; i < px.length; i++) {
      assert.ok(parseFloat(px[i - 1].size) <= parseFloat(px[i].size));
    }
  });
  await ok('A9: Top 高频字号 10/11/12px 已 token 化（UR-2 第二步迁移生效）', () => {
    const j = runJson();
    const sizes = new Map(j.fontSizes.map((f) => [f.size, f.count]));
    // UR-2 第二步已把最高频的 10/11/12px 收敛为 var(--fs-xs/sm/md)，原始 px 不应再出现
    assert.ok(!sizes.has('12px'), '12px 仍以原始 px 存在（应已迁移为 var(--fs-md)）');
    assert.ok(!sizes.has('11px'), '11px 仍以原始 px 存在（应已迁移为 var(--fs-sm)）');
    assert.ok(!sizes.has('10px'), '10px 仍以原始 px 存在（应已迁移为 var(--fs-xs)）');
  });
  await ok('A10: --prop 过滤生效（font-size 只返回 font-size 声明）', () => {
    const out = execFileSync('node', [SCRIPT, '--json', '--prop', 'font-size'], { encoding: 'utf8' });
    const j = JSON.parse(out);
    for (const d of j.topDecl) assert.match(d.decl, /^font-size:/);
  });
  await ok('A11: font-weight 已 token 化（UR-4 字重迁移生效）', () => {
    const out = execFileSync('node', [SCRIPT, '--json', '--prop', 'font-weight'], { encoding: 'utf8' });
    const j = JSON.parse(out);
    const raw = j.topDecl.filter((d) => /^font-weight:/.test(d.decl) && !/var\(--fw-/.test(d.decl));
    assert.strictEqual(raw.length, 0, `仍有未 token 化 font-weight: ${raw.map((d) => d.decl).join(', ')}`);
  });
  await ok('A12: line-height 已 token 化（UR-4 方案A 行高等值迁移生效）', () => {
    const out = execFileSync('node', [SCRIPT, '--json', '--prop', 'line-height'], { encoding: 'utf8' });
    const j = JSON.parse(out);
    const raw = j.topDecl.filter((d) => /^line-height:/.test(d.decl) && !/var\(--lh-/.test(d.decl));
    assert.strictEqual(raw.length, 0, `仍有未 token 化 line-height: ${raw.map((d) => d.decl).join(', ')}`);
  });
  await ok('A13: 中性色已 token 化（UR-1 中性色迁移生效）', () => {
    const fs = require('fs');
    const re = /(?<![0-9a-fA-F])(?:#888|#94a3b8|#4b5563|#d1d5db|#f1f5f9|#000|#fff)(?![0-9a-fA-F])/g;
    const bad = [];
    for (const f of ['client/src/styles.css', 'client/src/theme.css']) {
      const lines = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n');
      for (const l of lines) {
        if (/^\s*--[a-zA-Z0-9-]+:/.test(l)) continue; // token 定义跳过
        if (l.match(re)) bad.push(`${f}: ${l.trim()}`);
      }
    }
    assert.strictEqual(bad.length, 0, `仍有未 token 化中性色: ${bad.join(' | ')}`);
  });
  await ok('A14: 深色表面已 token 化（UR-1 深色表面迁移生效）', () => {
    const fs = require('fs');
    const re = /(?<![0-9a-fA-F])(?:#0b0d11|#0d1117|#0f1219|#11141a|#161a23|#181c25|#1a1f2b|#1f2937|#2a3142)(?![0-9a-fA-F])/g;
    const bad = [];
    for (const f of ['client/src/styles.css', 'client/src/theme.css']) {
      const lines = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n');
      for (const l of lines) {
        if (/^\s*--[a-zA-Z0-9-]+:/.test(l)) continue; // token 定义跳过
        if (l.match(re)) bad.push(`${f}: ${l.trim()}`);
      }
    }
    assert.strictEqual(bad.length, 0, `仍有未 token 化深色表面: ${bad.join(' | ')}`);
  });

  await ok('A15: 状态/图表色已 token 化（UR-1 状态色迁移生效）', () => {
    const fs = require('fs');
    const re = /(?<![0-9a-fA-F])(?:#93c5fd|#60a5fa|#67e8f9|#86efac|#22c55e|#2ecc71|#fdba74|#fda4af|#fca5a5|#b91c1c)(?![0-9a-fA-F])/g;
    const bad = [];
    for (const f of ['client/src/styles.css', 'client/src/theme.css']) {
      const lines = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n');
      for (const l of lines) {
        if (/^\s*--[a-zA-Z0-9-]+:/.test(l)) continue; // token 定义跳过
        if (l.match(re)) bad.push(`${f}: ${l.trim()}`);
      }
    }
    assert.strictEqual(bad.length, 0, `仍有未 token 化状态/图表色: ${bad.join(' | ')}`);
  });

  await ok('A16: border-radius 单值已 token 化（UR-2 半径 scale 迁移生效）', () => {
    const fs = require('fs');
    let src = '';
    for (const f of ['client/src/styles.css', 'client/src/theme.css']) {
      src += fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') + '\n';
    }
    // 单值、非 var()、非多值简写的原始 border-radius（含 token 定义行，定义行值形如 8px 但带前导 --radius 声明）
    const re = /border-radius:\s*([^;)]+)/g;
    const whitelist = new Set(['2px', '14px', '22px', '28px']); // 已记录的单次色档（设计语义待拍板，UR-2 收尾）
    const raw = new Map();
    let x;
    while ((x = re.exec(src)) !== null) {
      const v = x[0].replace(/border-radius:\s*/, '').trim();
      if (v.includes(' ') || v.startsWith('var(')) continue;
      raw.set(v, (raw.get(v) || 0) + 1);
    }
    const offenders = [...raw].filter(([v]) => !whitelist.has(v)).map(([v, n]) => `${v} x${n}`);
    assert.strictEqual(
      offenders.length,
      0,
      `仍存在未 token 化的单值 border-radius: ${offenders.join(', ')}`
    );
  });

  await ok('A17: gap 族已 token 化且无裸自定义属性（UR-2 间距 scale 迁移生效）', () => {
    const fs = require('fs');
    let src = '';
    for (const f of ['client/src/styles.css', 'client/src/theme.css']) {
      // 逐行剔除 token 定义行（其行尾注释含 gap:Npx 文本，会被误计为组件用法）
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      for (const l of lines) if (!/^\s*--[a-zA-Z0-9-]+:/.test(l)) src += l + '\n';
    }
    src = src.replace(/\/\*[\s\S]*?\*\//g, '');
    // 1) gap/row-gap/column-gap 的原始值必须为 0（全部走 var(--gap-*)）
    const re = /(^|[^\w-])(row-|column-)?gap:\s*([^\s;,)]+)/g;
    const raw = new Map();
    let x;
    while ((x = re.exec(src)) !== null) {
      const v = x[3];
      if (v.startsWith('var(')) continue;
      raw.set(v, (raw.get(v) || 0) + 1);
    }
    const offenders = [...raw].map(([v, n]) => `${v} x${n}`);
    assert.strictEqual(
      offenders.length,
      0,
      `仍存在未 token 化的 gap 原始值: ${offenders.join(', ')}`
    );
    // 2) 反 C68-B01：任何 gap 族值不得是裸自定义属性（未用 var() 包裹 → postcss 报 Missed semicolon）
    const bare = src.match(/gap:\s*--gap-[0-9a-z]+/g);
    assert.strictEqual(
      bare ? bare.length : 0,
      0,
      `发现裸自定义属性引用（必须用 var() 包裹）: ${(bare || []).slice(0, 5).join(', ')}`
    );
    // 3) 反 C68-B02：脚本替换不得拼出 )undefined
    assert.ok(!/\)undefined/.test(src), '发现 )undefined 替换污染');
  });

  await ok('A18: padding/margin 族单值已 token 化（UR-2 间距 scale 步骤6 生效）', () => {
    const fs = require('fs');
    let src = '';
    for (const f of ['client/src/styles.css', 'client/src/theme.css']) {
      // 逐行剔除 token 定义行（其行尾注释含 padding:Npx 等文本，会被误计为组件用法）
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      for (const l of lines) if (!/^\s*--[a-zA-Z0-9-]+:/.test(l)) src += l + '\n';
    }
    src = src.replace(/\/\*[\s\S]*?\*\//g, '');
    // 1) 单值原始值必须为 0（排除 0 清零 / auto / var() / 多值简写 / inherit 等非 scale 值）
    const special = new Set(['0', 'auto', 'inherit', 'initial', 'unset', 'revert', 'none', '0 0', '0 auto']);
    const PROP = 'padding(?:-top|-bottom|-left|-right)?|margin(?:-top|-bottom|-left|-right)?';
    const re = new RegExp('(?:^|[^\\w-])(' + PROP + '):\\s*([^;}]*)(\\s*;?)', 'g');
    const raw = new Map();
    let x;
    while ((x = re.exec(src)) !== null) {
      const v = x[2].trim();
      if (!v || special.has(v) || /^var\(/.test(v) || /\s/.test(v)) continue;
      raw.set(v, (raw.get(v) || 0) + 1);
    }
    const offenders = [...raw].map(([v, n]) => `${v} x${n}`);
    assert.strictEqual(offenders.length, 0, `仍存在未 token 化的 padding/margin 单值: ${offenders.join(', ')}`);
    // 2) 反 C69-B01：任何 padding/margin 族值不得是裸自定义属性（未用 var() 包裹）
    const bare = src.match(/(?:padding|margin)(?:-top|-bottom|-left|-right)?:\s*--/g);
    assert.strictEqual(bare ? bare.length : 0, 0, `发现裸自定义属性引用: ${(bare || []).slice(0, 5).join(', ')}`);
    // 3) 反 C69-B02：脚本替换不得拼出 )undefined
    assert.ok(!/\)undefined/.test(src), '发现 )undefined 替换污染');
  });

  await ok('A19: 重复（≥2 次）box-shadow 原始值已 token 化（UR-2 阴影 scale 步骤7 生效）', () => {
    const fs = require('fs');
    let src = '';
    for (const f of ['client/src/styles.css', 'client/src/theme.css']) {
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      for (const l of lines) if (!/^\s*--[a-zA-Z0-9-]+:/.test(l)) src += l + '\n';
    }
    src = src.replace(/\/\*[\s\S]*?\*\//g, '');
    // 1) 重复（≥2 次）的非 var() 原始 box-shadow 值必须为 0（单次值 x1 属组件专属，留 UR-3）
    const re = /box-shadow:\s*([^;}]*)/g;
    const raw = new Map();
    let x;
    while ((x = re.exec(src)) !== null) {
      const v = x[1].trim();
      if (!v || /^var\(/.test(v) || v === 'none') continue;
      raw.set(v, (raw.get(v) || 0) + 1);
    }
    const offenders = [...raw].filter(([v, n]) => n >= 2).map(([v, n]) => `${v.slice(0, 50)} x${n}`);
    assert.strictEqual(offenders.length, 0, `仍存在重复（≥2 次）box-shadow 原始值: ${offenders.join(', ')}`);
    // 2) 反 C70-B01：box-shadow 值不得是裸自定义属性
    const bare = src.match(/box-shadow:\s*--shadow/g);
    assert.strictEqual(bare ? bare.length : 0, 0, `发现裸自定义属性引用: ${(bare || []).slice(0, 5).join(', ')}`);
    // 3) 反 C70-B02：脚本替换不得拼出 )undefined
    assert.ok(!/\)undefined/.test(src), '发现 )undefined 替换污染');
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});