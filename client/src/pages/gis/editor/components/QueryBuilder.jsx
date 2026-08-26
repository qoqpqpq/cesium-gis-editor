// QueryBuilder — 阶段 2B · 可视化空间查询生成器
//
// 用法：
//   <QueryBuilder
//     fields={[{ name: 'name', type: 'string', builtin: true }, ...]}
//     value={queryObject}
//     onChange={(q) => setQuery(q)}
//   />
//
// 设计意图：
//   - 顶部一个 combinator 切换（AND / OR）
//   - 每个 rule 一行：[字段下拉] [op 下拉] [value 输入] [✕]
//   - 底部 [+ 添加规则] 按钮 + "导出 SQL 描述" 按钮
//   - 字段下拉包含保留列 name/kind/layerId + 自定义 attrs 字段

import { useMemo, useState, useEffect, useRef } from 'react';
import { compileQuery } from '../utils/queryCompiler.js';

// 不同 op 的 value 输入类型
const OP_META = {
  eq:          { label: '等于',         input: 'text', placeholder: '值', takesValue: true },
  neq:         { label: '不等于',         input: 'text', placeholder: '值', takesValue: true },
  contains:    { label: '包含',         input: 'text', placeholder: '子串', takesValue: true },
  startsWith:  { label: '起始于',         input: 'text', placeholder: '前缀', takesValue: true },
  gt:          { label: '>',            input: 'number', placeholder: '数字', takesValue: true },
  gte:         { label: '>=',           input: 'number', placeholder: '数字', takesValue: true },
  lt:          { label: '<',            input: 'number', placeholder: '数字', takesValue: true },
  lte:         { label: '<=',           input: 'number', placeholder: '数字', takesValue: true },
  in:          { label: '在列表中',       input: 'csv',   placeholder: '逗号分隔', takesValue: true },
  empty:       { label: '为空',         input: 'none',  placeholder: '', takesValue: false },
  bbox:        { label: '在 bbox 内',    input: 'bbox',  placeholder: '', takesValue: true },
};

// 数字字段默认 op 是 gt/lt；其他字段默认 eq
function defaultOpForType(type) {
  return type === 'number' ? 'gt' : 'contains';
}

// 默认 value
function defaultValueFor(op, type) {
  if (op === 'in') return [];
  if (op === 'bbox') return { west: 0, south: 0, east: 0, north: 0 };
  if (op === 'empty') return null;
  return type === 'number' ? 0 : '';
}

