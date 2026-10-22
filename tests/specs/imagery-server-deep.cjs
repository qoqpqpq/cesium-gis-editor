// tests/specs/imagery-server-deep.cjs
// Cycle 23 R2: Imagery MCP Server 深度测试
// 目标：≥ 50 PASS
//
// 背景：
//   - server/services/mcpServers/imageryServer.js (117 lines)
//   - cesium-mcp-servers.cjs 仅覆盖 F1-F4 (4 用例) 基础路径
//   - 本次深度测试 5 个工具（addImageryLayer/removeImageryLayer/listImageryLayers/screenshot/setImageryStyle）
//     的边界、错误处理、参数校验、manifest 结构、registerTool/unregisterTool
//
// 覆盖点：
//   - 模块导出（createImageryServer）
//   - 创建 + name/description/version/protocolVersion
//   - manifest() 结构（5 工具完整 schema + enum + required + additionalProperties）
//   - listTools/toolCount
//   - addImageryLayer：成功 + 参数传播 + viewer 缺失 + viewer.addImageryLayer 非函数
//   - removeImageryLayer：成功 + 参数传递 + viewer 缺失
//   - listImageryLayers：成功 + viewer 缺失
//   - screenshot：成功 + 参数传递 + viewer 缺失
//   - setImageryStyle：成功 + 参数传递 + viewer 缺失
//   - registerTool/unregisterTool + listTools 变化
//   - 集成：完整图层生命周期

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const { createImageryServer } = require(path.join(__dirname, '../../server/services/mcpServers/imageryServer'));

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
  const layers = new Map();
  let nextId = 1;
  return {
    _layers: layers,
    async addImageryLayer(args) {
      const id = args.id || `layer-${nextId++}`;
      const layer = { id, ...args };
      layers.set(id, layer);
      return { ok: true, id, ...args };
    },
    async removeImageryLayer(id) {
      if (!layers.has(id)) return { ok: false, error: 'layer not found' };
      layers.delete(id);
      return { ok: true, id };
    },
    async listImageryLayers() {
      return { ok: true, layers: Array.from(layers.values()) };
    },
    async screenshot(args) {
      return { ok: true, dataUrl: 'data:image/png;base64,AAAA', quality: (args && args.quality) || 0.9 };
    },
    async setImageryStyle(style) {
      return { ok: true, style };
    },
    ...overrides,
  };
}

