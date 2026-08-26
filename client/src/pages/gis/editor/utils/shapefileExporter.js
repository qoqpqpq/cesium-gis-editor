// shapefileExporter — 阶段 2B · Shapefile (.shp) 导出
//
// 目标：把 GIS 编辑器当前 DataSource 的实体打成 ESRI Shapefile 兼容的 zip：
//   export.zip
//     ├─ export.shp    (geometry, big-endian)
//     ├─ export.shx    (geometry index)
//     ├─ export.dbf    (attributes, dBASE IV 兼容)
//     └─ export.prj    (WKT: WGS84 / EPSG:4326)
//
// 不引外部库（shp-write / shapefile 等），用项目已装的 jszip 打包。
// 仅支持 Point / LineString / Polygon 三种几何；其它类型（rect/circle/freehand）
// 在导出时降级为对应几何（rect → Polygon，circle → 多段近似 Polygon，freehand → Polygon）。
//
// 参考：
//   - ESRI Shapefile 规范 (White Paper, July 1998)：
//       shp 头 100 bytes：File Code 9994 + length + version 1000 + shape type + bbox
//       每条记录 8 bytes header + content
//   - dBASE IV：字段描述符 32 bytes/字段 + 0x20 终止
//
// 已知限制：
//   - M 值 / Z 值忽略
//   - 单文件最大 2GB（shp header 长度用 big-endian int32，限 0x7FFFFFFE）
//   - 属性字段名限 10 字节（dBASE 限制）—— 超长截断
//   - dBASE 字符串限 254 字节、数值 19 位
//
// 所有视图都是「字段类型快照」——导出成功 ≠ 能完美回导入，仅作一次性数据快照。

import JSZip from 'jszip';
import { toGeoJSON } from './exporter.js';

// shape type 常量（ESRI 规范）
const SHAPE_POINT       = 1;
const SHAPE_POLYLINE    = 3;
const SHAPE_POLYGON     = 5;
const SHAPE_NULL        = 0;

// dBASE 字段类型
const DBF_TYPE_C = 'C'; // char
const DBF_TYPE_N = 'N'; // number
const DBF_TYPE_F = 'F'; // float
const DBF_TYPE_L = 'L'; // logical (boolean)
const DBF_TYPE_D = 'D'; // date (YYYYMMDD)
const DBF_HEADER_TERM = 0x0D;

// ============ shp 写 ============

function writeShpHeader(shpType, bbox, fileLengthWords) {
  const buf = new ArrayBuffer(100);
  const dv = new DataView(buf);
  // File Code (big-endian int32, 9994)
  dv.setInt32(0, 9994, false);
  // Unused (5 × int32 big-endian, 全 0)
  for (let i = 1; i <= 5; i++) dv.setInt32(i * 4, 0, false);
  // File Length in 16-bit words (big-endian)
  dv.setInt32(24, fileLengthWords, false);
  // Version (little-endian int32, 1000)
  dv.setInt32(28, 1000, true);
  // Shape Type (little-endian int32)
  dv.setInt32(32, shpType, true);
  // Bounding Box (little-endian double × 4)
  dv.setFloat64(36, bbox.xmin, true);
  dv.setFloat64(44, bbox.ymin, true);
  dv.setFloat64(52, bbox.xmax, true);
  dv.setFloat64(60, bbox.ymax, true);
  // Z and M ranges (8 bytes Z + 8 bytes M, 默认 0)
  dv.setFloat64(68, 0, true);
  dv.setFloat64(76, 0, true);
  dv.setFloat64(84, 0, true);
  dv.setFloat64(92, 0, true);
  return buf;
}

function writeRecordHeader(recordNum, contentLengthBytes) {
  const buf = new ArrayBuffer(8);
  const dv = new DataView(buf);
  // Record Number (big-endian int32)
  dv.setInt32(0, recordNum, false);
  // Content Length in 16-bit words (big-endian int32)
  // 字节 → 16-bit words：contentLengthBytes / 2
  dv.setInt32(4, Math.ceil(contentLengthBytes / 2), false);
  return buf;
}