export default function QueryBuilder({ fields, value, onChange }) {
  const safeFields = Array.isArray(fields) ? fields : [];
  const fieldMap = useMemo(() => {
    const m = new Map();
    safeFields.forEach((f) => m.set(f.name, f));
    return m;
  }, [safeFields]);

  // 内部状态：始终是已编译对象（rules 都干净）；props.value 是受控输入
  const [query, setQuery] = useState(() => value || { combinator: 'AND', rules: [] });
  const [editing, setEditing] = useState(false);

  // 受控同步
  useEffect(() => {
    if (editing) return; // 用户编辑中不同步
    setQuery(value || { combinator: 'AND', rules: [] });
  }, [value, editing]);

  const commit = (next) => {
    setQuery(next);
    setEditing(false);
    if (onChange) onChange(next);
  };

  const setCombinator = (c) => {
    commit({ ...query, combinator: c === 'OR' ? 'OR' : 'AND' });
  };

  const addRule = () => {
    // 默认加一条：第一个字段 + 默认 op
    const firstField = safeFields[0] || { name: 'name', type: 'string' };
    const op = defaultOpForType(firstField.type);
    const newRule = {
      field: firstField.name,
      op,
      value: defaultValueFor(op, firstField.type),
    };
    commit({ ...query, rules: [...query.rules, newRule] });
    setEditing(true);
  };

  const updateRule = (idx, patch) => {
    const next = query.rules.slice();
    next[idx] = { ...next[idx], ...patch };
    commit({ ...query, rules: next });
    setEditing(true);
  };

  const removeRule = (idx) => {
    const next = query.rules.slice();
    next.splice(idx, 1);
    commit({ ...query, rules: next });
    setEditing(true);
  };

  const clearAll = () => commit({ combinator: 'AND', rules: [] });

  // 复制成 SQL 风格的描述（仅展示用，不做 SQL 注入安全保证）
  const [copied, setCopied] = useState(false);
  const handleCopySql = async () => {
    const sql = describeSql(query);
    if (!sql) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(sql);
      } else {
        const ta = document.createElement('textarea');
        ta.value = sql; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) { /* ignore */
    }
  };

  const ruleCount = query.rules.length;

  return (
    <div className="query-builder" role="region" aria-label="可视化查询生成器">
      <div className="query-builder-head">
        <span className="query-builder-title">🔎 高级过滤（空间查询）</span>
        <div className="query-builder-combinator">
          <label>
            <input
              type="radio"
              name="qb-combinator"
              checked={query.combinator === 'AND'}
              onChange={() => setCombinator('AND')}
            />
            全部满足
          </label>
          <label>
            <input
              type="radio"
              name="qb-combinator"
              checked={query.combinator === 'OR'}
              onChange={() => setCombinator('OR')}
            />
            任一满足
          </label>
        </div>
        <div className="query-builder-actions">
          <button type="button" className="attr-table-btn" onClick={addRule} title="新增规则">+ 规则</button>
          <button
            type="button"
            className="attr-table-btn"
            onClick={handleCopySql}
            disabled={ruleCount === 0}
            title="复制为可读的 WHERE 子句描述"
          >
            {copied ? '✓ 已复制' : '📋 复制描述'}
          </button>
          {ruleCount > 0 && (
            <button type="button" className="attr-table-btn danger" onClick={clearAll} title="清空所有规则">清空</button>
          )}
        </div>
      </div>

      {ruleCount === 0 && (
        <div className="query-builder-empty">
          暂无过滤规则；点击「+ 规则」开始构造。支持 equals / 包含 / 数字区间 / 列表 / bbox。
        </div>
      )}

      {ruleCount > 0 && (
        <ul className="query-builder-rules">
          {query.rules.map((r, idx) => (
            <RuleRow
              key={idx}
              rule={r}
              fields={safeFields}
              fieldMap={fieldMap}
              onChange={(patch) => updateRule(idx, patch)}
              onRemove={() => removeRule(idx)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function RuleRow({ rule, fields, fieldMap, onChange, onRemove }) {
  const opMeta = OP_META[rule.op] || OP_META.contains;
  const fieldType = (fieldMap.get(rule.field) || {}).type || 'string';

  const handleFieldChange = (newField) => {
    const f = fieldMap.get(newField) || { type: 'string' };
    const newOp = (newField === rule.field)
      ? rule.op
      : defaultOpForType(f.type);
    const newVal = (newOp === rule.op)
      ? rule.value
      : defaultValueFor(newOp, f.type);
    onChange({ field: newField, op: newOp, value: newVal });
  };

  const handleOpChange = (newOp) => {
    const meta = OP_META[newOp] || OP_META.contains;
    let v = rule.value;
    if (meta.takesValue) {
      v = defaultValueFor(newOp, fieldType);
    } else {
      v = null;
    }
    onChange({ op: newOp, value: v });
  };

  const handleValueChange = (v) => onChange({ value: v });

  return (
    <li className="query-builder-rule">
      <select
        className="qb-field"
        value={rule.field}
        onChange={(e) => handleFieldChange(e.target.value)}
        title="字段"
      >
        {fields.map((f) => (
          <option key={f.name} value={f.name}>
            {f.label || f.name}{f.builtin ? '' : ` · ${f.type}`}
          </option>
        ))}
      </select>

      <select
        className="qb-op"
        value={rule.op}
        onChange={(e) => handleOpChange(e.target.value)}
        title="操作符"
      >
        {Object.entries(OP_META).map(([op, m]) => (
          <option key={op} value={op}>{m.label}</option>
        ))}
      </select>

      {opMeta.input === 'text' && (
        <input
          type="text"
          className="qb-value"
          aria-label={`查询值（${opMeta.label || ''}）`}
          value={rule.value == null ? '' : rule.value}
          placeholder={opMeta.placeholder}
          onChange={(e) => handleValueChange(e.target.value)}
        />
      )}

      {opMeta.input === 'number' && (
        <input
          type="number"
          className="qb-value qb-value-num"
          aria-label={`数值（${opMeta.label || ''}）`}
          value={rule.value == null ? '' : rule.value}
          placeholder={opMeta.placeholder}
          onChange={(e) => handleValueChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      )}

      {opMeta.input === 'csv' && (
        <input
          type="text"
          className="qb-value"
          aria-label={`逗号分隔列表（${opMeta.label || ''}）`}
          value={Array.isArray(rule.value) ? rule.value.join(',') : ''}
          placeholder={opMeta.placeholder}
          onChange={(e) => handleValueChange(
            e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s.length > 0)
          )}
        />
      )}

      {opMeta.input === 'bbox' && (
        <div className="qb-bbox">
          <input
            type="number"
            step="any"
            placeholder="W"
            aria-label="bbox 西边经度"
            value={rule.value?.west ?? ''}
            onChange={(e) => handleValueChange({ ...(rule.value || {}), west: Number(e.target.value) })}
          />
          <input
            type="number"
            step="any"
            placeholder="S"
            value={rule.value?.south ?? ''}
            onChange={(e) => handleValueChange({ ...(rule.value || {}), south: Number(e.target.value) })}
          />
          <input
            type="number"
            step="any"
            placeholder="E"
            value={rule.value?.east ?? ''}
            onChange={(e) => handleValueChange({ ...(rule.value || {}), east: Number(e.target.value) })}
          />
          <input
            type="number"
            step="any"
            placeholder="N"
            value={rule.value?.north ?? ''}
            onChange={(e) => handleValueChange({ ...(rule.value || {}), north: Number(e.target.value) })}
          />
        </div>
      )}

      {opMeta.input === 'none' && (
        <span className="qb-value qb-value-none">（无值）</span>
      )}

      <button
        type="button"
        className="qb-remove attr-table-btn danger"
        onClick={onRemove}
        title="删除此规则"
      >✕</button>
    </li>
  );
}

// 把 query 描述成 WHERE 子句样式的可读字符串（仅用于人眼阅读，不用于 SQL 拼接）
export function describeSql(query) {
  if (!query || !query.rules || !query.rules.length) return '';
  const parts = query.rules.map((r) => {
    const op = OP_META[r.op];
    const opLabel = op ? op.label : r.op;
    if (r.op === 'empty') return `(${r.field} ${opLabel})`;
    if (r.op === 'bbox') {
      const b = r.value || {};
      return `(bbox of ${r.field} ∩ [${b.west},${b.south},${b.east},${b.north}])`;
    }
    if (r.op === 'in') {
      return `(${r.field} IN (${(r.value || []).map((v) => JSON.stringify(v)).join(', ')}))`;
    }
    if (r.op === 'contains') return `(${r.field} ${opLabel} ${JSON.stringify(r.value)})`;
    if (r.op === 'startsWith') return `(${r.field} ${opLabel} ${JSON.stringify(r.value)})`;
    return `(${r.field} ${opLabel} ${JSON.stringify(r.value)})`;
  });
  const joiner = query.combinator === 'OR' ? ' OR ' : ' AND ';
  return parts.join(joiner);
}

// 重新导出 compileQuery 给上层用（避免上层单独 import 工具）
export { compileQuery };