// tests/specs/splat-pipeline-doc.cjs
// 周期 14 P1-4: CesiumJS 3D Gaussian Splat Pipeline 文档验证
//
// 覆盖：
//   - docs/guides/splat-pipeline.md 文档结构
//   - 关键关键字覆盖（3DGS / CesiumJS / pipeline / Microsoft campus / asset ID）
//   - 6 阶段说明完整
//   - 周期 13 P2-1 splatLoader.js 集成引用

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const docPath = path.join(ROOT, 'docs', 'guides', 'splat-pipeline.md');

let total = 0;
const failed = [];

function it(name, fn) {
  total += 1;
  try {
    fn();
    process.stdout.write(`  [PASS] ${name}\n`);
  } catch (e) {
    failed.push({ name, error: e });
    process.stdout.write(`  [FAIL] ${name} — ${e.message}\n`);
  }
}

const doc = fs.readFileSync(docPath, 'utf8');

// ===== 1. 文档基础 =====
it('SPLAT-1: 文档存在且非空', () => {
  assert.ok(doc.length > 100);
});

it('SPLAT-2: 文档以周期 14 P1-4 标记开头', () => {
  assert.match(doc, /周期 14 P1-4/);
});

it('SPLAT-3: 文档有标题', () => {
  assert.match(doc, /^# CesiumJS 3D Gaussian Splat Pipeline/m);
});

// ===== 2. 关键概念覆盖 =====
it('SPLAT-4: 文档解释 3DGS 概念', () => {
  assert.match(doc, /3D Gaussian Splatting|3DGS/);
});

it('SPLAT-5: 文档包含 COLMAP 引用', () => {
  assert.match(doc, /COLMAP/);
});

it('SPLAT-6: 文档包含 3D Tiles 引用', () => {
  assert.match(doc, /3D Tiles/);
});

it('SPLAT-7: 文档包含 Cesium ion 引用', () => {
  assert.match(doc, /Cesium ion/);
});

it('SPLAT-8: 文档包含 Microsoft campus asset ID 4547222', () => {
  assert.match(doc, /4547222/);
});

// ===== 3. Pipeline 6 阶段 =====
it('SPLAT-9: Stage 1 影像采集', () => {
  assert.match(doc, /Stage 1.*影像采集|影像采集/);
});

it('SPLAT-10: Stage 4 地理参考', () => {
  assert.match(doc, /地理参考|Geo-referenc/);
});

it('SPLAT-11: Stage 5 3D Tiles 转换', () => {
  assert.match(doc, /3D Tiles 转换|Stage 5/);
});

it('SPLAT-12: Stage 6 Cesium ion 可视化', () => {
  assert.match(doc, /Stage 6.*Cesium ion|Cesium ion 可视化/);
});

// ===== 4. 周期 13 集成引用 =====
it('SPLAT-13: 文档引用 splatLoader.js', () => {
  assert.match(doc, /splatLoader\.js/);
});

it('SPLAT-14: 文档引用 classifySplatQuality', () => {
  assert.match(doc, /classifySplatQuality/);
});

it('SPLAT-15: 文档引用 loadGaussianSplatTileset', () => {
  assert.match(doc, /loadGaussianSplatTileset/);
});

// ===== 5. 决策记录 =====
it('SPLAT-16: 文档有决策记录 section', () => {
  assert.match(doc, /决策记录/);
});

it('SPLAT-17: 文档提及 maxScreenSpaceError', () => {
  assert.match(doc, /maxScreenSpaceError/);
});

// ===== 6. 资源链接 =====
it('SPLAT-18: 文档有资源链接 section', () => {
  assert.match(doc, /资源链接/);
});

it('SPLAT-19: 文档提及 CesiumJS 官方教程链接', () => {
  assert.match(doc, /cesium\.com\/learn/);
});

// ===== 7. 验证 checklist =====
it('SPLAT-20: 文档有验证 checklist', () => {
  assert.match(doc, /checklist/);
});

// ===== 总结 =====
process.stdout.write(`\n--- splat-pipeline-doc: pass=${total - failed.length} fail=${failed.length} ---\n`);
if (failed.length > 0) {
  process.stdout.write(`FAIL DETAILS:\n${failed.map((f) => `  - ${f.name}: ${f.error.message}`).join('\n')}\n`);
  process.exit(1);
}
process.exit(0);
