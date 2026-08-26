// useDrawing — 绘制状态机
// 模式：idle | draw-point | draw-polyline | draw-polygon | draw-rect | draw-circle | draw-freehand | edit-vertices | select
// 状态：
//   - draftRef: 正在绘制的顶点（Cartesian3[]），用 ref 避免每帧重渲染
//   - tempEntityRef: 预览用的 entity（CallbackProperty 跟随 draftRef）
//   - 提交时调用 onCommit(feature)，由父组件记账 + 入栈 undo

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import {
  circlePositions,
  newFeatureId,
  rectanglePositions,
  resampleByDistance,
} from '../utils/geometry.js';
import { safePickEllipsoid, whenViewerReady } from '../utils/picking.js';
import { snapAll } from '../utils/snap.js';

const DEFAULT_STYLE = {
  pointSize: 10,
  pointColor: '#fbbf24',
  strokeColor: '#6c8cff',
  strokeWidth: 2,
  fillColor: 'rgba(108, 140, 255, 0.35)',
};

// 把 hex/rgba 字符串转 Cesium.Color
function cssColor(str, alpha = 1) {
  try {
    const c = Cesium.Color.fromCssColorString(str);
    if (alpha !== 1) c.alpha = alpha;
    return c;
  } catch (_) {
    return Cesium.Color.WHITE;
  }
}

// 创建一个预览 entity（CallbackProperty 跟随 draftRef.current）
function createPreviewEntity(api, draftRef, mode, layerId) {
  const featureId = '__draft__';
  // 先把上一次的预览清掉
  api.removeEditorEntity(featureId);

  const getDraft = () => draftRef.current || [];
  const cbPolylinePositions = new Cesium.CallbackProperty(() => getDraft(), false);
  const cbPolygonHierarchy = new Cesium.CallbackProperty(
    () => new Cesium.PolygonHierarchy(getDraft()),
    false
  );
  const cbRectangleHierarchy = new Cesium.CallbackProperty(() => {
    const d = getDraft();
    if (d.length < 2) return new Cesium.PolygonHierarchy([]);
    return new Cesium.PolygonHierarchy(rectanglePositions(d[0], d[1]));
  }, false);
  const cbCircleHierarchy = new Cesium.CallbackProperty(() => {
    const d = getDraft();
    if (d.length < 1) return new Cesium.PolygonHierarchy([]);
    const radius = d[1]
      ? Cesium.Cartesian3.distance(d[0], d[1])
      : 0;
    if (radius < 1) return new Cesium.PolygonHierarchy([]);
    return new Cesium.PolygonHierarchy(circlePositions(d[0], radius, 72));
  }, false);

  const opts = {
    id: featureId,
    properties: { kind: 'draft', layerId },
  };
  if (mode === 'draw-polyline') {
    opts.polyline = {
      positions: cbPolylinePositions,
      width: DEFAULT_STYLE.strokeWidth,
      material: cssColor(DEFAULT_STYLE.strokeColor),
      clampToGround: false,
    };
  } else if (mode === 'draw-polygon') {
    opts.polygon = {
      hierarchy: cbPolygonHierarchy,
      material: cssColor(DEFAULT_STYLE.fillColor),
      outline: true,
      outlineColor: cssColor(DEFAULT_STYLE.strokeColor),
      outlineWidth: DEFAULT_STYLE.strokeWidth,
    };
  } else if (mode === 'draw-rect') {
    opts.polygon = {
      hierarchy: cbRectangleHierarchy,
      material: cssColor(DEFAULT_STYLE.fillColor),
      outline: true,
      outlineColor: cssColor(DEFAULT_STYLE.strokeColor),
      outlineWidth: DEFAULT_STYLE.strokeWidth,
    };
  } else if (mode === 'draw-circle') {
    opts.polygon = {
      hierarchy: cbCircleHierarchy,
      material: cssColor(DEFAULT_STYLE.fillColor),
      outline: true,
      outlineColor: cssColor(DEFAULT_STYLE.strokeColor),
      outlineWidth: DEFAULT_STYLE.strokeWidth,
    };
  } else if (mode === 'draw-freehand') {
    opts.polyline = {
      positions: cbPolylinePositions,
      width: DEFAULT_STYLE.strokeWidth,
      material: cssColor(DEFAULT_STYLE.strokeColor),
    };
  }
  // 矩形/圆的第二个顶点和圆周实时跟随鼠标位置，由 onMouseMove 维护 draftRef[1]

  return api.addEditorEntity(opts);
}

