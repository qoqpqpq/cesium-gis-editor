// commands — 把各操作包成可 do/undo 的命令对象

import * as Cesium from 'cesium';
import { newFeatureId } from './geometry.js';
import { RESERVED, readAttrs, writeAttrs } from './attrs.js';
import { buildFeatureOptions } from './featureFactory.js';

// 通用：从 entity 抽取出可序列化的 feature
export function snapshotEntity(entity) {
  if (!entity) return null;
  const props = entity.properties;
  const get = (k) => (props && props[k] && props[k].getValue ? props[k].getValue() : props && props[k]);
  const kind = get('kind');
  const featureId = get('featureId');
  if (!kind || !featureId) return null;
  let positions = [];
  if (kind === 'point') {
    const c = entity.position && (entity.position.getValue ? entity.position.getValue() : entity.position);
    if (c) positions = [c];
  } else if (entity.polyline && entity.polyline.positions) {
    const p = entity.polyline.positions.getValue ? entity.polyline.positions.getValue() : entity.polyline.positions;
    positions = (p && p.length) ? p : [];
  } else if (entity.polygon && entity.polygon.hierarchy) {
    const h = entity.polygon.hierarchy.getValue ? entity.polygon.hierarchy.getValue() : entity.polygon.hierarchy;
    positions = (h && h.positions) ? h.positions : [];
  }
  const attrs = get('attrs');
  return { featureId, kind, layerId: get('layerId'), style: get('style'), name: entity.name, positions, attrs: attrs && typeof attrs === 'object' ? attrs : {} };
}

// 重建 entity（克隆一个 feature → 新 entity）
export function rebuildFromSnapshot(api, snap, newFeatureIdStr) {
  if (!snap) return null;
  const feature = { ...snap, featureId: newFeatureIdStr || snap.featureId };
  const opts = buildFeatureOptions(feature);
  return api.addEditorEntity(opts);
}

// AddCommand: 创建一个新要素
// 注意：构造时 entity 已被 useDrawing 创建好（do 阶段）。
// undo 时移除；redo 时重新创建。
export function AddCommand(api, snap, refresh) {
  const fid = snap.featureId || newFeatureId(snap.kind);
  return {
    label: `添加 ${snap.kind}`,
    do() {
      // 如果已被 useDrawing 创建过，do 是 no-op；redo 时才真正 add
      const ds = api.getEditorDataSource();
      if (!ds.entities.getById(fid)) {
        rebuildFromSnapshot(api, snap, fid);
      }
      refresh && refresh();
    },
    undo() {
      const ds = api.getEditorDataSource();
      const ent = ds.entities.getById(fid);
      if (ent) ds.entities.remove(ent);
      refresh && refresh();
    },
  };
}

// DeleteCommand: 删除一个要素
export function DeleteCommand(api, entity, refresh) {
  const snap = snapshotEntity(entity);
  if (!snap) return null;
  return {
    label: `删除 ${snap.kind}`,
    do() {
      const ds = api.getEditorDataSource();
      const ent = ds.entities.getById(snap.featureId);
      if (ent) ds.entities.remove(ent);
      refresh && refresh();
    },
    undo() {
      rebuildFromSnapshot(api, snap, snap.featureId);
      refresh && refresh();
    },
  };
}

// StyleCommand: 修改样式（深拷贝快照）
export function StyleCommand(api, entity, newStyle, refresh) {
  const props = entity.properties;
  const old = props.style && props.style.getValue ? props.style.getValue() : props.style;
  return {
    label: '修改样式',
    do() {
      const ds = api.getEditorDataSource();
      const ent = ds.entities.getById(snapId(entity));
      if (!ent) return;
      applyStyleToEntity(ent, newStyle);
      try { ent.properties.style = newStyle; } catch (_) {}
      refresh && refresh();
    },
    undo() {
      const ds = api.getEditorDataSource();
      const ent = ds.entities.getById(snapId(entity));
      if (!ent) return;
      applyStyleToEntity(ent, old);
      try { ent.properties.style = old; } catch (_) {}
      refresh && refresh();
    },
  };
}

