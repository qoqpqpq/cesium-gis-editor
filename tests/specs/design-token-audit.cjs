// tests/specs/design-token-audit.cjs
// 周期 38 UR-1: 设计 token 审计脚本 单元测试
// 目标：验证 scripts/design-token-audit.cjs 正确区分「token 定义」vs「组件硬编码用法」，
//       并产出结构化基线（供 UI 重构 UR-1 验收与后续迁移追踪）。

'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '../../scripts/design-token-audit.cjs');

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
  console.log('=== design-token-audit ===');

  await ok('A1: 脚本可执行并输出合法 JSON', () => {
    const j = runJson();
    assert.ok(j && typeof j === 'object');
  });
  await ok('A2: JSON 含必要字段（totalTokenDefs/totalComponent/totalHex/totalRgb）', () => {
    const j = runJson();
    for (const k of ['totalTokenDefs', 'totalComponent', 'totalHex', 'totalRgb']) {
      assert.ok(Object.prototype.hasOwnProperty.call(j, k), `缺字段 ${k}`);
      assert.equal(typeof j[k], 'number');
    }
  });
  await ok('A3: totalComponent = totalHex + totalRgb（自洽）', () => {
    const j = runJson();
    assert.equal(j.totalComponent, j.totalHex + j.totalRgb);
  });
  await ok('A4: files 数组非空（扫描到 CSS 文件）', () => {
    const j = runJson();
    assert.ok(Array.isArray(j.files));
    assert.ok(j.files.length >= 2); // 至少 styles.css + theme.css
  });
  await ok('A5: 每个文件条目含 file/tokenDefs/componentTotal', () => {
    const j = runJson();
    for (const f of j.files) {
      assert.equal(typeof f.file, 'string');
      assert.equal(typeof f.tokenDefs, 'number');
      assert.equal(typeof f.componentTotal, 'number');
    }
  });
  await ok('A6: token 定义被正确识别（theme.css tokenDefs > 0）', () => {
    const j = runJson();
    const theme = j.files.find((f) => f.file.endsWith('theme.css'));
    assert.ok(theme, '未找到 theme.css');
    assert.ok(theme.tokenDefs > 0, 'theme.css 应有 token 定义');
  });
  await ok('A7: 总 token 定义 > 0（设计系统存在）', () => {
    const j = runJson();
    assert.ok(j.totalTokenDefs > 0);
  });
  await ok('A8: 组件硬编码颜色 > 0（存在迁移目标，基线有意义）', () => {
    const j = runJson();
    assert.ok(j.totalComponent > 0);
  });
  await ok('A9: 各文件 componentTotal 之和 = totalComponent', () => {
    const j = runJson();
    const sum = j.files.reduce((a, f) => a + f.componentTotal, 0);
    assert.equal(sum, j.totalComponent);
  });
  await ok('A10: 各文件 tokenDefs 之和 = totalTokenDefs', () => {
    const j = runJson();
    const sum = j.files.reduce((a, f) => a + f.tokenDefs, 0);
    assert.equal(sum, j.totalTokenDefs);
  });

  // B 组：阈值模式（--max）
  await ok('B1: --max 大于实际值 → exit 0（PASS）', () => {
    const j = runJson();
    const big = j.totalComponent + 1000;
    let code = 0;
    try {
      execFileSync('node', [SCRIPT, '--max', String(big)], { encoding: 'utf8', stdio: 'pipe' });
    } catch (e) { code = e.status; }
    assert.equal(code, 0);
  });
  await ok('B2: --max 小于实际值 → exit 1（FAIL）', () => {
    const j = runJson();
    const small = Math.max(0, j.totalComponent - 1);
    let code = 0;
    try {
      execFileSync('node', [SCRIPT, '--max', String(small)], { encoding: 'utf8', stdio: 'pipe' });
    } catch (e) { code = e.status; }
    assert.equal(code, 1);
  });

  // C 组：非 JSON 模式人类可读报告
  await ok('C1: 默认模式输出人类可读报告（含关键字）', () => {
    const out = execFileSync('node', [SCRIPT], { encoding: 'utf8' });
    assert.match(out, /设计 token 审计/);
    assert.match(out, /token 定义/);
    assert.match(out, /组件规则硬编码/);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});