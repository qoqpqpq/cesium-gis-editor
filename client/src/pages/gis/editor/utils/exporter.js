// exporter — 把 editor DataSource 转 GeoJSON / KML，以及触发下载

import * as Cesium from 'cesium';
import { cartesiansToLngLatHeights } from './geometry.js';

// 提取一个 entity 的 GeoJSON geometry（不含 properties）
function entityToGeometry(entity) {
  const props = entity.properties;
  const get = (k) => (props && props[k] && props[k].getValue ? props[k].getValue() : props && props[k]);
  const kind = get('kind');

  if (kind === 'point' && entity.position) {
    const c = entity.position.getValue ? entity.position.getValue() : entity.position;
    if (!c) return null;
    const coords = cartToLngLat(c);
    return { type: 'Point', coordinates: coords };
  }
  if (entity.polyline && entity.polyline.positions) {
    const p = entity.polyline.positions.getValue
      ? entity.polyline.positions.getValue()
      : entity.polyline.positions;
    if (!p || !p.length) return null;
    const coords = p.map(cartToLngLat);
    return { type: 'LineString', coordinates: coords };
  }
  if (entity.polygon && entity.polygon.hierarchy) {
    const h = entity.polygon.hierarchy.getValue
      ? entity.polygon.hierarchy.getValue()
      : entity.polygon.hierarchy;
    const ring = (h && h.positions) || [];
    if (ring.length < 3) return null;
    const coords = [ring.map(cartToLngLat)];
    // 自动闭合
    const first = coords[0][0];
    const last = coords[0][coords[0].length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      coords[0].push([...first]);
    }
    return { type: 'Polygon', coordinates: coords };
  }
  return null;
}

function cartToLngLat(c) {
  const carto = Cesium.Cartographic.fromCartesian(c);
  const coords = [Cesium.Math.toDegrees(carto.longitude), Cesium.Math.toDegrees(carto.latitude)];
  if (Math.abs(carto.height) > 0.001) coords.push(carto.height);
  return coords;
}

// 转 GeoJSON FeatureCollection
export function toGeoJSON(dataSource) {
  if (!dataSource) return { type: 'FeatureCollection', features: [] };
  const features = [];
  dataSource.entities.values.forEach((e) => {
    if (e.id === '__draft__') return;
    const props = e.properties;
    if (!props) return;
    const get = (k) => (props[k] && props[k].getValue ? props[k].getValue() : props[k]);
    if (get('kind') === 'draft') return;
    if (get('kind') === '__measurement__') return;
    const geometry = entityToGeometry(e);
    if (!geometry) return;
    const userAttrs = (() => {
      const a = get('attrs');
      return a && typeof a === 'object' ? a : {};
    })();
    features.push({
      type: 'Feature',
      id: get('featureId'),
      geometry,
      properties: {
        ...userAttrs,
        kind: get('kind'),
        layerId: get('layerId'),
        name: e.name,
        style: get('style'),
      },
    });
  });
  return { type: 'FeatureCollection', features };
}

// 最小 KML 实现：Point / LineString / Polygon
function coordsToKmlTuple(coords, is3D) {
  return coords.map((c) => {
    if (is3D) return `${c[0]},${c[1]},${c[2]}`;
    return `${c[0]},${c[1]}`;
  }).join(' ');
}