function snapId(entity) {
  const props = entity.properties;
  if (!props) return null;
  return props.featureId && props.featureId.getValue ? props.featureId.getValue() : props.featureId;
}

export function applyStyleToEntity(entity, style) {
  if (!entity || !style) return;
  if (entity.point) {
    if (style.pointSize != null) entity.point.pixelSize = style.pointSize;
    if (style.pointColor) entity.point.color = Cesium.Color.fromCssColorString(style.pointColor);
  }
  if (entity.polyline) {
    if (style.strokeWidth != null) entity.polyline.width = style.strokeWidth;
    if (style.strokeColor) entity.polyline.material = Cesium.Color.fromCssColorString(style.strokeColor);
  }
  if (entity.polygon) {
    if (style.strokeWidth != null) entity.polygon.outlineWidth = style.strokeWidth;
    if (style.strokeColor) entity.polygon.outlineColor = Cesium.Color.fromCssColorString(style.strokeColor);
    if (style.fillColor) entity.polygon.material = Cesium.Color.fromCssColorString(style.fillColor);
  }
}

// VisibilityCommand
export function VisibilityCommand(api, entity, refresh) {
  const props = entity.properties;
  const fid = props && props.featureId && props.featureId.getValue ? props.featureId.getValue() : props.featureId;
  const wasVisible = entity.show !== false;
  return {
    label: wasVisible ? '隐藏要素' : '显示要素',
    do() {
      const ds = api.getEditorDataSource();
      const ent = ds.entities.getById(fid);
      if (ent) ent.show = !wasVisible;
      refresh && refresh();
    },
    undo() {
      const ds = api.getEditorDataSource();
      const ent = ds.entities.getById(fid);
      if (ent) ent.show = wasVisible;
      refresh && refresh();
    },
  };
}

// RenameCommand
export function RenameCommand(api, entity, newName, refresh) {
  const props = entity.properties;
  const fid = props && props.featureId && props.featureId.getValue ? props.featureId.getValue() : props.featureId;
  const oldName = entity.name;
  return {
    label: '重命名',
    do() {
      const ds = api.getEditorDataSource();
      const ent = ds.entities.getById(fid);
      if (ent) ent.name = newName;
      refresh && refresh();
    },
    undo() {
      const ds = api.getEditorDataSource();
      const ent = ds.entities.getById(fid);
      if (ent) ent.name = oldName;
      refresh && refresh();
    },
  };
}

// SimplifyCommand: 替换 entity 的 positions
// 用于 Douglas-Peucker 简化；do 阶段已经在外面 replace 了 entity.positions，
// undo 阶段需要把原始 positions 换回去。
// 重要：do 时机为 replace 已发生；redo 也是替换。
export function SimplifyCommand(api, entity, oldPositions, newPositions, refresh) {
  const props = entity.properties;
  const fid = props && props.featureId && props.featureId.getValue ? props.featureId.getValue() : props.featureId;
  const kind = props && props.kind && props.kind.getValue ? props.kind.getValue() : props.kind;
  return {
    label: '简化几何',
    do() {
      const ds = api.getEditorDataSource();
      const ent = ds.entities.getById(fid);
      if (!ent) return;
      applyPositions(ent, kind, newPositions);
      refresh && refresh();
    },
    undo() {
      const ds = api.getEditorDataSource();
      const ent = ds.entities.getById(fid);
      if (!ent) return;
      applyPositions(ent, kind, oldPositions);
      refresh && refresh();
    },
  };
}

function applyPositions(ent, kind, positions) {
  if (kind === 'point') {
    if (positions.length) ent.position = positions[0];
  } else if (ent.polyline) {
    ent.polyline.positions = new Cesium.CallbackProperty(() => positions, false);
  } else if (ent.polygon) {
    ent.polygon.hierarchy = new Cesium.CallbackProperty(
      () => new Cesium.PolygonHierarchy(positions),
      false
    );
  }
}

