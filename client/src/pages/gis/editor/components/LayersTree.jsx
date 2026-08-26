// LayersTree — 图层 + 要素的层级列表(ArcGIS / QGIS 风格的 TOC)
// 每个图层可展开/折叠,内部列出该图层的要素
// 行内操作:👁 显隐 / 选择(单击高亮) / 飞向 / 删除
// 图层行操作:👁 整体显隐 / 全选 / 全不选 / 反选 / 删除图层

import { useState } from 'react';

const KIND_LABEL = {
  point: '点', polyline: '折线', polygon: '多边形',
  rect: '矩形', circle: '圆', freehand: '手绘',
};

export default function LayersTree({
  layers,
  features,
  activeLayerId,
  selectedIds,
  expandedIds,
  onToggleExpand,
  onSelectLayer,
  onCreateLayer,
  onDeleteLayer,
  onLayerVisibility,
  onFeatureVisibility,
  onSelectFeature,
  onSelectAllInLayer,
  onSelectNoneInLayer,
  onSelectInvertInLayer,
  onFlyTo,
  onDeleteFeature,
  onLayerAssign,
}) {
  return (
    <div className="editor-layer-tree">
      {layers.map((l) => {
        const layerFeatures = features.filter((f) => f.layerId === l.id);
        const isExpanded = expandedIds.has(l.id);
        const isActive = activeLayerId === l.id;
        return (
          <div
            key={l.id}
            className={
              'editor-layer-row'
              + (isExpanded ? ' expanded' : '')
              + (isActive ? ' active' : '')
            }
          >
            <div className="editor-layer-header" onClick={() => onSelectLayer(l.id)}>
              <button
                className="icon-btn expand-btn"
                onClick={(e) => { e.stopPropagation(); onToggleExpand(l.id); }}
                title={isExpanded ? '折叠' : '展开'}
              >{isExpanded ? '▾' : '▸'}</button>
              <button
                className="icon-btn"
                onClick={(e) => { e.stopPropagation(); onLayerVisibility(l.id); }}
                title={l.visible === false ? '显示图层' : '隐藏图层'}
              >{l.visible === false ? '🚫' : '👁'}</button>
              <span className="editor-layer-name">{l.name}</span>
              <span className="editor-layer-count">{layerFeatures.length}</span>
              {l.id !== 'default' && (
                <button
                  className="icon-btn danger"
                  onClick={(e) => { e.stopPropagation(); onDeleteLayer(l.id); }}
                  title="删除图层(要素归入默认)"
                >✕</button>
              )}
            </div>
            {isExpanded && (
              <ul className="editor-layer-features">
                {layerFeatures.length === 0 ? (
                  <li className="editor-layer-empty">（空）</li>
                ) : layerFeatures.map((f) => {
                  const sel = selectedIds.has(f.featureId);
                  return (
                    <li
                      key={f.featureId}
                      className={'editor-feature-row' + (sel ? ' selected' : '')}
                      onClick={(e) => {
                        // Shift/Ctrl 多选提示已在外面 hint 中说明
                        if (e.shiftKey || e.ctrlKey || e.metaKey) {
                          const next = new Set(selectedIds);
                          if (next.has(f.featureId)) next.delete(f.featureId);
                          else next.add(f.featureId);
                          onSelectFeature && onSelectFeature(next);
                        } else {
                          onSelectFeature(new Set([f.featureId]));
                        }
                      }}
                      title="单击选中 · Shift/Ctrl 多选"
                    >
                      <button
                        className="icon-btn"
                        onClick={(e) => { e.stopPropagation(); onFeatureVisibility(f.featureId); }}
                        title={f.visible === false ? '显示' : '隐藏'}
                      >{f.visible === false ? '👁‍🗨' : '👁'}</button>
                      <span className="editor-feature-kind">{KIND_LABEL[f.kind] || f.kind}</span>
                      <span className="editor-feature-name">
                        {f.name || f.featureId}
                      </span>
                      <button
                        className="icon-btn"
                        onClick={(e) => { e.stopPropagation(); onFlyTo(f.featureId); }}
                        title="飞向"
                      >🎯</button>
                      <button
                        className="icon-btn danger"
                        onClick={(e) => { e.stopPropagation(); onDeleteFeature(f.featureId); }}
                        title="删除"
                      >✕</button>
                    </li>
                  );
                })}
                {layerFeatures.length > 0 && (
                  <li className="editor-layer-bulk-actions">
                    <button onClick={() => onSelectAllInLayer(l.id)}>全选</button>
                    <button onClick={() => onSelectNoneInLayer(l.id)}>全不选</button>
                    <button onClick={() => onSelectInvertInLayer(l.id)}>反选</button>
                  </li>
                )}
              </ul>
            )}
          </div>
        );
      })}
      <button className="btn-link editor-layer-add-btn" onClick={onCreateLayer}>+ 新建图层</button>
    </div>
  );
}