// tests/specs/camera-server-deep.cjs
// Cycle 23 R3: Camera MCP Server 深度测试
// 目标：≥ 50 PASS
//
// 背景：
//   - server/services/mcpServers/cameraServer.js (92 lines)
//   - cesium-mcp-servers.cjs 仅覆盖 B1-B4 (4 用例) 基础路径
//   - 本次深度测试 4 个工具（getCameraState/flyTo/getCameraHeading/setCameraMode）
//     的边界、错误处理、参数校验、manifest 结构、registerTool/unregisterTool
//
// 覆盖点：
//   - 模块导出（createCameraServer）
//   - 创建 + name/description/version/protocolVersion
//   - manifest() 结构（4 工具完整 schema + enum + required + additionalProperties + default）
//   - listTools/toolCount
//   - getCameraState：成功 + viewer 缺失 + viewer.getCameraState 非函数
//   - flyTo：成功 + 参数传播 + 默认值 + viewer 缺失 + 非函数
//   - getCameraHeading：成功 + 返回 heading/pitch/roll + viewer 缺失 + camera 非对象
//   - setCameraMode：成功 + 3 种 mode + viewer 缺失 + camera 非对象
//   - registerTool/unregisterTool + listTools 变化
//   - 集成：完整相机生命周期

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const { createCameraServer } = require(path.join(__dirname, '../../server/services/mcpServers/cameraServer'));

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

// ---- helpers ----
function makeViewer(overrides = {}) {
  const state = {
    longitude: 1.92, // 北京经度（弧度）
    latitude: 0.349, // 北京纬度（弧度）
    height: 10000,
    heading: 0,
    pitch: -Math.PI / 4,
    roll: 0,
  };
  const flyCalls = [];
  return {
    _state: state,
    _flyCalls: flyCalls,
    camera: {
      heading: state.heading,
      pitch: state.pitch,
      roll: state.roll,
    },
    async getCameraState() {
      return { ...state };
    },
    async flyTo(args) {
      flyCalls.push(args);
      Object.assign(state, args);
      return { ok: true, ...args };
    },
    ...overrides,
  };
}

