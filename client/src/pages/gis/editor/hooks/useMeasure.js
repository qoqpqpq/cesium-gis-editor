// useMeasure — 测量模式
// 模式：measure-distance | measure-area | measure-height
// 三种状态机各自独立；切换模式自动清空上一个的测量结果
// 测量结果是临时的（不导出，不参与 undo），放在独立的 'editor-measure' DataSource

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { safePickEllipsoid, whenViewerReady } from '../utils/picking.js';
import {
  pathLength3DMeters,
  polygonAreaM2,
  polylineLengthMeters,
  sampleGroundHeight,
  formatDistance,
  formatArea,
} from '../utils/measure.js';

const OVERLAY_NAME = 'editor-measure';
const STYLE = {
  line:  { width: 2, color: '#fbbf24' },
  fill:  'rgba(251, 191, 36, 0.25)',
  point: { size: 6, color: '#fbbf24' },
  label: { fill: '#fff', outline: '#000', size: 13 },
};

function cssColor(str, alpha = 1) {
  try {
    const c = Cesium.Color.fromCssColorString(str);
    if (alpha !== 1) c.alpha = alpha;
    return c;
  } catch (_) {
    return Cesium.Color.YELLOW;
  }
}

// 取得/懒创建 overlay DataSource（通过 api 的统一接口）
function getOverlay(api) {
  if (!api || !api.getMeasureDataSource) return null;
  return api.getMeasureDataSource();
}

function clearOverlay(ds) {
  if (ds && ds.entities) ds.entities.removeAll();
}

function removeOverlay(api) {
  const v = api && api.getViewer();
  if (!v) return;
  for (let i = 0; i < v.dataSources.length; i++) {
    if (v.dataSources.get(i).name === OVERLAY_NAME) {
      v.dataSources.remove(v.dataSources.get(i), true);
    }
  }
}

