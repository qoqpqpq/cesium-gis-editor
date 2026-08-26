// aiTools — AI 助手可调用的工具注册表
//
// 协议约束（sandbox.js:149）：
//   <tool>name(args)</tool>  // args 不能含右括号
//   多参用逗号分隔；where 是单条件 key>val / key=val / key!=val（无逗号、无括号）
//
// 结果封顶：query_features 最多 50 条 / 8KB；超过就截断并提示「用更窄的 where」

import { collectFields, RESERVED } from './editor/utils/attrs.js';
import { bboxOf } from './aiContext.js';

const MAX_QUERY_ROWS = 50;
const MAX_QUERY_BYTES = 8 * 1024;

// 工具运行需要的依赖（getter 函数，避免循环依赖）
//   viewer: () => cesiumViewer
//   cesium: () => cesiumEarthApiRef（提供 flyTo 等）
//   editor: () => editorRef.current（提供命令式 API）
//   fileStats: () => cesiumRef.getDataSourceStats()
//   presets: () => { name: { lat, lon } }
export function makeDeps({ getViewer, getCesium, getEditor, getFileStats, getPresets }) {
  return { getViewer, getCesium, getEditor, getFileStats, getPresets };
}

// ============ 参数解析（key=value 列表，逗号分隔） ============
// 注意：value 里若有逗号会被当成下一个 key 的开始 —— 这是协议限制，工具内部不要传带逗号的字符串
export function parseArgs(args) {
  const out = {};
  if (!args) return out;
  for (const part of args.split(',')) {
    const p = part.trim();
    if (!p) continue;
    const eqIdx = p.indexOf('=');
    if (eqIdx < 0) continue;
    const k = p.slice(0, eqIdx).trim();
    const v = p.slice(eqIdx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

// where 过滤器：单条件 key OP value，OP 限 = / != / > / < / >= / <=
// 故意不支持 AND/OR —— 复杂的查询让用户用更窄的 layer 范围替代
function evalWhere(attrs, where) {
  if (!where) return true;
  const m = where.match(/^([\w.\- ]+)\s*(>=|<=|!=|=|>|<)\s*(.+)$/);
  if (!m) return true;
  const [, key, op, raw] = m;
  const k = key.trim();
  const v = coerce(raw.trim());
  const a = attrs[k];
  switch (op) {
    case '=': return String(a) === String(v);
    case '!=': return String(a) !== String(v);
    case '>': return Number(a) > Number(v);
    case '<': return Number(a) < Number(v);
    case '>=': return Number(a) >= Number(v);
    case '<=': return Number(a) <= Number(v);
  }
  return true;
}

function coerce(s) {
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === 'undefined') return null;
  const n = Number(s);
  if (Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(s)) return n;
  return s;
}

// ============ 工具实现 ============

function listLayers(editor) {
  const layers = editor.getLayers?.() || [];
  const features = editor.getFeatures?.() || [];
  const byLayer = new Map();
  for (const f of features) {
    const lid = f.layerId || 'default';
    byLayer.set(lid, (byLayer.get(lid) || 0) + 1);
  }
  return layers.map((l) => ({
    id: l.id,
    name: l.name,
    visible: l.visible !== false,
    count: byLayer.get(l.id) || 0,
  }));
}

function describeLayer(editor, layerName) {
  const layers = editor.getLayers?.() || [];
  const features = editor.getFeatures?.() || [];
  const def = layers.find((l) => l.name === layerName || l.id === layerName);
  const lid = def?.id || layerName;
  const list = features.filter((f) => (f.layerId || 'default') === lid);
  if (!list.length && !def) return { error: `找不到图层：${layerName}` };
  const fields = collectFields(list.map((f) => ({ properties: { attrs: f.attrs || {} } })))
    .filter((f) => !RESERVED.includes(f.name));
  const samples = list.slice(0, 3).map((f) => ({
    featureId: f.featureId,
    name: f.name,
    attrs: f.attrs || {},
  }));
  return {
    layer: def ? { id: def.id, name: def.name, visible: def.visible !== false } : { id: lid, name: lid, visible: true },
    count: list.length,
    fields: fields.map((f) => ({ name: f.name, type: f.type })),
    bbox: bboxOf(list.map((f) => f.positions)),
    samples,
  };
}

function queryFeatures(editor, { layer, where, limit }) {
  const features = editor.getFeatures?.() || [];
  const targetLayer = layer || null;
  let list = features;
  if (targetLayer) {
    // 既接受图层名也接受 id
    const layers = editor.getLayers?.() || [];
    const def = layers.find((l) => l.name === targetLayer || l.id === targetLayer);
    const lid = def?.id || targetLayer;
    list = features.filter((f) => (f.layerId || 'default') === lid);
  }
  if (where) {
    list = list.filter((f) => evalWhere(f.attrs || {}, where));
  }
  const cap = Math.min(parseInt(limit, 10) || MAX_QUERY_ROWS, MAX_QUERY_ROWS);
  const rows = list.slice(0, cap);
  const projected = rows.map((f) => ({
    featureId: f.featureId,
    name: f.name,
    kind: f.kind,
    layerId: f.layerId,
    attrs: f.attrs || {},
  }));
  let truncated = false;
  let body = JSON.stringify(projected, null, 0);
  if (body.length > MAX_QUERY_BYTES) {
    truncated = true;
    body = body.slice(0, MAX_QUERY_BYTES);
  }
  return {
    totalMatched: list.length,
    returned: projected.length,
    cap,
    truncated,
    body,
  };
}

function getSelection(editor) {
  const sel = editor.getSelectedIds?.() || new Set();
  const features = editor.getFeatures?.() || [];
  const out = [];
  for (const f of features) {
    if (sel.has && sel.has(f.featureId)) {
      out.push({ featureId: f.featureId, name: f.name, kind: f.kind, layerId: f.layerId });
    }
  }
  return { count: out.length, items: out };
}

function listFiles(getFileStats) {
  const stats = getFileStats() || [];
  return stats.map((s) => ({
    id: s.id,
    name: s.name,
    format: s.format,
    entityCount: s.entityCount,
    bbox: s.bbox,
    loading: !!s.loading,
    visible: s.visible,
  }));
}

// ============ 写工具辅助 ============
// from：layer=xxx / fid=yyy（fid 优先；都不填则全选）
// to：layer=xxx
function filterEntities(editor, p) {
  const features = editor.getFeatures?.() || [];
  // p.from 是 "layer=demo-points" / "fid=xxx" 的内嵌语法
  let layer = p.layer;
  let fid = p.fid;
  if (p.from) {
    const m = String(p.from).match(/^(layer|fid)=(.+)$/);
    if (m) {
      if (m[1] === 'layer') layer = m[2];
      else if (m[1] === 'fid') fid = m[2];
    } else {
      // 兜底：当成 layer 名处理
      layer = p.from;
    }
  }
  if (fid) return features.filter((f) => f.featureId === fid);
  if (layer) {
    const layers = editor.getLayers?.() || [];
    const def = layers.find((l) => l.name === layer || l.id === layer);
    const lid = def?.id || layer;
    return features.filter((f) => (f.layerId || 'default') === lid);
  }
  return features;
}

// 让 confirm modal 用的描述：人类可读的变更摘要
export function describeWriteTool(name, args) {
  const p = parseArgs(args);
  switch (name) {
    case 'move_features': {
      const layers = []; // editor layers 注入在 deps；此处只能展示原始参数
      return {
        title: `移动要素到图层「${p.to || '?'}」`,
        bullets: [
          `源：${p.layer ? `图层「${p.layer}」` : p.fid ? `要素 ${p.fid}` : '（全部要素）'}`,
          `目标图层：${p.to || '?'}`,
        ],
        warnings: [],
      };
    }
    case 'delete_features': {
      return {
        title: '删除要素',
        bullets: [
          `目标：${p.layer ? `图层「${p.layer}」` : p.fid ? `要素 ${p.fid}` : '（全部要素）'}`,
          '操作可撤销（Ctrl+Z）',
        ],
        warnings: ['删除是不可恢复的危险操作（即便可撤销，重做前不要刷新页面）'],
      };
    }
    case 'set_attr': {
      return {
        title: `修改属性 ${p.key || '?'}`,
        bullets: [
          `要素：${p.fid || '?'}`,
          `字段：${p.key || '?'} = ${p.value || '?'}`,
        ],
        warnings: [],
      };
    }
    case 'create_layer': {
      return {
        title: `创建图层「${p.name || '?'}」`,
        bullets: [`图层名：${p.name || '?'}`],
        warnings: [],
      };
    }
    case 'fly_to': {
      return {
        title: `视角飞到「${p.layer || p.target || '?'}」`,
        bullets: [`目标：${p.layer ? `图层「${p.layer}」` : p.target ? `预设 ${p.target}` : '?'}`],
        warnings: [],
      };
    }
    case 'select_features': {
      return {
        title: '修改选中集',
        bullets: [
          `目标：${p.layer ? `图层「${p.layer}」` : p.fid ? `要素 ${p.fid}` : '（全部要素）'}`,
        ],
        warnings: [],
      };
    }
    case 'draw_feature': {
      const verts = (p.coords || '').split(';').filter(Boolean).length;
      return {
        title: `绘制 ${p.kind || '?'}「${p.name || '?'}」`,
        bullets: [
          `类型：${p.kind || '?'}`,
          `顶点数：${verts}`,
          `图层：${p.layer || '当前活动图层'}`,
          '操作可撤销（Ctrl+Z）',
        ],
        warnings: [],
      };
    }
    default:
      return { title: name, bullets: [args], warnings: [] };
  }
}

// ============ 写工具实现 ============
// 所有 run() 返回 { ok, payload } 或 { error }
// payload 由 executeWriteToolPayload() 喂给 editor 命令式 API 真正执行
function moveFeatures(deps, p) {
  const editor = deps.getEditor();
  const ents = filterEntities(editor, p);
  if (!ents.length) return { error: '没有匹配的要素' };
  if (!p.to) return { error: '缺少 to= 目标图层' };
  return {
    payload: {
      featureIds: ents.map((f) => f.featureId),
      to: p.to,
    },
  };
}

function deleteFeatures(deps, p) {
  const editor = deps.getEditor();
  const ents = filterEntities(editor, p);
  if (!ents.length) return { error: '没有匹配的要素' };
  return {
    payload: {
      featureIds: ents.map((f) => f.featureId),
    },
  };
}

function setAttr(deps, p) {
  if (!p.fid || !p.key) return { error: '需要 fid 与 key 参数' };
  return {
    payload: {
      featureId: p.fid,
      changes: { [p.key]: p.value },
    },
  };
}

function createLayer(deps, p) {
  if (!p.name) return { error: '缺少 name 参数' };
  return {
    payload: { name: p.name },
  };
}

function flyTo(deps, p) {
  if (!p.layer && !p.target) return { error: '需要 layer 或 target 参数' };
  if (p.layer) {
    const editor = deps.getEditor();
    const list = (editor.getFeatures?.() || []).filter((f) => {
      const layers = editor.getLayers?.() || [];
      const hit = layers.find((l) => l.name === p.layer || l.id === p.layer);
      return hit && f.layerId === hit.id;
    });
    if (!list.length) return { error: `图层「${p.layer}」无要素` };
    return { payload: { layer: p.layer } };
  }
  return { payload: { target: p.target } };
}

function selectFeatures(deps, p) {
  const editor = deps.getEditor();
  const list = filterEntities(editor, p);
  return {
    payload: {
      featureIds: list.map((f) => f.featureId),
    },
  };
}

// draw_feature — 让 AI 直接画一个要素进编辑器（Section C.8）
// 参数协议（避开 `(` `)` `,` 限制）：
//   kind=<point|polyline|polygon|rectangle|circle>
//   coords=<lon|lat>;<lon|lat>;...   （顶点之间用 ; 经纬度之间用 |）
//   layer=<图层名/id>（可选；不填用当前活动图层）
//   name=<要素名>（可选）
//   attrs.<k>=<v>（可选；多个字段写多遍）
//   style.pointColor=#xxxxxx 等（可选）
function drawFeature(deps, p) {
  if (!p.kind) return { error: '缺少 kind 参数' };
  if (!p.coords) return { error: '缺少 coords 参数（格式：lon|lat;lon|lat;...）' };
  const lnglats = p.coords.split(';').map((pair) => {
    const [lng, lat] = pair.split('|').map((x) => Number(x.trim()));
    if (!isFinite(lng) || !isFinite(lat)) return null;
    return [lng, lat];
  }).filter(Boolean);
  if (!lnglats.length) return { error: 'coords 解析失败（每个顶点需为数字）' };
  if (lnglats.length < 2 && p.kind !== 'point') {
    return { error: `${p.kind} 至少需要 2 个顶点` };
  }
  const attrs = {};
  const style = {};
  Object.keys(p).forEach((k) => {
    if (k.startsWith('attrs.')) attrs[k.slice(6)] = p[k];
    else if (k.startsWith('style.')) style[k.slice(6)] = p[k];
  });
  return {
    payload: {
      kind: p.kind,
      lnglats,
      layerId: p.layer || undefined,
      name: p.name,
      style: Object.keys(style).length ? style : undefined,
      attrs: Object.keys(attrs).length ? attrs : undefined,
    },
  };
}

// ============ 工具注册表 ============
//
// 每个工具的 description 会拼进 system prompt
// readonly: true 表示不会修改场景（Phase 2 全是 readonly）
export const READ_TOOLS = {
  list_layers: {
    name: 'list_layers',
    description: '列出编辑器里所有图层（名称、可见性、要素数）。无参数。',
    readonly: true,
    run(args, deps) {
      return listLayers(deps.getEditor());
    },
  },
  describe_layer: {
    name: 'describe_layer',
    description: '查看指定图层的字段 schema、bbox 和前 3 条样本。参数：layer=<图层名或 id>。',
    readonly: true,
    run(args, deps) {
      const { layer } = parseArgs(args);
      if (!layer) return { error: '缺少 layer 参数' };
      return describeLayer(deps.getEditor(), layer);
    },
  },
  query_features: {
    name: 'query_features',
    description: [
      '按属性条件查询要素，结果封顶 50 条 / 8KB。参数（逗号分隔）：',
      '  layer=<图层名或 id>（可选；不填则查所有图层）',
      '  where=<单条件：字段 OP 值，OP 可选 =/!=/>/</>=/<= >（无逗号无括号）',
      '  limit=<数字，默认 50，最大 50>',
    ].join('\n'),
    readonly: true,
    run(args, deps) {
      const p = parseArgs(args);
      return queryFeatures(deps.getEditor(), p);
    },
  },
  get_selection: {
    name: 'get_selection',
    description: '查看当前选中的要素清单。无参数。',
    readonly: true,
    run(args, deps) {
      return getSelection(deps.getEditor());
    },
  },
  list_files: {
    name: 'list_files',
    description: '列出通过 FileLoader 拖入的所有数据源（文件名、格式、实体数、bbox）。无参数。',
    readonly: true,
    run(args, deps) {
      return listFiles(deps.getFileStats());
    },
  },
};

// 工具文档（拼进 system prompt）
export function toolDocsForPrompt() {
  const lines = [
    '## 决策树（务必遵守）',
    '1. 用户问「场景里有什么」/「有几个图层」/「能看到 X 吗」→ 先调读工具（list_layers / list_files），不要凭想象列清单',
    '2. 用户问「这个图层的字段是什么」→ 先调 describe_layer',
    '3. 用户要画 / 删 / 改 / 移动要素 → 调对应写工具（draw_feature / delete_features / set_attr / move_features）',
    '4. 只有当**没有合适工具**时，才走代码沙箱（viewer.entities.add(...) 这条路）',
    '5. 严禁捏造 UI 元素名（按钮 / 菜单 / 弹窗）。只引用本 prompt 后面列出的工具名 + 项目里真实存在的 UI（FileLoader / 工具栏 / LayersTree / 属性表 / AI 确认弹窗）',
    '',
    '## 可调用的工具（必须用 <tool>name(args)</tool> 格式调用，括号不能省 —— 没有参数也要写 ()）：',
  ];
  for (const t of Object.values(READ_TOOLS)) {
    lines.push('');
    lines.push(`<tool>${t.name}()</tool>`);
    lines.push(t.description);
  }
  lines.push('');
  lines.push('## 可调用的写工具（会修改场景；用户会在 UI 上看到确认弹窗，必须等用户批准）');
  for (const t of Object.values(WRITE_TOOLS)) {
    lines.push('');
    lines.push(`<tool>${t.name}(...)</tool>`);
    lines.push(t.description);
  }
  return lines.join('\n');
}

// ============ 写工具注册表 ============
// run() 返回 { needsConfirm, describe, payload } —— agent 拿到这个后弹窗确认；批准后用 payload 真正执行命令
export const WRITE_TOOLS = {
  list_layers: { name: 'list_layers', readonly: true, description: '（已在读工具里）' }, // 防误调占位
  move_features: {
    name: 'move_features',
    description: [
      '把要素迁到目标图层（参数，逗号分隔）：',
      '  from=layer=<图层名>|fid=<要素 id>（二选一；不填则全选）',
      '  to=<目标图层名>',
    ].join('\n'),
    readonly: false,
    needsConfirm: true,
    run(args, deps) { return moveFeatures(deps, parseArgs(args)); },
  },
  delete_features: {
    name: 'delete_features',
    description: '删除要素。参数：layer=<图层名>|fid=<要素 id>（二选一；不填则全部要素）。',
    readonly: false,
    needsConfirm: true,
    run(args, deps) { return deleteFeatures(deps, parseArgs(args)); },
  },
  set_attr: {
    name: 'set_attr',
    description: '修改单个要素的某个属性。参数：fid=<要素 id>, key=<字段名>, value=<新值>。',
    readonly: false,
    needsConfirm: true,
    run(args, deps) { return setAttr(deps, parseArgs(args)); },
  },
  create_layer: {
    name: 'create_layer',
    description: '新建一个空图层。参数：name=<图层名>。',
    readonly: false,
    needsConfirm: true,
    run(args, deps) { return createLayer(deps, parseArgs(args)); },
  },
  fly_to: {
    name: 'fly_to',
    description: '视角飞到指定范围。参数：layer=<图层名>|target=<预设名/坐标>。',
    readonly: false,
    needsConfirm: true,
    run(args, deps) { return flyTo(deps, parseArgs(args)); },
  },
  select_features: {
    name: 'select_features',
    description: '修改选中集。参数：layer=<图层名>|fid=<要素 id>（不填则全选）。',
    readonly: false,
    needsConfirm: true,
    run(args, deps) { return selectFeatures(deps, parseArgs(args)); },
  },
  draw_feature: {
    name: 'draw_feature',
    description: [
      'AI 直接绘制一个 GIS 要素（点 / 线 / 多边形 / 矩形 / 圆），落入 LayersTree。',
      '参数（逗号分隔；为避开逗号，coords 内用 | 和 ; 分隔）：',
      '  kind=<point|polyline|polygon|rectangle|circle>',
      '  coords=<lon|lat>;<lon|lat>;...（顶点之间用 ; 经纬度之间用 |）',
      '  layer=<图层名/id>（可选；不填用当前活动图层）',
      '  name=<要素名>（可选）',
      '  attrs.<key>=<value>（可选；每个字段写一遍）',
      '  style.<key>=<value>（可选；如 style.pointColor=#ff0000）',
    ].join('\n'),
    readonly: false,
    needsConfirm: true,
    run(args, deps) { return drawFeature(deps, parseArgs(args)); },
  },
};

// 工具分发：读工具直接执行；写工具只返回 needsConfirm 描述，真正执行由 agent 弹窗确认后做
export async function executeTool(name, args, deps) {
  if (READ_TOOLS[name]) {
    const tool = READ_TOOLS[name];
    try {
      const out = await tool.run(args, deps);
      return { ok: true, readonly: true, result: out };
    } catch (e) {
      return { ok: false, readonly: true, result: `工具执行错误：${e.message}` };
    }
  }
  if (WRITE_TOOLS[name]) {
    const tool = WRITE_TOOLS[name];
    if (!tool.needsConfirm) {
      // 写工具默认都要确认；除非显式 needsConfirm=false
      return { ok: false, readonly: false, result: '该写工具未启用' };
    }
    try {
      const out = await tool.run(args, deps);
      // 写工具约定：run() 返回 { payload }（待批准后真正执行的字典）或 { error }
      if (out && out.error) {
        return { ok: false, readonly: false, result: out.error };
      }
      const payload = out && out.payload;
      if (!payload) {
        return { ok: false, readonly: false, result: '工具未返回 payload' };
      }
      return { ok: true, readonly: false, needsConfirm: true, payload, tool: name };
    } catch (e) {
      return { ok: false, readonly: false, result: `工具执行错误：${e.message}` };
    }
  }
  const names = [...Object.keys(READ_TOOLS), ...Object.keys(WRITE_TOOLS)].join(', ');
  return { ok: false, readonly: true, result: `未知工具 ${name}。可用工具：${names}` };
}

// 兼容旧名
export const executeReadTool = executeTool;

// 把 write tool 的 payload 真正落进场景（用户已批准后调用）
// 所有写工具走 editor 命令式 API（editorRef.current = EditorPanel ref）
// 不再依赖 viewer.dataSources.get(0) / window.__editorSelect / pushCommand 等历史路径
export function executeWriteToolPayload(name, payload, deps) {
  try {
    const editor = deps.getEditor && deps.getEditor();
    if (!editor) return { ok: false, result: 'editor 不可用' };

    // 阶段 11：所有 AI 写工具调用期间 push 的 cmd 自动带 source='ai'
    // 这样用户按 Ctrl+Z 撤销时 UI 能区分是 AI 操作还是手动操作
    const run = (fn) => (typeof editor.withSource === 'function'
      ? editor.withSource('ai', fn)
      : fn());

    switch (name) {
      case 'move_features': {
        const r = run(() => editor.assignFeaturesToLayer(payload));
        if (!r.ok) return { ok: false, result: r.error };
        return { ok: true, result: `已移动 ${r.count} 个要素到图层「${r.layerName || r.layerId}」` };
      }
      case 'delete_features': {
        const r = run(() => editor.deleteFeatures(payload));
        if (!r.ok) return { ok: false, result: r.error };
        return { ok: true, result: `已删除 ${r.count} 个要素` };
      }
      case 'set_attr': {
        const r = run(() => editor.setAttributes(payload));
        if (!r.ok) return { ok: false, result: r.error };
        return { ok: true, result: `已修改 ${r.changedKeys.length} 个属性` };
      }
      case 'create_layer': {
        const r = run(() => editor.createLayer(payload));
        if (!r.ok) return { ok: false, result: r.error };
        return { ok: true, result: `已创建图层「${r.layer.name}」` };
      }
      case 'fly_to': {
        if (payload.layer) {
          const r = editor.flyToFeatures(payload);
          if (!r.ok) return { ok: false, result: r.error };
          return { ok: true, result: `已飞到图层「${payload.layer}」（${r.count} 个要素）` };
        }
        if (payload.target) {
          // preset：调 CesiumEarth.flyTo（通过 deps.getCesium）
          const cesium = deps.getCesium && deps.getCesium();
          if (!cesium || typeof cesium.flyTo !== 'function') {
            return { ok: false, result: '预设 flyTo 不可用' };
          }
          // 解析：target 是 "lat,lon" / "lat;lon" / "lat lon" 或已知地名
          const cleaned = String(payload.target).trim();
          const m = cleaned.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,\s;]\s*(-?\d+(?:\.\d+)?)\s*$/);
          if (m) {
            cesium.flyTo({ lat: parseFloat(m[1]), lon: parseFloat(m[2]), name: cleaned });
            return { ok: true, result: `已飞到 ${cleaned}` };
          }
          // PRESETS 是 array（每个有 name / lat / lon）；按 name 查
          const presets = deps.getPresets ? deps.getPresets() : null;
          if (Array.isArray(presets)) {
            const hit = presets.find((p) => p.name === cleaned);
            if (hit) {
              cesium.flyTo({ lat: hit.lat, lon: hit.lon, name: hit.name });
              return { ok: true, result: `已飞到 ${hit.name}` };
            }
          } else if (presets && presets[cleaned]) {
            const p = presets[cleaned];
            cesium.flyTo({ lat: p.lat, lon: p.lon, name: cleaned });
            return { ok: true, result: `已飞到 ${cleaned}` };
          }
          return { ok: false, result: `未知预设「${cleaned}」，请用 lat,lon / lat;lon 形式` };
        }
        return { ok: false, result: '需要 layer 或 target 参数' };
      }
      case 'select_features': {
        const r = editor.setSelection(payload);
        if (!r.ok) return { ok: false, result: r.error };
        return { ok: true, result: `已选中 ${r.selectedIds.length} 个要素` };
      }
      case 'draw_feature': {
        const r = run(() => editor.programmaticDraw(payload));
        if (!r.ok) return { ok: false, result: r.error };
        return { ok: true, result: `已绘制 ${r.kind}「${r.featureId}」` };
      }
      default:
        return { ok: false, result: `未实现的写工具：${name}` };
    }
  } catch (e) {
    return { ok: false, result: `执行失败：${e.message}` };
  }
}