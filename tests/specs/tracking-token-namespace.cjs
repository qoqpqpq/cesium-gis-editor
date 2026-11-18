// tests/specs/tracking-token-namespace.cjs
// 周期 114 / UI-REFACTOR UR-3 3b-2：字距 tracking 命名空间 + --ls-* 别名层门禁。
//
// 用户 2026-11-18 拍板「按推荐命名推进（字距语义档，等值映射）」。
// 采用 --tracking-* 命名空间（排版术语 tracking，非 font-size）；当前为值命名档
//（诚实边界：现有值混合 em/px 且为微调值，无干净语义 tier 可等值映射，不强行语义化）。
// 门禁锁定：
//   T1 九个 --tracking-* 定义值与既有 --ls-* 原值逐一相等、值唯一。
//   T2 所有 --ls-* 定义均为纯别名 var(--tracking-*)，无字面值。
//   T3 --tracking-* 名不含下划线（css-var-reference-guard 兼容）。
//   T4 --tracking-* 至少一个被引用（非僵尸命名空间）。
//   T5 --ls-* 别名总数 == 9（覆盖全部既有值档）。
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
  console.log('=== tracking-token-namespace ===');

  await ok('T1: --tracking-* 九个定义值与既有 --ls-* 原值逐一相等、值唯一', () => {
    const t = defs('--tracking-');
    const want = {
      '--tracking-0-5px': '0.5px', '--tracking-0-05em': '0.05em', '--tracking-1px': '1px',
      '--tracking-0-3px': '0.3px', '--tracking-0-4px': '0.4px', '--tracking-0-02em': '0.02em',
      '--tracking-neg-0-4px': '-0.4px', '--tracking-2px': '2px', '--tracking-0-2px': '0.2px',
    };
    assert.strictEqual(Object.keys(t).length, Object.keys(want).length, `--tracking-* 应恰为 ${Object.keys(want).length} 个，实际 ${Object.keys(t).length}`);
    for (const [k, v] of Object.entries(want)) assert.strictEqual(t[k], v, `${k} 应为 ${v}，实际 "${t[k]}"`);
    const values = Object.values(t);
    assert.strictEqual(new Set(values).size, values.length, '--tracking-* 值不唯一');
  });

  await ok('T2: 所有 --ls-* 均为纯别名 var(--tracking-*)，无字面值', () => {
    const ls = defs('--ls-');
    assert.strictEqual(Object.keys(ls).length, 9, `--ls-* 应有 9 个别名，实际 ${Object.keys(ls).length}`);
    for (const [k, v] of Object.entries(ls)) {
      assert.match(v, /^var\(--tracking-[a-z0-9-]+\)$/, `${k} 应为纯别名 var(--tracking-*)，实际 "${v}"`);
    }
  });

  await ok('T3: --tracking-* 名不含下划线（guard 兼容）', () => {
    const names = Object.keys(defs('--tracking-'));
    const bad = names.filter((n) => n.includes('_'));
    assert.strictEqual(bad.length, 0, `含下划线 token: ${bad.join(', ')}`);
  });

  await ok('T4: --tracking-* 至少一个被引用（非僵尸）', () => {
    const ref = (src.match(/var\(--tracking-[a-z0-9-]+\)/g) || []).length;
    assert.ok(ref >= 1, '--tracking-* 无引用');
  });

  await ok('T5: --ls-* 别名数 == 9（覆盖全部既有值档）', () => {
    assert.strictEqual(Object.keys(defs('--ls-')).length, 9);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});