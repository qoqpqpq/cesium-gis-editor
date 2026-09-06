// server/services/spatial.js
// 空间叠加运算：intersect / difference / union / dissolve
// 单 layer 运算：buffer / centroid / convexHull
// - 与客户端 editor/utils/analysis.js 用同一个 @turf/turf v7，行为一致
// - 无 IO、无状态、无持久化
// - 输入校验：geometry 类型、坐标有效性、环闭合性、要素 / 顶点数上限
// - 坐标精度截到 6 位小数，减少顶点负载
// - 与 polygon-clipping 的 cryptic 错误隔离，抛出友好 message

const turf = require('@turf/turf');

const MAX_FEATURES_PER_LAYER = 1000;
const MAX_TOTAL_VERTICES = 100000;
const COORD_PRECISION = 6;

// Polygon-only 的 op（boolean 叠加需要闭合面）
const POLYONLY_OPS = new Set(['intersect', 'difference', 'union', 'dissolve']);

function normalizeLayer(input) {
  if (!input || typeof input !== 'object') {
    throw httpError(400, '输入必须是合法的 GeoJSON Feature 或 FeatureCollection');
  }
  if (input.type === 'FeatureCollection') {
    if (!Array.isArray(input.features)) {
      throw httpError(400, 'FeatureCollection 必须有 features 数组');
    }
    return input.features;
  }
  if (input.type === 'Feature') {
    return [input];
  }
  throw httpError(400, '输入必须是 Feature 或 FeatureCollection');
}

function roundCoord(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw httpError(400, '坐标必须是有限数字（NaN/Infinity 拒绝）');
  }
  // 经纬度 1e-6 度 ≈ 0.11 米，足够 GIS 精度
  return Math.round(n * 1e6) / 1e6;
}

function normalizeRing(ring) {
  if (!Array.isArray(ring) || ring.length < 4) {
    throw httpError(400, '多边形环必须至少 4 个点（首尾闭合）');
  }
  const out = ring.map((pt) => {
    if (!Array.isArray(pt) || pt.length < 2) {
      throw httpError(400, '每个坐标点必须是 [lng, lat]（至少 2 个值）');
    }
    const [lng, lat] = pt;
    return [roundCoord(lng), roundCoord(lat)];
  });
  const first = out[0];
  const last = out[out.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    // 自动闭合，避免 turf 抛 cryptic "exterior ring not closed"
    out.push([first[0], first[1]]);
  }
  return out;
}

function normalizeGeometry(geom) {
  if (!geom || typeof geom !== 'object' || !geom.type) {
    throw httpError(400, '几何必须有 type 字段');
  }
  if (geom.type === 'Polygon') {
    if (!Array.isArray(geom.coordinates) || geom.coordinates.length === 0) {
      throw httpError(400, 'Polygon 缺少 coordinates');
    }
    const rings = geom.coordinates.map(normalizeRing);
    return { type: 'Polygon', coordinates: rings };
  }
  if (geom.type === 'MultiPolygon') {
    if (!Array.isArray(geom.coordinates) || geom.coordinates.length === 0) {
      throw httpError(400, 'MultiPolygon 缺少 coordinates');
    }
    const polygons = geom.coordinates.map((poly) => poly.map(normalizeRing));
    return { type: 'MultiPolygon', coordinates: polygons };
  }
  if (geom.type === 'Point') {
    if (!Array.isArray(geom.coordinates) || geom.coordinates.length < 2) {
      throw httpError(400, 'Point 缺少 coordinates');
    }
    const [lng, lat] = geom.coordinates;
    return {
      type: 'Point',
      coordinates: [roundCoord(lng), roundCoord(lat)],
    };
  }
  if (geom.type === 'MultiPoint') {
    if (!Array.isArray(geom.coordinates) || geom.coordinates.length === 0) {
      throw httpError(400, 'MultiPoint 缺少 coordinates');
    }
    const pts = geom.coordinates.map((c) => {
      if (!Array.isArray(c) || c.length < 2) {
        throw httpError(400, 'MultiPoint 坐标无效');
      }
      return [roundCoord(c[0]), roundCoord(c[1])];
    });
    return { type: 'MultiPoint', coordinates: pts };
  }
  if (geom.type === 'LineString') {
    if (!Array.isArray(geom.coordinates) || geom.coordinates.length < 2) {
      throw httpError(400, 'LineString 至少 2 个点');
    }
    const line = geom.coordinates.map((pt) => {
      if (!Array.isArray(pt) || pt.length < 2) {
        throw httpError(400, 'LineString 坐标无效');
      }
      return [roundCoord(pt[0]), roundCoord(pt[1])];
    });
    return { type: 'LineString', coordinates: line };
  }
  if (geom.type === 'MultiLineString') {
    if (!Array.isArray(geom.coordinates) || geom.coordinates.length === 0) {
      throw httpError(400, 'MultiLineString 缺少 coordinates');
    }
    const lines = geom.coordinates.map((line) => {
      if (!Array.isArray(line) || line.length < 2) {
        throw httpError(400, 'MultiLineString 子线至少 2 个点');
      }
      return line.map((pt) => {
        if (!Array.isArray(pt) || pt.length < 2) {
          throw httpError(400, 'MultiLineString 坐标无效');
        }
        return [roundCoord(pt[0]), roundCoord(pt[1])];
      });
    });
    return { type: 'MultiLineString', coordinates: lines };
  }
  throw httpError(
    400,
    '几何类型必须是 Polygon/MultiPolygon/Point/MultiPoint/LineString/MultiLineString'
  );
}

