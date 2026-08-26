// analysis — 空间分析适配层
// 在 entity (CallbackProperty over Cartesian3[]) 与 turf Feature 之间转换；
// 长度/面积复用 geometry.js 已实现的函数（与 measure 工具数字一致）。
//
// 布尔运算（intersect/union/difference/dissolve）走 turf v7 API，底层是 polyclip-ts
// （Martinez-Rueda + snap rounding），自身会归一化 ring 绕向，无需 rewind。
// 注意 turf v7 的签名是 fn(FeatureCollection)，不是 v6 的 fn(featA, featB)。
//
// 服务端模式（runOpServer）：intersect / difference 走 /api/spatial/*，
// 行为与客户端 turf 完全一致（同版本号），输出 snaps 与本地 runOp 同型。

import * as turf from '@turf/turf';
import { spatialApi } from '../../../../api/index.js';
import {
  cartesiansToLngLatHeights,
  lngLatHeightsToCartesians,
  newFeatureId,
  polylineLengthMeters,
  polygonAreaM2,
} from './geometry.js';

// 把单个 entity → turf Feature（只保留几何，丢弃属性）
export function entityToTurfFeature(entity) {
  const props = entity.properties;
  if (!props) return null;
  const get = (k) => (props[k] && props[k].getValue ? props[k].getValue() : props[k]);
  const kind = get('kind');
  const geo = entityGeometryToGeoJSON(entity, kind);
  if (!geo) return null;
  return turf.feature(geo);
}

// entity → GeoJSON geometry
function entityGeometryToGeoJSON(entity, kind) {
  if (kind === 'point' && entity.position) {
    const c = entity.position.getValue ? entity.position.getValue() : entity.position;
    if (!c) return null;
    const ll = cartesiansToLngLatHeights([c])[0];
    return { type: 'Point', coordinates: ll };
  }
  if (entity.polyline && entity.polyline.positions) {
    const p = entity.polyline.positions.getValue
      ? entity.polyline.positions.getValue() : entity.polyline.positions;
    if (!p || !p.length) return null;
    const llh = cartesiansToLngLatHeights(p);
    return { type: 'LineString', coordinates: llh };
  }
  if (entity.polygon && entity.polygon.hierarchy) {
    const h = entity.polygon.hierarchy.getValue
      ? entity.polygon.hierarchy.getValue() : entity.polygon.hierarchy;
    const ring = (h && h.positions) || [];
    if (ring.length < 3) return null;
    const llh = cartesiansToLngLatHeights(ring);
    // 强制闭合
    const f = llh[0], l = llh[llh.length - 1];
    if (f[0] !== l[0] || f[1] !== l[1]) llh.push([...f]);
    return { type: 'Polygon', coordinates: [llh] };
  }
  return null;
}

// turf geometry → entity 创建所需的 {kind, positions, style, ...}
// 仅支持 Polygon / MultiPolygon / LineString / Point
// holes（内环）暂不支持，对分析结果影响不大
export function turfGeomToPositions(geom) {
  if (!geom || !geom.type) return null;
  // 取多边形的外环坐标（忽略 holes）
  const getOuterRing = (poly) => {
    const ring = poly.coordinates[0];
    if (!ring || !ring.length) return [];
    return lngLatHeightsToCartesians(ring);
  };
  if (geom.type === 'Polygon') {
    return { kind: 'polygon', positions: getOuterRing(geom) };
  }
  if (geom.type === 'MultiPolygon') {
    return geom.coordinates.map((poly) => ({
      kind: 'polygon',
      positions: getOuterRing({ coordinates: poly }),
    }));
  }
  if (geom.type === 'LineString') {
    return { kind: 'polyline', positions: lngLatHeightsToCartesians(geom.coordinates) };
  }
  if (geom.type === 'MultiLineString') {
    return geom.coordinates.map((line) => ({
      kind: 'polyline',
      positions: lngLatHeightsToCartesians(line),
    }));
  }
  if (geom.type === 'Point') {
    return { kind: 'point', positions: lngLatHeightsToCartesians([geom.coordinates]) };
  }
  if (geom.type === 'MultiPoint') {
    return geom.coordinates.map((c) => ({
      kind: 'point',
      positions: lngLatHeightsToCartesians([c]),
    }));
  }
  return null;
}

const BOOLEAN_OPS = ['intersect', 'union', 'difference', 'dissolve'];

export function isBooleanOp(op) {
  return BOOLEAN_OPS.includes(op);
}

