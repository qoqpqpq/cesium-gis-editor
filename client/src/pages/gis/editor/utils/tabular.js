// tabular — 共享的表格（CSV/TXT/XLSX）解析工具
// 抽出自 FileLoader.jsx，给 editor importer 复用

// 自动检测 lat/lng/alt 列
// 借鉴 geojson.io / MapReader 的列名启发式：覆盖中英文 + 度分秒变体 + 后缀 `_deg/_dd/_dms`
export const LAT_NAMES = [
  'lat', 'latitude', 'y', 'y_coord', 'ycoord',
  '纬度', '纬度坐标', '纬度(°)', '纬度°',
  'lat_deg', 'lat_dd', 'latitude_deg', 'latitude_dd',
];
export const LNG_NAMES = [
  'lng', 'lon', 'long', 'longitude', 'longtitude', 'x', 'x_coord', 'xcoord',
  '经度', '经度坐标', '经度(°)', '经度°',
  'lon_deg', 'lon_dd', 'long_deg', 'long_dd', 'lng_deg', 'lng_dd', 'longitude_deg', 'longitude_dd',
];
export const ALT_NAMES = [
  'alt', 'altitude', 'elev', 'elevation', 'depth', 'depthbelowseafloor', 'bathymetry',
  '海拔', '高程', 'h', 'z',
];
// WKT 几何列：单列承载 POINT/LINESTRING/POLYGON 字符串
// 借鉴 geojson.io：用户拖 CSV 进来时若含 `wkt` / `geometry` / `the_geom` 列，直接转 geometry
export const WKT_NAMES = ['wkt', 'geometry', 'the_geom', 'geom', 'shape', 'wkt_geometry', 'geometry_wkt'];

// 表头归一化：去 BOM、去所有空白/不可见字符、转小写、Unicode NFKD
export function normalizeHeader(h) {
  let s = String(h);
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  s = s.replace(/\s+/g, '');
  s = s.normalize('NFKD');
  return s.toLowerCase();
}

// 从表头数组里找 lat / lng / alt / wkt 列索引
// 容忍度匹配：精确 / 带分隔符前缀 / 直接前缀 / 子串包含
export function detectCoordCols(headers) {
  const normalized = headers.map(normalizeHeader);
  const findIdx = (names) => {
    for (let i = 0; i < normalized.length; i++) {
      const h = normalized[i];
      if (!h) continue;
      if (names.some((n) => h === n || h.startsWith(n + '_') || h.startsWith(n) || h.includes(n))) return i;
    }
    return -1;
  };
  return {
    lat: findIdx(LAT_NAMES),
    lng: findIdx(LNG_NAMES),
    alt: findIdx(ALT_NAMES),
    wkt: findIdx(WKT_NAMES),
  };
}

// 极简 WKT 解析器：只支持 POINT / LINESTRING / POLYGON
// 借鉴 Turf.js wkt 解码思路（去引号 → 提取括号内坐标 → 按分隔符切分 → 数字校验）
// 返回 GeoJSON geometry 或 null
export function parseWkt(wkt) {
  if (typeof wkt !== 'string') return null;
  const s = wkt.trim().toUpperCase();
  if (!s) return null;
  // 抽 ( ... ) 内坐标串
  const m = s.match(/^([A-Z]+)\s*\(\s*(.*?)\s*\)$/s);
  if (!m) return null;
  const type = m[1];
  const body = m[2];

  // 把坐标串拆成若干 ring / point；用 "),(" 当 ring 分隔；"," 当 point 串内分隔
  const splitPoints = (str) => str.split(',').map((p) => p.trim()).filter(Boolean).map((pair) => {
    const nums = pair.split(/\s+/).map(Number);
    return nums;
  });

  if (type === 'POINT') {
    const pts = splitPoints(body);
    if (!pts.length || pts[0].length < 2) return null;
    return { type: 'Point', coordinates: pts[0].slice(0, 3) };
  }
  if (type === 'LINESTRING') {
    const pts = splitPoints(body);
    if (pts.length < 2) return null;
    return { type: 'LineString', coordinates: pts.map((p) => p.slice(0, 3)) };
  }
  if (type === 'POLYGON') {
    // 多 ring，外用 '),(' 分隔
    const rings = body.split(/\),\s*\(?/).map((s) => s.replace(/^\(/, '').replace(/\)$/, '').trim()).filter(Boolean);
    const coords = rings.map((ring) => splitPoints(ring).map((p) => p.slice(0, 3)));
    if (!coords.length || !coords[0].length) return null;
    return { type: 'Polygon', coordinates: coords };
  }
  // MULTIPOINT / MULTILINESTRING / MULTIPOLYGON → 暂不支持；返回 null 让上层走兜底
  return null;
}

// 简单 CSV / TXT 解析：自动识别分隔符（tab > 分号 > 逗号）
// 适合结构良好的表格（无引号转义）。如果未来需要严格 CSV，加 papaparse
export function parseDelimited(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const firstLine = text.split(/\r?\n/)[0] || '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delim = tabCount > 0 ? '\t' : semiCount > commaCount ? ';' : ',';
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(delim).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(delim);
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
  return { headers, rows };
}

// 行数组 → GeoJSON FeatureCollection（每行一个 Point）
// 非坐标列保存为 properties
export function rowsToGeoJson(parsed, latIdx, lngIdx, altIdx, name) {
  const { headers, rows } = parsed;
  const features = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lat = parseFloat(row[headers[latIdx]]);
    const lng = parseFloat(row[headers[lngIdx]]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    const properties = { _index: i };
    for (const h of headers) {
      if (h === headers[latIdx] || h === headers[lngIdx]) continue;
      if (altIdx >= 0 && h === headers[altIdx]) continue;
      properties[h] = row[h];
    }
    const coords = altIdx >= 0
      ? [lng, lat, parseFloat(row[headers[altIdx]]) || 0]
      : [lng, lat];
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords },
      properties,
    });
  }
  return { type: 'FeatureCollection', name, features };
}

// 行数组 → GeoJSON FeatureCollection（每行一个 Feature，几何来自 WKT 列）
// 借鉴 geojson.io：单列承载 WKT 时直接解析为 POINT/LINESTRING/POLYGON
export function rowsToGeoJsonFromWkt(parsed, wktIdx, name) {
  const { headers, rows } = parsed;
  const features = [];
  let skipped = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const wkt = row[headers[wktIdx]];
    const geom = parseWkt(wkt);
    if (!geom) { skipped++; continue; }
    const properties = { _index: i };
    for (const h of headers) {
      if (h === headers[wktIdx]) continue;
      properties[h] = row[h];
    }
    features.push({ type: 'Feature', geometry: geom, properties });
  }
  return { type: 'FeatureCollection', name, features, skipped };
}
