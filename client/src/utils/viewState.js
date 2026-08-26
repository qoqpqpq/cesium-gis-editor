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
 */

const HASH_KEY = 'view';

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
 */
export function buildViewStateHash(state) {
  if (!state || !state.camera) return '';
  try {
    // aiDescription 可能比较长；空字符串就丢掉
    const payload = { ...state };
    if (!payload.aiDescription) delete payload.aiDescription;
    if (!payload.aiModel) delete payload.aiModel;
    const json = JSON.stringify(payload);
    return `#${HASH_KEY}=${base64UrlEncode(json)}`;
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