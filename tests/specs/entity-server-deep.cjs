// tests/specs/entity-server-deep.cjs
// Cycle 22 R4: Entity MCP Server 深度测试
// 目标：≥ 30 PASS
//
// 背景：
//   - server/services/mcpServers/entityServer.js (99 lines)
//   - cesium-mcp-servers.cjs 仅覆盖 D1-D4 (4 用例) 基础路径
//   - 本次深度测试 4 个工具（addMarker/removeMarker/listMarkers/spatialQuery）
//     的边界、错误处理、参数校验、manifest 结构、registerTool/unregisterTool
//
// 覆盖点：
//   - 模块导出（createEntityServer）
//   - 创建 + name/description/version/protocolVersion
//   - manifest() 结构（4 工具完整 schema）
//   - listTools/toolCount
//   - addMarker：成功 + viewer 缺失 + viewer.addMarker 非函数
//   - removeMarker：成功 + 参数传递 + viewer 缺失
//   - listMarkers：成功 + viewer 缺失
//   - spatialQuery：4 种 operation + sandbox 缺失 + args JSON 序列化
//   - registerTool/unregisterTool + listTools 变化
//   - 集成：完整 marker 生命周期

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const { createEntityServer } = require(path.join(__dirname, '../../server/services/mcpServers/entityServer'));

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
  const markers = new Map();
  let nextId = 1;
  return {
    _markers: markers,
    async addMarker(args) {
      const id = args.id || `marker-${nextId++}`;
      markers.set(id, args);
      return { ok: true, id, ...args };
    },
    async removeMarker(id) {
      if (!markers.has(id)) return { ok: false, error: 'marker not found' };
      markers.delete(id);
      return { ok: true, id };
    },
    async listMarkers() {
      return { ok: true, markers: Array.from(markers.values()) };
    },
    ...overrides,
  };
}

function makeSandbox(overrides = {}) {
  return {
    _calls: [],
    async run(toolStr) {
      this._calls.push(toolStr);
      return { ok: true, value: `result-for:${toolStr}` };
    },
    ...overrides,
  };
}