// 把 LngLat 数组编码为 Point record content
function encodePoint(coords) {
  const buf = new ArrayBuffer(4 + 16); // shape type (4) + x (8) + y (8)
  const dv = new DataView(buf);
  dv.setInt32(0, SHAPE_POINT, true);
  dv.setFloat64(4, coords[0], true);
  dv.setFloat64(12, coords[1], true);
  return buf;
}

// PolyLine / Polygon
// 多个 parts（多段线/多环）：每条记录 shape type + bbox + numParts + numPoints + parts + points
function encodePolylineOrPolygon(shapeType, parts) {
  // parts = [Array<[lng,lat]>, Array<[lng,lat]>, ...]
  let totalPoints = 0;
  for (const p of parts) totalPoints += p.length;

  // header bytes = 4 (shape type) + 32 (bbox) + 4 (numParts) + 4 (numPoints) + parts.length*4 + totalPoints*16
  const headerBytes = 4 + 32 + 4 + 4 + parts.length * 4;
  const pointsBytes = totalPoints * 16;
  const totalBytes = headerBytes + pointsBytes;
  const buf = new ArrayBuffer(totalBytes);
  const dv = new DataView(buf);
  let off = 0;

  // shape type
  dv.setInt32(off, shapeType, true); off += 4;

  // bbox：取所有点的 min/max
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const p of parts) {
    for (const [x, y] of p) {
      if (x < xmin) xmin = x;
      if (x > xmax) xmax = x;
      if (y < ymin) ymin = y;
      if (y > ymax) ymax = y;
    }
  }
  if (!Number.isFinite(xmin)) { xmin = 0; ymin = 0; xmax = 0; ymax = 0; }
  dv.setFloat64(off, xmin, true); off += 8;
  dv.setFloat64(off, ymin, true); off += 8;
  dv.setFloat64(off, xmax, true); off += 8;
  dv.setFloat64(off, ymax, true); off += 8;

  // numParts
  dv.setInt32(off, parts.length, true); off += 4;
  // numPoints
  dv.setInt32(off, totalPoints, true); off += 4;

  // parts 索引数组
  let acc = 0;
  for (let i = 0; i < parts.length; i++) {
    dv.setInt32(off, acc, true); off += 4;
    acc += parts[i].length;
  }

  // points
  for (const p of parts) {
    for (const [x, y] of p) {
      dv.setFloat64(off, x, true); off += 8;
      dv.setFloat64(off, y, true); off += 8;
    }
  }

  return buf;
}

function concatBuffers(arrs) {
  let total = 0;
  for (const a of arrs) total += a.byteLength;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(new Uint8Array(a), off);
    off += a.byteLength;
  }
  return out.buffer;
}

