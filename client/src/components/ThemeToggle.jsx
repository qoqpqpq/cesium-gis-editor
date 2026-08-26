import React from 'react';
import { useTheme } from './ThemeProvider.jsx';

/**
 * 三态切换按钮:亮 / 暗 / 跟随系统
 * 单击循环切,长按或在 menu 里可选目标态.
 */
export default function ThemeToggle() {
  const { mode, resolved, cycle } = useTheme();

  const next = mode === 'light' ? '暗' : mode === 'dark' ? '系统' : '亮';
  const label = mode === 'light' ? '亮' : mode === 'dark' ? '暗' : '跟随系统';
  const icon = resolved === 'light' ? '☀️' : '🌙';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycle}
      title={`当前: ${label} · 单击切换到 ${next}`}
      aria-label={`主题切换,当前 ${label}`}
    >
      <span className="theme-toggle-icon" aria-hidden="true">{icon}</span>
      <span className="theme-toggle-label">{label}</span>
    </button>
  );
}