function normalizeFeature(feat, idx, op) {
  if (!feat || feat.type !== 'Feature' || !feat.geometry) {
    throw httpError(400, `第 ${idx + 1} 个要素必须是 Feature 且包含 geometry`);
  }
  if (feat.geometry.type === 'GeometryCollection') {
    throw httpError(400, 'GeometryCollection 不被支持');
  }
  // boolean ops 仅接受多边形类几何
  if (POLYONLY_OPS.has(op)) {
    const t = feat.geometry.type;
    if (t !== 'Polygon' && t !== 'MultiPolygon') {
      throw httpError(
        400,
        `第 ${idx + 1} 个要素几何类型必须是 Polygon 或 MultiPolygon（当前 ${t}）`
      );
    }
  }
  return {
    type: 'Feature',
    properties: feat.properties && typeof feat.properties === 'object' ? feat.properties : {},
    geometry: normalizeGeometry(feat.geometry),
  };
}

function validate(input, label, op) {
  const features = normalizeLayer(input);
  if (features.length === 0) {
    throw httpError(400, `${label} 至少包含 1 个要素`);
  }
  if (features.length > MAX_FEATURES_PER_LAYER) {
    throw httpError(
      400,
      `${label} 要素数 ${features.length} 超过单图层上限 ${MAX_FEATURES_PER_LAYER}`
    );
  }
  const normalized = features.map((f, i) => normalizeFeature(f, i, op));

  // 顶点总数：粗略估算
  let totalVerts = 0;
  for (const f of normalized) {
    const g = f.geometry;
    if (g.type === 'Polygon') {
      for (const ring of g.coordinates) totalVerts += ring.length;
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates) {
        for (const ring of poly) totalVerts += ring.length;
      }
    } else if (g.type === 'Point') {
      totalVerts += 1;
    } else if (g.type === 'MultiPoint') {
      totalVerts += g.coordinates.length;
    } else if (g.type === 'LineString') {
      totalVerts += g.coordinates.length;
    } else if (g.type === 'MultiLineString') {
      for (const line of g.coordinates) totalVerts += line.length;
    }
  }
  if (totalVerts > MAX_TOTAL_VERTICES) {
    throw httpError(
      400,
      `${label} 总顶点数 ${totalVerts} 超过上限 ${MAX_TOTAL_VERTICES}`
    );
  }
  return { featureCount: features.length, totalVerts, features: normalized };
}

// ===== 双 layer: intersect / difference / union / dissolve =====

function _runBooleanOp(op, fc) {
  if (fc.features.length < 2) {
    throw httpError(400, `${op} 需要至少 2 个多边形要素`);
  }
  let result = null;
  try {
    if (op === 'intersect') result = turf.intersect(fc);
    else if (op === 'difference') result = turf.difference(fc);
    else if (op === 'union') result = turf.union(fc);
  } catch (e) {
    throw httpError(400, `${op} 运算失败：${e.message}`);
  }
  return result || turf.featureCollection([]);
}

