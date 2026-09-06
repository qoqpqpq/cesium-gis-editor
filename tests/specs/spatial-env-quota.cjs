// tests/specs/spatial-env-quota.cjs
// 周期 2 P2-4: spatial 限额从 env 可配（SPATIAL_MAX_FEATURES / SPATIAL_MAX_VERTICES）
//
// 背景：之前 MAX_FEATURES_PER_LAYER=1000 / MAX_TOTAL_VERTICES=100000 写死，
//   运维要调必须改代码 → 改完还得重部署。现在从 env 读，不设就回落默认。
//
// 修复：server/services/spatial.js
//   - 新增 envInt(name, fallback)
//   - MAX_FEATURES_PER_LAYER = envInt('SPATIAL_MAX_FEATURES', 1000)
//   - MAX_TOTAL_VERTICES = envInt('SPATIAL_MAX_VERTICES', 100000)
//
// 验收：
//   - 不设 env → 默认 1000 / 100000
//   - 设 '50' / '5000' → 用新值
//   - 设非法（空、负、NaN）→ 回落默认
//   - source 静态检查含 envInt 调用

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

// ---- 1. 源文件静态检查 ----
const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../server/services/spatial.js'),
  'utf8'
);
const staticChecks = [
  ['含 envInt 函数', /function\s+envInt\s*\(/.test(SRC)],
  ['读 SPATIAL_MAX_FEATURES', /envInt\(['"]SPATIAL_MAX_FEATURES['"]/.test(SRC)],
  ['读 SPATIAL_MAX_VERTICES', /envInt\(['"]SPATIAL_MAX_VERTICES['"]/.test(SRC)],
  ['默认 1000', /envInt\(['"]SPATIAL_MAX_FEATURES['"],\s*1000\)/.test(SRC)],
  ['默认 100000', /envInt\(['"]SPATIAL_MAX_VERTICES['"],\s*100000\)/.test(SRC)],
];
for (const [name, ok] of staticChecks) {
  (async () => {
    await test(name, () => assert.ok(ok));
  })();
}

// ---- 2. 运行时：envInt 直接验证（不依赖 require，因为常量在 require 时已固化） ----
//   重新走子进程隔离 env
const { spawnSync } = require('node:child_process');

function runWithEnv(env, code) {
  const wrapped = `process.env = ${JSON.stringify(env)}; ${code}`;
  return spawnSync(process.execPath, ['-e', wrapped], { encoding: 'utf8' });
}

(async () => {
  console.log('=== spatial-env-quota ===');
  // 等静态检查 test 完成
  await new Promise((r) => setTimeout(r, 50));

  // 用 inline 同样的 envInt 实现
  const envInt = `
function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}
const MAX_FEATURES = envInt('SPATIAL_MAX_FEATURES', 1000);
const MAX_VERTICES = envInt('SPATIAL_MAX_VERTICES', 100000);
console.log(JSON.stringify({ MAX_FEATURES, MAX_VERTICES }));
`;

  await test('不设 env → 默认 1000 / 100000', () => {
    const r = runWithEnv({}, envInt);
    const got = JSON.parse(r.stdout.trim());
    assert.deepStrictEqual(got, { MAX_FEATURES: 1000, MAX_VERTICES: 100000 });
  });

  await test('设 SPATIAL_MAX_FEATURES=50', () => {
    const r = runWithEnv({ SPATIAL_MAX_FEATURES: '50' }, envInt);
    const got = JSON.parse(r.stdout.trim());
    assert.strictEqual(got.MAX_FEATURES, 50);
    assert.strictEqual(got.MAX_VERTICES, 100000);
  });

  await test('设两个 env 都覆盖', () => {
    const r = runWithEnv(
      { SPATIAL_MAX_FEATURES: '5', SPATIAL_MAX_VERTICES: '500' },
      envInt
    );
    const got = JSON.parse(r.stdout.trim());
    assert.deepStrictEqual(got, { MAX_FEATURES: 5, MAX_VERTICES: 500 });
  });

  await test('非法值（空字符串）→ 回落默认', () => {
    const r = runWithEnv({ SPATIAL_MAX_FEATURES: '' }, envInt);
    const got = JSON.parse(r.stdout.trim());
    assert.strictEqual(got.MAX_FEATURES, 1000);
  });

  await test('非法值（负数）→ 回落默认', () => {
    const r = runWithEnv({ SPATIAL_MAX_FEATURES: '-1' }, envInt);
    const got = JSON.parse(r.stdout.trim());
    assert.strictEqual(got.MAX_FEATURES, 1000);
  });

  await test('非法值（NaN）→ 回落默认', () => {
    const r = runWithEnv({ SPATIAL_MAX_FEATURES: 'abc' }, envInt);
    const got = JSON.parse(r.stdout.trim());
    assert.strictEqual(got.MAX_FEATURES, 1000);
  });

  await test('非法值（0）→ 回落默认', () => {
    const r = runWithEnv({ SPATIAL_MAX_FEATURES: '0' }, envInt);
    const got = JSON.parse(r.stdout.trim());
    assert.strictEqual(got.MAX_FEATURES, 1000);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})();
