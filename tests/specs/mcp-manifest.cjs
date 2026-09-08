// tests/specs/mcp-manifest.cjs
// 周期 8 P1-1: MCP (Model Context Protocol) manifest 浏览器侧暴露
//
// 背景：
//   - 周期 7 P0-3 评估 MCP / WebMCP
//   - 周期 8 P1-1 落地最小可用 manifest（client/src/pages/gis/mcpManifest.js）
//   - 不接真 Claude Desktop（周期 9+）；本周期只验证 manifest 结构 + 工具注册 API
//
// 验收：
//   1. 静态扫描：mcpManifest.js 存在并导出 registerTool / unregisterTool / manifest / callTool / listTools
//   2. 静态扫描：mcpManifest.js 含 installBrowserGlobal + uninstallBrowserGlobal
//   3. 静态扫描：mcpManifest.js 含 protocolVersion（2025-06-18）
//   4. 静态扫描：mcpManifest.js 含 dev mode + ?mcp=1 启用条件
//   5. 静态扫描：mcpManifest.js 暴露 window.mcp（__cesiumInstalled 标记）
//   6. 静态扫描：mcpManifest.js 与 client/src/pages/gis/sandbox.js 工具名一致（约定）
//   7. 行为（jsdom 模拟）：registerTool 后 manifest 包含该工具
//   8. 行为（jsdom 模拟）：callTool 调用 handler 返回 ok:true
//   9. 行为（jsdom 模拟）：callTool 不存在的工具返回 ok:false
//   10. 行为：unregisterTool 后 listTools 不含该工具
//   11. 行为：重复注册同名工具覆盖（warning）

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

const MANIFEST_PATH = path.resolve(__dirname, '../../client/src/pages/gis/mcpManifest.js');
const MANIFEST_SRC = fs.readFileSync(MANIFEST_PATH, 'utf8');

