// 共享的 pickEllipsoid 守卫 + viewer-ready 等待工具
import * as Cesium from 'cesium';

/**
 * 把屏幕坐标安全转成 Cartographic。
 * 任何中间环节失败（viewer 没就绪、screenPos 无效、点在天空、carto 字段未初始化）都返回 null。
 */
export function safePickEllipsoid(viewer, screenPos) {
  if (!viewer || !viewer.camera || !viewer.scene || !viewer.scene.globe) return null;
  if (!screenPos || typeof screenPos.x !== 'number' || typeof screenPos.y !== 'number') return null;
  // pickEllipsoid 返回的是 Cartesian3（不是 Cartographic），必须显式转换
  const cartesian = viewer.camera.pickEllipsoid(screenPos, viewer.scene.globe.ellipsoid);
  if (!cartesian) return null;
  const carto = Cesium.Cartographic.fromCartesian(cartesian, viewer.scene.globe.ellipsoid);
  if (!carto) return null;
  if (typeof carto.longitude !== 'number' || typeof carto.latitude !== 'number') return null;
  if (!Number.isFinite(carto.longitude) || !Number.isFinite(carto.latitude)) return null;
  return carto;
}

/**
 * 轮询直到 viewer 就绪再调用 cb(viewer)。
 * 用于避免 useDrawing / useVertexEdit 等 effect 在 viewer 异步初始化完之前空跑。
 * 返回 cleanup 函数：调用后停止轮询。
 */
export function whenViewerReady(api, cb) {
  let cancelled = false;
  const tick = () => {
    if (cancelled) return;
    let v = null;
    try { v = api && api.getViewer && api.getViewer(); } catch (_) {}
    if (v && v.scene && v.scene.canvas && v.camera) {
      try { cb(v); } catch (e) { console.warn('[editor] whenViewerReady cb threw:', e); }
    } else {
      requestAnimationFrame(tick);
    }
  };
  tick();
  return () => { cancelled = true; };
}