export function toKML(dataSource) {
  if (!dataSource) return '<kml xmlns="http://www.opengis.net/kml/2.2"></kml>';
  const placemarks = [];
  dataSource.entities.values.forEach((e) => {
    if (e.id === '__draft__') return;
    const props = e.properties;
    if (!props) return;
    const get = (k) => (props[k] && props[k].getValue ? props[k].getValue() : props[k]);
    if (get('kind') === 'draft') return;
    if (get('kind') === '__measurement__') return;
    const name = (e.name || get('kind') || 'feature').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
    const geom = entityToGeometry(e);
    if (!geom) return;
    let inner = '';
    if (geom.type === 'Point') {
      inner = `<Point><coordinates>${coordsToKmlTuple([geom.coordinates], geom.coordinates.length > 2)}</coordinates></Point>`;
    } else if (geom.type === 'LineString') {
      inner = `<LineString><coordinates>${coordsToKmlTuple(geom.coordinates, geom.coordinates[0] && geom.coordinates[0].length > 2)}</coordinates></LineString>`;
    } else if (geom.type === 'Polygon') {
      const ring = geom.coordinates[0];
      const is3D = ring[0] && ring[0].length > 2;
      inner = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordsToKmlTuple(ring, is3D)}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
    }
    placemarks.push(`<Placemark><name><![CDATA[${name}]]></name>${inner}</Placemark>`);
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n${placemarks.join('\n')}\n</kml>`;
}

// 触发下载（参考 AiSidePanel.jsx:659-667）
export function downloadFile(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 下载 dataURL（如截图）
export function downloadDataURL(filename, dataUrl) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ===== 阶段 2B · 打印 / 导出 =====

// PNG 导出：直接拿 Cesium viewer.scene.canvas 的 toDataURL
// 必须先 scene.render() 确保最新帧；toDataURL 默认 'image/png'。
// 返回 dataURL 字符串；调用方负责 downloadDataURL。
export function snapshotPng(viewer, opts = {}) {
  if (!viewer || !viewer.scene || !viewer.scene.canvas) return null;
  const { width, height, backgroundColor } = opts;
  try {
    viewer.scene.render();
    const canvas = viewer.scene.canvas;
    if (typeof width === 'number' && typeof height === 'number' && (canvas.width !== width || canvas.height !== height)) {
      // 输出 canvas 与原 canvas 不同尺寸时，新建离屏 canvas 缩放
      const off = document.createElement('canvas');
      off.width = width; off.height = height;
      const ctx = off.getContext('2d');
      if (backgroundColor) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(canvas, 0, 0, width, height);
      return off.toDataURL('image/png');
    }
    if (backgroundColor) {
      // 在原 canvas 上铺一层背景（不破坏原内容，因为 drawImage 透明叠加）
      const off = document.createElement('canvas');
      off.width = canvas.width; off.height = canvas.height;
      const ctx = off.getContext('2d');
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(canvas, 0, 0);
      return off.toDataURL('image/png');
    }
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.error('snapshotPng 失败', e);
    return null;
  }
}

// 打印（PDF 替代方案）
// 浏览器原生 window.print() + print-css（styles.css 里 .print-export-* 规则）。
// 在新弹窗里渲染一个简单的 layout：标题 + 截图 + 要素清单（toGeoJSON 缩略）。
// 不引入新依赖（避免 jsPDF），用户可在打印对话框里选"另存为 PDF"。
export function exportPdf(viewer, dataSource, opts = {}) {
  const png = snapshotPng(viewer, opts);
  if (!png) {
    return { ok: false, error: '截图失败' };
  }
  const gj = toGeoJSON(dataSource);
  const summary = gj.features.map((f) => ({
    id: f.id || '',
    kind: f.properties && f.properties.kind || '',
    name: f.properties && f.properties.name || '',
  }));

  const win = window.open('', '_blank');
  if (!win) {
    return { ok: false, error: '浏览器拦截了新窗口，请允许弹窗后重试' };
  }

  const title = opts.title || 'GIS 场景导出';
  const styleTags = `
    <style>
      body { font-family: -apple-system, "Helvetica Neue", "PingFang SC", sans-serif; color: #111; margin: 24px; }
      h1 { font-size: 18px; margin: 0 0 8px; }
      .meta { color: #555; font-size: 12px; margin-bottom: 12px; }
      .map-img { width: 100%; border: 1px solid #ccc; border-radius: 6px; }
      table { border-collapse: collapse; width: 100%; margin-top: 12px; font-size: 11px; }
      th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: left; }
      th { background: #f4f4f4; }
      @media print {
        body { margin: 0; }
        .no-print { display: none !important; }
        .page-break { page-break-after: always; }
      }
    </style>
  `;

  const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
${styleTags}
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">导出时间: ${new Date().toLocaleString('zh-CN')} · 要素数: ${summary.length}</div>
  <img class="map-img" src="${png}" alt="map" />
  ${summary.length > 0 ? `
  <h2>要素清单（共 ${summary.length} 个）</h2>
  <table>
    <thead><tr><th>featureId</th><th>类型</th><th>名称</th></tr></thead>
    <tbody>
      ${summary.map((s) => `<tr><td>${escapeHtml(s.id)}</td><td>${escapeHtml(s.kind)}</td><td>${escapeHtml(s.name)}</td></tr>`).join('')}
    </tbody>
  </table>
  ` : ''}
  <div class="no-print" style="margin-top:16px;">
    <button onclick="window.print()" style="padding:6px 14px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;">🖨 打印 / 另存为 PDF</button>
    <button onclick="window.close()" style="padding:6px 14px;background:#eee;border:none;border-radius:4px;cursor:pointer;margin-left:6px;">关闭</button>
  </div>
  <script>setTimeout(() => { try { window.print(); } catch (_) {} }, 400);</script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  return { ok: true, opened: true, count: summary.length };
}

// 简易 HTML escape
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 触发 GeoJSON 下载
export function downloadGeoJSON(dataSource, filename) {
  const gj = toGeoJSON(dataSource);
  const content = JSON.stringify(gj, null, 2);
  downloadFile(filename || 'export.geojson', content, 'application/geo+json');
}

// 触发 KML 下载
export function downloadKML(dataSource, filename) {
  const kml = toKML(dataSource);
  downloadFile(filename || 'export.kml', kml, 'application/vnd.google-earth.kml+xml');
}