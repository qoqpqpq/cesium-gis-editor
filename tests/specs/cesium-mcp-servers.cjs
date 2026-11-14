// tests/specs/cesium-mcp-servers.cjs
// 周期 15 R5: cesium-mcp 拆分 4 个 server（camera / entity / animation / imagery）
// 目标：≥ 20 PASS
//
// 覆盖：
//   - 模块导出
//   - createMcpServer 基类（manifest / callTool / listTools）
//   - createCameraServer（4 工具）
//   - createEntityServer（4 工具）
//   - createAnimationServer（5 工具）
//   - createImageryServer（5 工具）
//   - createRegistry（4 server + 聚合 manifest）

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const {
  createMcpServer,
  createCameraServer,
  createEntityServer,
  createAnimationServer,
  createImageryServer,
  createRegistry,
} = require(path.join(__dirname, '../../server/services/mcpServers'));

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

// ---- Mock Cesium Viewer ----
function mockViewer() {
  return {
    camera: { heading: 0, pitch: -Math.PI / 4, roll: 0 },
    animation: { playing: false, speed: 1 },
    getCameraState: async () => ({ longitude: 0, latitude: 0, height: 10000 }),
    flyTo: async (args) => ({ ok: true, ...args }),
    addMarker: async (args) => ({ id: 'marker-1', ...args }),
    removeMarker: async (id) => ({ ok: true, id }),
    listMarkers: async () => [{ id: 'marker-1', longitude: 0, latitude: 0 }],
    addImageryLayer: async (args) => ({ id: 'layer-1', ...args }),
    removeImageryLayer: async (id) => ({ ok: true, id }),
    listImageryLayers: async () => [{ id: 'layer-1', type: 'osm' }],
    screenshot: async (args) => ({ dataUrl: 'data:image/png;base64,abc' }),
    setImageryStyle: async (style) => ({ ok: true, style }),
  };
}

// ---- Mock Sandbox ----
function mockSandbox() {
  return {
    run: async (toolStr) => ({ ok: true, toolStr }),
  };
}

