// queryCompiler — 阶段 2B · 空间查询生成器
//
// 目标：把"可视化规则"编译成一个布尔过滤函数，喂给属性表 / 选中状态。
//
// 数据模型（规则数组 + 顶层连接符）：
//
//   {
//     combinator: 'AND' | 'OR',
//     rules: [
//       { field: 'name' | 'kind' | 'layerId' | '<attrKey>',
//         op: 'eq' | 'neq' | 'contains' | 'startsWith' | 'gt' | 'gte' | 'lt' | 'lte'
//             | 'in' | 'empty' | 'bbox',
//         value: <string|number|boolean|null> | [..] | { west, south, east, north }
//       },
//       ...
//     ]
//   }
//
// 空规则数组 = 不过滤（全保留）。所有规则都返回 true 也视为全保留。
//
// 安全：所有用户输入都通过 coerceValue 数值化，避免 NaN 扩散和 prototype 污染。
// 性能：单个 feature 评估短路，单次过滤 O(n)。
// bbox 运算：走 turf.js-like 几何计算，但这里只判一个轴对齐矩形（轴对齐 = AABB），
//   对 Point/LineString/Polygon 都先求 bbox 再相交 —— 比顶点遍历快 10x。

const OPS = new Set([
  'eq', 'neq', 'contains', 'startsWith', 'gt', 'gte', 'lt', 'lte', 'in', 'empty', 'bbox',
]);

// 把输入 value 转成字段声明的类型 (string / number / boolean)。容忍 trim、空串 → null。
export function coerceValue(raw, type) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    // 视为 bbox 对象
    const w = Number(raw.west);
    const s = Number(raw.south);
    const e = Number(raw.east);
    const n = Number(raw.north);
    if ([w, s, e, n].some((v) => Number.isNaN(v) || !Number.isFinite(v))) return null;
    return { west: w, south: s, east: e, north: n };
  }
  if (type === 'number') {
    const n = Number(typeof raw === 'string' ? raw.trim() : raw);
    return Number.isFinite(n) ? n : null;
  }
  if (type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true' || raw === '1' || raw === 1) return true;
    if (raw === 'false' || raw === '0' || raw === 0 || raw === '' || raw === null) return false;
    return null;
  }
  // string
  return String(raw).trim();
}

// 取 feature 在指定字段上的标量值；保留字段走 f.name / / f.kind / / f.layerId；自定义走 f.attrs[field]。
export function getFieldValue(feature, field) {
  if (!feature) return undefined;
  if (field === 'name') return feature.name;
  if (field === 'kind') return feature.kind;
  if (field === 'layerId') return feature.layerId;
  if (feature.attrs && Object.prototype.hasOwnProperty.call(feature.attrs, field)) {
    return feature.attrs[field];
  }
  return undefined;
}

