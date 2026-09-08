// client/src/utils/asyncGuard.js
// 周期 9 P1-3: 异步错误守卫 —— 监听 window 'unhandledrejection' + 'error' 事件
// 周期 10 P1-2: 上报到 POST /api/telemetry/client-error（localhost-only）
// 集成 ErrorBoundary 上报（周期 8 之前的 ErrorBoundary 仅捕获同步 render error）
//
// 背景：
//   - React ErrorBoundary 仅捕获 render / lifecycle / constructor 内同步抛错
//   - 不捕获：setTimeout / Promise / fetch / async event handler 中的异步错误
//   - unhandledrejection + window.error 是浏览器异步错误的两个兜底入口
//
// 设计：
//   - installAsyncGuard() 安装监听，返回卸载函数
//   - 通过 onError callback 把异步错误上报到 ErrorBoundary
//   - 集成 telemetry / console.error 兜底
//   - 默认走 navigator.sendBeacon（非阻塞）；失败回退 fetch
//   - 不重复安装（_installed 标记）
//
// 用法（在 main.jsx 或 index.jsx 顶层调用一次）：
//   import { installAsyncGuard } from './utils/asyncGuard';
//   installAsyncGuard({
//     onError: (err, kind) => console.error('[asyncGuard]', kind, err),
//     telemetryUrl: '/api/telemetry/client-error',  // 周期 10 P1-2
//   });

let _installed = false;
let _currentListener = null;
let _telemetryUrl = null;

/**
 * 周期 10 P1-2: 上报 telemetry 到 server（navigator.sendBeacon 优先，非阻塞）
 * 失败静默（仅 console.warn），不抛错
 */
function reportTelemetry(payload) {
  if (!_telemetryUrl || typeof navigator === 'undefined') return;
  try {
    const body = JSON.stringify(payload);
    // sendBeacon 优先（页面 unload 时也不丢失）
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon(_telemetryUrl, blob);
      if (ok) return;
    }
    // fallback: fetch keepalive
    if (typeof fetch === 'function') {
      fetch(_telemetryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => { /* ignore */ });
    }
  } catch (e) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[asyncGuard] telemetry report failed:', e && e.message);
    }
  }
}

/**
 * 安装异步错误守卫
 * @param {object} [opts]
 * @param {Function} [opts.onError] - 回调 (err, kind: 'unhandledrejection'|'window.error')
 * @param {boolean} [opts.silent] - true: 不打 console.error（仅回调）
 * @param {string} [opts.telemetryUrl] - 周期 10 P1-2: 上报 URL（null = 不上报）
 * @returns {Function} 卸载函数
 */
export function installAsyncGuard(opts = {}) {
  if (typeof window === 'undefined') return () => {};
  if (_installed) return _currentListener;
  const onError = typeof opts.onError === 'function' ? opts.onError : null;
  const silent = !!opts.silent;
  _telemetryUrl = typeof opts.telemetryUrl === 'string' && opts.telemetryUrl ? opts.telemetryUrl : null;

  function handlerRejection(event) {
    const reason = event && event.reason !== undefined ? event.reason : event;
    const err = reason instanceof Error ? reason : new Error(String(reason));
    if (!silent && typeof console !== 'undefined' && console.error) {
      console.error('[asyncGuard] unhandledrejection:', err);
    }
    // 周期 10 P1-2: 上报 telemetry
    reportTelemetry({
      kind: 'unhandledrejection',
      message: err.message || String(reason),
      stack: err.stack || null,
      source: 'asyncGuard',
      url: typeof window !== 'undefined' && window.location ? window.location.href : null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      ts: Date.now(),
    });
    if (onError) {
      try { onError(err, 'unhandledrejection'); } catch (_) { /* ignore */ }
    }
    // preventDefault 防止浏览器默认红色 banner 干扰 UI
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
  }

  function handlerError(event) {
    // 注意：window.error 拿到的不是 Error 实例；event.error 才是 Error
    const err = event && event.error instanceof Error
      ? event.error
      : new Error((event && event.message) || 'unknown window error');
    if (!silent && typeof console !== 'undefined' && console.error) {
      console.error('[asyncGuard] window.error:', err, event && event.message);
    }
    // 周期 10 P1-2: 上报 telemetry
    reportTelemetry({
      kind: 'window.error',
      message: err.message || (event && event.message) || 'unknown',
      stack: err.stack || null,
      source: 'asyncGuard',
      url: typeof window !== 'undefined' && window.location ? window.location.href : null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      ts: Date.now(),
    });
    if (onError) {
      try { onError(err, 'window.error'); } catch (_) { /* ignore */ }
    }
  }

  window.addEventListener('unhandledrejection', handlerRejection);
  window.addEventListener('error', handlerError);

  _installed = true;
  // 周期 9 P1-3 fix: 保存对 window 的局部引用，避免 finally 块替换 global.window 后 removeEventListener 失败
  const savedWindow = window;
  _currentListener = () => {
    if (typeof savedWindow === 'undefined' || !savedWindow) {
      // 无 window（node 环境）；仅清状态
      _installed = false;
      _currentListener = null;
      _telemetryUrl = null;
      return;
    }
    try {
      savedWindow.removeEventListener('unhandledrejection', handlerRejection);
      savedWindow.removeEventListener('error', handlerError);
    } catch (e) { /* ignore */ }
    _installed = false;
    _currentListener = null;
    _telemetryUrl = null;
  };
  return _currentListener;
}

/**
 * 已安装？
 */
export function isAsyncGuardInstalled() {
  return _installed;
}

/**
 * 卸载（测试用）
 */
export function uninstallAsyncGuard() {
  if (_currentListener) _currentListener();
}

/**
 * 周期 9 P1-3: 包一层 async 函数，捕获 reject 后通过 onError 上报
 * 用于 setTimeout / setInterval / event handler 等内部 Promise
 *
 * 用法：
 *   import { wrapAsyncHandler } from './utils/asyncGuard';
 *   button.onclick = wrapAsyncHandler(async (e) => { ... }, onError);
 *
 * @param {Function} fn - async 函数
 * @param {Function} [onError] - 错误回调 (err)
 * @returns {Function}
 */
export function wrapAsyncHandler(fn, onError) {
  if (typeof fn !== 'function') return fn;
  return async function wrapped(...args) {
    try {
      return await fn.apply(this, args);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (typeof console !== 'undefined' && console.error) {
        console.error('[asyncGuard] wrapAsyncHandler 捕获错误:', err);
      }
      // 周期 10 P1-2: 也上报
      reportTelemetry({
        kind: 'wrapAsyncHandler',
        message: err.message || String(e),
        stack: err.stack || null,
        source: 'asyncGuard',
        ts: Date.now(),
      });
      if (typeof onError === 'function') {
        try { onError(err); } catch (_) { /* ignore */ }
      }
      // 不 rethrow；让浏览器 unhandledrejection 不再触发（已捕获）
      return undefined;
    }
  };
}

export default {
  installAsyncGuard,
  uninstallAsyncGuard,
  isAsyncGuardInstalled,
  wrapAsyncHandler,
};