// tests/specs/css-var-reference-guard.cjs
// 周期 44 UR-1: CSS var() 引用护栏 —— 扫描 styles.css 引用但未定义的 var()，
// 防止 C44-B01 类拼写错误（--white-4 引用不存在的 --white-04）导致样式静默失效。
//
// 口径：
//   - 定义来源：styles.css + theme.css 内 `--var:` 声明（含双主题块）。
//   - 白名单 ALLOWLIST：JS 动态注入（--left-w/--right-w）与有意 fallback（--fg/--panel*）。
//     这些「未在 CSS 定义」是有意为之，不算缺陷。
//   - 断言：除白名单外，不得有引用未定义的 var()。

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const STYLES = path.join(__dirname, '../../client/src/styles.css');
const THEME = path.join(__dirname, '../../client/src/theme.css');

// 有意未在 CSS 定义的 var()（JS 注入 / 有意 fallback），不算缺陷
const ALLOWLIST = new Set([
  '--left-w', '--right-w',   // index.jsx style={{'--left-w':...}} 动态注入
  '--fg',                    // 有意 fallback: var(--fg)
  '--panel', '--panel-bg', '--panel-soft',  // 有意 fallback: var(--panel, #fff) 等
]);

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

function collectDefined() {
  const defined = new Set();
  for (const p of [STYLES, THEME]) {
    const src = fs.readFileSync(p, 'utf8');
    for (const m of src.matchAll(/^\s*(--[a-zA-Z0-9-]+)\s*:/gm)) defined.add(m[1]);
  }
  return defined;
}

function collectUsedVarRefs() {
  // 只扫组件规则（token 块外），避免把 token 定义行算作「引用」
  const lines = fs.readFileSync(STYLES, 'utf8').split('\n');
  const used = new Map(); // var -> [{line, snippet}]
  let inToken = false, depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const st = lines[i].trim();
    if (!inToken && /^:root\s*\{/.test(st)) { inToken = true; depth = lineDelta(st); continue; }
    if (inToken) {
      depth += lineDelta(lines[i]);
      if (depth <= 0) inToken = false;
      continue;
    }
    for (const m of lines[i].matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
      const v = m[1];
      if (!used.has(v)) used.set(v, []);
      if (used.get(v).length < 3) used.set(v, used.get(v).concat([{ line: i + 1, snippet: st.slice(0, 60) }]));
    }
  }
  return used;
}

function lineDelta(s) { return (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length; }

(async function main() {
  console.log('=== css-var-reference-guard ===');

  const defined = collectDefined();
  const used = collectUsedVarRefs();

  await ok('A1: styles.css/theme.css 存在（可扫描）', () => {
    assert.ok(fs.existsSync(STYLES));
    assert.ok(fs.existsSync(THEME));
  });
  await ok('A2: 定义集非空（设计系统存在）', () => {
    assert.ok(defined.size > 100);
  });
  await ok('A3: 引用集非空（有 var() 使用）', () => {
    assert.ok(used.size > 50);
  });
  await ok('A4: 白名单 var 确实未在 CSS 定义（白名单有效性与时俱进）', () => {
    for (const v of ALLOWLIST) {
      assert.ok(!defined.has(v), `${v} 已在 CSS 定义，应从白名单移除`);
    }
  });

  // 核心：除白名单外，不得有未定义引用
  const undefinedRefs = [...used.keys()].filter((v) => !defined.has(v) && !ALLOWLIST.has(v));

  await ok('B1: 无「引用未定义」的 var()（C44-B01 防复发）', () => {
    assert.deepEqual(undefinedRefs, [], `引用未定义: ${undefinedRefs.join(', ')}`);
  });
  await ok('B2: 已知拼写错误 --white-4/--white-5/--white-6/--white-8 不再被引用', () => {
    for (const bad of ['--white-4', '--white-5', '--white-6', '--white-8']) {
      assert.ok(!used.has(bad), `${bad} 仍被引用（应改为 --white-04/06/08）`);
    }
  });
  await ok('B3: 对应正确 token --white-04/06/08 已被使用（修复生效）', () => {
    for (const good of ['--white-04', '--white-06', '--white-08']) {
      assert.ok(used.has(good), `${good} 未被使用`);
    }
  });
  await ok('B4: 所有引用的 white-* 都已定义（white 系零缺陷）', () => {
    const whiteUsed = [...used.keys()].filter((v) => /^--white-\d+$/.test(v));
    for (const v of whiteUsed) assert.ok(defined.has(v), `${v} 未定义`);
  });
  await ok('B5: 未定义引用总数 == 0（去除白名单后）', () => {
    assert.equal(undefinedRefs.length, 0);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});