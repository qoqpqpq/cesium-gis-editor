// EditorToolbar — Tab式 GIS 编辑器工具栏
// Tab1: 绘制 + 测量
// Tab2: 图层 + 操作
// Tab3: 导入/导出 + 分析 + 三检（新增功能）
import { useState, useRef } from 'react';
import { useDraggableResizable } from './hooks/useDraggableResizable.js';
import LayersTree from './components/LayersTree.jsx';

const DRAW_TOOLS = [
  { id: 'select',        label: '选择',     icon: '👆' },
  { id: 'draw-point',    label: '点',       icon: '•' },
  { id: 'draw-polyline', label: '折线',     icon: '/' },
  { id: 'draw-polygon',  label: '多边形',   icon: '⬡' },
  { id: 'draw-rect',     label: '矩形',     icon: '▭' },
  { id: 'draw-circle',   label: '圆',       icon: '◯' },
  { id: 'draw-freehand', label: '手绘',     icon: '✎' },
  { id: 'edit-vertices', label: '顶点编辑', icon: '◇', needSelection: true },
];

const MEASURE_TOOLS = [
  { id: 'measure-distance', label: '测距', icon: '📏' },
  { id: 'measure-area',    label: '测面', icon: '▱' },
  { id: 'measure-height',  label: '测高', icon: '↕' },
];

const TABS = [
  { id: 'draw',   label: '绘制' },
  { id: 'layer',  label: '图层' },
  { id: 'tools',  label: '分析工具' },
];

