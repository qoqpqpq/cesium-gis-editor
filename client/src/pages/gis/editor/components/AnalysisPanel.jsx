// AnalysisPanel — 空间分析面板
// 操作：buffer / intersect / union / difference / centroid / convexHull
//     + measure 类型（area / length，仅展示数值）
// 一旦点「应用」→ AnalysisCommand（复合命令，整体可 undo）

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDraggableResizable } from '../hooks/useDraggableResizable.js';
import { runOp, runOpServer, measureOp, localMeasure, isBooleanOp, SINGLE_LAYER_OPS, DOUBLE_LAYER_OPS } from '../utils/analysis.js';
import { autoChooseMode, resolveRunMode, LARGE_DATASET_VERTEX_THRESHOLD, LARGE_BOOLEAN_POLYGON_THRESHOLD } from '../utils/autoMode.js';
import { rebuildFromSnapshot, AnalysisCommand } from '../utils/commands.js';

const OPS = [
  { id: 'buffer',     label: '缓冲区 (Buffer)',     param: 'distance', paramLabel: '距离 (米)', needs: '至少 1 个要素' },
  { id: 'centroid',   label: '质心 (Centroid)',     param: null, needs: '至少 1 个要素' },
  { id: 'convexHull', label: '凸包 (Convex Hull)',  param: null, needs: '至少 3 个端点' },
  { id: 'intersect',  label: '交集 (Intersect)',    param: null, needs: '至少 2 个多边形' },
  { id: 'union',      label: '并集 (Union)',        param: null, needs: '至少 2 个多边形' },
  { id: 'difference', label: '差集 (Difference)',   param: null, needs: '至少 2 个多边形' },
  { id: 'dissolve',   label: '合并 (Dissolve)',     param: null, needs: '至少 2 个多边形' },
];

// 服务端已实现全部 7 个 op（与客户端完全镜像）
const SERVER_OPS = new Set([
  ...SINGLE_LAYER_OPS,   // buffer / centroid / convexHull
  ...DOUBLE_LAYER_OPS,   // intersect / difference / union / dissolve
]);

const MEASURE_OPS = [
  { id: 'area',   label: '计算面积' },
  { id: 'length', label: '计算长度' },
];

