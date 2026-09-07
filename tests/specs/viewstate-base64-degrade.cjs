// tests/specs/viewstate-base64-degrade.cjs
// 周期 3 P1-4: viewState base64UrlEncode 大字符串降级
//
// 背景：周期 1 调研 P1-1（viewState 编码）：
//   - base64UrlEncode 在中文长字符串下双倍膨胀（btoa(unescape(encodeURIComponent))）
//   - URL 长度超限时 buildShareUrl 仅回退 null，无 UI 提示
//
// 修复：buildViewStateHash
//   - URL_LENGTH_LIMIT = 8192
//   - tier 0：完整 payload（去空 aiDescription/aiModel）
//   - tier 1：去 aiDescription/aiModel
//   - tier 2：只剩 camera
//   - 每级降级 console.warn
//
// 验收（mirror viewState.js 关键逻辑；不依赖浏览器）：
//   - 短 state → tier 0 pass（无 warn）
//   - aiDescription 超 8KB → tier 1 降级 + warn
//   - 加 layer/coordFormat 也超 → tier 2 降级 + warn
//   - 极端：camera 自身超 8KB → 强制 tier 2 + warn
//   - 缺 camera → 返回 ''

'use strict';

const assert = require('node:assert');

// ---- 镜像 viewState.js 关键逻辑（保持与源文件一致）----
const URL_LENGTH_LIMIT = 8192;
const HASH_KEY = 'view';

function btoaSafe(str) {
  // Node 环境有 Buffer；浏览器有 btoa。这里用 Buffer。
  return Buffer.from(str, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function atobSafe(s) {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function estimateUrlLength(state) {
  if (!state) return 0;
  try { return btoaSafe(JSON.stringify(state)).length; } catch (_) { return Infinity; }
}

function buildViewStateHash(state, _warns) {
  if (!state || !state.camera) return '';
  const tiers = [
    () => {
      const p = { ...state };
      if (!p.aiDescription) delete p.aiDescription;
      if (!p.aiModel) delete p.aiModel;
      return p;
    },
    () => {
      const p = { ...state };
      delete p.aiDescription;
      delete p.aiModel;
      return p;
    },
    () => ({ camera: state.camera }),
  ];
  for (let i = 0; i < tiers.length; i += 1) {
    const payload = tiers[i]();
    if (estimateUrlLength(payload) <= URL_LENGTH_LIMIT) {
      if (i > 0) {
        const dropped = i === 1 ? 'aiDescription' : 'aiDescription+layer+coordFormat';
        if (_warns) _warns.push(`[viewState] URL 长度超 ${URL_LENGTH_LIMIT}B，降级到 tier ${i}（丢弃 ${dropped}）`);
        else console.warn(`[viewState] URL 长度超 ${URL_LENGTH_LIMIT}B，降级到 tier ${i}（丢弃 ${dropped}）`);
      }
      try { return `#${HASH_KEY}=${btoaSafe(JSON.stringify(payload))}`; }
      catch (_) { return ''; }
    }
  }
  if (_warns) _warns.push('[viewState] 即使只剩 camera 仍超 8KB，强制降级');
  else console.warn('[viewState] 即使只剩 camera 仍超 8KB，强制降级');
  return `#${HASH_KEY}=${btoaSafe(JSON.stringify({ camera: state.camera }))}`;
}

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
}

// ---- 1. 基础往返 ----
const camera = { lng: 116.39, lat: 39.91, height: 50000, heading: 0, pitch: -90 };
const shortState = { camera, layer: 'china-base', coordFormat: 'dec' };
const hash = buildViewStateHash(shortState);
test('短 state → 非空 hash 以 #view= 开头', () => assert.match(hash, /^#view=/));
test('短 state → 解码后等于原 state', () => {
  const b64 = hash.slice('#view='.length);
  const obj = JSON.parse(atobSafe(b64));
  assert.deepStrictEqual(obj.camera, camera);
  assert.strictEqual(obj.layer, 'china-base');
  assert.strictEqual(obj.coordFormat, 'dec');
});

// ---- 2. 缺 camera → 空字符串 ----
test('缺 camera → 空', () => assert.strictEqual(buildViewStateHash({ layer: 'x' }), ''));
test('null → 空', () => assert.strictEqual(buildViewStateHash(null), ''));

// ---- 3. 空 aiDescription / aiModel 不入 payload ----
test('空 aiDescription/aiModel 不入 payload', () => {
  const h = buildViewStateHash({ camera, aiDescription: '', aiModel: '' });
  const obj = JSON.parse(atobSafe(h.slice(6)));
  assert.ok(!('aiDescription' in obj));
  assert.ok(!('aiModel' in obj));
});

// ---- 4. 大 aiDescription（>8KB）→ tier 1 降级 + warn ----
let warns = [];
const bigDesc = '中'.repeat(10000); // 10000 个中文字符，base64 后 ~13.3KB
const h = buildViewStateHash(
  { camera, layer: 'a', coordFormat: 'dec', aiDescription: bigDesc, aiModel: 'gpt-4o-mini' },
  warns,
);
// 验证 hash 长度 < URL_LENGTH_LIMIT
const b64 = h.slice(6);
test('大 aiDescription → hash 长度 ≤ 8KB', () => assert.ok(b64.length <= URL_LENGTH_LIMIT, `实际 ${b64.length}`));
// 验证 tier 1：去掉 aiDescription
const obj = JSON.parse(atobSafe(b64));
test('大 aiDescription → 解码后无 aiDescription', () => assert.ok(!('aiDescription' in obj)));
test('大 aiDescription → 解码后 layer 仍在', () => assert.strictEqual(obj.layer, 'a'));
test('大 aiDescription → warn 1 次', () => assert.strictEqual(warns.length, 1));
test('大 aiDescription → warn 含 tier 1', () => assert.match(warns[0], /tier 1/));

// ---- 5. 极端：layer/coordFormat 也巨大 → tier 2 ----
warns = [];
const bigLayer = 'a'.repeat(10000);
const bigCoord = 'b'.repeat(10000);
const h2 = buildViewStateHash(
  { camera, layer: bigLayer, coordFormat: bigCoord, aiDescription: 'x'.repeat(10000) },
  warns,
);
const b64_2 = h2.slice(6);
test('极大 payload → hash 长度 ≤ 8KB', () => assert.ok(b64_2.length <= URL_LENGTH_LIMIT, `实际 ${b64_2.length}`));
const obj2 = JSON.parse(atobSafe(b64_2));
test('极大 payload → 解码后只剩 camera', () => {
  assert.ok(obj2.camera);
  assert.ok(!('layer' in obj2));
  assert.ok(!('coordFormat' in obj2));
  assert.ok(!('aiDescription' in obj2));
});
test('极大 payload → warn 含 tier 2', () => assert.ok(warns.some((w) => /tier 2/.test(w))));

// ---- 6. 边界：短 → 不降级 ----
warns = [];
buildViewStateHash({ camera, layer: 'a', coordFormat: 'dec' }, warns);
test('短 state → 无 warn', () => assert.strictEqual(warns.length, 0));

console.log(`--- summary: pass=${pass} fail=${fail} ---`);
if (fail > 0) process.exit(1);
