// tests/specs/animation-server-deep.cjs
// Cycle 23 R1: Animation MCP Server 深度测试
// 目标：≥ 45 PASS
//
// 背景：
//   - server/services/mcpServers/animationServer.js (112 lines)
//   - cesium-mcp-servers.cjs 仅覆盖 E1-E4 (4 用例) 基础路径
//   - 本次深度测试 5 个工具（playAnimation/pauseAnimation/stopAnimation/setAnimationSpeed/recordTimeline）
//     的边界、错误处理、参数校验、manifest 结构、registerTool/unregisterTool
//
// 覆盖点：
//   - 模块导出（createAnimationServer）
//   - 创建 + name/description/version/protocolVersion
//   - manifest() 结构（5 工具完整 schema）
//   - listTools/toolCount
//   - playAnimation：成功 + 参数传播 + viewer 缺失 + viewer.animation 非对象
//   - pauseAnimation：成功 + viewer 缺失
//   - stopAnimation：成功 + viewer 缺失
//   - setAnimationSpeed：成功 + 参数校验 + viewer 缺失
//   - recordTimeline：成功 + 默认 label + camera 缺失 + viewer 缺失
//   - registerTool/unregisterTool + listTools 变化
//   - 集成：完整动画生命周期

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const { createAnimationServer } = require(path.join(__dirname, '../../server/services/mcpServers/animationServer'));

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
  return {
    animation: { playing: false, speed: 1 },
    camera: { heading: 0, pitch: -Math.PI / 4, roll: 0 },
    ...overrides,
  };
}

