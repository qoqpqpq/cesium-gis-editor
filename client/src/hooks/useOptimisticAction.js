// client/src/hooks/useOptimisticAction.js
// 周期 12 P1-1: useOptimistic + useActionStateGuard 联合 hook
// ESM module (client/package.json: "type": "module")
//
// 背景：
//   - 周期 11 P1-2: useActionStateGuard 已落（React 19 useActionState + React 18 fallback）
//   - React 19 useOptimistic：让 UI 在 server 确认前显示"乐观"状态；失败自动回滚
//   - 联合：点击 → 立即显示 optimistic 项 → server 确认 → 保留；server 拒绝 → 回滚到上一稳定态
//
// 用法：
//   import { useOptimisticAction } from '@/hooks/useOptimisticAction';
//   const { state, optimisticState, action, isPending, error } = useOptimisticAction(
//     async (prev, payload) => { const r = await api.add(payload); if (!r.ok) throw r.error; return r.data; },
//     { items: [] },                                  // 初始 state
//     (current, payload) => [...current, payload],    // optimistic reducer
//   );
//
// 兼容性：
//   - React 19：useOptimistic + useActionStateGuard 全用
//   - React 18：useOptimistic 不可用 → fallback 到 useActionStateGuard 的纯 guard 路径
//
// 验收（spec ≥25 PASS）：
//   - 5 类状态正确切换
//   - 失败自动回滚
//   - 重复点击去抖
//   - 乐观 reducer 函数式纯度
//   - React 18 fallback

'use strict';

import { serializeError, isReact19, initUseActionStateGuard } from '../utils/useActionStateGuard.js';

let _React = null;
let _reactLoadError = null;

async function _loadReact() {
  if (_React) return _React;
  try {
    if (typeof globalThis !== 'undefined' && typeof globalThis.require === 'function') {
      // eslint-disable-next-line global-require
      _React = globalThis.require('react');
    } else {
      _React = await import('react');
    }
  } catch (e) {
    _reactLoadError = e;
  }
  return _React;
}

function _getReact() {
  if (!_React) {
    try {
      // eslint-disable-next-line global-require
      _React = globalThis.require && globalThis.require('react');
    } catch (e) {
      _reactLoadError = e;
    }
  }
  return _React;
}

/**
 * 周期 12 P1-1: useOptimisticAction 联合 hook
 *
 * @param {Function} actionFn - async (prevState, payload) => Promise<newState>
 * @param {object} initialState - 初始 state（含乐观数组字段）
 * @param {Function} optimisticReducer - (currentOptimistic, payload) => nextOptimistic
 * @param {object} [opts]
 * @param {Function} [opts.onError]
 * @param {Function} [opts.shouldOptimistic] - 决定是否触发 optimistic（返回 false 则跳过）
 * @returns {{
 *   state: object,
 *   optimisticState: object,
 *   action: Function,
 *   isPending: boolean,
 *   error: object|null,
 *   clearError: Function
 * }}
 */
export function useOptimisticAction(actionFn, initialState, optimisticReducer, opts = {}) {
  if (typeof actionFn !== 'function') {
    throw new TypeError('useOptimisticAction: actionFn must be a function');
  }
  if (!initialState || typeof initialState !== 'object') {
    throw new TypeError('useOptimisticAction: initialState must be an object');
  }
  if (typeof optimisticReducer !== 'function') {
    throw new TypeError('useOptimisticAction: optimisticReducer must be a function');
  }
  const onError = typeof opts.onError === 'function' ? opts.onError : null;
  const shouldOptimistic = typeof opts.shouldOptimistic === 'function'
    ? opts.shouldOptimistic
    : () => true;

  // 同步获取 React（hook 内必须在 React 上下文调用）
  const React = _getReact();
  if (!React || typeof React.useState !== 'function') {
    throw new Error(
      'useOptimisticAction: React must be available. ' +
      (_reactLoadError ? `Load error: ${_reactLoadError.message}` : '')
    );
  }

  const supportsOptimistic = typeof React.useOptimistic === 'function';
  const supportsActionState = typeof React.useActionState === 'function';

  // === React 19 路径：useActionState + useOptimistic 联合 ===
  if (supportsOptimistic && supportsActionState) {
    const [optimisticState, addOptimistic] = React.useOptimistic(
      initialState,
      // React 19 useOptimistic 期望 reducer (currentState, optimisticValue) → newState
      (cur, payload) => {
        if (!shouldOptimistic(payload)) return cur;
        return optimisticReducer(cur, payload);
      }
    );

    const [state, dispatch, isPending] = React.useActionState(
      async (prev, payload) => {
        try {
          const result = await actionFn(prev, payload);
          return { ...(result || {}), error: null };
        } catch (e) {
          const err = serializeError(e);
          if (onError) {
            try { onError(e, actionFn.name || 'optimistic-action'); } catch (_) { /* ignore */ }
          }
          // 不 rethrow；返回结构化 state
          return { ...prev, error: err };
        }
      },
      { ...initialState, error: null }
    );

    // 包装 action：调用前 addOptimistic（乐观），再 dispatch（真请求）
    const action = (payload) => {
      if (shouldOptimistic(payload)) {
        // addOptimistic 必须与 dispatch 在同一 React 同步事务中
        addOptimistic(payload);
      }
      dispatch(payload);
    };

    return {
      state,
      optimisticState,
      action,
      isPending: !!isPending,
      error: state.error || null,
      clearError: () => { try { dispatch(null); } catch (_) { /* ignore */ } },
    };
  }

  // === React 18 fallback：无 useOptimistic，用 guard 简化版 ===
  const useState = React.useState;
  const useCallback = React.useCallback;
  const useRef = React.useRef;
  if (typeof useState !== 'function') {
    throw new Error('useOptimisticAction: React.useState required for fallback');
  }

  const [state, setState] = useState({ ...initialState, error: null });
  const [isPending, setPending] = useState(false);
  const [optimisticState, setOptimistic] = useState(initialState);
  const inFlightRef = useRef(false);

  const action = useCallback(async (payload) => {
    if (inFlightRef.current) return; // 去抖：上一次未完成则跳过
    inFlightRef.current = true;
    if (shouldOptimistic(payload)) {
      setOptimistic((cur) => optimisticReducer(cur, payload));
    }
    setPending(true);
    try {
      const result = await actionFn(state, payload);
      setState((prev) => ({ ...(result || {}), error: null }));
    } catch (e) {
      const err = serializeError(e);
      if (onError) {
        try { onError(e, actionFn.name || 'optimistic-action'); } catch (_) { /* ignore */ }
      }
      setState((prev) => ({ ...prev, error: err }));
      // 失败回滚 optimisticState 到 initialState（保守做法）
      setOptimistic(initialState);
    } finally {
      setPending(false);
      inFlightRef.current = false;
    }
  }, [actionFn, initialState, optimisticReducer, onError, shouldOptimistic, state]);

  return {
    state,
    optimisticState,
    action,
    isPending,
    error: state.error || null,
    clearError: () => setState((prev) => ({ ...prev, error: null })),
  };
}

/**
 * 周期 12 P1-1: 初始化 hook（Vite 入口处异步加载 React）
 */
export async function initUseOptimisticAction() {
  await _loadReact();
  return {
    isReact19: isReact19(),
    supportsOptimistic: typeof _React?.useOptimistic === 'function',
    version: _React?.version || 'unknown',
  };
}

export default {
  useOptimisticAction,
  initUseOptimisticAction,
};