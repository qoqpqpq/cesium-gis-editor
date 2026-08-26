// StylePanel — 选中要素时的样式弹窗
// 写入 entity 的 point/polyline/polygon 的颜色/宽度/不透明度
// 多选时同时应用到所有选中要素
// 通过 StyleCommand 入栈 undo

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import * as Cesium from 'cesium';
import { StyleCommand, BatchStyleCommand } from './utils/commands.js';
import { useUndoStack } from './hooks/useUndoStack.js';
import { useDraggableResizable } from './hooks/useDraggableResizable.js';
import { collectFields } from './utils/attrs.js';
import { classifyFeatures, RAMPS } from './utils/classify.js';

export default function StylePanel({ api, open, selectedIds, features, refresh, pushCommand }) {
  const panelRef = useRef(null);
  useDraggableResizable({
    ref: panelRef,
    storageKey: 'editor-style-panel',
    defaultSize: { w: 280, h: 320 },
    defaultPosition: { x: window.innerWidth - 320, y: 80 },
    dragHandleSelector: '.editor-style-panel-header',
  });

  // 从选中的要素聚合当前样式（取第一个有效样式作为基准）
  const baseStyle = useMemo(() => {
    const sel = features.filter((f) => selectedIds.has(f.featureId));
    if (!sel.length) return null;
    return sel[0].style || null;
  }, [features, selectedIds]);

  const [draft, setDraft] = useState(null);
  useEffect(() => {
    setDraft(baseStyle ? { ...baseStyle } : null);
  }, [baseStyle]);

  const undoApi = useUndoStack();
  // 实时从 editor DS 拉 entities（不用 features 闭包）
  const liveEntitiesRef = useMemo(() => {
    return {
      getEntities() {
        if (!api || !api.getEditorDataSource) return [];
        const ds = api.getEditorDataSource();
        if (!ds || !ds.entities) return [];
        return ds.entities.values.filter((e) => {
          const p = e.properties;
          if (!p) return false;
          const fid = p.featureId && p.featureId.getValue
            ? p.featureId.getValue() : p.featureId;
          return fid && selectedIds.has(fid);
        });
      },
    };
  }, [api, selectedIds]);

  const apply = useCallback((patch) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    const ents = liveEntitiesRef.getEntities();
    if (!ents.length) return;
    // 收集旧 styles → 推 undo
    const oldStyles = ents.map((e) => {
      const p = e.properties;
      const old = p.style && p.style.getValue ? p.style.getValue() : p.style;
      return { entity: e, oldStyle: old ? { ...old } : null };
    });
    // 应用 patch
    ents.forEach((e) => {
      const p = e.properties;
      const old = p.style && p.style.getValue ? p.style.getValue() : p.style;
      const merged = { ...(old || {}), ...patch };
      try { p.style = merged; } catch (_) {}
      if (e.point) {
        if (patch.pointSize != null) e.point.pixelSize = patch.pointSize;
        if (patch.pointColor) e.point.color = Cesium.Color.fromCssColorString(patch.pointColor);
      }
      if (e.polyline) {
        if (patch.strokeWidth != null) e.polyline.width = patch.strokeWidth;
        if (patch.strokeColor) e.polyline.material = Cesium.Color.fromCssColorString(patch.strokeColor);
      }
      if (e.polygon) {
        if (patch.strokeWidth != null) e.polygon.outlineWidth = patch.strokeWidth;
        if (patch.strokeColor) e.polygon.outlineColor = Cesium.Color.fromCssColorString(patch.strokeColor);
        if (patch.fillColor) e.polygon.material = Cesium.Color.fromCssColorString(patch.fillColor);
      }
    });
    // 推一个合并的 StyleCommand：do 应用新 patch，undo 应用 oldStyles
    const newStyle = patch;
    const cmd = {
      label: '修改样式',
      do() {
        liveEntitiesRef.getEntities().forEach((e) => {
          const p = e.properties;
          const old = p.style && p.style.getValue ? p.style.getValue() : p.style;
          const merged = { ...(old || {}), ...newStyle };
          try { p.style = merged; } catch (_) {}
          if (e.point) {
            if (newStyle.pointSize != null) e.point.pixelSize = newStyle.pointSize;
            if (newStyle.pointColor) e.point.color = Cesium.Color.fromCssColorString(newStyle.pointColor);
          }
          if (e.polyline) {
            if (newStyle.strokeWidth != null) e.polyline.width = newStyle.strokeWidth;
            if (newStyle.strokeColor) e.polyline.material = Cesium.Color.fromCssColorString(newStyle.strokeColor);
          }
          if (e.polygon) {
            if (newStyle.strokeWidth != null) e.polygon.outlineWidth = newStyle.strokeWidth;
            if (newStyle.strokeColor) e.polygon.outlineColor = Cesium.Color.fromCssColorString(newStyle.strokeColor);
            if (newStyle.fillColor) e.polygon.material = Cesium.Color.fromCssColorString(newStyle.fillColor);
          }
        });
        refresh && refresh();
      },
      undo() {
        oldStyles.forEach(({ entity, oldStyle }) => {
          if (!entity) return;
          const e = entity;
          if (oldStyle) {
            try { e.properties.style = { ...oldStyle }; } catch (_) {}
          }
          if (e.point && oldStyle) {
            if (oldStyle.pointSize != null) e.point.pixelSize = oldStyle.pointSize;
            if (oldStyle.pointColor) e.point.color = Cesium.Color.fromCssColorString(oldStyle.pointColor);
          }
          if (e.polyline && oldStyle) {
            if (oldStyle.strokeWidth != null) e.polyline.width = oldStyle.strokeWidth;
            if (oldStyle.strokeColor) e.polyline.material = Cesium.Color.fromCssColorString(oldStyle.strokeColor);
          }
          if (e.polygon && oldStyle) {
            if (oldStyle.strokeWidth != null) e.polygon.outlineWidth = oldStyle.strokeWidth;
            if (oldStyle.strokeColor) e.polygon.outlineColor = Cesium.Color.fromCssColorString(oldStyle.strokeColor);
            if (oldStyle.fillColor) e.polygon.material = Cesium.Color.fromCssColorString(oldStyle.fillColor);
          }
        });
        refresh && refresh();
      },
    };
    undoApi.push(cmd);
    refresh && refresh();
  }, [liveEntitiesRef, undoApi, refresh]);

  // ============ 主题可视化（按属性） ============
  // hooks 必须在 early return 之前调用,否则触发 React #310
  const [thematicField, setThematicField] = useState('');
  const [thematicMethod, setThematicMethod] = useState('quantile');
  const [thematicN, setThematicN] = useState(5);
  const [thematicRamp, setThematicRamp] = useState('Blues');

  // 收集所有 attrs 字段（来自 features，不限于 selected）
  const attrFieldList = useMemo(() => {
    const fakes = features.map((f) => ({ properties: { attrs: f.attrs || {} } }));
    return collectFields(fakes);
  }, [features]);

  // 主题可应用范围：选中或图层
  const thematicScope = useMemo(() => {
    const ds = api && api.getEditorDataSource && api.getEditorDataSource();
    if (!ds) return { entities: [], label: '' };
    if (selectedIds && selectedIds.size > 0) {
      const ents = Array.from(selectedIds).map((fid) => ds.entities.getById(fid)).filter(Boolean);
      return { entities: ents, label: `已选 ${ents.length}` };
    }
    // 没选中 → 用 activeLayerId 编辑器不知道此 panel，所以直接给全部
    const all = ds.entities.values.filter((e) => {
      const p = e.properties;
      if (!p) return false;
      const k = p.kind && (p.kind.getValue ? p.kind.getValue() : p.kind);
      return k && k !== 'draft' && k !== '__measurement__';
    });
    return { entities: all, label: `全部 ${all.length}` };
  }, [api, selectedIds, features]);

  const applyThematic = useCallback(() => {
    if (!api || !thematicField || !attrFieldList.find((f) => f.name === thematicField)) return;
    const ds = api.getEditorDataSource && api.getEditorDataSource();
    if (!ds) return;
    const ents = thematicScope.entities;
    if (!ents.length) return;
    // 把 entity 转成 feature 形态（featureId / attrs）
    const fakes = ents.map((e) => {
      const p = e.properties;
      const fid = p && p.featureId ? (p.featureId.getValue ? p.featureId.getValue() : p.featureId) : null;
      const raw = p && p.attrs ? (p.attrs.getValue ? p.attrs.getValue() : p.attrs) : {};
      return { featureId: fid, attrs: raw };
    });
    const palette = classifyFeatures(fakes, thematicField, {
      method: thematicMethod,
      n: thematicN,
      ramp: thematicRamp,
      alpha: 0.7,
    });
    const patches = [];
    ents.forEach((ent) => {
      const p = ent.properties;
      const fid = p && p.featureId ? (p.featureId.getValue ? p.featureId.getValue() : p.featureId) : null;
      if (!fid) return;
      const cls = palette.get(fid);
      if (!cls) return;
      const oldStyle = p.style && (p.style.getValue ? p.style.getValue() : p.style);
      const oldStyleClone = oldStyle ? { ...oldStyle } : null;
      const newStyle = { ...(oldStyle || {}), fillColor: cls.fillColor };
      patches.push({ entity: ent, oldStyle: oldStyleClone, newStyle });
    });
    if (!patches.length) return;
    // 用 BatchStyleCommand + 入 StylePanel 本地栈（已知 bug，全局栈不共享）
    const cmd = BatchStyleCommand(api, `按属性 ${thematicField} 着色`, patches, refresh);
    if (cmd) undoApi.push(cmd);
    refresh && refresh();
  }, [api, thematicField, thematicMethod, thematicN, thematicRamp, thematicScope, attrFieldList, refresh, undoApi]);

  if (!open || selectedIds.size === 0 || !draft) return null;

  return (
    <div className="editor-style-panel" ref={panelRef}>
      <div className="editor-style-panel-header">
        <span>🎨 样式</span>
        <span className="editor-meta">已选 {selectedIds.size}</span>
      </div>
      <ThematicTabs
        manual={
          <>
            <div className="editor-style-row">
              <label>点大小</label>
              <input type="range" min="4" max="40" value={draft.pointSize || 10}
                onChange={(e) => apply({ pointSize: parseInt(e.target.value, 10) })} />
              <span className="editor-style-val">{draft.pointSize || 10}</span>
            </div>
            <div className="editor-style-row">
              <label>点颜色</label>
              <input type="color" value={hexFromCss(draft.pointColor) || '#fbbf24'}
                onChange={(e) => apply({ pointColor: e.target.value })} />
            </div>
            <div className="editor-style-row">
              <label>线颜色</label>
              <input type="color" value={hexFromCss(draft.strokeColor) || '#6c8cff'}
                onChange={(e) => apply({ strokeColor: e.target.value })} />
            </div>
            <div className="editor-style-row">
              <label>线宽</label>
              <input type="range" min="1" max="12" value={draft.strokeWidth || 2}
                onChange={(e) => apply({ strokeWidth: parseInt(e.target.value, 10) })} />
              <span className="editor-style-val">{draft.strokeWidth || 2}</span>
            </div>
            <div className="editor-style-row">
              <label>填充</label>
              <input type="color" value={hexFromCss(draft.fillColor) || '#6c8cff'}
                onChange={(e) => apply({ fillColor: rgbaFromHex(e.target.value, alphaFromCss(draft.fillColor)) })} />
              <input type="range" min="0" max="1" step="0.05"
                value={alphaFromCss(draft.fillColor)}
                onChange={(e) => apply({ fillColor: rgbaFromHex(hexFromCss(draft.fillColor) || '#6c8cff', parseFloat(e.target.value)) })}
                style={{ width: 60 }} />
              <span className="editor-style-val">{alphaFromCss(draft.fillColor).toFixed(2)}</span>
            </div>
            <div className="editor-style-row">
              <label>名称</label>
              <input
                type="text"
                defaultValue={draft.name || ''}
                placeholder="(批量重命名)"
                onBlur={(e) => {
                  const name = e.target.value;
                  if (name === draft.name) return;
                  setDraft({ ...draft, name });
                  const ds = api && api.getEditorDataSource && api.getEditorDataSource();
                  if (!ds) return;
                  ds.entities.values.forEach((ent) => {
                    const props = ent.properties;
                    if (!props) return;
                    const fid = props.featureId && props.featureId.getValue
                      ? props.featureId.getValue() : props.featureId;
                    if (fid && selectedIds.has(fid)) ent.name = name;
                  });
                }}
              />
            </div>
          </>
        }
        thematic={
          <>
            <div className="thematic-info">
              将作用于：<strong>{thematicScope.label}</strong>
              {attrFieldList.length === 0 && (
                <div className="analysis-hint" style={{ marginTop: 6 }}>暂无任何属性字段，先在属性表添加</div>
              )}
            </div>
            <div className="editor-style-row">
              <label>字段</label>
              <select value={thematicField} onChange={(e) => setThematicField(e.target.value)} style={{ flex: 1 }}>
                <option value="">— 选字段 —</option>
                {attrFieldList.map((f) => (
                  <option key={f.name} value={f.name}>{f.name} ({f.type})</option>
                ))}
              </select>
            </div>
            <div className="editor-style-row">
              <label>方法</label>
              <select value={thematicMethod} onChange={(e) => setThematicMethod(e.target.value)} style={{ flex: 1 }}>
                <option value="quantile">分位数</option>
                <option value="equal">等间隔</option>
                <option value="unique">唯一值</option>
              </select>
            </div>
            {thematicMethod !== 'unique' && (
              <div className="editor-style-row">
                <label>分级</label>
                <input type="range" min={3} max={9}
                  value={thematicN}
                  onChange={(e) => setThematicN(parseInt(e.target.value, 10))} />
                <span className="editor-style-val">{thematicN}</span>
              </div>
            )}
            <div className="editor-style-row">
              <label>色卡</label>
              <select value={thematicRamp} onChange={(e) => setThematicRamp(e.target.value)} style={{ flex: 1 }}>
                {RAMPS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="editor-style-row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
              <button
                className="attr-table-btn"
                onClick={applyThematic}
                disabled={!thematicField}
              >应用到地图</button>
            </div>
          </>
        }
      />
    </div>
  );
}

function ThematicTabs({ manual, thematic }) {
  const [tab, setTab] = useState('manual');
  return (
    <>
      <div className="style-panel-tabs">
        <div className={'style-panel-tab' + (tab === 'manual' ? ' active' : '')} onClick={() => setTab('manual')}>手动</div>
        <div className={'style-panel-tab' + (tab === 'thematic' ? ' active' : '')} onClick={() => setTab('thematic')}>按属性</div>
      </div>
      {tab === 'manual' ? manual : thematic}
    </>
  );
}

function hexFromCss(css) {
  if (!css) return '#000000';
  const m = css.match(/^#([0-9a-f]{6})/i);
  if (m) return '#' + m[1];
  const m2 = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m2) {
    const r = parseInt(m2[1]).toString(16).padStart(2, '0');
    const g = parseInt(m2[2]).toString(16).padStart(2, '0');
    const b = parseInt(m2[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  return '#000000';
}

function rgbaFromHex(hex, alpha) {
  if (!hex || hex[0] !== '#') return 'rgba(108,140,255,0.35)';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function alphaFromCss(css) {
  if (!css) return 1;
  const m = css.match(/rgba?\([^)]*?,\s*([\d.]+)\s*\)/i);
  return m ? parseFloat(m[1]) : 1;
}
