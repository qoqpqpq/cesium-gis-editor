// tests/specs/3d-tiles-2-loader.cjs
// 周期 12 P1-4: tilesetLoader 单元测试
// 目标：≥ 25 子断言 PASS

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const url = require('node:url');

const loaderPath = url.pathToFileURL(path.join(__dirname, '../../client/src/utils/tilesetLoader.js')).href;

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
  console.log('=== 3d-tiles-2-loader ===');

  const loader = await import(loaderPath);

  // ============ Group A: 模块导出 ============
  await ok('A1: classifyTileset 已导出', () => {
    assert.equal(typeof loader.classifyTileset, 'function');
  });
  await ok('A2: chooseRenderMode 已导出', () => {
    assert.equal(typeof loader.chooseRenderMode, 'function');
  });
  await ok('A3: isFeatureSupported 已导出', () => {
    assert.equal(typeof loader.isFeatureSupported, 'function');
  });
  await ok('A4: isTileset2x 已导出', () => {
    assert.equal(typeof loader.isTileset2x, 'function');
  });
  await ok('A5: KNOWN_GAUSSIAN_EXTS 数组', () => {
    // ESM 命名导出或 default export 上都应可见
    const arr = loader.KNOWN_GAUSSIAN_EXTS || (loader.default && loader.default.KNOWN_GAUSSIAN_EXTS);
    assert.ok(Array.isArray(arr), `KNOWN_GAUSSIAN_EXTS not array`);
    assert.ok(arr.length >= 2, `length=${arr && arr.length}`);
  });

  // ============ Group B: classifyTileset 边界 ============
  await ok('B1: null → is3dTiles=false', () => {
    const r = loader.classifyTileset(null);
    assert.equal(r.is3dTiles, false);
  });
  await ok('B2: 数组 → is3dTiles=false', () => {
    const r = loader.classifyTileset([]);
    assert.equal(r.is3dTiles, false);
  });
  await ok('B3: 字符串 → is3dTiles=false', () => {
    const r = loader.classifyTileset('foo');
    assert.equal(r.is3dTiles, false);
  });
  await ok('B4: 空对象 → is3dTiles=false', () => {
    const r = loader.classifyTileset({});
    assert.equal(r.is3dTiles, false);
  });

  // ============ Group C: 3D Tiles 1.x ============
  await ok('C1: 1.x root.boundingVolume → is3dTiles=true', () => {
    const ts = {
      root: {
        boundingVolume: { region: [-1, -1, 1, 1, 0, 1000] },
      },
    };
    const r = loader.classifyTileset(ts);
    assert.equal(r.is3dTiles, true);
  });
  await ok('C2: 1.x 缺 extensions → hasVectorTiles/hasGaussianSplat=false', () => {
    const ts = { root: { boundingVolume: {} } };
    const r = loader.classifyTileset(ts);
    assert.equal(r.hasVectorTiles, false);
    assert.equal(r.hasGaussianSplat, false);
    assert.equal(r.hasVoxel, false);
  });
  await ok('C3: 1.x gltfVersion 默认 2.0', () => {
    const r = loader.classifyTileset({ root: { boundingVolume: {} } });
    assert.equal(r.gltfVersion, '2.0');
  });

  // ============ Group D: 3D Tiles 2.0 vector tiles ============
  await ok('D1: EXT_mesh_polygon → hasVectorTiles=true', () => {
    const ts = {
      asset: { version: '2.1', gltfUpAxis: 'Y' },
      extensionsUsed: ['EXT_mesh_polygon'],
      extensionsRequired: ['EXT_mesh_polygon'],
    };
    const r = loader.classifyTileset(ts);
    assert.equal(r.hasVectorTiles, true);
    assert.equal(r.gltfVersion, '2.1');
  });
  await ok('D2: EXT_mesh_primitive_restart → hasVectorTiles=true', () => {
    const ts = {
      asset: { version: '2.1' },
      extensionsUsed: ['EXT_mesh_primitive_restart'],
    };
    const r = loader.classifyTileset(ts);
    assert.equal(r.hasVectorTiles, true);
  });

  // ============ Group E: 3D Tiles 2.0 Gaussian splat ============
  await ok('E1: KHR_gaussian_splatting → hasGaussianSplat=true', () => {
    const ts = {
      asset: { version: '2.1' },
      extensionsUsed: ['KHR_gaussian_splatting'],
    };
    const r = loader.classifyTileset(ts);
    assert.equal(r.hasGaussianSplat, true);
  });
  await ok('E2: KHR_gaussian_splatting_compression_spz → hasGaussianSplat=true', () => {
    const ts = {
      asset: { version: '2.1' },
      extensionsUsed: ['KHR_gaussian_splatting_compression_spz'],
    };
    const r = loader.classifyTileset(ts);
    assert.equal(r.hasGaussianSplat, true);
  });

  // ============ Group F: Voxel ============
  await ok('F1: EXT_voxel → hasVoxel=true', () => {
    const ts = {
      asset: { version: '2.1' },
      extensionsUsed: ['EXT_voxel'],
    };
    const r = loader.classifyTileset(ts);
    assert.equal(r.hasVoxel, true);
  });

  // ============ Group G: chooseRenderMode ============
  await ok('G1: 普通 1.x → legacy', () => {
    assert.equal(loader.chooseRenderMode(loader.classifyTileset({ root: { boundingVolume: {} } })), 'legacy');
  });
  await ok('G2: 仅 vector → vector-tiles', () => {
    const ts = { asset: { version: '2.1' }, extensionsUsed: ['EXT_mesh_polygon'] };
    assert.equal(loader.chooseRenderMode(loader.classifyTileset(ts)), 'vector-tiles');
  });
  await ok('G3: 仅 gaussian → gaussian-splat', () => {
    const ts = { asset: { version: '2.1' }, extensionsUsed: ['KHR_gaussian_splatting'] };
    assert.equal(loader.chooseRenderMode(loader.classifyTileset(ts)), 'gaussian-splat');
  });
  await ok('G4: vector + gaussian → hybrid', () => {
    const ts = {
      asset: { version: '2.1' },
      extensionsUsed: ['EXT_mesh_polygon', 'KHR_gaussian_splatting'],
    };
    assert.equal(loader.chooseRenderMode(loader.classifyTileset(ts)), 'hybrid');
  });
  await ok('G5: null cls → legacy', () => {
    assert.equal(loader.chooseRenderMode(null), 'legacy');
  });

  // ============ Group H: isFeatureSupported ============
  await ok('H1: gaussian-splat 仅 2.1 支持', () => {
    assert.equal(loader.isFeatureSupported('gaussian-splat', '2.1'), true);
    assert.equal(loader.isFeatureSupported('gaussian-splat', '2.0'), false);
  });
  await ok('H2: vector-tiles 仅 2.1 支持', () => {
    assert.equal(loader.isFeatureSupported('vector-tiles', '2.1'), true);
    assert.equal(loader.isFeatureSupported('vector-tiles', '2.0'), false);
  });
  await ok('H3: voxel 仅 2.1 支持', () => {
    assert.equal(loader.isFeatureSupported('voxel', '2.1'), true);
    assert.equal(loader.isFeatureSupported('voxel', '2.0'), false);
  });
  await ok('H4: 未知 feature → false', () => {
    assert.equal(loader.isFeatureSupported('foo-bar', '2.1'), false);
  });

  // ============ Group I: isTileset2x ============
  await ok('I1: 2.1 cls → true', () => {
    const ts = { asset: { version: '2.1' }, extensionsUsed: ['EXT_mesh_polygon'] };
    assert.equal(loader.isTileset2x(loader.classifyTileset(ts)), true);
  });
  await ok('I2: 1.x cls → false', () => {
    assert.equal(loader.isTileset2x(loader.classifyTileset({ root: {} })), false);
  });

  // ============ Group J: extensionsUsed 类型守卫 ============
  await ok('J1: extensionsUsed 非数组 → 空', () => {
    const r = loader.classifyTileset({ root: {}, extensionsUsed: 'bad' });
    assert.deepEqual(r.extensionsUsed, []);
  });
  await ok('J2: extensionsUsed 含非字符串 → 过滤', () => {
    const r = loader.classifyTileset({ root: {}, extensionsUsed: ['EXT_x', 123, null, 'KHR_y'] });
    assert.deepEqual(r.extensionsUsed, ['EXT_x', 'KHR_y']);
  });

  // ============ Group K: gltfVersion fallback ============
  await ok('K1: 缺 asset 但有 gaussian ext → 推断 2.1', () => {
    const r = loader.classifyTileset({
      root: {},
      extensionsUsed: ['KHR_gaussian_splatting'],
    });
    assert.equal(r.gltfVersion, '2.1');
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});