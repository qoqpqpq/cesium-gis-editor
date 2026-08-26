// useDraggableResizable — 让一个 ref 指向的 DOM 元素可拖动 + 8 方向缩放
// 位置和大小持久化到 localStorage（key 可选）
// 拖动：按 header 区域（默认整个顶部 36px）拖动
// 缩放：右下角 8 个方向 handle（n/s/e/w/ne/nw/se/sw）

import { useEffect, useRef } from 'react';

const STORAGE_PREFIX = 'editor.window.';
const MIN_W = 200;
const MIN_H = 120;

function loadState(key, fallback) {
  if (!key) return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw) {
      const obj = JSON.parse(raw);
      if (typeof obj.x === 'number' && typeof obj.y === 'number' && typeof obj.w === 'number' && typeof obj.h === 'number') {
        return obj;
      }
    }
  } catch (_) {}
  return fallback;
}

function saveState(key, state) {
  if (!key) return;
  try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(state)); } catch (_) {}
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function applyState(el, s) {
  el.style.position = 'fixed';
  el.style.left = s.x + 'px';
  el.style.top = s.y + 'px';
  el.style.width = s.w + 'px';
  el.style.height = s.h + 'px';
  el.style.minHeight = s.h + 'px';
  el.style.right = 'auto';
  el.style.bottom = 'auto';
}