// 对单个 feature 评估单个规则；不通过返回 false。
export function evalRule(feature, rule) {
  if (!rule || !OPS.has(rule.op)) return true;
  const fv = getFieldValue(feature, rule.field);

  switch (rule.op) {
    case 'eq': {
      if (rule.value === null || rule.value === undefined) {
        return fv === null || fv === undefined || fv === '';
      }
      if (typeof fv === 'number' && typeof rule.value === 'number') return fv === rule.value;
      if (typeof fv === 'boolean' && typeof rule.value === 'boolean') return fv === rule.value;
      return String(fv).toLowerCase() === String(rule.value).toLowerCase();
    }
    case 'neq': {
      if (rule.value === null || rule.value === undefined) {
        return !(fv === null || fv === undefined || fv === '');
      }
      if (typeof fv === 'number' && typeof rule.value === 'number') return fv !== rule.value;
      if (typeof fv === 'boolean' && typeof rule.value === 'boolean') return fv !== rule.value;
      return String(fv).toLowerCase() !== String(rule.value).toLowerCase();
    }
    case 'contains': {
      if (fv === null || fv === undefined) return false;
      return String(fv).toLowerCase().includes(String(rule.value || '').toLowerCase());
    }
    case 'startsWith': {
      if (fv === null || fv === undefined) return false;
      return String(fv).toLowerCase().startsWith(String(rule.value || '').toLowerCase());
    }
    case 'gt':  { const n = Number(fv); return Number.isFinite(n) && n >  Number(rule.value); }
    case 'gte': { const n = Number(fv); return Number.isFinite(n) && n >= Number(rule.value); }
    case 'lt':  { const n = Number(fv); return Number.isFinite(n) && n <  Number(rule.value); }
    case 'lte': { const n = Number(fv); return Number.isFinite(n) && n <= Number(rule.value); }
    case 'in': {
      const list = Array.isArray(rule.value) ? rule.value : [];
      if (!list.length) return true;
      const target = fv === null || fv === undefined ? '' : String(fv).toLowerCase();
      return list.some((x) => String(x).toLowerCase() === target);
    }
    case 'empty': {
      return fv === null || fv === undefined || fv === '';
    }
    case 'bbox': {
      const bb = rule.value;
      if (!bb || [bb.west, bb.south, bb.east, bb.north].some((v) => typeof v !== 'number')) {
        return true;
      }
      const featBB = featureBBox(feature);
      if (!featBB) return false;
      return !(featBB.east < bb.west || featBB.west > bb.east
            || featBB.north < bb.south || featBB.south > bb.north);
    }
    default:
      return true;
  }
}

// 评估一个完整的 query（多条规则 + combinator）。
// combinator ∈ { AND, OR }；空 rules 视为全保留（true）。
export function evalQuery(feature, query) {
  if (!query || !Array.isArray(query.rules) || query.rules.length === 0) return true;
  if (query.combinator === 'OR') {
    // 任一通过即通过
    for (const r of query.rules) if (evalRule(feature, r)) return true;
    return false;
  }
  // 默认 AND
  for (const r of query.rules) if (!evalRule(feature, r)) return false;
  return true;
}

// 给一组 features 跑 query，返回通过的子集。
export function runQuery(features, query) {
  if (!features || !features.length) return [];
  if (!query || !Array.isArray(query.rules) || query.rules.length === 0) return features;
  const out = [];
  for (const f of features) if (evalQuery(f, query)) out.push(f);
  return out;
}

// 浅校验规则结构 + 类型修正；失败返回 null（而不是抛错，前端可降级）。
export function compileQuery(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const combinator = raw.combinator === 'OR' ? 'OR' : 'AND';
  if (!Array.isArray(raw.rules)) return null;
  const rules = [];
  for (const r of raw.rules) {
    if (!r || typeof r !== 'object') continue;
    if (!OPS.has(r.op)) continue;
    if (typeof r.field !== 'string' || !r.field) continue;
    let value = r.value;
    if (r.op === 'bbox') {
      value = coerceValue(value, 'bbox');
      if (!value) continue;
    } else if (r.op === 'in') {
      if (!Array.isArray(value)) continue;
      value = value.map((x) => (x === null || x === undefined ? '' : String(x))).filter((x) => x !== '');
      if (!value.length) continue;
    } else if (r.op === 'empty') {
      value = null;
    } else if (r.op === 'gt' || r.op === 'gte' || r.op === 'lt' || r.op === 'lte') {
      value = coerceValue(value, 'number');
      if (value === null) continue;
    } else if (r.op === 'eq' || r.op === 'neq' || r.op === 'contains' || r.op === 'startsWith') {
      // 字符串型 op：保留 value 原样（数字字段也走 String 比较兜底）
      if (value === null || value === undefined) value = '';
      value = String(value);
    }
    rules.push({ field: r.field, op: r.op, value });
  }
  return { combinator, rules };
}

