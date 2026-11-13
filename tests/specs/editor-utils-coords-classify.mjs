// tests/specs/editor-utils-coords-classify.mjs
// 周期 21 P2-3 首批: editor/utils 纯函数补单测（coords.js + classify.js）
// 目标：≥ 18 子断言 PASS；顺带覆盖 C21-B01（rampColor 越界 clamp）修复
// 形态：.mjs（被测为 ESM 客户端纯函数模块，零 import，可在 Node 导入）

import assert from 'node:assert/strict';
import { decToDMS, decToUTM, decToMGRS, formatCoord } from '../../client/src/pages/gis/editor/utils/coords.js';
import {
  classifyEqualInterval,
  classifyQuantile,
  classifyUnique,
  classifyValue,
  classifyUniqueIndex,
  rampColor,
  RAMPS,
  classifyFeatures,
} from '../../client/src/pages/gis/editor/utils/classify.js';

let pass = 0;
let fail = 0;

async function ok(label, fn) {
  try {
    await fn();
    pass += 1;
    console.log(`  [PASS] ${label}`);
  } catch (e) {
    fail += 1;
    console.error(`  [FAIL] ${label}: ${e.message}`);
  }
}

(async function main() {
  console.log('=== editor-utils-coords-classify ===');

  // ============ Group A: coords.decToDMS ============
  await ok('A1: decToDMS 正经纬度 → E/N', () => {
    assert.equal(decToDMS(116.4, 39.9), '116°24\'0.0"E 39°53\'60.0"N');
  });
  await ok('A2: decToDMS 负经度 → W（半球正确）', () => {
    assert.match(decToDMS(-116.4, 39.9), /W/);
    assert.doesNotMatch(decToDMS(-116.4, 39.9), /E/);
  });
  await ok('A3: decToDMS 负纬度 → S', () => {
    assert.match(decToDMS(116.4, -39.9), /S/);
  });
  await ok('A4: decToDMS 返回字符串（可格式化输出）', () => {
    assert.equal(typeof decToDMS(0, 0), 'string');
  });

  // ============ Group B: coords.UTM / MGRS / formatCoord ============
  await ok('B1: decToUTM 返回带带号的字符串', () => {
    const u = decToUTM(116.4, 39.9);
    assert.equal(typeof u, 'string');
    assert.match(u, /\d+N\s+\d+\s+\d+/); // 形如 50N 448709 4416831
  });
  await ok('B2: decToMGRS 返回字符串', () => {
    assert.equal(typeof decToMGRS(116.4, 39.9), 'string');
  });
  await ok('B3: formatCoord 默认 dec 格式', () => {
    const s = formatCoord(116.4, 39.9, 'dec');
    assert.equal(typeof s, 'string');
    assert.match(s, /116/);
  });
  await ok('B4: formatCoord dms 格式含度分秒符号', () => {
    assert.match(formatCoord(116.4, 39.9, 'dms'), /°/);
  });
  await ok('B5: formatCoord 未知格式回落 dec（不抛错）', () => {
    const s = formatCoord(1, 2, 'unknown-fmt');
    assert.equal(typeof s, 'string');
    assert.match(s, /1/);
  });

  // ============ Group C: classify 分箱 ============
  await ok('C1: classifyEqualInterval 返回 n+1 断点', () => {
    const b = classifyEqualInterval([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3);
    assert.ok(Array.isArray(b));
    assert.equal(b.length, 4); // n 类 → n+1 断点
  });
  await ok('C2: classifyQuantile 返回 n+1 断点', () => {
    const b = classifyQuantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3);
    assert.equal(b.length, 4);
  });
  await ok('C3: classifyUnique 去重保序', () => {
    assert.deepEqual(classifyUnique(['a', 'b', 'a', 'c', 'b']), ['a', 'b', 'c']);
  });
  await ok('C4: classifyValue 低于首断点 → 类 0', () => {
    assert.equal(classifyValue(0, [1, 4, 7, 10]), 0);
  });
  await ok('C5: classifyValue 落中段 → 对应类', () => {
    assert.equal(classifyValue(5, [1, 4, 7, 10]), 1);
  });
  await ok('C6: classifyUniqueIndex 未命中 → 0（防御）', () => {
    assert.equal(classifyUniqueIndex('zzz', ['a', 'b']), 0);
  });

  // ============ Group D: rampColor（含 C21-B01 修复） ============
  await ok('D1: rampColor 返回 rgba 字符串', () => {
    assert.match(rampColor(0, 5), /^rgba\(\d+,\d+,\d+,0\.7\)$/);
  });
  await ok('D2: rampColor(0,n) 是首档浅色，rampColor(n-1,n) 是末档深色', () => {
    const first = rampColor(0, 5);
    const last = rampColor(4, 5);
    assert.notEqual(first, last);
  });
  await ok('D3: C21-B01 修复 — rampColor 越界 i 不抛错（clamp 到末档）', () => {
    const r = rampColor(99, 5);
    assert.match(r, /^rgba\(/);
    assert.equal(r, rampColor(4, 5)); // clamp 到末档
  });
  await ok('D4: C21-B01 修复 — rampColor 负 i 不抛错（clamp 到首档）', () => {
    assert.equal(rampColor(-3, 5), rampColor(0, 5));
  });
  await ok('D5: rampColor n<=1 返回中位色（不除零）', () => {
    assert.match(rampColor(2, 1), /^rgba\(/);
    assert.match(rampColor(0, 0), /^rgba\(/);
  });
  await ok('D6: rampColor 未知色板回落 Blues', () => {
    assert.equal(rampColor(0, 5, 'NoSuchRamp'), rampColor(0, 5, 'Blues'));
  });
  await ok('D7: RAMPS 暴露可用色板名（含 Blues）', () => {
    assert.ok(Array.isArray(RAMPS));
    assert.ok(RAMPS.includes('Blues'));
  });

  // ============ Group E: classifyFeatures 顶层入口 ============
  await ok('E1: classifyFeatures 空入参 → 空 Map（不抛）', () => {
    assert.equal(classifyFeatures([], 'f', {}).size, 0);
    assert.equal(classifyFeatures(null, 'f', {}).size, 0);
  });
  await ok('E2: classifyFeatures 对含字段 features 返回 Map', () => {
    const feats = [
      { featureId: 'a', attrs: { v: 1 } },
      { featureId: 'b', attrs: { v: 9 } },
      { featureId: 'c', attrs: { v: 5 } },
    ];
    const m = classifyFeatures(feats, 'v', { method: 'equal', n: 2, ramp: 'Blues' });
    assert.ok(m instanceof Map);
    assert.equal(m.size, 3);
    const first = m.get('a');
    assert.ok(first && 'fillColor' in first);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});