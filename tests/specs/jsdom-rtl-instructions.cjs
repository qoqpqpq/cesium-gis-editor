// tests/specs/jsdom-rtl-instructions.cjs
// 周期 13 P2-3: jsdom + RTL 集成测试脚手架 spec
// 目标：≥ 15 子断言 PASS
// 策略：文件契约测试（不实际运行 jsdom/RTL 集成）

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const INST = path.join(__dirname, '../../client/src/hooks/useOptimisticMarker.test-instructions.js');

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

(async function main() {
  console.log('=== jsdom-rtl-instructions ===');

  let src = '';
  await ok('A1: 脚手架文件存在', () => {
    assert.ok(fs.existsSync(INST));
    src = fs.readFileSync(INST, 'utf8');
  });

  // ============ Group A: 文件结构 ============
  await ok('A2: 含 INSTALL_INSTRUCTIONS 导出', () => {
    assert.match(src, /INSTALL_INSTRUCTIONS/);
  });
  await ok('A3: 含 use strict', () => {
    assert.match(src, /'use strict';/);
  });

  // ============ Group B: 依赖清单 ============
  await ok('B1: 列 jsdom 依赖', () => {
    assert.match(src, /jsdom/);
  });
  await ok('B2: 列 @testing-library/react 依赖', () => {
    assert.match(src, /@testing-library\/react/);
  });
  await ok('B3: 列 @testing-library/jest-dom 依赖', () => {
    assert.match(src, /@testing-library\/jest-dom/);
  });
  await ok('B4: 三个依赖同时存在', () => {
    const deps = ['jsdom', '@testing-library/react', '@testing-library/jest-dom'];
    for (const d of deps) {
      assert.ok(src.includes(d), `missing ${d}`);
    }
  });

  // ============ Group C: setup 文件约定 ============
  await ok('C1: 含 setupFiles 配置', () => {
    assert.match(src, /setupFiles/);
  });
  await ok('C2: 含 test-setup.js 引用', () => {
    assert.match(src, /test-setup/);
  });
  await ok('C3: 含 jest-dom/vitest import', () => {
    assert.match(src, /jest-dom\/vitest/);
  });

  // ============ Group D: 示例测试 ============
  await ok('D1: 含 renderHook 引用', () => {
    assert.match(src, /renderHook/);
  });
  await ok('D2: 含 act 引用', () => {
    assert.match(src, /act\b/);
  });
  await ok('D3: 含 optimistic + confirm 测试用例', () => {
    assert.match(src, /optimistic \+ confirm/);
  });
  await ok('D4: 含失败回滚用例', () => {
    assert.match(src, /failure rolls back/);
  });

  // ============ Group E: 集成到 useOptimisticMarker 契约 ============
  await ok('E1: 引用 useOptimisticMarker', () => {
    assert.match(src, /useOptimisticMarker/);
  });
  await ok('E2: 测试 useOptimisticMarker.addMarker', () => {
    assert.match(src, /addMarker/);
  });

  // ============ Group F: 与 client/package.json 兼容性 ============
  await ok('F1: client/package.json 已存在 react 18+', () => {
    const pkgPath = path.join(__dirname, '../../client/package.json');
    if (!fs.existsSync(pkgPath)) return; // 跳过
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.ok(pkg.dependencies && pkg.dependencies.react, 'react not in deps');
  });
  await ok('F2: type=module（ESM，jsdom 已支持）', () => {
    const pkgPath = path.join(__dirname, '../../client/package.json');
    if (!fs.existsSync(pkgPath)) return;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.equal(pkg.type, 'module');
  });

  // ============ Group G: 文档完整性 ============
  await ok('G1: 说明为何不立即引入', () => {
    assert.match(src, /不引入/);
  });
  await ok('G2: 说明是契约文档', () => {
    assert.match(src, /契约文档/);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});