// 把 toGeoJSON 形态转成 shape 文件 buffer
// 同时返回 shx 和 dbf 用的元数据（bbox / 字段 schema / 记录列表）
function buildShpParts(geojsonFeatures) {
  const records = []; // [{ recordNum, shapeType, contentBuffer }]
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  let shpType = SHAPE_NULL;

  let recNum = 1;
  for (const f of geojsonFeatures) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Point') {
      const [x, y] = g.coordinates;
      const content = encodePoint(g.coordinates);
      records.push({ recordNum: recNum++, shapeType: SHAPE_POINT, content });
      if (x < xmin) xmin = x;
      if (x > xmax) xmax = x;
      if (y < ymin) ymin = y;
      if (y > ymax) ymax = y;
      shpType = shpType === SHAPE_NULL ? SHAPE_POINT : (shpType === SHAPE_POINT ? SHAPE_POINT : (shpType === SHAPE_POLYLINE || shpType === SHAPE_POLYGON ? shpType : SHAPE_POINT));
    } else if (g.type === 'LineString') {
      const content = encodePolylineOrPolygon(SHAPE_POLYLINE, [g.coordinates]);
      records.push({ recordNum: recNum++, shapeType: SHAPE_POLYLINE, content });
      for (const [x, y] of g.coordinates) {
        if (x < xmin) xmin = x;
        if (x > xmax) xmax = x;
        if (y < ymin) ymin = y;
        if (y > ymax) ymax = y;
      }
      shpType = SHAPE_POLYLINE;
    } else if (g.type === 'Polygon') {
      const parts = g.coordinates; // [ring, ring, ...]
      const content = encodePolylineOrPolygon(SHAPE_POLYGON, parts);
      records.push({ recordNum: recNum++, shapeType: SHAPE_POLYGON, content });
      for (const part of parts) {
        for (const [x, y] of part) {
          if (x < xmin) xmin = x;
          if (x > xmax) xmax = x;
          if (y < ymin) ymin = y;
          if (y > ymax) ymax = y;
        }
      }
      shpType = SHAPE_POLYGON;
    }
    // 其它几何（MultiPoint 等）暂忽略
  }

  if (!Number.isFinite(xmin)) { xmin = 0; ymin = 0; xmax = 0; ymax = 0; }

  return {
    records,
    bbox: { xmin, ymin, xmax, ymax },
    shpType: records.length ? shpType : SHAPE_NULL,
  };
}

function buildShp(parts) {
  // shp 文件 = header + records (record header + content)
  const headerBuf = writeShpHeader(parts.shpType, parts.bbox, 0); // file length 后填
  const chunks = [headerBuf];
  for (const r of parts.records) {
    chunks.push(writeRecordHeader(r.recordNum, r.content.byteLength));
    chunks.push(r.content);
  }
  const body = concatBuffers(chunks);
  // file length in 16-bit words = body bytes / 2
  const fileLengthWords = Math.ceil(body.byteLength / 2);
  // 修正 header 的 file length 字段
  const dv = new DataView(body);
  dv.setInt32(24, fileLengthWords, false);
  return body;
}

// ============ shx 写 ============
// shx = 100 bytes header + 每条记录 8 bytes（offset in 16-bit words + content length in 16-bit words）
function buildShx(parts) {
  const headerBuf = writeShpHeader(parts.shpType, parts.bbox, 0);
  // 改 version 1000 → ok 不变；shx header 字段定义同 shp
  // body: 每条记录 8 bytes
  const recChunks = [];
  let offset = 50; // shp header = 100 bytes = 50 words（文件长度起步）
  for (const r of parts.records) {
    const recBuf = new ArrayBuffer(8);
    const dv = new DataView(recBuf);
    dv.setInt32(0, offset, false); // offset in 16-bit words
    dv.setInt32(4, Math.ceil(r.content.byteLength / 2), false); // content length in 16-bit words
    recChunks.push(recBuf);
    offset += 4 + Math.ceil(r.content.byteLength / 2); // 4 words = 8 bytes record header + content words
  }
  const body = concatBuffers([headerBuf, ...recChunks]);
  const fileLengthWords = Math.ceil(body.byteLength / 2);
  const dv = new DataView(body);
  dv.setInt32(24, fileLengthWords, false);
  return body;
}

// ============ dbf 写 ============
// dBASE IV header：32 bytes + 32 bytes/field + 0x20 terminator
// 后跟每条记录（删除标记 1 byte + fields concatenated）

