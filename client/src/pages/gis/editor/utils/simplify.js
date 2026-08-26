// Douglas-Peucker 几何简化
// 经典迭代实现（避免深递归）+ epsilon 自适应（按度，~5m @ 赤道）
// 多边形特殊处理：DP 前先剥离首尾闭合、跑 DP、最后补回首点

import * as Cesium from 'cesium';

// 工具：两经纬度点之间的近似平面距离（赤道附近合理）
// 为简化，仅做经纬度 2D 距离平方（DP 只比较大小，比例正确）
function distSqDeg(a, b) {
  const dl = a[0] - b[0];
  const dt = a[1] - b[1];
  return dl * dl + dt * dt;
}

// 点到线段垂直距离的平方（经纬度 2D）
function pointSegDistSqDeg(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-18) return distSqDeg(p, a);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = a[0] + t * dx;
  const py = a[1] + t * dy;
  const ddx = p[0] - px;
  const ddy = p[1] - py;
  return ddx * ddx + ddy * ddy;
}

// 迭代版 Douglas-Peucker
// coords: [[lng, lat], ...]（height 忽略）
// 返回保留的 idx 数组（子集，保留顺序）
function dpIndices(coords, epsilonDeg) {
  const n = coords.length;
  if (n < 3) return coords.map((_, i) => i);
  const eps2 = epsilonDeg * epsilonDeg;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  // 用 stack 模拟递归
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let maxDist = 0;
    let maxIdx = -1;
    for (let i = start + 1; i < end; i++) {
      const d = pointSegDistSqDeg(coords[i], coords[start], coords[end]);
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    if (maxDist > eps2 && maxIdx !== -1) {
      keep[maxIdx] = 1;
      stack.push([start, maxIdx]);
      stack.push([maxIdx, end]);
    }
  }
  const result = [];
  for (let i = 0; i < n; i++) if (keep[i]) result.push(i);
  return result;
}

// 折线简化：cartesian3[] → 简化后的 cartesian3[]
export function simplifyPolyline(positions, epsilonDeg) {
  if (!positions || positions.length < 3) return positions ? positions.slice() : [];
  const coords = positions.map((c) => {
    const r = Cesium.Cartographic.fromCartesian(c);
    return [r.longitude, r.latitude];
  });
  const keep = dpIndices(coords, epsilonDeg);
  return keep.map((i) => positions[i]);
}

// 多边形简化：保留首尾闭合
export function simplifyPolygon(positions, epsilonDeg) {
  if (!positions || positions.length < 4) return positions ? positions.slice() : [];
  // 检测是否闭合（首末 Cartesian3 相同）
  const first = positions[0];
  const last = positions[positions.length - 1];
  const isClosed = Cesium.Cartesian3.equals(first, last);
  const ring = isClosed ? positions.slice(0, -1) : positions.slice();
  if (ring.length < 3) return positions.slice();
  const coords = ring.map((c) => {
    const r = Cesium.Cartographic.fromCartesian(c);
    return [r.longitude, r.latitude];
  });
  const keep = dpIndices(coords, epsilonDeg);
  const simplified = keep.map((i) => ring[i]);
  if (isClosed) simplified.push(Cesium.Cartesian3.clone(simplified[0]));
  return simplified;
}

// 统一入口
export function simplifyPositions(kind, positions, epsilonDeg) {
  if (kind === 'polygon' || kind === 'rect' || kind === 'circle') {
    return simplifyPolygon(positions, epsilonDeg);
  }
  return simplifyPolyline(positions, epsilonDeg);
}
