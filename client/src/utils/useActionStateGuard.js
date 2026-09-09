// client/src/utils/useActionStateGuard.js
// 周期 11 P1-2: React 19 useActionState 错误边界 wrapper
// ESM module (client/package.json: "type": "module")
//
// 背景：
//   - React 19 useActionState：处理表单/异步 action 的状态机
//     const [state, formAction, isPending] = useActionState(action, initialState, permalink?)
//   - action 内 throw → state.error 自动捕获
//   - 但 throw 的 error 必须可序列化（不能是 Error 实例，需转 JSON-friendly）
//   - 本 wrapper 统一：错误捕获 + 转换 + 上报 telemetry + 返回结构化 state
//
// 兼容性：
//   - React 18：不支持 useActionState（hook 为 undefined）；useActionStateGuard 走 redux-style fallback
//   - React 19：自动使用 useActionState
//
// 用法：
//   import { useActionStateGuard } from './utils/useActionStateGuard';
//
//   async function submitAction(prevState, formData) {
//     const r = await fetch('/api/...', { method: 'POST', body: formData });
//     if (!r.ok) throw new Error('submit failed');
//     return { ok: true, data: await r.json() };
//   }
//
//   function MyForm() {
//     const { state, action, isPending, error } = useActionStateGuard(submitAction, { ok: false });
//     return <form action={action}>...</form>;
//   }
//
// 设计：
//   - 不引 React 19 依赖（运行时可选加载）
//   - 不引 telemetry 强依赖（opts.onError 可选；传则上报，不传仅 console.error）
//   - reducer 模式 + 错误捕获 + 状态序列化兼容

'use strict';

// 周期 11 P1-2: 可选加载 react（peer dependency；ESM 动态 import）
let _React = null;
let _reactLoadError = null;
async function _loadReact() {
  if (_React) return _React;
  try {
    // 浏览器/Vite 走动态 import；Node 走 createRequire
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

/**
 * 是否检测到 React 19+ useActionState hook（同步，仅在已加载 React 后可用）
 */
function _detectUseActionState() {
  if (!_React) return false;
  return typeof _React.useActionState === 'function';
}

/**
 * 序列化 error 为 JSON-friendly（避免 throw Error 后 React 19 不能 stringify）
 * 周期 11 P1-2: Error → {name, message, stack}
 */
export function serializeError(err) {
  if (!err) return { name: 'UnknownError', message: 'unknown', stack: null };
  if (err instanceof Error) {
    return {
      name: err.name || 'Error',
      message: err.message || String(err),
      stack: err.stack || null,
    };
  }
  return {
    name: 'NonErrorValue',
    message: typeof err === 'string' ? err : (() => {
      try { return JSON.stringify(err); } catch (_) { return String(err); }
    })(),
    stack: null,
  };
}

/**
 * 默认 reducer：合并 prevState + newState
 * React 19 useActionState 期望 reducer 签名 (prevState, formData) → newState
 */
function defaultReducer(prevState, newState) {
  if (!newState) return prevState;
  return { ...prevState, ...newState };
}

/**
 * 周期 11 P1-2: useActionStateGuard 主函数
 * 同步签名（运行时 React 由 hook 调用发现）
 *
 * @param {Function} actionFn - 异步 action (prevState, formData) → Promise<state>
 * @param {object} initialState - 初始 state
 * @param {object} [opts]
 * @param {Function} [opts.onError] - (err, actionName) => void；异步错误回调
 * @param {Function} [opts.reducer] - 自定义 reducer (prev, next) => state
 * @returns {{state: object, action: Function, isPending: boolean, error: object|null, clearError: Function}}
 */
export function useActionStateGuard(actionFn, initialState, opts = {}) {
  if (typeof actionFn !== 'function') {
    throw new TypeError('useActionStateGuard: actionFn must be a function');
  }
  if (!initialState || typeof initialState !== 'object') {
    throw new TypeError('useActionStateGuard: initialState must be an object');
  }
  const onError = typeof opts.onError === 'function' ? opts.onError : null;
  const reducer = typeof opts.reducer === 'function' ? opts.reducer : defaultReducer;

  // 同步获取 React（hook 必须在 React 上下文内调用；此处依赖 React 已加载）
  if (!_React) {
    // 尝试 require（CJS path）
    try {
      // eslint-disable-next-line global-require
      _React = globalThis.require && globalThis.require('react');
    } catch (e) {
      _reactLoadError = e;
    }
  }
  if (!_React) {
    throw new Error(
      'useActionStateGuard: React must be available. ' +
      'Install react@^18.0.0 or react@^19.0.0. ' +
      (_reactLoadError ? `Load error: ${_reactLoadError.message}` : '')
    );
  }

  const supportsReact19 = _detectUseActionState();

  if (supportsReact19) {
    // React 19 路径：用 useActionState；action 内部错误 throw 自动 → state.error
    const [rawState, dispatch, isPending] = _React.useActionState(
      async (prev, formData) => {
        try {
          const result = await actionFn(prev, formData);
          return { ...reducer(prev, result || {}), error: null };
        } catch (e) {
          const err = serializeError(e);
          if (onError) {
            try { onError(e, actionFn.name || 'anonymous'); } catch (_) { /* ignore */ }
          }
          // 不 rethrow；返回结构化 state
          return { ...prev, error: err };
        }
      },
      { ...initialState, error: null }
    );

    const clearError = () => {
      // 通过空 dispatch 触发 reducer（reducer 不变，仅清 error）
      try { dispatch(null); } catch (_) { /* ignore */ }
    };

    return {
      state: rawState,
      action: dispatch,
      isPending: !!isPending,
      error: rawState.error || null,
      clearError,
    };
  }

  // Fallback 路径：React 18（useActionState 不可用）
  const useState = _React.useState;
  const useCallback = _React.useCallback;
  if (typeof useState !== 'function' || typeof useCallback !== 'function') {
    throw new Error(
      'useActionStateGuard: React 18 useState/useCallback required for fallback path. ' +
      'Current version: ' + (_React.version || 'unknown')
    );
  }

  const [state, setState] = useState({ ...initialState, error: null });
  const [isPending, setPending] = useState(false);

  const action = useCallback(async (formData) => {
    setPending(true);
    try {
      const result = await actionFn(state, formData);
      setState((prev) => ({ ...reducer(prev, result || {}), error: null }));
    } catch (e) {
      const err = serializeError(e);
      if (onError) {
        try { onError(e, actionFn.name || 'anonymous'); } catch (_) { /* ignore */ }
      }
      setState((prev) => ({ ...prev, error: err }));
    } finally {
      setPending(false);
    }
  }, [actionFn, state, onError, reducer]);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    state,
    action,
    isPending,
    error: state.error || null,
    clearError,
  };
}

/**
 * 周期 11 P1-2: 检测当前 React 是否支持 useActionState
 */
export function isReact19() {
  return _detectUseActionState();
}

/**
 * 周期 11 P1-2: 获取当前 React 版本
 */
export function getReactVersion() {
  if (!_React || !_React.version) return 'unknown';
  return _React.version;
}

/**
 * 周期 11 P1-2: 初始化（Vite SPA 入口处调用，加载 React）
 */
export async function initUseActionStateGuard() {
  await _loadReact();
  return !!_React;
}

export default {
  useActionStateGuard,
  serializeError,
  isReact19,
  getReactVersion,
  initUseActionStateGuard,
};