// ClearAllCommand: 清空编辑器并支持 undo
export function ClearAllCommand(api, refresh) {
  const ds = api.getEditorDataSource();
  const snaps = [];
  ds.entities.values.forEach((e) => {
    const s = snapshotEntity(e);
    if (s) snaps.push(s);
  });
  return {
    label: `清空所有 (${snaps.length})`,
    do() {
      const ds2 = api.getEditorDataSource();
      ds2.entities.removeAll();
      refresh && refresh();
    },
    undo() {
      snaps.forEach((s) => rebuildFromSnapshot(api, s, s.featureId));
      refresh && refresh();
    },
  };
}

// ============ 属性表相关命令 ============

// AttrCommand: 修改单个 entity 的一个 attrs 字段
export function AttrCommand(api, fid, key, oldVal, newVal, refresh) {
  return {
    label: '修改属性',
    do() {
      const ds = api.getEditorDataSource();
      const ent = ds && ds.entities.getById(fid);
      if (!ent) return;
      const cur = readAttrs(ent);
      const next = { ...cur };
      if (newVal === undefined || newVal === null || newVal === '') {
        delete next[key];
      } else {
        next[key] = newVal;
      }
      writeAttrs(ent, next);
      refresh && refresh();
    },
    undo() {
      const ds = api.getEditorDataSource();
      const ent = ds && ds.entities.getById(fid);
      if (!ent) return;
      const cur = readAttrs(ent);
      const next = { ...cur };
      if (oldVal === undefined || oldVal === null || oldVal === '') {
        delete next[key];
      } else {
        next[key] = oldVal;
      }
      writeAttrs(ent, next);
      refresh && refresh();
    },
  };
}

// AttrFieldCommand: 批量增删字段
// op: 'add' → 给每个 fid 加 key=defaultVal; 'drop' → 删除每个 fid 的 key
export function AttrFieldCommand(api, fids, key, op, defaultVal, refresh) {
  if (RESERVED.includes(key)) {
    console.warn('[AttrFieldCommand] refused reserved key:', key);
    return null;
  }
  const snapshot = fids.map((fid) => {
    const ds = api.getEditorDataSource();
    const ent = ds && ds.entities.getById(fid);
    const cur = readAttrs(ent);
    return { fid, had: Object.prototype.hasOwnProperty.call(cur, key), oldVal: cur[key] };
  });
  return {
    label: op === 'add' ? `添加字段 ${key}` : `删除字段 ${key}`,
    do() {
      fids.forEach((fid) => {
        const ds = api.getEditorDataSource();
        const ent = ds && ds.entities.getById(fid);
        if (!ent) return;
        const cur = readAttrs(ent);
        if (op === 'add') {
          writeAttrs(ent, { ...cur, [key]: defaultVal });
        } else {
          const next = { ...cur };
          delete next[key];
          writeAttrs(ent, next);
        }
      });
      refresh && refresh();
    },
    undo() {
      snapshot.forEach(({ fid, had, oldVal }) => {
        const ds = api.getEditorDataSource();
        const ent = ds && ds.entities.getById(fid);
        if (!ent) return;
        const cur = readAttrs(ent);
        if (op === 'add') {
          const next = { ...cur };
          delete next[key];
          writeAttrs(ent, next);
        } else {
          // 恢复
          if (!had) return;
          writeAttrs(ent, { ...cur, [key]: oldVal });
        }
      });
      refresh && refresh();
    },
  };
}

// ============ 空间分析复合命令 ============

