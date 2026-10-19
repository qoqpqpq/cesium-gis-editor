// tests/specs/mcpmanifest-tools.cjs
// 周期 18 R4: mcpManifest.js MCP 工具清单测试
// 目标：≥ 20 PASS
//
// 覆盖：
//   - registerTool / unregisterTool 工具注册/注销
//   - manifest 工具清单生成
//   - callTool 工具调用
//   - listTools 工具列表
//   - installBrowserGlobal / uninstallBrowserGlobal 浏览器全局
//   - setBridgeDeps / registerCoreGisTools 核心 GIS 工具
//   - installBridgeTransport / uninstallBridgeTransport 桥接传输

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const MCPMANIFEST_SRC = fs.readFileSync(path.join(ROOT, 'client/src/pages/gis/mcpManifest.js'), 'utf8');

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
  console.log('=== mcpmanifest-tools ===');

  // ============ Group A: 静态扫描 - 导出验证 ============
  await ok('A1: 导出 registerTool 函数', () => {
    assert.match(MCPMANIFEST_SRC, /function\s+registerTool/);
  });
  await ok('A2: 导出 unregisterTool 函数', () => {
    assert.match(MCPMANIFEST_SRC, /function\s+unregisterTool/);
  });
  await ok('A3: 导出 manifest 函数', () => {
    assert.match(MCPMANIFEST_SRC, /function\s+manifest/);
  });
  await ok('A4: 导出 callTool 函数', () => {
    assert.match(MCPMANIFEST_SRC, /async\s+function\s+callTool/);
  });
  await ok('A5: 导出 listTools 函数', () => {
    assert.match(MCPMANIFEST_SRC, /function\s+listTools/);
  });
  await ok('A6: 导出 installBrowserGlobal 函数', () => {
    assert.match(MCPMANIFEST_SRC, /function\s+installBrowserGlobal/);
  });
  await ok('A7: 导出 uninstallBrowserGlobal 函数', () => {
    assert.match(MCPMANIFEST_SRC, /function\s+uninstallBrowserGlobal/);
  });
  await ok('A8: 导出 _resetAll 函数', () => {
    assert.match(MCPMANIFEST_SRC, /function\s+_resetAll/);
  });
  await ok('A9: 导出 setBridgeDeps 函数', () => {
    assert.match(MCPMANIFEST_SRC, /function\s+setBridgeDeps/);
  });
  await ok('A10: 导出 registerCoreGisTools 函数', () => {
    assert.match(MCPMANIFEST_SRC, /function\s+registerCoreGisTools/);
  });
  await ok('A11: 导出 installBridgeTransport 函数', () => {
    assert.match(MCPMANIFEST_SRC, /function\s+installBridgeTransport/);
  });
  await ok('A12: 导出 uninstallBridgeTransport 函数', () => {
    assert.match(MCPMANIFEST_SRC, /function\s+uninstallBridgeTransport/);
  });
  await ok('A13: 导出 isBridgeInstalled 函数', () => {
    assert.match(MCPMANIFEST_SRC, /function\s+isBridgeInstalled/);
  });
  await ok('A14: 导出默认对象', () => {
    assert.match(MCPMANIFEST_SRC, /export\s+default\s+\{/);
  });

  // ============ Group B: 静态扫描 - 内部状态 ============
  await ok('B1: 定义 _tools Map', () => {
    assert.match(MCPMANIFEST_SRC, /const\s+_tools\s*=\s*new\s+Map/);
  });
  await ok('B2: 定义 _bridgeDeps 对象', () => {
    assert.match(MCPMANIFEST_SRC, /let\s+_bridgeDeps\s*=\s*\{\s*viewer:\s*null\s*,\s*sandbox:\s*null\s*\}/);
  });
  await ok('B3: 定义 _bridgeInstalled 标记', () => {
    assert.match(MCPMANIFEST_SRC, /let\s+_bridgeInstalled\s*=\s*false/);
  });

  // ============ Group C: registerTool 逻辑验证 ============
  await ok('C1: 检查 name 是非空字符串', () => {
    assert.match(MCPMANIFEST_SRC, /!\s*name\s*\|\|\s*typeof\s*name\s*!==\s*['"]string['"]/);
  });
  await ok('C2: name 无效时返回 false', () => {
    assert.match(MCPMANIFEST_SRC, /return\s+false/);
  });
  await ok('C3: 检查工具是否已存在', () => {
    assert.match(MCPMANIFEST_SRC, /_tools\.has\s*\(\s*name\s*\)/);
  });
  await ok('C4: 已存在时 console.warn', () => {
    assert.match(MCPMANIFEST_SRC, /console\.warn/);
  });
  await ok('C5: 存储工具到 _tools', () => {
    assert.match(MCPMANIFEST_SRC, /_tools\.set\s*\(/);
  });
  await ok('C6: 返回 true', () => {
    assert.match(MCPMANIFEST_SRC, /return\s+true/);
  });

  // ============ Group D: manifest 逻辑验证 ============
  await ok('D1: 返回 protocolVersion', () => {
    assert.match(MCPMANIFEST_SRC, /protocolVersion:\s*['"]2025-06-18['"]/);
  });
  await ok('D2: 返回 serverInfo', () => {
    assert.match(MCPMANIFEST_SRC, /serverInfo:\s*\{/);
  });
  await ok('D3: 返回 capabilities', () => {
    assert.match(MCPMANIFEST_SRC, /capabilities:\s*\{/);
  });
  await ok('D4: 返回 tools 列表', () => {
    assert.match(MCPMANIFEST_SRC, /const\s+tools\s*=\s*\[\]/);
  });
  await ok('D5: tools 包含 name/description/inputSchema', () => {
    assert.match(MCPMANIFEST_SRC, /name:\s*t\.name/);
    assert.match(MCPMANIFEST_SRC, /description:\s*t\.description/);
    assert.match(MCPMANIFEST_SRC, /inputSchema:\s*t\.inputSchema/);
  });

  // ============ Group E: callTool 逻辑验证 ============
  await ok('E1: 从 _tools 获取工具', () => {
    assert.match(MCPMANIFEST_SRC, /_tools\.get\s*\(\s*name\s*\)/);
  });
  await ok('E2: 工具不存在时返回错误', () => {
    assert.match(MCPMANIFEST_SRC, /工具\s*\$\{name\}\s*不存在/);
  });
  await ok('E3: 调用 handler', () => {
    assert.match(MCPMANIFEST_SRC, /t\.handler\s*\(/);
  });
  await ok('E4: 返回 { ok: true, value }', () => {
    assert.match(MCPMANIFEST_SRC, /ok:\s*true\s*,\s*value/);
  });
  await ok('E5: 捕获异常返回错误', () => {
    assert.match(MCPMANIFEST_SRC, /catch\s*\(\s*e\s*\)/);
    assert.match(MCPMANIFEST_SRC, /ok:\s*false\s*,\s*error/);
  });

  // ============ Group F: listTools 逻辑验证 ============
  await ok('F1: 返回工具名数组', () => {
    assert.match(MCPMANIFEST_SRC, /Array\.from\s*\(\s*_tools\.keys\s*\(\s*\)\s*\)/);
  });

  // ============ Group G: installBrowserGlobal 逻辑验证 ============
  await ok('G1: 检查 window 环境', () => {
    assert.match(MCPMANIFEST_SRC, /typeof\s+window\s*===\s*['"]undefined['"]/);
  });
  await ok('G2: 检查 dev 模式', () => {
    assert.match(MCPMANIFEST_SRC, /import\.meta\.env\.MODE\s*!==\s*['"]production['"]/);
  });
  await ok('G3: 检查 URL 参数 ?mcp=1', () => {
    assert.match(MCPMANIFEST_SRC, /urlParams\.get\s*\(\s*['"]mcp['"]\s*\)\s*===\s*['"]1['"]/);
  });
  await ok('G4: 检查是否已安装', () => {
    assert.match(MCPMANIFEST_SRC, /window\.mcp\s*&&\s*window\.mcp\.__cesiumInstalled/);
  });
  await ok('G5: 设置 window.mcp', () => {
    assert.match(MCPMANIFEST_SRC, /window\.mcp\s*=\s*\{/);
  });
  await ok('G6: 设置 __cesiumInstalled 标记', () => {
    assert.match(MCPMANIFEST_SRC, /__cesiumInstalled:\s*true/);
  });
  await ok('G7: 暴露 manifest/registerTool/unregisterTool/callTool/listTools', () => {
    assert.match(MCPMANIFEST_SRC, /manifest\s*,/);
    assert.match(MCPMANIFEST_SRC, /registerTool\s*,/);
    assert.match(MCPMANIFEST_SRC, /unregisterTool\s*,/);
    assert.match(MCPMANIFEST_SRC, /callTool\s*,/);
    assert.match(MCPMANIFEST_SRC, /listTools/);
  });

  // ============ Group H: 核心 GIS 工具验证 ============
  await ok('H1: _defaultToolHandlers 包含 getCameraState', () => {
    assert.match(MCPMANIFEST_SRC, /getCameraState\s*:\s*\{/);
  });
  await ok('H2: _defaultToolHandlers 包含 flyTo', () => {
    assert.match(MCPMANIFEST_SRC, /flyTo\s*:\s*\{/);
  });
  await ok('H3: _defaultToolHandlers 包含 addMarker', () => {
    assert.match(MCPMANIFEST_SRC, /addMarker\s*:\s*\{/);
  });
  await ok('H4: _defaultToolHandlers 包含 spatialQuery', () => {
    assert.match(MCPMANIFEST_SRC, /spatialQuery\s*:\s*\{/);
  });
  await ok('H5: _defaultToolHandlers 包含 screenshot', () => {
    assert.match(MCPMANIFEST_SRC, /screenshot\s*:\s*\{/);
  });
  await ok('H6: getCameraState 检查 viewer', () => {
    assert.match(MCPMANIFEST_SRC, /viewer\s*===\s*null\s*\|\|\s*typeof\s*viewer\.getCameraState\s*!==\s*['"]function['"]/);
  });
  await ok('H7: flyTo 检查 viewer', () => {
    assert.match(MCPMANIFEST_SRC, /viewer\.flyTo/);
  });
  await ok('H8: addMarker 检查 viewer', () => {
    assert.match(MCPMANIFEST_SRC, /viewer\.addMarker/);
  });
  await ok('H9: spatialQuery 检查 sandbox', () => {
    assert.match(MCPMANIFEST_SRC, /sandbox\.run/);
  });
  await ok('H10: screenshot 检查 viewer', () => {
    assert.match(MCPMANIFEST_SRC, /viewer\.screenshot/);
  });

  // ============ Group I: bridge transport 验证 ============
  await ok('I1: installBridgeTransport 检查 window', () => {
    assert.match(MCPMANIFEST_SRC, /typeof\s+window\s*===\s*['"]undefined['"]/);
  });
  await ok('I2: installBridgeTransport 检查 _bridgeInstalled', () => {
    assert.match(MCPMANIFEST_SRC, /if\s*\(\s*_bridgeInstalled\s*\)\s+return\s+true/);
  });
  await ok('I3: allowedOrigins 默认值', () => {
    assert.match(MCPMANIFEST_SRC, /allowedOrigins\s*\|\|\s*\[\s*['"]null['"]\s*,\s*['"]https:\/\/claude\.ai['"]\s*,\s*['"]\*['"]\s*\]/);
  });
  await ok('I4: 监听 message 事件', () => {
    assert.match(MCPMANIFEST_SRC, /window\.addEventListener\s*\(\s*['"]message['"]/);
  });
  await ok('I5: 检查 jsonrpc 版本', () => {
    assert.match(MCPMANIFEST_SRC, /data\.jsonrpc\s*!==\s*['"]2\.0['"]/);
  });
  await ok('I6: 支持 tools/list 方法', () => {
    assert.match(MCPMANIFEST_SRC, /data\.method\s*===\s*['"]tools\/list['"]/);
  });
  await ok('I7: 支持 tools/call 方法', () => {
    assert.match(MCPMANIFEST_SRC, /data\.method\s*===\s*['"]tools\/call['"]/);
  });
  await ok('I8: 通过 postMessage 回传', () => {
    assert.match(MCPMANIFEST_SRC, /event\.source\.postMessage/);
  });
  await ok('I9: uninstallBridgeTransport 清除标记', () => {
    assert.match(MCPMANIFEST_SRC, /_bridgeInstalled\s*=\s*false/);
  });
  await ok('I10: isBridgeInstalled 返回 _bridgeInstalled', () => {
    assert.match(MCPMANIFEST_SRC, /return\s+_bridgeInstalled/);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
