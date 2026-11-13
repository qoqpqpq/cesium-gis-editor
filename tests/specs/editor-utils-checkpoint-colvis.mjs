// tests/specs/editor-utils-checkpoint-colvis.mjs
// 周期 24 P2-3 第三批: editor/utils checkpoint + 列显隐 纯逻辑补单测
// 目标：≥ 18 子断言 PASS
// 形态：.mjs；注入全局 localStorage mock（被测模块经全局 localStorage 访问，不触真实 DOM）

import assert from 'node:assert/strict';

// ---- localStorage mock（每个用例可重置）----
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
function resetStore() { store.clear(); }

const { saveCheckpoint, loadCheckpoint, clearCheckpoint } =
  await import('../../client/src/pages/gis/editor/utils/attrs.js');
const { resolveVisibleColumns } =
  await import('../../client/src/pages/gis/editor/utils/attrTableUtils.js');

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
  console.log('=== editor-utils-checkpoint-colvis ===');

  // ============ Group A: loadCheckpoint 初始/空 ============
  await ok('A1: 无 checkpoint → loadCheckpoint 返回 null', () => {
    resetStore();
    assert.equal(loadCheckpoint(), null);
  });

  // ============ Group B: saveCheckpoint ============
  await ok('B1: saveCheckpoint 返回 { savedAt, count }', () => {
    resetStore();
    const r = saveCheckpoint([{ featureId: 'f1', name: 'A', attrs: { x: 1 } }]);
    assert.ok(r && typeof r.savedAt === 'string');
    assert.equal(r.count, 1);
  });
  await ok('B2: saveCheckpoint 持久化 items（featureId/name/layerId/attrs）', () => {
    resetStore();
    saveCheckpoint([{ featureId: 'f1', name: 'A', layerId: 'L1', attrs: { x: 1 } }]);
    const d = loadCheckpoint();
    assert.equal(d.items.length, 1);
    assert.deepEqual(d.items[0], { featureId: 'f1', name: 'A', layerId: 'L1', attrs: { x: 1 } });
  });
  await ok('B3: saveCheckpoint 缺 layerId → 默认 default', () => {
    resetStore();
    saveCheckpoint([{ featureId: 'f1', name: 'A', attrs: {} }]);
    assert.equal(loadCheckpoint().items[0].layerId, 'default');
  });
  await ok('B4: saveCheckpoint 缺 name → 空字符串', () => {
    resetStore();
    saveCheckpoint([{ featureId: 'f1', attrs: {} }]);
    assert.equal(loadCheckpoint().items[0].name, '');
  });
  await ok('B5: saveCheckpoint attrs 非对象 → 存 {}（防御）', () => {
    resetStore();
    saveCheckpoint([{ featureId: 'f1', attrs: 'bad' }]);
    assert.deepEqual(loadCheckpoint().items[0].attrs, {});
  });
  await ok('B6: saveCheckpoint attrs 深拷贝（后续改原对象不影响已存）', () => {
    resetStore();
    const attrs = { x: 1 };
    saveCheckpoint([{ featureId: 'f1', attrs }]);
    attrs.x = 999; // 改原对象
    assert.deepEqual(loadCheckpoint().items[0].attrs, { x: 1 });
  });
  await ok('B7: saveCheckpoint 多条 → count 与 items 长度一致', () => {
    resetStore();
    const r = saveCheckpoint([
      { featureId: 'f1', attrs: {} },
      { featureId: 'f2', attrs: {} },
      { featureId: 'f3', attrs: {} },
    ]);
    assert.equal(r.count, 3);
    assert.equal(loadCheckpoint().items.length, 3);
  });

  // ============ Group C: loadCheckpoint 容错 ============
  await ok('C1: loadCheckpoint 存了非法 JSON → null（不抛）', () => {
    resetStore();
    globalThis.localStorage.setItem('editor.attr-checkpoint.v1', '{not-json');
    assert.equal(loadCheckpoint(), null);
  });
  await ok('C2: loadCheckpoint 存了无 items 字段 → null', () => {
    resetStore();
    globalThis.localStorage.setItem('editor.attr-checkpoint.v1', JSON.stringify({ foo: 1 }));
    assert.equal(loadCheckpoint(), null);
  });
  await ok('C3: loadCheckpoint items 非数组 → null', () => {
    resetStore();
    globalThis.localStorage.setItem('editor.attr-checkpoint.v1', JSON.stringify({ items: 'x' }));
    assert.equal(loadCheckpoint(), null);
  });

  // ============ Group D: clearCheckpoint ============
  await ok('D1: clearCheckpoint 后 loadCheckpoint → null', () => {
    resetStore();
    saveCheckpoint([{ featureId: 'f1', attrs: {} }]);
    assert.ok(loadCheckpoint());
    clearCheckpoint();
    assert.equal(loadCheckpoint(), null);
  });
  await ok('D2: clearCheckpoint 在空存储上调用不抛错', () => {
    resetStore();
    assert.doesNotThrow(() => clearCheckpoint());
  });

  // ============ Group E: save→load→clear 往返 ============
  await ok('E1: 完整 save→load→clear 往返一致', () => {
    resetStore();
    const src = [{ featureId: 'f1', name: 'A', layerId: 'L', attrs: { k: 'v' } }];
    saveCheckpoint(src);
    const loaded = loadCheckpoint();
    assert.deepEqual(loaded.items, [{ featureId: 'f1', name: 'A', layerId: 'L', attrs: { k: 'v' } }]);
    clearCheckpoint();
    assert.equal(loadCheckpoint(), null);
  });

  // ============ Group F: resolveVisibleColumns ============
  await ok('F1: resolveVisibleColumns stored 空/无 → 全可见', () => {
    const all = [{ name: 'a' }, { name: 'b' }];
    assert.deepEqual(resolveVisibleColumns(all, null).map((c) => c.name), ['a', 'b']);
    assert.deepEqual(resolveVisibleColumns(all, new Set()).map((c) => c.name), ['a', 'b']);
  });
  await ok('F2: resolveVisibleColumns 按 stored 过滤（保序）', () => {
    const all = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];
    const out = resolveVisibleColumns(all, new Set(['c', 'a']));
    assert.deepEqual(out.map((c) => c.name), ['a', 'c']); // 保持 all 的顺序
  });
  await ok('F3: resolveVisibleColumns stored 含已不存在列 → 忽略', () => {
    const all = [{ name: 'a' }, { name: 'b' }];
    const out = resolveVisibleColumns(all, new Set(['a', 'ghost']));
    assert.deepEqual(out.map((c) => c.name), ['a']);
  });
  await ok('F4: resolveVisibleColumns 返回新数组（不改入参 all）', () => {
    const all = [{ name: 'a' }, { name: 'b' }];
    const snapshot = all.map((c) => c.name);
    resolveVisibleColumns(all, new Set(['a']));
    assert.deepEqual(all.map((c) => c.name), snapshot);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});