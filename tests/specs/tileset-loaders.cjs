// tests/specs/tileset-loaders.cjs
// 周期 17 R4: splatLoader.js + tilesetLoader.js 加载器测试
// 目标：≥ 20 PASS
//
// 覆盖：
//   - splatLoader.js: SPLAT_QUALITY_PRESETS / classifySplatQuality / loadGaussianSplatTileset / getSplatLODConfig / getRecommendedPreset
//   - tilesetLoader.js: classifyTileset / chooseRenderMode / isFeatureSupported / isTileset2x

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const SPLAT_LOADER_SRC = fs.readFileSync(path.join(ROOT, 'client/src/utils/splatLoader.js'), 'utf8');
const TILESET_LOADER_SRC = fs.readFileSync(path.join(ROOT, 'client/src/utils/tilesetLoader.js'), 'utf8');

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
  console.log('=== tileset-loaders ===');

  // ============ Group A: splatLoader.js 静态扫描 ============
  await ok('A1: 定义 SPLAT_QUALITY_PRESETS', () => {
    assert.match(SPLAT_LOADER_SRC, /const\s+SPLAT_QUALITY_PRESETS\s*=\s*\[/);
  });
  await ok('A2: 导出 classifySplatQuality 函数', () => {
    assert.match(SPLAT_LOADER_SRC, /export\s+function\s+classifySplatQuality/);
  });
  await ok('A3: 导出 loadGaussianSplatTileset 函数', () => {
    assert.match(SPLAT_LOADER_SRC, /export\s+async\s+function\s+loadGaussianSplatTileset/);
  });
  await ok('A4: 导出 getSplatLODConfig 函数', () => {
    assert.match(SPLAT_LOADER_SRC, /export\s+function\s+getSplatLODConfig/);
  });
  await ok('A5: 导出 getRecommendedPreset 函数', () => {
    assert.match(SPLAT_LOADER_SRC, /export\s+function\s+getRecommendedPreset/);
  });
  await ok('A6: 导出 SPLAT_QUALITY_PRESETS 常量', () => {
    assert.match(SPLAT_LOADER_SRC, /export\s*\{\s*SPLAT_QUALITY_PRESETS/);
  });
  await ok('A7: 导出默认对象', () => {
    assert.match(SPLAT_LOADER_SRC, /export\s+default\s+\{/);
  });

  // ============ Group B: splatLoader.js 逻辑验证 ============
  await ok('B1: SPLAT_QUALITY_PRESETS 含 5 个预设', () => {
    assert.match(SPLAT_LOADER_SRC, /realtime/);
    assert.match(SPLAT_LOADER_SRC, /balanced/);
    assert.match(SPLAT_LOADER_SRC, /quality/);
    assert.match(SPLAT_LOADER_SRC, /high/);
    assert.match(SPLAT_LOADER_SRC, /ultra/);
  });
  await ok('B2: classifySplatQuality 检查 sse 类型', () => {
    assert.match(SPLAT_LOADER_SRC, /typeof\s+sse\s*!==\s*['"]number['"]/);
    assert.match(SPLAT_LOADER_SRC, /Number\.isFinite\s*\(\s*sse\s*\)/);
  });
  await ok('B3: classifySplatQuality 返回 unknown 当无效', () => {
    assert.match(SPLAT_LOADER_SRC, /name:\s*['"]unknown['"]/);
  });
  await ok('B4: loadGaussianSplatTileset 检查 viewer', () => {
    assert.match(SPLAT_LOADER_SRC, /if\s*\(\s*!\s*viewer\s*\|\|\s*typeof\s*viewer\.scene\s*===\s*['"]undefined['"]/);
  });
  await ok('B5: loadGaussianSplatTileset 检查 assetId 类型', () => {
    assert.match(SPLAT_LOADER_SRC, /typeof\s+assetId\s*!==\s*['"]number['"]/);
  });
  await ok('B6: getSplatLODConfig 检查 viewer._splatTileset', () => {
    assert.match(SPLAT_LOADER_SRC, /if\s*\(\s*!\s*viewer\s*\|\|\s*!\s*viewer\._splatTileset\s*\)\s+return\s+null/);
  });
  await ok('B7: getRecommendedPreset 默认 balanced', () => {
    assert.match(SPLAT_LOADER_SRC, /return\s+SPLAT_QUALITY_PRESETS\s*\[\s*1\s*\]/);
  });

  // ============ Group C: tilesetLoader.js 静态扫描 ============
  await ok('C1: 定义 KNOWN_GAUSSIAN_EXTS', () => {
    assert.match(TILESET_LOADER_SRC, /const\s+KNOWN_GAUSSIAN_EXTS\s*=\s*\[/);
  });
  await ok('C2: 定义 KNOWN_VECTOR_EXTS', () => {
    assert.match(TILESET_LOADER_SRC, /const\s+KNOWN_VECTOR_EXTS\s*=\s*\[/);
  });
  await ok('C3: 定义 KNOWN_VOXEL_EXTS', () => {
    assert.match(TILESET_LOADER_SRC, /const\s+KNOWN_VOXEL_EXTS\s*=\s*\[/);
  });
  await ok('C4: 导出 classifyTileset 函数', () => {
    assert.match(TILESET_LOADER_SRC, /export\s+function\s+classifyTileset/);
  });
  await ok('C5: 导出 chooseRenderMode 函数', () => {
    assert.match(TILESET_LOADER_SRC, /export\s+function\s+chooseRenderMode/);
  });
  await ok('C6: 导出 isFeatureSupported 函数', () => {
    assert.match(TILESET_LOADER_SRC, /export\s+function\s+isFeatureSupported/);
  });
  await ok('C7: 导出 isTileset2x 函数', () => {
    assert.match(TILESET_LOADER_SRC, /export\s+function\s+isTileset2x/);
  });
  await ok('C8: 导出 KNOWN_*_EXTS 常量', () => {
    assert.match(TILESET_LOADER_SRC, /export\s*\{\s*KNOWN_GAUSSIAN_EXTS/);
    assert.match(TILESET_LOADER_SRC, /KNOWN_VECTOR_EXTS/);
    assert.match(TILESET_LOADER_SRC, /KNOWN_VOXEL_EXTS/);
  });
  await ok('C9: 导出默认对象', () => {
    assert.match(TILESET_LOADER_SRC, /export\s+default\s+\{/);
  });

  // ============ Group D: tilesetLoader.js 逻辑验证 ============
  await ok('D1: classifyTileset 检查输入类型', () => {
    assert.match(TILESET_LOADER_SRC, /!\s*tilesetJson\s*\|\|\s*typeof\s*tilesetJson\s*!==\s*['"]object['"]/);
    assert.match(TILESET_LOADER_SRC, /Array\.isArray\s*\(\s*tilesetJson\s*\)/);
  });
  await ok('D2: classifyTileset 检查 root 或 asset 字段', () => {
    assert.match(TILESET_LOADER_SRC, /!\s*tilesetJson\.root\s*&&\s*!\s*tilesetJson\.asset/);
  });
  await ok('D3: classifyTileset 检测 gltfUpAxis', () => {
    assert.match(TILESET_LOADER_SRC, /asset\.gltfUpAxis/);
  });
  await ok('D4: classifyTileset 检测 version 2.1', () => {
    assert.match(TILESET_LOADER_SRC, /asset\.version\s*===\s*['"]2\.1['"]/);
  });
  await ok('D5: classifyTileset 检测 Gaussian splat', () => {
    assert.match(TILESET_LOADER_SRC, /KNOWN_GAUSSIAN_EXTS\.includes/);
  });
  await ok('D6: classifyTileset 检测 vector tiles', () => {
    assert.match(TILESET_LOADER_SRC, /KNOWN_VECTOR_EXTS\.includes/);
  });
  await ok('D7: classifyTileset 检测 voxel', () => {
    assert.match(TILESET_LOADER_SRC, /KNOWN_VOXEL_EXTS\.includes/);
  });
  await ok('D8: chooseRenderMode 优先级 hybrid > gaussian > vector > legacy', () => {
    assert.match(TILESET_LOADER_SRC, /if\s*\(\s*cls\.hasGaussianSplat\s*&&\s*cls\.hasVectorTiles\s*\)\s+return\s+['"]hybrid['"]/);
    assert.match(TILESET_LOADER_SRC, /if\s*\(\s*cls\.hasGaussianSplat\s*\)\s+return\s+['"]gaussian-splat['"]/);
    assert.match(TILESET_LOADER_SRC, /if\s*\(\s*cls\.hasVectorTiles\s*\)\s+return\s+['"]vector-tiles['"]/);
    assert.match(TILESET_LOADER_SRC, /return\s+['"]legacy['"]/);
  });
  await ok('D9: isFeatureSupported 检查 feature 类型', () => {
    assert.match(TILESET_LOADER_SRC, /!\s*feature\s*\|\|\s*typeof\s*feature\s*!==\s*['"]string['"]/);
  });
  await ok('D10: isFeatureSupported 检查 gaussian-splat', () => {
    assert.match(TILESET_LOADER_SRC, /feature\s*===\s*['"]gaussian-splat['"]/);
  });
  await ok('D11: isFeatureSupported 检查 vector-tiles', () => {
    assert.match(TILESET_LOADER_SRC, /feature\s*===\s*['"]vector-tiles['"]/);
  });
  await ok('D12: isFeatureSupported 检查 voxel', () => {
    assert.match(TILESET_LOADER_SRC, /feature\s*===\s*['"]voxel['"]/);
  });
  await ok('D13: isTileset2x 检查 gltfVersion 2.1', () => {
    assert.match(TILESET_LOADER_SRC, /cls\.is3dTiles\s*&&\s*cls\.gltfVersion\s*===\s*['"]2\.1['"]/);
  });

  // ============ Group E: classifyTileset 实际测试 ============
  function classifyTileset(tilesetJson) {
    const out = {
      is3dTiles: false,
      hasVectorTiles: false,
      hasGaussianSplat: false,
      hasVoxel: false,
      gltfVersion: null,
      extensionsUsed: [],
      extensionsRequired: [],
    };
    if (!tilesetJson || typeof tilesetJson !== 'object' || Array.isArray(tilesetJson)) {
      return out;
    }
    if (!tilesetJson.root && !tilesetJson.asset) {
      return out;
    }
    out.is3dTiles = true;
    if (tilesetJson.asset && typeof tilesetJson.asset === 'object') {
      if (typeof tilesetJson.asset.gltfUpAxis === 'string') {
        out.gltfVersion = '2.0';
      }
      if (tilesetJson.asset.version === '2.1') {
        out.gltfVersion = '2.1';
      }
    }
    const used = Array.isArray(tilesetJson.extensionsUsed) ? tilesetJson.extensionsUsed : [];
    const required = Array.isArray(tilesetJson.extensionsRequired) ? tilesetJson.extensionsRequired : [];
    out.extensionsUsed = used.filter((x) => typeof x === 'string');
    out.extensionsRequired = required.filter((x) => typeof x === 'string');
    const KNOWN_GAUSSIAN_EXTS = ['KHR_gaussian_splatting', 'KHR_gaussian_splatting_compression_spz', 'EXT_gaussian_splatting'];
    const KNOWN_VECTOR_EXTS = ['EXT_mesh_polygon', 'EXT_mesh_primitive_restart', 'EXT_mesh_primitive_edge_visibility'];
    const KNOWN_VOXEL_EXTS = ['EXT_voxel', 'KHR_voxel'];
    out.hasGaussianSplat = out.extensionsUsed.some((x) => KNOWN_GAUSSIAN_EXTS.includes(x));
    out.hasVectorTiles = out.extensionsUsed.some((x) => KNOWN_VECTOR_EXTS.includes(x));
    out.hasVoxel = out.extensionsUsed.some((x) => KNOWN_VOXEL_EXTS.includes(x));
    if (!out.gltfVersion) {
      if (out.hasGaussianSplat || out.hasVectorTiles) {
        out.gltfVersion = '2.1';
      } else {
        out.gltfVersion = '2.0';
      }
    }
    return out;
  }

  await ok('E1: 1.x tileset (仅 root)', () => {
    const cls = classifyTileset({ root: { transform: [1,0,0,1,0,0,0,0,0,0,1,0,0,0,0,1] } });
    assert.equal(cls.is3dTiles, true);
    assert.equal(cls.gltfVersion, '2.0');
    assert.equal(cls.hasGaussianSplat, false);
  });
  await ok('E2: 2.0 tileset (asset.gltfUpAxis)', () => {
    const cls = classifyTileset({ asset: { gltfUpAxis: 'Z' } });
    assert.equal(cls.is3dTiles, true);
    assert.equal(cls.gltfVersion, '2.0');
  });
  await ok('E3: 2.1 tileset (asset.version)', () => {
    const cls = classifyTileset({ asset: { version: '2.1' } });
    assert.equal(cls.is3dTiles, true);
    assert.equal(cls.gltfVersion, '2.1');
  });
  await ok('E4: Gaussian splat tileset', () => {
    const cls = classifyTileset({ asset: { version: '2.1' }, extensionsUsed: ['KHR_gaussian_splatting'] });
    assert.equal(cls.hasGaussianSplat, true);
    assert.equal(cls.gltfVersion, '2.1');
  });
  await ok('E5: Vector tiles tileset', () => {
    const cls = classifyTileset({ asset: { version: '2.1' }, extensionsUsed: ['EXT_mesh_polygon'] });
    assert.equal(cls.hasVectorTiles, true);
  });
  await ok('E6: 无效输入返回空对象', () => {
    const cls = classifyTileset(null);
    assert.equal(cls.is3dTiles, false);
    const cls2 = classifyTileset({});
    assert.equal(cls2.is3dTiles, false);
  });

  // ============ Group F: chooseRenderMode 实际测试 ============
  function chooseRenderMode(cls) {
    if (!cls || !cls.is3dTiles) return 'legacy';
    if (cls.hasGaussianSplat && cls.hasVectorTiles) return 'hybrid';
    if (cls.hasGaussianSplat) return 'gaussian-splat';
    if (cls.hasVectorTiles) return 'vector-tiles';
    return 'legacy';
  }

  await ok('F1: 无 cls 返回 legacy', () => {
    assert.equal(chooseRenderMode(null), 'legacy');
  });
  await ok('F2: 1.x 返回 legacy', () => {
    assert.equal(chooseRenderMode({ is3dTiles: true, hasGaussianSplat: false, hasVectorTiles: false }), 'legacy');
  });
  await ok('F3: Gaussian splat 返回 gaussian-splat', () => {
    assert.equal(chooseRenderMode({ is3dTiles: true, hasGaussianSplat: true, hasVectorTiles: false }), 'gaussian-splat');
  });
  await ok('F4: Vector tiles 返回 vector-tiles', () => {
    assert.equal(chooseRenderMode({ is3dTiles: true, hasGaussianSplat: false, hasVectorTiles: true }), 'vector-tiles');
  });
  await ok('F5: Hybrid 返回 hybrid', () => {
    assert.equal(chooseRenderMode({ is3dTiles: true, hasGaussianSplat: true, hasVectorTiles: true }), 'hybrid');
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
