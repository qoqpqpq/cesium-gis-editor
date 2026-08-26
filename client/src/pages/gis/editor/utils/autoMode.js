// autoMode.js — 空间分析自动判断用本地还是服务端（纯函数，零依赖）
//
// 阈值设计：
//   - LARGE_DATASET_VERTEX_THRESHOLD = 5000：选中要素的顶点总数；
//     超过这个量，turf.js 在浏览器主线程跑会卡（实测 ~1-3s 卡顿）
//   - LARGE_BOOLEAN_POLYGON_THRESHOLD = 50：布尔运算的 polygon 数量；
//     polyclip-ts 在客户端跑 > 50 个 polygon 的 intersect/union 也会明显卡顿
//
// 设计原则：
//   - 自动判断是 best-effort，不需要绝对准确
//   - 不需要 dev server / Cesium / React；纯函数用假 entity shape 测
//   - 同名导出 LARGE_*_THRESHOLD 让 UI 可显示提示文案（如 "5000+ 顶点自动转服务端"）

export const LARGE_DATASET_VERTEX_THRESHOLD = 5000;
export const LARGE_BOOLEAN_POLYGON_THRESHOLD = 50;

const BOOLEAN_OPS = new Set(['intersect', 'union', 'difference', 'dissolve']);
const SINGLE_LAYER_OPS = new Set(['buffer', 'centroid', 'convexHull']);

/**
 * 算出选中 entity 集合的顶点总数和 polygon 数
 * @param {Array} ents Cesium entity 数组（可假；只需有 properties / polyline / polygon / position）
 * @returns {{ totalVertices: number, totalPolygons: number }}
 */
export function countShapeStats(ents) {
  let totalVertices = 0;
  let totalPolygons = 0;
  ents.forEach((e) => {
    const props = e.properties;
    const kind = props && props.kind && (props.kind.getValue ? props.kind.getValue() : props.kind);
    if (kind === 'polygon') totalPolygons++;
    const positions = extractPositions(e);
    totalVertices += positions.length;
  });
  return { totalVertices, totalPolygons };
}

function extractPositions(e) {
  if (e.polyline) {
    const p = e.polyline.positions.getValue ? e.polyline.positions.getValue() : e.polyline.positions;
    return p || [];
  }
  if (e.polygon) {
    const h = e.polygon.hierarchy.getValue ? e.polygon.hierarchy.getValue() : e.polygon.hierarchy;
    return (h && h.positions) || [];
  }
  if (e.position) {
    const c = e.position.getValue ? e.position.getValue() : e.position;
    return c ? [c] : [];
  }
  return [];
}

/**
 * 自动判断：当前 op + 当前 ents 应该用本地还是服务端
 * @param {string} op 操作名（buffer / intersect / ...）
 * @param {Array} ents Cesium entity 数组
 * @param {object} [opts] - { canRunOnServer: boolean }
 * @returns {'local' | 'server'}
 */
export function autoChooseMode(op, ents, opts = {}) {
  const canRunOnServer = opts.canRunOnServer !== false;
  if (!canRunOnServer) return 'local';
  const { totalVertices, totalPolygons } = countShapeStats(ents || []);
  if (BOOLEAN_OPS.has(op) && totalPolygons > LARGE_BOOLEAN_POLYGON_THRESHOLD) return 'server';
  if (totalVertices > LARGE_DATASET_VERTEX_THRESHOLD) return 'server';
  return 'local';
}

/**
 * 解析最终运行模式：auto / local / server
 * @param {string} runMode UI 选择的模式
 * @param {string} op 操作名
 * @param {Array} ents Cesium entity 数组
 * @returns {'local' | 'server'}
 */
export function resolveRunMode(runMode, op, ents) {
  if (runMode === 'local' || runMode === 'server') return runMode;
  return autoChooseMode(op, ents);
}