// 把最终 feature 入库（调用父组件 onCommit 接收 GeoJSON 化数据 + entity 句柄）
function commitFeature(api, kind, positions, style, name, layerId) {
  const featureId = newFeatureId(kind);
  const cbPos = new Cesium.CallbackProperty(() => positions, false);
  const cbHierarchy = new Cesium.CallbackProperty(
    () => new Cesium.PolygonHierarchy(positions),
    false
  );
  const fill = Cesium.Color.fromCssColorString(style.fillColor || DEFAULT_STYLE.fillColor);
  const stroke = Cesium.Color.fromCssColorString(style.strokeColor || DEFAULT_STYLE.strokeColor);
  const pointC = Cesium.Color.fromCssColorString(style.pointColor || DEFAULT_STYLE.pointColor);

  const opts = {
    id: featureId,
    name: name || kind,
    properties: {
      kind,
      featureId,
      layerId: layerId || 'default',
      selected: false,
      style: {
        pointSize: style.pointSize || DEFAULT_STYLE.pointSize,
        pointColor: style.pointColor || DEFAULT_STYLE.pointColor,
        strokeColor: style.strokeColor || DEFAULT_STYLE.strokeColor,
        strokeWidth: style.strokeWidth || DEFAULT_STYLE.strokeWidth,
        fillColor: style.fillColor || DEFAULT_STYLE.fillColor,
      },
      attrs: (style && style.attrs) || (positions && positions.__attrs) || {},
    },
  };
  if (kind === 'point') {
    opts.position = positions[0];
    opts.point = {
      pixelSize: opts.properties.style.pointSize,
      color: pointC,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    };
  } else if (kind === 'polyline' || kind === 'freehand') {
    opts.polyline = {
      positions: cbPos,
      width: opts.properties.style.strokeWidth,
      material: stroke,
    };
  } else if (kind === 'polygon' || kind === 'rect' || kind === 'circle') {
    opts.polygon = {
      hierarchy: cbHierarchy,
      material: fill,
      outline: true,
      outlineColor: stroke,
      outlineWidth: opts.properties.style.strokeWidth,
    };
  }
  const entity = api.addEditorEntity(opts);
  return { featureId, entity, kind, positions, style: opts.properties.style };
}

