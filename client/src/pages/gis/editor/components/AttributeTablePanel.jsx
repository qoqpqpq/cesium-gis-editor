// AttributeTablePanel — 浮动属性表（阶段 2 升级版）
// 行 = 1 要素；列 = name / kind / layer + 所有实体的 attrs key 集合
// 行点击 → setSelection；双击单元格 → AttrCommand 入栈
// 顶栏：过滤框 / [+字段] / [✕字段] / [💾保存] / [📤CSV] / [↺ 还原] 按钮
//
// 阶段 2 新增：
//   - 排序：列头点击切换 asc / desc / null
//   - 过滤：顶栏输入框，name + kind + layer + 全 attrs 值大小写不敏感子串匹配
//   - 列显隐：右键列头弹菜单，勾选可见列；持久化到 localStorage
//   - CSV 导出：尊重排序 / 过滤 / 列显隐
//   - 虚拟滚动：超过 200 行启用窗口化，避免 10w+ 行卡顿

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useDraggableResizable } from '../hooks/useDraggableResizable.js';
import {
  RESERVED, collectFields, coerce, readAttrs,
  saveCheckpoint, loadCheckpoint, clearCheckpoint, applyCheckpoint,
} from '../utils/attrs.js';
import { AttrCommand, AttrFieldCommand, RenameCommand } from '../utils/commands.js';
import {
  sortFeatures, filterFeatures, featuresToCsv, downloadCsv,
  loadVisibleColumns, saveVisibleColumns, resolveVisibleColumns,
} from '../utils/attrTableUtils.js';
import { runQuery, featureBBox } from '../utils/queryCompiler.js';
import QueryBuilder from './QueryBuilder.jsx';

const KIND_LABELS = {
  point: '点',
  polyline: '线',
  polygon: '面',
  rect: '矩形',
  circle: '圆',
  freehand: '手绘',
};

// 虚拟滚动阈值与行高（像素）；低于此值不启用窗口化
const VIRT_THRESHOLD = 200;
const ROW_HEIGHT = 26;