// 加一个顶点圆点
function addVertexPoint(ds, cart, idx) {
  ds.entities.add({
    id: `__m_v_${idx}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    position: cart,
    point: {
      pixelSize: STYLE.point.size,
      color: cssColor(STYLE.point.color),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 1,
    },
    properties: { kind: '__measurement__' },
  });
}

// 加一条折线（CallbackProperty 跟随 ref）
function addPolylineLine(ds, getPositions) {
  return ds.entities.add({
    polyline: {
      positions: new Cesium.CallbackProperty(() => getPositions(), false),
      width: STYLE.line.width,
      material: cssColor(STYLE.line.color),
    },
    properties: { kind: '__measurement__' },
  });
}

// 加一个多边形（CallbackProperty 跟随 ref）
function addPolygonFill(ds, getPositions) {
  return ds.entities.add({
    polygon: {
      hierarchy: new Cesium.CallbackProperty(
        () => new Cesium.PolygonHierarchy(getPositions() || []),
        false
      ),
      material: cssColor(STYLE.fill),
      outline: true,
      outlineColor: cssColor(STYLE.line.color),
      outlineWidth: STYLE.line.width,
    },
    properties: { kind: '__measurement__' },
  });
}

// 加一个标签（CallbackProperty 跟随位置/文字）
function addLabel(ds, getPosition, getText) {
  return ds.entities.add({
    position: new Cesium.CallbackProperty(() => getPosition() || Cesium.Cartesian3.ZERO, false),
    label: {
      text: new Cesium.CallbackProperty(() => getText() || '', false),
      font: `${STYLE.label.size}px sans-serif`,
      fillColor: cssColor(STYLE.label.fill),
      outlineColor: cssColor(STYLE.label.outline),
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString('rgba(0,0,0,0.7)'),
      backgroundPadding: new Cesium.Cartesian2(8, 4),
      pixelOffset: new Cesium.Cartesian2(0, -20),
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    },
    properties: { kind: '__measurement__' },
  });
}

export function useMeasure({ api, mode, onInfo }) {
  // 实时对外读数（工具栏显示用）
  const [live, setLive] = useState({ distance: null, area: null, height: null });
  // live 的 ref 镜像：让 CallbackProperty label 能读到最新值
  const liveRef = useRef({ distance: null, area: null, height: null });
  useEffect(() => { liveRef.current = live; }, [live]);
  const positionsRef = useRef([]);
  const lastHeightRef = useRef(null);

  // effect 每次 mode 切换：清空 overlay + 挂 handler
  useEffect(() => {
    if (!api) return;
    const isMeasureMode =
      mode === 'measure-distance' ||
      mode === 'measure-area' ||
      mode === 'measure-height';
    if (!isMeasureMode) {
      // 清空残留（mode 切走）
      removeOverlay(api);
      positionsRef.current = [];
      setLive({ distance: null, area: null, height: null });
      try { api.setInputBlocked(false); } catch (_) {}
      return;
    }

    // 进入测量模式
    try { api.setInputBlocked(true); } catch (_) {}
    positionsRef.current = [];
    lastHeightRef.current = null;

    const stopWaiting = whenViewerReady(api, (v) => {
      const handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
      const ds = getOverlay(api);
      if (!ds) return;
      clearOverlay(ds);

      const refreshLive = () => {
        const arr = positionsRef.current;
        if (mode === 'measure-distance') {
          setLive({
            distance: arr.length >= 2 ? formatDistance(polylineLengthMeters(arr)) : null,
            area: null,
            height: null,
          });
        } else if (mode === 'measure-area') {
          setLive({
            distance: null,
            area: arr.length >= 3 ? formatArea(polygonAreaM2(arr)) : null,
            height: null,
          });
        } else if (mode === 'measure-height') {
          setLive({
            distance: null,
            area: null,
            height: lastHeightRef.current != null ? formatDistance(lastHeightRef.current) : null,
          });
        }
      };

      // 鼠标移动：distance/area 跟着实时更新（hover 预览最后一段）
      let hoverCart = null;
      const onMouseMove = (event) => {
        const carto = safePickEllipsoid(v, event.endPosition);
        if (!carto) return;
        hoverCart = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height);
        if (mode === 'measure-distance') {
          const arr = positionsRef.current;
          if (arr.length >= 1) previewLineEntity.position = hoverCart;
          refreshLive();
        } else if (mode === 'measure-area' && positionsRef.current.length >= 2) {
          // hover 时把"假最后一点"放到数组临时末位用于 area 估算
          refreshLive();
        } else if (mode === 'measure-height' && positionsRef.current.length === 1) {
          // height 模式：单点时实时算一下高度给个提示（用 hover 处）
          const a = positionsRef.current[0];
          const b = hoverCart;
          const d = Math.abs(Cesium.Cartesian3.distance(a, b));
          lastHeightRef.current = d;
          refreshLive();
        }
      };

      // 折线/多边形预览实体（CallbackProperty 跟随 positionsRef + hover）
      let previewLineEntity = null;
      let previewFillEntity = null;

      const getPreviewPositions = () => {
        const arr = positionsRef.current;
        if (mode === 'measure-distance' && arr.length >= 1 && hoverCart) {
          return [...arr, hoverCart];
        }
        if (mode === 'measure-area' && arr.length >= 2 && hoverCart) {
          return [...arr, hoverCart];
        }
        return arr;
      };

      if (mode === 'measure-distance') {
        previewLineEntity = addPolylineLine(ds, () => {
          const arr = positionsRef.current;
          if (arr.length >= 1 && hoverCart) return [...arr, hoverCart];
          return arr;
        });
      } else if (mode === 'measure-area') {
        previewLineEntity = addPolylineLine(ds, () => {
          const arr = positionsRef.current;
          if (arr.length >= 2 && hoverCart) return [...arr, hoverCart];
          return arr;
        });
        previewFillEntity = addPolygonFill(ds, () => {
          const arr = positionsRef.current;
          if (arr.length >= 2 && hoverCart) return [...arr, hoverCart];
          return arr;
        });
      }

      // 实时 label（CallbackProperty 通过 ref 读最新 live 值，避免闭包陷阱）
      const labelEntity = addLabel(
        ds,
        () => (positionsRef.current.length > 0 ? positionsRef.current[positionsRef.current.length - 1] : null),
        () => {
          const lv = liveRef.current;
          if (mode === 'measure-distance') return lv.distance || '';
          if (mode === 'measure-area') return lv.area || '';
          if (mode === 'measure-height') return lv.height || '';
          return '';
        }
      );

      const commitPoint = (cart) => {
        positionsRef.current = [...positionsRef.current, cart];
        addVertexPoint(ds, cart, positionsRef.current.length - 1);
        refreshLive();
      };

      const onLeftClick = (event) => {
        const carto = safePickEllipsoid(v, event.position);
        if (!carto) return;
        const cart = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height);
        if (mode === 'measure-distance') {
          commitPoint(cart);
        } else if (mode === 'measure-area') {
          commitPoint(cart);
        } else if (mode === 'measure-height') {
          // 第一个点 = base；第二个点时算 ground height
          commitPoint(cart);
          if (positionsRef.current.length === 2) {
            const a = positionsRef.current[0];
            const b = positionsRef.current[1];
            const ha = sampleGroundHeight(v, Cesium.Cartographic.fromCartesian(a));
            const hb = sampleGroundHeight(v, Cesium.Cartographic.fromCartesian(b));
            const dh = Math.abs(hb - ha);
            lastHeightRef.current = dh;
            // height 标记 = 两点连线 + 中点标签
            const mid = Cesium.Cartesian3.midpoint(a, b, new Cesium.Cartesian3());
            addVertexPoint(ds, mid, 'mid');
            // 让高度再渲染一条线段
            addPolylineLine(ds, () => [a, b]);
            refreshLive();
          }
        }
      };

      const onLeftDblClick = () => {
        // distance/area 模式下双击 = 完成（保留所有点 + 标签）
        // height 模式下双击不做特殊处理（已 2 点完成）
        const lv = liveRef.current;
        onInfo && onInfo(
          mode === 'measure-distance' ? `测距完成：${lv.distance || ''}`
            : mode === 'measure-area' ? `测面完成：${lv.area || ''}`
            : `测高完成：${lv.height || ''}`
        );
      };

      const onRightClick = () => {
        // 右键 = 取消最近一个点
        if (positionsRef.current.length > 0) {
          positionsRef.current = positionsRef.current.slice(0, -1);
          // 简单做法：清空 overlay 重画
          clearOverlay(ds);
          // 重画剩余点 + label
          positionsRef.current.forEach((c, i) => addVertexPoint(ds, c, i));
          if (mode === 'measure-distance') {
            previewLineEntity = addPolylineLine(ds, () => {
              const arr = positionsRef.current;
              if (arr.length >= 1 && hoverCart) return [...arr, hoverCart];
              return arr;
            });
          } else if (mode === 'measure-area') {
            addPolylineLine(ds, () => positionsRef.current);
            addPolygonFill(ds, () => positionsRef.current);
          }
          refreshLive();
        } else {
          // 完全清空
          clearOverlay(ds);
          refreshLive();
        }
      };

      handler.setInputAction(onMouseMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
      handler.setInputAction(onLeftClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      handler.setInputAction(onLeftDblClick, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
      handler.setInputAction(onRightClick, Cesium.ScreenSpaceEventType.RIGHT_CLICK);

      return () => {
        try { handler.destroy(); } catch (_) {}
      };
    });

    return () => {
      stopWaiting();
      // 退出测量模式 → 清空 overlay
      removeOverlay(api);
      positionsRef.current = [];
      lastHeightRef.current = null;
      try { api.setInputBlocked(false); } catch (_) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, api]);

  // 暴露 clear 方法（外部可强制重置）
  const clear = useCallback(() => {
    positionsRef.current = [];
    lastHeightRef.current = null;
    setLive({ distance: null, area: null, height: null });
    const ds = getOverlay(api);
    if (ds && ds.entities) ds.entities.removeAll();
  }, [api]);

  return { live, clear };
}