// useVertexEdit — 顶点编辑模式
// 在 editOverlay DataSource 里为选中要素生成句柄点，
// 支持拖动顶点（更新 entity 的 positions），Shift+点 = 删除顶点，右键边 = 插入顶点
// 吸附：拖动时找屏幕距离 < tolerance 的其他顶点/边

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { safePickEllipsoid, whenViewerReady } from '../utils/picking.js';
import { snapAll } from '../utils/snap.js';

const HANDLE_PIXEL_SIZE = 10;
const DEFAULT_SNAP = { vertex: true, edge: true, grid: false, tolPx: 12 };

export function useVertexEdit({ api, mode, activeLayerId, getSelectedFeatureId, refresh, onInfo, snapSettings }) {
  const handlerRef = useRef(null);
  const draggingRef = useRef(null); // {featureId, vertexIdx, originalPositions}
  const overlayRef = useRef(null); // CustomDataSource

  // 取得或懒创建 editOverlay DataSource
  const getOverlay = useCallback(() => {
    if (!api) return null;
    const v = api.getViewer();
    if (!v) return null;
    if (!overlayRef.current) {
      overlayRef.current = v.dataSources.add(new Cesium.CustomDataSource('editor-overlay'));
    }
    return overlayRef.current;
  }, [api]);

  // 为 featureId 重建所有句柄
  const rebuildHandles = useCallback((featureId) => {
    const overlay = getOverlay();
    if (!overlay) return;
    overlay.entities.removeAll();
    if (!featureId) return;
    const ds = api.getEditorDataSource();
    if (!ds) return;
    const ent = ds.entities.getById(featureId);
    if (!ent) return;
    let positions = [];
    if (ent.polyline && ent.polyline.positions) {
      const p = ent.polyline.positions.getValue
        ? ent.polyline.positions.getValue()
        : ent.polyline.positions;
      positions = p || [];
    } else if (ent.polygon && ent.polygon.hierarchy) {
      const h = ent.polygon.hierarchy.getValue
        ? ent.polygon.hierarchy.getValue()
        : ent.polygon.hierarchy;
      positions = (h && h.positions) || [];
    }
    if (!positions.length) return;
    positions.forEach((pos, idx) => {
      overlay.entities.add({
        id: `${featureId}__v${idx}`,
        position: pos,
        point: {
          pixelSize: HANDLE_PIXEL_SIZE,
          color: Cesium.Color.fromCssColorString('#fbbf24'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
    });
  }, [api, getOverlay]);

  useEffect(() => {
    if (!api || mode !== 'edit-vertices') {
      if (handlerRef.current) {
        try { handlerRef.current.destroy(); } catch (_) {}
        handlerRef.current = null;
      }
      const overlay = overlayRef.current;
      if (overlay) overlay.entities.removeAll();
      draggingRef.current = null;
      return;
    }

    // 等 viewer 异步初始化完成
    const stopWaiting = whenViewerReady(api, (v) => {
      if (handlerRef.current) {
        try { handlerRef.current.destroy(); } catch (_) {}
        handlerRef.current = null;
      }

    // 重建句柄
    const fid = typeof getSelectedFeatureId === 'function' ? getSelectedFeatureId() : null;
    rebuildHandles(fid);

    if (!fid) return;

    api.setInputBlocked(true);
    const handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
    handlerRef.current = handler;

    const updateEntityVertex = (featureId, idx, newPos) => {
      const ds = api.getEditorDataSource();
      const ent = ds.entities.getById(featureId);
      if (!ent) return;
      const props = ent.properties;
      const get = (k) => (props[k] && props[k].getValue ? props[k].getValue() : props[k]);
      let positions = [];
      if (ent.polyline && ent.polyline.positions) {
        const p = ent.polyline.positions.getValue
          ? ent.polyline.positions.getValue()
          : ent.polyline.positions;
        positions = [...(p || [])];
      } else if (ent.polygon && ent.polygon.hierarchy) {
        const h = ent.polygon.hierarchy.getValue
          ? ent.polygon.hierarchy.getValue()
          : ent.polygon.hierarchy;
        positions = [...((h && h.positions) || [])];
      }
      if (idx < 0 || idx >= positions.length) return;
      positions[idx] = newPos;
      if (ent.polyline) {
        ent.polyline.positions = new Cesium.CallbackProperty(() => positions, false);
      } else if (ent.polygon) {
        ent.polygon.hierarchy = new Cesium.CallbackProperty(
          () => new Cesium.PolygonHierarchy(positions),
          false
        );
      }
    };

    const snap = (target, excludeFeatureId) => {
      const settings = snapSettings || DEFAULT_SNAP;
      if (!settings || (!settings.vertex && !settings.edge)) return target;
      const hit = snapAll(api, target, excludeFeatureId, settings);
      return hit || target;
    };

    handler.setInputAction((event) => {
      const picked = v.scene.pick(event.position);
      if (!picked || !picked.id) return;
      const id = picked.id.id || '';
      if (!id.includes('__v')) return;
      const [featureId, vIdxStr] = id.split('__v');
      const idx = parseInt(vIdxStr, 10);
      const shift = window.event && window.event.shiftKey;
      if (shift) {
        // 删除顶点
        const ds = api.getEditorDataSource();
        const ent = ds.entities.getById(featureId);
        if (!ent) return;
        const props = ent.properties;
        let positions = [];
        if (ent.polyline && ent.polyline.positions) {
          const p = ent.polyline.positions.getValue ? ent.polyline.positions.getValue() : ent.polyline.positions;
          positions = [...(p || [])];
        } else if (ent.polygon && ent.polygon.hierarchy) {
          const h = ent.polygon.hierarchy.getValue ? ent.polygon.hierarchy.getValue() : ent.polygon.hierarchy;
          positions = [...((h && h.positions) || [])];
        }
        // 多边形至少保留 3 个顶点，线至少保留 2 个
        const minV = ent.polygon ? 3 : 2;
        if (positions.length <= minV) return;
        positions.splice(idx, 1);
        if (ent.polyline) {
          ent.polyline.positions = new Cesium.CallbackProperty(() => positions, false);
        } else if (ent.polygon) {
          ent.polygon.hierarchy = new Cesium.CallbackProperty(
            () => new Cesium.PolygonHierarchy(positions),
            false
          );
        }
        rebuildHandles(featureId);
        refresh && refresh();
        return;
      }
      // 开始拖动
      const ds = api.getEditorDataSource();
      const ent = ds.entities.getById(featureId);
      if (!ent) return;
      let positions = [];
      if (ent.polyline && ent.polyline.positions) {
        const p = ent.polyline.positions.getValue ? ent.polyline.positions.getValue() : ent.polyline.positions;
        positions = [...(p || [])];
      } else if (ent.polygon && ent.polygon.hierarchy) {
        const h = ent.polygon.hierarchy.getValue ? ent.polygon.hierarchy.getValue() : ent.polygon.hierarchy;
        positions = [...((h && h.positions) || [])];
      }
      draggingRef.current = { featureId, idx, originalPositions: positions };
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    handler.setInputAction((event) => {
      const d = draggingRef.current;
      if (!d) return;
      const carto = safePickEllipsoid(v, event.endPosition);
      if (!carto) return;
      let pos = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height);
      pos = snap(pos, d.featureId);
      updateEntityVertex(d.featureId, d.idx, pos);
      // 实时同步句柄位置
      const overlay = getOverlay();
      if (overlay) {
        const handle = overlay.entities.getById(`${d.featureId}__v${d.idx}`);
        if (handle) handle.position = pos;
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction(() => {
      if (draggingRef.current) {
        draggingRef.current = null;
        refresh && refresh();
        onInfo && onInfo('顶点已更新');
      }
    }, Cesium.ScreenSpaceEventType.LEFT_UP);
    }); // end whenViewerReady

    return () => {
      stopWaiting();
      if (handlerRef.current) {
        try { handlerRef.current.destroy(); } catch (_) {}
        handlerRef.current = null;
      }
      try { api.setInputBlocked(false); } catch (_) {}
      const overlay = overlayRef.current;
      if (overlay) overlay.entities.removeAll();
    };
    // 只在 mode 切换时重建 handler；api 加进依赖让初次挂载 viewer 就绪时也能跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, api]);

  return { rebuildHandles };
}