// attrTableUtils — 属性表纯函数工具（排序 / 过滤 / CSV / 列显隐持久化）
// 这些都是无 React 依赖的纯函数，便于单测和复用。
// 不在这里写虚拟滚动 / DOM 交互，只处理数据变换。

// ============ 排序 ============

// 比较器工厂：
//   - 数字按 number 比，字符串按 localeCompare，boolean 转 0/1
//   - null/undefined 始终排到最后（无论升降序）
//   - 不同类型（number vs string）按类型序：number < string < boolean
export function compareValues(a, b) {
  const aNil = a === null || a === undefined || a === '';
  const bNil = b === null || b === undefined || b === '';
  if (aNil && bNil) return 0;
  if (aNil) return 1;
  if (bNil) return -1;
  const ta = typeof a;
  const tb = typeof b;
  if (ta === tb) {
    if (ta === 'number') return a - b;
    if (ta === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
    return String(a).localeCompare(String(b));
  }
  // 类型不同：按 number < string < boolean 排序
  const order = { number: 0, string: 1, boolean: 2 };
  return order[ta] - order[tb];
}

// 给定 sortKey 与排序方向（'asc' | 'desc' | null），对 features 数组产生新排序副本
// sortKey 为列 field name（业务字段）或保留列 'name' / 'kind' / 'layerId'
export function sortFeatures(features, sortKey, direction) {
  if (!sortKey || !direction) return features;
  const getValue = (f) => {
    if (sortKey === 'name') return f.name || '';
    if (sortKey === 'kind') return f.kind || '';
    if (sortKey === 'layerId') return f.layerId || '';
    return f.attrs ? f.attrs[sortKey] : '';
  };
  const arr = features.slice();
  arr.sort((fa, fb) => {
    const r = compareValues(getValue(fa), getValue(fb));
    return direction === 'desc' ? -r : r;
  });
  return arr;
}

// ============ 过滤 ============

// 大小写不敏感、空白折叠的子串匹配；输入非空才过滤
export function matchesFilter(feature, rawQuery) {
  const q = (rawQuery || '').trim().toLowerCase();
  if (!q) return true;
  // 先看 name / kind / layerId
  const head = [feature.name, feature.kind, feature.layerId]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (head.includes(q)) return true;
  // 再扫 attrs 各字段值
  const attrs = feature.attrs || {};
  for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (v === null || v === undefined) continue;
    if (String(v).toLowerCase().includes(q)) return true;
  }
  return false;
}

export function filterFeatures(features, query) {
  if (!query || !query.trim()) return features;
  return features.filter((f) => matchesFilter(f, query));
}

// ============ CSV 导出 ============

// RFC 4180 风格：双引号包裹、字段内 " 替换成 ""
// 始终输出 number / boolean 原值；日期/对象转 JSON 字符串
function csvEscape(val) {
  if (val === null || val === undefined) return '';
  let s;
  if (typeof val === 'object') s = JSON.stringify(val);
  else s = String(val);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// 把已过滤+已排序的 features 导出为 CSV 文本
// visibleColumns：[{ name, type, label }] 决定列；label 默认等于 name
export function featuresToCsv(features, visibleColumns) {
  const cols = (visibleColumns || []).slice();
  const head = cols.map((c) => csvEscape(c.label || c.name)).join(',');
  const rows = features.map((f) => {
    return cols
      .map((c) => {
        let v;
        if (c.name === 'name') v = f.name || '';
        else if (c.name === 'kind') v = f.kind || '';
        else if (c.name === 'layerId') v = f.layerId || '';
        else v = f.attrs ? f.attrs[c.name] : '';
        return csvEscape(v);
      })
      .join(',');
  });
  // Excel 友好：开头加 BOM（避免中文乱码）
  return '\ufeff' + [head, ...rows].join('\r\n');
}

// 触发浏览器下载 CSV
export function downloadCsv(filename, csv) {
  if (typeof document === 'undefined' || !document.body) return;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'features.csv';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ============ 列显隐持久化 ============

const COL_VIS_KEY = 'editor.attr-table.col-vis.v1';

// 持久化可见列集合：返回 Set<columnName>
export function loadVisibleColumns(allColumnNames) {
  try {
    const raw = localStorage.getItem(COL_VIS_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    // 过滤掉已不存在的列；缺失列视为可见
    const stored = new Set(arr.filter((n) => allColumnNames.includes(n)));
    return stored;
  } catch (_) {
    return null;
  }
}

export function saveVisibleColumns(visibleSet) {
  try {
    localStorage.setItem(COL_VIS_KEY, JSON.stringify(Array.from(visibleSet)));
  } catch (_) {}
}

// 根据持久化集合（或全可见默认）得到最终可见列
export function resolveVisibleColumns(allColumns, stored) {
  if (!stored || !stored.size) return allColumns.slice();
  return allColumns.filter((c) => stored.has(c.name));
}