// SimplifyDialog — 几何简化对话框
// range slider 控制 epsilon，实时显示原/新/Δ 顶点数

import { useEffect, useRef, useState } from 'react';
import { useDraggableResizable } from '../hooks/useDraggableResizable.js';

// epsilonDeg：滑块用 log 映射（4e-6 ~ 1e-3）
const MIN_LOG = Math.log(4e-6);
const MAX_LOG = Math.log(1e-3);

function sliderToEps(v) {
  return Math.exp(MIN_LOG + (MAX_LOG - MIN_LOG) * v);
}
function epsToSlider(eps) {
  return (Math.log(eps) - MIN_LOG) / (MAX_LOG - MIN_LOG);
}

function fmtEps(eps) {
  if (eps >= 1e-3) return eps.toFixed(4) + '°';
  if (eps >= 1e-4) return (eps * 1e3).toFixed(2) + ' m°';
  if (eps >= 1e-5) return (eps * 1e3).toFixed(1) + ' m°';
  return (eps * 1e6).toFixed(1) + ' μ°';
}

export default function SimplifyDialog({ open, onClose, entity, kind, onPreview, onApply }) {
  const [eps, setEps] = useState(5e-5); // 默认 ~5m
  const [oldCount, setOldCount] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const debounceRef = useRef(null);
  const modalRef = useRef(null);

  useDraggableResizable({
    ref: modalRef,
    storageKey: 'editor-simplify-dialog',
    defaultSize: { w: 360, h: 280 },
    defaultPosition: { x: window.innerWidth / 2 - 180, y: window.innerHeight / 2 - 140 },
    dragHandleSelector: '.editor-modal-header',
  });

  // 每次打开 → 重置 + 算默认
  useEffect(() => {
    if (!open || !entity) return;
    setEps(5e-5);
  }, [open, entity]);

  // 每次 eps 变 → 算新顶点数 + 防抖 preview
  useEffect(() => {
    if (!open || !entity || !onPreview) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const result = onPreview(eps);
      if (result) {
        setOldCount(result.old.length);
        setNewCount(result.fresh.length);
      }
    }, 80);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [eps, open, entity, onPreview]);

  if (!open) return null;

  return (
    <div className="editor-modal-backdrop" onClick={onClose}>
      <div className="editor-modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <div className="editor-modal-header">
          <span>🧮 简化几何</span>
          <button className="icon-btn" onClick={onClose} aria-label="关闭简化对话框">✕</button>
        </div>
        <div className="editor-modal-body">
          <div className="editor-simplify-stats">
            <div className="stat">
              <div className="stat-label">原始顶点</div>
              <div className="stat-val">{oldCount}</div>
            </div>
            <div className="stat-arrow">→</div>
            <div className="stat">
              <div className="stat-label">简化后</div>
              <div className="stat-val accent">{newCount}</div>
            </div>
            <div className="stat-arrow">Δ</div>
            <div className="stat">
              <div className="stat-label">减少</div>
              <div className="stat-val">{Math.max(0, oldCount - newCount)}</div>
            </div>
          </div>
          <div className="editor-simplify-slider">
            <div className="editor-simplify-eps">
              <span className="muted">容差 ε</span>
              <span className="val">{fmtEps(eps)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.005}
              value={epsToSlider(eps)}
              onChange={(e) => setEps(sliderToEps(parseFloat(e.target.value)))}
            />
            <div className="editor-simplify-eps-labels">
              <span>精细</span>
              <span>粗糙</span>
            </div>
          </div>
        </div>
        <div className="editor-modal-footer">
          <button className="btn-link" onClick={onClose}>取消</button>
          <button
            className="btn-primary"
            disabled={oldCount === 0 || newCount === oldCount || newCount < 2}
            onClick={() => {
              onApply && onApply(eps);
              onClose();
            }}
          >应用</button>
        </div>
      </div>
    </div>
  );
}
