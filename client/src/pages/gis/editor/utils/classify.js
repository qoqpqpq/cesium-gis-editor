// classify — 主题可视化分类算法
// 三种分类：等间隔 (equal-interval) / 分位数 (quantile) / 唯一值 (unique)
// 含 5 种内置色卡

// ============ 分类算法 ============

// 等间隔：(max - min) / n
export function classifyEqualInterval(values, n = 5) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [min, max];
  const step = (max - min) / n;
  const breaks = [min];
  for (let i = 1; i < n; i++) breaks.push(min + step * i);
  breaks.push(max);
  return breaks;
}

// 分位数：sorted values, breaks at i/n fraction
export function classifyQuantile(values, n = 5) {
  if (!values.length) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const breaks = [];
  for (let i = 1; i < n; i++) {
    const idx = Math.floor((i / n) * sorted.length);
    breaks.push(sorted[Math.min(idx, sorted.length - 1)]);
  }
  breaks.unshift(sorted[0]);
  breaks.push(sorted[sorted.length - 1]);
  // 去重
  return Array.from(new Set(breaks.map((v) => Number(v.toFixed(6)))));
}

// 唯一值：每个 unique 值一段
export function classifyUnique(values) {
  if (!values.length) return [];
  return Array.from(new Set(values));
}

// ============ 归类：value 落在第几档（0-based） ============

export function classifyValue(value, breaks) {
  if (!Number.isFinite(value) || !breaks.length) return 0;
  let idx = 0;
  for (let i = 1; i < breaks.length; i++) {
    if (value <= breaks[i]) { idx = i - 1; break; }
    idx = i - 1;
  }
  return Math.min(Math.max(0, idx), breaks.length - 2);
}

export function classifyUniqueIndex(value, uniques) {
  return Math.max(0, uniques.indexOf(value));
}

// ============ 色卡 ============
// 7 色线性渐变（不需要 d3-scale，自己硬编码）

const RAMP = {
  Blues:   ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'],
  Reds:    ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#a50f15', '#67000d'],
  Greens:  ['#f7fcb9', '#d9f0a3', '#addd8e', '#78c679', '#41ab5d', '#238443', '#006837', '#004529', '#002b1c'],
  YlOrRd:  ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026'],
  Viridis: ['#fde725', '#b5de2b', '#6ece58', '#35b779', '#1f9e89', '#26828e', '#36618a', '#443a83', '#440154'],
};

// 取得色卡在某索引 [0, n) 处的颜色（rgba）
export function rampColor(i, n, name = 'Blues', alpha = 0.7) {
  const palette = RAMP[name] || RAMP.Blues;
  // palette 是 9 色；线性映射 n → 9
  if (n <= 1) return toRgba(palette[Math.floor(palette.length / 2)], alpha);
  const t = i / (n - 1);
  const idx = t * (palette.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(palette.length - 1, lo + 1);
  const ratio = idx - lo;
  return lerpHex(palette[lo], palette[hi], ratio, alpha);
}

function toRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function lerpHex(a, b, t, alpha) {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const b2 = Math.round(ab + (bb - ab) * t);
  return `rgba(${r},${g},${b2},${alpha})`;
}

export const RAMPS = Object.keys(RAMP);

// ============ 顶层入口 ============

// 给一批 features 计算每个应当使用的 fillColor
// features: [{ featureId, attrs? }]，需要 field 字段
// config: { method: 'equal'|'quantile'|'unique', n: 5, ramp: 'Blues', alpha: 0.7 }
//   注：unique 模式 n 自动 = unique 数量，ramp 自动循环
// 返回 Map<featureId, { fillColor, classIndex, classified }>
export function classifyFeatures(features, field, config) {
  const map = new Map();
  if (!features || !features.length || !field) return map;

  const values = features.map((f) => {
    const v = f.attrs ? f.attrs[field] : undefined;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  });

  if (config.method === 'unique') {
    const uniques = classifyUnique(values.filter((v) => v !== null));
    features.forEach((f) => {
      const v = f.attrs ? f.attrs[field] : undefined;
      const idx = v === null || v === undefined
        ? -1
        : classifyUniqueIndex(v, uniques);
      map.set(f.featureId, {
        classIndex: idx,
        fillColor: idx < 0
          ? 'rgba(120,120,120,0.35)'
          : rampColor(idx, uniques.length, config.ramp, config.alpha ?? 0.7),
      });
    });
    return map;
  }

  // equal / quantile：忽略非数值
  const numericPairs = [];
  features.forEach((f, i) => {
    if (values[i] !== null) numericPairs.push({ f, v: values[i] });
  });
  if (!numericPairs.length) return map;

  const n = config.n || 5;
  let breaks;
  if (config.method === 'quantile') breaks = classifyQuantile(numericPairs.map((p) => p.v), n);
  else breaks = classifyEqualInterval(numericPairs.map((p) => p.v), n);

  numericPairs.forEach(({ f, v }) => {
    const idx = classifyValue(v, breaks);
    map.set(f.featureId, {
      classIndex: idx,
      fillColor: rampColor(idx, n, config.ramp, config.alpha ?? 0.7),
    });
  });

  // 没数值的填灰
  features.forEach((f, i) => {
    if (values[i] === null && !map.has(f.featureId)) {
      map.set(f.featureId, { classIndex: -1, fillColor: 'rgba(120,120,120,0.35)' });
    }
  });

  return map;
}