(async () => {
  console.log('=== mcp-manifest ===');

  // ---- 1. 静态扫描 ----
  await test('mcpManifest.js 文件存在', () => {
    assert.ok(fs.existsSync(MANIFEST_PATH));
  });

  await test('mcpManifest.js 导出 registerTool / unregisterTool / manifest / callTool / listTools', () => {
    assert.match(MANIFEST_SRC, /export\s+\{[^}]*registerTool/);
    assert.match(MANIFEST_SRC, /export\s+\{[^}]*unregisterTool/);
    assert.match(MANIFEST_SRC, /export\s+\{[^}]*manifest/);
    assert.match(MANIFEST_SRC, /export\s+\{[^}]*callTool/);
    assert.match(MANIFEST_SRC, /export\s+\{[^}]*listTools/);
  });

  await test('mcpManifest.js 含 installBrowserGlobal + uninstallBrowserGlobal', () => {
    assert.match(MANIFEST_SRC, /function\s+installBrowserGlobal/);
    assert.match(MANIFEST_SRC, /function\s+uninstallBrowserGlobal/);
  });

  await test('mcpManifest.js 含 MCP protocolVersion（2025-06-18）', () => {
    assert.match(MANIFEST_SRC, /protocolVersion/);
    assert.match(MANIFEST_SRC, /2025-06-18/);
  });

  await test('mcpManifest.js 含 dev mode + ?mcp=1 启用条件', () => {
    assert.match(MANIFEST_SRC, /import\.meta\.env\.MODE/);
    assert.match(MANIFEST_SRC, /production/);
    assert.match(MANIFEST_SRC, /mcp.*=\s*['"]1['"]/);
  });

  await test('mcpManifest.js 暴露 window.mcp + __cesiumInstalled 标记', () => {
    assert.match(MANIFEST_SRC, /window\.mcp\s*=/);
    assert.match(MANIFEST_SRC, /__cesiumInstalled/);
  });

  await test('mcpManifest.js 不覆盖已有 window.mcp（如已加载真 MCP SDK）', () => {
    // 静态扫描：installBrowserGlobal 应先检查 window.mcp && window.mcp.__cesiumInstalled
    assert.match(MANIFEST_SRC, /window\.mcp\s*&&\s*window\.mcp\.__cesiumInstalled/);
  });

  await test('mcpManifest.js manifest() 返回 serverInfo + capabilities + tools', () => {
    assert.match(MANIFEST_SRC, /serverInfo/);
    assert.match(MANIFEST_SRC, /capabilities/);
    assert.match(MANIFEST_SRC, /tools/);
    assert.match(MANIFEST_SRC, /name:\s*['"]cesium-gis-editor['"]/);
  });

  await test('mcpManifest.js callTool 错误处理：ok:false + error', () => {
    assert.match(MANIFEST_SRC, /工具.*不存在/);
    assert.match(MANIFEST_SRC, /ok:\s*false/);
    // 错误信息提取（e.message 或 String(e) 兜底）
    assert.match(MANIFEST_SRC, /e\s*&&\s*e\.message/);
  });

  // ---- 2. 行为：模拟导入 + 注册 + 调用 ----
  // 由于 mcpManifest.js 是 ESM，本 spec 直接 require 该模块（在 Node 18+ 中 .js + ESM 需 .mjs 或 package.json type=module）
  // 这里改用 inline 静态分析：动态 eval 模块代码
  // Windows 下 ESM dynamic import 必须用 file:// URL
  const fileUrl = require('node:url').pathToFileURL(MANIFEST_PATH).href;

  await test('动态导入 + registerTool + manifest 验证', async () => {
    // 通过临时文件跑 ESM 脚本（避免 command line 转义陷阱）
    const os = require('node:os');
    const tmpFile = path.join(os.tmpdir(), `mcp-test-${Date.now()}-${Math.random()}.mjs`);
    fs.writeFileSync(tmpFile, `
      import * as mod from '${fileUrl}';
      const { registerTool, manifest, callTool, listTools, unregisterTool, _resetAll } = mod;
      _resetAll();
      registerTool('draw_polygon', 'Draw a polygon on the map', {
        type: 'object',
        properties: { coordinates: { type: 'array' } }
      }, async (args) => {
        return { ok: true, drawn: true, points: args.coordinates ? args.coordinates.length : 0 };
      });
      const m = manifest();
      if (m.protocolVersion !== '2025-06-18') { console.error('protocolVersion mismatch'); process.exit(1); }
      if (m.tools.length !== 1) { console.error('expected 1 tool, got ' + m.tools.length); process.exit(1); }
      if (m.tools[0].name !== 'draw_polygon') { console.error('tool name mismatch'); process.exit(1); }
      const r = await callTool('draw_polygon', { coordinates: [1, 2, 3, 4] });
      if (!r.ok || r.value.drawn !== true || r.value.points !== 4) {
        console.error('callTool result: ' + JSON.stringify(r));
        process.exit(1);
      }
      unregisterTool('draw_polygon');
      if (listTools().length !== 0) { console.error('unregister failed'); process.exit(1); }
      const r2 = await callTool('not_exist', {});
      if (r2.ok) { console.error('not_exist should fail'); process.exit(1); }
      console.log('OK');
    `, 'utf8');
    try {
      const { execSync } = require('node:child_process');
      const result = execSync(`node "${tmpFile}"`, {
        encoding: 'utf8',
        cwd: path.resolve(__dirname, '../..'),
        timeout: 15000,
      });
      assert.match(result, /OK/);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
  });

  await test('重复注册同名工具：覆盖（返回 true 但 console.warn）', async () => {
    const os = require('node:os');
    const tmpFile = path.join(os.tmpdir(), `mcp-test-dup-${Date.now()}-${Math.random()}.mjs`);
    fs.writeFileSync(tmpFile, `
      import * as mod from '${fileUrl}';
      const { registerTool, manifest, _resetAll } = mod;
      _resetAll();
      const r1 = registerTool('tool_a', 'desc1', {}, async () => 1);
      const r2 = registerTool('tool_a', 'desc2', {}, async () => 2);
      if (!r1 || !r2) { console.error('register failed'); process.exit(1); }
      const m = manifest();
      if (m.tools.length !== 1) { console.error('expected 1 tool, got ' + m.tools.length); process.exit(1); }
      if (m.tools[0].description !== 'desc2') { console.error('description not updated'); process.exit(1); }
      console.log('OK');
    `, 'utf8');
    try {
      const { execSync } = require('node:child_process');
      const result = execSync(`node "${tmpFile}"`, {
        encoding: 'utf8',
        cwd: path.resolve(__dirname, '../..'),
        timeout: 15000,
      });
      assert.match(result, /OK/);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
  });

  await test('registerTool 空 name 拒绝（返回 false）', async () => {
    const os = require('node:os');
    const tmpFile = path.join(os.tmpdir(), `mcp-test-empty-${Date.now()}-${Math.random()}.mjs`);
    fs.writeFileSync(tmpFile, `
      import * as mod from '${fileUrl}';
      const { registerTool, _resetAll } = mod;
      _resetAll();
      const r1 = registerTool('', 'desc', {}, async () => 1);
      const r2 = registerTool(null, 'desc', {}, async () => 1);
      const r3 = registerTool(undefined, 'desc', {}, async () => 1);
      if (r1 || r2 || r3) { console.error('expected false, got r1=' + r1 + ' r2=' + r2 + ' r3=' + r3); process.exit(1); }
      console.log('OK');
    `, 'utf8');
    try {
      const { execSync } = require('node:child_process');
      const result = execSync(`node "${tmpFile}"`, {
        encoding: 'utf8',
        cwd: path.resolve(__dirname, '../..'),
        timeout: 15000,
      });
      assert.match(result, /OK/);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
