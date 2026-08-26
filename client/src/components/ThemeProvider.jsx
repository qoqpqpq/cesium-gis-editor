import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'theme:mode';
const VALID_MODES = new Set(['light', 'dark', 'system']);

const ThemeContext = createContext(null);

function readStoredMode() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (VALID_MODES.has(v)) return v;
  } catch (_) {
    // localStorage 不可用(隐私模式)时静默回退
  }
  // 优先复用 index.html 里 FOUC 脚本写入的初值
  if (typeof window !== 'undefined' && VALID_MODES.has(window.__THEME_MODE__)) {
    return window.__THEME_MODE__;
  }
  return 'dark';
}

function getSystemMode() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(resolved) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  // 加一个临时 class 触发全局 transition,250ms 后移除
  root.classList.add('theme-transitioning');
  root.setAttribute('data-theme', resolved);
  // meta theme-color 跟随,影响浏览器 UI(地址栏/PWA)
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', resolved === 'light' ? '#f6f8fc' : '#0b1020');
}

export function ThemeProvider({ children, defaultMode = 'dark' }) {
  const [mode, setModeState] = useState(() => readStoredMode() || defaultMode);
  const [systemMode, setSystemMode] = useState(() => getSystemMode());

  // 监听系统偏好变化(仅在 mode === 'system' 时生效)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemMode(mql.matches ? 'dark' : 'light');
    // 立刻同步一次(可能在 ssr/hydration 之间错过的事件)
    onChange();
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    // 老浏览器 fallback
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  // 解析后的实际主题:system 模式下跟随系统,否则就是用户的选择
  const resolved = mode === 'system' ? systemMode : mode;

  // 切到应用 + 持久化
  useEffect(() => {
    applyTheme(resolved);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (_) {
      // 静默失败
    }
    // 切完 ~180ms 移除 transition class,避免无谓的 transition 一直挂
    // (与 theme.css 的 --theme-transition-duration: 160ms 同步,稍留 20ms buffer)
    const t = setTimeout(() => {
      if (typeof document !== 'undefined') {
        document.documentElement.classList.remove('theme-transitioning');
      }
    }, 180);
    return () => clearTimeout(t);
  }, [mode, resolved]);

  // 跨标签同步:另一个标签改了 localStorage,这里也跟
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY && VALID_MODES.has(e.newValue)) {
        setModeState(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setMode = useCallback((next) => {
    if (!VALID_MODES.has(next)) return;
    setModeState(next);
  }, []);

  // 循环切换:light -> dark -> system -> light
  const cycle = useCallback(() => {
    setModeState((prev) => {
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'system';
      return 'light';
    });
  }, []);

  const value = useMemo(
    () => ({ mode, resolved, setMode, cycle }),
    [mode, resolved, setMode, cycle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return ctx;
}
