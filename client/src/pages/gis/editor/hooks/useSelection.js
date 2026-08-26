// useSelection — 单选 / Shift 多选
// 选中态写入 entity.properties.selected，entity 的回调（颜色/宽度）会读这个标志

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { whenViewerReady } from '../utils/picking.js';

export function useSelection({ api, mode, onChange }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const selectedIdsRef = useRef(new Set());
  const handlerRef = useRef(null);
  // 跟踪 Shift/Ctrl 状态——Cesium LEFT_CLICK 回调只传 {position},
  // 不带 event 字段;window.event 是 legacy 全局,Chrome 已标记 deprecated。
  // 用 document keydown/keyup 拿到稳定的修饰键状态。
  const modifiersRef = useRef({ shift: false, ctrl: false });

  useEffect(() => {
    const onKeyDown = (e) => {
      modifiersRef.current.shift = e.shiftKey;
      modifiersRef.current.ctrl = e.ctrlKey || e.metaKey;
    };
    const onKeyUp = (e) => {
      modifiersRef.current.shift = e.shiftKey;
      modifiersRef.current.ctrl = e.ctrlKey || e.metaKey;
    };
    // 切到别的窗口时 key 可能松开但 keyup 不触发,做一次兜底
    const onBlur = () => {
      modifiersRef.current.shift = false;
      modifiersRef.current.ctrl = false;
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);

  // 同步 selected 标志 + 高亮 stroke
  const applyHighlight = useCallback((nextSet) => {
    if (!api || !api.getEditorDataSource) return;
    let ds;
    try { ds = api.getEditorDataSource(); } catch (_) { return; }
    if (!ds || !ds.entities || !Array.isArray(ds.entities.values)) return;
    ds.entities.values.forEach((e) => {
      if (!e) return;
      const props = e.properties;
      if (!props) return;
      const fid = props.featureId && props.featureId.getValue
        ? props.featureId.getValue()
        : props.featureId;
      if (!fid || fid === '__draft__') return;
      try {
        props.selected = nextSet.has(fid);
        const sel = props.selected;
        const style = props.style && props.style.getValue
          ? props.style.getValue()
          : props.style;
        if (!style) return;
        if (e.polyline) {
          const baseW = style.strokeWidth || 2;
          e.polyline.width = sel ? Math.max(3, baseW + 2) : baseW;
          const baseC = Cesium.Color.fromCssColorString(style.strokeColor || '#6c8cff');
          if (sel) baseC.withAlpha(1);
          e.polyline.material = sel
            ? Cesium.Color.fromCssColorString('#fbbf24')
            : baseC;
        }
        if (e.polygon) {
          const baseW = style.strokeWidth || 2;
          e.polygon.outlineWidth = sel ? Math.max(3, baseW + 2) : baseW;
          e.polygon.outlineColor = sel
            ? Cesium.Color.fromCssColorString('#fbbf24')
            : Cesium.Color.fromCssColorString(style.strokeColor || '#6c8cff');
        }
        if (e.point) {
          const baseSize = style.pointSize || 10;
          e.point.pixelSize = sel ? Math.max(14, baseSize + 4) : baseSize;
          e.point.outlineColor = sel
            ? Cesium.Color.fromCssColorString('#fbbf24')
            : Cesium.Color.WHITE;
        }
      } catch (err) {
        console.warn('[useSelection] highlight failed on', e.id, err);
      }
    });
  }, [api]);

  const setSelection = useCallback((updater) => {
    setSelectedIds((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : new Set(updater);
      applyHighlight(next);
      selectedIdsRef.current = next;
      onChange && onChange(next);
      return next;
    });
  }, [applyHighlight, onChange]);

  const clearSelection = useCallback(() => setSelection(new Set()), [setSelection]);

  // select 模式：装 LEFT_CLICK handler
  useEffect(() => {
    if (!api || mode !== 'select') {
      if (handlerRef.current) {
        try { handlerRef.current.destroy(); } catch (_) {}
        handlerRef.current = null;
      }
      return;
    }
    // viewer 是异步初始化的,用 whenViewerReady 等到 canvas 可用再绑定 handler
    const stopWaiting = whenViewerReady(api, (v) => {
      if (!v || !v.scene || !v.scene.canvas) return;
      // 已存在 handler 时不再重复注册(可能在 mode 在不同 viewer 之间切换)
      if (handlerRef.current) {
        try { handlerRef.current.destroy(); } catch (_) {}
        handlerRef.current = null;
      }
      try { api.setInputBlocked(true); } catch (_) {}
      const handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
      handlerRef.current = handler;

      handler.setInputAction((click) => {
        try {
          const ds = api.getEditorDataSource();
          if (!ds) return;
          const picked = v.scene.pick(click.position);
          let fid = null;
          if (picked && picked.id && picked.id.properties) {
            const props = picked.id.properties;
            try {
              fid = props.featureId && props.featureId.getValue
                ? props.featureId.getValue()
                : props.featureId;
            } catch (_) {}
            if (fid === '__draft__') fid = null;
          }
          const mods = modifiersRef.current;
          const shift = mods.shift || mods.ctrl; // Shift 或 Ctrl 都作为多选(ArcGIS 习惯)
          setSelection((prev) => {
            const next = new Set(prev);
            if (fid) {
              if (shift) {
                if (next.has(fid)) next.delete(fid); else next.add(fid);
              } else {
                next.clear();
                next.add(fid);
              }
            } else if (!shift) {
              next.clear();
            }
            return next;
          });
        } catch (err) {
          console.warn('[useSelection] click handler error', err);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    });
    return () => {
      try { stopWaiting(); } catch (_) {}
      if (handlerRef.current) {
        try { handlerRef.current.destroy(); } catch (_) {}
        handlerRef.current = null;
      }
      try { api.setInputBlocked(false); } catch (_) {}
    };
    // 只在 mode 切换时重建；api 通过闭包已捕获
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return { selectedIds, setSelection, clearSelection };
}