(async () => {
  console.log('=== entity-server-deep ===');

  // ============ Group A: 模块导出 ============
  await ok('A1: 导出 createEntityServer 函数', () => {
    assert.strictEqual(typeof createEntityServer, 'function');
  });
  await ok('A2: 模块仅导出 1 个 API', () => {
    const keys = Object.keys(require(path.join(__dirname, '../../server/services/mcpServers/entityServer')));
    assert.deepStrictEqual(keys, ['createEntityServer']);
  });

  // ============ Group B: 创建 + 元数据 ============
  await ok('B1: createEntityServer 无参返回对象', () => {
    const s = createEntityServer();
    assert.ok(s && typeof s === 'object');
  });
  await ok('B2: name = cesium-entity', () => {
    const s = createEntityServer({});
    assert.strictEqual(s.name, 'cesium-entity');
  });
  await ok('B3: description 包含实体/标记关键字', () => {
    const s = createEntityServer({});
    assert.match(s.description, /实体|标记|marker/i);
  });
  await ok('B4: version = 1.0.0', () => {
    const s = createEntityServer({});
    assert.strictEqual(s.version, '1.0.0');
  });
  await ok('B5: protocolVersion 默认 2025-06-18', () => {
    const s = createEntityServer({});
    assert.strictEqual(s.protocolVersion, '2025-06-18');
  });
  await ok('B6: toolCount = 4', () => {
    const s = createEntityServer({});
    assert.strictEqual(s.toolCount(), 4);
  });
  await ok('B7: listTools 返回 4 个工具名', () => {
    const s = createEntityServer({});
    assert.deepStrictEqual(s.listTools().sort(), ['addMarker', 'listMarkers', 'removeMarker', 'spatialQuery']);
  });

  // ============ Group C: manifest() 结构 ============
  await ok('C1: manifest 含 protocolVersion/serverInfo/capabilities/tools', () => {
    const s = createEntityServer({});
    const m = s.manifest();
    assert.strictEqual(m.protocolVersion, '2025-06-18');
    assert.ok(m.serverInfo);
    assert.strictEqual(m.serverInfo.name, 'cesium-entity');
    assert.ok(m.capabilities);
    assert.ok(Array.isArray(m.tools));
  });
  await ok('C2: manifest.tools 长度为 4', () => {
    const s = createEntityServer({});
    assert.strictEqual(s.manifest().tools.length, 4);
  });
  await ok('C3: manifest 每个 tool 有 name/description/inputSchema', () => {
    const s = createEntityServer({});
    for (const t of s.manifest().tools) {
      assert.ok(t.name, 'tool missing name');
      assert.ok(typeof t.description === 'string' && t.description.length > 0, 'tool missing description');
      assert.ok(t.inputSchema, 'tool missing inputSchema');
    }
  });
  await ok('C4: addMarker inputSchema required 含 longitude/latitude', () => {
    const s = createEntityServer({});
    const m = s.manifest();
    const addMarker = m.tools.find((t) => t.name === 'addMarker');
    assert.deepStrictEqual(addMarker.inputSchema.required.sort(), ['latitude', 'longitude']);
  });
  await ok('C5: spatialQuery inputSchema 有 4 种 operation enum', () => {
    const s = createEntityServer({});
    const m = s.manifest();
    const sq = m.tools.find((t) => t.name === 'spatialQuery');
    assert.deepStrictEqual(sq.inputSchema.properties.operation.enum.sort(), ['area', 'buffer', 'centroid', 'distance']);
  });
  await ok('C6: manifest 不含 handler 字段', () => {
    const s = createEntityServer({});
    for (const t of s.manifest().tools) {
      assert.strictEqual(t.handler, undefined, `${t.name} leaked handler`);
    }
  });

  // ============ Group D: addMarker ============
  await ok('D1: addMarker 成功返回 viewer 结果', async () => {
    const viewer = makeViewer();
    const s = createEntityServer({ viewer });
    const r = await s.callTool('addMarker', { longitude: 110, latitude: 20, label: 'A' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.ok, true);
    assert.strictEqual(r.value.label, 'A');
  });
  await ok('D2: addMarker 自定义 id 保留', async () => {
    const viewer = makeViewer();
    const s = createEntityServer({ viewer });
    const r = await s.callTool('addMarker', { longitude: 110, latitude: 20, id: 'my-marker' });
    assert.strictEqual(r.value.id, 'my-marker');
  });
  await ok('D3: addMarker viewer 缺失返回 ok:false', async () => {
    const s = createEntityServer({});
    const r = await s.callTool('addMarker', { longitude: 1, latitude: 2 });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('D4: addMarker viewer.addMarker 非函数返回 ok:false', async () => {
    const viewer = { addMarker: 'not-a-fn' };
    const s = createEntityServer({ viewer });
    const r = await s.callTool('addMarker', { longitude: 1, latitude: 2 });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('D5: addMarker handler 抛错被捕获', async () => {
    const viewer = makeViewer({
      async addMarker() {
        throw new Error('boom-add');
      },
    });
    const s = createEntityServer({ viewer });
    const r = await s.callTool('addMarker', { longitude: 1, latitude: 2 });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /boom-add/);
  });

  // ============ Group E: removeMarker ============
  await ok('E1: removeMarker 成功删除返回 viewer 结果', async () => {
    const viewer = makeViewer();
    viewer._markers.set('m1', { longitude: 1, latitude: 2 });
    const s = createEntityServer({ viewer });
    const r = await s.callTool('removeMarker', { id: 'm1' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.ok, true);
    assert.strictEqual(viewer._markers.has('m1'), false);
  });
  await ok('E2: removeMarker 不存在的 id 返回 viewer 错误', async () => {
    const viewer = makeViewer();
    const s = createEntityServer({ viewer });
    const r = await s.callTool('removeMarker', { id: 'nope' });
    assert.strictEqual(r.ok, true); // base callTool wraps; viewer returned {ok:false,...}
    assert.strictEqual(r.value.ok, false);
  });
  await ok('E3: removeMarker viewer 缺失返回 ok:false', async () => {
    const s = createEntityServer({});
    const r = await s.callTool('removeMarker', { id: 'x' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('E4: removeMarker 只传 id 单字段', async () => {
    const viewer = makeViewer();
    viewer._markers.set('solo', {});
    const s = createEntityServer({ viewer });
    const r = await s.callTool('removeMarker', { id: 'solo' });
    assert.strictEqual(r.value.id, 'solo');
    assert.strictEqual(viewer._markers.size, 0);
  });

  // ============ Group F: listMarkers ============
  await ok('F1: listMarkers 返回 viewer 结果', async () => {
    const viewer = makeViewer();
    viewer._markers.set('m1', { longitude: 1, latitude: 2 });
    viewer._markers.set('m2', { longitude: 3, latitude: 4 });
    const s = createEntityServer({ viewer });
    const r = await s.callTool('listMarkers', {});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.markers.length, 2);
  });
  await ok('F2: listMarkers 空列表返回 ok:true', async () => {
    const viewer = makeViewer();
    const s = createEntityServer({ viewer });
    const r = await s.callTool('listMarkers', {});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.markers.length, 0);
  });
  await ok('F3: listMarkers viewer 缺失返回 ok:false', async () => {
    const s = createEntityServer({});
    const r = await s.callTool('listMarkers', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });

  // ============ Group G: spatialQuery ============
  await ok('G1: spatialQuery buffer 操作调用 sandbox.run', async () => {
    const sandbox = makeSandbox();
    const s = createEntityServer({ sandbox });
    const r = await s.callTool('spatialQuery', {
      operation: 'buffer',
      args: { geometry: { type: 'Point', coordinates: [0, 0] }, radius: 100 },
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(sandbox._calls.length, 1);
    assert.match(sandbox._calls[0], /<tool>buffer/);
  });
  await ok('G2: spatialQuery centroid 操作', async () => {
    const sandbox = makeSandbox();
    const s = createEntityServer({ sandbox });
    await s.callTool('spatialQuery', { operation: 'centroid', args: {} });
    assert.match(sandbox._calls[0], /<tool>centroid/);
  });
  await ok('G3: spatialQuery distance 操作', async () => {
    const sandbox = makeSandbox();
    const s = createEntityServer({ sandbox });
    await s.callTool('spatialQuery', { operation: 'distance' });
    assert.match(sandbox._calls[0], /<tool>distance/);
  });
  await ok('G4: spatialQuery area 操作', async () => {
    const sandbox = makeSandbox();
    const s = createEntityServer({ sandbox });
    await s.callTool('spatialQuery', { operation: 'area', args: { geometry: {} } });
    assert.match(sandbox._calls[0], /<tool>area/);
  });
  await ok('G5: spatialQuery 无 args 时序列化为 {}', async () => {
    const sandbox = makeSandbox();
    const s = createEntityServer({ sandbox });
    await s.callTool('spatialQuery', { operation: 'buffer' });
    assert.match(sandbox._calls[0], /<tool>buffer\(\{\}\)<\/tool>/);
  });
  await ok('G6: spatialQuery sandbox 缺失返回 ok:false', async () => {
    const s = createEntityServer({});
    const r = await s.callTool('spatialQuery', { operation: 'buffer' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /sandbox 未注入/);
  });
  await ok('G7: spatialQuery sandbox.run 非函数返回 ok:false', async () => {
    const sandbox = { run: 'not-a-fn' };
    const s = createEntityServer({ sandbox });
    const r = await s.callTool('spatialQuery', { operation: 'buffer' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /sandbox 未注入/);
  });
  await ok('G8: spatialQuery args JSON 被序列化', async () => {
    const sandbox = makeSandbox();
    const s = createEntityServer({ sandbox });
    await s.callTool('spatialQuery', {
      operation: 'buffer',
      args: { geometry: { type: 'Point', coordinates: [1, 2] }, radius: 50 },
    });
    // JSON.stringify of args should be in toolStr
    assert.match(sandbox._calls[0], /geometry/);
    assert.match(sandbox._calls[0], /"radius":50/);
  });

  // ============ Group H: registerTool/unregisterTool ============
  await ok('H1: registerTool 成功返回 true', () => {
    const s = createEntityServer({});
    const ok = s.registerTool('custom', 'Custom', { type: 'object', properties: {} }, async () => 'ok');
    assert.strictEqual(ok, true);
    assert.ok(s.listTools().includes('custom'));
  });
  await ok('H2: registerTool 空 name 返回 false', () => {
    const s = createEntityServer({});
    assert.strictEqual(s.registerTool('', 'd', {}, async () => 'x'), false);
  });
  await ok('H3: unregisterTool 已存在返回 true', () => {
    const s = createEntityServer({});
    s.registerTool('temp', 'd', {}, async () => 'x');
    assert.strictEqual(s.unregisterTool('temp'), true);
    assert.ok(!s.listTools().includes('temp'));
  });
  await ok('H4: unregisterTool 不存在返回 false', () => {
    const s = createEntityServer({});
    assert.strictEqual(s.unregisterTool('never-was'), false);
  });
  await ok('H5: registerTool 后 manifest 包含新工具', () => {
    const s = createEntityServer({});
    s.registerTool('custom', 'Custom', { type: 'object', properties: {} }, async () => 'x');
    assert.ok(s.manifest().tools.find((t) => t.name === 'custom'));
  });
  await ok('H6: 重复 registerTool 同名覆盖', () => {
    const s = createEntityServer({});
    s.registerTool('dup', 'first', {}, async () => 'first');
    s.registerTool('dup', 'second', {}, async () => 'second');
    const m = s.manifest();
    const dup = m.tools.filter((t) => t.name === 'dup');
    assert.strictEqual(dup.length, 1);
    assert.strictEqual(dup[0].description, 'second');
  });

  // ============ Group I: callTool 通用 ============
  await ok('I1: callTool 未知工具返回 ok:false', async () => {
    const s = createEntityServer({});
    const r = await s.callTool('nonexistent', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /工具 nonexistent 不存在/);
  });
  await ok('I2: callTool null args 走 {} 默认（handler 仍执行）', async () => {
    const sandbox = makeSandbox();
    const s = createEntityServer({ sandbox });
    const r = await s.callTool('spatialQuery', null);
    // base callTool does args || {} → handler gets {} → op undefined → toolStr built successfully
    assert.strictEqual(r.ok, true);
    assert.strictEqual(sandbox._calls.length, 1);
    assert.match(sandbox._calls[0], /<tool>undefined/);
  });
  await ok('I3: callTool args 为 undefined 走 {} 默认', async () => {
    const sandbox = makeSandbox();
    const s = createEntityServer({ sandbox });
    const r = await s.callTool('spatialQuery', undefined);
    // handler gets {} → op = undefined → toolStr = <tool>undefined({})</tool>
    assert.strictEqual(r.ok, true);
  });
  await ok('I4: callTool 返回 {ok,value} 或 {ok,error}', async () => {
    const viewer = makeViewer();
    const s = createEntityServer({ viewer });
    const r1 = await s.callTool('addMarker', { longitude: 1, latitude: 2 });
    assert.ok('ok' in r1 && 'value' in r1, 'success shape');
    const r2 = await s.callTool('nonexistent', {});
    assert.ok('ok' in r2 && 'error' in r2, 'error shape');
  });

  // ============ Group J: 集成测试 ============
  await ok('J1: 完整 marker 生命周期 add→list→remove', async () => {
    const viewer = makeViewer();
    const s = createEntityServer({ viewer });
    const r1 = await s.callTool('addMarker', { longitude: 1, latitude: 2, id: 'lifecycle' });
    assert.strictEqual(r1.value.id, 'lifecycle');
    const r2 = await s.callTool('listMarkers', {});
    assert.strictEqual(r2.value.markers.length, 1);
    const r3 = await s.callTool('removeMarker', { id: 'lifecycle' });
    assert.strictEqual(r3.value.ok, true);
    const r4 = await s.callTool('listMarkers', {});
    assert.strictEqual(r4.value.markers.length, 0);
  });
  await ok('J2: spatialQuery 4 种 operation 全覆盖', async () => {
    const sandbox = makeSandbox();
    const s = createEntityServer({ sandbox });
    for (const op of ['buffer', 'centroid', 'distance', 'area']) {
      await s.callTool('spatialQuery', { operation: op });
    }
    assert.strictEqual(sandbox._calls.length, 4);
    const ops = sandbox._calls.map((c) => c.match(/<tool>(\w+)/)[1]);
    assert.deepStrictEqual(ops.sort(), ['area', 'buffer', 'centroid', 'distance']);
  });
  await ok('J3: 未注入任何 deps 时所有工具返回 ok:false', async () => {
    const s = createEntityServer({});
    const results = [];
    for (const tool of ['addMarker', 'removeMarker', 'listMarkers', 'spatialQuery']) {
      const r = await s.callTool(tool, {});
      results.push({ tool, ok: r.ok });
    }
    assert.deepStrictEqual(results, [
      { tool: 'addMarker', ok: false },
      { tool: 'removeMarker', ok: false },
      { tool: 'listMarkers', ok: false },
      { tool: 'spatialQuery', ok: false },
    ]);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
