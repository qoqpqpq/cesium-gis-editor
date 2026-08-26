// featureFactory — 单一权威 feature → Cesium entity 构造路径
//
// 之前 EditorPanel.rebuildEntity 和 commands.rebuildFromSnapshot 各自重复
// 了"kind → Cesium primitive"映射。把这段收敛到这里，保证：
//   - 同一份 feature 字典产出的 entity options 一致
//   - 新字段加在 normalize 一处，所有路径同步受益
//   - 沙箱代码 → 编辑器桶 → 撤销栈 → LayersTree 走同一条规范化路径

import * as Cesium from 'cesium';
import { newFeatureId } from './geometry.js';

// 缺省样式 —— 与 EditorPanel.DEFAULT_STYLE 同源
export const DEFAULT_STYLE = {
  pointSize: 10, pointColor: '#fbbf24',
  strokeColor: '#6c8cff', strokeWidth: 2,
  fillColor: 'rgba(108, 140, 255, 0.35)',
};

// 支持的 kind；超出范围的视为不可编辑演示几何，调用方应改走 viewer.entities
export const SUPPORTED_KINDS = ['point', 'polyline', 'polygon', 'rectangle', 'circle', 'freehand', 'rect'];

// 把外部输入的"杂七杂八"形态归一成 normalized feature。
// 不抛错；不能识别的几何返回 { error } 让调用方决定是否走 viewerEntities。
export function normalizeFeatureInput(input, defaults = {}) {
  if (!input || typeof input !== 'object') return { error: 'input 必须是对象' };
  const out = { attrs: {}, style: { ...DEFAULT_STYLE, ...(defaults.style || {}) } };

  // 显式规范形态：{ kind, positions, ... }
  if (input.kind && SUPPORTED_KINDS.includes(input.kind)) {
    out.kind = input.kind;
    out.positions = Array.isArray(input.positions) ? input.positions.slice() : [];
  } else if (input.position && (!input.polyline && !input.polygon)) {
    out.kind = 'point';
    const p = input.position.getValue ? input.position.getValue() : input.position;
    out.positions = [p];
  } else if (input.polyline && input.polyline.positions) {
    out.kind = 'polyline';
    const p = input.polyline.positions.getValue ? input.polyline.positions.getValue() : input.polyline.positions;
    out.positions = (p && p.length) ? p : [];
  } else if (input.polygon && input.polygon.hierarchy) {
    out.kind = 'polygon';
    const h = input.polygon.hierarchy.getValue ? input.polygon.hierarchy.getValue() : input.polygon.hierarchy;
    // h 可能是 PolygonHierarchy 实例（取 .positions）也可能是直接给的 Cartesian3 数组（AI 原生写法）
    out.positions = h && h.positions ? h.positions : (Array.isArray(h) ? h : []);
  } else {
    return { error: '无法识别几何类型（仅支持 point/polyline/polygon/rectangle/circle/freehand）' };
  }

  if (!out.positions.length && out.kind !== 'point') {
    return { error: `${out.kind} 至少需要 2 个顶点` };
  }

  out.featureId = input.id || input.featureId || newFeatureId(out.kind === 'freehand' ? 'fh' : out.kind === 'rectangle' ? 'rect' : out.kind);
  out.layerId = input.layerId || defaults.activeLayerId || 'default';
  out.name = input.name || out.kind;
  if (input.attrs && typeof input.attrs === 'object') out.attrs = { ...input.attrs };
  if (input.style && typeof input.style === 'object') out.style = { ...out.style, ...input.style };

  // input 自带合规 properties 的情况（AI / 用户直接构造过 entity）
  if (input.properties && typeof input.properties === 'object') {
    const p = input.properties;
    const get = (k) => (p[k] && p[k].getValue ? p[k].getValue() : p[k]);
    if (!out.kind) out.kind = get('kind');
    if (!out.featureId || out.featureId === newFeatureId.toString()) out.featureId = get('featureId') || out.featureId;
    if (!out.layerId || out.layerId === 'default') {
      const lid = get('layerId');
      if (lid) out.layerId = lid;
    }
    if (!out.attrs || !Object.keys(out.attrs).length) {
      const a = get('attrs');
      if (a && typeof a === 'object') out.attrs = { ...a };
    }
    if (!input.style && p.style) {
      const s = get('style');
      if (s && typeof s === 'object') out.style = { ...out.style, ...s };
    }
  }

  return out;
}

