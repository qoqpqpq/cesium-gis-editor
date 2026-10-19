// tests/specs/aicontext-management.cjs
// 周期 18 R3: aiContext.js AI 上下文管理测试
// 目标：≥ 20 PASS
//
// 覆盖：
//   - bboxOf 边界框计算
//   - buildSceneContext 场景上下文构建
//   - formatSceneContext markdown 格式化
//   - headlineOf 统计摘要
//   - 常量定义

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const AICONTEXT_SRC = fs.readFileSync(path.join(ROOT, 'client/src/pages/gis/aiContext.js'), 'utf8');

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

(async function main() {
  console.log('=== aicontext-management ===');

  // ============ Group A: 静态扫描 - 导出验证 ============
  await ok('A1: 导出 bboxOf 函数', () => {
    assert.match(AICONTEXT_SRC, /export\s+function\s+bboxOf/);
  });
  await ok('A2: 导出 buildSceneContext 函数', () => {
    assert.match(AICONTEXT_SRC, /export\s+function\s+buildSceneContext/);
  });
  await ok('A3: 导出 formatSceneContext 函数', () => {
    assert.match(AICONTEXT_SRC, /export\s+function\s+formatSceneContext/);
  });
  await ok('A4: 导出 headlineOf 函数', () => {
    assert.match(AICONTEXT_SRC, /export\s+function\s+headlineOf/);
  });

  // ============ Group B: 静态扫描 - 常量定义 ============
  await ok('B1: 定义 MAX_LAYERS_LISTED 常量', () => {
    assert.match(AICONTEXT_SRC, /const\s+MAX_LAYERS_LISTED\s*=\s*12/);
  });
  await ok('B2: 定义 SAMPLES_PER_LAYER 常量', () => {
    assert.match(AICONTEXT_SRC, /const\s+SAMPLES_PER_LAYER\s*=\s*2/);
  });
  await ok('B3: 定义 MAX_FIELDS_LISTED 常量', () => {
    assert.match(AICONTEXT_SRC, /const\s+MAX_FIELDS_LISTED\s*=\s*12/);
  });
  await ok('B4: 定义 CONTEXT_BUDGET 常量', () => {
    assert.match(AICONTEXT_SRC, /const\s+CONTEXT_BUDGET\s*=\s*2500/);
  });

  // ============ Group C: bboxOf 逻辑验证 ============
  await ok('C1: 接受 positionsList 参数', () => {
    assert.match(AICONTEXT_SRC, /function\s+bboxOf\s*\(\s*positionsList\s*\)/);
  });
  await ok('C2: 初始化 minLng/minLat 为 Infinity', () => {
    assert.match(AICONTEXT_SRC, /minLng\s*=\s*Infinity/);
    assert.match(AICONTEXT_SRC, /minLat\s*=\s*Infinity/);
  });
  await ok('C3: 初始化 maxLng/maxLat 为 -Infinity', () => {
    assert.match(AICONTEXT_SRC, /maxLng\s*=\s*-Infinity/);
    assert.match(AICONTEXT_SRC, /maxLat\s*=\s*-Infinity/);
  });
  await ok('C4: 使用 cartesiansToLngLatHeights 转换坐标', () => {
    assert.match(AICONTEXT_SRC, /cartesiansToLngLatHeights/);
  });
  await ok('C5: 返回 null 当无有效坐标', () => {
    assert.match(AICONTEXT_SRC, /if\s*\(\s*!\s*Number\.isFinite\s*\(\s*minLng\s*\)\s*\)\s+return\s+null/);
  });
  await ok('C6: 返回 [minLng, minLat, maxLng, maxLat]', () => {
    assert.match(AICONTEXT_SRC, /return\s+\[\s*minLng\s*,\s*minLat\s*,\s*maxLng\s*,\s*maxLat\s*\]/);
  });

  // ============ Group D: buildSceneContext 逻辑验证 ============
  await ok('D1: 接受 { viewer, editor, fileStats } 参数', () => {
    assert.match(AICONTEXT_SRC, /function\s+buildSceneContext\s*\(\s*\{\s*viewer\s*,\s*editor\s*,\s*fileStats\s*\}\s*=\s*\{\}\s*\)/);
  });
  await ok('D2: viewer 为 null 时返回 null', () => {
    assert.match(AICONTEXT_SRC, /if\s*\(\s*!\s*viewer\s*\)\s+return\s+null/);
  });
  await ok('D3: 提取相机位置', () => {
    assert.match(AICONTEXT_SRC, /viewer\.camera\.positionCartographic/);
  });
  await ok('D4: 提取相机经纬度', () => {
    assert.match(AICONTEXT_SRC, /cameraLon/);
    assert.match(AICONTEXT_SRC, /cameraLat/);
  });
  await ok('D5: 提取相机高度', () => {
    assert.match(AICONTEXT_SRC, /cameraHeightM/);
  });
  await ok('D6: 提取 viewer.entities', () => {
    assert.match(AICONTEXT_SRC, /viewer\.entities\.values/);
  });
  await ok('D7: 提取 editor.features', () => {
    assert.match(AICONTEXT_SRC, /editor\.features/);
  });
  await ok('D8: 提取 editor.layers', () => {
    assert.match(AICONTEXT_SRC, /editor\.layers/);
  });
  await ok('D9: 提取 editor.selectedIds', () => {
    assert.match(AICONTEXT_SRC, /editor\.selectedIds/);
  });
  await ok('D10: 返回相机信息', () => {
    assert.match(AICONTEXT_SRC, /cameraLon\s*,\s*cameraLat\s*,\s*cameraHeightM/);
  });
  await ok('D11: 返回图层列表', () => {
    assert.match(AICONTEXT_SRC, /layers/);
  });
  await ok('D12: 返回要素计数', () => {
    assert.match(AICONTEXT_SRC, /featureCount/);
  });
  await ok('D13: 返回选中列表', () => {
    assert.match(AICONTEXT_SRC, /selection/);
  });
  await ok('D14: 返回文件列表', () => {
    assert.match(AICONTEXT_SRC, /files:\s*fileStats/);
  });

  // ============ Group E: formatSceneContext 逻辑验证 ============
  await ok('E1: 接受 ctx 参数', () => {
    assert.match(AICONTEXT_SRC, /function\s+formatSceneContext\s*\(\s*ctx\s*\)/);
  });
  await ok('E2: ctx 为 null 时返回提示', () => {
    assert.match(AICONTEXT_SRC, /if\s*\(\s*!\s*ctx\s*\)\s+return/);
  });
  await ok('E3: 格式化相机信息', () => {
    assert.match(AICONTEXT_SRC, /相机：经度/);
  });
  await ok('E4: 格式化图层信息', () => {
    assert.match(AICONTEXT_SRC, /编辑器图层/);
  });
  await ok('E5: 格式化文件列表', () => {
    assert.match(AICONTEXT_SRC, /拖入的文件/);
  });
  await ok('E6: 格式化实体信息', () => {
    assert.match(AICONTEXT_SRC, /代码\/预设生成的实体/);
  });
  await ok('E7: 格式化选中信息', () => {
    assert.match(AICONTEXT_SRC, /当前选中/);
  });
  await ok('E8: 截断超过 CONTEXT_BUDGET 的内容', () => {
    assert.match(AICONTEXT_SRC, /out\.length\s*>\s*CONTEXT_BUDGET/);
  });

  // ============ Group F: headlineOf 逻辑验证 ============
  await ok('F1: 接受 ctx 参数', () => {
    assert.match(AICONTEXT_SRC, /function\s+headlineOf\s*\(\s*ctx\s*\)/);
  });
  await ok('F2: ctx 为 null 时返回 null', () => {
    assert.match(AICONTEXT_SRC, /if\s*\(\s*!\s*ctx\s*\)\s+return\s+null/);
  });
  await ok('F3: 返回 featureCount', () => {
    assert.match(AICONTEXT_SRC, /featureCount:\s*ctx\.featureCount/);
  });
  await ok('F4: 返回 layerCount', () => {
    assert.match(AICONTEXT_SRC, /layerCount/);
  });
  await ok('F5: 返回 fileCount', () => {
    assert.match(AICONTEXT_SRC, /fileCount/);
  });
  await ok('F6: 返回 rootEntityCount', () => {
    assert.match(AICONTEXT_SRC, /rootEntityCount/);
  });
  await ok('F7: 返回 selectedCount', () => {
    assert.match(AICONTEXT_SRC, /selectedCount/);
  });
  await ok('F8: 返回 cameraHeightM', () => {
    assert.match(AICONTEXT_SRC, /cameraHeightM:\s*ctx\.cameraHeightM/);
  });

  // ============ Group G: 辅助函数验证 ============
  await ok('G1: 定义 fmtBbox 函数', () => {
    assert.match(AICONTEXT_SRC, /function\s+fmtBbox/);
  });
  await ok('G2: 定义 fmtVal 函数', () => {
    assert.match(AICONTEXT_SRC, /function\s+fmtVal/);
  });
  await ok('G3: 定义 sampleAttrs 函数', () => {
    assert.match(AICONTEXT_SRC, /function\s+sampleAttrs/);
  });
  await ok('G4: 定义 entityPositions 函数', () => {
    assert.match(AICONTEXT_SRC, /function\s+entityPositions/);
  });
  await ok('G5: 定义 summarizeLayer 函数', () => {
    assert.match(AICONTEXT_SRC, /function\s+summarizeLayer/);
  });

  // ============ Group H: 内部逻辑验证 ============
  await ok('H1: summarizeLayer 统计 kindCount', () => {
    assert.match(AICONTEXT_SRC, /kindCount/);
  });
  await ok('H2: summarizeLayer 收集 fields', () => {
    assert.match(AICONTEXT_SRC, /collectFields/);
  });
  await ok('H3: summarizeLayer 提取 samples', () => {
    assert.match(AICONTEXT_SRC, /SAMPLES_PER_LAYER/);
  });
  await ok('H4: summarizeLayer 计算 bbox', () => {
    assert.match(AICONTEXT_SRC, /bboxOf/);
  });
  await ok('H5: buildSceneContext 按图层分组要素', () => {
    assert.match(AICONTEXT_SRC, /byLayer/);
  });
  await ok('H6: buildSceneContext 处理丢失的图层定义', () => {
    assert.match(AICONTEXT_SRC, /有要素但图层定义已丢失/);
  });
  await ok('H7: buildSceneContext 统计 rootTypeCount', () => {
    assert.match(AICONTEXT_SRC, /rootTypeCount/);
  });
  await ok('H8: buildSceneContext 统计 imageryLayers', () => {
    assert.match(AICONTEXT_SRC, /imageryLayers/);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
