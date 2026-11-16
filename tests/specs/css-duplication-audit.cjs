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

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});