(async function main() {
  console.log('=== cesium-mcp-servers ===');

  // ============ Group A: 模块导出 ============
  await ok('A1: createMcpServer 已导出', () => {
    assert.equal(typeof createMcpServer, 'function');
  });
  await ok('A2: createCameraServer 已导出', () => {
    assert.equal(typeof createCameraServer, 'function');
  });
  await ok('A3: createEntityServer 已导出', () => {
    assert.equal(typeof createEntityServer, 'function');
  });
  await ok('A4: createAnimationServer 已导出', () => {
    assert.equal(typeof createAnimationServer, 'function');
  });
  await ok('A5: createImageryServer 已导出', () => {
    assert.equal(typeof createImageryServer, 'function');
  });
  await ok('A6: createRegistry 已导出', () => {
    assert.equal(typeof createRegistry, 'function');
  });

  // ============ Group B: createMcpServer 基类 ============
  await ok('B1: 基本创建', () => {
    const server = createMcpServer({
      name: 'test-server',
      description: 'Test server',
      tools: [
        { name: 'tool1', description: 'Tool 1', inputSchema: {}, handler: async () => 'ok' },
        { name: 'tool2', description: 'Tool 2', inputSchema: {}, handler: async () => 'ok' },
      ],
    });
    assert.equal(server.name, 'test-server');
    assert.equal(server.toolCount(), 2);
  });
  await ok('B2: manifest() 返回 MCP 格式', () => {
    const server = createMcpServer({
      name: 'test-server',
      description: 'Test server',
      tools: [{ name: 'tool1', description: 'Tool 1', inputSchema: {}, handler: async () => 'ok' }],
    });
    const m = server.manifest();
    assert.equal(m.protocolVersion, '2025-06-18');
    assert.equal(m.serverInfo.name, 'test-server');
    assert.equal(m.tools.length, 1);
    assert.equal(m.tools[0].name, 'tool1');
    assert.equal(m.tools[0].description, 'Tool 1');
  });
  await ok('B3: callTool 成功', async () => {
    const server = createMcpServer({
      name: 'test',
      tools: [{ name: 'echo', description: 'Echo', inputSchema: {}, handler: async (args) => args }],
    });
    const r = await server.callTool('echo', { msg: 'hello' });
    assert.equal(r.ok, true);
    assert.equal(r.value.msg, 'hello');
  });
  await ok('B4: callTool 工具不存在', async () => {
    const server = createMcpServer({ name: 'test', tools: [] });
    const r = await server.callTool('nonexistent', {});
    assert.equal(r.ok, false);
    assert.match(r.error, /不存在/);
  });
  await ok('B5: callTool handler 抛错', async () => {
    const server = createMcpServer({
      name: 'test',
      tools: [{ name: 'fail', description: '', inputSchema: {}, handler: async () => { throw new Error('boom'); } }],
    });
    const r = await server.callTool('fail', {});
    assert.equal(r.ok, false);
    assert.equal(r.error, 'boom');
  });
  await ok('B6: registerTool + unregisterTool', () => {
    const server = createMcpServer({ name: 'test', tools: [] });
    assert.equal(server.toolCount(), 0);
    server.registerTool('newTool', 'New', {}, async () => 'ok');
    assert.equal(server.toolCount(), 1);
    assert.ok(server.listTools().includes('newTool'));
    server.unregisterTool('newTool');
    assert.equal(server.toolCount(), 0);
  });
  await ok('B7: listTools 返回名称数组', () => {
    const server = createMcpServer({
      name: 'test',
      tools: [
        { name: 'a', description: '', inputSchema: {}, handler: async () => {} },
        { name: 'b', description: '', inputSchema: {}, handler: async () => {} },
      ],
    });
    const tools = server.listTools();
    assert.ok(tools.includes('a'));
    assert.ok(tools.includes('b'));
  });

  // ============ Group C: Camera Server ============
  await ok('C1: Camera server 创建 + 4 工具', () => {
    const viewer = mockViewer();
    const server = createCameraServer({ viewer });
    assert.equal(server.name, 'cesium-camera');
    assert.equal(server.toolCount(), 4);
    assert.ok(server.listTools().includes('getCameraState'));
    assert.ok(server.listTools().includes('flyTo'));
    assert.ok(server.listTools().includes('getCameraHeading'));
    assert.ok(server.listTools().includes('setCameraMode'));
  });
  await ok('C2: getCameraState 调用', async () => {
    const viewer = mockViewer();
    const server = createCameraServer({ viewer });
    const r = await server.callTool('getCameraState', {});
    assert.equal(r.ok, true);
    assert.equal(r.value.longitude, 0);
    assert.equal(r.value.height, 10000);
  });
  await ok('C3: flyTo 调用', async () => {
    const viewer = mockViewer();
    const server = createCameraServer({ viewer });
    const r = await server.callTool('flyTo', { longitude: 1, latitude: 2, height: 5000 });
    assert.equal(r.ok, true);
    assert.equal(r.value.longitude, 1);
    assert.equal(r.value.height, 5000);
  });
  await ok('C4: viewer 未注入 → 报错', async () => {
    const server = createCameraServer({});
    const r = await server.callTool('getCameraState', {});
    assert.equal(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });

  // ============ Group D: Entity Server ============
  await ok('D1: Entity server 创建 + 4 工具', () => {
    const viewer = mockViewer();
    const sandbox = mockSandbox();
    const server = createEntityServer({ viewer, sandbox });
    assert.equal(server.name, 'cesium-entity');
    assert.equal(server.toolCount(), 4);
    assert.ok(server.listTools().includes('addMarker'));
    assert.ok(server.listTools().includes('removeMarker'));
    assert.ok(server.listTools().includes('listMarkers'));
    assert.ok(server.listTools().includes('spatialQuery'));
  });
  await ok('D2: addMarker 调用', async () => {
    const viewer = mockViewer();
    const server = createEntityServer({ viewer });
    const r = await server.callTool('addMarker', { longitude: 1, latitude: 2, label: 'test' });
    assert.equal(r.ok, true);
    assert.equal(r.value.id, 'marker-1');
    assert.equal(r.value.label, 'test');
  });
  await ok('D3: spatialQuery 调用', async () => {
    const viewer = mockViewer();
    const sandbox = mockSandbox();
    const server = createEntityServer({ viewer, sandbox });
    const r = await server.callTool('spatialQuery', { operation: 'buffer', args: { geometry: {}, radius: 100 } });
    assert.equal(r.ok, true);
    assert.ok(r.value.toolStr.includes('<tool>buffer'));
  });
  await ok('D4: sandbox 未注入 → spatialQuery 报错', async () => {
    const viewer = mockViewer();
    const server = createEntityServer({ viewer });
    const r = await server.callTool('spatialQuery', { operation: 'buffer', args: {} });
    assert.equal(r.ok, false);
    assert.match(r.error, /sandbox 未注入/);
  });

  // ============ Group E: Animation Server ============
  await ok('E1: Animation server 创建 + 5 工具', () => {
    const viewer = mockViewer();
    const server = createAnimationServer({ viewer });
    assert.equal(server.name, 'cesium-animation');
    assert.equal(server.toolCount(), 5);
    assert.ok(server.listTools().includes('playAnimation'));
    assert.ok(server.listTools().includes('pauseAnimation'));
    assert.ok(server.listTools().includes('stopAnimation'));
    assert.ok(server.listTools().includes('setAnimationSpeed'));
    assert.ok(server.listTools().includes('recordTimeline'));
  });
  await ok('E2: playAnimation 调用', async () => {
    const viewer = mockViewer();
    const server = createAnimationServer({ viewer });
    const r = await server.callTool('playAnimation', { startTime: '2026-01-01', endTime: '2026-01-02', speed: 2 });
    assert.equal(r.ok, true);
    assert.equal(r.value.playing, true);
    assert.equal(r.value.speed, 2);
  });
  await ok('E3: setAnimationSpeed 调用', async () => {
    const viewer = mockViewer();
    const server = createAnimationServer({ viewer });
    const r = await server.callTool('setAnimationSpeed', { speed: 0.5 });
    assert.equal(r.ok, true);
    assert.equal(r.value.speed, 0.5);
  });
  await ok('E4: recordTimeline 调用', async () => {
    const viewer = mockViewer();
    const server = createAnimationServer({ viewer });
    const r = await server.callTool('recordTimeline', { label: 'frame1' });
    assert.equal(r.ok, true);
    assert.equal(r.value.keyframe.label, 'frame1');
    assert.ok(r.value.keyframe.camera);
  });

  // ============ Group F: Imagery Server ============
  await ok('F1: Imagery server 创建 + 5 工具', () => {
    const viewer = mockViewer();
    const server = createImageryServer({ viewer });
    assert.equal(server.name, 'cesium-imagery');
    assert.equal(server.toolCount(), 5);
    assert.ok(server.listTools().includes('addImageryLayer'));
    assert.ok(server.listTools().includes('removeImageryLayer'));
    assert.ok(server.listTools().includes('listImageryLayers'));
    assert.ok(server.listTools().includes('screenshot'));
    assert.ok(server.listTools().includes('setImageryStyle'));
  });
  await ok('F2: addImageryLayer 调用', async () => {
    const viewer = mockViewer();
    const server = createImageryServer({ viewer });
    const r = await server.callTool('addImageryLayer', { type: 'satellite', opacity: 0.8 });
    assert.equal(r.ok, true);
    assert.equal(r.value.id, 'layer-1');
    assert.equal(r.value.opacity, 0.8);
  });
  await ok('F3: screenshot 调用', async () => {
    const viewer = mockViewer();
    const server = createImageryServer({ viewer });
    const r = await server.callTool('screenshot', { quality: 0.9 });
    assert.equal(r.ok, true);
    assert.ok(r.value.dataUrl.startsWith('data:image/png'));
  });
  await ok('F4: setImageryStyle 调用', async () => {
    const viewer = mockViewer();
    const server = createImageryServer({ viewer });
    const r = await server.callTool('setImageryStyle', { style: 'dark' });
    assert.equal(r.ok, true);
    assert.equal(r.value.style, 'dark');
  });

  // ============ Group G: Registry ============
  await ok('G1: Registry 创建 + 4 server', () => {
    const viewer = mockViewer();
    const sandbox = mockSandbox();
    const registry = createRegistry({ viewer, sandbox });
    assert.equal(registry.serverCount(), 4);
    assert.deepEqual(registry.listServers(), ['camera', 'entity', 'animation', 'imagery']);
  });
  await ok('G2: Registry 总工具数 = 18', () => {
    const viewer = mockViewer();
    const sandbox = mockSandbox();
    const registry = createRegistry({ viewer, sandbox });
    assert.equal(registry.totalToolCount(), 18); // 4+4+5+5
  });
  await ok('G3: Registry getServer', () => {
    const viewer = mockViewer();
    const registry = createRegistry({ viewer });
    const camera = registry.getServer('camera');
    assert.ok(camera);
    assert.equal(camera.name, 'cesium-camera');
    assert.equal(registry.getServer('nonexistent'), null);
  });
  await ok('G4: Registry allManifests', () => {
    const viewer = mockViewer();
    const sandbox = mockSandbox();
    const registry = createRegistry({ viewer, sandbox });
    const manifests = registry.allManifests();
    assert.equal(manifests.length, 4);
    assert.equal(manifests[0].name, 'camera');
    assert.ok(manifests[0].tools.length > 0);
  });
  await ok('G5: Registry callTool', async () => {
    const viewer = mockViewer();
    const registry = createRegistry({ viewer });
    const r = await registry.callTool('camera', 'getCameraState', {});
    assert.equal(r.ok, true);
    assert.equal(r.value.longitude, 0);
  });
  await ok('G6: Registry callTool server 不存在', async () => {
    const viewer = mockViewer();
    const registry = createRegistry({ viewer });
    const r = await registry.callTool('nonexistent', 'tool', {});
    assert.equal(r.ok, false);
    assert.match(r.error, /不存在/);
  });
  await ok('G7: Registry registerServer + unregisterServer', () => {
    const viewer = mockViewer();
    const registry = createRegistry({ viewer });
    assert.equal(registry.serverCount(), 4);
    const custom = createMcpServer({ name: 'custom', tools: [] });
    registry.registerServer('custom', custom);
    assert.equal(registry.serverCount(), 5);
    assert.ok(registry.listServers().includes('custom'));
    registry.unregisterServer('custom');
    assert.equal(registry.serverCount(), 4);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