// 顶级入口：跑某操作，返回 { snaps, error }
// snaps 里每条 = 可直接交给 rebuildFromSnapshot 的对象；error 为人类可读的失败原因
// op: 'buffer' | 'intersect' | 'union' | 'difference' | 'dissolve' | 'centroid' | 'convexHull'
// params: { distance } for buffer
export function runOp(op, sourceEntities, params = {}) {
  const opResults = []; // 收集 turf features
  let error = null;

  if (op === 'buffer') {
    const dist = Number(params.distance ?? 0);
    if (!Number.isFinite(dist)) return { snaps: [], error: '缓冲距离不是有效数字' };
    sourceEntities.forEach((e) => {
      try {
        const feat = entityToTurfFeature(e);
        if (!feat) return;
        const buf = turf.buffer(feat, dist, { units: 'meters' });
        if (buf) opResults.push(buf);
      } catch (e2) {
        console.warn('[analysis] buffer failed for one source', e2.message);
      }
    });
    if (!opResults.length) error = '缓冲区运算未产生结果';
  } else if (isBooleanOp(op)) {
    const polys = sourceEntities
      .map(entityToTurfFeature)
      .filter((f) => f && f.geometry
        && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));
    if (polys.length < 2) {
      return { snaps: [], error: `需要至少 2 个多边形（当前 ${polys.length} 个）` };
    }
    const fc = turf.featureCollection(polys);
    let res = null;
    try {
      if (op === 'intersect') res = turf.intersect(fc);
      else if (op === 'difference') res = turf.difference(fc);
      else res = turf.union(fc); // union / dissolve
    } catch (e) {
      return { snaps: [], error: `运算失败：${e.message}` };
    }
    if (!res) {
      return {
        snaps: [],
        error: op === 'intersect' ? '所选要素没有公共区域' : '运算结果为空',
      };
    }
    opResults.push(res);
  } else if (op === 'centroid') {
    sourceEntities.forEach((e) => {
      try {
        const feat = entityToTurfFeature(e);
        if (!feat) return;
        const c = turf.centroid(feat);
        if (c) opResults.push(c);
      } catch (e2) {
        console.warn('[analysis] centroid failed', e2.message);
      }
    });
    if (!opResults.length) error = '未能计算质心';
  } else if (op === 'convexHull') {
    try {
      const all = sourceEntities.reduce((acc, e) => {
        const feat = entityToTurfFeature(e);
        if (!feat) return acc;
        const coords = turf.coordAll(feat);
        if (coords.length) acc.push(...coords);
        return acc;
      }, []);
      if (all.length < 3) return { snaps: [], error: `凸包需要至少 3 个端点（当前 ${all.length} 个）` };
      const fc = turf.featureCollection(all.map((c) => turf.point(c)));
      const hull = turf.convex(fc);
      if (hull) opResults.push(hull);
      else error = '凸包运算未产生结果';
    } catch (e) {
      return { snaps: [], error: `凸包运算失败：${e.message}` };
    }
  } else {
    return { snaps: [], error: `未知操作：${op}` };
  }

  // 把 turf 输出拍平为 snap 列表
  const snaps = [];
  opResults.forEach((feat) => {
    if (!feat || !feat.geometry) return;
    const part = turfGeomToPositions(feat.geometry);
    if (!part) return;
    if (Array.isArray(part)) {
      part.forEach((p) => {
        if (p && p.positions && p.positions.length) snaps.push(makeSnap(p, op));
      });
    } else if (part.positions && part.positions.length) {
      snaps.push(makeSnap(part, op));
    }
  });

  if (!snaps.length && !error) error = '操作未产生结果';
  return { snaps, error: snaps.length ? null : error };
}

function makeSnap(part, op) {
  return {
    featureId: newFeatureId(part.kind),
    kind: part.kind,
    layerId: 'default', // 落入默认图层以便在 LayersTree 可见
    name: `${op}_${Date.now().toString(36).slice(-4)}`,
    positions: part.positions,
    style: {
      pointSize: 10,
      pointColor: '#fbbf24',
      strokeColor: '#06b6d4',
      strokeWidth: 2,
      fillColor: 'rgba(6, 182, 212, 0.35)',
    },
    attrs: { _op: op, _analysis: true },
  };
}

// 把选中的 entity 拆成 {layerA, layerB}：首个多边形为 A，其余合并为 B。
// - 与 runOp 在 intersect 上的语义完全一致（turf.intersect(FC) 与 turf.intersect(FC(A, rest)) 同结果）
// - 与 runOp 在 difference 上的语义完全一致（turf.difference(FC) = first - union(rest)）
function entitiesToLayerPair(entities) {
  const polys = entities
    .map(entityToTurfFeature)
    .filter((f) => f && f.geometry
      && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));
  if (polys.length < 2) return null;
  return {
    layerA: polys[0],
    layerB: polys.length === 2 ? polys[1] : turf.featureCollection(polys.slice(1)),
  };
}

