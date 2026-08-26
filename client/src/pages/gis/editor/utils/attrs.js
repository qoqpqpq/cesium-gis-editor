// attrs — 属性袋统一接口
// entity.properties.attrs 是一个普通对象 { [key]: any }
// GeoJSON 导入的属性会被收集到这里；导出时会被展开到 properties bag 与保留字段并列

// 保留字段名（不能作为用户属性名）
export const RESERVED = ['kind', 'featureId', 'layerId', 'selected', 'style', 'name', 'attrs'];

// 从 entity 读取属性袋；兼容 PropertyBag 包装
export function readAttrs(entity) {
  if (!entity || !entity.properties) return {};
  const props = entity.properties;
  const raw = props.attrs;
  if (!raw) return {};
  const v = raw.getValue ? raw.getValue() : raw;
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

// 把属性袋写回 entity。失败时静默
export function writeAttrs(entity, attrs) {
  if (!entity || !entity.properties) return;
  try {
    entity.properties.attrs = attrs || {};
  } catch (_) {}
}

// 修改单个属性的不可变更新
export function updateAttr(entity, key, newVal) {
  const cur = readAttrs(entity);
  const next = { ...cur };
  if (newVal === undefined || newVal === null || newVal === '') {
    delete next[key];
  } else {
    next[key] = newVal;
  }
  writeAttrs(entity, next);
  return next;
}

// 收集所有 features 的属性 key 集合，每个 key 推断类型
// 返回 [{ name, type: 'string'|'number'|'boolean' }]，按 key 名升序
export function collectFields(features) {
  const map = new Map(); // name -> 'string'|'number'|'boolean'
  features.forEach((f) => {
    const ent = f && f.entity ? f.entity : f;
    const a = readAttrs(ent);
    Object.keys(a).forEach((k) => {
      if (map.has(k)) return;
      map.set(k, inferType(a[k]));
    });
  });
  const out = [];
  for (const [name, type] of map.entries()) out.push({ name, type });
  out.sort((x, y) => x.name.localeCompare(y.name));
  return out;
}

// 简单类型推断：null / undefined → string；typeof number/string/boolean 直接用
// 注意：NaN / Infinity 视为 string 兜底
function inferType(value) {
  if (value === null || value === undefined) return 'string';
  if (typeof value === 'number' && Number.isFinite(value)) return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

// 类型强转；强制失败返回原值
export function coerce(value, type) {
  if (value === null || value === undefined) return value;
  if (type === 'number') {
    const n = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(n) ? n : value;
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    const s = String(value).trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no') return false;
    return value;
  }
  return String(value);
}

// 把 GeoJSON properties bag 过滤掉保留字段，得到 attrs
export function pickAttrs(props) {
  if (!props || typeof props !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    if (RESERVED.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

// ============ Checkpoint（关页面再开能恢复） ============
// 存储格式：{ savedAt: ISO 时间, items: [{ featureId, name, layerId, attrs }] }
// 只存 name/layerId/attrs（不动 positions/style，避免与编辑器内部状态打架）
const CHECKPOINT_KEY = 'editor.attr-checkpoint.v1';

export function saveCheckpoint(features) {
  const items = features.map((f) => ({
    featureId: f.featureId,
    name: f.name || '',
    layerId: f.layerId || 'default',
    attrs: f.attrs && typeof f.attrs === 'object' ? { ...f.attrs } : {},
  }));
  const payload = { savedAt: new Date().toISOString(), items };
  try {
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(payload));
    return { savedAt: payload.savedAt, count: items.length };
  } catch (e) {
    console.warn('[checkpoint] save failed', e);
    return null;
  }
}

export function loadCheckpoint() {
  try {
    const raw = localStorage.getItem(CHECKPOINT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.items)) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function clearCheckpoint() {
  try { localStorage.removeItem(CHECKPOINT_KEY); } catch (_) {}
}

// 把 checkpoint 应用回 ds（不通过 undo 栈；明确是「恢复」操作）
export function applyCheckpoint(api, checkpoint, refresh) {
  if (!api || !checkpoint) return { applied: 0, missing: 0 };
  const ds = api.getEditorDataSource && api.getEditorDataSource();
  if (!ds) return { applied: 0, missing: 0 };
  const byId = new Map(checkpoint.items.map((it) => [it.featureId, it]));
  let applied = 0;
  let missing = 0;
  ds.entities.values.forEach((ent) => {
    const props = ent && ent.properties;
    if (!props) return;
    const fid = props.featureId && props.featureId.getValue
      ? props.featureId.getValue() : props.featureId;
    if (!fid) return;
    const cp = byId.get(fid);
    if (!cp) { missing++; return; }
    try {
      ent.name = cp.name || ent.name;
      props.layerId = cp.layerId || 'default';
      writeAttrs(ent, cp.attrs || {});
      applied++;
    } catch (e) {
      console.warn('[checkpoint] apply failed on', fid, e);
    }
  });
  refresh && refresh();
  return { applied, missing };
}