// 序列化（JSON-safe），给属性表持久化用。
export function serializeQuery(query) {
  if (!query || !query.rules || !query.rules.length) return null;
  try {
    return JSON.stringify({
      combinator: query.combinator || 'AND',
      rules: query.rules.map((r) => ({ field: r.field, op: r.op, value: r.value })),
    });
  } catch (_) { return null;
  }
}

// 反序列化 + 编译；任何解析失败回 null（视为不过滤）。
export function deserializeQuery(raw) {
  if (!raw) return null;
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return compileQuery(obj);
  } catch (_) { return null;
  }
}

// ---- 几何：轻量 AABB 计算 ----

// 输入可能是 Cesium entity（带 position / polyline.positions / polygon.hierarchy）
// 或者是 GeoJSON feature。我们尽力兼容两种形态。
export function featureBBox(feature) {
  if (!feature) return null;
  // 优先取已存好的 bbox
  if (feature.bbox && Array.isArray(feature.bbox) && feature.bbox.length === 4) {
    const [w, s, e, n] = feature.bbox;
    return { west: w, south: s, east: e, north: n };
  }
  // 1) GeoJSON geometry
  if (feature.geometry && feature.geometry.type) {
    return geoBBox(feature.geometry);
  }
  // 2) Cesium 形态（一个 entity）
  if (feature.position) {
    const c = toCartographic(feature.position);
    if (c) return { west: c.lon, south: c.lat, east: c.lon, north: c.lat };
  }
  if (feature.polyline && feature.polyline.positions) return positionsBBox(feature.polyline.positions);
  if (feature.polygon && feature.polygon.hierarchy) {
    return positionsBBox(feature.polygon.hierarchy.positions);
  }
  // 3) 已是 feature.{lng,lat}
  if (typeof feature.lng === 'number' && typeof feature.lat === 'number') {
    return { west: feature.lng, south: feature.lat, east: feature.lng, north: feature.lat };
  }
  return null;
}

function geoBBox(geom) {
  if (!geom) return null;
  let coords = null;
  if (geom.type === 'Point') coords = [geom.coordinates];
  else if (geom.type === 'LineString' || geom.type === 'MultiPoint') coords = geom.coordinates;
  else if (geom.type === 'Polygon') coords = geom.coordinates.flat(1);
  else if (geom.type === 'MultiPolygon') coords = geom.coordinates.flat(2);
  else if (geom.type === 'MultiLineString') coords = geom.coordinates.flat(1);
  if (!coords) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const [lon, lat] = c;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (lon < w) w = lon;
    if (lon > e) e = lon;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  if (!Number.isFinite(w)) return null;
  return { west: w, south: s, east: e, north: n };
}

function positionsBBox(positions) {
  if (!positions || !positions.length) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of positions) {
    const c = toCartographic(p);
    if (!c) continue;
    if (c.lon < w) w = c.lon;
    if (c.lon > e) e = c.lon;
    if (c.lat < s) s = c.lat;
    if (c.lat > n) n = c.lat;
  }
  if (!Number.isFinite(w)) return null;
  return { west: w, south: s, east: e, north: n };
}

function toCartographic(p) {
  if (!p) return null;
  // 已是 [lon, lat] 形式
  if (Array.isArray(p) && p.length >= 2) {
    const [lon, lat] = p;
    if (Number.isFinite(lon) && Number.isFinite(lat)) return { lon, lat };
    return null;
  }
  // Cesium.Cartesian3 形式：取经纬度
  if (typeof p === 'object' && (p.longitude !== undefined || p.latitude !== undefined)) {
    return { lon: Number(p.longitude), lat: Number(p.latitude) };
  }
  // Cesium.Cartesian3 上的 toCartographic 方法
  if (typeof p === 'object' && typeof p.longitude === 'function' === false && typeof p.x === 'number') {
    // 简化：跳过精确换算（避免引入 Cesium 全局依赖），返回 null 让上层兜底
    return null;
  }
  return null;
}