// useSimplify — 简化 hook
// 暴露 preview 渲染（__simplify_preview__ overlay DS）和 apply 方法
// apply 替换 entity.positions，并把动作入栈 undo

import { useCallback, useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { whenViewerReady } from '../utils/picking.js';
import { simplifyPositions } from '../utils/simplify.js';
import { SimplifyCommand } from '../utils/commands.js';

const PREVIEW_DS = 'editor-simplify-preview';

function getPreviewDs(api) {
  if (!api || !api.getViewer) return null;
  const v = api.getViewer();
  if (!v) return null;
  for (let i = 0; i < v.dataSources.length; i++) {
    if (v.dataSources.get(i).name === PREVIEW_DS) return v.dataSources.get(i);
  }
  const ds = new Cesium.CustomDataSource(PREVIEW_DS);
  return v.dataSources.add(ds);
}

function clearPreview(api) {
  if (!api || !api.getViewer) return;
  const v = api.getViewer();
  if (!v) return;
  for (let i = 0; i < v.dataSources.length; i++) {
    if (v.dataSources.get(i).name === PREVIEW_DS) {
      v.dataSources.get(i).entities.removeAll();
    }
  }
}

export function useSimplify({ api, pushUndo, refresh, onInfo }) {
  const previewEntityRef = useRef(null);

  const renderPreview = useCallback((entity, kind, positions) => {
    if (!api) return;
    let ds;
    whenViewerReady(api, (v) => {
      ds = getPreviewDs(api);
      if (!ds) return;
      ds.entities.removeAll();
      previewEntityRef.current = null;
      if (!positions || !positions.length) return;
      if (kind === 'point') {
        previewEntityRef.current = ds.entities.add({
          position: positions[0],
          point: {
            pixelSize: 8,
            color: Cesium.Color.fromCssColorString('rgba(34,197,94,0.9)'),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          properties: { kind: '__simplify_preview__' },
        });
      } else if (kind === 'polyline' || kind === 'freehand') {
        previewEntityRef.current = ds.entities.add({
          polyline: {
            positions: new Cesium.CallbackProperty(() => positions, false),
            width: 3,
            material: Cesium.Color.fromCssColorString('rgba(34,197,94,0.9)'),
          },
          properties: { kind: '__simplify_preview__' },
        });
      } else {
        previewEntityRef.current = ds.entities.add({
          polygon: {
            hierarchy: new Cesium.CallbackProperty(
              () => new Cesium.PolygonHierarchy(positions),
              false
            ),
            material: Cesium.Color.fromCssColorString('rgba(34,197,94,0.25)'),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('rgba(34,197,94,0.9)'),
            outlineWidth: 2,
          },
          properties: { kind: '__simplify_preview__' },
        });
      }
    });
  }, [api]);

  const clearPreviewOverlay = useCallback(() => {
    clearPreview(api);
    previewEntityRef.current = null;
  }, [api]);

  // 取 positions 工具
  const readPositions = useCallback((entity, kind) => {
    if (kind === 'point') {
      const c = entity.position && (entity.position.getValue ? entity.position.getValue() : entity.position);
      return c ? [c] : [];
    }
    if (entity.polyline && entity.polyline.positions) {
      const p = entity.polyline.positions.getValue ? entity.polyline.positions.getValue() : entity.polyline.positions;
      return (p && p.length) ? p : [];
    }
    if (entity.polygon && entity.polygon.hierarchy) {
      const h = entity.polygon.hierarchy.getValue ? entity.polygon.hierarchy.getValue() : entity.polygon.hierarchy;
      return (h && h.positions) ? h.positions : [];
    }
    return [];
  }, []);

  // 计算新 positions（preview 用）
  const computeNewPositions = useCallback((entity, kind, epsilonDeg) => {
    const old = readPositions(entity, kind);
    return { old, fresh: simplifyPositions(kind, old, epsilonDeg) };
  }, [readPositions]);

  // 提交：把 entity.positions 替换为新值（do 阶段），入栈 undo
  const apply = useCallback((entity, kind, epsilonDeg) => {
    if (!api) return null;
    const { old, fresh } = computeNewPositions(entity, kind, epsilonDeg);
    if (fresh.length === old.length) {
      onInfo && onInfo('当前容差无变化');
      return null;
    }
    // do 阶段：替换 entity positions
    if (kind === 'point') {
      entity.position = fresh[0];
    } else if (entity.polyline) {
      entity.polyline.positions = new Cesium.CallbackProperty(() => fresh, false);
    } else if (entity.polygon) {
      entity.polygon.hierarchy = new Cesium.CallbackProperty(
        () => new Cesium.PolygonHierarchy(fresh),
        false
      );
    }
    const cmd = SimplifyCommand(api, entity, old, fresh, refresh);
    if (cmd && pushUndo) pushUndo(cmd);
    clearPreviewOverlay();
    refresh && refresh();
    onInfo && onInfo(`简化：${old.length} → ${fresh.length} 顶点（Δ ${old.length - fresh.length}）`);
    return { old, fresh };
  }, [api, computeNewPositions, clearPreviewOverlay, pushUndo, refresh, onInfo]);

  // 切换 mode / 卸载时清空
  useEffect(() => {
    return () => { clearPreviewOverlay(); };
  }, [clearPreviewOverlay]);

  return { renderPreview, clearPreview: clearPreviewOverlay, computeNewPositions, apply };
}
