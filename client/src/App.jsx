import { useEffect, useState, Suspense, lazy } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
// 路由级代码分割 — 首屏只下载 GIS 页面
const GIS = lazy(() => import('./pages/gis/index.jsx'));
import { ThemeProvider } from './components/ThemeProvider.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

const NAV = [
  { to: '/', label: 'GIS 可视化', icon: '🌍' },
];

function Header() {
  return (
    <header className="site-header">
      <div className="brand">
        <div className="brand-logo">🌍</div>
        <div className="brand-text">
          <div className="brand-title">Cesium GIS Editor</div>
          <div className="brand-subtitle">三维地球可视化 · 代码沙箱 · AI 助手</div>
        </div>
      </div>
      <nav className="nav">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
          >
            <span className="nav-icon">{n.icon}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="header-right">
        <button
          type="button"
          className="ai-key-btn"
          title="配置 AI Key（仅存于本会话，刷新/关闭即清）"
          onClick={() => window.dispatchEvent(new CustomEvent('gis-open-key-settings'))}
        >
          <span className="ai-key-btn-icon" aria-hidden="true">🔑</span>
          <span className="ai-key-btn-label">AI Key</span>
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div>© {new Date().getFullYear()} Cesium GIS Editor · Powered by React + Vite + Cesium + Express</div>
      <div className="footer-links">
        <a href="https://cesium.com" target="_blank" rel="noreferrer">3D 地球: CesiumJS</a>
        <span>·</span>
        <a href="https://open-meteo.com" target="_blank" rel="noreferrer">天气数据: Open-Meteo</a>
        <span>·</span>
        <a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
      </div>
    </footer>
  );
}

export default function App() {
  const location = useLocation();

  return (
    <ThemeProvider>
      <div className="app">
        <Header />
        <main id="main" tabIndex={-1} className={'main' + (location.pathname.startsWith('/gis') || location.pathname === '/' ? ' main-full' : '')}>
          <ErrorBoundary>
            <Suspense fallback={<div className="route-loading" role="status" aria-live="polite">页面加载中…</div>}>
              <Routes>
                <Route path="/" element={<GIS />} />
                <Route path="/gis" element={<GIS />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
        <Footer />
      </div>
    </ThemeProvider>
  );
}