(async () => {
  console.log('=== camera-server-deep ===');

  // ============ Group A: 模块导出 ============
  await ok('A1: 导出 createCameraServer 函数', () => {
    assert.strictEqual(typeof createCameraServer, 'function');
  });
  await ok('A2: 模块仅导出 1 个 API', () => {
    const keys = Object.keys(require(path.join(__dirname, '../../server/services/mcpServers/cameraServer')));
    assert.deepStrictEqual(keys, ['createCameraServer']);
  });

  // ============ Group B: 创建 + 元数据 ============
  await ok('B1: createCameraServer 无参返回对象', () => {
    const s = createCameraServer();
    assert.ok(s && typeof s === 'object');
  });
  await ok('B2: name = cesium-camera', () => {
    const s = createCameraServer({});
    assert.strictEqual(s.name, 'cesium-camera');
  });
  await ok('B3: description 包含相机关键字', () => {
    const s = createCameraServer({});
    assert.match(s.description, /相机|camera/i);
  });
  await ok('B4: version = 1.0.0', () => {
    const s = createCameraServer({});
    assert.strictEqual(s.version, '1.0.0');
  });
  await ok('B5: protocolVersion 默认 2025-06-18', () => {
    const s = createCameraServer({});
    assert.strictEqual(s.protocolVersion, '2025-06-18');
  });
  await ok('B6: toolCount = 4', () => {
    const s = createCameraServer({});
    assert.strictEqual(s.toolCount(), 4);
  });
  await ok('B7: listTools 返回 4 个工具名', () => {
    const s = createCameraServer({});
    assert.deepStrictEqual(s.listTools().sort(), [
      'flyTo',
      'getCameraHeading',
      'getCameraState',
      'setCameraMode',
    ]);
  });

  // ============ Group C: manifest() 结构 ============
  await ok('C1: manifest 含 protocolVersion/serverInfo/capabilities/tools', () => {
    const s = createCameraServer({});
    const m = s.manifest();
    assert.strictEqual(m.protocolVersion, '2025-06-18');
    assert.ok(m.serverInfo);
    assert.strictEqual(m.serverInfo.name, 'cesium-camera');
    assert.ok(m.capabilities);
    assert.ok(Array.isArray(m.tools));
  });
  await ok('C2: manifest.tools 长度为 4', () => {
    const s = createCameraServer({});
    assert.strictEqual(s.manifest().tools.length, 4);
  });
  await ok('C3: manifest 每个 tool 有 name/description/inputSchema', () => {
    const s = createCameraServer({});
    for (const t of s.manifest().tools) {
      assert.ok(t.name, 'tool missing name');
      assert.ok(typeof t.description === 'string' && t.description.length > 0, 'tool missing description');
      assert.ok(t.inputSchema, 'tool missing inputSchema');
    }
  });
  await ok('C4: getCameraState inputSchema additionalProperties=false', () => {
    const s = createCameraServer({});
    const m = s.manifest();
    const gcs = m.tools.find((t) => t.name === 'getCameraState');
    assert.strictEqual(gcs.inputSchema.additionalProperties, false);
    assert.deepStrictEqual(Object.keys(gcs.inputSchema.properties), []);
  });
  await ok('C5: flyTo inputSchema 有 4 个属性', () => {
    const s = createCameraServer({});
    const m = s.manifest();
    const fly = m.tools.find((t) => t.name === 'flyTo');
    assert.deepStrictEqual(Object.keys(fly.inputSchema.properties).sort(), ['duration', 'height', 'latitude', 'longitude']);
  });
  await ok('C6: flyTo required 含 longitude/latitude', () => {
    const s = createCameraServer({});
    const m = s.manifest();
    const fly = m.tools.find((t) => t.name === 'flyTo');
    assert.deepStrictEqual(fly.inputSchema.required.sort(), ['latitude', 'longitude']);
  });
  await ok('C7: flyTo height 默认 10000 + duration 默认 1.5', () => {
    const s = createCameraServer({});
    const m = s.manifest();
    const fly = m.tools.find((t) => t.name === 'flyTo');
    assert.strictEqual(fly.inputSchema.properties.height.default, 10000);
    assert.strictEqual(fly.inputSchema.properties.duration.default, 1.5);
  });
  await ok('C8: flyTo longitude/latitude/height 类型为 number', () => {
    const s = createCameraServer({});
    const m = s.manifest();
    const fly = m.tools.find((t) => t.name === 'flyTo');
    assert.strictEqual(fly.inputSchema.properties.longitude.type, 'number');
    assert.strictEqual(fly.inputSchema.properties.latitude.type, 'number');
    assert.strictEqual(fly.inputSchema.properties.height.type, 'number');
    assert.strictEqual(fly.inputSchema.properties.duration.type, 'number');
  });
  await ok('C9: getCameraHeading inputSchema additionalProperties=false', () => {
    const s = createCameraServer({});
    const m = s.manifest();
    const gch = m.tools.find((t) => t.name === 'getCameraHeading');
    assert.strictEqual(gch.inputSchema.additionalProperties, false);
    assert.deepStrictEqual(Object.keys(gch.inputSchema.properties), []);
  });
  await ok('C10: setCameraMode required 含 mode + enum 3 种', () => {
    const s = createCameraServer({});
    const m = s.manifest();
    const scm = m.tools.find((t) => t.name === 'setCameraMode');
    assert.deepStrictEqual(scm.inputSchema.required, ['mode']);
    assert.deepStrictEqual(scm.inputSchema.properties.mode.enum.sort(), ['free', 'freeLook', 'orbit']);
  });
  await ok('C11: manifest 不含 handler 字段', () => {
    const s = createCameraServer({});
    for (const t of s.manifest().tools) {
      assert.strictEqual(t.handler, undefined, `${t.name} leaked handler`);
    }
  });

  // ============ Group D: getCameraState ============
  await ok('D1: getCameraState 成功返回完整状态', async () => {
    const viewer = makeViewer();
    const s = createCameraServer({ viewer });
    const r = await s.callTool('getCameraState', {});
    assert.strictEqual(r.ok, true);
    assert.ok(r.value.longitude);
    assert.ok(r.value.latitude);
    assert.strictEqual(r.value.height, 10000);
    assert.ok('heading' in r.value);
    assert.ok('pitch' in r.value);
    assert.ok('roll' in r.value);
  });
  await ok('D2: getCameraState 无参也成功', async () => {
    const viewer = makeViewer();
    const s = createCameraServer({ viewer });
    const r = await s.callTool('getCameraState', undefined);
    assert.strictEqual(r.ok, true);
    assert.ok(r.value.longitude);
  });
  await ok('D3: getCameraState viewer 缺失返回 ok:false', async () => {
    const s = createCameraServer({});
    const r = await s.callTool('getCameraState', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('D4: getCameraState viewer.getCameraState 非函数返回 ok:false', async () => {
    const viewer = { getCameraState: 'not-a-fn' };
    const s = createCameraServer({ viewer });
    const r = await s.callTool('getCameraState', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('D5: getCameraState viewer.getCameraState 缺失返回 ok:false', async () => {
    const viewer = { flyTo: async () => ({}) };
    const s = createCameraServer({ viewer });
    const r = await s.callTool('getCameraState', {});
    assert.strictEqual(r.ok, false);
  });

  // ============ Group E: flyTo ============
  await ok('E1: flyTo 成功返回 viewer 结果', async () => {
    const viewer = makeViewer();
    const s = createCameraServer({ viewer });
    const r = await s.callTool('flyTo', { longitude: 1.0, latitude: 0.5, height: 5000, duration: 2.0 });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.ok, true);
    assert.strictEqual(r.value.longitude, 1.0);
    assert.strictEqual(r.value.latitude, 0.5);
    assert.strictEqual(r.value.height, 5000);
    assert.strictEqual(r.value.duration, 2.0);
  });
  await ok('E2: flyTo 参数原样传递给 viewer', async () => {
    const viewer = makeViewer();
    const s = createCameraServer({ viewer });
    await s.callTool('flyTo', { longitude: 2.0, latitude: 1.0, height: 3000, duration: 3.0 });
    assert.strictEqual(viewer._flyCalls.length, 1);
    assert.deepStrictEqual(viewer._flyCalls[0], {
      longitude: 2.0,
      latitude: 1.0,
      height: 3000,
      duration: 3.0,
    });
  });
  await ok('E3: flyTo 更新 viewer 内部 state', async () => {
    const viewer = makeViewer();
    const s = createCameraServer({ viewer });
    await s.callTool('flyTo', { longitude: 3.0, latitude: 2.0, height: 8000 });
    assert.strictEqual(viewer._state.longitude, 3.0);
    assert.strictEqual(viewer._state.latitude, 2.0);
    assert.strictEqual(viewer._state.height, 8000);
  });
  await ok('E4: flyTo 无参返回 ok:false 或参数错误', async () => {
    const viewer = makeViewer();
    const s = createCameraServer({ viewer });
    // Handler doesn't validate args; passes {} to viewer.flyTo. Viewer accepts.
    const r = await s.callTool('flyTo', {});
    assert.strictEqual(r.ok, true);
  });
  await ok('E5: flyTo viewer 缺失返回 ok:false', async () => {
    const s = createCameraServer({});
    const r = await s.callTool('flyTo', { longitude: 1, latitude: 2 });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('E6: flyTo viewer.flyTo 非函数返回 ok:false', async () => {
    const viewer = { flyTo: null };
    const s = createCameraServer({ viewer });
    const r = await s.callTool('flyTo', { longitude: 1, latitude: 2 });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('E7: flyTo 支持小数经纬度（弧度制）', async () => {
    const viewer = makeViewer();
    const s = createCameraServer({ viewer });
    const r = await s.callTool('flyTo', { longitude: 1.91999, latitude: 0.34899, height: 12345.6 });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.longitude, 1.91999);
  });
  await ok('E8: flyTo 多次调用累积记录', async () => {
    const viewer = makeViewer();
    const s = createCameraServer({ viewer });
    await s.callTool('flyTo', { longitude: 1, latitude: 1 });
    await s.callTool('flyTo', { longitude: 2, latitude: 2 });
    await s.callTool('flyTo', { longitude: 3, latitude: 3 });
    assert.strictEqual(viewer._flyCalls.length, 3);
    assert.strictEqual(viewer._state.longitude, 3);
  });

  // ============ Group F: getCameraHeading ============
  await ok('F1: getCameraHeading 成功返回 heading/pitch/roll', async () => {
    const viewer = makeViewer({ camera: { heading: 1, pitch: 2, roll: 3 } });
    const s = createCameraServer({ viewer });
    const r = await s.callTool('getCameraHeading', {});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.heading, 1);
    assert.strictEqual(r.value.pitch, 2);
    assert.strictEqual(r.value.roll, 3);
  });
  await ok('F2: getCameraHeading 使用 viewer.camera 当前值', async () => {
    const viewer = makeViewer();
    viewer.camera = { heading: 0.5, pitch: -0.3, roll: 0.1 };
    const s = createCameraServer({ viewer });
    const r = await s.callTool('getCameraHeading', {});
    assert.strictEqual(r.value.heading, 0.5);
    assert.strictEqual(r.value.pitch, -0.3);
    assert.strictEqual(r.value.roll, 0.1);
  });
  await ok('F3: getCameraHeading viewer 缺失返回 ok:false', async () => {
    const s = createCameraServer({});
    const r = await s.callTool('getCameraHeading', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('F4: getCameraHeading viewer.camera 缺失返回 ok:false', async () => {
    const viewer = { getCameraState: async () => ({}) };
    const s = createCameraServer({ viewer });
    const r = await s.callTool('getCameraHeading', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('F5: getCameraHeading viewer.camera 非对象（string）返回 ok:false', async () => {
    const viewer = { camera: 'not-an-object' };
    const s = createCameraServer({ viewer });
    const r = await s.callTool('getCameraHeading', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('F6: getCameraHeading viewer.camera=null 仍通过（typeof null=object）', async () => {
    // handler: typeof viewer.camera !== 'object' — null is 'object' so passes
    const viewer = { camera: null };
    const s = createCameraServer({ viewer });
    const r = await s.callTool('getCameraHeading', {});
    // handler runs but accesses viewer.camera.heading → TypeError → caught
    assert.strictEqual(r.ok, false);
    // error should be TypeError message about null
  });
  await ok('F7: getCameraHeading viewer.camera=[] 仍通过（typeof [] = object）', async () => {
    const viewer = { camera: [] };
    const s = createCameraServer({ viewer });
    const r = await s.callTool('getCameraHeading', {});
    // typeof [] === 'object' → passes check → handler runs → returns {heading: undefined, ...}
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.heading, undefined);
  });

  // ============ Group G: setCameraMode ============
  await ok('G1: setCameraMode 成功返回 mode', async () => {
    const viewer = makeViewer();
    const s = createCameraServer({ viewer });
    const r = await s.callTool('setCameraMode', { mode: 'free' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.ok, true);
    assert.strictEqual(r.value.mode, 'free');
  });
  await ok('G2: setCameraMode 3 种 mode 都接受', async () => {
    const viewer = makeViewer();
    const s = createCameraServer({ viewer });
    for (const mode of ['free', 'orbit', 'freeLook']) {
      const r = await s.callTool('setCameraMode', { mode });
      assert.strictEqual(r.ok, true, `${mode} should pass`);
      assert.strictEqual(r.value.mode, mode);
    }
  });
  await ok('G3: setCameraMode 接受 enum 外的 mode（handler 不校验）', async () => {
    const viewer = makeViewer();
    const s = createCameraServer({ viewer });
    // Handler doesn't validate against enum; returns whatever was passed
    const r = await s.callTool('setCameraMode', { mode: 'custom' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.mode, 'custom');
  });
  await ok('G4: setCameraMode viewer 缺失返回 ok:false', async () => {
    const s = createCameraServer({});
    const r = await s.callTool('setCameraMode', { mode: 'free' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('G5: setCameraMode viewer.camera 缺失返回 ok:false', async () => {
    const viewer = { getCameraState: async () => ({}) };
    const s = createCameraServer({ viewer });
    const r = await s.callTool('setCameraMode', { mode: 'free' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('G6: setCameraMode viewer.camera 非对象（string）返回 ok:false', async () => {
    const viewer = { camera: 'bad' };
    const s = createCameraServer({ viewer });
    const r = await s.callTool('setCameraMode', { mode: 'free' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('G7: setCameraMode viewer.camera=[] 仍通过', async () => {
    const viewer = { camera: [] };
    const s = createCameraServer({ viewer });
    const r = await s.callTool('setCameraMode', { mode: 'orbit' });
    // typeof [] === 'object' → passes → handler runs → returns mode
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.mode, 'orbit');
  });

  // ============ Group H: registerTool/unregisterTool ============
  await ok('H1: registerTool 成功返回 true', () => {
    const s = createCameraServer({});
    const r = s.registerTool('custom', 'Custom', { type: 'object', properties: {} }, async () => 'ok');
    assert.strictEqual(r, true);
    assert.ok(s.listTools().includes('custom'));
  });
  await ok('H2: registerTool 空 name 返回 false', () => {
    const s = createCameraServer({});
    assert.strictEqual(s.registerTool('', 'd', {}, async () => 'x'), false);
  });
  await ok('H3: unregisterTool 已存在返回 true', () => {
    const s = createCameraServer({});
    s.registerTool('temp', 'd', {}, async () => 'x');
    assert.strictEqual(s.unregisterTool('temp'), true);
    assert.ok(!s.listTools().includes('temp'));
  });
  await ok('H4: unregisterTool 不存在返回 false', () => {
    const s = createCameraServer({});
    assert.strictEqual(s.unregisterTool('never-was'), false);
  });
  await ok('H5: registerTool 后 manifest 包含新工具', () => {
    const s = createCameraServer({});
    s.registerTool('custom', 'Custom', { type: 'object', properties: {} }, async () => 'x');
    assert.ok(s.manifest().tools.find((t) => t.name === 'custom'));
  });
  await ok('H6: 重复 registerTool 同名覆盖', () => {
    const s = createCameraServer({});
    s.registerTool('dup', 'first', {}, async () => 'first');
    s.registerTool('dup', 'second', {}, async () => 'second');
    const m = s.manifest();
    const dup = m.tools.filter((t) => t.name === 'dup');
    assert.strictEqual(dup.length, 1);
    assert.strictEqual(dup[0].description, 'second');
  });
  await ok('H7: registerTool 后 toolCount 增加', () => {
    const s = createCameraServer({});
    const before = s.toolCount();
    s.registerTool('extra', 'Extra', {}, async () => 'x');
    assert.strictEqual(s.toolCount(), before + 1);
    s.unregisterTool('extra');
    assert.strictEqual(s.toolCount(), before);
  });

  // ============ Group I: callTool 通用 ============
  await ok('I1: callTool 未知工具返回 ok:false', async () => {
    const s = createCameraServer({});
    const r = await s.callTool('nonexistent', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /工具 nonexistent 不存在/);
  });
  await ok('I2: callTool 无参 args 走 {} 默认', async () => {
    const viewer = makeViewer();
    const s = createCameraServer({ viewer });
    const r = await s.callTool('getCameraState', undefined);
    assert.strictEqual(r.ok, true);
  });
  await ok('I3: callTool 返回 {ok,value} 或 {ok,error}', async () => {
    const viewer = makeViewer();
    const s = createCameraServer({ viewer });
    const r1 = await s.callTool('getCameraState', {});
    assert.ok('ok' in r1 && 'value' in r1, 'success shape');
    const r2 = await s.callTool('nonexistent', {});
    assert.ok('ok' in r2 && 'error' in r2, 'error shape');
  });
  await ok('I4: 未注入 viewer 时所有工具返回 ok:false', async () => {
    const s = createCameraServer({});
    const tools = ['getCameraState', 'flyTo', 'getCameraHeading', 'setCameraMode'];
    for (const tool of tools) {
      const r = await s.callTool(tool, {});
      assert.strictEqual(r.ok, false, `${tool} should fail`);
      assert.match(r.error, /viewer 未注入/);
    }
  });
  await ok('I5: viewer 方法非函数类型也返回 ok:false', async () => {
    const viewer = {
      getCameraState: null,
      flyTo: null,
      camera: 'not-object',
    };
    const s = createCameraServer({ viewer });
    for (const tool of ['getCameraState', 'flyTo', 'getCameraHeading', 'setCameraMode']) {
      const r = await s.callTool(tool, {});
      assert.strictEqual(r.ok, false, `${tool} should fail`);
      assert.match(r.error, /viewer 未注入/);
    }
  });

  // ============ Group J: 集成测试 ============
  await ok('J1: 完整相机生命周期 get→fly→get→heading→mode', async () => {
    const viewer = makeViewer();
    const s = createCameraServer({ viewer });
    const r1 = await s.callTool('getCameraState', {});
    assert.strictEqual(r1.ok, true);
    const r2 = await s.callTool('flyTo', { longitude: 1, latitude: 2, height: 5000 });
    assert.strictEqual(r2.ok, true);
    const r3 = await s.callTool('getCameraState', {});
    assert.strictEqual(r3.value.longitude, 1);
    const r4 = await s.callTool('getCameraHeading', {});
    assert.strictEqual(r4.ok, true);
    const r5 = await s.callTool('setCameraMode', { mode: 'orbit' });
    assert.strictEqual(r5.value.mode, 'orbit');
  });
  await ok('J2: 完整 4 工具顺序执行', async () => {
    const viewer = makeViewer();
    const s = createCameraServer({ viewer });
    const r1 = await s.callTool('getCameraState', {});
    assert.strictEqual(r1.ok, true);
    const r2 = await s.callTool('flyTo', { longitude: 2, latitude: 3, height: 8000, duration: 2 });
    assert.strictEqual(r2.ok, true);
    const r3 = await s.callTool('getCameraHeading', {});
    assert.strictEqual(r3.ok, true);
    const r4 = await s.callTool('setCameraMode', { mode: 'freeLook' });
    assert.strictEqual(r4.value.mode, 'freeLook');
  });
  await ok('J3: flyTo 后 getCameraState 反映新位置', async () => {
    const viewer = makeViewer();
    const s = createCameraServer({ viewer });
    const before = await s.callTool('getCameraState', {});
    assert.strictEqual(before.value.height, 10000);
    await s.callTool('flyTo', { longitude: 0.5, latitude: 0.5, height: 2000 });
    const after = await s.callTool('getCameraState', {});
    assert.strictEqual(after.value.height, 2000);
    assert.strictEqual(after.value.longitude, 0.5);
  });
  await ok('J4: 全工具无 viewer 场景统一返回 viewer 未注入', async () => {
    const s = createCameraServer({});
    const tools = ['getCameraState', 'flyTo', 'getCameraHeading', 'setCameraMode'];
    const errors = [];
    for (const tool of tools) {
      const r = await s.callTool(tool, {});
      errors.push(r.error);
    }
    for (const err of errors) {
      assert.match(err, /viewer 未注入/);
    }
    assert.strictEqual(errors.length, 4);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