// normalized feature → Cesium Entity options（含 properties 契约）
// 使用 CallbackProperty 包装 positions，兼容 simplify 等"原位替换 positions"的写法
// 第二个参数 rawInput 用于透传 Cesium 专有选项（arcType / clampToGround 等），
// 这些字段不进 normalized.feature，避免 style 污染
export function buildFeatureOptions(feature, rawInput) {
  const cbPos = new Cesium.CallbackProperty(() => feature.positions, false);
  const cbHierarchy = new Cesium.CallbackProperty(
    () => new Cesium.PolygonHierarchy(feature.positions),
    false
  );
  const opts = {
    id: feature.featureId,
    name: feature.name,
    properties: {
      kind: feature.kind,
      featureId: feature.featureId,
      layerId: feature.layerId || 'default',
      selected: false,
      style: feature.style || { ...DEFAULT_STYLE },
      attrs: feature.attrs || {},
    },
  };
  const s = feature.style || DEFAULT_STYLE;
  if (feature.kind === 'point') {
    opts.position = feature.positions[0];
    opts.point = {
      pixelSize: s.pointSize || 10,
      color: Cesium.Color.fromCssColorString(s.pointColor || '#fbbf24'),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    };
  } else if (feature.kind === 'polyline' || feature.kind === 'freehand') {
    opts.polyline = {
      positions: cbPos,
      width: s.strokeWidth || 2,
      material: Cesium.Color.fromCssColorString(s.strokeColor || '#6c8cff'),
    };
    // 透传 clampToGround（AI 代码常用，让描边贴地）
    if (rawInput && rawInput.polyline && rawInput.polyline.clampToGround != null) {
      opts.polyline.clampToGround = !!rawInput.polyline.clampToGround;
    }
  } else {
    // polygon / rectangle / circle / rect 一律用 polygon.hierarchy 表达
    opts.polygon = {
      hierarchy: cbHierarchy,
      material: Cesium.Color.fromCssColorString(s.fillColor || 'rgba(108,140,255,0.35)'),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString(s.strokeColor || '#6c8cff'),
      outlineWidth: s.strokeWidth || 2,
    };
    // 透传 arcType（默认 GEODESIC 让大区域边缘不穿地）
    if (rawInput && rawInput.polygon && rawInput.polygon.arcType != null) {
      opts.polygon.arcType = rawInput.polygon.arcType;
    }
  }
  return opts;
}

// 一步到位：normalize → build → addEditorEntity → 返回元数据
export function addEditorFeature(api, input, defaults = {}) {
  const norm = normalizeFeatureInput(input, defaults);
  if (norm.error) return { ok: false, error: norm.error };
  const opts = buildFeatureOptions(norm, input);
  if (!api || !api.addEditorEntity) return { ok: false, error: 'api.addEditorEntity 不可用' };
  const entity = api.addEditorEntity(opts);
  return { ok: true, featureId: norm.featureId, kind: norm.kind, layerId: norm.layerId, entity, normalized: norm };
}

// 把已有 raw viewer.entities 上的 entity 转换成编辑器要素。
// 输入是 Cesium entity；输出是新创建的编辑器 feature 元数据。
// 调用方负责 source entity 的删除（默认不删，留给 caller 用 removeSource:true 显式决定）。
export function adoptEntity(api, entity, opts = {}) {
  if (!entity) return { ok: false, error: 'entity 为空' };
  const props = entity.properties;
  const get = (k) => (props && props[k] && props[k].getValue ? props[k].getValue() : props && props[k]);
  let kind; let positions = [];
  if (entity.position && (!entity.polyline && !entity.polygon)) {
    kind = 'point';
    const p = entity.position.getValue ? entity.position.getValue() : entity.position;
    positions = [p];
  } else if (entity.polyline && entity.polyline.positions) {
    kind = 'polyline';
    const p = entity.polyline.positions.getValue ? entity.polyline.positions.getValue() : entity.polyline.positions;
    positions = (p && p.length) ? p : [];
  } else if (entity.polygon && entity.polygon.hierarchy) {
    kind = 'polygon';
    const h = entity.polygon.hierarchy.getValue ? entity.polygon.hierarchy.getValue() : entity.polygon.hierarchy;
    positions = h && h.positions ? h.positions : (Array.isArray(h) ? h : []);
  } else {
    return { ok: false, error: '不支持的几何类型' };
  }
  if (!positions.length && kind !== 'point') return { ok: false, error: '顶点为空' };
  const input = {
    id: opts.featureId || newFeatureId(kind),
    name: entity.name || kind,
    positions,
    layerId: opts.layerId || 'default',
    attrs: opts.attrs || {},
  };
  const result = addEditorFeature(api, input);
  if (!result.ok) return result;
  if (opts.removeSource) {
    try { api.getViewer().entities.remove(entity); } catch (_) {}
  }
  return result;
}
