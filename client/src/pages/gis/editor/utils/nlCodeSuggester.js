// nlCodeSuggester — 阶段 3 AI 智能体 · 本地 NL→Cesium 代码片段
//
// 用途：
//   用户在 AI 面板或自然语言输入框描述"飞到北京，加紫色立方体"
//   → 本地立即产出一段可运行的 Cesium JS（不依赖 LLM）
//   → 同时返回可选的 AI 增强提示，让用户能"先看草稿 → 让 AI 改进"
//
// 设计：
//   - 不调用任何外部 API，纯字符串模式匹配 + 预设片段拼接
//   - 任何"位置""物体""动作"都映射到既有 PRESETS + 一些常见模板
//   - 返回 { code, plan, fallbackToAi: boolean }
//   - fallbackToAi=true 时调用方应继续把原 NL 转发给 LLM

import { PRESETS } from '../../presets.js';

// 颜色关键字 → CSS 颜色
const COLOR_MAP = {
  红: '#ff4d4f', 红色: '#ff4d4f', 深红: '#c0392b', 粉: '#ff5fb1', 粉色: '#ff5fb1',
  橙: '#fa8c16', 橙色: '#fa8c16', 黄: '#fadb14', 黄色: '#fadb14',
  绿: '#52c41a', 绿色: '#52c41a', 浅绿: '#a0d911',
  蓝: '#1890ff', 蓝色: '#1890ff', 深蓝: '#003a8c', 浅蓝: '#5ad1ff', 青: '#13c2c2', 青色: '#13c2c2',
  紫: '#722ed1', 紫色: '#722ed1', 紫红: '#c41d7f',
  白: '#ffffff', 白色: '#ffffff', 黑: '#1f1f1f', 黑色: '#1f1f1f', 灰: '#8c8c8c', 灰色: '#8c8c8c',
};

// 把字符串里的"红色 / 蓝的"等抽成 hex，返回剩余串
function extractColor(s) {
  if (!s) return { color: null, rest: s };
  let color = null;
  let rest = s;
  for (const k of Object.keys(COLOR_MAP).sort((a, b) => b.length - a.length)) {
    const re = new RegExp(k, 'g');
    if (re.test(rest)) {
      color = COLOR_MAP[k];
      rest = rest.replace(re, '').trim();
      break;
    }
  }
  return { color, rest };
}

// 抽数字（带"约 / 大概"修饰）
function extractNumber(s, fallback) {
  if (!s) return fallback;
  const m = String(s).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : fallback;
}

// 抽 "N 公里 / N 米 / N km / N m" 为米
function extractMeters(s, fallback) {
  if (!s) return fallback;
  const m = String(s).match(/(\d+(?:\.\d+)?)\s*(公里|千米|km|米|m)/i);
  if (!m) return extractNumber(s, fallback);
  const n = Number(m[1]);
  if (/公里|千米|km/i.test(m[2])) return n * 1000;
  return n;
}

// 在 PRESETS 里找最匹配的城市
function findCity(s) {
  if (!s) return null;
  for (const p of PRESETS) {
    if (s.includes(p.name)) return p;
  }
  // 兜底：常见中英文别名
  const ALIASES = {
    北京: '北京', 京: '北京', beijing: '北京',
    上海: '上海', 沪: '上海', shanghai: '上海',
    广州: '广州', 穗: '广州', guangzhou: '广州',
    深圳: '深圳', 深: '深圳', shenzhen: '深圳',
    杭州: '杭州', hangzhou: '杭州',
    成都: '成都', chengdu: '成都',
    重庆: '重庆', chongqing: '重庆',
    武汉: '武汉', wuhan: '武汉',
    西安: '西安', xian: '西安',
    纽约: '纽约', newyork: '纽约', nyc: '纽约',
    东京: '东京', tokyo: '东京',
    伦敦: '伦敦', london: '伦敦',
    巴黎: '巴黎', paris: '巴黎',
    悉尼: '悉尼', sydney: '悉尼',
  };
  for (const k of Object.keys(ALIASES)) {
    if (s.toLowerCase().includes(k)) {
      const target = ALIASES[k];
      return PRESETS.find((p) => p.name === target) || null;
    }
  }
  return null;
}

