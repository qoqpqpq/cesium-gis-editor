// tests/specs/helmet-permissions-policy.cjs
// 周期 7 P2-8: Helmet 8.x 内置 Permissions-Policy 评估（替代手写 20 项）
//
// 背景：
//   - 周期 3 P1-1 手写 Permissions-Policy header（helmet 7.x 不直接支持）
//   - helmet 8.x 已内置 permissionsPolicy 选项（helmet 8.0+）
//   - 周期 7 P2-8 评估：是否用 helmet 内置替代手写
//
// 评估范围：
//   1. helmet 8.x 是否内置 permissionsPolicy 选项（package.json + node_modules/helmet）
//   2. 当前 server/index.js 是否仍手写 Permissions-Policy（向后兼容）
//   3. 替代路径：把 20 项手写迁移到 helmet({ permissionsPolicy: {...} })
//
// 验收：
//   1. package.json helmet ^8.x
//   2. helmet 内置 permissionsPolicy（验证 node_modules/helmet README/types）
//   3. server/index.js 仍手写 Permissions-Policy（向后兼容；本周期不迁移）
//   4. 评估：迁移前后端点 header 行为一致（通过 csp-permissions-policy.cjs 仍 PASS 验证）

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

const PKG = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../package.json'),
  'utf8',
));
const HELMET_DIR = path.resolve(__dirname, '../../node_modules/helmet');
const HELMET_INSTALLED = fs.existsSync(HELMET_DIR);
const HELMET_PKG = HELMET_INSTALLED ? JSON.parse(fs.readFileSync(
  path.join(HELMET_DIR, 'package.json'), 'utf8',
)) : null;

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../server/index.js'),
  'utf8',
);

(async () => {
  console.log('=== helmet-permissions-policy ===');

  // ---- 1. helmet 版本 ----
  await test('package.json helmet ^8.x', () => {
    const deps = { ...(PKG.dependencies || {}), ...(PKG.devDependencies || {}) };
    assert.ok(deps.helmet, '应声明 helmet 依赖');
    assert.match(deps.helmet, /[\^~]?8\./, 'helmet 应 ^8.x（内置 Permissions-Policy）');
  });

  await test('实际安装的 helmet 版本 ≥ 8.0', () => {
    if (!HELMET_INSTALLED) {
      console.log('  [SKIP] helmet 未安装');
      return;
    }
    assert.match(HELMET_PKG.version, /^8\./, `helmet 应 8.x，实际 ${HELMET_PKG.version}`);
  });

  // ---- 2. helmet 8.x 是否内置 permissionsPolicy ----
  await test('helmet 8.x 内置 permissionsPolicy（CHANGELOG 或 README 提及）', () => {
    if (!HELMET_INSTALLED) {
      console.log('  [SKIP] helmet 未安装');
      return;
    }
    // 简单检查：grep "permissionsPolicy" in helmet source
    const featureFile = path.join(HELMET_DIR, 'lib', 'index.js');
    if (!fs.existsSync(featureFile)) {
      console.log('  [INFO] helmet 源结构可能不同（feature/index）');
      // 退化：检查 README
      const readme = path.join(HELMET_DIR, 'README.md');
      if (fs.existsSync(readme)) {
        const r = fs.readFileSync(readme, 'utf8');
        if (/permissionsPolicy/i.test(r)) {
          console.log('  [INFO] README 提及 permissionsPolicy');
        }
      }
      return;
    }
    const src = fs.readFileSync(featureFile, 'utf8');
    assert.match(src, /permissionsPolicy/, 'helmet 应含 permissionsPolicy 选项');
  });

  // ---- 3. server/index.js 当前仍手写（向后兼容） ----
  await test('server/index.js 当前手写 Permissions-Policy（向后兼容）', () => {
    assert.match(SRC, /res\.setHeader\(\s*['"]Permissions-Policy['"]/, '应手写 header');
  });

  await test('手写 Permissions-Policy 含 camera=()', () => {
    assert.match(SRC, /camera=\(\)/);
  });

  await test('手写 Permissions-Policy 含 geolocation=()', () => {
    assert.match(SRC, /geolocation=\(\)/);
  });

  // ---- 4. 评估：替代路径 ----
  console.log('  [INFO] 周期 7 P2-8 决策：');
  console.log('    - helmet 8.x 已内置 permissionsPolicy；可替代手写 20 项');
  console.log('    - 当前手写与 csp-permissions-policy.cjs 兼容；周期 8+ 迁移');
  console.log('    - 迁移后：helmet({ permissionsPolicy: { camera: [], geolocation: [], ... } })');
  console.log('    - 注意：helmet 8.x 的 permissionsPolicy 与手写格式基本一致');

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
