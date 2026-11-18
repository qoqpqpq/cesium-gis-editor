// tests/specs/spacing-token-semantic-ladder.cjs
// 周期 113 / UI-REFACTOR UR-3 3b：间距语义阶梯（--space-*）+ --gap-* 别名层门禁。
//
// 用户 2026-11-18 拍板「按推荐命名推进（--space-* 语义档，等值映射）」。
// 门禁锁定：
//   S1 --space-1..6 为对齐 4px 网格的语义档（4/8/12/16/20/24px），各定义一次、值唯一。
//   S2 所有 --gap-* 定义均为纯别名 var(--space-*)，不得残留字面 px（否则值重复回归）。
//   S3 非网格值（1/2/3/5/6/10/14/18/28/30px）必须以值命名档 --space-<N>px 存在（诚实边界）。
//   S4 --space-* 名不含下划线（与 css-var-reference-guard 的 var 名正则兼容）。
//   S5 --space-* 语义档（至少 --space-2）被引用（防"只定义不用"的僵尸 token）。
// 确定性：纯文件解析。

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const CSS = path.join(ROOT, 'client', 'src', 'styles.css');
const src = fs.readFileSync(CSS, 'utf8');

let pass = 0;
let fail = 0;
function ok(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { pass += 1; console.log(`  [PASS] ${label}`); })
    .catch((e) => { fail += 1; console.error(`  [FAIL] ${label}: ${e.message}`); });
}

function defs(prefix) {
  const re = new RegExp(`^\\s*(${prefix}[a-zA-Z0-9-]+)\\s*:\\s*([^;]+);`, 'gm');
  const out = {};
  let m;
  while ((m = re.exec(src)) !== null) out[m[1]] = m[2].trim();
  return out;
}

(async function main() {
  console.log('=== spacing-token-semantic-ladder ===');

  await ok('S1: --space-1..6 语义档 = 4/8/12/16/20/24px，值唯一', () => {
    const s = defs('--space-');
    const want = { '--space-1': '4px', '--space-2': '8px', '--space-3': '12px', '--space-4': '16px', '--space-5': '20px', '--space-6': '24px' };
    for (const [k, v] of Object.entries(want)) assert.strictEqual(s[k], v, `${k} 应为 ${v}，实际 "${s[k]}"`);
    const values = Object.values(s);
    assert.strictEqual(new Set(values).size, values.length, '--space-* 存在重复值（阶梯不唯一）');
  });

  await ok('S2: 所有 --gap-* 定义均为纯别名 var(--space-*)，无字面 px', () => {
    const g = defs('--gap-');
    const names = Object.keys(g);
    assert.ok(names.length >= 16, `--gap-* 应至少 16 个别名，实际 ${names.length}`);
    for (const [k, v] of Object.entries(g)) {
      assert.match(v, /^var\(--space-[a-z0-9-]+\)$/, `${k} 应为纯别名 var(--space-*)，实际 "${v}"`);
    }
  });

  await ok('S3: 非网格值以 --space-<N>px 值命名档存在（诚实边界）', () => {
    const s = defs('--space-');
    for (const px of ['1', '2', '3', '5', '6', '10', '14', '18', '28', '30']) {
      assert.ok(s[`--space-${px}px`], `缺少值命名档 --space-${px}px`);
      assert.strictEqual(s[`--space-${px}px`], `${px}px`, `--space-${px}px 值应为 ${px}px`);
    }
  });

  await ok('S4: --space-* 名不含下划线（guard 兼容）', () => {
    const names = Object.keys(defs('--space-'));
    const bad = names.filter((n) => n.includes('_'));
    assert.strictEqual(bad.length, 0, `含下划线 token: ${bad.join(', ')}`);
  });

  await ok('S5: --space-2(8px) 语义档被引用（非僵尸 token）', () => {
    const ref = (src.match(/var\(--space-2\)/g) || []).length;
    assert.ok(ref >= 1, '--space-2 无引用');
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});