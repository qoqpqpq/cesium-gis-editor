// tests/specs/spatial-dissolve-single-layer.cjs
// 周期 1 P0-1: spatial.dissolve 允许只传 layerA（不再强制 layerB）
//
// 用例：
//   1) 只传 layerA → 200，返回的 FeatureCollection 至少 1 个 feature（多边形 union）
//   2) 不传 layerA → 400
//   3) 双 layer（layerA + layerB）继续可用，向后兼容

'use strict';

const http = require('http');

const SERVER = process.env.SERVER_URL || 'http://localhost:3001';

function httpJson(method, p, body, timeoutMs = 12000) {
  const u = new URL(p, SERVER);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname + u.search,
        method,
        headers: { 'Content-Type': 'application/json' },
        timeout: timeoutMs,
      },
      (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { buf += c; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(buf); } catch (_) { /* keep null */ }
          resolve({ status: res.statusCode || 0, json, raw: buf });
        });
      }
    );
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    if (body != null) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

const square = (x0, y0, x1, y1) => ({
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
  },
});

async function main() {
  const layerA = { type: 'FeatureCollection', features: [square(0, 0, 2, 2), square(1, 1, 3, 3)] };

  // 1) 单层
  {
    const r = await httpJson('POST', '/api/spatial/dissolve', { layerA }, 15000);
    // turf.union 在"两多边形相交"时返 Feature；不相交或更多要素时也返 Feature
    // 关键：返回类型应是合法 GeoJSON 对象（type 存在），且有 geometry 或 features 之一
    const data = r.json && r.json.data;
    const hasGeom = data && (data.type === 'Feature' || data.type === 'FeatureCollection');
    const ok = r.status === 200 && r.json && r.json.success === true && hasGeom;
    const shape = data && (data.type || '?') + (data.features ? `(${data.features.length})` : (data.geometry ? `(${data.geometry.type})` : ''));
    process.stdout.write(`  [${ok ? 'PASS' : 'FAIL'}] 单层 dissolve (layerA only) — status=${r.status} shape=${shape}\n`);
    if (!ok) process.exit(1);
  }

  // 2) 缺 layerA
  {
    const r = await httpJson('POST', '/api/spatial/dissolve', {}, 5000);
    const ok = r.status === 400 && r.json && r.json.success === false;
    process.stdout.write(`  [${ok ? 'PASS' : 'FAIL'}] 缺 layerA → 400 — status=${r.status} msg=${r.json && r.json.message}\n`);
    if (!ok) process.exit(1);
  }

  // 3) 双层（向后兼容）
  {
    const layerB = { type: 'FeatureCollection', features: [square(5, 5, 7, 7)] };
    const r = await httpJson('POST', '/api/spatial/dissolve', { layerA, layerB }, 15000);
    const data = r.json && r.json.data;
    const hasGeom = data && (data.type === 'Feature' || data.type === 'FeatureCollection');
    const ok = r.status === 200 && r.json && r.json.success === true && hasGeom;
    const shape = data && (data.type || '?') + (data.features ? `(${data.features.length})` : (data.geometry ? `(${data.geometry.type})` : ''));
    process.stdout.write(`  [${ok ? 'PASS' : 'FAIL'}] 双层 dissolve (向后兼容) — status=${r.status} shape=${shape}\n`);
    if (!ok) process.exit(1);
  }

  process.stdout.write('--- spec spatial-dissolve-single-layer: 3/3 PASS ---\n');
}

main().catch((e) => { process.stderr.write(`fatal: ${e && e.message}\n`); process.exit(2); });