export default function AttributeTablePanel({
  api,
  open,
  onClose,
  selectedIds,
  features, // [{ featureId, kind, layerId, name, attrs, ... }]
  onSelect, // (Set<featureId>) => void
  onFlyTo,
  pushCommand,
  refresh,
}) {
  const panelRef = useRef(null);
  useDraggableResizable({
    ref: panelRef,
    storageKey: 'editor-attr-table',
    defaultSize: { w: 760, h: 320 },
    defaultPosition: { x: 100, y: 120 },
    dragHandleSelector: '.attr-table-header',
  });

  // ============ 字段集合 ============
  const fields = useMemo(() => {
    const fakes = features.map((f) => ({
      properties: { attrs: f.attrs || {} },
    }));
    return collectFields(fakes).filter((f) => !RESERVED.includes(f.name));
  }, [features]);

  // ============ 状态：排序 / 过滤 / 列显隐 / 字段增删 / checkpoint ============
  const [sortKey, setSortKey] = useState(null); // 'name' | 'kind' | 'layerId' | field.name
  const [sortDir, setSortDir] = useState(null); // 'asc' | 'desc' | null
  const [filterQuery, setFilterQuery] = useState('');
  // 阶段 2B：高级查询（持久化到 localStorage）
  const QB_KEY = 'editor.attr-table.query.v1';
  const [advancedQuery, setAdvancedQuery] = useState(() => {
    try {
      const raw = localStorage.getItem(QB_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !Array.isArray(obj.rules) || !obj.rules.length) return null;
      return obj;
    } catch (_) { return null;
    }
  });
  useEffect(() => {
    try {
      if (advancedQuery && advancedQuery.rules && advancedQuery.rules.length) {
        localStorage.setItem(QB_KEY, JSON.stringify(advancedQuery));
      } else {
        localStorage.removeItem(QB_KEY);
      }
    } catch (_) { /* ignore */
    }
  }, [advancedQuery]);
  const [qbOpen, setQbOpen] = useState(false);
  const hasAdvanced = !!advancedQuery && advancedQuery.rules && advancedQuery.rules.length > 0;

  // 阶段 3: nl-query-apply / nl-suggestion-apply 事件接收
  //   - payload = { combinator, rules, bboxGroups? }
  //   - 把 rules 喂给 advancedQuery
  //   - bboxGroups 用 featureBBox 做全集预筛（叠到 filterFeatures 之后）
  const [nlBboxGroups, setNlBboxGroups] = useState([]);
  useEffect(() => {
    const handler = (e) => {
      const p = e.detail || {};
      if (!p || !p.rules) return;
      setAdvancedQuery({ combinator: p.combinator || 'AND', rules: p.rules });
      setNlBboxGroups(Array.isArray(p.bboxGroups) ? p.bboxGroups : []);
      setQbOpen(true);
      // 给用户一个视觉反馈：qb 自动展开
    };
    window.addEventListener('nl-query-apply', handler);
    window.addEventListener('nl-suggestion-apply', handler);
    return () => {
      window.removeEventListener('nl-query-apply', handler);
      window.removeEventListener('nl-suggestion-apply', handler);
    };
  }, []);

  // 全部候选列（含保留列 + 字段）；右键菜单展示给用户勾选
  const allColumns = useMemo(() => {
    return [
      { name: 'name', type: 'string', label: '名称', builtin: true },
      { name: 'kind', type: 'string', label: '类型', builtin: true },
      { name: 'layerId', type: 'string', label: '图层', builtin: true },
      ...fields.map((f) => ({ name: f.name, type: f.type, label: f.name, builtin: false })),
    ];
  }, [fields]);

  // 持久化的可见列
  const [storedVisible, setStoredVisible] = useState(() => loadVisibleColumns(allColumns.map((c) => c.name)));
  // 兼容 fields 变化（之前没存的列应自动可见）
  const visibleColumns = useMemo(
    () => resolveVisibleColumns(allColumns, storedVisible),
    [allColumns, storedVisible]
  );
  // 持久化 on change
  useEffect(() => {
    if (!storedVisible) return;
    saveVisibleColumns(storedVisible);
  }, [storedVisible]);

  // ============ checkpoint 状态 ============
  const [savedAt, setSavedAt] = useState(() => {
    const cp = loadCheckpoint();
    return cp ? cp.savedAt : null;
  });
  const [savedCount, setSavedCount] = useState(() => {
    const cp = loadCheckpoint();
    return cp && Array.isArray(cp.items) ? cp.items.length : 0;
  });
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [dropFieldOpen, setDropFieldOpen] = useState(false);

  // ============ 右键列头菜单 ============
  const [colMenu, setColMenu] = useState(null); // { x, y, colName } | null
  // 关闭右键菜单（点击任意处 / Esc）
  useEffect(() => {
    if (!colMenu) return undefined;
    const onDown = (e) => {
      if (e.target.closest && e.target.closest('.attr-col-menu')) return;
      setColMenu(null);
    };
    const onKey = (e) => { if (e.key === 'Escape') setColMenu(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [colMenu]);

  // 注意：不能在 hooks 之前 early-return，否则会触发 React Rules of Hooks
  // 实际渲染判断在组件末尾 return null 之前

  const handleRowClick = (fid) => {
    if (!onSelect) return;
    onSelect(fid);
  };

  const handleCellEdit = (fid, key, type, rawVal, oldVal) => {
    const newVal = coerce(rawVal, type);
    if (newVal === oldVal) return;
    const cmd = AttrCommand(api, fid, key, oldVal, newVal, refresh);
    if (cmd) pushCommand(cmd);
  };

  // ============ 排序：列头点击 ============
  // 三态循环：null → asc → desc → null
  const handleSort = (colName) => {
    if (sortKey !== colName) {
      setSortKey(colName);
      setSortDir('asc');
      return;
    }
    if (sortDir === 'asc') setSortDir('desc');
    else if (sortDir === 'desc') { setSortKey(null); setSortDir(null); }
    else setSortDir('asc');
  };

  // ============ 列显隐：右键菜单触发 ============
  const handleHeaderContextMenu = (e, colName) => {
    e.preventDefault();
    setColMenu({ x: e.clientX, y: e.clientY, colName });
  };

  const toggleColumnVisible = (colName) => {
    setStoredVisible((prev) => {
      const cur = prev ? new Set(prev) : null;
      if (!cur) {
        // 默认全部可见 → 取消勾选此列
        const next = new Set(allColumns.map((c) => c.name));
        next.delete(colName);
        return next;
      }
      if (cur.has(colName)) cur.delete(colName);
      else cur.add(colName);
      // 至少保留 1 列可见
      if (cur.size === 0) return prev;
      return cur;
    });
  };

  const resetColumnVisibility = () => {
    setStoredVisible(null); // null = 全部可见
    setColMenu(null);
  };

  // ============ 字段增删条 ============
  const handleAddField = ({ name, type }) => {
    if (!name) return;
    if (RESERVED.includes(name)) { alert(`「${name}」是保留字段名，请换一个`); return; }
    if (fields.some((f) => f.name === name)) { alert(`「${name}」已存在`); return; }
    if (!['string', 'number', 'boolean'].includes(type)) return;
    const defaults = { string: '', number: 0, boolean: false };
    const fids = Array.from(selectedIds && selectedIds.size > 0 ? selectedIds : new Set(features.map((x) => x.featureId)));
    const cmd = AttrFieldCommand(api, fids, name, 'add', defaults[type], refresh);
    if (cmd) {
      pushCommand(cmd);
      refresh && refresh();
    }
    setAddFieldOpen(false);
  };

  const handleDropField = (which) => {
    if (!which) { setDropFieldOpen(false); return; }
    if (selectedIds && selectedIds.size > 0) {
      const fids = Array.from(selectedIds);
      const cmd = AttrFieldCommand(api, fids, which, 'drop', undefined, refresh);
      if (cmd) { pushCommand(cmd); refresh && refresh(); }
    } else {
      const fids = features.map((x) => x.featureId);
      const cmd = AttrFieldCommand(api, fids, which, 'drop', undefined, refresh);
      if (cmd) { pushCommand(cmd); refresh && refresh(); }
    }
    setDropFieldOpen(false);
  };

  // 可删字段列表
  const droppableFields = (() => {
    if (selectedIds && selectedIds.size > 0) {
      const ds = api && api.getEditorDataSource && api.getEditorDataSource();
      if (!ds) return fields.map((f) => f.name);
      const present = new Set();
      Array.from(selectedIds).forEach((fid) => {
        const ent = ds.entities.getById(fid);
        Object.keys(readAttrs(ent)).forEach((k) => present.add(k));
      });
      return Array.from(present).filter((k) => !RESERVED.includes(k));
    }
    return fields.map((f) => f.name);
  })();

  // ============ checkpoint 操作 ============
  const handleSave = () => {
    const r = saveCheckpoint(features);
    if (r) {
      setSavedAt(r.savedAt);
      setSavedCount(r.count);
    }
  };
  const handleRestore = () => {
    const cp = loadCheckpoint();
    if (!cp) return;
    const r = applyCheckpoint(api, cp, refresh);
    if (window.confirm(
      `还原到 ${new Date(cp.savedAt).toLocaleString('zh-CN')} 的快照？\n`
      + `已应用 ${r.applied} 行（缺失 ${r.missing} 个 featureId）。\n`
      + `此操作不会进撤销栈。`
    )) {
      // 已应用；不动 savedAt（用户可能还要再保存一次）
    }
  };
  const handleClearCheckpoint = () => {
    if (!window.confirm('清除本地保存的快照？')) return;
    clearCheckpoint();
    setSavedAt(null);
    setSavedCount(0);
  };

  const savedLabel = savedAt
    ? `✓ 已保存 ${new Date(savedAt).toLocaleTimeString('zh-CN')}（${savedCount} 条）`
    : '未保存';

  // ============ 数据视图：过滤 → bbox 预筛 → 排序 ============
  const visibleFeatures = useMemo(() => {
    // 1) 顶栏模糊搜索（始终生效）
    let filtered = filterFeatures(features, filterQuery);
    // 2) 高级查询（可视化规则）
    if (hasAdvanced) {
      filtered = runQuery(filtered, advancedQuery);
    }
    // 2.5) 阶段 3: nl 注入的 bbox 预筛（任何 bbox 与要素相交就保留）
    if (nlBboxGroups && nlBboxGroups.length > 0) {
      filtered = filtered.filter((f) => {
        const fb = featureBBox(f);
        if (!fb) return false;
        return nlBboxGroups.some((bb) =>
          !(fb.east < bb.west || fb.west > bb.east ||
            fb.north < bb.south || fb.south > bb.north));
      });
    }
    // 3) 排序
    const sorted = sortFeatures(filtered, sortKey, sortDir);
    return sorted;
  }, [features, filterQuery, advancedQuery, hasAdvanced, nlBboxGroups, sortKey, sortDir]);

  // ============ CSV 导出 ============
  const handleExportCsv = useCallback(() => {
    const csv = featuresToCsv(visibleFeatures, visibleColumns);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadCsv(`features-${stamp}.csv`, csv);
  }, [visibleFeatures, visibleColumns]);

  // ============ 虚拟滚动 ============
  const scrollRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(320);
  const useVirtual = visibleFeatures.length > VIRT_THRESHOLD;
  useEffect(() => {
    if (!useVirtual || !scrollRef.current) return undefined;
    const el = scrollRef.current;
    const onScroll = () => setScrollTop(el.scrollTop);
    const onResize = () => setViewportH(el.clientHeight || 320);
    onResize();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [useVirtual]);
  const virtState = useMemo(() => {
    if (!useVirtual) return null;
    const total = visibleFeatures.length;
    const totalH = total * ROW_HEIGHT;
    const overscan = 6;
    const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - overscan);
    const endIdx = Math.min(total, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + overscan);
    const visible = visibleFeatures.slice(startIdx, endIdx);
    return { totalH, startIdx, visible };
  }, [useVirtual, visibleFeatures, scrollTop, viewportH]);

  // ============ 渲染 ============
  // 排序指示符
  const sortIndicator = (colName) => {
    if (sortKey !== colName) return '↕';
    return sortDir === 'asc' ? '▲' : sortDir === 'desc' ? '▼' : '↕';
  };

  // 列头宽度（与原表格一致）
  const COL_WIDTHS = {
    radio: 28,
    name: 100,
    kind: 60,
    layer: 80,
    field: 80,
  };

  const renderHeader = () => (
    <tr>
      <th style={{ width: COL_WIDTHS.radio }}></th>
      {visibleColumns.map((c) => {
        if (c.name === 'name') {
          return (
            <th key={c.name} style={{ width: COL_WIDTHS.name }}
                onClick={() => handleSort('name')}
                onContextMenu={(e) => handleHeaderContextMenu(e, c.name)}
                title="点击排序 · 右键显隐">
              名称 {sortIndicator('name')}
            </th>
          );
        }
        if (c.name === 'kind') {
          return (
            <th key={c.name} style={{ width: COL_WIDTHS.kind }}
                onClick={() => handleSort('kind')}
                onContextMenu={(e) => handleHeaderContextMenu(e, c.name)}
                title="点击排序 · 右键显隐">
              类型 {sortIndicator('kind')}
            </th>
          );
        }
        if (c.name === 'layerId') {
          return (
            <th key={c.name} style={{ width: COL_WIDTHS.layer }}
                onClick={() => handleSort('layerId')}
                onContextMenu={(e) => handleHeaderContextMenu(e, c.name)}
                title="点击排序 · 右键显隐">
              图层 {sortIndicator('layerId')}
            </th>
          );
        }
        return (
          <th key={c.name} style={{ minWidth: COL_WIDTHS.field }}
              onClick={() => handleSort(c.name)}
              onContextMenu={(e) => handleHeaderContextMenu(e, c.name)}
              title={`${c.label} · 类型 ${c.type} · 点击排序 · 右键显隐`}>
            {c.label} {sortIndicator(c.name)}
          </th>
        );
      })}
    </tr>
  );

  const renderRow = (f, idx) => {
    const isSel = selectedIds && selectedIds.has(f.featureId);
    const kindLabel = KIND_LABELS[f.kind] || f.kind;
    const layerShort = (f.layerId || '默认').replace(/^layer_.*/, '图层');
    return (
      <tr
        key={f.featureId}
        className={'attr-row' + (isSel ? ' selected' : '')}
        style={useVirtual ? { height: ROW_HEIGHT } : undefined}
        onClick={() => handleRowClick(f.featureId)}
        onDoubleClick={() => onFlyTo && onFlyTo(f.featureId)}
        title="单击选中 · 双击飞向"
      >
        <td><input type="radio" readOnly checked={!!isSel} /></td>
        {visibleColumns.map((c) => {
          if (c.name === 'name') {
            return (
              <td key={c.name}>
                <input
                  type="text"
                  defaultValue={f.name || ''}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const nv = e.target.value.trim();
                    if (nv === (f.name || '')) return;
                    const ds = api.getEditorDataSource();
                    const ent = ds.entities.getById(f.featureId);
                    if (!ent) return;
                    const cmd = RenameCommand(api, ent, nv, refresh);
                    if (cmd) pushCommand(cmd);
                  }}
                />
              </td>
            );
          }
          if (c.name === 'kind') {
            return <td key={c.name}><span className="attr-table-kind">{kindLabel}</span></td>;
          }
          if (c.name === 'layerId') {
            return <td key={c.name}><span className="attr-table-layer">{layerShort}</span></td>;
          }
          const v = f.attrs ? f.attrs[c.name] : '';
          return (
            <td key={c.name}>
              <EditableCell
                value={v}
                type={c.type}
                onCommit={(nv) => handleCellEdit(f.featureId, c.name, c.type, nv, v)}
              />
            </td>
          );
        })}
      </tr>
    );
  };

  return (
    <>
      {!open && null}
      {open && (
    <div className="attr-table-panel" ref={panelRef}>
      <div className="attr-table-header">
        <span>
          📊 属性表 · {visibleFeatures.length}
          {visibleFeatures.length !== features.length && ` / ${features.length}`} 条 ·
          <span className="attr-saved-badge" data-state={savedAt ? 'saved' : 'none'}>{savedLabel}</span>
        </span>
        <div className="attr-table-actions">
          <input
            type="text"
            className="attr-table-filter"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="🔍 过滤 name / 类型 / 图层 / 任意字段值"
            title="子串匹配（大小写不敏感）；清空恢复全部"
          />
          <button
            className={'attr-table-btn' + (hasAdvanced || qbOpen ? ' active' : '')}
            onClick={() => setQbOpen((v) => !v)}
            title="可视化空间查询（equals / 包含 / 数字区间 / bbox）"
          >
            🔎 高级{hasAdvanced ? ' · ✓' : ''}
          </button>
          <button className="attr-table-btn" onClick={handleExportCsv} title="导出当前可见列为 CSV（尊重排序/过滤/列显隐）">📤 CSV</button>
          <button className="attr-table-btn" onClick={() => setAddFieldOpen((v) => !v)} title="添加字段">+ 字段</button>
          <button className="attr-table-btn" onClick={() => setDropFieldOpen((v) => !v)} title="删除字段" disabled={!droppableFields.length}>✕ 字段</button>
          <button className="attr-table-btn primary" onClick={handleSave} title="把当前属性表保存到本地（关页面再开能恢复）">💾 保存</button>
          {savedAt && (
            <>
              <button className="attr-table-btn" onClick={handleRestore} title={`还原到 ${new Date(savedAt).toLocaleString('zh-CN')}`}>↺ 还原</button>
              <button className="attr-table-btn danger" onClick={handleClearCheckpoint} aria-label="清除本地快照" title="清除本地快照">🗑</button>
            </>
          )}
          <button className="attr-table-btn close" onClick={onClose} aria-label="关闭属性表面板">✕</button>
        </div>
      </div>

      {addFieldOpen && (
        <AddFieldBar
          fields={fields}
          onSubmit={handleAddField}
          onCancel={() => setAddFieldOpen(false)}
        />
      )}
      {dropFieldOpen && (
        <DropFieldBar
          candidates={droppableFields}
          onSubmit={handleDropField}
          onCancel={() => setDropFieldOpen(false)}
        />
      )}

      {qbOpen && (
        <div className="query-builder-wrap">
          <QueryBuilder
            fields={allColumns}
            value={advancedQuery}
            onChange={(q) => setAdvancedQuery(q)}
          />
        </div>
      )}

      <div className="attr-table-scroll" ref={scrollRef}>
        {useVirtual ? (
          <div className="attr-table-virt-wrap" style={{ height: virtState.totalH, position: 'relative' }}>
            <table className="attr-table" style={{ position: 'absolute', top: virtState.startIdx * ROW_HEIGHT, left: 0, right: 0 }}>
              <thead>{renderHeader()}</thead>
              <tbody>{virtState.visible.map((f, i) => renderRow(f, virtState.startIdx + i))}</tbody>
            </table>
          </div>
        ) : (
          <table className="attr-table">
            <thead>{renderHeader()}</thead>
            <tbody>
              {visibleFeatures.length === 0 && (
                <tr><td colSpan={1 + visibleColumns.length} className="attr-table-empty">
                  {features.length === 0 ? '暂无要素 — 先绘制或导入' : `没有匹配「${filterQuery}」的要素`}
                </td></tr>
              )}
              {visibleFeatures.map((f) => renderRow(f, 0))}
            </tbody>
          </table>
        )}
      </div>

      {colMenu && (
        <ColumnVisibilityMenu
          menu={colMenu}
          allColumns={allColumns}
          storedVisible={storedVisible}
          onToggle={toggleColumnVisible}
          onReset={resetColumnVisibility}
        />
      )}
    </div>
      )}
    </>
  );
}

function EditableCell({ value, type, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  if (editing) {
    if (type === 'boolean') {
      return (
        <select
          autoFocus
          value={String(value)}
          onChange={(e) => { onCommit(e.target.value === 'true'); setEditing(false); }}
          onBlur={() => setEditing(false)}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }
    return (
      <input
        type={type === 'number' ? 'number' : 'text'}
        autoFocus
        value={draft ?? ''}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onCommit(draft); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { onCommit(draft); setEditing(false); }
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  // display
  let disp = value;
  if (typeof value === 'boolean') disp = value ? '✓' : '✗';
  else if (value === null || value === undefined || value === '') disp = '—';
  return (
    <span
      className="attr-table-cell"
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
      title="双击编辑"
    >{disp}</span>
  );
}

// ============ 字段增删条（替代 window.prompt） ============

function AddFieldBar({ fields, onSubmit, onCancel }) {
  const [name, setName] = useState('field_' + (fields.length + 1));
  const [type, setType] = useState('string');
  return (
    <div className="attr-add-field-bar">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, ''))}
        placeholder="字段名"
        autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') onSubmit({ name, type }); if (e.key === 'Escape') onCancel(); }}
      />
      <select value={type} onChange={(e) => setType(e.target.value)}>
        <option value="string">string</option>
        <option value="number">number</option>
        <option value="boolean">boolean</option>
      </select>
      <button className="attr-table-btn primary" onClick={() => onSubmit({ name, type })}>添加</button>
      <button className="attr-table-btn" onClick={onCancel}>取消</button>
    </div>
  );
}

function DropFieldBar({ candidates, onSubmit, onCancel }) {
  const [which, setWhich] = useState(candidates[0] || '');
  return (
    <div className="attr-add-field-bar">
      <span className="attr-drop-label">删除字段：</span>
      <select value={which} onChange={(e) => setWhich(e.target.value)} autoFocus>
        {candidates.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <button className="attr-table-btn danger" onClick={() => onSubmit(which)}>删除</button>
      <button className="attr-table-btn" onClick={onCancel}>取消</button>
    </div>
  );
}

// ============ 列显隐菜单 ============

function ColumnVisibilityMenu({ menu, allColumns, storedVisible, onToggle, onReset }) {
  const isChecked = (name) => {
    if (!storedVisible) return true; // null = 全部可见
    return storedVisible.has(name);
  };
  return (
    <div
      className="attr-col-menu"
      style={{ position: 'fixed', top: menu.y, left: menu.x, zIndex: 1000 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="attr-col-menu-head">显示列（点击切换）</div>
      {allColumns.map((c) => (
        <label key={c.name} className="attr-col-menu-item">
          <input
            type="checkbox"
            checked={isChecked(c.name)}
            onChange={() => onToggle(c.name)}
          />
          <span>{c.label}</span>
          <span className="attr-col-menu-type">{c.type}</span>
        </label>
      ))}
      <div className="attr-col-menu-foot">
        <button className="attr-table-btn" onClick={onReset}>全部显示</button>
      </div>
    </div>
  );
}