// 把服务端的 FeatureCollection / Feature 结果拍平为 snaps（与 runOp 输出同型）
function featureCollectionToSnaps(fc, op) {
  const snaps = [];
  if (!fc) return snaps;
  const features = fc.type === 'FeatureCollection' ? fc.features : [fc];
  features.forEach((feat) => {
    if (!feat || !feat.geometry) return;
    const part = turfGeomToPositions(feat.geometry);
    if (!part) return;
    if (Array.isArray(part)) {
      part.forEach((p) => {
        if (p && p.positions && p.positions.length) snaps.push(makeSnap(p, op));
      });
    } else if (part.positions && part.positions.length) {
      snaps.push(makeSnap(part, op));
    }
  });
  return snaps;
}

// 服务端空间分析入口：镜像客户端 7 个 op
// 返回 Promise<{snaps, error}>
// 单 layer：buffer / centroid / convexHull
// 双 layer：intersect / difference / union / dissolve
export async function runOpServer(op, sourceEntities, params = {}) {
  // 单 layer op：要求 ≥ 1 个任意几何要素（buffer/centroid/convexHull 都至少 1 个）
  if (SINGLE_LAYER_OPS.has(op)) {
    const feats = sourceEntities
      .map(entityToTurfFeature)
      .filter(Boolean);
    if (!feats.length) {
      return { snaps: [], error: '需要至少 1 个要素' };
    }
    const layer = turf.featureCollection(feats);
    try {
      const res = op === 'buffer'
        ? await spatialApi.buffer(layer, params.distance)
        : await spatialApi[op](layer);
      if (!res?.success) {
        return { snaps: [], error: res?.message || `服务端 ${op} 失败` };
      }
      const snaps = featureCollectionToSnaps(res.data, op);
      if (!snaps.length) {
        return { snaps: [], error: op === 'centroid' ? '未能计算质心' : '运算结果为空' };
      }
      return { snaps, error: null };
    } catch (e) {
      return { snaps: [], error: e?.message || `服务端 ${op} 调用失败` };
    }
  }

  // 双 layer op：要求 ≥ 2 个多边形
  if (DOUBLE_LAYER_OPS.has(op)) {
    const pair = entitiesToLayerPair(sourceEntities);
    if (!pair) {
      return { snaps: [], error: '需要至少 2 个多边形（当前 < 2 个）' };
    }
    try {
      const res = op === 'dissolve'
        ? await spatialApi.dissolve(pair.layerA, pair.layerB, params.groupBy)
        : await spatialApi[op](pair.layerA, pair.layerB);
      if (!res?.success) {
        return { snaps: [], error: res?.message || `服务端 ${op} 失败` };
      }
      const snaps = featureCollectionToSnaps(res.data, op);
      if (!snaps.length) {
        return {
          snaps: [],
          error: op === 'intersect' ? '所选要素没有公共区域' : '运算结果为空',
        };
      }
      return { snaps, error: null };
    } catch (e) {
      return { snaps: [], error: e?.message || `服务端 ${op} 调用失败` };
    }
  }

  return { snaps: [], error: `服务端不支持 ${op}` };
}

// 单 layer op：buffer / centroid / convexHull
export const SINGLE_LAYER_OPS = new Set(['buffer', 'centroid', 'convexHull']);
// 双 layer op：intersect / difference / union / dissolve
export const DOUBLE_LAYER_OPS = new Set(['intersect', 'difference', 'union', 'dissolve']);

// 直接计算（不创建 entity）：返回数值或 null
export function measureOp(op, sourceEntities) {
  const sources = sourceEntities.map(entityToTurfFeature).filter(Boolean);
  if (!sources.length) return null;
  if (op === 'area') {
    let total = 0;
    sources.forEach((f) => {
      if (f.geometry && f.geometry.type === 'Polygon') {
        try {
          total += turf.area(f);
        } catch (e) {}
      }
    });
    return { value: total, unit: 'm²' };
  }
  if (op === 'length') {
    let total = 0;
    sources.forEach((f) => {
      if (f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')) {
        try {
          total += turf.length(f, { units: 'meters' });
        } catch (e) {}
      }
    });
    return { value: total, unit: 'm' };
  }
  if (op === 'count') {
    return { value: sources.length, unit: '个' };
  }
  return null;
}

// 兼容 measure 工具
export function localMeasure(kind, positions) {
  if (kind === 'polygon' || kind === 'rect' || kind === 'circle') {
    return { value: polygonAreaM2(positions), unit: 'm²' };
  }
  if (kind === 'polyline' || kind === 'freehand') {
    return { value: polylineLengthMeters(positions), unit: 'm' };
  }
  return null;
}
