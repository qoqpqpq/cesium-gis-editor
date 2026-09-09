// client/src/hooks/useOptimisticMarkerBridge.js
// 周期 13 P1-2: useOptimisticMarker + cesiumEarth bridge
// 真实接入 viewer 的 addMarker（替代原 useOptimisticMarker.js 的孤立 hook）
//
// 背景：
//   - 周期 12 P2-1 已落 useOptimisticMarker hook，但未真正接入 cesiumEarth.jsx addMarker
//   - 周期 12 L12-8 反思：客户端真实接入是 P2 的 100%
//   - 本周期：把 hook 包装为完整 bridge，调用方只需传入 viewer ref + server action
//
// 用法：
//   import { useOptimisticMarkerBridge } from '@/hooks/useOptimisticMarkerBridge';
//
//   function MyPage() {
//     const viewerRef = useRef(null);
//     const { markers, pending, error, addMarker } = useOptimisticMarkerBridge({
//       viewerRef,
//       onAddServer: async (payload) => {
//         const r = await fetch('/api/markers', { method: 'POST', body: JSON.stringify(payload) });
//         return await r.json();
//       },
//     });
//   }

'use strict';

// 直接依赖 useOptimisticMarker（周期 12 P2-1 已落）。
// 注意：useOptimisticMarker 自身依赖 useOptimisticAction；本文件不引入 React。
import { useOptimisticMarker } from './useOptimisticMarker.js';

let _idCounter = 0;
function _genOptimisticId() {
  _idCounter += 1;
  return 'opt_bridge_' + Date.now() + '_' + _idCounter;
}

/**
 * 周期 13 P1-2: useOptimisticMarkerBridge
 * 把 useOptimisticMarker 包装为完整 Cesium Viewer 集成
 * @param {object} opts
 * @param {object} opts.viewerRef - React ref to viewer instance（提供 addMarker 方法）
 * @param {Function} opts.onAddServer - async (payload) => Promise<serverData>
 * @param {Function} [opts.buildCesiumEntity] - (payload, optimisticId) => cesium entity descriptor
 * @param {Function} [opts.onOptimisticCreate] - (entity, payload, id) => void
 * @param {Function} [opts.onError] - (err) => void
 * @returns {{ markers, pending, error, addMarker, clearError }}
 */
export function useOptimisticMarkerBridge(opts) {
  if (!opts || typeof opts.onAddServer !== 'function') {
    throw new TypeError('useOptimisticMarkerBridge: opts.onAddServer required');
  }
  const viewerRef = opts.viewerRef || null;
  const buildEntity = typeof opts.buildCesiumEntity === 'function'
    ? opts.buildCesiumEntity
    : (p) => p;
  const onOptimisticCreate = typeof opts.onOptimisticCreate === 'function'
    ? opts.onOptimisticCreate
    : null;
  const onError = typeof opts.onError === 'function' ? opts.onError : null;

  const onAddServerWithViewer = async (payload) => {
    let viewerEntity = null;
    let optimisticId = null;
    if (viewerRef && viewerRef.current && typeof viewerRef.current.addMarker === 'function') {
      optimisticId = _genOptimisticId();
      try {
        viewerEntity = viewerRef.current.addMarker(
          payload.lat,
          payload.lon,
          payload.label,
          payload.color || '#4ade80',
        );
      } catch (e) {
        // 乐观阶段 viewer 失败不阻塞 server 调用
      }
      if (onOptimisticCreate) {
        try { onOptimisticCreate(viewerEntity, payload, optimisticId); } catch (_) {}
      }
    }
    try {
      const serverData = await opts.onAddServer(payload);
      return { ...serverData, _optimisticId: optimisticId };
    } catch (e) {
      if (optimisticId && viewerRef && viewerRef.current && typeof viewerRef.current.removeMarker === 'function') {
        try { viewerRef.current.removeMarker(viewerEntity); } catch (_) {}
      }
      throw e;
    }
  };

  const { markers, pending, error, addMarker, clearError } = useOptimisticMarker({
    onAdd: onAddServerWithViewer,
    onError,
  });

  return { markers, pending, error, addMarker, clearError };
}

export default {
  useOptimisticMarkerBridge,
};