export default function EditorToolbar({
  open,
  onToggle,
  viewerReady,
  mode,
  onModeChange,
  draftCount,
  measureLive,
  onClearMeasure,
  layers,
  activeLayerId,
  onSelectLayer,
  onCreateLayer,
  onDeleteLayer,
  expandedLayerIds,
  onToggleExpand,
  onLayerVisibility,
  features,
  selectedIds,
  onFeatureVisibility,
  onSelectFeature,
  onSelectAllInLayer,
  onSelectNoneInLayer,
  onSelectInvertInLayer,
  onFlyTo,
  onDeleteFeature,
  onLayerAssign,
  onPromoteDefault,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClearAll,
  onImport,
  onExportGeoJSON,
  onExportKML,
  onExportPNG,
  onFlyToActiveLayer,
  onToggleFullscreen,
  onShareView,
  selectedCount,
  onDelete,
  onDuplicate,
  snapSettings,
  onSnapChange,
  canSimplify,
  onSimplify,
  onToggleAttrTable,
  attrTableOpen,
  onToggleAnalysis,
  analysisOpen,
  onToggleThreeCheck,
  threeCheckOpen,
  onTogglePrintExport,
  printExportOpen,
}) {
  const popupRef = useRef(null);
  const [tab, setTab] = useState('draw');

  useDraggableResizable({
    ref: popupRef,
    storageKey: 'editor-toolbar',
    defaultSize: { w: 380, h: 620 },
    defaultPosition: { x: 20, y: 80 },
    dragHandleSelector: '.editor-popup-header',
  });

  return (
    <>
      <button className="editor-toolbar-btn" onClick={onToggle} aria-label="GIS 编辑器" title="GIS 编辑器">
        ✏️
      </button>

      {open && (
        <div className="editor-popup" ref={popupRef}>
          <div className="editor-popup-header">
            <span>✏️ GIS 编辑器</span>
            <button className="icon-btn" onClick={onToggle} aria-label="关闭 GIS 编辑器">✕</button>
          </div>

          {!viewerReady && (
            <div className="editor-loading-hint">🌐 地球正在加载…</div>
          )}

          {/* Tab 切换 */}
          <div className="et-tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={'et-tab' + (tab === t.id ? ' active' : '')}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ========== Tab1: 绘制 + 测量 ========== */}
          {tab === 'draw' && (
            <div className="et-tab-content">
              <div className="editor-popup-section">
                <div className="editor-section-title">绘制工具</div>
                <div className="editor-tool-grid">
                  {DRAW_TOOLS.map((t) => {
                    const disabled = t.needSelection && selectedCount !== 1;
                    return (
                      <button
                        key={t.id}
                        className={'editor-tool-btn' + (mode === t.id ? ' active' : '')}
                        onClick={() => onModeChange(disabled ? mode : (mode === t.id ? 'idle' : t.id))}
                        title={disabled ? `需先选中一个要素（${t.label}）` : t.label}
                        disabled={disabled}
                      >
                        <span className="editor-tool-icon">{t.icon}</span>
                        <span className="editor-tool-label">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
                {(mode === 'draw-polyline' || mode === 'draw-polygon') && draftCount > 0 && (
                  <div className="editor-draft-hint">已加 {draftCount} 个顶点 · 双击或右键完成</div>
                )}
                {(mode === 'draw-rect' || mode === 'draw-circle') && draftCount > 0 && (
                  <div className="editor-draft-hint">{draftCount === 1 ? '点击第二点完成' : '准备就绪'}</div>
                )}
                {mode === 'draw-freehand' && (
                  <div className="editor-draft-hint">按住鼠标拖动绘制，松开完成</div>
                )}
              </div>

              <div className="editor-popup-section">
                <div className="editor-section-title">
                  测量工具
                  {(mode === 'measure-distance' || mode === 'measure-area' || mode === 'measure-height') && (
                    <button className="btn-link" style={{ marginLeft: 8, fontSize: 10 }} onClick={onClearMeasure}>✕ 清空</button>
                  )}
                </div>
                <div className="editor-tool-grid">
                  {MEASURE_TOOLS.map((t) => (
                    <button
                      key={t.id}
                      className={'editor-tool-btn' + (mode === t.id ? ' active' : '')}
                      onClick={() => onModeChange(mode === t.id ? 'idle' : t.id)}
                      title={t.label}
                    >
                      <span className="editor-tool-icon">{t.icon}</span>
                      <span className="editor-tool-label">{t.label}</span>
                    </button>
                  ))}
                </div>
                {measureLive && (measureLive.distance || measureLive.area || measureLive.height) && (
                  <div className="editor-measure-readout">
                    {measureLive.distance && <span>📏 {measureLive.distance}</span>}
                    {measureLive.area    && <span>▱ {measureLive.area}</span>}
                    {measureLive.height  && <span>↕ {measureLive.height}</span>}
                  </div>
                )}
                {(mode === 'measure-distance' || mode === 'measure-area') && (
                  <div className="editor-draft-hint">点击加点 · 右键撤销 · 双击完成</div>
                )}
                {mode === 'measure-height' && (
                  <div className="editor-draft-hint">点击两点地面 → 显示高差</div>
                )}
              </div>

              <div className="editor-popup-section">
                <div className="editor-section-title">绘图辅助</div>
                <div className="editor-snap-row">
                  <label className="editor-snap-toggle" htmlFor="snap-vertex-toggle">
                    <input id="snap-vertex-toggle" type="checkbox" checked={!!snapSettings?.vertex}
                      onChange={(e) => onSnapChange && onSnapChange({ ...snapSettings, vertex: e.target.checked })} />
                    <span>顶点吸附</span>
                  </label>
                  <label className="editor-snap-toggle" htmlFor="snap-edge-toggle">
                    <input id="snap-edge-toggle" type="checkbox" checked={!!snapSettings?.edge}
                      onChange={(e) => onSnapChange && onSnapChange({ ...snapSettings, edge: e.target.checked })} />
                    <span>边吸附</span>
                  </label>
                  <label className="editor-snap-toggle" htmlFor="snap-grid-toggle" style={{ opacity: 0.45 }}>
                    <input id="snap-grid-toggle" type="checkbox" disabled />
                    <span>格网（待）</span>
                  </label>
                </div>
                <div className="editor-snap-tol-row">
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>容差</span>
                  <input type="range" min={4} max={32} step={1}
                    aria-label="顶点吸附容差（像素）"
                    title="容差（像素）：点击/绘制时顶点吸附的最大距离"
                    value={snapSettings?.tolPx ?? 12}
                    onChange={(e) => onSnapChange && onSnapChange({ ...snapSettings, tolPx: parseInt(e.target.value, 10) })} />
                  <span className="editor-snap-tol-val">{snapSettings?.tolPx ?? 12}px</span>
                </div>
              </div>
            </div>
          )}

          {/* ========== Tab2: 图层 + 操作 ========== */}
          {tab === 'layer' && (
            <div className="et-tab-content">
              <div className="editor-popup-section">
                <div className="editor-section-title">
                  图层 · 要素
                  <span className="editor-section-meta">{layers.length} 图层 · {features.length} 要素</span>
                </div>
                <LayersTree
                  layers={layers}
                  features={features}
                  activeLayerId={activeLayerId}
                  selectedIds={selectedIds || new Set()}
                  expandedIds={expandedLayerIds || new Set()}
                  onToggleExpand={onToggleExpand}
                  onSelectLayer={onSelectLayer}
                  onCreateLayer={onCreateLayer}
                  onDeleteLayer={onDeleteLayer}
                  onLayerVisibility={onLayerVisibility}
                  onFeatureVisibility={onFeatureVisibility}
                  onSelectFeature={onSelectFeature}
                  onSelectAllInLayer={onSelectAllInLayer}
                  onSelectNoneInLayer={onSelectNoneInLayer}
                  onSelectInvertInLayer={onSelectInvertInLayer}
                  onFlyTo={onFlyTo}
                  onDeleteFeature={onDeleteFeature}
                  onLayerAssign={onLayerAssign}
                />
                <button className="btn-link" style={{ marginTop: 6, fontSize: 11 }} onClick={onPromoteDefault}
                  title="把默认图层里残留的要素迁到新图层">
                  📤 整理默认图层
                </button>
              </div>

              <div className="editor-popup-section">
                <div className="editor-section-title">视图导航</div>
                <div className="editor-action-row" style={{ flexWrap: 'wrap', gap: 4 }}>
                  <button className="btn-link" onClick={onFlyToActiveLayer} title="把相机飞到当前选中图层的全部要素范围">🎯 缩放至图层</button>
                  <button className="btn-link" onClick={onToggleFullscreen} title="进入或退出浏览器原生全屏">⛶ 全屏</button>
                  <button className="btn-link" onClick={onShareView} title="复制当前视图 URL 到剪贴板（相机姿态 + 选中图层 + 坐标格式）">🔗 分享视图</button>
                </div>
              </div>

              <div className="editor-popup-section">
                <div className="editor-section-title">操作</div>
                <div className="editor-action-row">
                  <button className="btn-link" onClick={onUndo} disabled={!canUndo}>↶ 撤销</button>
                  <button className="btn-link" onClick={onRedo} disabled={!canRedo}>↷ 重做</button>
                  <button className="btn-link danger" onClick={onClearAll}>🗑 清空</button>
                </div>
                {selectedCount > 0 && (
                  <>
                    <div className="editor-action-row" style={{ marginTop: 6 }}>
                      <span style={{ color: 'var(--muted)', fontSize: 11 }}>已选 {selectedCount}</span>
                      <button className="btn-link" onClick={onDuplicate}>⎘ 复制</button>
                      <button className="btn-link" onClick={onSimplify} disabled={!canSimplify}
                        title={canSimplify ? 'Douglas-Peucker 简化' : '仅线/面可简化'}>🧮 简化</button>
                      <button className="btn-link danger" onClick={onDelete}>✕ 删除</button>
                    </div>
                    <div className="editor-hint">💡 Shift/Ctrl+点击多选 · 图层面板点行选中</div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ========== Tab3: 导入/导出 + 分析工具 ========== */}
          {tab === 'tools' && (
            <div className="et-tab-content">
              <div className="editor-popup-section">
                <div className="editor-section-title">导入 / 导出</div>
                <div className="editor-action-row" style={{ flexWrap: 'wrap', gap: 4 }}>
                  <button className="btn-link" onClick={onImport}>📥 导入</button>
                  <button className="btn-link" onClick={onExportGeoJSON}>📤 GeoJSON</button>
                  <button className="btn-link" onClick={onExportKML}>📤 KML</button>
                  <button className="btn-link" onClick={onExportPNG}>📷 截图</button>
                </div>
                <div className="editor-action-row" style={{ marginTop: 6 }}>
                  <button
                    className={'btn-link' + (attrTableOpen ? ' active' : '')}
                    onClick={onToggleAttrTable}
                    title="打开/关闭属性表面板"
                    aria-label="打开或关闭属性表面板"
                  >📊 属性表</button>
                </div>
              </div>

              <div className="editor-popup-section et-highlight-section">
                <div className="editor-section-title">🔬 空间分析</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                  7 种操作：Buffer · 交集 · 并集 · 差集 · 质心 · 凸包 · 溶解
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                  支持 ☁️ 服务端运行（适合大文件不卡主线程）
                </div>
                <button className={'btn-link' + (analysisOpen ? ' active' : '')} onClick={onToggleAnalysis}
                  title={analysisOpen ? '关闭空间分析面板' : '打开空间分析面板'}
                  aria-label={analysisOpen ? '关闭空间分析面板' : '打开空间分析面板'}
                  style={{ width: '100%', justifyContent: 'center', padding: '6px 0' }}>
                  🔬 {analysisOpen ? '关闭' : '打开'} 空间分析面板
                </button>
              </div>

              <div className="editor-popup-section et-highlight-section">
                <div className="editor-section-title">🧪 三项检查 <span style={{ color: 'var(--new-feature)', fontSize: 10 }}>NEW</span></div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                  分析前先过一遍：位置 / 几何 / 属性三项质控
                </div>
                <button className={'btn-link' + (threeCheckOpen ? ' active' : '')} onClick={onToggleThreeCheck}
                  style={{ width: '100%', justifyContent: 'center', padding: '6px 0' }}>
                  🧪 {threeCheckOpen ? '关闭' : '打开'} 三项检查
                </button>
              </div>

              <div className="editor-popup-section et-highlight-section">
                <div className="editor-section-title">🖨 打印 / 导出 <span style={{ color: 'var(--new-feature)', fontSize: 10 }}>NEW</span></div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                  PNG · PDF · GeoJSON · KML · CSV · Shapefile
                </div>
                <button className={'btn-link' + (printExportOpen ? ' active' : '')} onClick={onTogglePrintExport}
                  style={{ width: '100%', justifyContent: 'center', padding: '6px 0' }}>
                  🖨 {printExportOpen ? '关闭' : '打开'} 打印 / 导出面板
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
