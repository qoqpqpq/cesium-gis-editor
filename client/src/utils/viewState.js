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
// 周期 4 P1-3: 压缩算法版本；写在 hash 头部供未来升级
//   v1 = base64url(JSON)  （周期 1-3 行为）
//   v2 = base64url(zlib.deflate(JSON))（周期 4 增量）
const COMPRESS_VERSION = 'v2';
const COMPRESS_PREFIX = `${COMPRESS_VERSION}:`;

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
 * 同步版本：仅支持 v1（无压缩）
 * 异步版本（readViewStateFromUrlAsync）：支持 v1 + v2
 * @returns {object|null} 解析失败返回 null
 *
 * 周期 4 P1-3: 自动检测压缩版本（v1 = base64url / v2 = deflate + base64url）
 * 周期 6 P1-3: 浏览器 v2 用 pako 异步解压（pako 懒加载）
 */
export function readViewStateFromUrl() {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const view = params.get(HASH_KEY);
  if (!view) return null;
  // 周期 4 P1-3: 检测压缩版本前缀
  const isV2 = view.startsWith(COMPRESS_PREFIX);
  const payload = isV2 ? view.slice(COMPRESS_PREFIX.length) : view;
  try {
    let json;
    if (isV2) {
      // 同步路径仅 Node 端有效；浏览器同步路径会抛错（decompressFromBase64 内部 zlib 不可用）
      const bin = base64UrlDecodeBinary(payload);
      json = decompressFromBase64(bin);
    } else {
      json = base64UrlDecode(payload);
    }
    const obj = JSON.parse(json);
    if (obj && typeof obj === 'object' && obj.camera) return obj;
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * 周期 6 P1-3: 异步读 view state（浏览器 + Node 都支持 v1 + v2）
 * 浏览器：v2 用 pako 异步解压
 * Node：v2 用 zlib 同步解压
 */
export async function readViewStateFromUrlAsync() {
  if (typeof window === 'undefined') return readViewStateFromUrl();
  const hash = window.location.hash || '';
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const view = params.get(HASH_KEY);
  if (!view) return null;
  const isV2 = view.startsWith(COMPRESS_PREFIX);
  const payload = isV2 ? view.slice(COMPRESS_PREFIX.length) : view;
  try {
    let json;
    if (isV2) {
      const bin = base64UrlDecodeBinary(payload);
      // 浏览器异步 / Node 同步
      if (typeof window !== 'undefined') {
        json = await decompressFromBase64Async(bin);
      } else {
        json = decompressFromBase64(bin);
      }
    } else {
      json = base64UrlDecode(payload);
    }
    const obj = JSON.parse(json);
    if (obj && typeof obj === 'object' && obj.camera) return obj;
    return null;
  } catch (e) {
    console.warn('[viewState] readViewStateFromUrlAsync failed:', e && e.message);
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
        const encoded = base64UrlEncode(json);
        // 周期 4 P1-3: 压缩 — payload > 512 字节才值得压缩
        if (json.length >= 512) {
          try {
            const compressedBin = compressToBase64(json);
            const compressedStr = base64UrlEncodeBytes(compressedBin);
            const candidate = `#${HASH_KEY}=${COMPRESS_PREFIX}${compressedStr}`;
            if (candidate.length < encoded.length + 4) {
              return candidate; // 至少省 4 字符（v2: prefix）
            }
          } catch (_) {
            // 压缩失败 fallback 到原 base64
          }
        }
        return `#${HASH_KEY}=${encoded}`;
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

// ---- 周期 4 P1-3: zlib 压缩辅助（兼容浏览器 + Node）----
// 浏览器有 zlib + DecompressionStream（async）
// Node 18+ 有 zlib（sync）
// 周期 6 P1-3: 浏览器侧用 pako 懒加载（按需 import）— 不在 v2 解压路径
//   增加 pako 作为 devDependency；运行时按需 import（pako 是 MIT 许可）
//   之前的周期 4 浏览器侧 fallback 到"无压缩"会丢 v2 链接
//   现在：浏览器侧能解压 v2 链接（生产）— 首次解压动态 import pako

let _pakoInflate = null;
async function loadPakoInflate() {
  if (_pakoInflate) return _pakoInflate;
  try {
    const mod = await import('pako');
    _pakoInflate = mod.inflate;
    return _pakoInflate;
  } catch (e) {
    console.warn('[viewState] pako 加载失败:', e && e.message);
    return null;
  }
}

function getZlib() {
  // 浏览器 Vite 打包会用 import {deflate, inflate} from 'pako'
  // 周期 6 P1-3: 浏览器侧不再 fallback 到 null；改为按需动态 import pako
  //   Node 优先（同步）
  //   浏览器懒加载 pako（异步）
  if (typeof window !== 'undefined' && typeof DecompressionStream !== 'undefined') {
    // 浏览器异步解压：返回 null 但提供 async decompress 路径
    return null;
  }
  try {
    return require('node:zlib');
  } catch (_) {
    return null;
  }
}

function compressToBase64(str) {
  const zlib = getZlib();
  if (!zlib) throw new Error('zlib 不可用（仅在 Node 端支持 v2 压缩）');
  const buf = Buffer.from(str, 'utf8');
  const compressed = zlib.deflateSync(buf, { level: 9 });
  return compressed; // Buffer
}

function decompressFromBase64(binBuf) {
  const zlib = getZlib();
  if (!zlib) throw new Error('zlib 不可用（浏览器请用 decompressFromBase64Async）');
  const decompressed = zlib.inflateSync(binBuf);
  return decompressed.toString('utf8');
}

// 周期 6 P1-3: 浏览器异步解压（pako 懒加载）
// 周期 8 P0-2: 优先 DecompressionStream（浏览器原生，零依赖）；pako 仅做老浏览器兜底
async function decompressFromBase64Async(binBuf) {
  // 周期 8 P0-2: 优先 DecompressionStream（Chrome 80+ / Firefox 113+ / Safari 16.4+）
  //   - 零依赖；浏览器原生 gzip 解压
  //   - 通过 ReadableStream + Response + TextDecoder 异步解压
  if (typeof DecompressionStream !== 'undefined') {
    const arr = binBuf instanceof Uint8Array ? binBuf : new Uint8Array(binBuf);
    const blob = new Blob([arr]);
    const ds = new DecompressionStream('gzip');
    const decompressedStream = blob.stream().pipeThrough(ds);
    // 用 Response 转 text（自动消费 stream + 解码）
    return await new Response(decompressedStream).text();
  }
  // 老浏览器：pako 懒加载兜底
  const inflate = await loadPakoInflate();
  if (!inflate) throw new Error('pako inflate 不可用');
  // binBuf: Uint8Array or Buffer
  const arr = binBuf instanceof Uint8Array ? binBuf : new Uint8Array(binBuf);
  const out = inflate(arr);
  // pako 返回 Uint8Array → 转 string
  return new TextDecoder('utf-8').decode(out);
}

function base64UrlEncodeBytes(buf) {
  if (typeof Buffer !== 'undefined' && buf instanceof Buffer) {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  // 浏览器 fallback：用 btoa
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecodeBinary(s) {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - (s.length % 4)) % 4);
  if (typeof Buffer !== 'undefined') return Buffer.from(padded, 'base64');
  // 浏览器
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}