// aiContext — 把 Cesium 场景压缩成一段有预算上限的文字，供 AI 读取
//
// 用户的 GIS 数据分散在三个互不相通的桶里：
//   viewer.entities        AI 生成的实体、预设城市
//   editor DataSource      用户画的图形、编辑器导入的表格/GeoJSON
//   viewer.dataSources     FileLoader 拖进来的 KML/SHP/glTF
// 历史上 AI 只读第一个，而用户从不往第一个里放东西，于是永远显示「0 实体」。

import { cartesiansToLngLatHeights } from './editor/utils/geometry.js';
import { collectFields, RESERVED } from './editor/utils/attrs.js';

const MAX_LAYERS_LISTED = 12;
const SAMPLES_PER_LAYER = 2;
const MAX_FIELDS_LISTED = 12;
const CONTEXT_BUDGET = 2500;

// [minLng, minLat, maxLng, maxLat]，无有效坐标时返回 null
export function bboxOf(positionsList) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const positions of positionsList) {
    if (!positions || !positions.length) continue;
    let coords;
    try { coords = cartesiansToLngLatHeights(positions); } catch (_) { continue; }
    for (const [lng, lat] of coords) {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (!Number.isFinite(minLng)) return null;
  return [minLng, minLat, maxLng, maxLat];
}

function fmtBbox(bbox) {
  if (!bbox) return '';
  const r = (n) => n.toFixed(4).replace(/\.?0+$/, '');
  return `${r(bbox[0])},${r(bbox[1])} ~ ${r(bbox[2])},${r(bbox[3])}`;
}

// 属性值转紧凑字符串，过长截断
function fmtVal(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return s.length > 24 ? s.slice(0, 24) + '…' : s;
}

function sampleAttrs(feature) {
  const attrs = feature.attrs || {};
  const keys = Object.keys(attrs).slice(0, 5);
  if (!keys.length) return null;
  return keys.map((k) => `${k}=${fmtVal(attrs[k])}`).join(', ');
}

// 从 entity 上抽出所有 Cartesian3，用于算 bbox（拖入文件的实体没有 editor 的 feature 结构）
function entityPositions(entity) {
  try {
    if (entity.position) {
      const c = entity.position.getValue ? entity.position.getValue(undefined) : entity.position;
      return c ? [c] : [];
    }
    if (entity.polyline && entity.polyline.positions) {
      const p = entity.polyline.positions.getValue ? entity.polyline.positions.getValue(undefined) : entity.polyline.positions;
      return Array.isArray(p) ? p : [];
    }
    if (entity.polygon && entity.polygon.hierarchy) {
      const h = entity.polygon.hierarchy.getValue ? entity.polygon.hierarchy.getValue(undefined) : entity.polygon.hierarchy;
      return (h && h.positions) || [];
    }
  } catch (_) {}
  return [];
}

/**
 * 合并三个数据桶成结构化快照
 * @param {object} args
 * @param {object} args.viewer        Cesium Viewer
 * @param {object} args.editor        { layers, features, selectedIds }（来自 EditorPanel 的 imperative handle）
 * @param {Array}  args.fileStats     [{ id, name, format, entityCount, bbox }]（来自 CesiumEarth.getDataSourceStats）
 */
export function buildSceneContext({ viewer, editor, fileStats } = {}) {
  if (!viewer) return null;

  let cameraLon = null, cameraLat = null, cameraHeightM = null;
  try {
    const cam = viewer.camera.positionCartographic;
    if (cam) {
      cameraLon = +(cam.longitude * 180 / Math.PI).toFixed(2);
      cameraLat = +(cam.latitude * 180 / Math.PI).toFixed(2);
      cameraHeightM = Math.round(cam.height);
    }
  } catch (_) {}

  // 桶 1：viewer.entities（AI / 预设）
  const rootEntities = [];
  try {
    for (const e of (viewer.entities.values || [])) {
      const id = String(e.id || '');
      rootEntities.push({
        id,
        source: id.startsWith('preset-') ? 'preset' : id.startsWith('ai-') ? 'ai' : 'other',
      });
    }
  } catch (_) {}

  // 桶 2：编辑器图层 / 要素
  const layers = [];
  const features = (editor && editor.features) || [];
  const layerDefs = (editor && editor.layers) || [];
  const selectedIds = (editor && editor.selectedIds) || new Set();

  const byLayer = new Map();
  for (const f of features) {
    const lid = f.layerId || 'default';
    if (!byLayer.has(lid)) byLayer.set(lid, []);
    byLayer.get(lid).push(f);
  }
  for (const def of layerDefs) {
    const list = byLayer.get(def.id) || [];
    byLayer.delete(def.id);
    layers.push(summarizeLayer(def.id, def.name, def.visible !== false, list));
  }
  // 有要素但图层定义已丢失（例如旧数据）
  for (const [lid, list] of byLayer.entries()) {
    layers.push(summarizeLayer(lid, lid, true, list));
  }

  const selection = [];
  for (const f of features) {
    if (selectedIds.has && selectedIds.has(f.featureId)) {
      selection.push({ featureId: f.featureId, kind: f.kind, name: f.name, layerId: f.layerId });
    }
  }

  return {
    cameraLon, cameraLat, cameraHeightM,
    imageryLayers: (() => { try { return viewer.imageryLayers.length || 0; } catch (_) { return 0; } })(),
    rootEntityCount: rootEntities.length,
    rootTypeCount: rootEntities.reduce((acc, e) => { acc[e.source] = (acc[e.source] || 0) + 1; return acc; }, {}),
    layers,
    featureCount: features.length,
    selection,
    files: fileStats || [],
  };
}

function summarizeLayer(id, name, visible, list) {
  const kindCount = {};
  for (const f of list) kindCount[f.kind || 'unknown'] = (kindCount[f.kind || 'unknown'] || 0) + 1;

  // collectFields 期望 entity 形状（读 properties.attrs），这里包一层适配
  const fields = collectFields(list.map((f) => ({ properties: { attrs: f.attrs || {} } })))
    .filter((f) => !RESERVED.includes(f.name));

  const samples = list.slice(0, SAMPLES_PER_LAYER).map(sampleAttrs).filter(Boolean);

  return {
    id, name, visible,
    count: list.length,
    kindCount,
    fields,
    bbox: bboxOf(list.map((f) => f.positions)),
    samples,
  };
}

/** 结构化快照 → markdown，硬预算 CONTEXT_BUDGET 字符 */
export function formatSceneContext(ctx) {
  if (!ctx) return '- viewer 未就绪';
  const L = [];

  L.push(`- 相机：经度 ${ctx.cameraLon ?? '?'}°, 纬度 ${ctx.cameraLat ?? '?'}°, 高度 ${ctx.cameraHeightM ?? '?'} m · 影像图层 ${ctx.imageryLayers} 个`);

  const nonEmpty = ctx.layers.filter((l) => l.count > 0);
  if (nonEmpty.length) {
    L.push('');
    L.push(`### 编辑器图层（${nonEmpty.length} 个非空 · 共 ${ctx.featureCount} 要素）`);
    for (const l of nonEmpty.slice(0, MAX_LAYERS_LISTED)) {
      const kinds = Object.entries(l.kindCount).map(([k, v]) => `${k}×${v}`).join(' ');
      L.push(`- 「${l.name}」${l.count} 要素（${kinds}）${l.visible ? '' : ' [已隐藏]'}`);
      if (l.bbox) L.push(`  范围: ${fmtBbox(l.bbox)}`);
      if (l.fields.length) {
        const names = l.fields.slice(0, MAX_FIELDS_LISTED).map((f) => `${f.name}:${f.type}`).join(', ');
        const more = l.fields.length > MAX_FIELDS_LISTED ? ` …共 ${l.fields.length} 字段` : '';
        L.push(`  字段: ${names}${more}`);
      }
      for (const s of l.samples) L.push(`  样本: ${s}`);
    }
    if (nonEmpty.length > MAX_LAYERS_LISTED) {
      L.push(`- …还有 ${nonEmpty.length - MAX_LAYERS_LISTED} 个图层未列出，用 list_layers() 查看`);
    }
  } else {
    L.push('- 编辑器：无要素');
  }

  if (ctx.files && ctx.files.length) {
    L.push('');
    L.push(`### 拖入的文件（${ctx.files.length}）`);
    for (const f of ctx.files.slice(0, MAX_LAYERS_LISTED)) {
      const cnt = f.entityCount != null ? `${f.entityCount} 实体` : (f.loading ? '加载中' : '?');
      L.push(`- ${f.name}（${f.format || '?'}, ${cnt}）${f.bbox ? ` 范围: ${fmtBbox(f.bbox)}` : ''}`);
    }
  }

  if (ctx.rootEntityCount > 0) {
    const t = Object.entries(ctx.rootTypeCount).map(([k, v]) => `${k}=${v}`).join(', ');
    L.push('');
    L.push(`### 代码/预设生成的实体：${ctx.rootEntityCount} 个（${t}）`);
  }

  if (ctx.selection.length) {
    const head = ctx.selection.slice(0, 5)
      .map((s) => `${s.name || s.featureId}(${s.kind})`).join(', ');
    L.push('');
    L.push(`### 当前选中：${ctx.selection.length} 个 — ${head}${ctx.selection.length > 5 ? ' …' : ''}`);
  }

  let out = L.join('\n');
  if (out.length > CONTEXT_BUDGET) {
    out = out.slice(0, CONTEXT_BUDGET) + '\n…（场景摘要已截断，用工具查询细节）';
  }
  return out;
}

/** 面板头部 chip 用的极简统计 */
export function headlineOf(ctx) {
  if (!ctx) return null;
  return {
    featureCount: ctx.featureCount,
    layerCount: ctx.layers.filter((l) => l.count > 0).length,
    fileCount: (ctx.files || []).length,
    rootEntityCount: ctx.rootEntityCount,
    selectedCount: ctx.selection.length,
    cameraHeightM: ctx.cameraHeightM,
  };
}
