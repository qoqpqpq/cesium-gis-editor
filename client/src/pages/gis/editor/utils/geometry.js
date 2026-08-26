// 编辑器几何工具函数
// - 纯函数为主，便于测试和命令模式 do/undo 复用
// - 角度 → 经纬度 / Cartesian3 ↔ Cartographic 全部用 Cesium 内置

import * as Cesium from 'cesium';

// 生成稳定的 featureId
let _fidCounter = 0;
export function newFeatureId(prefix = 'f') {
  _fidCounter++;
  return `${prefix}_${Date.now().toString(36)}_${_fidCounter}`;
}

// Cartesian3[] → [lon, lat, h][]（便于序列化）
export function cartesiansToLngLatHeights(positions) {
  return positions.map((c) => {
    const carto = Cesium.Cartographic.fromCartesian(c);
    return [
      Cesium.Math.toDegrees(carto.longitude),
      Cesium.Math.toDegrees(carto.latitude),
      carto.height,
    ];
  });
}

// [lon, lat, h][] → Cartesian3[]
export function lngLatHeightsToCartesians(coords) {
  return coords.map(([lng, lat, h]) => Cesium.Cartesian3.fromDegrees(lng, lat, h || 0));
}

// 自由手绘抽稀：按 ~1m 间距保留点
export function resampleByDistance(positions, minDistMeters = 1) {
  if (!positions || positions.length < 2) return positions || [];
  const out = [positions[0]];
  for (let i = 1; i < positions.length; i++) {
    const d = Cesium.Cartesian3.distance(out[out.length - 1], positions[i]);
    if (d >= minDistMeters) out.push(positions[i]);
  }
  // 保证至少 2 个点
  if (out.length < 2 && positions.length >= 2) return [positions[0], positions[positions.length - 1]];
  return out;
}

// 圆心 + 半径（米） + 法向 → 圆周顶点（72 段）
export function circlePositions(centerCart, radiusMeters, segments = 72) {
  const carto = Cesium.Cartographic.fromCartesian(centerCart);
  const earthRadius = 6378137; // WGS84 semi-major axis
  const angularDist = radiusMeters / earthRadius;
  const lat0 = carto.latitude;
  const lng0 = carto.longitude;
  const out = [];
  for (let i = 0; i <= segments; i++) {
    const bearing = (i / segments) * 2 * Math.PI;
    const lat = Math.asin(
      Math.sin(lat0) * Math.cos(angularDist) +
      Math.cos(lat0) * Math.sin(angularDist) * Math.cos(bearing)
    );
    const lng = lng0 + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDist) * Math.cos(lat0),
      Math.cos(angularDist) - Math.sin(lat0) * Math.sin(lat)
    );
    out.push(Cesium.Cartesian3.fromRadians(lng, lat));
  }
  return out;
}

// 从两点（角点 1、角点 2）算矩形 4 顶点（返回顺序：角1 → 角2 东南 → 角2 → 角1 西南）
export function rectanglePositions(c1, c2) {
  const carto1 = Cesium.Cartographic.fromCartesian(c1);
  const carto2 = Cesium.Cartographic.fromCartesian(c2);
  const minLat = Math.min(carto1.latitude, carto2.latitude);
  const maxLat = Math.max(carto1.latitude, carto2.latitude);
  const minLng = Math.min(carto1.longitude, carto2.longitude);
  const maxLng = Math.max(carto1.longitude, carto2.longitude);
  return [
    Cesium.Cartesian3.fromRadians(minLng, minLat),
    Cesium.Cartesian3.fromRadians(maxLng, minLat),
    Cesium.Cartesian3.fromRadians(maxLng, maxLat),
    Cesium.Cartesian3.fromRadians(minLng, maxLat),
    Cesium.Cartesian3.fromRadians(minLng, minLat),
  ];
}

// 折线总长度（米）
export function polylineLengthMeters(positions) {
  if (!positions || positions.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < positions.length; i++) {
    total += Cesium.Cartesian3.distance(positions[i - 1], positions[i]);
  }
  return total;
}

// 多边形面积（m²，简化球面计算；用 Cesium 内置 EllipseGeometry 工具更好但开销大）
// 足够给用户读数用。精度 ~ 0.1% 量级。
export function polygonAreaM2(positions) {
  if (!positions || positions.length < 3) return 0;
  const radius = 6378137;
  let area = 0;
  for (let i = 0; i < positions.length; i++) {
    const p1 = Cesium.Cartographic.fromCartesian(positions[i]);
    const p2 = Cesium.Cartographic.fromCartesian(positions[(i + 1) % positions.length]);
    area += ((p2.longitude - p1.longitude) * (2 + Math.sin(p1.latitude) + Math.sin(p2.latitude)));
  }
  area = Math.abs(area * radius * radius / 2);
  return area;
}