(async () => {
  console.log('=== imagery-server-deep ===');

  // ============ Group A: 模块导出 ============
  await ok('A1: 导出 createImageryServer 函数', () => {
    assert.strictEqual(typeof createImageryServer, 'function');
  });
  await ok('A2: 模块仅导出 1 个 API', () => {
    const keys = Object.keys(require(path.join(__dirname, '../../server/services/mcpServers/imageryServer')));
    assert.deepStrictEqual(keys, ['createImageryServer']);
  });

  // ============ Group B: 创建 + 元数据 ============
  await ok('B1: createImageryServer 无参返回对象', () => {
    const s = createImageryServer();
    assert.ok(s && typeof s === 'object');
  });
  await ok('B2: name = cesium-imagery', () => {
    const s = createImageryServer({});
    assert.strictEqual(s.name, 'cesium-imagery');
  });
  await ok('B3: description 包含底图/影像关键字', () => {
    const s = createImageryServer({});
    assert.match(s.description, /底图|影像|imagery/i);
  });
  await ok('B4: version = 1.0.0', () => {
    const s = createImageryServer({});
    assert.strictEqual(s.version, '1.0.0');
  });
  await ok('B5: protocolVersion 默认 2025-06-18', () => {
    const s = createImageryServer({});
    assert.strictEqual(s.protocolVersion, '2025-06-18');
  });
  await ok('B6: toolCount = 5', () => {
    const s = createImageryServer({});
    assert.strictEqual(s.toolCount(), 5);
  });
  await ok('B7: listTools 返回 5 个工具名', () => {
    const s = createImageryServer({});
    assert.deepStrictEqual(s.listTools().sort(), [
      'addImageryLayer',
      'listImageryLayers',
      'removeImageryLayer',
      'screenshot',
      'setImageryStyle',
    ]);
  });

  // ============ Group C: manifest() 结构 ============
  await ok('C1: manifest 含 protocolVersion/serverInfo/capabilities/tools', () => {
    const s = createImageryServer({});
    const m = s.manifest();
    assert.strictEqual(m.protocolVersion, '2025-06-18');
    assert.ok(m.serverInfo);
    assert.strictEqual(m.serverInfo.name, 'cesium-imagery');
    assert.ok(m.capabilities);
    assert.ok(Array.isArray(m.tools));
  });
  await ok('C2: manifest.tools 长度为 5', () => {
    const s = createImageryServer({});
    assert.strictEqual(s.manifest().tools.length, 5);
  });
  await ok('C3: manifest 每个 tool 有 name/description/inputSchema', () => {
    const s = createImageryServer({});
    for (const t of s.manifest().tools) {
      assert.ok(t.name, 'tool missing name');
      assert.ok(typeof t.description === 'string' && t.description.length > 0, 'tool missing description');
      assert.ok(t.inputSchema, 'tool missing inputSchema');
    }
  });
  await ok('C4: addImageryLayer inputSchema 有 4 个属性', () => {
    const s = createImageryServer({});
    const m = s.manifest();
    const add = m.tools.find((t) => t.name === 'addImageryLayer');
    assert.deepStrictEqual(Object.keys(add.inputSchema.properties).sort(), ['id', 'opacity', 'type', 'visible']);
  });
  await ok('C5: addImageryLayer required 含 type', () => {
    const s = createImageryServer({});
    const m = s.manifest();
    const add = m.tools.find((t) => t.name === 'addImageryLayer');
    assert.deepStrictEqual(add.inputSchema.required, ['type']);
  });
  await ok('C6: addImageryLayer type enum 5 种', () => {
    const s = createImageryServer({});
    const m = s.manifest();
    const add = m.tools.find((t) => t.name === 'addImageryLayer');
    assert.deepStrictEqual(add.inputSchema.properties.type.enum.sort(), ['bing', 'carto', 'osm', 'satellite', 'tdt']);
  });
  await ok('C7: removeImageryLayer required 含 id', () => {
    const s = createImageryServer({});
    const m = s.manifest();
    const rm = m.tools.find((t) => t.name === 'removeImageryLayer');
    assert.deepStrictEqual(rm.inputSchema.required, ['id']);
  });
  await ok('C8: listImageryLayers inputSchema additionalProperties=false', () => {
    const s = createImageryServer({});
    const m = s.manifest();
    const list = m.tools.find((t) => t.name === 'listImageryLayers');
    assert.strictEqual(list.inputSchema.additionalProperties, false);
  });
  await ok('C9: screenshot inputSchema 有 quality 属性', () => {
    const s = createImageryServer({});
    const m = s.manifest();
    const ss = m.tools.find((t) => t.name === 'screenshot');
    assert.ok(ss.inputSchema.properties.quality);
    assert.strictEqual(ss.inputSchema.properties.quality.default, 0.9);
  });
  await ok('C10: setImageryStyle required 含 style + enum 4 种', () => {
    const s = createImageryServer({});
    const m = s.manifest();
    const setStyle = m.tools.find((t) => t.name === 'setImageryStyle');
    assert.deepStrictEqual(setStyle.inputSchema.required, ['style']);
    assert.deepStrictEqual(setStyle.inputSchema.properties.style.enum.sort(), ['dark', 'hybrid', 'light', 'terrain']);
  });
  await ok('C11: manifest 不含 handler 字段', () => {
    const s = createImageryServer({});
    for (const t of s.manifest().tools) {
      assert.strictEqual(t.handler, undefined, `${t.name} leaked handler`);
    }
  });

  // ============ Group D: addImageryLayer ============
  await ok('D1: addImageryLayer 成功返回 viewer 结果', async () => {
    const viewer = makeViewer();
    const s = createImageryServer({ viewer });
    const r = await s.callTool('addImageryLayer', { type: 'osm', opacity: 0.8, visible: true });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.ok, true);
    assert.strictEqual(r.value.type, 'osm');
    assert.strictEqual(r.value.opacity, 0.8);
    assert.strictEqual(r.value.visible, true);
  });
  await ok('D2: addImageryLayer 自定义 id 保留', async () => {
    const viewer = makeViewer();
    const s = createImageryServer({ viewer });
    const r = await s.callTool('addImageryLayer', { type: 'satellite', id: 'my-layer' });
    assert.strictEqual(r.value.id, 'my-layer');
  });
  await ok('D3: addImageryLayer 自动分配 id', async () => {
    const viewer = makeViewer();
    const s = createImageryServer({ viewer });
    const r = await s.callTool('addImageryLayer', { type: 'osm' });
    assert.match(r.value.id, /^layer-/);
  });
  await ok('D4: addImageryLayer 5 种 type 都接受', async () => {
    const viewer = makeViewer();
    const s = createImageryServer({ viewer });
    for (const type of ['osm', 'satellite', 'tdt', 'bing', 'carto']) {
      const r = await s.callTool('addImageryLayer', { type });
      assert.strictEqual(r.ok, true, `${type} should pass`);
    }
  });
  await ok('D5: addImageryLayer viewer 缺失返回 ok:false', async () => {
    const s = createImageryServer({});
    const r = await s.callTool('addImageryLayer', { type: 'osm' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('D6: addImageryLayer viewer.addImageryLayer 非函数返回 ok:false', async () => {
    const viewer = { addImageryLayer: 'not-a-fn' };
    const s = createImageryServer({ viewer });
    const r = await s.callTool('addImageryLayer', { type: 'osm' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('D7: addImageryLayer viewer.addImageryLayer 缺失返回 ok:false', async () => {
    const viewer = { screenshot: async () => ({}) };
    const s = createImageryServer({ viewer });
    const r = await s.callTool('addImageryLayer', { type: 'osm' });
    assert.strictEqual(r.ok, false);
  });

  // ============ Group E: removeImageryLayer ============
  await ok('E1: removeImageryLayer 成功删除返回 viewer 结果', async () => {
    const viewer = makeViewer();
    viewer._layers.set('l1', { id: 'l1', type: 'osm' });
    const s = createImageryServer({ viewer });
    const r = await s.callTool('removeImageryLayer', { id: 'l1' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.ok, true);
    assert.strictEqual(r.value.id, 'l1');
    assert.strictEqual(viewer._layers.has('l1'), false);
  });
  await ok('E2: removeImageryLayer 不存在的 id 返回 viewer 错误', async () => {
    const viewer = makeViewer();
    const s = createImageryServer({ viewer });
    const r = await s.callTool('removeImageryLayer', { id: 'nope' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.ok, false);
    assert.strictEqual(r.value.error, 'layer not found');
  });
  await ok('E3: removeImageryLayer viewer 缺失返回 ok:false', async () => {
    const s = createImageryServer({});
    const r = await s.callTool('removeImageryLayer', { id: 'x' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('E4: removeImageryLayer viewer.removeImageryLayer 非函数返回 ok:false', async () => {
    const viewer = { removeImageryLayer: null };
    const s = createImageryServer({ viewer });
    const r = await s.callTool('removeImageryLayer', { id: 'x' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });

  // ============ Group F: listImageryLayers ============
  await ok('F1: listImageryLayers 返回 viewer 结果', async () => {
    const viewer = makeViewer();
    viewer._layers.set('l1', { id: 'l1', type: 'osm' });
    viewer._layers.set('l2', { id: 'l2', type: 'satellite' });
    const s = createImageryServer({ viewer });
    const r = await s.callTool('listImageryLayers', {});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.ok, true);
    assert.strictEqual(r.value.layers.length, 2);
  });
  await ok('F2: listImageryLayers 空列表返回 ok:true', async () => {
    const viewer = makeViewer();
    const s = createImageryServer({ viewer });
    const r = await s.callTool('listImageryLayers', {});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.layers.length, 0);
  });
  await ok('F3: listImageryLayers viewer 缺失返回 ok:false', async () => {
    const s = createImageryServer({});
    const r = await s.callTool('listImageryLayers', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('F4: listImageryLayers viewer.listImageryLayers 非函数返回 ok:false', async () => {
    const viewer = { listImageryLayers: 'not-a-fn' };
    const s = createImageryServer({ viewer });
    const r = await s.callTool('listImageryLayers', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });

  // ============ Group G: screenshot ============
  await ok('G1: screenshot 成功返回 dataURL', async () => {
    const viewer = makeViewer();
    const s = createImageryServer({ viewer });
    const r = await s.callTool('screenshot', { quality: 0.8 });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.ok, true);
    assert.match(r.value.dataUrl, /^data:image\/png;base64,/);
    assert.strictEqual(r.value.quality, 0.8);
  });
  await ok('G2: screenshot 无参使用默认 quality=0.9', async () => {
    const viewer = makeViewer();
    const s = createImageryServer({ viewer });
    const r = await s.callTool('screenshot', {});
    assert.strictEqual(r.value.quality, 0.9);
  });
  await ok('G3: screenshot viewer 缺失返回 ok:false', async () => {
    const s = createImageryServer({});
    const r = await s.callTool('screenshot', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('G4: screenshot viewer.screenshot 非函数返回 ok:false', async () => {
    const viewer = { screenshot: 'not-a-fn' };
    const s = createImageryServer({ viewer });
    const r = await s.callTool('screenshot', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('G5: screenshot 参数原样传递给 viewer', async () => {
    const calls = [];
    const viewer = makeViewer({
      async screenshot(args) {
        calls.push(args);
        return { ok: true, dataUrl: 'data:', quality: args.quality };
      },
    });
    const s = createImageryServer({ viewer });
    await s.callTool('screenshot', { quality: 0.5 });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].quality, 0.5);
  });

  // ============ Group H: setImageryStyle ============
  await ok('H1: setImageryStyle 成功返回 style', async () => {
    const viewer = makeViewer();
    const s = createImageryServer({ viewer });
    const r = await s.callTool('setImageryStyle', { style: 'dark' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.ok, true);
    assert.strictEqual(r.value.style, 'dark');
  });
  await ok('H2: setImageryStyle 4 种 style 都接受', async () => {
    const viewer = makeViewer();
    const s = createImageryServer({ viewer });
    for (const style of ['dark', 'light', 'terrain', 'hybrid']) {
      const r = await s.callTool('setImageryStyle', { style });
      assert.strictEqual(r.ok, true, `${style} should pass`);
      assert.strictEqual(r.value.style, style);
    }
  });
  await ok('H3: setImageryStyle viewer 缺失返回 ok:false', async () => {
    const s = createImageryServer({});
    const r = await s.callTool('setImageryStyle', { style: 'dark' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('H4: setImageryStyle viewer.setImageryStyle 非函数返回 ok:false', async () => {
    const viewer = { setImageryStyle: null };
    const s = createImageryServer({ viewer });
    const r = await s.callTool('setImageryStyle', { style: 'dark' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('H5: setImageryStyle 只传 style 单字段', async () => {
    const calls = [];
    const viewer = makeViewer({
      async setImageryStyle(style) {
        calls.push(style);
        return { ok: true, style };
      },
    });
    const s = createImageryServer({ viewer });
    await s.callTool('setImageryStyle', { style: 'hybrid' });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0], 'hybrid');
  });

  // ============ Group I: registerTool/unregisterTool ============
  await ok('I1: registerTool 成功返回 true', () => {
    const s = createImageryServer({});
    const r = s.registerTool('custom', 'Custom', { type: 'object', properties: {} }, async () => 'ok');
    assert.strictEqual(r, true);
    assert.ok(s.listTools().includes('custom'));
  });
  await ok('I2: registerTool 空 name 返回 false', () => {
    const s = createImageryServer({});
    assert.strictEqual(s.registerTool('', 'd', {}, async () => 'x'), false);
  });
  await ok('I3: unregisterTool 已存在返回 true', () => {
    const s = createImageryServer({});
    s.registerTool('temp', 'd', {}, async () => 'x');
    assert.strictEqual(s.unregisterTool('temp'), true);
    assert.ok(!s.listTools().includes('temp'));
  });
  await ok('I4: unregisterTool 不存在返回 false', () => {
    const s = createImageryServer({});
    assert.strictEqual(s.unregisterTool('never-was'), false);
  });
  await ok('I5: registerTool 后 manifest 包含新工具', () => {
    const s = createImageryServer({});
    s.registerTool('custom', 'Custom', { type: 'object', properties: {} }, async () => 'x');
    assert.ok(s.manifest().tools.find((t) => t.name === 'custom'));
  });
  await ok('I6: 重复 registerTool 同名覆盖', () => {
    const s = createImageryServer({});
    s.registerTool('dup', 'first', {}, async () => 'first');
    s.registerTool('dup', 'second', {}, async () => 'second');
    const m = s.manifest();
    const dup = m.tools.filter((t) => t.name === 'dup');
    assert.strictEqual(dup.length, 1);
    assert.strictEqual(dup[0].description, 'second');
  });

  // ============ Group J: callTool 通用 ============
  await ok('J1: callTool 未知工具返回 ok:false', async () => {
    const s = createImageryServer({});
    const r = await s.callTool('nonexistent', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /工具 nonexistent 不存在/);
  });
  await ok('J2: callTool 无参 args 走 {} 默认', async () => {
    const s = createImageryServer({ viewer: makeViewer() });
    const r = await s.callTool('listImageryLayers', undefined);
    assert.strictEqual(r.ok, true);
  });
  await ok('J3: callTool 返回 {ok,value} 或 {ok,error}', async () => {
    const s = createImageryServer({ viewer: makeViewer() });
    const r1 = await s.callTool('listImageryLayers', {});
    assert.ok('ok' in r1 && 'value' in r1, 'success shape');
    const r2 = await s.callTool('nonexistent', {});
    assert.ok('ok' in r2 && 'error' in r2, 'error shape');
  });
  await ok('J4: 未注入 viewer 时所有工具返回 ok:false', async () => {
    const s = createImageryServer({});
    const tools = ['addImageryLayer', 'removeImageryLayer', 'listImageryLayers', 'screenshot', 'setImageryStyle'];
    for (const tool of tools) {
      const r = await s.callTool(tool, {});
      assert.strictEqual(r.ok, false, `${tool} should fail`);
      assert.match(r.error, /viewer 未注入/);
    }
  });
  await ok('J5: viewer 方法非函数类型也返回 ok:false', async () => {
    const viewer = {
      addImageryLayer: null,
      removeImageryLayer: null,
      listImageryLayers: null,
      screenshot: null,
      setImageryStyle: null,
    };
    const s = createImageryServer({ viewer });
    const tools = ['addImageryLayer', 'removeImageryLayer', 'listImageryLayers', 'screenshot', 'setImageryStyle'];
    for (const tool of tools) {
      const r = await s.callTool(tool, {});
      assert.strictEqual(r.ok, false, `${tool} should fail`);
      assert.match(r.error, /viewer 未注入/);
    }
  });

  // ============ Group K: 集成测试 ============
  await ok('K1: 完整图层生命周期 add→list→remove', async () => {
    const viewer = makeViewer();
    const s = createImageryServer({ viewer });
    const r1 = await s.callTool('addImageryLayer', { type: 'osm', id: 'lifecycle' });
    assert.strictEqual(r1.value.id, 'lifecycle');
    const r2 = await s.callTool('listImageryLayers', {});
    assert.strictEqual(r2.value.layers.length, 1);
    const r3 = await s.callTool('removeImageryLayer', { id: 'lifecycle' });
    assert.strictEqual(r3.value.ok, true);
    const r4 = await s.callTool('listImageryLayers', {});
    assert.strictEqual(r4.value.layers.length, 0);
  });
  await ok('K2: 完整 5 工具顺序执行', async () => {
    const viewer = makeViewer();
    const s = createImageryServer({ viewer });
    const r1 = await s.callTool('addImageryLayer', { type: 'satellite', id: 'a' });
    assert.strictEqual(r1.ok, true);
    const r2 = await s.callTool('setImageryStyle', { style: 'dark' });
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r2.value.style, 'dark');
    const r3 = await s.callTool('screenshot', { quality: 0.7 });
    assert.strictEqual(r3.ok, true);
    const r4 = await s.callTool('listImageryLayers', {});
    assert.strictEqual(r4.value.layers.length, 1);
    const r5 = await s.callTool('removeImageryLayer', { id: 'a' });
    assert.strictEqual(r5.ok, true);
  });
  await ok('K3: 多图层管理', async () => {
    const viewer = makeViewer();
    const s = createImageryServer({ viewer });
    await s.callTool('addImageryLayer', { type: 'osm', id: 'a' });
    await s.callTool('addImageryLayer', { type: 'satellite', id: 'b' });
    await s.callTool('addImageryLayer', { type: 'bing', id: 'c' });
    const list1 = await s.callTool('listImageryLayers', {});
    assert.strictEqual(list1.value.layers.length, 3);
    await s.callTool('removeImageryLayer', { id: 'b' });
    const list2 = await s.callTool('listImageryLayers', {});
    assert.strictEqual(list2.value.layers.length, 2);
    const ids = list2.value.layers.map((l) => l.id).sort();
    assert.deepStrictEqual(ids, ['a', 'c']);
  });
  await ok('K4: screenshot + setImageryStyle 组合', async () => {
    const viewer = makeViewer();
    const s = createImageryServer({ viewer });
    const r1 = await s.callTool('setImageryStyle', { style: 'terrain' });
    assert.strictEqual(r1.value.style, 'terrain');
    const r2 = await s.callTool('screenshot', { quality: 1.0 });
    assert.strictEqual(r2.value.quality, 1.0);
    const r3 = await s.callTool('screenshot', { quality: 0.1 });
    assert.strictEqual(r3.value.quality, 0.1);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
