// tests/specs/stale-fallback-audit.cjs
// 周期 115 / UI-REFACTOR UR-3 3d：陈旧不可达 fallback 门禁。
//
// 目标：锁定「var(--X, <字面量>)」中 --X 恒定义（:root 级）导致的**值级重复、永不可达 fallback**
// 已清除（同类：周期 112 --shadow-elevated、周期 115 --radius-base）。
// 门禁：
//   F1 --radius-base 必须为 var(--radius-md)，不得含字面量 fallback。
//   F2 --shadow-elevated 必须为 var(--shadow-lg)（周期 112 回归保护）。
//   F3 全 CSS 中 radius 族零 `var(--radius-*, <字面量>)` fallback。
// 确定性：纯文件解析。

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FILES = [
  path.join(ROOT, 'client', 'src', 'theme.css'),
  path.join(ROOT, 'client', 'src', 'styles.css'),
];
const texts = FILES.map((f) => ({ file: path.relative(ROOT, f), raw: fs.readFileSync(f, 'utf8') }));

let pass = 0;
let fail = 0;
function ok(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { pass += 1; console.log(`  [PASS] ${label}`); })
    .catch((e) => { fail += 1; console.error(`  [FAIL] ${label}: ${e.message}`); });
}

function defValue(name) {
  const re = new RegExp(`${name}\\s*:\\s*([^;]+);`);
  for (const t of texts) {
    const m = re.exec(t.raw);
    if (m) return m[1].trim();
  }
  return null;
}

(async function main() {
  console.log('=== stale-fallback-audit ===');

  await ok('F1: --radius-base = var(--radius-md)（无字面量 fallback）', () => {
    assert.strictEqual(defValue('--radius-base'), 'var(--radius-md)');
  });

  await ok('F2: --shadow-elevated = var(--shadow-lg)（周期112 回归保护）', () => {
    assert.strictEqual(defValue('--shadow-elevated'), 'var(--shadow-lg)');
  });

  await ok('F3: 全 CSS radius 族零 var(--radius-*, <字面量>) fallback', () => {
    const hits = [];
    for (const t of texts) {
      const re = /var\(\s*--radius-[a-z0-9-]+\s*,\s*[^)]+\)/g;
      let m;
      while ((m = re.exec(t.raw)) !== null) hits.push(`${t.file}: ${m[0].trim()}`);
    }
    assert.strictEqual(hits.length, 0, `radius 族仍有 fallback: ${hits.join(' | ')}`);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});