const TEMPLATES = {
  flyTo: ({ city, height }) => ({
    plan: `飞向${city.name}，高度 ${height} 米`,
    code:
`viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(${city.lon}, ${city.lat}, ${height}),
  duration: 1.6,
});`,
  }),
  point: ({ city, color, height }) => ({
    plan: `在${city.name}上空 ${height}m 加一个点引脚`,
    code:
`entities.add({
  id: 'ai-point-${city.id}',
  name: '${city.name} 引脚',
  position: Cesium.Cartesian3.fromDegrees(${city.lon}, ${city.lat}, ${height}),
  point: { pixelSize: 14, color: Cesium.Color.fromCssColorString('${color}'), outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
  label: { text: '${city.name}', font: '14px sans-serif', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -22) },
});`,
  }),
  box: ({ city, color, height, size }) => ({
    plan: `在${city.name}上空 ${height}m 加紫色 3D 立方体`,
    code:
`entities.add({
  id: 'ai-box-${city.id}',
  name: '${city.name} 立方体',
  position: Cesium.Cartesian3.fromDegrees(${city.lon}, ${city.lat}, ${height}),
  box: {
    dimensions: new Cesium.Cartesian3(${size}, ${size}, ${size}),
    material: Cesium.Color.fromCssColorString('${color}').withAlpha(0.78),
    outline: true,
    outlineColor: Cesium.Color.WHITE,
  },
});`,
  }),
  flightPath: ({ city, other, color }) => ({
    plan: `画一条从${city.name}到${other.name}的飞行轨迹`,
    code:
`entities.add({
  id: 'ai-path-${city.id}-${other.id}',
  name: '${city.name} → ${other.name}',
  polyline: {
    positions: Cesium.Cartesian3.fromDegreesArrayHeights([${city.lon},${city.lat},10000, ${other.lon},${other.lat},10000]),
    width: 3,
    arcType: Cesium.ArcType.GEODESIC,
    material: new Cesium.PolylineGlowMaterialProperty({
      glowPower: 0.25,
      color: Cesium.Color.fromCssColorString('${color}'),
    }),
  },
});`,
  }),
  rect: ({ city, color, size }) => ({
    plan: `在${city.name}附近画一个矩形区域`,
    code:
`entities.add({
  id: 'ai-rect-${city.id}',
  name: '${city.name} 矩形',
  rectangle: {
    coordinates: Cesium.Rectangle.fromDegrees(${city.lon - size}, ${city.lat - size}, ${city.lon + size}, ${city.lat + size}),
    material: Cesium.Color.fromCssColorString('${color}').withAlpha(0.35),
    outline: true,
    outlineColor: Cesium.Color.fromCssColorString('${color}'),
  },
});`,
  }),
  orbit: ({ city, height }) => ({
    plan: `绕${city.name}上空 ${height}m 镜头环绕一周`,
    code:
`viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(${city.lon}, ${city.lat}, ${height}),
  orientation: { heading: 0, pitch: Cesium.Math.toRadians(-45), roll: 0 },
  duration: 0,
});
const orbit = (viewer.clock.currentTime, 16) => {
  const t = (Date.now() % 16000) / 16000;
  const h = Cesium.Math.toRadians(t * 360);
  viewer.camera.lookAt(
    Cesium.Cartesian3.fromDegrees(${city.lon}, ${city.lat}, ${height}),
    new Cesium.HeadingPitchRoll(h, Cesium.Math.toRadians(-45), 0)
  );
};
setInterval(orbit, 16);`,
  }),
};

const DEFAULTS = {
  color: '#5ad1ff',
  height: 30000,
  size: 20000,
  city: PRESETS[0],
};

