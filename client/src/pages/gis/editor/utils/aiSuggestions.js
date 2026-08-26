// aiSuggestions — 阶段 3 AI 智能体 · 智能建议引擎
//
// 不依赖 LLM，本地基于"当前场景特征"产出 3-5 条可点选建议：
//   - 每条建议是一个完整的小 query（queryObject）或一组动作
//   - 每条带 label、emoji、reason（让用户明白 AI 为什么要这样建议）
//   - 一键点击 → 调用方把 queryObject 喂给 QueryBuilder
//
// 输入：
//   sceneContext: aiContext.buildSceneContext 的产物
//   options:
//     { limit: 5, kind?: 'all' | 'filter' | 'select' | 'analyze' }
// 输出：
//   [{ id, kind, label, reason, query, action?, icon }]
//
// 启发式规则（按场景特征权重）：
//   - 当前有选中要素 → 优先给"基于选中"的过滤/分析建议
//   - 某字段大量相同值 → "按 X 分组"建议
//   - 数字字段 → "X > N / < N" 区间建议
//   - 字符串字段 → "X 含 子串" 建议
//   - 有 bbox → "在该 bbox 内" 建议
//   - 字段值大量为空 → "X 为空" 建议
//   - 多图层 → "图层切换" 建议（用户主动用）
//   - 完全空场景 → 推荐加载示例 / 让 AI 写代码

const KIND_META = {
  filter:  { icon: '🔎', label: '过滤' },
  analyze: { icon: '📊', label: '分析' },
  select:  { icon: '✅', label: '选中' },
  explore: { icon: '💡', label: '探索' },
  action:  { icon: '⚙️', label: '动作' },
};

let _seq = 0;
const nextId = () => `sg_${Date.now().toString(36)}_${(++_seq).toString(36)}`;

