// tests/specs/mcp-tool-categories.mjs
// 周期 19 P0-1: mcpManifest 工具分类元数据层（camera/entity/animation/imagery）单元测试
// 目标：≥ 18 子断言 PASS；既有 manifest/listTools/registerTool 语义零回归
// 形态：.mjs（被测模块为 ESM 客户端模块，顶层无 window/import.meta 依赖，可在 Node ESM 导入）

import assert from 'node:assert/strict';
import {
  registerTool,
  unregisterTool,
  manifest,
  listTools,
  _resetAll,
  registerCoreGisTools,
  setBridgeDeps,
  TOOL_CATEGORIES,
  listToolsByCategory,
  manifestByCategory,
} from '../../client/src/pages/gis/mcpManifest.js';

let pass = 0;
let fail = 0;

async function ok(label, fn) {
  try {
    await fn();
    pass += 1;
    console.log(`  [PASS] ${label}`);
  } catch (e) {
    fail += 1;
    console.error(`  [FAIL] ${label}: ${e.message}`);
  }
}

// 注入空依赖（handler 不会被真正调用，仅注册）
setBridgeDeps({ viewer: {}, sandbox: {} });

(async function main() {
  console.log('=== mcp-tool-categories ===');

  // ============ Group A: TOOL_CATEGORIES 常量 ============
  await ok('A1: TOOL_CATEGORIES 含 4 业务类 + general 兜底', () => {
    assert.deepEqual(Object.values(TOOL_CATEGORIES).sort(), ['animation', 'camera', 'entity', 'general', 'imagery']);
  });
  await ok('A2: TOOL_CATEGORIES 冻结（不可变）', () => {
    assert.ok(Object.isFrozen(TOOL_CATEGORIES));
  });

  // ============ Group B: 默认核心工具分类标注 ============
  await ok('B1: registerCoreGisTools 注册 5 个核心工具', () => {
    _resetAll();
    const reg = registerCoreGisTools();
    assert.equal(reg.length, 5);
  });
  await ok('B2: getCameraState / flyTo → camera', () => {
    _resetAll();
    registerCoreGisTools();
    const cam = listToolsByCategory(TOOL_CATEGORIES.CAMERA);
    assert.ok(cam.includes('getCameraState'));
    assert.ok(cam.includes('flyTo'));
  });
  await ok('B3: addMarker / spatialQuery → entity', () => {
    _resetAll();
    registerCoreGisTools();
    const ent = listToolsByCategory(TOOL_CATEGORIES.ENTITY);
    assert.ok(ent.includes('addMarker'));
    assert.ok(ent.includes('spatialQuery'));
  });
  await ok('B4: screenshot → imagery', () => {
    _resetAll();
    registerCoreGisTools();
    assert.ok(listToolsByCategory(TOOL_CATEGORIES.IMAGERY).includes('screenshot'));
  });
  await ok('B5: animation 组为空（当前无动画工具，不凭空造）', () => {
    _resetAll();
    registerCoreGisTools();
    assert.deepEqual(listToolsByCategory(TOOL_CATEGORIES.ANIMATION), []);
  });

  // ============ Group C: listToolsByCategory 全量分组 ============
  await ok('C1: 省略参数返回全量分组（含空组）', () => {
    _resetAll();
    registerCoreGisTools();
    const all = listToolsByCategory();
    assert.deepEqual(all.camera.sort(), ['flyTo', 'getCameraState']);
    assert.deepEqual(all.entity.sort(), ['addMarker', 'spatialQuery']);
    assert.deepEqual(all.imagery, ['screenshot']);
    assert.deepEqual(all.animation, []);
    assert.deepEqual(all.general, []);
  });
  await ok('C2: 分组并集 = listTools()（无遗漏/重复）', () => {
    _resetAll();
    registerCoreGisTools();
    const all = listToolsByCategory();
    const grouped = Object.values(all).flat().sort();
    assert.deepEqual(grouped, listTools().sort());
  });

  // ============ Group D: registerTool 分类规范化 ============
  await ok('D1: 合法 category 被接受', () => {
    _resetAll();
    registerTool('t1', 'd', { type: 'object' }, async () => ({}), 'camera');
    assert.deepEqual(listToolsByCategory('camera'), ['t1']);
  });
  await ok('D2: 非法 category 回落 general', () => {
    _resetAll();
    registerTool('t2', 'd', { type: 'object' }, async () => ({}), 'not-a-cat');
    assert.deepEqual(listToolsByCategory('general'), ['t2']);
  });
  await ok('D3: 省略 category 默认 general', () => {
    _resetAll();
    registerTool('t3', 'd', { type: 'object' }, async () => ({}));
    assert.deepEqual(listToolsByCategory('general'), ['t3']);
  });
  await ok('D4: 非字符串 category（如对象）回落 general', () => {
    _resetAll();
    registerTool('t4', 'd', { type: 'object' }, async () => ({}), { foo: 1 });
    assert.deepEqual(listToolsByCategory('general'), ['t4']);
  });
  await ok('D5: 同名工具重注册覆盖分类', () => {
    _resetAll();
    registerTool('dup', 'd', { type: 'object' }, async () => ({}), 'camera');
    registerTool('dup', 'd', { type: 'object' }, async () => ({}), 'imagery');
    assert.deepEqual(listToolsByCategory('imagery'), ['dup']);
    assert.deepEqual(listToolsByCategory('camera'), []);
  });

  // ============ Group E: manifestByCategory 子 manifest ============
  await ok('E1: manifestByCategory(camera) 仅含 camera 工具', () => {
    _resetAll();
    registerCoreGisTools();
    const m = manifestByCategory('camera');
    assert.deepEqual(m.tools.map((t) => t.name).sort(), ['flyTo', 'getCameraState']);
  });
  await ok('E2: 子 manifest 保留 protocolVersion 与 inputSchema', () => {
    _resetAll();
    registerCoreGisTools();
    const m = manifestByCategory('imagery');
    assert.equal(m.protocolVersion, manifest().protocolVersion);
    const shot = m.tools.find((t) => t.name === 'screenshot');
    assert.ok(shot.inputSchema);
  });
  await ok('E3: 子 manifest serverInfo.name 带 -<category> 后缀', () => {
    _resetAll();
    registerCoreGisTools();
    const m = manifestByCategory('entity');
    assert.equal(m.serverInfo.name, 'cesium-gis-editor-entity');
    assert.equal(m.category, 'entity');
  });
  await ok('E4: 非法 category → manifestByCategory 回落 general（空 tools 不抛）', () => {
    _resetAll();
    registerCoreGisTools();
    const m = manifestByCategory('bogus');
    assert.equal(m.category, 'general');
    assert.deepEqual(m.tools, []);
  });

  // ============ Group F: 与既有 API 共存 / 零回归 ============
  await ok('F1: manifest() 仍暴露全部工具（分类不影响全量 manifest）', () => {
    _resetAll();
    registerCoreGisTools();
    assert.equal(manifest().tools.length, 5);
  });
  await ok('F2: listTools() 仍返回全部工具名', () => {
    _resetAll();
    registerCoreGisTools();
    assert.equal(listTools().length, 5);
  });
  await ok('F3: unregisterTool 同时清理分类', () => {
    _resetAll();
    registerTool('gone', 'd', { type: 'object' }, async () => ({}), 'camera');
    unregisterTool('gone');
    assert.deepEqual(listToolsByCategory('camera'), []);
  });
  await ok('F4: _resetAll 清空工具与分类', () => {
    registerCoreGisTools();
    _resetAll();
    assert.deepEqual(listTools(), []);
    const all = listToolsByCategory();
    assert.ok(Object.values(all).every((g) => g.length === 0));
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});