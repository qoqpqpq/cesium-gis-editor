// client/src/hooks/useOptimisticMarker.js
// 周期 12 P2-1: useOptimisticMarker — 在 Cesium Viewer 中使用 useOptimisticAction 的 marker 添加 hook
//
// 背景：
//   - 周期 12 P1-1 落 useOptimisticAction（联合 useOptimistic + useActionStateGuard）
//   - CesiumEarth.jsx addMarker：当前直接 await API + setState 三步；本 hook 抽象为
//     "点击 → 立即在 Viewer 显示 marker → server 确认 → 保留；失败 → 自动回滚"
//
// 用法：
//   import { useOptimisticMarker } from '@/hooks/useOptimisticMarker';
//   const { markers, pending, error, addMarker } = useOptimisticMarker({
//     onAdd: async (payload) => {
//       const r = await api.addMarker(payload);
//       if (!r.ok) throw new Error('add failed');
//       return r.data;
//     },
//   });
//
//   <button onClick={() => addMarker({ lat, lon, label })}>Add Marker</button>
//   {markers.map(m => <Marker key={m.id} {...m} pending={m.pending} />)}

'use strict';

import { useOptimisticAction } from './useOptimisticAction.js';

let _idCounter = 0;
function _genId() {
  _idCounter += 1;
  return 'opt_marker_' + Date.now() + '_' + _idCounter;
}

/**
 * 周期 12 P2-1: useOptimisticMarker hook
 *
 * @param {object} opts
 * @param {Function} opts.onAdd - async (payload) => Promise<{id, ...rest}>
 * @param {Function} [opts.onError] - (err) => void
 * @returns {{
 *   markers: Array,
 *   pending: boolean,
 *   error: object|null,
 *   addMarker: Function,
 *   clearError: Function
 * }}
 */
export function useOptimisticMarker(opts) {
  if (!opts || typeof opts.onAdd !== 'function') {
    throw new TypeError('useOptimisticMarker: opts.onAdd (async fn) required');
  }
  const onError = typeof opts.onError === 'function' ? opts.onError : null;
  const onAdd = opts.onAdd;

  const { state, optimisticState, action, isPending, error, clearError } = useOptimisticAction(
    async (prev, payload) => {
      try {
        const result = await onAdd(payload);
        // 把新 marker 加到 confirmed 列表
        const next = (prev.confirmed || []).concat([{ ...result, pending: false, optimistic: false }]);
        return { ...prev, confirmed: next };
      } catch (e) {
        if (onError) {
          try { onError(e); } catch (_) { /* ignore */ }
        }
        throw e; // 触发 rollback
      }
    },
    { confirmed: [] },
    (cur, payload) => {
      // 乐观：先把 marker 加到 optimistic 列表
      const id = payload._optimisticId || _genId();
      const next = (cur.confirmed || []).concat([{ ...payload, id, pending: true, optimistic: true }]);
      return { confirmed: next };
    }
  );

  // addMarker 包装：注入 _optimisticId 让 optimistic 状态可关联
  const addMarker = (payload) => {
    const optId = _genId();
    action({ ...payload, _optimisticId: optId });
  };

  return {
    markers: (optimisticState && optimisticState.confirmed) || [],
    confirmed: (state && state.confirmed) || [],
    pending: !!isPending,
    error,
    addMarker,
    clearError,
  };
}

export default {
  useOptimisticMarker,
};