export function useDrawing({ api, mode, layerId, onCommit, snapSettings }) {
  const [draftCount, setDraftCount] = useState(0); // 仅触发工具栏读数更新
  const draftRef = useRef([]); // 顶点
  const tempEntityRef = useRef(null);
  const previewModeRef = useRef(null);
  const handlerRef = useRef(null);
  const freehandActiveRef = useRef(false);

  // 鼠标坐标 → Cartographic（地形上 / 椭球面），无效返回 null
  const pickGround = useCallback((pos) => {
    if (!api || !api.getViewer) return null;
    const v = api.getViewer();
    return safePickEllipsoid(v, pos);
  }, [api]);

  // 每次模式切换 → 重新挂 handler
  useEffect(() => {
    if (!api) return;

    // 清理上一次的 handler 和预览
    if (handlerRef.current) {
      try { handlerRef.current.destroy(); } catch (_) {}
      handlerRef.current = null;
    }
    if (tempEntityRef.current) {
      api.removeEditorEntity('__draft__');
      tempEntityRef.current = null;
      draftRef.current = [];
      setDraftCount(0);
    }

    // idle / select / edit-vertices / measure-* 不需要绘制 handler（测量由 useMeasure 管）
    if (mode === 'idle' || mode === 'select' || mode === 'edit-vertices' ||
        mode === 'measure-distance' || mode === 'measure-area' || mode === 'measure-height') {
      try { api.setInputBlocked(false); } catch (_) {}
      return;
    }

    // 绘制模式：等 viewer 异步初始化完成后挂 handler（防 race）
    try { api.setInputBlocked(true); } catch (_) {}
    // 仅在需要拖动绘制的模式（矩形 / 圆 / 手绘）禁用 Cesium 相机控制器，
    // 否则手绘时按住左键拖动地球会跟着转。点 / 折线 / 多边形是单击，不影响。
    const DRAG_MODES = new Set(['draw-rect', 'draw-circle', 'draw-freehand']);
    const needsCameraDisable = DRAG_MODES.has(mode);
    let savedCameraSettings = null;
    let stopCamDisable = null;
    if (needsCameraDisable) {
      stopCamDisable = whenViewerReady(api, (v) => {
        const c = v.scene.screenSpaceCameraController;
        if (!savedCameraSettings) {
          savedCameraSettings = {
            enableRotate: c.enableRotate,
            enableTranslate: c.enableTranslate,
            enableZoom: c.enableZoom,
            enableTilt: c.enableTilt,
            enableLook: c.enableLook,
          };
        }
        c.enableRotate = false;
        c.enableTranslate = false;
        c.enableZoom = false;
        c.enableTilt = false;
        c.enableLook = false;
      });
    }
    const stopWaiting = whenViewerReady(api, (v) => {
      // 防止 race 期间 effect 被重跑挂了两个 handler
      if (handlerRef.current) {
        try { handlerRef.current.destroy(); } catch (_) {}
        handlerRef.current = null;
      }
      const handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
      handlerRef.current = handler;

      // 辅助：把 raw cartesian 应用 snap，返回吸附后的 cartesian（无吸附返回原值）
      const applySnap = (rawCart, excludeFid) => {
        if (!snapSettings || (!snapSettings.vertex && !snapSettings.edge)) return rawCart;
        // freehand 模式噪声大，跳过吸附
        if (mode === 'draw-freehand') return rawCart;
        const snapped = snapAll(api, rawCart, excludeFid, snapSettings);
        return snapped || rawCart;
      };

      // 辅助：移动鼠标时更新 draftRef[1]（矩形/圆的第二个角点 / 圆周半径）
      const onMouseMove = (movement) => {
        const carto = pickGround(movement.endPosition);
        if (!carto) return;
        if (previewModeRef.current === 'draw-rect' || previewModeRef.current === 'draw-circle') {
          if (draftRef.current.length >= 1) {
            let next = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude);
            next = applySnap(next);
            draftRef.current = [draftRef.current[0], next];
            setDraftCount(draftRef.current.length);
          }
        } else if (previewModeRef.current === 'draw-freehand' && freehandActiveRef.current) {
          const next = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude);
          const arr = draftRef.current;
          if (arr.length === 0 || Cesium.Cartesian3.distance(arr[arr.length - 1], next) > 0.5) {
            draftRef.current = [...arr, next];
          }
        }
      };

      const finishPolylineOrPolygon = (kind) => {
        const arr = draftRef.current;
        if (arr.length < (kind === 'polygon' ? 3 : 2)) {
          // 顶点数不足 → 取消
          api.removeEditorEntity('__draft__');
          tempEntityRef.current = null;
          draftRef.current = [];
          setDraftCount(0);
          return;
        }
        api.removeEditorEntity('__draft__');
        tempEntityRef.current = null;
        const committed = commitFeature(api, kind, arr, DEFAULT_STYLE, undefined, layerId);
        onCommit && onCommit(committed);
        draftRef.current = [];
        setDraftCount(0);
      };

      const onLeftClick = (click) => {
        const carto = pickGround(click.position);
        if (!carto) return;
        let next = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude);
        next = applySnap(next);

        if (mode === 'draw-point') {
          api.removeEditorEntity('__draft__');
          const committed = commitFeature(api, 'point', [next], DEFAULT_STYLE, undefined, layerId);
          onCommit && onCommit(committed);
          draftRef.current = [];
          setDraftCount(0);
        } else if (mode === 'draw-polyline' || mode === 'draw-polygon') {
          if (!tempEntityRef.current) {
            previewModeRef.current = mode;
            draftRef.current = [next];
            tempEntityRef.current = createPreviewEntity(api, draftRef, mode, layerId);
          } else {
            draftRef.current = [...draftRef.current, next];
          }
          setDraftCount(draftRef.current.length);
        } else if (mode === 'draw-rect' || mode === 'draw-circle') {
          if (!tempEntityRef.current || draftRef.current.length === 0) {
            previewModeRef.current = mode;
            draftRef.current = [next];
            tempEntityRef.current = createPreviewEntity(api, draftRef, mode, layerId);
          } else {
            // 第二个点 = 完成
            api.removeEditorEntity('__draft__');
            tempEntityRef.current = null;
            const positions = mode === 'draw-rect'
              ? rectanglePositions(draftRef.current[0], next)
              : circlePositions(draftRef.current[0], Cesium.Cartesian3.distance(draftRef.current[0], next), 72);
            const committed = commitFeature(api, mode === 'draw-rect' ? 'rect' : 'circle', positions, DEFAULT_STYLE, undefined, layerId);
            onCommit && onCommit(committed);
            draftRef.current = [];
            setDraftCount(0);
          }
          setDraftCount(draftRef.current.length);
        }
      };

      const onLeftDblClick = () => {
        if (mode === 'draw-polyline' || mode === 'draw-polygon') {
          finishPolylineOrPolygon(mode === 'draw-polyline' ? 'polyline' : 'polygon');
        }
      };

      const onRightClick = () => {
        // 取消绘制
        if (tempEntityRef.current) {
          api.removeEditorEntity('__draft__');
          tempEntityRef.current = null;
          draftRef.current = [];
          setDraftCount(0);
        } else if (mode === 'draw-polyline' || mode === 'draw-polygon') {
          finishPolylineOrPolygon(mode === 'draw-polyline' ? 'polyline' : 'polygon');
        }
      };

      // 通用 reset：清空草稿 + tempEntity + draftCount
      const resetDraft = () => {
        if (tempEntityRef.current) {
          api.removeEditorEntity('__draft__');
          tempEntityRef.current = null;
        }
        draftRef.current = [];
        setDraftCount(0);
      };

      const onLeftDown = (event) => {
        if (mode === 'draw-freehand') {
          const carto = pickGround(event.position);
          if (!carto) return;
          freehandActiveRef.current = true;
          previewModeRef.current = mode;
          draftRef.current = [Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude)];
          if (!tempEntityRef.current) {
            tempEntityRef.current = createPreviewEntity(api, draftRef, mode, layerId);
          }
        }
      };

      const onLeftUp = () => {
        if (mode === 'draw-freehand' && freehandActiveRef.current) {
          freehandActiveRef.current = false;
          const arr = resampleByDistance(draftRef.current, 1);
          api.removeEditorEntity('__draft__');
          tempEntityRef.current = null;
          if (arr.length >= 2) {
            const committed = commitFeature(api, 'freehand', arr, DEFAULT_STYLE, undefined, layerId);
            onCommit && onCommit(committed);
          }
          draftRef.current = [];
          setDraftCount(0);
        }
      };

      if (mode === 'draw-freehand') {
        handler.setInputAction(onMouseMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
        handler.setInputAction(onLeftDown, Cesium.ScreenSpaceEventType.LEFT_DOWN);
        handler.setInputAction(onLeftUp, Cesium.ScreenSpaceEventType.LEFT_UP);
      } else {
        handler.setInputAction(onMouseMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
        handler.setInputAction(onLeftClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        handler.setInputAction(onLeftDblClick, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
        handler.setInputAction(onRightClick, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
      }
    });

    return () => {
      stopWaiting();
      if (handlerRef.current) {
        try { handlerRef.current.destroy(); } catch (_) {}
        handlerRef.current = null;
      }
      if (tempEntityRef.current) {
        try { api.removeEditorEntity('__draft__'); } catch (_) {}
        tempEntityRef.current = null;
      }
      try { api.setInputBlocked(false); } catch (_) {}
      // 仅当我们之前禁用了相机控制器时才需要恢复
      if (needsCameraDisable) {
        try {
          if (stopCamDisable) { stopCamDisable(); stopCamDisable = null; }
          const settings = savedCameraSettings;
          whenViewerReady(api, (v) => {
            const c = v.scene.screenSpaceCameraController;
            if (settings) {
              c.enableRotate = settings.enableRotate;
              c.enableTranslate = settings.enableTranslate;
              c.enableZoom = settings.enableZoom;
              c.enableTilt = settings.enableTilt;
              c.enableLook = settings.enableLook;
            } else {
              // 没拿到原值（viewer 还没就绪就 unmount），全部恢复为默认
              c.enableRotate = true;
              c.enableTranslate = true;
              c.enableZoom = true;
              c.enableTilt = true;
              c.enableLook = true;
            }
          });
        } catch (_) {}
      }
    };
    // api 是稳定对象引用，加进依赖让初次挂载 viewer 就绪时 effect 也能正确跑。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, layerId, api]);

  return { draftCount };
}