export function useDraggableResizable({
  ref,
  storageKey,
  defaultSize = { w: 320, h: 240 },
  defaultPosition = null,
  dragHandleSelector = null,
  resizable = true,
  draggable = true,
  disabled = false,
}) {
  const stateRef = useRef({ x: 0, y: 0, w: defaultSize.w, h: defaultSize.h });
  const dragStateRef = useRef(null);
  const teardownRef = useRef(null);
  const paramsRef = useRef({ storageKey, defaultSize, defaultPosition, dragHandleSelector, resizable, draggable, disabled });

  paramsRef.current = { storageKey, defaultSize, defaultPosition, dragHandleSelector, resizable, draggable, disabled };

  useEffect(() => {
    // 完全跳过：不绑 ref、不读写 localStorage、不动内联样式
    // 让 CSS（如 .editor-cursor-readout--docked）自己控制位置和尺寸
    if (paramsRef.current.disabled) return undefined;

    let cancelled = false;
    let rafId = null;

    const tryInit = () => {
      if (cancelled) return;
      const el = ref && ref.current;
      if (!el) {
        rafId = requestAnimationFrame(tryInit);
        return;
      }
      if (el.dataset.drInitialized === '1') return;
      initOn(el);
    };

    const initOn = (el) => {
      el.dataset.drInitialized = '1';
      const p = paramsRef.current;

      // 初始化位置和大小
      const initial = loadState(p.storageKey, null);
      if (initial) {
        stateRef.current = initial;
      } else if (p.defaultPosition) {
        stateRef.current = { x: p.defaultPosition.x, y: p.defaultPosition.y, w: p.defaultSize.w, h: p.defaultSize.h };
      } else {
        const rect = el.getBoundingClientRect();
        stateRef.current = { x: rect.left, y: rect.top, w: p.defaultSize.w, h: p.defaultSize.h };
      }
      applyState(el, stateRef.current);

      // 拖动
      let onPointerDown = null;

      if (p.draggable) {
        onPointerDown = (e) => {
          if (e.target.closest('.editor-resize-handle')) return;
          if (e.target.closest('input, textarea, select, label')) return;
          // 检查是否在 header 上
          const inHeader = p.dragHandleSelector
            ? !!e.target.closest(p.dragHandleSelector)
            : e.clientY - el.getBoundingClientRect().top < 36;
          if (!inHeader) return;
          // 按钮可点（除了纯 header 区域）
          e.preventDefault();
          const startRect = el.getBoundingClientRect();
          dragStateRef.current = {
            mode: 'drag',
            startX: startRect.left, startY: startRect.top,
            startMouseX: e.clientX, startMouseY: e.clientY,
            startW: startRect.width, startH: startRect.height,
          };

          const onPointerMove = (ev) => {
            const s = dragStateRef.current;
            if (!s || s.mode !== 'drag') return;
            const dx = ev.clientX - s.startMouseX;
            const dy = ev.clientY - s.startMouseY;
            const newX = clamp(s.startX + dx, 0, window.innerWidth - 40);
            const newY = clamp(s.startY + dy, 0, window.innerHeight - 40);
            stateRef.current.x = newX;
            stateRef.current.y = newY;
            el.style.left = newX + 'px';
            el.style.top = newY + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
          };
          const onPointerUp = () => {
            dragStateRef.current = null;
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            if (p.storageKey) saveState(p.storageKey, stateRef.current);
          };
          window.addEventListener('pointermove', onPointerMove);
          window.addEventListener('pointerup', onPointerUp);
        };
        el.addEventListener('pointerdown', onPointerDown);
      }

      // 缩放 handle
      if (p.resizable && el.querySelectorAll('.editor-resize-handle').length === 0) {
        const handles = [
          { dir: 'n',  style: 'top:0;left:0;right:0;height:6px;cursor:ns-resize;' },
          { dir: 's',  style: 'bottom:0;left:0;right:0;height:6px;cursor:ns-resize;' },
          { dir: 'e',  style: 'top:0;bottom:0;right:0;width:6px;cursor:ew-resize;' },
          { dir: 'w',  style: 'top:0;bottom:0;left:0;width:6px;cursor:ew-resize;' },
          { dir: 'ne', style: 'top:0;right:0;width:14px;height:14px;cursor:nesw-resize;' },
          { dir: 'nw', style: 'top:0;left:0;width:14px;height:14px;cursor:nwse-resize;' },
          { dir: 'se', style: 'bottom:0;right:0;width:14px;height:14px;cursor:nwse-resize;' },
          { dir: 'sw', style: 'bottom:0;left:0;width:14px;height:14px;cursor:nesw-resize;' },
        ];
        const handleCleanups = [];
        handles.forEach((h) => {
          const div = document.createElement('div');
          div.className = 'editor-resize-handle editor-resize-' + h.dir;
          div.style.cssText = 'position:absolute;z-index:10;user-select:none;' + h.style;
          el.appendChild(div);
          const onHandleDown = (e) => {
            e.stopPropagation();
            e.preventDefault();
            const startRect = el.getBoundingClientRect();
            dragStateRef.current = {
              mode: 'resize',
              dir: h.dir,
              startX: startRect.left, startY: startRect.top,
              startW: startRect.width, startH: startRect.height,
              startMouseX: e.clientX, startMouseY: e.clientY,
            };
            const onRM = (ev) => {
              const s = dragStateRef.current;
              if (!s || s.mode !== 'resize') return;
              const dx = ev.clientX - s.startMouseX;
              const dy = ev.clientY - s.startMouseY;
              let newX = s.startX, newY = s.startY, newW = s.startW, newH = s.startH;
              if (s.dir.includes('e')) newW = Math.max(MIN_W, s.startW + dx);
              if (s.dir.includes('s')) newH = Math.max(MIN_H, s.startH + dy);
              if (s.dir.includes('w')) {
                newW = Math.max(MIN_W, s.startW - dx);
                newX = s.startX + (s.startW - newW);
              }
              if (s.dir.includes('n')) {
                newH = Math.max(MIN_H, s.startH - dy);
                newY = s.startY + (s.startH - newH);
              }
              newX = clamp(newX, 0, window.innerWidth - 40);
              newY = clamp(newY, 0, window.innerHeight - 40);
              stateRef.current = { x: newX, y: newY, w: newW, h: newH };
              el.style.left = newX + 'px';
              el.style.top = newY + 'px';
              el.style.width = newW + 'px';
              el.style.height = newH + 'px';
              el.style.right = 'auto';
              el.style.bottom = 'auto';
            };
            const onRU = () => {
              dragStateRef.current = null;
              window.removeEventListener('pointermove', onRM);
              window.removeEventListener('pointerup', onRU);
              if (p.storageKey) saveState(p.storageKey, stateRef.current);
            };
            window.addEventListener('pointermove', onRM);
            window.addEventListener('pointerup', onRU);
          };
          div.addEventListener('pointerdown', onHandleDown);
          handleCleanups.push(() => div.removeEventListener('pointerdown', onHandleDown));
        });
        teardownRef.current = () => {
          if (onPointerDown) el.removeEventListener('pointerdown', onPointerDown);
          handleCleanups.forEach((fn) => fn());
        };
      } else if (p.draggable) {
        teardownRef.current = () => {
          if (onPointerDown) el.removeEventListener('pointerdown', onPointerDown);
        };
      }
    };

    tryInit();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (teardownRef.current) teardownRef.current();
      // 注意：不在卸载时清 dataset 标记，因为元素可能被 React 复用
    };
  }, [ref]);
}
