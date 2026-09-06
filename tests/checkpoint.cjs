// tests/checkpoint.cjs
// 周期检查点（轻量探活 + schema smoke）
// 行为：
//   - 默认运行：仅返回报告（不 fail），便于周期主调度随时取数
//   --report-only: 强制只报告（不基于 exit code 失败）
//   --strict: 任何 FAIL → exit 1（CI 或单次强校验时用）
//
// 检查覆盖：
//   1) 后端 /api/health 可达
//   2) /api/gis/config schema
//   3) /api/ai/platforms 返回至少 1 个平台
//   4) /api/ai/system-prompts 列表与单条
//   5) /api/spatial/centroid（单 layer，OK 用例）：基本 GeoJSON 能跑通
//   6) /api/spatial/buffer：基本 buffer
//   7) /api/spatial/centroid 缺 layer → 400
//   8) /api/ai/agent 缺 body → 400
//   9) 关键 server 模块 require 不抛（内部一致性）

'use strict';

const http = require('http');
const path = require('path');

const SERVER = process.env.SERVER_URL || 'http://localhost:3001';
const STRICT = process.argv.includes('--strict');
const REPORT_ONLY = process.argv.includes('--report-only') || !STRICT;

const results = [];
let fails = 0;
let passes = 0;

function record(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  if (ok) passes += 1; else fails += 1;
  const tag = ok ? 'PASS' : 'FAIL';
  process.stdout.write(`  [${tag}] ${name}${detail ? ' — ' + detail : ''}\n`);
}

function httpJson(method, p, body, timeoutMs = 8000) {
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

async function check(label, fn) {
  try {
    const r = await fn();
    record(label, r.ok, r.detail);
  } catch (e) {
    record(label, false, e && e.message ? e.message : String(e));
  }
}

// --- 1) health ---
async function checkHealth() {
  const r = await httpJson('GET', '/api/health', null, 5000);
  const ok = r.status === 200 && r.json && r.json.success === true;
  return { ok, detail: ok ? `env=${r.json.data.env}` : `status=${r.status}` };
}

// --- 2) gis config schema ---
async function checkGisConfig() {
  const r = await httpJson('GET', '/api/gis/config', null, 5000);
  const data = r.json && r.json.data;
  const ok = r.status === 200 && data && data.cesiumIon && data.tianDitu
    && typeof data.cesiumIon.enabled === 'boolean'
    && typeof data.tianDitu.enabled === 'boolean';
  return { ok, detail: ok ? `cesium=${data.cesiumIon.enabled} tdt=${data.tianDitu.enabled}` : `status=${r.status}` };
}

// --- 3) ai platforms ---
async function checkPlatforms() {
  const r = await httpJson('GET', '/api/ai/platforms', null, 5000);
  const list = r.json && r.json.data;
  const ok = r.status === 200 && Array.isArray(list) && list.length > 0;
  return { ok, detail: ok ? `count=${list.length}` : `status=${r.status}` };
}

// --- 4) system prompts ---
async function checkSystemPrompts() {
  const r = await httpJson('GET', '/api/ai/system-prompts', null, 5000);
  const data = r.json && r.json.data;
  const ok = r.status === 200 && Array.isArray(data) && data.length > 0;
  if (!ok) return { ok, detail: `status=${r.status}` };
  const r2 = await httpJson('GET', `/api/ai/system-prompts/${encodeURIComponent(data[0])}`, null, 5000);
  const ok2 = r2.status === 200 && r2.json && typeof r2.json.data && r2.json.data.prompt && r2.json.data.prompt.length > 10;
  return { ok: ok && ok2, detail: ok2 ? `scope=${data[0]} len=${r2.json.data.prompt.length}` : 'single-prompt-failed' };
}

// --- 5) spatial centroid OK ---
async function checkCentroid() {
  const layer = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] } },
    ],
  };
  const r = await httpJson('POST', '/api/spatial/centroid', { layer }, 10000);
  const ok = r.status === 200 && r.json && r.json.success === true && Array.isArray(r.json.data.features) && r.json.data.features.length === 1;
  return { ok, detail: ok ? `centroid_features=${r.json.data.features.length}` : `status=${r.status} msg=${r.json && r.json.message}` };
}

// --- 6) spatial buffer ---
async function checkBuffer() {
  const layer = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [120, 30] } },
    ],
  };
  const r = await httpJson('POST', '/api/spatial/buffer', { layer, distance: 1000 }, 10000);
  const ok = r.status === 200 && r.json && r.json.success === true;
  return { ok, detail: ok ? `ok` : `status=${r.status} msg=${r.json && r.json.message}` };
}

// --- 7) spatial centroid 缺 layer → 400 ---
async function checkCentroidMissing() {
  const r = await httpJson('POST', '/api/spatial/centroid', {}, 5000);
  const ok = r.status === 400 && r.json && r.json.success === false;
  return { ok, detail: ok ? 'reject=400' : `status=${r.status}` };
}

// --- 8) ai agent 缺 body → 400 ---
async function checkAgentMissing() {
  const r = await httpJson('POST', '/api/ai/agent', {}, 5000);
  const ok = r.status === 400 && r.json && r.json.success === false;
  return { ok, detail: ok ? 'reject=400' : `status=${r.status}` };
}

// --- 9) 模块 require 一致性 ---
async function checkModuleLoads() {
  const root = path.resolve(__dirname, '..');
  const mods = [
    './server/services/ai.js',
    './server/services/spatial.js',
    './server/services/ai-prompts.js',
    './server/middleware/rateLimit.js',
    './server/middleware/aiConcurrency.js',
    './server/agent/protocol/parse.js',
    './server/agent/protocol/format.js',
    './server/utils/redact.js',
  ];
  const fails = [];
  for (const m of mods) {
    try {
      require(path.join(root, m));
    } catch (e) {
      fails.push(`${m}: ${e.message}`);
    }
  }
  return { ok: fails.length === 0, detail: fails.length ? fails.join(' | ') : `loaded=${mods.length}` };
}

async function main() {
  process.stdout.write(`\n=== checkpoint @ ${SERVER} (report-only=${REPORT_ONLY}, strict=${STRICT}) ===\n`);
  await check('1) /api/health', checkHealth);
  await check('2) /api/gis/config', checkGisConfig);
  await check('3) /api/ai/platforms', checkPlatforms);
  await check('4) /api/ai/system-prompts', checkSystemPrompts);
  await check('5) /api/spatial/centroid OK', checkCentroid);
  await check('6) /api/spatial/buffer OK', checkBuffer);
  await check('7) /api/spatial/centroid 缺 layer', checkCentroidMissing);
  await check('8) /api/ai/agent 缺 body', checkAgentMissing);
  await check('9) server modules require', checkModuleLoads);
  process.stdout.write(`\n--- summary: pass=${passes} fail=${fails} ---\n`);
  if (!REPORT_ONLY && fails > 0) process.exit(1);
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e && e.message}\n`);
  if (!REPORT_ONLY) process.exit(2);
});