function intersect(layerA, layerB) {
  const a = validate(layerA, 'layerA', 'intersect');
  const b = validate(layerB, 'layerB', 'intersect');
  const fc = turf.featureCollection([...a.features, ...b.features]);
  return _runBooleanOp('intersect', fc);
}

function difference(layerA, layerB) {
  const a = validate(layerA, 'layerA', 'difference');
  const b = validate(layerB, 'layerB', 'difference');
  const fc = turf.featureCollection([...a.features, ...b.features]);
  return _runBooleanOp('difference', fc);
}

function union(layerA, layerB) {
  const a = validate(layerA, 'layerA', 'union');
  const b = validate(layerB, 'layerB', 'union');
  const fc = turf.featureCollection([...a.features, ...b.features]);
  return _runBooleanOp('union', fc);
}

// dissolve:
//   - 兼容三层调用契约：
//     (1) dissolve(layerA)                  → 仅对 A 做 dissolve（若 groupBy 缺失则等价 union）
//     (2) dissolve(layerA, layerB)          → A + B 合并后 dissolve（独立开源版默认行为）
//     (3) dissolve(layerA, layerB, groupBy) → A + B 合并后按 groupBy 属性字段做 dissolve
//   - 不传 groupBy → 与客户端一致 = union（避免额外 schema/属性类型假设）
//   - 传 groupBy   → turf.dissolve(fc, { groupBy })，按属性值分组
function dissolve(layerA, layerB, options = {}) {
  const a = validate(layerA, 'layerA', 'dissolve');
  // 周期 1 P0-1: 允许只传 layerA（单层 dissolve）
  const b = layerB != null ? validate(layerB, 'layerB', 'dissolve') : null;
  const fc = turf.featureCollection(
    b ? [...a.features, ...b.features] : a.features,
  );

  if (!options.groupBy) {
    return _runBooleanOp('union', fc);
  }
  // turf v7 dissolve 需要 groupBy 是已存在的 properties key
  const groupBy = options.groupBy;
  // turf.dissolve 在 v7 接受 { groupBy: 'key' }；若属性全部缺失则降级为 union
  try {
    const result = turf.dissolve(fc, { groupBy });
    return result || turf.featureCollection([]);
  } catch (e) {
    // turf.dissolve v7 抛 "cannot read properties of undefined" 等难读错误时回退 union
    if (process.env.SPATIAL_DEBUG === '1') {
      console.warn('[spatial] dissolve groupBy 失败，回退 union:', e.message);
    }
    return _runBooleanOp('union', fc);
  }
}

// ===== 单 layer: buffer / centroid / convexHull =====

function buffer(input, distance) {
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0) {
    throw httpError(400, 'buffer 需要非负有限 distance（米）');
  }
  const { features } = validate(input, 'layer', 'buffer');
  const out = [];
  for (const f of features) {
    try {
      const buf = turf.buffer(f, distance, { units: 'meters' });
      if (buf) out.push(buf);
    } catch (e) {
      throw httpError(400, `buffer 失败：${e.message}`);
    }
  }
  return out.length ? turf.featureCollection(out) : turf.featureCollection([]);
}

function centroidFn(input) {
  const { features } = validate(input, 'layer', 'centroid');
  const out = [];
  for (const f of features) {
    try {
      const c = turf.centroid(f);
      if (c) out.push(c);
    } catch (e) {
      throw httpError(400, `centroid 失败：${e.message}`);
    }
  }
  return out.length ? turf.featureCollection(out) : turf.featureCollection([]);
}

function convexHull(input) {
  const { features } = validate(input, 'layer', 'convexHull');
  const pts = [];
  for (const f of features) {
    try {
      const cs = turf.coordAll(f);
      if (cs.length) pts.push(...cs);
    } catch (e) {
      throw httpError(400, `convexHull 收集顶点失败：${e.message}`);
    }
  }
  if (pts.length < 3) {
    throw httpError(
      400,
      `convexHull 需要至少 3 个端点（当前 ${pts.length} 个）`
    );
  }
  try {
    const fc = turf.featureCollection(pts.map((c) => turf.point(c)));
    const hull = turf.convex(fc);
    return hull || turf.featureCollection([]);
  } catch (e) {
    throw httpError(400, `convexHull 失败：${e.message}`);
  }
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = {
  intersect,
  difference,
  union,
  dissolve,
  buffer,
  centroid: centroidFn,
  convexHull,
  validate,
};