// AnalysisCommand: 调用运行函数产出新要素并加入；undo 时整体移除
// runFn(api, sourceFids, params) → array of snap { featureId, kind, positions, style, name, attrs }
//   runFn 负责 rebuildFromSnapshot 添加并返回 snapshot 数组
// hideSources: 布尔运算才隐藏源要素；buffer/centroid/convexHull 需要与源要素对照查看
export function AnalysisCommand(api, opLabel, sourceFids, runFn, params, refresh, hideSources = true) {
  let producedSnaps = []; // 每次 do 时缓存
  let wasVisibleStates = sourceFids.map((fid) => {
    const ds = api.getEditorDataSource();
    const ent = ds && ds.entities.getById(fid);
    return { fid, visible: ent ? (ent.show !== false) : true };
  });
  const cmd = {
    label: `分析 ${opLabel}`,
    // 分析产出要素 IDs（do() 后可读）
    get producedFids() {
      return producedSnaps.map((s) => s.featureId);
    },
    do() {
      // 隐藏源要素避免视觉重叠
      if (hideSources) {
        const ds = api.getEditorDataSource();
        sourceFids.forEach((fid) => {
          const ent = ds && ds.entities.getById(fid);
          if (ent) ent.show = false;
        });
      }
      producedSnaps = runFn(api, sourceFids, params) || [];
      refresh && refresh();
    },
    undo() {
      const ds = api.getEditorDataSource();
      producedSnaps.forEach((snap) => {
        const ent = ds && ds.entities.getById(snap.featureId);
        if (ent) ds.entities.remove(ent);
      });
      // 恢复源要素可见
      if (hideSources) {
        wasVisibleStates.forEach(({ fid, visible }) => {
          const ent = ds && ds.entities.getById(fid);
          if (ent) ent.show = visible;
        });
      }
      refresh && refresh();
    },
  };
  return cmd;
}

// ============ 批量样式命令（thematic 用） ============

// BatchStyleCommand: 一次性修改多个 entity 的 style
// patches: array of { entity, oldStyle, newStyle }
export function BatchStyleCommand(api, label, patches, refresh) {
  return {
    label: label || '批量修改样式',
    do() {
      const ds = api.getEditorDataSource();
      patches.forEach(({ entity, newStyle }) => {
        if (!entity) return;
        const ent = ds.entities.getById(snapId(entity)) || entity;
        try { ent.properties.style = { ...newStyle }; } catch (_) {}
        applyStyleToEntity(ent, newStyle);
      });
      refresh && refresh();
    },
    undo() {
      const ds = api.getEditorDataSource();
      patches.forEach(({ entity, oldStyle }) => {
        if (!entity) return;
        const ent = ds.entities.getById(snapId(entity)) || entity;
        try { ent.properties.style = oldStyle ? { ...oldStyle } : null; } catch (_) {}
        if (oldStyle) applyStyleToEntity(ent, oldStyle);
      });
      refresh && refresh();
    },
  };
}

// LayerAssignCommand: 把若干要素迁到目标图层
// entities: Array<entity>（要迁的实体）
// newLayerId: string
// 旧 layerId 在 do() 时从实体的 properties 上现取，存到闭包；undo 时再写回
export function LayerAssignCommand(api, entities, newLayerId, refresh) {
  const items = entities.map((e) => {
    const props = e.properties;
    const fid = props && props.featureId && props.featureId.getValue
      ? props.featureId.getValue() : props && props.featureId;
    const lid = props && props.layerId && props.layerId.getValue
      ? props.layerId.getValue() : props && props.layerId;
    return { fid, oldLayerId: lid };
  });
  return {
    label: `移动 ${items.length} 个要素到图层「${newLayerId}」`,
    do() {
      const ds = api.getEditorDataSource();
      for (const it of items) {
        const ent = ds.entities.getById(it.fid);
        if (!ent) continue;
        try {
          // Cesium 把 entity.properties 当成 PropertyBag；直接赋对象会被包成 ConstantProperty
          if (ent.properties.layerId && ent.properties.layerId.setValue) {
            ent.properties.layerId.setValue(newLayerId);
          } else {
            ent.properties.layerId = newLayerId;
          }
        } catch (_) {}
      }
      refresh && refresh();
    },
    undo() {
      const ds = api.getEditorDataSource();
      for (const it of items) {
        const ent = ds.entities.getById(it.fid);
        if (!ent) continue;
        try {
          if (ent.properties.layerId && ent.properties.layerId.setValue) {
            ent.properties.layerId.setValue(it.oldLayerId);
          } else {
            ent.properties.layerId = it.oldLayerId;
          }
        } catch (_) {}
      }
      refresh && refresh();
    },
  };
}

// ============ 批量命令（一次 push，多要素同时 do/undo） ============