// 取字段值出现次数 top N
function topValues(features, key, n = 3) {
  const m = new Map();
  for (const f of features) {
    const v = f?.attrs?.[key];
    if (v == null || v === '') continue;
    const k = String(v);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

// 字段空值率
function emptyRate(features, key) {
  if (!features.length) return 0;
  let empty = 0;
  for (const f of features) {
    const v = f?.attrs?.[key];
    if (v == null || v === '') empty++;
  }
  return empty / features.length;
}

// 主入口
export function buildSuggestions(sceneContext, options = {}) {
  const { limit = 5, kind = 'all' } = options;
  if (!sceneContext) {
    return [{
      id: nextId(),
      kind: 'explore',
      label: '加载示例数据',
      reason: '当前场景为空，先拖入一个 GeoJSON 或 KML 看看',
      icon: '📂',
      action: 'loadSample',
    }];
  }

  const features = sceneContext.features || sceneContext.editorFeatures || [];
  const layers = sceneContext.layers || [];
  const fields = (layers || []).flatMap((l) => (l.fields || []).map((f) => ({
    ...f,
    layerId: l.id,
    layerName: l.name,
  })));
  const selection = sceneContext.selection || [];
  const out = [];

  // ---- 1) 基于选中的建议（最高优先） ----
  if (selection.length > 0 && selection.length <= 50) {
    const sample = selection[0];
    const sampleName = sample.name || sample.featureId || '要素';
    out.push({
      id: nextId(),
      kind: 'analyze',
      label: `分析 ${selection.length} 个选中要素`,
      reason: `含 ${sample.kind || '?'} 类（示例：${sampleName}）`,
      icon: '🧮',
      action: { type: 'analyzeSelection' },
    });
    // 飞向选中要素
    if (selection.length <= 20) {
      out.push({
        id: nextId(),
        kind: 'action',
        label: `飞向选中要素`,
        reason: `${selection.length} 个要素，相机居中`,
        icon: '✈️',
        action: { type: 'flyToSelection' },
      });
    }
  }

  // ---- 2) 字符串字段建议 ----
  for (const f of fields) {
    if (f.type !== 'string' && f.type !== undefined) continue;
    const tops = topValues(features, f.name, 2);
    if (!tops.length) continue;
    const [topVal, count] = tops[0];
    const rate = (count / features.length);
    if (rate < 0.05 || rate > 0.95) continue; // 太稀疏/太集中都没意义
    out.push({
      id: nextId(),
      kind: 'filter',
      label: `${f.label || f.name} 含 "${topVal}"`,
      reason: `约 ${Math.round(rate * 100)}% 要素匹配（${count}/${features.length}）`,
      icon: '🔎',
      query: {
        combinator: 'AND',
        rules: [{ field: f.name, op: 'contains', value: topVal }],
      },
    });
    if (out.length >= limit * 2) break;
  }

  // ---- 3) 数字字段建议 ----
  for (const f of fields) {
    if (f.type !== 'number') continue;
    const nums = features
      .map((x) => Number(x?.attrs?.[f.name]))
      .filter((n) => Number.isFinite(n));
    if (nums.length < 2) continue;
    nums.sort((a, b) => a - b);
    const median = nums[Math.floor(nums.length / 2)];
    if (!Number.isFinite(median)) continue;
    out.push({
      id: nextId(),
      kind: 'filter',
      label: `${f.label || f.name} ≥ 中位数 ${median}`,
      reason: `基于 ${nums.length} 个有效值，约保留一半`,
      icon: '📈',
      query: {
        combinator: 'AND',
        rules: [{ field: f.name, op: 'gte', value: median }],
      },
    });
    out.push({
      id: nextId(),
      kind: 'filter',
      label: `${f.label || f.name} ≥ P75 ${nums[Math.floor(nums.length * 0.75)]}`,
      reason: `基于 ${nums.length} 个有效值，保留前 25%`,
      icon: '📈',
      query: {
        combinator: 'AND',
        rules: [{ field: f.name, op: 'gte', value: nums[Math.floor(nums.length * 0.75)] }],
      },
    });
    if (out.length >= limit * 2) break;
  }

  // ---- 4) 字段空值率建议 ----
  for (const f of fields) {
    const rate = emptyRate(features, f.name);
    if (rate >= 0.3 && rate <= 0.8) {
      out.push({
        id: nextId(),
        kind: 'analyze',
        label: `${f.label || f.name} 为空`,
        reason: `${Math.round(rate * 100)}% 要素此字段为空，可考虑补全`,
        icon: '🕳',
        query: {
          combinator: 'AND',
          rules: [{ field: f.name, op: 'empty' }],
        },
      });
      if (out.length >= limit * 2) break;
    }
  }

  // ---- 5) 多图层建议 ----
  if (layers.length > 1) {
    for (const l of layers.slice(0, 3)) {
      if (l.count === 0) continue;
      out.push({
        id: nextId(),
        kind: 'filter',
        label: `只看图层「${l.name}」`,
        reason: `${l.count} 要素`,
        icon: '📐',
        query: {
          combinator: 'AND',
          rules: [{ field: 'layerId', op: 'eq', value: l.id }],
        },
      });
      if (out.length >= limit * 2) break;
    }
  }

  // ---- 6) bbox 建议（当前相机范围） ----
  if (sceneContext.cameraLon != null && sceneContext.cameraLat != null) {
    const lon = sceneContext.cameraLon;
    const lat = sceneContext.cameraLat;
    const d = 1; // 1° 范围
    out.push({
      id: nextId(),
      kind: 'filter',
      label: `当前视野范围内的要素`,
      reason: `中心 ${lon.toFixed(2)},${lat.toFixed(2)} ±1°`,
      icon: '🌐',
      query: { combinator: 'AND', rules: [] },
      bboxGroups: [{
        west: lon - d, south: lat - d, east: lon + d, north: lat + d,
      }],
    });
  }

  // 限制 + 排序（filter 优先、analyze 次之、action 最后）
  const KIND_ORDER = { filter: 0, analyze: 1, select: 2, explore: 3, action: 4 };
  out.sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9));

  const filtered = kind === 'all' ? out : out.filter((s) => s.kind === kind);
  return filtered.slice(0, limit);
}

// 把 suggestion 描述成可读文本（用于 AI 上下文 / UI tooltip）
export function describeSuggestion(s) {
  if (!s) return '';
  const meta = KIND_META[s.kind] || { icon: '✨' };
  const lines = [`${meta.icon} ${s.label}`];
  if (s.reason) lines.push(`  理由：${s.reason}`);
  if (s.query && s.query.rules && s.query.rules.length) {
    lines.push(`  规则：${s.query.rules.length} 条 · ${s.query.combinator || 'AND'}`);
  }
  if (s.bboxGroups && s.bboxGroups.length) {
    lines.push(`  bbox：${s.bboxGroups.length} 组`);
  }
  return lines.join('\n');
}

// 直接给 QueryBuilder 用的预填值（query 字段优先，bboxGroups 合并）
export function suggestionToQuery(s) {
  if (!s) return null;
  return {
    combinator: s.query?.combinator || 'AND',
    rules: s.query?.rules || [],
    bboxGroups: s.bboxGroups || [],
  };
}

export { KIND_META };