// 主入口
export function suggestCesiumCode(input) {
  if (!input || typeof input !== 'string') {
    return { plan: '', code: '', fallbackToAi: true, reason: '空输入' };
  }
  let s = String(input).trim();
  if (!s) return { plan: '', code: '', fallbackToAi: true, reason: '空输入' };

  // 1) 提取城市
  const cities = [];
  for (const p of PRESETS) {
    if (s.includes(p.name)) cities.push(p);
  }
  if (!cities.length) {
    const aliased = findCity(s);
    if (aliased) cities.push(aliased);
  }
  if (!cities.length) {
    return { plan: '', code: '', fallbackToAi: true, reason: '未识别地点（可用预设城市）' };
  }

  // 2) 提取颜色 / 高度 / 大小
  const { color, rest: restAfterColor } = extractColor(s);
  const out = {
    plan: '',
    code: '',
    city: cities[0],
    color: color || DEFAULTS.color,
    fallbackToAi: false,
  };

  // 3) 模板匹配
  // 飞行路径 = 两个城市 + "路径/轨迹/航线"
  if (cities.length >= 2 && /(路径|轨迹|航线|连线)/.test(s)) {
    const t = TEMPLATES.flightPath({ city: cities[0], other: cities[1], color: out.color });
    out.plan = t.plan; out.code = t.code;
    return out;
  }

  // 立方体 / box
  if (/(立方体|立方|cube|box)/i.test(s)) {
    const height = extractMeters(s, DEFAULTS.height);
    const size = extractMeters(s, DEFAULTS.size);
    const t = TEMPLATES.box({ city: cities[0], color: out.color, height, size });
    out.plan = t.plan; out.code = t.code;
    return out;
  }

  // 矩形 / rectangle
  if (/(矩形|rectangle)/.test(s)) {
    const size = extractNumber(s, 0.5); // 0.5° 默认
    const t = TEMPLATES.rect({ city: cities[0], color: out.color, size });
    out.plan = t.plan; out.code = t.code;
    return out;
  }

  // 点 / pin / 引脚
  if (/(点|引脚|pin|标记)/.test(s)) {
    const height = extractMeters(s, 0); // 地面
    const t = TEMPLATES.point({ city: cities[0], color: out.color, height });
    out.plan = t.plan; out.code = t.code;
    return out;
  }

  // 环绕 / 旋转 / orbit
  if (/(环绕|旋转|orbit|转一圈)/.test(s)) {
    const height = extractMeters(s, DEFAULTS.height);
    const t = TEMPLATES.orbit({ city: cities[0], height });
    out.plan = t.plan; out.code = t.code;
    return out;
  }

  // 默认飞向
  const height = extractMeters(s, DEFAULTS.height);
  const t = TEMPLATES.flyTo({ city: cities[0], height });
  out.plan = t.plan; out.code = t.code;
  return out;
}

// 批量建议（用于 AI 面板"示例片段"chips）
export function suggestQuickSnippets() {
  return [
    {
      label: '✈️ 飞北京',
      text: '飞到北京',
      plan: TEMPLATES.flyTo({ city: PRESETS[0], height: 20000 }).plan,
      code: TEMPLATES.flyTo({ city: PRESETS[0], height: 20000 }).code,
    },
    {
      label: '🧊 北京立方体',
      text: '在北京加紫色立方体',
      plan: TEMPLATES.box({ city: PRESETS[0], color: '#722ed1', height: 30000, size: 20000 }).plan,
      code: TEMPLATES.box({ city: PRESETS[0], color: '#722ed1', height: 30000, size: 20000 }).code,
    },
    {
      label: '🛩 京沪航线',
      text: '画北京到上海的飞行轨迹',
      plan: TEMPLATES.flightPath({ city: PRESETS[0], other: PRESETS[1], color: '#5ad1ff' }).plan,
      code: TEMPLATES.flightPath({ city: PRESETS[0], other: PRESETS[1], color: '#5ad1ff' }).code,
    },
    {
      label: '▭ 上海矩形',
      text: '在上海画矩形',
      plan: TEMPLATES.rect({ city: PRESETS[1], color: '#52c41a', size: 0.5 }).plan,
      code: TEMPLATES.rect({ city: PRESETS[1], color: '#52c41a', size: 0.5 }).code,
    },
  ];
}
