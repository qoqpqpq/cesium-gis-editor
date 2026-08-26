// 吸附工具 — 共享给 useDrawing / useVertexEdit
// 顶点吸附：扫 editor DS 全部 entity 的顶点，screen 距离 < tolPx 时返回最近
// 边吸附：扫 polyline / polygon 边，screen 距离 < tolPx 时返回最近点的 terrain Cartesian
// 排除调用方自身的 featureId（避免自吸附干扰）

import * as Cesium from 'cesium';

const DEFAULT_TOL = 12;

function getEditorDs(api) {
  if (!api || !api.getEditorDataSource) return null;
  try { return api.getEditorDataSource(); } catch (_) { return null; }
}

function readEntityPositions(ent) {
  const positions = [];
  if (ent.position) {
    const c = ent.position.getValue ? ent.position.getValue() : ent.position;
    if (c) positions.push(c);
  }
  if (ent.polyline && ent.polyline.positions) {
    const p = ent.polyline.positions.getValue
      ? ent.polyline.positions.getValue()
      : ent.polyline.positions;
    if (p && p.length) positions.push(...p);
  }
  if (ent.polygon && ent.polygon.hierarchy) {
    const h = ent.polygon.hierarchy.getValue
      ? ent.polygon.hierarchy.getValue()
      : ent.polygon.hierarchy;
    if (h && h.positions && h.positions.length) positions.push(...h.positions);
  }
  return positions;
}

function readEntitySegments(ent) {
  // 返回 [[Cartesian3, Cartesian3], ...] 用于边吸附
  const segs = [];
  if (ent.polyline && ent.polyline.positions) {
    const p = ent.polyline.positions.getValue
      ? ent.polyline.positions.getValue()
      : ent.polyline.positions;
    if (p && p.length >= 2) {
      for (let i = 0; i < p.length - 1; i++) segs.push([p[i], p[i + 1]]);
    }
  }
  if (ent.polygon && ent.polygon.hierarchy) {
    const h = ent.polygon.hierarchy.getValue
      ? ent.polygon.hierarchy.getValue()
      : ent.polygon.hierarchy;
    const ring = h && h.positions;
    if (ring && ring.length >= 3) {
      for (let i = 0; i < ring.length - 1; i++) segs.push([ring[i], ring[i + 1]]);
    }
  }
  return segs;
}

function getFid(ent) {
  if (!ent || !ent.properties) return null;
  const p = ent.properties;
  if (p.featureId && p.featureId.getValue) return p.featureId.getValue();
  return p.featureId;
}

// 顶点吸附：target = Cartographic？返回 Cartesian3 | target
// caller 传 {lng, lat} 或 {lng, lat, height}，未命中时返回 null
export function snapToVertex(viewer, targetCart, excludeFid, tolPx = DEFAULT_TOL) {
  const ds = viewer && viewer._editorDsRef ? null : null; // 不通过 ref
  // 走 caller 提供的 api（外部传入）
  if (!viewer || !targetCart) return null;
  const v = viewer;
  // 取 screen 坐标
  const tScreen = v.scene.cartesianToCanvasCoordinates(targetCart);
  if (!tScreen) return null;
  // 找最近的 vertex：扫描所有 entity（通过 scene 的 primitives 不易，加一个回调入口）
  // 调用方负责提供 candidates（v.scene.pick 不会 pick 到 vertex 圆点）
  // 改：在 snapAll 里统一处理。这里只做"已知顶点集 + target cartesian → 最近 vertex"
  return null; // 占位：实际逻辑在 snapAll 里
}

// 内部 helper：扫 caller 给的 entity 集合
function _scanVertices(viewer, ds, excludeFid, tCart, tScreen, tolPx) {
  let bestPx = tolPx;
  let best = null;
  if (!ds || !ds.entities) return null;
  ds.entities.values.forEach((ent) => {
    const fid = getFid(ent);
    if (fid === excludeFid || fid === '__draft__' || fid === '__measurement__') return;
    const positions = readEntityPositions(ent);
    positions.forEach((p) => {
      const s = viewer.scene.cartesianToCanvasCoordinates(p);
      if (!s) return;
      const dx = s.x - tScreen.x;
      const dy = s.y - tScreen.y;
      const px = Math.sqrt(dx * dx + dy * dy);
      if (px < bestPx) {
        bestPx = px;
        best = p;
      }
    });
  });
  return best;
}

function _scanEdges(viewer, ds, excludeFid, tCart, tScreen, tolPx) {
  let bestPx = tolPx;
  let best = null;
  if (!ds || !ds.entities) return null;
  ds.entities.values.forEach((ent) => {
    const fid = getFid(ent);
    if (fid === excludeFid || fid === '__draft__' || fid === '__measurement__') return;
    const segs = readEntitySegments(ent);
    segs.forEach(([a, b]) => {
      const sa = viewer.scene.cartesianToCanvasCoordinates(a);
      const sb = viewer.scene.cartesianToCanvasCoordinates(b);
      if (!sa || !sb) return;
      // 点到线段 2D 距离 + 最近点
      const ax = sa.x, ay = sa.y, bx = sb.x, by = sb.y;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-6) return;
      const t = Math.max(0, Math.min(1, ((tScreen.x - ax) * dx + (tScreen.y - ay) * dy) / len2));
      const px = ax + t * dx, py = ay + t * dy;
      const ddx = tScreen.x - px, ddy = tScreen.y - py;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dist < bestPx) {
        bestPx = dist;
        // 返回该 t 对应的实际 Cartesian（在 a 和 b 之间线性插值）
        const Cart = a.constructor;
        best = new Cart(
          a.x + (b.x - a.x) * t,
          a.y + (b.y - a.y) * t,
          a.z + (b.z - a.z) * t
        );
      }
    });
  });
  return best;
}

// 统一入口
// settings = { vertex: bool, edge: bool, tolPx?: number }
// 返回吸附后的 Cartesian3（vertex 命中优先于 edge），无命中返回 null
export function snapAll(api, targetCart, excludeFid, settings = {}) {
  if (!api || !targetCart) return null;
  const v = api.getViewer && api.getViewer();
  if (!v || !v.scene) return null;
  const ds = getEditorDs(api);
  if (!ds) return null;
  const tScreen = v.scene.cartesianToCanvasCoordinates(targetCart);
  if (!tScreen) return null;
  const tolPx = settings.tolPx || DEFAULT_TOL;

  if (settings.vertex !== false) {
    const hit = _scanVertices(v, ds, excludeFid, targetCart, tScreen, tolPx);
    if (hit) return hit;
  }
  if (settings.edge) {
    const hit = _scanEdges(v, ds, excludeFid, targetCart, tScreen, tolPx);
    if (hit) return hit;
  }
  return null;
}

// 给定笛卡尔坐标，在屏幕 tolPx 范围内找最近 vertex（用 scene 投屏）
// 不需要 api；caller 传 viewer + entity 集合
export function snapVertexToCart(viewer, ds, targetCart, excludeFid, tolPx = DEFAULT_TOL) {
  if (!viewer || !ds || !targetCart) return null;
  const tScreen = viewer.scene.cartesianToCanvasCoordinates(targetCart);
  if (!tScreen) return null;
  return _scanVertices(viewer, ds, excludeFid, targetCart, tScreen, tolPx);
}