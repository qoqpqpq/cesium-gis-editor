/**
 * viewState — 地图视图状态序列化 / 还原 (阶段 2C URL 分享)
 *
 * 把相机姿态 + 选中 layer + 坐标格式 压缩到 URL hash,
 * 不存实际图层数据 (那个由后端按权限提供).
 *
 * URL 形式: https://host/gis#view=<base64url>
 *
 * 包含:
 *  - camera: { lng, lat, height, heading, pitch }
 *  - layer:  选中 active layer id (用于深链到已有图层)
 *  - coordFormat: dec/dms/utm/mgrs
 *
 * 周期 3 P1-4: URL 长度降级 —— base64UrlEncode 后超 8KB 自动只保留 camera
 *   原因：浏览器 URL 上限 ~8KB-32KB 不等；超 8KB 时降级为最小集并 console.warn
 *   周期 1 调研遗留 B / 周期 2 P1-1 调研落点
 */

const HASH_KEY = 'view';
// 周期 3 P1-4: URL 长度阈值；超此值触发降级
const URL_LENGTH_LIMIT = 8192;

// base64url: 标准 base64 + URL-safe + 去掉 padding
function base64UrlEncode(str) {
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  return Buffer.from(str, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s) {
  if (!s) return '';
  const padded = s.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - (s.length % 4)) % 4);
  if (typeof atob === 'function') {
    return decodeURIComponent(escape(atob(padded)));
  }
  return Buffer.from(padded, 'base64').toString('utf8');
}

// 周期 3 P1-4: 估算 URL 长度（用 base64 编码后的字符串长度近似）
function estimateUrlLength(state) {
  if (!state) return 0;
  try {
    const json = JSON.stringify(state);
    return base64UrlEncode(json).length;
  } catch (_) {
    return Infinity;
  }
}

/**
 * 从当前 URL 读 view state (hash 里 #view=...)
 * @returns {object|null} 解析失败返回 null
 */
export function readViewStateFromUrl() {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const view = params.get(HASH_KEY);
  if (!view) return null;
  try {
    const json = base64UrlDecode(view);
    const obj = JSON.parse(json);
    if (obj && typeof obj === 'object' && obj.camera) return obj;
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * 序列化 view state → URL hash 字符串
 * @param {object} state { camera, layer, coordFormat, aiDescription?, aiModel? }
 *   aiDescription (可选) — 阶段 3B：场景 AI 化生成的 markdown 说明
 *   aiModel        (可选) — 生成该说明的模型名（仅用于显示 / 调试）
 * @returns {string} "#view=..." 形式(空字符串表示失败)
 *
 * 周期 3 P1-4 降级策略（按 URL 长度自动剥离非必要字段）：
 *   1. 全字段 → 超 8KB
 *   2. 去 aiDescription / aiModel → 再超
 *   3. 去 layer / coordFormat → 只剩 camera → 还不超？极端情况 camera 也被截
 *   4. 每级降级 console.warn 留痕
 */
export function buildViewStateHash(state) {
  if (!state || !state.camera) return '';
  // 周期 3 P1-4: 降级阶梯 —— 逐级剥离非核心字段
  const tiers = [
    // tier 0: 完整 payload（去掉空 aiDescription/aiModel）
    () => {
      const p = { ...state };
      if (!p.aiDescription) delete p.aiDescription;
      if (!p.aiModel) delete p.aiModel;
      return p;
    },
    // tier 1: 去掉 aiDescription
    () => {
      const p = { ...state };
      delete p.aiDescription;
      delete p.aiModel;
      return p;
    },
    // tier 2: 只剩 camera
    () => ({ camera: state.camera }),
  ];
  for (let i = 0; i < tiers.length; i += 1) {
    const payload = tiers[i]();
    if (estimateUrlLength(payload) <= URL_LENGTH_LIMIT) {
      if (i > 0) {
        const dropped = i === 1 ? 'aiDescription' : 'aiDescription+layer+coordFormat';
        console.warn(
          `[viewState] URL 长度超 ${URL_LENGTH_LIMIT}B，降级到 tier ${i}（丢弃 ${dropped}）`
        );
      }
      try {
        const json = JSON.stringify(payload);
        return `#${HASH_KEY}=${base64UrlEncode(json)}`;
      } catch (_) {
        return '';
      }
    }
  }
  // 极端：只剩 camera 仍超 —— camera 本身 > 8KB 几乎不可能（lng/lat/height 各 8B），
  // 但 aiDescription 在 state 之外就别无他法，console.warn 后尝试 tier 2
  console.warn('[viewState] 即使只剩 camera 仍超 8KB，强制降级');
  try {
    return `#${HASH_KEY}=${base64UrlEncode(JSON.stringify({ camera: state.camera }))}`;
  } catch (_) {
    return '';
  }
}

/**
 * 完整 URL = 当前 origin + pathname + hash
 * @param {object} state
 * @returns {string|null} URL 字符串;失败返回 null
 */
export function buildShareUrl(state) {
  if (typeof window === 'undefined') return null;
  const hash = buildViewStateHash(state);
  if (!hash) return null;
  const { origin, pathname } = window.location;
  const search = window.location.search || '';
  return `${origin}${pathname}${search}${hash}`;
}

/**
 * 标准化 camera 字段 — 调用方需传入 Cesium
 * @param {Cesium.Viewer} viewer
 * @param {Cesium} Cesium
 * @returns {object|null}
 */
export function snapshotCamera(viewer, Cesium) {
  if (!viewer || !viewer.camera || !Cesium) return null;
  try {
    const cam = viewer.camera;
    const pos = cam.positionCartographic;
    if (!pos) return null;
    return {
      lng: +Cesium.Math.toDegrees(pos.longitude).toFixed(6),
      lat: +Cesium.Math.toDegrees(pos.latitude).toFixed(6),
      height: +pos.height.toFixed(2),
      heading: +Cesium.Math.toDegrees(cam.heading).toFixed(2),
      pitch: +Cesium.Math.toDegrees(cam.pitch).toFixed(2),
    };
  } catch (_) {
    return null;
  }
}

/**
 * 把 camera snapshot 应用到 viewer — 调用方需传入 Cesium
 * @param {Cesium.Viewer} viewer
 * @param {Cesium} Cesium
 * @param {object} camera
 */
export function applyCameraSnapshot(viewer, Cesium, camera) {
  if (!viewer || !camera || !Cesium) return;
  try {
    const pos = Cesium.Cartesian3.fromDegrees(
      camera.lng,
      camera.lat,
      camera.height
    );
    viewer.camera.setView({
      destination: pos,
      orientation: {
        heading: Cesium.Math.toRadians(camera.heading || 0),
        pitch: Cesium.Math.toRadians(camera.pitch || -90),
        roll: 0,
      },
    });
  } catch (e) {
    console.warn('[viewState] applyCameraSnapshot failed:', e);
  }
}