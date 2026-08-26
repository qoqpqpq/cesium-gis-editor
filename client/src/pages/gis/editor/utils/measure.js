// 测量工具 — 数学 + 格式化
// - 复用 geometry.js 的 polylineLengthMeters / polygonAreaM2
// - pathLength3DMeters: 水平 + 垂直累加
// - sampleGroundHeight: scene.sampleHeight，失败回退椭球面
// - formatDistance / formatArea: 自适应单位

import * as Cesium from 'cesium';
import { polylineLengthMeters, polygonAreaM2 } from './geometry.js';

// 3D 路径长度：每段 3D 距离累加（包含垂直分量）
export function pathLength3DMeters(positions) {
  if (!positions || positions.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < positions.length; i++) {
    const a = positions[i - 1];
    const b = positions[i];
    total += Cesium.Cartesian3.distance(a, b);
  }
  return total;
}

// 真实地形高度采样（采样失败回退椭球面）
export function sampleGroundHeight(viewer, carto) {
  if (!viewer || !carto) return null;
  try {
    if (viewer.scene && typeof viewer.scene.sampleHeight === 'function') {
      const h = viewer.scene.sampleHeight(carto);
      if (Number.isFinite(h)) return h;
    }
  } catch (_) {}
  return carto.height || 0;
}

// 自适应距离格式化
export function formatDistance(m) {
  if (!Number.isFinite(m)) return '—';
  const abs = Math.abs(m);
  if (abs >= 1_000_000) return (m / 1_000_000).toFixed(2) + ' Mm';
  if (abs >= 10_000)    return (m / 1_000).toFixed(2) + ' km';
  if (abs >= 1_000)     return (m / 1_000).toFixed(3) + ' km';
  if (abs >= 1)         return m.toFixed(1) + ' m';
  if (abs >= 0.001)     return (m * 100).toFixed(1) + ' cm';
  return (m * 1000).toFixed(1) + ' mm';
}

// 自适应面积格式化（≥1e4 m² 用 ha）
export function formatArea(m2) {
  if (!Number.isFinite(m2)) return '—';
  const abs = Math.abs(m2);
  if (abs >= 1_000_000_000) return (m2 / 1_000_000_000).toFixed(2) + ' km²';
  if (abs >= 10_000)        return (m2 / 10_000).toFixed(3) + ' ha';
  if (abs >= 1)             return m2.toFixed(1) + ' m²';
  return (m2 * 10000).toFixed(1) + ' cm²';
}

export { polylineLengthMeters, polygonAreaM2 };