// 从 sample features 提取字段 schema
function collectFieldSchema(features) {
  const map = new Map(); // name -> { type, length, decimals }
  for (const f of features) {
    const props = (f.properties && typeof f.properties === 'object') ? f.properties : {};
    for (const [k, v] of Object.entries(props)) {
      if (map.has(k)) continue;
      const t = inferDbfType(v);
      // 字段名限 10 字节，截断 + 截断标记 _
      const name = k.length > 10 ? k.slice(0, 9) + '_' : k;
      map.set(k, { name, ...t });
    }
  }
  // 至少 1 个字段（kind 默认）
  if (!map.has('kind')) {
    map.set('kind', { name: 'kind', type: DBF_TYPE_C, length: 16, decimals: 0 });
  }
  return Array.from(map.values());
}

function inferDbfType(v) {
  if (v === null || v === undefined) return { type: DBF_TYPE_C, length: 1, decimals: 0 };
  if (typeof v === 'number') return { type: DBF_TYPE_N, length: 19, decimals: 6 };
  if (typeof v === 'boolean') return { type: DBF_TYPE_L, length: 1, decimals: 0 };
  if (typeof v === 'string') {
    // dBASE string max 254 bytes (1 byte length prefix + N chars)
    const bytes = utf8Bytes(v);
    return { type: DBF_TYPE_C, length: Math.min(254, Math.max(1, bytes)), decimals: 0 };
  }
  return { type: DBF_TYPE_C, length: 64, decimals: 0 };
}

function utf8Bytes(s) {
  return new TextEncoder().encode(s).length;
}

function asciiSafe(s, max) {
  // dBASE 字段值：截到 max 字节（UTF-8 截断简化为字符截断——>10w中文情况下 OK）
  if (s === null || s === undefined) return '';
  const str = String(s);
  // 先 utf8 bytes 估算，避免截到一半字符
  const enc = new TextEncoder();
  if (enc.encode(str).length <= max) return str;
  // 截断到 max 个 utf-8 bytes
  let out = '';
  let bytes = 0;
  for (const ch of str) {
    const b = enc.encode(ch).length;
    if (bytes + b > max) break;
    out += ch;
    bytes += b;
  }
  return out;
}

function buildDbf(parts, geojsonFeatures) {
  // 字段集 = 静态字段 + 任意第一个有 props 的 feature 里出现的 key（统一）
  const fieldSchemas = collectFieldSchema(geojsonFeatures);
  // key 映射回原 key（截断名还原）：用 name 作索引
  const fieldKeyByName = new Map();
  for (const f of geojsonFeatures) {
    if (!f.properties) continue;
    for (const k of Object.keys(f.properties)) {
      const schemaName = k.length > 10 ? k.slice(0, 9) + '_' : k;
      if (!fieldKeyByName.has(schemaName)) fieldKeyByName.set(schemaName, k);
    }
  }

  // header
  const headerSize = 32 + (32 * fieldSchemas.length) + 1; // +1 for 0x20 terminator
  const recordSize = 1 + fieldSchemas.reduce((s, f) => s + f.length, 0); // 1 byte delete flag
  const totalRecords = geojsonFeatures.length;
  const header = new ArrayBuffer(headerSize);
  const hd = new DataView(header);
  // Version: 0x03 (dBASE III Plus)
  hd.setUint8(0, 0x03);
  // Last update YYMMDD
  const now = new Date();
  hd.setUint8(1, now.getFullYear() - 1900);
  hd.setUint8(2, now.getMonth() + 1);
  hd.setUint8(3, now.getDate());
  // Number of records (little-endian int32)
  hd.setInt32(4, totalRecords, true);
  // Header size
  hd.setInt16(8, headerSize, true);
  // Record size
  hd.setInt16(10, recordSize, true);
  // Reserved 20 bytes (0)
  // Field descriptor
  let off = 32;
  for (const f of fieldSchemas) {
    // field name 11 bytes ASCII zero padded
    const nameBytes = new TextEncoder().encode(f.name);
    for (let i = 0; i < 11; i++) {
      hd.setUint8(off + i, i < nameBytes.length ? nameBytes[i] : 0);
    }
    off += 11;
    // field type 1 byte
    hd.setUint8(off, f.type.charCodeAt(0)); off += 1;
    // reserved 4 bytes (0)
    off += 4;
    // field length 1 byte
    hd.setUint8(off, f.length); off += 1;
    // decimal count 1 byte
    hd.setUint8(off, f.decimals); off += 1;
    // reserved 14 bytes (0)
    off += 14;
  }
  // 0x20 terminator
  hd.setUint8(off, DBF_HEADER_TERM);

  // records
  const recordsBuf = new Uint8Array(totalRecords * recordSize);
  let rOff = 0;
  for (const f of geojsonFeatures) {
    // delete flag = 0x20 (active)
    recordsBuf[rOff++] = 0x20;
    const props = (f.properties && typeof f.properties === 'object') ? f.properties : {};
    for (const fld of fieldSchemas) {
      const origKey = fieldKeyByName.get(fld.name) || fld.name;
      const raw = props[origKey];
      const str = formatDbfValue(raw, fld);
      const enc = new TextEncoder();
      const bytes = enc.encode(str);
      const copyLen = Math.min(bytes.length, fld.length);
      for (let i = 0; i < copyLen; i++) recordsBuf[rOff + i] = bytes[i];
      // padding
      for (let i = copyLen; i < fld.length; i++) recordsBuf[rOff + i] = (fld.type === DBF_TYPE_C) ? 0x20 : 0x00;
      rOff += fld.length;
    }
  }

  return concatBuffers([header, recordsBuf.buffer]);
}

