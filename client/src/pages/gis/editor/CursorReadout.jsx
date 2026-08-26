// CursorReadout — 底栏商业级状态显示
// - 经/纬/高 三段实时坐标(4 种格式切换: dec / dms / utm / mgrs)
// - 选中数(从 editorApi.getSelectedIds()?.size)
// - undo / redo 计数 + 可用状态(从 editorApi.canUndo / canRedo)
// - 相机高度(camera.positionCartographic.height, from CesiumEarth api.getCameraHeight())
//
// 状态轮询策略:每 200ms 通过 setInterval 同步一次,无需侵入 editor 内部订阅.
// 因为 editor 内部状态变化(增删要素 / 撤销 / 重做)频率不高,200ms 既实时又低耗.

import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { decToDMS, decToUTM, decToMGRS } from './utils/coords.js';
import { whenViewerReady } from './utils/picking.js';
import { useDraggableResizable } from './hooks/useDraggableResizable.js';

const FORMATS = [
  { id: 'dec',  label: 'DEC'  },
  { id: 'dms',  label: 'DMS'  },
  { id: 'utm',  label: 'UTM'  },
  { id: 'mgrs', label: 'MGRS' },
];

export default function CursorReadout({
  api,
  format = 'dec',
  onFormatChange,
  dock = 'floating',
  editorApiRef = null,
}) {
  const [coord, setCoord] = useState(null);
  const [cameraHeight, setCameraHeight] = useState(null);
  const [metersPerPixel, setMetersPerPixel] = useState(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [undoState, setUndoState] = useState({ canUndo: false, canRedo: false });
  const handlerRef = useRef(null);
  const readoutRef = useRef(null);

  // 仅浮动模式启用拖拽；dock="bottom" 时整个 hook 直接禁用（不碰元素内联样式、不读 localStorage）
  useDraggableResizable(
    dock === 'floating'
      ? {
          ref: readoutRef,
          storageKey: 'editor-cursor-readout',
          defaultSize: { w: 280, h: 90 },
          defaultPosition: { x: 20, y: window.innerHeight - 110 },
          dragHandleSelector: '.editor-coord-format-toggle',
        }
      : { ref: readoutRef, disabled: true }
  );

  // 鼠标移动 → 坐标实时更新
  useEffect(() => {
    if (!api || !api.getViewer) return undefined;
    const stop = whenViewerReady(api, (v) => {
      try {
        const handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
        handlerRef.current = handler;
        handler.setInputAction((event) => {
          try {
            const c = api.screenToLngLat(event.endPosition);
            if (c) setCoord(c);
          } catch (_) {}
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
      } catch (e) {
        console.warn('[CursorReadout] failed to init handler:', e);
      }
    });
    return () => {
      try { stop && stop(); } catch (_) {}
      try { handlerRef.current && handlerRef.current.destroy(); } catch (_) {}
      handlerRef.current = null;
    };
  }, [api]);

  // 200ms poll:相机高度 + editor 状态
  useEffect(() => {
    const tick = () => {
      // 相机高度
      if (api && typeof api.getCameraHeight === 'function') {
        try {
          const h = api.getCameraHeight();
          if (Number.isFinite(h)) setCameraHeight(h);
        } catch (_) {}
      }
      // 当前地面分辨率（米/像素）—— 底栏"比例尺"显示
      if (api && typeof api.getMetersPerPixel === 'function') {
        try {
          const mpp = api.getMetersPerPixel();
          if (Number.isFinite(mpp)) setMetersPerPixel(mpp);
        } catch (_) {}
      }
      // editor 状态
      const eApi = editorApiRef && editorApiRef.current;
      if (eApi) {
        try {
          const ids = typeof eApi.getSelectedIds === 'function' ? eApi.getSelectedIds() : null;
          setSelectedCount(ids && typeof ids.size === 'number' ? ids.size : 0);
        } catch (_) {
          setSelectedCount(0);
        }
        try {
          const u = typeof eApi.canUndo === 'function' ? !!eApi.canUndo() : false;
          const r = typeof eApi.canRedo === 'function' ? !!eApi.canRedo() : false;
          setUndoState({ canUndo: u, canRedo: r });
        } catch (_) {
          setUndoState({ canUndo: false, canRedo: false });
        }
      }
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [api, editorApiRef]);

  // 底栏：始终显示经/纬/高三段（即使没坐标也显示占位）
  const lngLabel = '经度';
  const latLabel = '纬度';
  const hgtLabel = '高度';

  function formatOne(lng, lat, fmt) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return '';
    switch (fmt) {
      case 'dms':  return decToDMS(lng, lat, 1);
      case 'utm':  return decToUTM(lng, lat);
      case 'mgrs': return decToMGRS(lng, lat, 5);
      case 'dec':
      default:     return `${lng.toFixed(5)}°, ${lat.toFixed(5)}°`;
    }
  }
  const combined = coord ? formatOne(coord.lng, coord.lat, format) : '';
  let lngVal = '—';
  let latVal = '—';
  if (combined) {
    if (format === 'dec' || format === 'dms') {
      const idx = combined.indexOf(' ');
      if (idx > 0) { lngVal = combined.slice(0, idx); latVal = combined.slice(idx + 1); }
      else { lngVal = combined; }
    } else if (format === 'utm') {
      const parts = combined.split(' ');
      if (parts.length >= 3) { lngVal = `${parts[0]} ${parts[1]}`; latVal = parts[2]; }
      else { lngVal = combined; }
    } else if (format === 'mgrs') {
      lngVal = combined; latVal = '—';
    }
  }
  const hgtVal = coord
    ? `${coord.height >= 0 ? '+' : ''}${coord.height.toFixed(2)} m`
    : '—';

  const camHgtVal = Number.isFinite(cameraHeight)
    ? `${(cameraHeight / 1000).toFixed(cameraHeight >= 10000 ? 1 : 2)} km`
    : '—';

// 比例尺文本：1 像素代表的米数 → 自动选单位
//   < 1m    → "N cm/px"
//   < 1km   → "N m/px"
//   < 1000km → "N km/px"
//   更大     → "N Mm/px"
function formatMetersPerPixel(m) {
  if (!Number.isFinite(m) || m <= 0) return '—';
  if (m < 1) return `${(m * 100).toFixed(m * 100 < 10 ? 2 : 1)} cm/px`;
  if (m < 1000) return `${m.toFixed(m < 10 ? 2 : 1)} m/px`;
  if (m < 1e6) return `${(m / 1000).toFixed(m < 1e4 ? 2 : 1)} km/px`;
  return `${(m / 1e6).toFixed(2)} Mm/px`;
}
const scaleVal = formatMetersPerPixel(metersPerPixel);

  // 选中数显示:0 时不显示 N (避免冗余); > 0 时显示
  const selectedLabel = selectedCount > 0 ? `选中 ${selectedCount}` : '';

  return (
    <div
      className={
        'editor-cursor-readout' +
        (dock === 'bottom' ? ' editor-cursor-readout--docked' : '')
      }
      ref={readoutRef}
    >
      <div className="editor-coord-format-toggle" role="group" aria-label="坐标格式">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={'editor-coord-fmt-btn' + (format === f.id ? ' active' : '')}
            onClick={() => onFormatChange && onFormatChange(f.id)}
            title={`切换为 ${f.label} 格式`}
          >{f.label}</button>
        ))}
      </div>
      <div className="editor-coord-display">
        <span className="editor-coord-cell">
          <span className="editor-coord-cell-label">{lngLabel}</span>
          <span className="editor-coord-cell-value">{lngVal}</span>
        </span>
        <span className="editor-coord-cell">
          <span className="editor-coord-cell-label">{latLabel}</span>
          <span className="editor-coord-cell-value">{latVal}</span>
        </span>
        <span className="editor-coord-cell">
          <span className="editor-coord-cell-label">海拨</span>
          <span className="editor-coord-cell-value">{hgtVal}</span>
        </span>
        <span className="editor-coord-cell editor-coord-cell--sep">
          <span className="editor-coord-cell-label">相机</span>
          <span className="editor-coord-cell-value">{camHgtVal}</span>
        </span>
        <span className="editor-coord-cell editor-coord-cell--sep" title="当前屏幕中心点对应的地面分辨率（米/像素）">
          <span className="editor-coord-cell-label">比例尺</span>
          <span className="editor-coord-cell-value">{scaleVal}</span>
        </span>
        <span className="editor-coord-cell editor-coord-cell--state">
          <span className="editor-coord-cell-label">编辑</span>
          <span className="editor-coord-cell-value">
            <span className={'editor-state-pill ' + (undoState.canUndo ? 'is-active' : '')} title="可撤销">↶</span>
            <span className={'editor-state-pill ' + (undoState.canRedo ? 'is-active' : '')} title="可重做">↷</span>
            {selectedLabel ? <span className="editor-state-pill is-active" title="已选中要素">{selectedCount}</span> : null}
          </span>
        </span>
      </div>
    </div>
  );
}