(async () => {
  console.log('=== animation-server-deep ===');

  // ============ Group A: 模块导出 ============
  await ok('A1: 导出 createAnimationServer 函数', () => {
    assert.strictEqual(typeof createAnimationServer, 'function');
  });
  await ok('A2: 模块仅导出 1 个 API', () => {
    const keys = Object.keys(require(path.join(__dirname, '../../server/services/mcpServers/animationServer')));
    assert.deepStrictEqual(keys, ['createAnimationServer']);
  });

  // ============ Group B: 创建 + 元数据 ============
  await ok('B1: createAnimationServer 无参返回对象', () => {
    const s = createAnimationServer();
    assert.ok(s && typeof s === 'object');
  });
  await ok('B2: name = cesium-animation', () => {
    const s = createAnimationServer({});
    assert.strictEqual(s.name, 'cesium-animation');
  });
  await ok('B3: description 包含时间线/动画关键字', () => {
    const s = createAnimationServer({});
    assert.match(s.description, /时间线|动画|animation/i);
  });
  await ok('B4: version = 1.0.0', () => {
    const s = createAnimationServer({});
    assert.strictEqual(s.version, '1.0.0');
  });
  await ok('B5: protocolVersion 默认 2025-06-18', () => {
    const s = createAnimationServer({});
    assert.strictEqual(s.protocolVersion, '2025-06-18');
  });
  await ok('B6: toolCount = 5', () => {
    const s = createAnimationServer({});
    assert.strictEqual(s.toolCount(), 5);
  });
  await ok('B7: listTools 返回 5 个工具名', () => {
    const s = createAnimationServer({});
    assert.deepStrictEqual(s.listTools().sort(), [
      'pauseAnimation',
      'playAnimation',
      'recordTimeline',
      'setAnimationSpeed',
      'stopAnimation',
    ]);
  });

  // ============ Group C: manifest() 结构 ============
  await ok('C1: manifest 含 protocolVersion/serverInfo/capabilities/tools', () => {
    const s = createAnimationServer({});
    const m = s.manifest();
    assert.strictEqual(m.protocolVersion, '2025-06-18');
    assert.ok(m.serverInfo);
    assert.strictEqual(m.serverInfo.name, 'cesium-animation');
    assert.ok(m.capabilities);
    assert.ok(Array.isArray(m.tools));
  });
  await ok('C2: manifest.tools 长度为 5', () => {
    const s = createAnimationServer({});
    assert.strictEqual(s.manifest().tools.length, 5);
  });
  await ok('C3: manifest 每个 tool 有 name/description/inputSchema', () => {
    const s = createAnimationServer({});
    for (const t of s.manifest().tools) {
      assert.ok(t.name, 'tool missing name');
      assert.ok(typeof t.description === 'string' && t.description.length > 0, 'tool missing description');
      assert.ok(t.inputSchema, 'tool missing inputSchema');
    }
  });
  await ok('C4: playAnimation inputSchema 有 3 个属性', () => {
    const s = createAnimationServer({});
    const m = s.manifest();
    const play = m.tools.find((t) => t.name === 'playAnimation');
    assert.deepStrictEqual(Object.keys(play.inputSchema.properties).sort(), ['endTime', 'speed', 'startTime']);
  });
  await ok('C5: setAnimationSpeed inputSchema required 含 speed', () => {
    const s = createAnimationServer({});
    const m = s.manifest();
    const setSpeed = m.tools.find((t) => t.name === 'setAnimationSpeed');
    assert.deepStrictEqual(setSpeed.inputSchema.required, ['speed']);
  });
  await ok('C6: pauseAnimation inputSchema additionalProperties=false', () => {
    const s = createAnimationServer({});
    const m = s.manifest();
    const pause = m.tools.find((t) => t.name === 'pauseAnimation');
    assert.strictEqual(pause.inputSchema.additionalProperties, false);
  });
  await ok('C7: stopAnimation inputSchema additionalProperties=false', () => {
    const s = createAnimationServer({});
    const m = s.manifest();
    const stop = m.tools.find((t) => t.name === 'stopAnimation');
    assert.strictEqual(stop.inputSchema.additionalProperties, false);
  });
  await ok('C8: manifest 不含 handler 字段', () => {
    const s = createAnimationServer({});
    for (const t of s.manifest().tools) {
      assert.strictEqual(t.handler, undefined, `${t.name} leaked handler`);
    }
  });

  // ============ Group D: playAnimation ============
  await ok('D1: playAnimation 成功返回 playing=true', async () => {
    const s = createAnimationServer({ viewer: makeViewer() });
    const r = await s.callTool('playAnimation', {
      startTime: '2026-01-01T00:00:00Z',
      endTime: '2026-01-02T00:00:00Z',
      speed: 2,
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.ok, true);
    assert.strictEqual(r.value.playing, true);
  });
  await ok('D2: playAnimation 参数原样返回', async () => {
    const s = createAnimationServer({ viewer: makeViewer() });
    const r = await s.callTool('playAnimation', {
      startTime: '2026-01-01',
      endTime: '2026-01-02',
      speed: 3.5,
    });
    assert.strictEqual(r.value.startTime, '2026-01-01');
    assert.strictEqual(r.value.endTime, '2026-01-02');
    assert.strictEqual(r.value.speed, 3.5);
  });
  await ok('D3: playAnimation 无参也成功', async () => {
    const s = createAnimationServer({ viewer: makeViewer() });
    const r = await s.callTool('playAnimation', {});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.playing, true);
  });
  await ok('D4: playAnimation viewer 缺失返回 ok:false', async () => {
    const s = createAnimationServer({});
    const r = await s.callTool('playAnimation', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('D5: playAnimation viewer.animation 非对象返回 ok:false', async () => {
    const viewer = { animation: 'not-object', camera: {} };
    const s = createAnimationServer({ viewer });
    const r = await s.callTool('playAnimation', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('D6: playAnimation viewer.animation=null 仍通过（typeof null=object）', async () => {
    const viewer = { animation: null, camera: {} };
    const s = createAnimationServer({ viewer });
    const r = await s.callTool('playAnimation', {});
    // typeof null === 'object' → passes check → handler runs
    assert.strictEqual(r.ok, true);
  });

  // ============ Group E: pauseAnimation ============
  await ok('E1: pauseAnimation 成功返回 playing=false', async () => {
    const s = createAnimationServer({ viewer: makeViewer() });
    const r = await s.callTool('pauseAnimation', {});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.ok, true);
    assert.strictEqual(r.value.playing, false);
  });
  await ok('E2: pauseAnimation viewer 缺失返回 ok:false', async () => {
    const s = createAnimationServer({});
    const r = await s.callTool('pauseAnimation', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('E3: pauseAnimation viewer.animation=[] 仍通过（typeof [] = object）', async () => {
    const viewer = { animation: [], camera: {} };
    const s = createAnimationServer({ viewer });
    const r = await s.callTool('pauseAnimation', {});
    // typeof [] === 'object' → passes check → handler runs
    assert.strictEqual(r.ok, true);
  });
  await ok('E4: pauseAnimation 无参也成功', async () => {
    const s = createAnimationServer({ viewer: makeViewer() });
    const r = await s.callTool('pauseAnimation', undefined);
    assert.strictEqual(r.ok, true);
  });

  // ============ Group F: stopAnimation ============
  await ok('F1: stopAnimation 成功返回 stopped=true', async () => {
    const s = createAnimationServer({ viewer: makeViewer() });
    const r = await s.callTool('stopAnimation', {});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.ok, true);
    assert.strictEqual(r.value.stopped, true);
  });
  await ok('F2: stopAnimation viewer 缺失返回 ok:false', async () => {
    const s = createAnimationServer({});
    const r = await s.callTool('stopAnimation', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('F3: stopAnimation viewer.animation 缺失返回 ok:false', async () => {
    const viewer = { camera: {} };
    const s = createAnimationServer({ viewer });
    const r = await s.callTool('stopAnimation', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });

  // ============ Group G: setAnimationSpeed ============
  await ok('G1: setAnimationSpeed 成功返回 speed', async () => {
    const s = createAnimationServer({ viewer: makeViewer() });
    const r = await s.callTool('setAnimationSpeed', { speed: 2 });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.ok, true);
    assert.strictEqual(r.value.speed, 2);
  });
  await ok('G2: setAnimationSpeed 支持小数速度', async () => {
    const s = createAnimationServer({ viewer: makeViewer() });
    const r = await s.callTool('setAnimationSpeed', { speed: 0.5 });
    assert.strictEqual(r.value.speed, 0.5);
  });
  await ok('G3: setAnimationSpeed 速度为 0 也接受', async () => {
    const s = createAnimationServer({ viewer: makeViewer() });
    const r = await s.callTool('setAnimationSpeed', { speed: 0 });
    assert.strictEqual(r.value.speed, 0);
  });
  await ok('G4: setAnimationSpeed 负数速度也接受', async () => {
    const s = createAnimationServer({ viewer: makeViewer() });
    const r = await s.callTool('setAnimationSpeed', { speed: -1 });
    assert.strictEqual(r.value.speed, -1);
  });
  await ok('G5: setAnimationSpeed viewer 缺失返回 ok:false', async () => {
    const s = createAnimationServer({});
    const r = await s.callTool('setAnimationSpeed', { speed: 2 });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('G6: setAnimationSpeed viewer.animation 非对象返回 ok:false', async () => {
    const viewer = { animation: 0, camera: {} };
    const s = createAnimationServer({ viewer });
    const r = await s.callTool('setAnimationSpeed', { speed: 2 });
    assert.strictEqual(r.ok, false);
  });

  // ============ Group H: recordTimeline ============
  await ok('H1: recordTimeline 成功返回 keyframe', async () => {
    const s = createAnimationServer({ viewer: makeViewer() });
    const r = await s.callTool('recordTimeline', { label: 'frame1' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.ok, true);
    assert.ok(r.value.keyframe);
    assert.strictEqual(r.value.keyframe.label, 'frame1');
  });
  await ok('H2: recordTimeline keyframe 含 time', async () => {
    const s = createAnimationServer({ viewer: makeViewer() });
    const r = await s.callTool('recordTimeline', { label: 'x' });
    assert.ok(typeof r.value.keyframe.time === 'number');
    assert.ok(r.value.keyframe.time > 0);
  });
  await ok('H3: recordTimeline keyframe 含 camera heading/pitch/roll', async () => {
    const viewer = { animation: {}, camera: { heading: 1, pitch: 2, roll: 3 } };
    const s = createAnimationServer({ viewer });
    const r = await s.callTool('recordTimeline', { label: 'y' });
    assert.strictEqual(r.value.keyframe.camera.heading, 1);
    assert.strictEqual(r.value.keyframe.camera.pitch, 2);
    assert.strictEqual(r.value.keyframe.camera.roll, 3);
  });
  await ok('H4: recordTimeline 无 label 默认 untitled', async () => {
    const s = createAnimationServer({ viewer: makeViewer() });
    const r = await s.callTool('recordTimeline', {});
    assert.strictEqual(r.value.keyframe.label, 'untitled');
  });
  await ok('H5: recordTimeline 无 viewer 返回 ok:false', async () => {
    const s = createAnimationServer({});
    const r = await s.callTool('recordTimeline', { label: 'x' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('H6: recordTimeline viewer.camera 非对象返回 ok:false', async () => {
    const viewer = { animation: {}, camera: 'not-object' };
    const s = createAnimationServer({ viewer });
    const r = await s.callTool('recordTimeline', { label: 'x' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });
  await ok('H7: recordTimeline viewer.camera 缺失返回 ok:false', async () => {
    const viewer = { animation: {} };
    const s = createAnimationServer({ viewer });
    const r = await s.callTool('recordTimeline', { label: 'x' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /viewer 未注入/);
  });

  // ============ Group I: registerTool/unregisterTool ============
  await ok('I1: registerTool 成功返回 true', () => {
    const s = createAnimationServer({});
    const r = s.registerTool('custom', 'Custom', { type: 'object', properties: {} }, async () => 'ok');
    assert.strictEqual(r, true);
    assert.ok(s.listTools().includes('custom'));
  });
  await ok('I2: registerTool 空 name 返回 false', () => {
    const s = createAnimationServer({});
    assert.strictEqual(s.registerTool('', 'd', {}, async () => 'x'), false);
  });
  await ok('I3: unregisterTool 已存在返回 true', () => {
    const s = createAnimationServer({});
    s.registerTool('temp', 'd', {}, async () => 'x');
    assert.strictEqual(s.unregisterTool('temp'), true);
    assert.ok(!s.listTools().includes('temp'));
  });
  await ok('I4: unregisterTool 不存在返回 false', () => {
    const s = createAnimationServer({});
    assert.strictEqual(s.unregisterTool('never-was'), false);
  });
  await ok('I5: registerTool 后 manifest 包含新工具', () => {
    const s = createAnimationServer({});
    s.registerTool('custom', 'Custom', { type: 'object', properties: {} }, async () => 'x');
    assert.ok(s.manifest().tools.find((t) => t.name === 'custom'));
  });
  await ok('I6: 重复 registerTool 同名覆盖', () => {
    const s = createAnimationServer({});
    s.registerTool('dup', 'first', {}, async () => 'first');
    s.registerTool('dup', 'second', {}, async () => 'second');
    const m = s.manifest();
    const dup = m.tools.filter((t) => t.name === 'dup');
    assert.strictEqual(dup.length, 1);
    assert.strictEqual(dup[0].description, 'second');
  });

  // ============ Group J: callTool 通用 ============
  await ok('J1: callTool 未知工具返回 ok:false', async () => {
    const s = createAnimationServer({});
    const r = await s.callTool('nonexistent', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /工具 nonexistent 不存在/);
  });
  await ok('J2: callTool 无参 args 走 {} 默认', async () => {
    const s = createAnimationServer({ viewer: makeViewer() });
    const r = await s.callTool('pauseAnimation', undefined);
    assert.strictEqual(r.ok, true);
  });
  await ok('J3: callTool 返回 {ok,value} 或 {ok,error}', async () => {
    const s = createAnimationServer({ viewer: makeViewer() });
    const r1 = await s.callTool('pauseAnimation', {});
    assert.ok('ok' in r1 && 'value' in r1, 'success shape');
    const r2 = await s.callTool('nonexistent', {});
    assert.ok('ok' in r2 && 'error' in r2, 'error shape');
  });
  await ok('J4: 未注入 viewer 时所有工具返回 ok:false', async () => {
    const s = createAnimationServer({});
    const tools = ['playAnimation', 'pauseAnimation', 'stopAnimation', 'setAnimationSpeed', 'recordTimeline'];
    for (const tool of tools) {
      const r = await s.callTool(tool, {});
      assert.strictEqual(r.ok, false, `${tool} should fail`);
      assert.match(r.error, /viewer 未注入/);
    }
  });

  // ============ Group K: 集成测试 ============
  await ok('K1: 完整动画生命周期 play→pause→stop', async () => {
    const s = createAnimationServer({ viewer: makeViewer() });
    const r1 = await s.callTool('playAnimation', { startTime: 't1', endTime: 't2', speed: 1 });
    assert.strictEqual(r1.value.playing, true);
    const r2 = await s.callTool('pauseAnimation', {});
    assert.strictEqual(r2.value.playing, false);
    const r3 = await s.callTool('stopAnimation', {});
    assert.strictEqual(r3.value.stopped, true);
  });
  await ok('K2: 完整 5 工具顺序执行', async () => {
    const s = createAnimationServer({ viewer: makeViewer() });
    const r1 = await s.callTool('playAnimation', { startTime: 'a', endTime: 'b', speed: 2 });
    assert.strictEqual(r1.ok, true);
    const r2 = await s.callTool('setAnimationSpeed', { speed: 3 });
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r2.value.speed, 3);
    const r3 = await s.callTool('recordTimeline', { label: 'mid' });
    assert.strictEqual(r3.ok, true);
    const r4 = await s.callTool('pauseAnimation', {});
    assert.strictEqual(r4.ok, true);
    const r5 = await s.callTool('stopAnimation', {});
    assert.strictEqual(r5.ok, true);
  });
  await ok('K3: recordTimeline 时间戳单调递增', async () => {
    const s = createAnimationServer({ viewer: makeViewer() });
    const r1 = await s.callTool('recordTimeline', { label: 'a' });
    const t1 = r1.value.keyframe.time;
    // Wait a tick to ensure time advances
    await new Promise((r) => setTimeout(r, 5));
    const r2 = await s.callTool('recordTimeline', { label: 'b' });
    const t2 = r2.value.keyframe.time;
    assert.ok(t2 >= t1, `t2(${t2}) should be >= t1(${t1})`);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