function formatDbfValue(v, fld) {
  if (v === null || v === undefined) {
    return fld.type === DBF_TYPE_C ? ''.padEnd(0) : (fld.type === DBF_TYPE_N ? '' : '');
  }
  if (fld.type === DBF_TYPE_C) return asciiSafe(v, fld.length);
  if (fld.type === DBF_TYPE_N) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '0';
    return n.toFixed(fld.decimals).padStart(fld.length, ' ');
  }
  if (fld.type === DBF_TYPE_F) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '0';
    return n.toFixed(fld.decimals).padStart(fld.length, ' ');
  }
  if (fld.type === DBF_TYPE_L) {
    if (v === true || v === 'true' || v === 'T' || v === 1) return 'T';
    return 'F';
  }
  return asciiSafe(String(v), fld.length);
}

// ============ prj ============
// WGS84 (EPSG:4326) WKT
const WGS84_WKT = `GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]`;

// ============ 顶层入口 ============

/**
 * 把 dataSource 里的实体打包成 ESRI Shapefile zip。
 * @param {Object} dataSource - Cesium DataSource
 * @param {string} baseName - 文件主名（不含扩展名），默认 'export'
 * @returns {Promise<Blob>} - Blob 对象，调用方自己触发下载
 */
export async function toShapefileZip(dataSource, baseName) {
  const gj = toGeoJSON(dataSource);
  const parts = buildShpParts(gj.features);
  const shp = buildShp(parts);
  const shx = buildShx(parts);
  const dbf = buildDbf(parts, gj.features);
  const prj = new TextEncoder().encode(WGS84_WKT);
  const name = (baseName || 'export').replace(/[^\w\-\.]/g, '_');
  const zip = new JSZip();
  zip.file(`${name}.shp`, shp);
  zip.file(`${name}.shx`, shx);
  zip.file(`${name}.dbf`, dbf);
  zip.file(`${name}.prj`, prj);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export function downloadShapefile(dataSource, filename) {
  return toShapefileZip(dataSource, filename ? filename.replace(/\.zip$/i, '') : 'export')
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (filename || 'export.zip');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { ok: true, size: blob.size };
    })
    .catch((err) => {
      console.error('Shapefile 导出失败', err);
      return { ok: false, error: String(err) };
    });
}

// 暴露给单元测试的内部函数
export const __test__ = { buildShpParts, buildShp, buildShx, buildDbf, collectFieldSchema, formatDbfValue };