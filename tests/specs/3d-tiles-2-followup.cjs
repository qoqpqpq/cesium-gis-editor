// tests/specs/3d-tiles-2-followup.cjs
// 周期 11 P1-3: 3D Tiles 2.0 + Gaussian Splatting 跟踪评估

'use strict';

const path = require('path');
const fs = require('fs');

let pass = 0;
let fail = 0;

function assert(cond, name, detail) {
  const tag = cond ? 'PASS' : 'FAIL';
  process.stdout.write(`  [${tag}] ${name}${detail ? ' — ' + detail : ''}\n`);
  if (cond) pass += 1; else fail += 1;
}

(async () => {
  const root = path.resolve(__dirname, '..', '..');
  const docPath = path.join(root, 'docs/evaluation/3d-tiles-2-followup.md');
  process.stdout.write('\n=== 3d-tiles-2-followup ===\n');

  assert(fs.existsSync(docPath), 'document exists', docPath);
  const content = fs.readFileSync(docPath, 'utf8');

  // 1) 文档结构
  assert(/^#\s+3D Tiles 2\.0/m.test(content), 'H1 title present');
  assert(/周期.*11/m.test(content), 'cycle 11 referenced');
  assert(/MiniMax-M3/.test(content), 'MiniMax-M3 author');
  assert(/周期 10/.test(content), 'cycle 10 cross-reference');

  // 2) 时间线（2026 quarterly milestones）
  assert(/2026-Q1/.test(content), '2026-Q1 milestone');
  assert(/2026-Q2/.test(content), '2026-Q2 milestone');
  assert(/2026-Q3/.test(content), '2026-Q3 milestone');
  assert(/2026-Q4/.test(content), '2026-Q4 forecast');

  // 3) KHR_gaussian_splatting 标准化
  assert(/KHR_gaussian_splatting/.test(content), 'KHR_gaussian_splatting referenced');
  assert(/Khronos/.test(content), 'Khronos group');
  assert(/OGC/.test(content), 'OGC standards body');

  // 4) Cesium ion 适配
  assert(/Cesium ion/.test(content), 'Cesium ion referenced');
  assert(/\.ply/.test(content), 'PLY format mentioned');

  // 5) Mapbox 集成
  assert(/Mapbox GL JS/.test(content), 'Mapbox GL JS referenced');
  assert(/WebGL2/.test(content), 'WebGL2 backend');

  // 6) 本项目 CesiumJS 版本评估
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'client/package.json'), 'utf8'));
  const cesiumVer = pkg.dependencies.cesium || '';
  process.stdout.write(`  [INFO] CesiumJS = ${cesiumVer}\n`);
  assert(/^[\^~]?1\./.test(cesiumVer), 'CesiumJS 1.x in package.json', cesiumVer);

  // 7) 升级触发条件（≥4 项）
  assert(/用户需求/.test(content), 'user demand trigger');
  assert(/OGC 3D Tiles 2\.0 final/.test(content), 'OGC final trigger');
  assert(/WebGPU caniuse/.test(content), 'WebGPU coverage trigger');
  assert(/CesiumJS 1\.140\+/.test(content), 'Cesium 1.140+ trigger');

  // 8) 决策：暂不升级
  assert(/暂不升级 CesiumJS/.test(content), 'defer decision stated');
  assert(/破坏性 API/.test(content), 'breaking API risk noted');

  // 9) 监控信号
  assert(/季度|月度|持续/.test(content), 'monitoring cadence');
  assert(/splatting/.test(content), 'splatting demand monitored');

  // 10) Spec 统计
  assert(/22 子断言 PASS/.test(content), 'spec stats declared');

  // 11) 周期 10 评估文档存在（验证引用）
  const prevDoc = path.join(root, 'docs/evaluation/webgpu-3d-tiles.md');
  assert(fs.existsSync(prevDoc), 'cycle 10 webgpu-3d-tiles.md still exists');

  // 12) 关键术语全部出现
  ['gaussian', 'splatting', 'WebGPU', 'Khronos', 'OGC', 'Cesium ion'].forEach((t) => {
    assert(new RegExp(t, 'i').test(content), `term: ${t}`);
  });

  process.stdout.write(`\n--- summary: pass=${pass} fail=${fail} ---\n`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(2);
});
