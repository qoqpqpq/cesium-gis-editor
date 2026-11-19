// 周期139: useGisPage 拆分 (1/4) —— 三列面板布局子钩子
// 纯布局逻辑: 列宽 / 折叠 / 拖拽调节 / resize 收紧 / localStorage 持久化。
// 仅依赖传入的 containerRef (父钩子的容器 ref)。零业务耦合。
import { useEffect, useRef, useState, useCallback } from 'react';

export const COLLAPSED_W = 36; // 折叠后的窄条宽度
export const MIN_W = 240;      // 最小展开宽度
export const CENTER_MIN = 180; // 中列保底宽度（让出更多空间给左右侧）

function loadNum(key, fallback) {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) ? v : fallback;
  } catch (_) { return fallback; }
}
function loadBool(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === 'true';
  } catch (_) { return fallback; }
}

export function usePanelLayout(containerRef) {
  // ===== 三列宽度 & 折叠状态 =====
  // 初始默认三列各占 1/3（基于当前视口宽度），保留用户已拖拽保存的自定义宽度
  const calcThird = () => {
    const mainPad = 24;       // .main-full padding-left + padding-right
    const gisPad = 24;        // .gis-container padding-left + padding-right
    const splitters = 14;     // 两个 7px 分隔条
    const usable = (window.innerWidth || 1920) - mainPad - gisPad - splitters;
    return Math.max(420, Math.round(usable / 3));
  };
  const [leftW, setLeftW] = useState(() => {
    const v = loadNum('gis-left-w', 0);
    return v >= 420 ? v : calcThird();
  });
  const [rightW, setRightW] = useState(() => {
    const v = loadNum('gis-right-w', 0);
    return v >= 420 ? v : calcThird();
  });
  const [leftCollapsed, setLeftCollapsed] = useState(() => loadBool('gis-left-collapsed', false));
  const [rightCollapsed, setRightCollapsed] = useState(() => loadBool('gis-right-collapsed', false));

  useEffect(() => { try { localStorage.setItem('gis-left-w', String(leftW)); } catch (_) {} }, [leftW]);
  useEffect(() => { try { localStorage.setItem('gis-right-w', String(rightW)); } catch (_) {} }, [rightW]);
  useEffect(() => { try { localStorage.setItem('gis-left-collapsed', String(leftCollapsed)); } catch (_) {} }, [leftCollapsed]);
  useEffect(() => { try { localStorage.setItem('gis-right-collapsed', String(rightCollapsed)); } catch (_) {} }, [rightCollapsed]);

  // 窗口 resize 时自动收紧列宽，防止 grid 溢出
  useEffect(() => {
    const handleResize = () => {
      const containerW = containerRef.current?.getBoundingClientRect()?.width;
      if (!containerW) return;
      const SPLITTERS = 14; // 两个 7px 分隔条
      const maxTotal = containerW - SPLITTERS - CENTER_MIN;
      if (leftW + rightW > maxTotal) {
        // 等比缩：各自最多缩到 MIN_W
        const ratio = (maxTotal - MIN_W * 2) / (leftW + rightW - MIN_W * 2);
        if (ratio < 1) {
          const newLeft = Math.round(MIN_W + (leftW - MIN_W) * ratio);
          const newRight = Math.round(MIN_W + (rightW - MIN_W) * ratio);
          setLeftW(Math.max(MIN_W, newLeft));
          setRightW(Math.max(MIN_W, newRight));
        }
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [leftW, rightW]);

  // 拖拽调节列宽：mousedown 时直接绑定 mousemove/mouseup
  const startDrag = useCallback((type) => (e) => {
    e.preventDefault();
    const containerW = containerRef.current?.getBoundingClientRect()?.width || window.innerWidth;
    const SPLITTERS = 14; // 两个分割条宽度
    const startX = e.clientX;
    const startW = type === 'left' ? leftW : rightW;
    // 本列最大宽度 = 容器 - splitters - 另一列 - 中列保底
    const otherW = type === 'left' ? rightW : leftW;
    const myMax = Math.max(MIN_W, containerW - SPLITTERS - otherW - CENTER_MIN);

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev) => {
      const delta = ev.clientX - startX;
      const raw = type === 'left' ? startW + delta : startW - delta;
      const next = Math.max(MIN_W, Math.min(myMax, raw));
      if (type === 'left') setLeftW(Math.round(next));
      else setRightW(Math.round(next));
    };
    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [leftW, rightW]);

  return {
    calcThird,
    leftW, setLeftW,
    rightW, setRightW,
    leftCollapsed, setLeftCollapsed,
    rightCollapsed, setRightCollapsed,
    startDrag,
  };
}