// tests/specs/cesium-splat-demo.cjs
// 周期 13 P2-1: CesiumJS Gaussian splat loader 单元测试
// 目标：≥ 15 子断言 PASS

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const url = require('node:url');

const loaderPath = url.pathToFileURL(path.join(__dirname, '../../client/src/utils/splatLoader.js')).href;

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
  console.log('=== cesium-splat-demo ===');

  const loader = await import(loaderPath);

  // ============ Group A: 模块导出 ============
  await ok('A1: classifySplatQuality 已导出', () => {
    assert.equal(typeof loader.classifySplatQuality, 'function');
  });
  await ok('A2: loadGaussianSplatTileset 已导出', () => {
    assert.equal(typeof loader.loadGaussianSplatTileset, 'function');
  });
  await ok('A3: getSplatLODConfig 已导出', () => {
    assert.equal(typeof loader.getSplatLODConfig, 'function');
  });
  await ok('A4: getRecommendedPreset 已导出', () => {
    assert.equal(typeof loader.getRecommendedPreset, 'function');
  });
  await ok('A5: SPLAT_QUALITY_PRESETS 数组', () => {
    assert.ok(Array.isArray(loader.SPLAT_QUALITY_PRESETS));
    assert.ok(loader.SPLAT_QUALITY_PRESETS.length === 5);
  });

  // ============ Group B: classifySplatQuality ============
  await ok('B1: SSE=32 → realtime', () => {
    const r = loader.classifySplatQuality(32);
    assert.equal(r.name, 'realtime');
    assert.equal(r.sse, 32);
  });
  await ok('B2: SSE=16 → balanced', () => {
    assert.equal(loader.classifySplatQuality(16).name, 'balanced');
  });
  await ok('B3: SSE=8 → quality', () => {
    assert.equal(loader.classifySplatQuality(8).name, 'quality');
  });
  await ok('B4: SSE=4 → high', () => {
    assert.equal(loader.classifySplatQuality(4).name, 'high');
  });
  await ok('B5: SSE=2 → ultra', () => {
    assert.equal(loader.classifySplatQuality(2).name, 'ultra');
  });
  await ok('B6: 无效 SSE → unknown', () => {
    assert.equal(loader.classifySplatQuality('bad').name, 'unknown');
    assert.equal(loader.classifySplatQuality(null).name, 'unknown');
    assert.equal(loader.classifySplatQuality(undefined).name, 'unknown');
  });
  await ok('B7: SSE=24 → realtime（closest）', () => {
    assert.equal(loader.classifySplatQuality(24).name, 'realtime');
  });
  await ok('B8: SSE=12 → balanced', () => {
    assert.equal(loader.classifySplatQuality(12).name, 'balanced');
  });

  // ============ Group C: loadGaussianSplatTileset ============
  await ok('C1: viewer 缺失抛错', async () => {
    await assert.rejects(loader.loadGaussianSplatTileset(null, 4547222), /viewer required/);
  });
  await ok('C2: assetId 非数字抛错', async () => {
    await assert.rejects(loader.loadGaussianSplatTileset({ scene: {} }, 'bad'), /assetId must be number/);
  });
  await ok('C3: 合法输入返回 tileset 对象', async () => {
    const viewer = { scene: {} };
    const t = await loader.loadGaussianSplatTileset(viewer, 4547222);
    assert.equal(t.assetId, 4547222);
    assert.equal(t._isSplat, true);
    assert.ok(t.quality);
  });
  await ok('C4: 默认 sse=16', async () => {
    const viewer = { scene: {} };
    const t = await loader.loadGaussianSplatTileset(viewer, 4547222);
    assert.equal(t.sse, 16);
  });
  await ok('C5: 自定义 sse', async () => {
    const viewer = { scene: {} };
    const t = await loader.loadGaussianSplatTileset(viewer, 4547222, { sse: 4 });
    assert.equal(t.sse, 4);
    assert.equal(t.quality.name, 'high');
  });

  // ============ Group D: getSplatLODConfig ============
  await ok('D1: viewer 无 _splatTileset → null', () => {
    assert.equal(loader.getSplatLODConfig({}), null);
    assert.equal(loader.getSplatLODConfig(null), null);
  });
  await ok('D2: viewer 有 _splatTileset → config', () => {
    const viewer = {
      _splatTileset: { maximumScreenSpaceError: 8 },
    };
    const cfg = loader.getSplatLODConfig(viewer);
    assert.equal(cfg.sse, 8);
    assert.equal(cfg.quality.name, 'quality');
  });

  // ============ Group E: getRecommendedPreset ============
  await ok('E1: 默认 30fps → quality（closest fps=30）', () => {
    assert.equal(loader.getRecommendedPreset(30).name, 'quality');
  });
  await ok('E2: 60fps → realtime（closest fps=60）', () => {
    assert.equal(loader.getRecommendedPreset(60).name, 'realtime');
  });
  await ok('E3: 20fps → high（closest fps=20）', () => {
    assert.equal(loader.getRecommendedPreset(20).name, 'high');
  });
  await ok('E4: 无效 fps → balanced default', () => {
    assert.equal(loader.getRecommendedPreset('bad').name, 'balanced');
    assert.equal(loader.getRecommendedPreset(-1).name, 'balanced');
  });
  await ok('E5: 45fps → balanced（closest fps=45）', () => {
    assert.equal(loader.getRecommendedPreset(45).name, 'balanced');
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});