// BatchDeleteCommand: 一次性删除多个要素（避免 AI 删除 30 个产生 30 个 undo 条目）
// entities: Array<entity>
export function BatchDeleteCommand(api, entities, refresh) {
  const snaps = entities.map((e) => snapshotEntity(e)).filter(Boolean);
  return {
    label: `删除 ${snaps.length} 个要素`,
    do() {
      const ds = api.getEditorDataSource();
      snaps.forEach((s) => {
        const ent = ds && ds.entities.getById(s.featureId);
        if (ent) ds.entities.remove(ent);
      });
      refresh && refresh();
    },
    undo() {
      snaps.forEach((s) => rebuildFromSnapshot(api, s, s.featureId));
      refresh && refresh();
    },
  };
}

// BatchAttrCommand: 一次性修改一个要素的多个 attrs 字段
// fid: featureId; changes: { key: value, ... }; oldAttrs: 完整快照（构造时从 ent 现取）
// 备注：key='name' 时改成更新 entity.name（属性表 / LayersTree 都看 entity.name）；
// 其余 RESERVED 字段（kind/featureId/layerId/style）仍跳过，避免破坏契约。
export function BatchAttrCommand(api, fid, oldAttrs, changes, refresh) {
  const keys = Object.keys(changes);
  let prevName = null;
  return {
    label: `修改 ${keys.length} 个属性`,
    do() {
      const ds = api.getEditorDataSource();
      const ent = ds && ds.entities.getById(fid);
      if (!ent) return;
      // name 走 entity.name
      if ('name' in changes) {
        const nv = changes.name;
        if (nv !== undefined && nv !== null && nv !== '') {
          prevName = ent.name;
          ent.name = String(nv);
        }
      }
      const cur = readAttrs(ent);
      const next = { ...cur };
      keys.forEach((k) => {
        if (k === 'name') return; // 已处理
        if (RESERVED.includes(k)) return;
        const v = changes[k];
        if (v === undefined || v === null || v === '') delete next[k];
        else next[k] = v;
      });
      writeAttrs(ent, next);
      refresh && refresh();
    },
    undo() {
      const ds = api.getEditorDataSource();
      const ent = ds && ds.entities.getById(fid);
      if (!ent) return;
      if (prevName !== null) ent.name = prevName;
      writeAttrs(ent, { ...oldAttrs });
      refresh && refresh();
    },
  };
}

// LayerCreateCommand: 把 layer 对象插到 layers 数组；undo 时移除
// setLayers/setActiveLayerId 是 React setter；layer: { id, name, visible, locked }
export function LayerCreateCommand(setLayers, setActiveLayerId, layer, refresh) {
  let prevActive = null;
  return {
    label: `创建图层「${layer.name}」`,
    do() {
      prevActive = null;
      setLayers((arr) => (arr.some((l) => l.id === layer.id) ? arr : [...arr, { ...layer }]));
      if (setActiveLayerId) setActiveLayerId(layer.id);
      refresh && refresh();
    },
    undo() {
      setLayers((arr) => arr.filter((l) => l.id !== layer.id));
      if (setActiveLayerId && prevActive != null) setActiveLayerId(prevActive);
      refresh && refresh();
    },
  };
}

// LayerVisibilityCommand: 一次性切换整层可见性（避免每要素一个 undo）
// fids: 该层所有 featureIds; layerId: 目标图层; oldVisible/newVisible: 布尔
export function LayerVisibilityCommand(api, fids, layerId, oldVisible, newVisible, setLayers, refresh) {
  return {
    label: `${newVisible ? '显示' : '隐藏'} 图层`,
    do() {
      const ds = api.getEditorDataSource();
      fids.forEach((fid) => {
        const ent = ds && ds.entities.getById(fid);
        if (ent) ent.show = newVisible;
      });
      setLayers((arr) => arr.map((l) => (l.id === layerId ? { ...l, visible: newVisible } : l)));
      refresh && refresh();
    },
    undo() {
      const ds = api.getEditorDataSource();
      fids.forEach((fid) => {
        const ent = ds && ds.entities.getById(fid);
        if (ent) ent.show = oldVisible;
      });
      setLayers((arr) => arr.map((l) => (l.id === layerId ? { ...l, visible: oldVisible } : l)));
      refresh && refresh();
    },
  };
}