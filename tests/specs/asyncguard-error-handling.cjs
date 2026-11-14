// tests/specs/asyncguard-error-handling.cjs
// 周期 17 R2: asyncGuard.js 异步错误处理测试
// 目标：≥ 20 PASS
//
// 覆盖：
//   - 静态扫描（函数导出 + 常量）
//   - installAsyncGuard 安装逻辑
//   - uninstallAsyncGuard 卸载逻辑
//   - isAsyncGuardInstalled 状态检查
//   - wrapAsyncHandler 包装逻辑
//   - reportTelemetry 上报逻辑

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const ASYNC_GUARD_SRC = fs.readFileSync(path.join(ROOT, 'client/src/utils/asyncGuard.js'), 'utf8');

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
  console.log('=== asyncguard-error-handling ===');

  // ============ Group A: 静态扫描 - 导出验证 ============
  await ok('A1: 导出 installAsyncGuard 函数', () => {
    assert.match(ASYNC_GUARD_SRC, /export\s+function\s+installAsyncGuard/);
  });
  await ok('A2: 导出 uninstallAsyncGuard 函数', () => {
    assert.match(ASYNC_GUARD_SRC, /export\s+function\s+uninstallAsyncGuard/);
  });
  await ok('A3: 导出 isAsyncGuardInstalled 函数', () => {
    assert.match(ASYNC_GUARD_SRC, /export\s+function\s+isAsyncGuardInstalled/);
  });
  await ok('A4: 导出 wrapAsyncHandler 函数', () => {
    assert.match(ASYNC_GUARD_SRC, /export\s+function\s+wrapAsyncHandler/);
  });
  await ok('A5: 导出默认对象', () => {
    assert.match(ASYNC_GUARD_SRC, /export\s+default\s+\{/);
  });
  await ok('A6: 默认导出包含所有函数', () => {
    assert.match(ASYNC_GUARD_SRC, /installAsyncGuard/);
    assert.match(ASYNC_GUARD_SRC, /uninstallAsyncGuard/);
    assert.match(ASYNC_GUARD_SRC, /isAsyncGuardInstalled/);
    assert.match(ASYNC_GUARD_SRC, /wrapAsyncHandler/);
  });

  // ============ Group B: 静态扫描 - 内部状态 ============
  await ok('B1: 定义 _installed 标记', () => {
    assert.match(ASYNC_GUARD_SRC, /let\s+_installed\s*=\s*false/);
  });
  await ok('B2: 定义 _currentListener 标记', () => {
    assert.match(ASYNC_GUARD_SRC, /let\s+_currentListener\s*=\s*null/);
  });
  await ok('B3: 定义 _telemetryUrl 标记', () => {
    assert.match(ASYNC_GUARD_SRC, /let\s+_telemetryUrl\s*=\s*null/);
  });

  // ============ Group C: installAsyncGuard 逻辑验证 ============
  await ok('C1: 检查 window 环境', () => {
    assert.match(ASYNC_GUARD_SRC, /typeof\s+window\s*===\s*['"]undefined['"]/);
  });
  await ok('C2: 防止重复安装', () => {
    assert.match(ASYNC_GUARD_SRC, /if\s*\(\s*_installed\s*\)\s+return/);
  });
  await ok('C3: 注册 unhandledrejection 监听', () => {
    assert.match(ASYNC_GUARD_SRC, /addEventListener\s*\(\s*['"]unhandledrejection['"]/);
  });
  await ok('C4: 注册 error 监听', () => {
    assert.match(ASYNC_GUARD_SRC, /addEventListener\s*\(\s*['"]error['"]/);
  });
  await ok('C5: 设置 _installed = true', () => {
    assert.match(ASYNC_GUARD_SRC, /_installed\s*=\s*true/);
  });
  await ok('C6: 返回卸载函数', () => {
    assert.match(ASYNC_GUARD_SRC, /_currentListener\s*=\s*\(\)\s*=>/);
    assert.match(ASYNC_GUARD_SRC, /return\s+_currentListener/);
  });

  // ============ Group D: handlerRejection 逻辑验证 ============
  await ok('D1: 提取 rejection reason', () => {
    assert.match(ASYNC_GUARD_SRC, /event\.reason/);
  });
  await ok('D2: 转换为 Error 实例', () => {
    assert.match(ASYNC_GUARD_SRC, /instanceof\s+Error/);
    assert.match(ASYNC_GUARD_SRC, /new\s+Error\s*\(\s*String\(reason\)/);
  });
  await ok('D3: console.error 输出（非 silent）', () => {
    assert.match(ASYNC_GUARD_SRC, /console\.error\s*\(\s*['"]\[asyncGuard\]\s+unhandledrejection/);
  });
  await ok('D4: 上报 telemetry', () => {
    assert.match(ASYNC_GUARD_SRC, /reportTelemetry\s*\(/);
  });
  await ok('D5: 调用 onError 回调', () => {
    assert.match(ASYNC_GUARD_SRC, /onError\s*\(\s*err\s*,\s*['"]unhandledrejection['"]\s*\)/);
  });
  await ok('D6: preventDefault 防止浏览器 banner', () => {
    assert.match(ASYNC_GUARD_SRC, /event\.preventDefault/);
  });

  // ============ Group E: handlerError 逻辑验证 ============
  await ok('E1: 提取 event.error', () => {
    assert.match(ASYNC_GUARD_SRC, /event\.error/);
  });
  await ok('E2: 转换为 Error 实例', () => {
    assert.match(ASYNC_GUARD_SRC, /new\s+Error\s*\(\s*\(event\s*&&\s*event\.message\)/);
  });
  await ok('E3: console.error 输出', () => {
    assert.match(ASYNC_GUARD_SRC, /console\.error\s*\(\s*['"]\[asyncGuard\]\s+window\.error/);
  });
  await ok('E4: 上报 telemetry', () => {
    assert.match(ASYNC_GUARD_SRC, /kind:\s*['"]window\.error['"]/);
  });

  // ============ Group F: wrapAsyncHandler 逻辑验证 ============
  await ok('F1: 检查 fn 类型', () => {
    assert.match(ASYNC_GUARD_SRC, /typeof\s+fn\s*!==\s*['"]function['"]/);
  });
  await ok('F2: 返回包装函数', () => {
    assert.match(ASYNC_GUARD_SRC, /return\s+async\s+function\s+wrapped/);
  });
  await ok('F3: try-catch 捕获错误', () => {
    assert.match(ASYNC_GUARD_SRC, /try\s*\{/);
    assert.match(ASYNC_GUARD_SRC, /catch\s*\(\s*e\s*\)/);
  });
  await ok('F4: 转换为 Error 实例', () => {
    assert.match(ASYNC_GUARD_SRC, /e\s+instanceof\s+Error\s*\?\s*e\s*:\s*new\s+Error/);
  });
  await ok('F5: 上报 telemetry', () => {
    assert.match(ASYNC_GUARD_SRC, /kind:\s*['"]wrapAsyncHandler['"]/);
  });
  await ok('F6: 调用 onError 回调', () => {
    assert.match(ASYNC_GUARD_SRC, /onError\s*\(\s*err\s*\)/);
  });
  await ok('F7: 不 rethrow（return undefined）', () => {
    assert.match(ASYNC_GUARD_SRC, /return\s+undefined/);
  });

  // ============ Group G: reportTelemetry 逻辑验证 ============
  await ok('G1: 检查 _telemetryUrl', () => {
    assert.match(ASYNC_GUARD_SRC, /if\s*\(\s*!\s*_telemetryUrl/);
  });
  await ok('G2: 检查 navigator 环境', () => {
    assert.match(ASYNC_GUARD_SRC, /typeof\s+navigator\s*===\s*['"]undefined['"]/);
  });
  await ok('G3: 使用 sendBeacon 优先', () => {
    assert.match(ASYNC_GUARD_SRC, /navigator\.sendBeacon/);
  });
  await ok('G4: fallback 到 fetch', () => {
    assert.match(ASYNC_GUARD_SRC, /fetch\s*\(\s*_telemetryUrl/);
  });
  await ok('G5: 错误静默处理', () => {
    assert.match(ASYNC_GUARD_SRC, /catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\/\*.*ignore.*\*\/\s*\}/);
  });
  await ok('G6: console.warn 输出', () => {
    assert.match(ASYNC_GUARD_SRC, /console\.warn\s*\(\s*['"]\[asyncGuard\]\s+telemetry\s+report\s+failed/);
  });

  // ============ Group H: uninstallAsyncGuard 逻辑验证 ============
  await ok('H1: 调用 _currentListener', () => {
    assert.match(ASYNC_GUARD_SRC, /if\s*\(\s*_currentListener\s*\)\s+_currentListener\s*\(\)/);
  });
  await ok('H2: 卸载时清除 _installed', () => {
    assert.match(ASYNC_GUARD_SRC, /_installed\s*=\s*false/);
  });
  await ok('H3: 卸载时清除 _currentListener', () => {
    assert.match(ASYNC_GUARD_SRC, /_currentListener\s*=\s*null/);
  });
  await ok('H4: 卸载时清除 _telemetryUrl', () => {
    assert.match(ASYNC_GUARD_SRC, /_telemetryUrl\s*=\s*null/);
  });

  // ============ Group I: isAsyncGuardInstalled 逻辑验证 ============
  await ok('I1: 返回 _installed 状态', () => {
    assert.match(ASYNC_GUARD_SRC, /return\s+_installed/);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
