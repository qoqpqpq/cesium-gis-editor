// ThreeCheckPanel — 三项检查面板
// 来源：GeoLibre 文章的"分析前先做三项检查"框架
// 显示 位置 / 几何 / 属性 三个分类卡 + 摘要

import { useMemo, useRef, useState } from 'react';
import { useDraggableResizable } from '../hooks/useDraggableResizable.js';
import { runThreeCheck } from '../utils/threeCheck.js';

const KIND_LABEL = { position: '位置', geometry: '几何', attributes: '属性' };

function CategoryCard({ name, result }) {
  const ok = result.ok;
  const errors = result.issues.filter((i) => i.severity === 'error');
  const warns = result.issues.filter((i) => i.severity === 'warn');
  const icon = errors.length ? '❌' : warns.length ? '⚠️' : '✅';
  const tone = errors.length ? 'err' : warns.length ? 'warn' : 'ok';
  return (
    <div className={`three-check-card three-check-${tone}`}>
      <div className="three-check-card-header">
        <span className="three-check-icon">{icon}</span>
        <span className="three-check-name">{KIND_LABEL[name] || name}</span>
        <span className="three-check-count">
          {errors.length ? `${errors.length} 错` : ''}
          {warns.length ? ` ${warns.length} 警` : ''}
          {!errors.length && !warns.length ? '通过' : ''}
        </span>
      </div>
      {(errors.length + warns.length) > 0 && (
        <ul className="three-check-list">
          {errors.map((it, i) => (
            <li key={`e-${i}`} className="three-check-item error">
              <span className="three-check-field">{it.field}</span>
              <span className="three-check-msg">{it.message}</span>
            </li>
          ))}
          {warns.map((it, i) => (
            <li key={`w-${i}`} className="three-check-item warn">
              <span className="three-check-field">{it.field}</span>
              <span className="three-check-msg">{it.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ThreeCheckPanel({
  open,
  onClose,
  selectedIds,
  getSelectedEntities, // () => Entity[]
  onInfo,
}) {
  const panelRef = useRef(null);
  useDraggableResizable({
    ref: panelRef,
    storageKey: 'editor-three-check',
    defaultSize: { w: 360, h: 360 },
    defaultPosition: { x: 460, y: 140 },
    dragHandleSelector: '.three-check-header',
  });

  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);

  const selectedCount = selectedIds ? selectedIds.size : 0;

  const handleRun = () => {
    const ents = getSelectedEntities ? getSelectedEntities() : [];
    if (!ents.length) {
      onInfo && onInfo('请先选中至少 1 个要素');
      return;
    }
    setBusy(true);
    try {
      const r = runThreeCheck(ents);
      setReport(r);
    } finally {
      setBusy(false);
    }
  };

  const handleConsoleDump = () => {
    if (!report) return;
    // eslint-disable-next-line no-console
    console.log('[three-check] report =', report);
    onInfo && onInfo('报告已输出到控制台');
  };

  if (!open) return null;

  return (
    <div className="three-check-panel" ref={panelRef}>
      <div className="three-check-header">
        <span>🧪 三项检查</span>
        <button className="attr-table-btn close" onClick={onClose} aria-label="关闭三维检查面板">✕</button>
      </div>
      <div className="three-check-body">
        <div className="three-check-row">
          <span className="three-check-hint">
            来源：GeoLibre 文章的"分析前先做三项检查"框架。当前选中 {selectedCount} 个要素。
          </span>
        </div>
        <div className="three-check-actions">
          <button className="attr-table-btn" onClick={handleRun} disabled={busy}>
            {busy ? '…' : '运行检查'}
          </button>
          <button
            className="attr-table-btn"
            onClick={handleConsoleDump}
            disabled={!report}
            title="将完整 JSON 报告输出到浏览器控制台"
          >📋 控制台</button>
        </div>

        {report && (
          <>
            <div className={`three-check-summary ${report.summary.passed ? 'ok' : 'err'}`}>
              {report.summary.passed ? '✅ 通过' : '❌ 有错误'}
              {' · '}
              {report.summary.featureCount} 要素
              {report.summary.errorCount > 0 && ` · ${report.summary.errorCount} 错`}
              {report.summary.warnCount > 0 && ` · ${report.summary.warnCount} 警`}
            </div>
            <CategoryCard name="position" result={report.position} />
            <CategoryCard name="geometry" result={report.geometry} />
            <CategoryCard name="attributes" result={report.attributes} />
          </>
        )}
      </div>
    </div>
  );
}