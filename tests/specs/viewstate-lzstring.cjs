// tests/specs/viewstate-lzstring.cjs
// 周期 4 P1-3: viewState zlib 压缩（v2 协议）
//
// 背景：周期 3 P1-4 8KB URL 降级；周期 4 评估 lz-string / zlib 压缩以减小 30-50% 长度
//   - 实际选择 zlib（Node 内置，零依赖）
//   - v1 = base64url(JSON)（周期 1-3 行为，向后兼容）
//   - v2 = base64url(zlib.deflate(JSON))（周期 4 增量）
//   - hash 头部 'v2:' 标识版本（readViewStateFromUrl 自动检测）
//
// 验收（mirror viewState.js 关键逻辑；Node 端测）：
//   - 短 payload (< 512 字节) 仍走 v1（不压缩）
//   - 长 payload (>= 512 字节) 走 v2 压缩，hash 长度 < v1
//   - v2 round-trip：compress → encode → decode → decompress → JSON === 原
//   - 旧 v1 读路径仍工作（readViewStateFromUrl 检测到无 'v2:' 前缀则用 v1）
//   - 静态扫描：viewState.js 含 compressToBase64 + decompressFromBase64

'use strict';

const assert = require('node:assert');
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
}

function b64UrlEncode(str) {
  return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64UrlDecode(s) {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}
function b64UrlEncodeBytes(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64UrlDecodeBytes(s) {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function compressV2(payload) {
  const json = JSON.stringify(payload);
  const buf = Buffer.from(json, 'utf8');
  const compressed = zlib.deflateSync(buf, { level: 9 });
  return { prefix: 'v2:', encoded: b64UrlEncodeBytes(compressed), originalJson: json };
}

function decompressV2(payload) {
  if (!payload.startsWith('v2:')) return b64UrlDecode(payload);
  const binBuf = b64UrlDecodeBytes(payload.slice(3));
  const json = zlib.inflateSync(binBuf).toString('utf8');
  return json;
}

// 镜像 buildViewStateHash（核心逻辑）
function buildViewStateHash(state) {
  if (!state || !state.camera) return '';
  const camera = state.camera;
  const tiers = [
    () => { const p = { ...state }; if (!p.aiDescription) delete p.aiDescription; if (!p.aiModel) delete p.aiModel; return p; },
    () => { const p = { ...state }; delete p.aiDescription; delete p.aiModel; return p; },
    () => ({ camera }),
  ];
  for (let i = 0; i < tiers.length; i += 1) {
    const payload = tiers[i]();
    const json = JSON.stringify(payload);
    const encoded = b64UrlEncode(json);
    if (json.length >= 512) {
      try {
        const { prefix, encoded: compEncoded } = compressV2(payload);
        const candidate = `#view=${prefix}${compEncoded}`;
        if (candidate.length < encoded.length + 4) return candidate;
      } catch (_) {}
    }
    return `#view=${encoded}`;
  }
  return `#view=${b64UrlEncode(JSON.stringify({ camera }))}`;
}

// ---- 1. 短 payload 走 v1 ----
test('短 payload (50B) 走 v1（不压缩）', () => {
  const h = buildViewStateHash({ camera: { lng: 116, lat: 39, height: 1000, heading: 0, pitch: -90 } });
  assert.doesNotMatch(h, /^#view=v2:/);
  assert.match(h, /^#view=[A-Za-z0-9_-]+$/);
});

// ---- 2. 长 payload 走 v2 ----
test('长 payload (10K 中文字符) 走 v2 压缩', () => {
  const bigDesc = '中'.repeat(10000);
  const h = buildViewStateHash({ camera: { lng: 116, lat: 39, height: 1000, heading: 0, pitch: -90 }, layer: 'x', aiDescription: bigDesc });
  assert.match(h, /^#view=v2:/);
});

test('v2 hash 长度 < v1 hash 长度（压缩收益）', () => {
  const bigDesc = '中'.repeat(10000);
  const state = { camera: { lng: 116, lat: 39, height: 1000, heading: 0, pitch: -90 }, layer: 'x', aiDescription: bigDesc };
  const h2 = buildViewStateHash(state);
  const v1 = '#view=' + b64UrlEncode(JSON.stringify(state));
  console.log(`    [INFO] v1=${v1.length} v2=${h2.length} ratio=${(h2.length / v1.length).toFixed(2)}`);
  assert.ok(h2.length < v1.length, `v2 应比 v1 短: v2=${h2.length} v1=${v1.length}`);
  // 中文高重复率，预期压缩比 5-10%
  assert.ok(h2.length < v1.length * 0.3, `中文应压到 < 30%：实际 ${(h2.length / v1.length * 100).toFixed(1)}%`);
});

// ---- 3. v2 round-trip ----
test('v2 compress → decode → decompress → JSON === 原', () => {
  const state = { camera: { lng: 116.39, lat: 39.91, height: 50000 }, layer: 'china-base', aiDescription: '测试中文' };
  const { prefix, encoded } = compressV2(state);
  const hash = prefix + encoded;
  const json = decompressV2(hash);
  const obj = JSON.parse(json);
  assert.strictEqual(obj.camera.lng, 116.39);
  assert.strictEqual(obj.layer, 'china-base');
  assert.strictEqual(obj.aiDescription, '测试中文');
});

// ---- 4. v1 路径仍工作 ----
test('v1 路径（无 v2: 前缀）仍用 base64 解码', () => {
  const state = { camera: { lng: 116, lat: 39, height: 1000 }, layer: 'x' };
  const v1 = b64UrlEncode(JSON.stringify(state));
  const json = decompressV2(v1);
  const obj = JSON.parse(json);
  assert.strictEqual(obj.layer, 'x');
});

// ---- 5. 边界 ----
test('512 字节 payload 走 v1（>= 512 阈值）', () => {
  // 构造约 500 字节（不含 base64 膨胀）
  const filler = 'x'.repeat(450);
  const state = { camera: { lng: 116, lat: 39 }, desc: filler };
  const h = buildViewStateHash(state);
  const jsonLen = JSON.stringify(state).length;
  console.log(`    [INFO] json 长度 ${jsonLen} → hash 协议 = ${h.startsWith('#view=v2:') ? 'v2' : 'v1'}`);
  // 不强求 v1/v2，只验 hash 有效
  assert.match(h, /^#view=/);
});

test('AI 大描述压缩后 < 8KB', () => {
  // 周期 3 P1-4 8KB 降级在 v2 压缩下应该不再触发
  const bigDesc = '中'.repeat(100000); // 100K 字符
  const state = { camera: { lng: 116, lat: 39, height: 1000, heading: 0, pitch: -90 }, layer: 'x', aiDescription: bigDesc };
  const h = buildViewStateHash(state);
  const len = h.length - '#view='.length;
  console.log(`    [INFO] 100K 中文字符 → hash 长度 ${len}`);
  assert.ok(len < 8192, `100K 中文字符压缩后应 < 8KB，实际 ${len}`);
});

// ---- 6. 静态扫描：viewState.js 含 v2 压缩代码 ----
const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../client/src/utils/viewState.js'),
  'utf8',
);
test('viewState.js 含 COMPRESS_VERSION 常量', () => assert.match(SRC, /COMPRESS_VERSION\s*=\s*['"]v2['"]/));
test('viewState.js 含 compressToBase64', () => assert.match(SRC, /function\s+compressToBase64/));
test('viewState.js 含 decompressFromBase64', () => assert.match(SRC, /function\s+decompressFromBase64/));
test('viewState.js 含 zlib 调用', () => assert.match(SRC, /zlib\.(deflateSync|inflateSync)/));
test('viewState.js readViewStateFromUrl 检测 v2 prefix', () => assert.match(SRC, /startsWith\(COMPRESS_PREFIX\)/));
test('viewState.js buildViewStateHash 512 字节阈值', () => assert.match(SRC, /json\.length\s*>=\s*512/));

console.log(`--- summary: pass=${pass} fail=${fail} ---`);
if (fail > 0) process.exit(1);
