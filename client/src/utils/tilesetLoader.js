// client/src/utils/tilesetLoader.js
// 周期 12 P1-4: 3D Tiles 2.0 vector tiles + Gaussian splat 兼容层
//
// 背景：
//   - 周期 10 P2-1 已落 docs/evaluation/webgpu-3d-tiles.md（决定不切换 backend）
//   - 周期 11 P1-3 已落 docs/evaluation/3d-tiles-2-followup.md（vector + Gaussian + voxel）
//   - 周期 11 调研 Top5 #5: Cesium 官方 2026-09 vector tiles preview + 2026-04 Gaussian splat HLOD
//
// 设计：
//   - classifyTileset(tilesetJson)：根据 extensionsUsed / extensionsRequired / asset.gltfUp-axis
//     输出 { is3dTiles, hasVectorTiles, hasGaussianSplat, hasVoxel, gltfVersion }
//   - chooseRenderMode(cls)：根据分类返回渲染模式
//     - 'legacy'：仅 1.x 标准 3D Tiles
//     - 'vector-tiles'：2.0 vector tiles
//     - 'gaussian-splat'：2.0 Gaussian splat
//     - 'hybrid'：同时含 vector + Gaussian
//   - isFeatureSupported(feature, gltfVersion)：客户端能力探测
//
// 验收（spec ≥25 PASS）：
//   - 5 种典型 tileset.json 正确分类
//   - 缺失字段 graceful fallback 到 'legacy'
//   - glTF 2.1 优先于 2.0
//   - hybrid mode 边界正确

'use strict';

const KNOWN_GAUSSIAN_EXTS = [
  'KHR_gaussian_splatting',
  'KHR_gaussian_splatting_compression_spz',
  'EXT_gaussian_splatting',
];

const KNOWN_VECTOR_EXTS = [
  'EXT_mesh_polygon',
  'EXT_mesh_primitive_restart',
  'EXT_mesh_primitive_edge_visibility',
  'BENTLEY_materials_line_style',
  'BENTLEY_materials_point_style',
];

const KNOWN_VOXEL_EXTS = [
  'EXT_voxel',
  'KHR_voxel',
];

const SUPPORTED_GLTF_VERSIONS = ['2.0', '2.1'];

/**
 * classifyTileset：解析 3D Tiles 1.x / 2.0 tileset.json
 * @param {object} tilesetJson
 * @returns {{
 *   is3dTiles: boolean,
 *   hasVectorTiles: boolean,
 *   hasGaussianSplat: boolean,
 *   hasVoxel: boolean,
 *   gltfVersion: string|null,
 *   extensionsUsed: string[],
 *   extensionsRequired: string[]
 * }}
 */
export function classifyTileset(tilesetJson) {
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
  // 必须有 root 字段（3D Tiles 1.x）或 asset 字段（2.0）
  if (!tilesetJson.root && !tilesetJson.asset) {
    return out;
  }
  out.is3dTiles = true;
  // 2.0: asset.version + asset.gltfUp-axis 等
  if (tilesetJson.asset && typeof tilesetJson.asset === 'object') {
    if (typeof tilesetJson.asset.gltfUpAxis === 'string') {
      out.gltfVersion = '2.0';
    }
    // 2.1 标记
    if (tilesetJson.asset.version === '2.1') {
      out.gltfVersion = '2.1';
    }
  }
  // 收集 extensionsUsed / extensionsRequired
  const used = Array.isArray(tilesetJson.extensionsUsed) ? tilesetJson.extensionsUsed : [];
  const required = Array.isArray(tilesetJson.extensionsRequired) ? tilesetJson.extensionsRequired : [];
  out.extensionsUsed = used.filter((x) => typeof x === 'string');
  out.extensionsRequired = required.filter((x) => typeof x === 'string');
  // 检测
  out.hasGaussianSplat = out.extensionsUsed.some((x) => KNOWN_GAUSSIAN_EXTS.includes(x));
  out.hasVectorTiles = out.extensionsUsed.some((x) => KNOWN_VECTOR_EXTS.includes(x));
  out.hasVoxel = out.extensionsUsed.some((x) => KNOWN_VOXEL_EXTS.includes(x));
  // gltfVersion fallback：若未在 asset 出现但 extensionsUsed 含 KHR_gaussian_splatting / EXT_mesh_polygon → 推断 2.1
  if (!out.gltfVersion) {
    if (out.hasGaussianSplat || out.hasVectorTiles) {
      out.gltfVersion = '2.1';
    } else {
      out.gltfVersion = '2.0';
    }
  }
  return out;
}

/**
 * chooseRenderMode：根据 classification 选渲染模式
 * @param {object} cls
 * @returns {'legacy'|'vector-tiles'|'gaussian-splat'|'hybrid'}
 */
export function chooseRenderMode(cls) {
  if (!cls || !cls.is3dTiles) return 'legacy';
  // 优先级：hybrid > gaussian > vector > legacy
  if (cls.hasGaussianSplat && cls.hasVectorTiles) return 'hybrid';
  if (cls.hasGaussianSplat) return 'gaussian-splat';
  if (cls.hasVectorTiles) return 'vector-tiles';
  return 'legacy';
}

/**
 * isFeatureSupported：检查当前 viewer 是否支持某 feature
 * @param {string} feature - 'gaussian-splat' | 'vector-tiles' | 'voxel'
 * @param {string} gltfVersion - '2.0' | '2.1'
 * @returns {boolean}
 */
export function isFeatureSupported(feature, gltfVersion) {
  if (!feature || typeof feature !== 'string') return false;
  const v = gltfVersion || '2.0';
  if (feature === 'gaussian-splat') return v === '2.1' && SUPPORTED_GLTF_VERSIONS.includes(v);
  if (feature === 'vector-tiles') return v === '2.1' && SUPPORTED_GLTF_VERSIONS.includes(v);
  if (feature === 'voxel') return v === '2.1';
  return false;
}

/**
 * 检测 tileset 是否是 2.0+（需要 glTF 2.1 / 新 extensions）
 */
export function isTileset2x(cls) {
  return !!(cls && cls.is3dTiles && cls.gltfVersion === '2.1');
}

export {
  KNOWN_GAUSSIAN_EXTS,
  KNOWN_VECTOR_EXTS,
  KNOWN_VOXEL_EXTS,
};

export default {
  classifyTileset,
  chooseRenderMode,
  isFeatureSupported,
  isTileset2x,
  KNOWN_GAUSSIAN_EXTS,
  KNOWN_VECTOR_EXTS,
  KNOWN_VOXEL_EXTS,
};