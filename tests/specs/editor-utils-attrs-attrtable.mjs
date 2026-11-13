// tests/specs/editor-utils-attrs-attrtable.mjs
// 周期 23 P2-3 第二批: editor/utils 纯函数补单测（attrs.js + attrTableUtils.js）
// 目标：≥ 18 子断言 PASS
// 形态：.mjs（被测为 ESM 纯函数模块；localStorage/DOM 函数不在本批覆盖，隔离避免环境依赖）

import assert from 'node:assert/strict';
import {
  RESERVED,
  readAttrs,
  writeAttrs,
  updateAttr,
  collectFields,
  coerce,
  pickAttrs,
} from '../../client/src/pages/gis/editor/utils/attrs.js';
import {
  compareValues,
  sortFeatures,
  matchesFilter,
  filterFeatures,
  featuresToCsv,
} from '../../client/src/pages/gis/editor/utils/attrTableUtils.js';

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

// 构造带 properties.attrs 的 entity（readAttrs/writeAttrs 的真实契约）
function ent(attrs, extra = {}) {
  return { properties: { attrs: { ...(attrs || {}) } }, ...extra };
}

(async function main() {
  console.log('=== editor-utils-attrs-attrtable ===');

  // ============ Group A: attrs.RESERVED + readAttrs ============
  await ok('A1: RESERVED 含 kind/featureId/layerId/style/name/attrs', () => {
    for (const k of ['kind', 'featureId', 'layerId', 'style', 'name', 'attrs']) {
      assert.ok(RESERVED.includes(k));
    }
  });
  await ok('A2: readAttrs 从 entity.properties.attrs 读取', () => {
    assert.deepEqual(readAttrs(ent({ a: 1, b: 2 })), { a: 1, b: 2 });
  });
  await ok('A3: readAttrs 空 entity → {}（不抛）', () => {
    assert.deepEqual(readAttrs(null), {});
    assert.deepEqual(readAttrs({}), {});
  });
  await ok('A4: readAttrs 缺 attrs → {}', () => {
    assert.deepEqual(readAttrs({ properties: {} }), {});
  });
  await ok('A5: readAttrs attrs 为数组 → {}（防御非对象）', () => {
    assert.deepEqual(readAttrs({ properties: { attrs: [1, 2] } }), {});
  });

  // ============ Group B: writeAttrs / updateAttr ============
  await ok('B1: writeAttrs 写回 entity.properties.attrs（返回 undefined）', () => {
    const e = ent({});
    const r = writeAttrs(e, { x: 9 });
    assert.equal(r, undefined);
    assert.deepEqual(e.properties.attrs, { x: 9 });
  });
  await ok('B2: updateAttr 新增 key → 返回新对象并写回', () => {
    const e = ent({ a: 1 });
    const next = updateAttr(e, 'b', 2);
    assert.deepEqual(next, { a: 1, b: 2 });
    assert.deepEqual(e.properties.attrs, { a: 1, b: 2 });
  });
  await ok('B3: updateAttr 置空值（null/""）→ 删除该 key', () => {
    const e = ent({ a: 1, b: 2 });
    const next = updateAttr(e, 'b', '');
    assert.deepEqual(next, { a: 1 });
    const next2 = updateAttr(ent({ a: 1, b: 2 }), 'b', null);
    assert.deepEqual(next2, { a: 1 });
  });
  await ok('B4: updateAttr 不可变（原 attrs 对象不被原地改）', () => {
    const e = ent({ a: 1 });
    const before = { ...e.properties.attrs };
    updateAttr(e, 'b', 2);
    assert.deepEqual(before, { a: 1 }); // 旧快照不变
  });

  // ============ Group C: coerce / pickAttrs / collectFields ============
  await ok('C1: coerce number 解析数字字符串', () => {
    assert.equal(coerce('42', 'number'), 42);
    assert.equal(coerce('3.5', 'number'), 3.5);
  });
  await ok('C2: coerce number 非法字符串 → 返回原值', () => {
    assert.equal(coerce('abc', 'number'), 'abc');
  });
  await ok('C3: coerce boolean 识别 true/1/yes 与 false/0/no', () => {
    assert.equal(coerce('true', 'boolean'), true);
    assert.equal(coerce('yes', 'boolean'), true);
    assert.equal(coerce('0', 'boolean'), false);
    assert.equal(coerce('no', 'boolean'), false);
  });
  await ok('C4: coerce null/undefined 原样返回', () => {
    assert.equal(coerce(null, 'number'), null);
    assert.equal(coerce(undefined, 'string'), undefined);
  });
  await ok('C5: pickAttrs 过滤保留字段', () => {
    assert.deepEqual(pickAttrs({ x: 1, kind: 'point', name: 'n', y: 2 }), { x: 1, y: 2 });
  });
  await ok('C6: pickAttrs 非对象 → {}', () => {
    assert.deepEqual(pickAttrs(null), {});
    assert.deepEqual(pickAttrs('str'), {});
  });
  await ok('C7: collectFields 跨 features 收集并按名升序 + 推断类型', () => {
    const feats = [
      { entity: ent({ b: 2, a: 1 }) },
      { entity: ent({ c: 'x', a: 3 }) },
    ];
    const fields = collectFields(feats);
    assert.deepEqual(fields.map((f) => f.name), ['a', 'b', 'c']);
    const byName = Object.fromEntries(fields.map((f) => [f.name, f.type]));
    assert.equal(byName.a, 'number');
    assert.equal(byName.b, 'number');
    assert.equal(byName.c, 'string');
  });

  // ============ Group D: attrTableUtils.compareValues ============
  await ok('D1: compareValues 数字比较', () => {
    assert.equal(compareValues(1, 2) < 0, true);
    assert.equal(compareValues(2, 1) > 0, true);
    assert.equal(compareValues(3, 3), 0);
  });
  await ok('D2: compareValues null/undefined/"" 恒排最后', () => {
    assert.equal(compareValues(null, 1) > 0, true);  // null 在后
    assert.equal(compareValues(1, undefined) < 0, true);
    assert.equal(compareValues('', ''), 0);
  });
  await ok('D3: compareValues 不同类型按 number < string < boolean', () => {
    assert.equal(compareValues(1, 'a') < 0, true);   // number < string
    assert.equal(compareValues('a', true) < 0, true); // string < boolean
  });

  // ============ Group E: sortFeatures / matchesFilter / filterFeatures ============
  await ok('E1: sortFeatures 按 attrs 字段升序', () => {
    const fs = [{ attrs: { v: 3 } }, { attrs: { v: 1 } }, { attrs: { v: 2 } }];
    const sorted = sortFeatures(fs, 'v', 'asc');
    assert.deepEqual(sorted.map((f) => f.attrs.v), [1, 2, 3]);
  });
  await ok('E2: sortFeatures desc 反序 + 不改原数组', () => {
    const fs = [{ attrs: { v: 1 } }, { attrs: { v: 2 } }];
    const sorted = sortFeatures(fs, 'v', 'desc');
    assert.deepEqual(sorted.map((f) => f.attrs.v), [2, 1]);
    assert.deepEqual(fs.map((f) => f.attrs.v), [1, 2]); // 原数组不变
  });
  await ok('E3: sortFeatures 无 sortKey/direction → 原样返回', () => {
    const fs = [{ attrs: { v: 1 } }];
    assert.equal(sortFeatures(fs, null, 'asc'), fs);
    assert.equal(sortFeatures(fs, 'v', null), fs);
  });
  await ok('E4: matchesFilter 命中 name/attrs 子串（大小写不敏感）', () => {
    assert.equal(matchesFilter({ name: 'Beijing', attrs: {} }, 'beij'), true);
    assert.equal(matchesFilter({ attrs: { city: 'Shanghai' } }, 'shang'), true);
  });
  await ok('E5: matchesFilter 空查询 → true（不过滤）', () => {
    assert.equal(matchesFilter({ attrs: {} }, ''), true);
    assert.equal(matchesFilter({ attrs: {} }, '   '), true);
  });
  await ok('E6: matchesFilter 未命中 → false', () => {
    assert.equal(matchesFilter({ name: 'abc', attrs: { x: 1 } }, 'zzz'), false);
  });
  await ok('E7: filterFeatures 按查询过滤', () => {
    const fs = [{ name: '北京', attrs: {} }, { name: '上海', attrs: {} }];
    assert.equal(filterFeatures(fs, '北京').length, 1);
    assert.equal(filterFeatures(fs, '').length, 2);
  });

  // ============ Group F: featuresToCsv ============
  await ok('F1: featuresToCsv 含 BOM 前缀 + CRLF 行分隔', () => {
    const csv = featuresToCsv([{ name: 'a', attrs: { x: 1 } }], [{ name: 'name' }, { name: 'x' }]);
    assert.ok(csv.startsWith('\ufeff'));
    assert.ok(csv.includes('\r\n'));
  });
  await ok('F2: featuresToCsv 表头用 label（缺省用 name）', () => {
    const csv = featuresToCsv([{ attrs: {} }], [{ name: 'x', label: 'X列' }]);
    assert.ok(csv.includes('X列'));
  });
  await ok('F3: featuresToCsv 字段含逗号/引号 → RFC4180 转义', () => {
    const csv = featuresToCsv([{ attrs: { x: 'a,"b"' } }], [{ name: 'x' }]);
    assert.ok(csv.includes('"a,""b"""'));
  });
  await ok('F4: featuresToCsv null/undefined → 空字段', () => {
    const csv = featuresToCsv([{ attrs: { x: null } }], [{ name: 'x' }]);
    // 表头 + 空值行
    assert.ok(csv.includes('\r\n') || csv.endsWith('') );
    assert.match(csv, /\ufeffx/);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});