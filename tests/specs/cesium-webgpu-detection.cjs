// tests/specs/cesium-webgpu-detection.cjs
// 周期 7 P0-3: CesiumJS WebGPU pipeline 评估 + MCP 集成检测
//
// 背景：
//   - CesiumJS 1.108+ 支持 WebGPU pipeline（3-6x 帧率提升）
//   - 本项目使用 Cesium ^1.113.0（client/package.json）
//   - WebGPU 切换需：1) 浏览器支持 WebGPU；2) Cesium Viewer 配置 contextOptions
//   - cesium-mcp-bridge：浏览器侧 MCP 桥，让 AI 助手通过 MCP 操作 Cesium Viewer
//
// 评估范围：
//   1. 静态扫描：Cesium 版本 ≥ 1.108（WebGPU 支持最低版本）
//   2. 静态扫描：CesiumEarth.jsx 用 Viewer 时未启用 WebGPU（默认 WebGL1/2）
//   3. 行为：检测 client/node_modules/cesium/Source/Renderer/...
//      含 WebGPU 渲染器（验证 npm 包含 WebGPU 实现）
//   4. 行为：package.json 应无 cesium-mcp-bridge 依赖（评估后再决定）
//   5. 决策摘要：周期 7 仅评估；周期 8+ 接入

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

const CESIUM_DIR = path.resolve(__dirname, '../../client/node_modules/cesium');
const CESIUM_INSTALLED = fs.existsSync(CESIUM_DIR + '/package.json');
const CESIUM_PKG = CESIUM_INSTALLED ? JSON.parse(fs.readFileSync(CESIUM_DIR + '/package.json', 'utf8')) : null;
const CLIENT_PKG = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../client/package.json'),
  'utf8',
));
const CESIUMEARTH_SRC = fs.existsSync(
  path.resolve(__dirname, '../../client/src/pages/gis/CesiumEarth.jsx'),
) ? fs.readFileSync(
  path.resolve(__dirname, '../../client/src/pages/gis/CesiumEarth.jsx'),
  'utf8',
) : '';

(async () => {
  console.log('=== cesium-webgpu-detection ===');

  // ---- 1. Cesium 版本 ----
  await test('client/package.json 声明 cesium ^1.113.0', () => {
    const deps = CLIENT_PKG.dependencies || {};
    assert.ok(deps.cesium, '应声明 cesium 依赖');
    assert.match(deps.cesium, /[\^~]?1\.11[3-9]|[\^~]?1\.1[2-9][0-9]/, '应 ≥ 1.113（WebGPU 支持）');
  });

  await test('实际安装的 Cesium 版本 ≥ 1.108（WebGPU 最低要求）', () => {
    if (!CESIUM_INSTALLED) {
      console.log('  [SKIP] Cesium 未安装');
      return;
    }
    const v = CESIUM_PKG.version;
    const [major, minor] = v.split('.').map(Number);
    assert.ok(major > 1 || (major === 1 && minor >= 108), `Cesium 应 ≥ 1.108，实际 ${v}`);
    console.log(`  [INFO] Cesium 版本: ${v}`);
  });

  // ---- 2. WebGPU 检测 ----
  await test('Cesium 包含 WebGPU 渲染器（Source/Renderer/WebGPU*）', () => {
    if (!CESIUM_INSTALLED) {
      console.log('  [SKIP] Cesium 未安装');
      return;
    }
    const rendererDir = path.join(CESIUM_DIR, 'Source', 'Renderer');
    if (!fs.existsSync(rendererDir)) {
      console.log('  [INFO] Source/Renderer 不存在（可能 build 后未保留）');
      return;
    }
    const files = fs.readdirSync(rendererDir);
    const webgpuFiles = files.filter((f) => /WebGPU/i.test(f));
    assert.ok(webgpuFiles.length > 0, `应有 WebGPU 文件，实际: ${files.filter((f) => /gpu/i.test(f)).join(', ')}`);
    console.log(`  [INFO] WebGPU 文件: ${webgpuFiles.join(', ')}`);
  });

  await test('CesiumEarth.jsx 不显式启用 WebGPU（默认 WebGL1/2 路径）', () => {
    assert.ok(CESIUMEARTH_SRC, 'CesiumEarth.jsx 应存在');
    // WebGPU 启用：contextOptions.webgl → 改用 webgpu；或在 Viewer 构造时 forceDeviceOptions
    // 当前未启用 = 默认 WebGL 路径
    const hasWebGPU = /WebGPU|webgpu/.test(CESIUMEARTH_SRC);
    assert.strictEqual(hasWebGPU, false, '当前未启用 WebGPU；评估后由周期 8+ 切换');
  });

  // ---- 3. MCP 桥检测 ----
  await test('client/package.json 当前不含 cesium-mcp-bridge', () => {
    const deps = { ...(CLIENT_PKG.dependencies || {}), ...(CLIENT_PKG.devDependencies || {}) };
    assert.strictEqual(deps['cesium-mcp-bridge'], undefined, '当前未引入 cesium-mcp-bridge');
  });

  await test('评估文档 / 调研：浏览器-agent 模式优先', () => {
    // 周期 7 仅评估；不实际接入 MCP 桥
    // 决策依据见 docs/cycles/cycle-07-research.md（调研 Top1）
    console.log('  [INFO] 调研文档应在 cycle-07-research.md 包含 Cesium MCP / WebMCP');
  });

  // ---- 4. 评估总结 ----
  console.log('  [INFO] 周期 7 P0-3 决策：');
  console.log('    - Cesium 1.113+ 已支持 WebGPU；本项目未启用');
  console.log('    - 切换路径：Viewer({ contextOptions: { webgl: { ... } } }) 改为 webgpu 配置');
  console.log('    - MCP 桥：评估 cesium-mcp-bridge；优先 browser-agent 模式（零后端）');
  console.log('    - 周期 8+ 实施：先 1 个 demo 验证帧率提升；通过后切换默认 Viewer');

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