export default function AnalysisPanel({
  api,
  open,
  onClose,
  selectedIds,
  getSelectedEntities, // () => Entity[]
  pushCommand,
  refresh,
  onInfo,
  onApply, // (producedFids: string[]) => void 分析完成后自动选中新要素
}) {
  const panelRef = useRef(null);
  useDraggableResizable({
    ref: panelRef,
    storageKey: 'editor-analysis-panel',
    defaultSize: { w: 320, h: 280 },
    defaultPosition: { x: 120, y: 140 },
    dragHandleSelector: '.analysis-header',
  });

  const [op, setOp] = useState('buffer');
  const [distance, setDistance] = useState(1000);
  // 模式：'auto'（默认，按数据大小自动选）| 'local'（强制本地）| 'server'（强制服务端）
  const [runMode, setRunMode] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const opDef = OPS.find((o) => o.id === op);
  const canRunOnServer = SERVER_OPS.has(op);
  const selectedCount = selectedIds ? selectedIds.size : 0;

  useEffect(() => {
    if (!open) setResult(null);
  }, [open]);

  // op 改变时如果不支持 server，切回 auto（避免无效的强制选择）
  useEffect(() => {
    if (!canRunOnServer && runMode !== 'auto') setRunMode('auto');
  }, [op, canRunOnServer, runMode]);

  // 自动判断逻辑已抽到 utils/autoMode.js（纯函数，可单元测试）
  // 这里只做 wrap：传 canRunOnServer
  const autoChoose = (ents) => autoChooseMode(op, ents, { canRunOnServer });
  // 决定实际跑哪边：auto → 自动选；manual → 强制
  const resolveRunMode = (ents) => {
    if (runMode === 'auto') return autoChoose(ents);
    return runMode;
  };

  const handlePreview = async () => {
    const ents = getSelectedEntities ? getSelectedEntities() : [];
    if (!ents.length) {
      setResult({ kind: 'error', text: '请先选中至少 1 个要素' });
      return;
    }
    // 测量类操作
    if (op === 'area' || op === 'length') {
      let total = 0;
      let unit = '';
      ents.forEach((e) => {
        const props = e.properties;
        const kind = props.kind && props.kind.getValue ? props.kind.getValue() : props.kind;
        const positions = (() => {
          if (kind === 'point') {
            const c = e.position && (e.position.getValue ? e.position.getValue() : e.position);
            return c ? [c] : [];
          }
          if (e.polyline) {
            const p = e.polyline.positions.getValue ? e.polyline.positions.getValue() : e.polyline.positions;
            return p || [];
          }
          if (e.polygon) {
            const h = e.polygon.hierarchy.getValue ? e.polygon.hierarchy.getValue() : e.polygon.hierarchy;
            return (h && h.positions) || [];
          }
          return [];
        })();
        const m = localMeasure(kind, positions);
        if (m) {
          total += m.value;
          unit = m.unit;
        }
      });
      setResult({ kind: 'measure', text: `${op === 'area' ? '面积' : '长度'}：${formatNumber(total)} ${unit}` });
      return;
    }
    setBusy(true);
    try {
      const mode = resolveRunMode(ents);
      const useServer = mode === 'server';
      const out = useServer
        ? await runOpServer(op, ents)
        : runOp(op, ents, { distance });
      if (out.error) {
        setResult({ kind: 'error', text: out.error });
        return;
      }
      const tag = useServer ? '（服务端）' : '（本地）';
      const autoTag = runMode === 'auto' ? ' · 自动' : '';
      setResult({ kind: 'preview', text: `将生成 ${out.snaps.length} 个新要素${tag}${autoTag}`, count: out.snaps.length });
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    const ents = getSelectedEntities ? getSelectedEntities() : [];
    if (!ents.length) {
      setResult({ kind: 'error', text: '请先选中至少 1 个要素' });
      return;
    }
    if (op === 'area' || op === 'length') {
      // 已经预览过了 → 在 result 里显示，不创建实体
      handlePreview();
      return;
    }
    // 先试算一次，失败就直接报原因，不产生一条空的 undo 记录
    setBusy(true);
    let probe;
    const mode = resolveRunMode(ents);
    const useServer = mode === 'server';
    try {
      probe = useServer
        ? await runOpServer(op, ents)
        : runOp(op, ents, { distance });
    } finally {
      setBusy(false);
    }
    if (probe.error) {
      setResult({ kind: 'error', text: probe.error });
      return;
    }
    // 服务端模式：snaps 缓存，undo/redo 复用，避免再次打服务端
    const cmdFactory = (api2, _sourceFids, params) => {
      const { snaps } = useServer
        ? { snaps: probe.snaps }
        : runOp(op, ents, params);
      snaps.forEach((snap) => {
        rebuildFromSnapshot(api2, snap, snap.featureId);
      });
      refresh && refresh();
      // 返回 snapshots 给 AnalysisCommand 缓存
      return snaps;
    };
    const fids = ents.map((e) => {
      const p = e.properties;
      return p && p.featureId ? (p.featureId.getValue ? p.featureId.getValue() : p.featureId) : null;
    }).filter(Boolean);
    const cmd = AnalysisCommand(api, opDef.label, fids, cmdFactory, { distance }, refresh, isBooleanOp(op));
    if (cmd) {
      pushCommand(cmd);
      // 分析完成后自动选中新产生的要素
      const producedFids = cmd.producedFids;
      if (producedFids && producedFids.length > 0 && onApply) {
        onApply(producedFids);
      }
    }
    const tag = useServer ? '（服务端）' : '（本地）';
    const autoTag = runMode === 'auto' ? ' · 自动' : '';
    onInfo && onInfo(`已应用${tag}：${opDef.label}（${fids.length} 源要素）`);
    setResult({ kind: 'success', text: `已应用${tag}${autoTag} ${opDef.label}，生成 ${probe.snaps.length} 个要素（默认图层）` });
  };

  if (!open) return null;

  return (
    <div className="analysis-panel" ref={panelRef}>
      <div className="analysis-header">
        <span>🔬 空间分析</span>
        <button className="attr-table-btn close" onClick={onClose} aria-label="关闭分析面板">✕</button>
      </div>
      <div className="analysis-body">
        <div className="analysis-row">
          <label>操作</label>
          <OpDropdown
            value={op}
            onChange={setOp}
            groups={[
              { label: '几何生成', options: OPS },
              { label: '测量统计', options: MEASURE_OPS },
            ]}
          />
          <div className="analysis-hint">{opDef ? opDef.needs : ''}（当前选中 {selectedCount} 个）</div>
        </div>

        {op === 'buffer' && (
          <div className="analysis-row">
            <label>距离 (米)</label>
            <input
              type="number"
              min={0}
              step={100}
              value={distance}
              onChange={(e) => setDistance(Number(e.target.value))}
            />
          </div>
        )}

        {canRunOnServer && (
          <div className="analysis-run-mode">
            <label htmlFor="analysis-run-mode-select" className="analysis-run-mode-label">运行位置</label>
            <select
              id="analysis-run-mode-select"
              className="analysis-run-mode-select"
              aria-label="空间分析运行位置（自动 / 本地 / 服务端）"
              title="运行位置：自动 / 强制本地 / 强制服务端"
              value={runMode}
              onChange={(e) => setRunMode(e.target.value)}
            >
              <option value="auto">⚡ 自动（小数据本地，大数据服务端）</option>
              <option value="local">📍 强制本地（Turf.js 浏览器端）</option>
              <option value="server">☁️ 强制服务端（Turf.js 后端）</option>
            </select>
          </div>
        )}

        <div className="analysis-actions">
          <button className="attr-table-btn" onClick={handlePreview} disabled={busy}>
            {busy ? '…' : '预览'}
          </button>
          <button className="attr-table-btn" onClick={handleApply} disabled={busy}>
            {busy ? '…' : '应用到地图'}
          </button>
        </div>

        {result && (
          <div className={'analysis-result' + (result.kind === 'error' ? ' error' : '')}>
            {result.kind === 'error' ? '⚠ ' : ''}{result.text}
          </div>
        )}
      </div>
    </div>
  );
}

function formatNumber(n) {
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) > 1e6) return (n / 1e6).toFixed(2) + ' M';
  if (Math.abs(n) > 1e3) return (n / 1e3).toFixed(2) + ' k';
  return n.toFixed(2);
}

// 自定义下拉（绕开原生 <select> 的 OS 级弹窗，深色面板上样式不可控）
// 弹窗通过 React Portal 渲染到 document.body，绕过任何父级 overflow/backdrop-filter 干扰
function OpDropdown({ value, onChange, groups }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (triggerRef.current && triggerRef.current.contains(e.target)) return;
      if (popupRef.current && popupRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, [open]);

  const current = groups.flatMap((g) => g.options).find((o) => o.id === value);

  return (
    <div className="op-dropdown">
      <button
        ref={triggerRef}
        type="button"
        className="op-dropdown-trigger"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{current ? current.label : '—'}</span>
        <span className="op-caret">▾</span>
      </button>
      {open && createPortal(
        <div
          ref={popupRef}
          className="op-dropdown-popup"
          role="listbox"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          {groups.map((g) => (
            <div key={g.label} className="op-dropdown-group">
              <div className="op-dropdown-group-label">{g.label}</div>
              {g.options.map((o) => (
                <div
                  key={o.id}
                  role="option"
                  aria-selected={o.id === value}
                  className={'op-dropdown-option' + (o.id === value ? ' active' : '')}
                  onClick={() => { onChange(o.id); setOpen(false); }}
                >
                  {o.label}
                </div>
              ))}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
