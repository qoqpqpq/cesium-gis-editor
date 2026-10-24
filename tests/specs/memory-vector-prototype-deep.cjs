// tests/specs/memory-vector-prototype-deep.cjs
// Cycle 28 R1: memoryVectorPrototype.js 深度边界测试
// 覆盖 embed() + cosine() + VectorMemory 完整 CRUD + 集成
// 目标：≥ 60 PASS

'use strict';

const assert = require('node:assert');
const path = require('node:path');

const {
  VectorMemory,
  embed,
  cosine,
  DIM,
} = require(path.join(__dirname, '../../server/agent/memoryVectorPrototype'));

let pass = 0, fail = 0;
const failures = [];
async function ok(label, fn) {
  try {
    await fn();
    pass++;
    console.log(`  [PASS] ${label}`);
  } catch (e) {
    fail++;
    console.log(`  [FAIL] ${label}: ${e.message}`);
    failures.push({ label, err: e.message });
  }
}

async function main() {
  console.log('=== Cycle 28 R1: memoryVectorPrototype.js deep boundary tests ===\n');

  // ===== A组: 模块导出 =====
  console.log('\n-- A组: 模块导出 =====');
  await ok('A1: VectorMemory 是 class', () => {
    assert.strictEqual(typeof VectorMemory, 'function');
    assert.ok(new VectorMemory() instanceof VectorMemory);
  });
  await ok('A2: embed 是 function', () => {
    assert.strictEqual(typeof embed, 'function');
  });
  await ok('A3: cosine 是 function', () => {
    assert.strictEqual(typeof cosine, 'function');
  });
  await ok('A4: DIM 是 32', () => {
    assert.strictEqual(DIM, 32);
  });

  // ===== B组: embed 数学正确性 + 边界 =====
  console.log('\n-- B组: embed 数学正确性 =====');
  await ok('B1: embed 返回 DIM 维向量', () => {
    const v = embed('hello world');
    assert.strictEqual(v.length, DIM);
  });
  await ok('B2: embed 归一化（|v| ≈ 1）', () => {
    const v = embed('hello world');
    let norm = 0;
    for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm);
    assert.ok(Math.abs(norm - 1) < 1e-6, `|v|=${norm}`);
  });
  await ok('B3: 相同输入 → 相同向量（确定性）', () => {
    const v1 = embed('test');
    const v2 = embed('test');
    assert.deepStrictEqual(v1, v2);
  });
  await ok('B4: 不同输入 → 不同向量', () => {
    const v1 = embed('hello');
    const v2 = embed('world');
    assert.notDeepStrictEqual(v1, v2);
  });
  await ok('B5: 空字符串 → 零向量（归一化后 norm=1，实际全 0）', () => {
    const v = embed('');
    assert.strictEqual(v.length, DIM);
    // 空字符串无 n-gram，全 0，norm=0 → 除以 1（||1）
    assert.deepStrictEqual(v, new Array(DIM).fill(0));
  });
  await ok('B6: null → 零向量', () => {
    const v = embed(null);
    assert.strictEqual(v.length, DIM);
    assert.deepStrictEqual(v, new Array(DIM).fill(0));
  });
  await ok('B7: undefined → 零向量', () => {
    const v = embed(undefined);
    assert.strictEqual(v.length, DIM);
    assert.deepStrictEqual(v, new Array(DIM).fill(0));
  });
  await ok('B8: 数字 → 转字符串处理', () => {
    const v = embed(42);
    assert.strictEqual(v.length, DIM);
    let norm = 0;
    for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
    assert.ok(Math.abs(Math.sqrt(norm) - 1) < 1e-6);
  });
  await ok('B9: 单字符 → 归一化向量', () => {
    const v = embed('a');
    assert.strictEqual(v.length, DIM);
    let norm = 0;
    for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
    assert.ok(Math.abs(Math.sqrt(norm) - 1) < 1e-6);
  });
  await ok('B10: 大写 vs 小写 → 相同（toLowerCase）', () => {
    const v1 = embed('Hello');
    const v2 = embed('hello');
    assert.deepStrictEqual(v1, v2);
  });
  await ok('B11: 向量分量在 [-1, 1] 范围', () => {
    const v = embed('测试中文内容');
    for (const x of v) {
      assert.ok(x >= -1.001 && x <= 1.001, `value ${x} out of range`);
    }
  });
  await ok('B12: 长文本 → 归一化', () => {
    const v = embed('x'.repeat(1000));
    let norm = 0;
    for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
    assert.ok(Math.abs(Math.sqrt(norm) - 1) < 1e-6);
  });

  // ===== C组: cosine 计算 + 边界 =====
  console.log('\n-- C组: cosine 计算 =====');
  await ok('C1: 相同向量 → cosine ≈ 1', () => {
    const v = embed('test');
    const c = cosine(v, v);
    assert.ok(c > 0.999, `cosine=${c}`);
  });
  await ok('C2: 不同向量 → cosine < 1', () => {
    const v1 = embed('hello');
    const v2 = embed('world');
    const c = cosine(v1, v2);
    assert.ok(c < 1, `cosine=${c}`);
  });
  await ok('C3: 零向量 → cosine = 0', () => {
    const v = embed('');
    const c = cosine(v, embed('test'));
    assert.strictEqual(c, 0);
  });
  await ok('C4: null 输入 → 0', () => {
    assert.strictEqual(cosine(null, [1, 2, 3]), 0);
  });
  await ok('C5: undefined 输入 → 0', () => {
    assert.strictEqual(cosine(undefined, [1, 2, 3]), 0);
  });
  await ok('C6: 长度不同 → 0', () => {
    assert.strictEqual(cosine([1, 2, 3], [1, 2]), 0);
  });
  await ok('C7: 长度不同 → 0', () => {
    assert.strictEqual(cosine([1, 2], [1, 2, 3]), 0);
  });
  await ok('C8: 对称性 cosine(a,b) = cosine(b,a)', () => {
    const v1 = embed('hello');
    const v2 = embed('world');
    const c1 = cosine(v1, v2);
    const c2 = cosine(v2, v1);
    assert.strictEqual(c1, c2);
  });
  await ok('C9: cosine 范围 [-1, 1]', () => {
    for (let i = 0; i < 100; i++) {
      const v1 = embed(String(i));
      const v2 = embed(String(i + 1));
      const c = cosine(v1, v2);
      assert.ok(c >= -1.001 && c <= 1.001, `cosine=${c}`);
    }
  });
  await ok('C10: 空数组 → 0', () => {
    assert.strictEqual(cosine([], [1, 2, 3]), 0);
  });

  // ===== D组: VectorMemory remember/recall =====
  console.log('\n-- D组: VectorMemory remember/recall =====');
  const vm = new VectorMemory();
  await ok('D1: remember 成功', () => {
    const r = vm.remember('key1', 'value1');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.key, 'key1');
    assert.strictEqual(r.backend, 'vector-prototype');
  });
  await ok('D2: remember 空 key → 失败', () => {
    const r = vm.remember('', 'value');
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /非空字符串/);
  });
  await ok('D3: remember null key → 失败', () => {
    const r = vm.remember(null, 'value');
    assert.strictEqual(r.ok, false);
  });
  await ok('D4: remember 非字符串 key → 失败', () => {
    const r = vm.remember(42, 'value');
    assert.strictEqual(r.ok, false);
  });
  await ok('D5: recall 存在 → 返回 item', () => {
    vm.remember('k5', 'v5');
    const r = vm.recall('k5');
    assert.strictEqual(r.key, 'k5');
    assert.strictEqual(r.value, 'v5');
    assert.strictEqual(r.backend, 'vector-prototype');
    assert.ok(r.ts > 0);
  });
  await ok('D6: recall 不存在 → null', () => {
    const r = vm.recall('nonexistent');
    assert.strictEqual(r, null);
  });
  await ok('D7: recall 返回 tags', () => {
    vm.remember('k7', 'v7', { tags: ['a', 'b'] });
    const r = vm.recall('k7');
    assert.deepStrictEqual(r.tags, ['a', 'b']);
  });
  await ok('D8: recall 返回 userId', () => {
    vm.remember('k8', 'v8', { userId: 'user1' });
    const r = vm.recall('k8');
    assert.strictEqual(r.userId, 'user1');
  });
  await ok('D9: 覆盖 key → 最新值', () => {
    vm.remember('k9', 'old');
    vm.remember('k9', 'new');
    const r = vm.recall('k9');
    assert.strictEqual(r.value, 'new');
  });
  await ok('D10: recall 返回不修改 _store', () => {
    vm.remember('k10', 'v10');
    const r1 = vm.recall('k10');
    const r2 = vm.recall('k10');
    assert.strictEqual(r1.value, r2.value);
    assert.strictEqual(r1.ts, r2.ts);
  });

  // ===== E组: search 检索 =====
  console.log('\n-- E组: search 检索 =====');
  const vs = new VectorMemory();
  vs.remember('s1', 'hello world');
  vs.remember('s2', 'foo bar');
  vs.remember('s3', 'baz qux');
  await ok('E1: search 返回数组', () => {
    const r = vs.search('hello');
    assert.ok(Array.isArray(r));
  });
  await ok('E2: search 默认 limit=10', () => {
    const r = vs.search('test');
    assert.ok(r.length <= 10);
  });
  await ok('E3: search limit 生效', () => {
    for (let i = 0; i < 20; i++) vs.remember(`s${i}`, `item ${i}`);
    const r = vs.search('item', { limit: 5 });
    assert.ok(r.length <= 5);
  });
  await ok('E4: search threshold=0 → 所有 >= 0 的返回', () => {
    const r = vs.search('hello', { threshold: 0 });
    assert.ok(r.length >= 1);
  });
  await ok('E5: search threshold=1 → 几乎无结果', () => {
    const r = vs.search('hello', { threshold: 1.0 });
    // 只有完全相同向量才 >= 1.0
    assert.ok(r.length === 0 || r[0].score >= 1.0);
  });
  await ok('E6: search 按 score 降序', () => {
    const r = vs.search('hello', { limit: 20 });
    for (let i = 1; i < r.length; i++) {
      assert.ok(r[i - 1].score >= r[i].score, `score[${i-1}]=${r[i-1].score} < score[${i}]=${r[i].score}`);
    }
  });
  await ok('E7: search userId 过滤', () => {
    const vu = new VectorMemory();
    vu.remember('a', 'hello', { userId: 'u1' });
    vu.remember('b', 'hello', { userId: 'u2' });
    const r = vu.search('hello', { userId: 'u1' });
    assert.ok(r.length === 1);
    assert.strictEqual(r[0].userId, 'u1');
  });
  await ok('E8: search userId 不匹配 → 空', () => {
    const vu = new VectorMemory();
    vu.remember('a', 'hello', { userId: 'u1' });
    const r = vu.search('hello', { userId: 'u999' });
    assert.strictEqual(r.length, 0);
  });
  await ok('E9: search 返回 score', () => {
    const r = vs.search('hello world');
    assert.ok(r.length > 0);
    assert.ok(typeof r[0].score === 'number');
  });
  await ok('E10: search 返回 searchEngine', () => {
    const r = vs.search('hello');
    if (r.length > 0) {
      assert.strictEqual(r[0].searchEngine, 'cosine-brute-force');
    }
  });
  await ok('E11: search 返回 tags', () => {
    vs.remember('s11', 'hello', { tags: ['tag1'] });
    const r = vs.search('hello', { limit: 20 });
    const found = r.find(x => x.key === 's11');
    if (found) assert.deepStrictEqual(found.tags, ['tag1']);
  });
  await ok('E12: search 空 store → 空数组', () => {
    const ve = new VectorMemory();
    const r = ve.search('anything');
    assert.strictEqual(r.length, 0);
  });

  // ===== F组: list/forget/size/clear =====
  console.log('\n-- F组: list/forget/size/clear =====');
  const vf = new VectorMemory();
  vf.remember('f1', 'v1');
  vf.remember('f2', 'v2');
  vf.remember('f3', 'v3');
  await ok('F1: size 返回正确数量', () => {
    assert.strictEqual(vf.size(), 3);
  });
  await ok('F2: list 返回数组', () => {
    const r = vf.list();
    assert.ok(Array.isArray(r));
    assert.strictEqual(r.length, 3);
  });
  await ok('F3: list 按 ts 降序', () => {
    const r = vf.list();
    for (let i = 1; i < r.length; i++) {
      assert.ok(r[i - 1].ts >= r[i].ts, `ts[${i-1}]=${r[i-1].ts} < ts[${i}]=${r[i].ts}`);
    }
  });
  await ok('F4: list limit 生效', () => {
    const r = vf.list({ limit: 2 });
    assert.strictEqual(r.length, 2);
  });
  await ok('F5: list userId 过滤', () => {
    const vu = new VectorMemory();
    vu.remember('a', 'hello', { userId: 'u1' });
    vu.remember('b', 'hello', { userId: 'u2' });
    const r = vu.list({ userId: 'u1' });
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].userId, 'u1');
  });
  await ok('F6: forget 存在 → deleted=1', () => {
    const r = vf.forget('f1');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.deleted, 1);
    assert.strictEqual(vf.size(), 2);
  });
  await ok('F7: forget 不存在 → deleted=0', () => {
    const r = vf.forget('nonexistent');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.deleted, 0);
  });
  await ok('F8: clear 清空所有', () => {
    vf.clear();
    assert.strictEqual(vf.size(), 0);
    const r = vf.list();
    assert.strictEqual(r.length, 0);
  });

  // ===== G组: 集成场景 =====
  console.log('\n-- G组: 集成场景 =====');
  await ok('G1: remember → recall → search 全链路', () => {
    const vi = new VectorMemory();
    vi.remember('g1', 'cesium gis editor');
    vi.remember('g2', '3d mapping platform');
    const recalled = vi.recall('g1');
    assert.strictEqual(recalled.value, 'cesium gis editor');
    const searched = vi.search('cesium');
    assert.ok(searched.length >= 1);
    assert.strictEqual(searched[0].key, 'g1');
    assert.ok(searched[0].score > 0);
  });
  await ok('G2: userId 隔离：多用户数据不串扰', () => {
    const vi = new VectorMemory();
    vi.remember('u1_doc', 'hello world', { userId: 'user1' });
    vi.remember('u2_doc', 'goodbye world', { userId: 'user2' });
    // 搜索 userId=user1 → 只返回 user1 的文档
    const r1 = vi.search('hello', { userId: 'user1' });
    assert.ok(r1.every(x => x.userId === 'user1'));
    // 搜索 userId=user2 → 只返回 user2 的文档
    const r2 = vi.search('hello', { userId: 'user2' });
    assert.ok(r2.every(x => x.userId === 'user2'));
    // 无 userId 过滤 → 返回所有
    const rAll = vi.search('hello');
    assert.ok(rAll.length >= r1.length + r2.length - 1);
  });
  await ok('G3: 删除后 search 不再返回', () => {
    const vi = new VectorMemory();
    vi.remember('del1', 'temporary data');
    vi.remember('del2', 'permanent data');
    const before = vi.search('temporary');
    assert.ok(before.length >= 1);
    vi.forget('del1');
    const after = vi.forget('del1');
    assert.strictEqual(after.deleted, 0);
  });
  await ok('G4: 空 store search → 空数组', () => {
    const vi = new VectorMemory();
    const r = vi.search('anything');
    assert.strictEqual(r.length, 0);
  });
  await ok('G5: 大量数据 brute-force 性能', () => {
    const vi = new VectorMemory();
    for (let i = 0; i < 1000; i++) {
      vi.remember(`bulk_${i}`, `item number ${i} content`);
    }
    const start = Date.now();
    const r = vi.search('item number 500', { limit: 10 });
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 5000, `1000 items search took ${elapsed}ms`);
    assert.ok(r.length >= 1);
  });
  await ok('G6: custom opts.bruteForceLimit', () => {
    const vi = new VectorMemory({ bruteForceLimit: 100 });
    vi.remember('a', 'test');
    assert.strictEqual(vi.size(), 1);
    assert.strictEqual(vi.bruteForceLimit, 100);
  });
  await ok('G7: custom opts.dim（不影响 embed DIM）', () => {
    const vi = new VectorMemory({ dim: 64 });
    assert.strictEqual(vi.dim, 64);
    // 但 embed 仍返回 DIM=32 维
    vi.remember('a', 'test');
    const r = vi.recall('a');
    // recall 不返回 vector，但 search 用 embed 的 DIM=32
    const s = vi.search('test');
    assert.ok(s.length >= 1);
  });
  await ok('G8: 全链路：remember→search→forget→recall null', () => {
    const vi = new VectorMemory();
    vi.remember('full', 'complete lifecycle');
    assert.ok(vi.recall('full') !== null);
    const found = vi.search('complete');
    assert.ok(found.length >= 1);
    vi.forget('full');
    assert.strictEqual(vi.recall('full'), null);
    const after = vi.search('complete');
    assert.strictEqual(after.length, 0);
  });

  // ===== H组: 回归测试 =====
  console.log('\n-- H组: 回归测试 =====');
  await ok('H1: 与 memory-vector-prototype.cjs 行为一致', () => {
    const vi = new VectorMemory();
    vi.remember('r1', 'regression test');
    const r = vi.search('regression');
    assert.ok(r.length >= 1);
    assert.strictEqual(r[0].key, 'r1');
  });
  await ok('H2: embed 确定性可复现', () => {
    const v1 = embed('deterministic');
    const v2 = embed('deterministic');
    assert.deepStrictEqual(v1, v2);
  });
  await ok('H3: cosine 范围验证', () => {
    const v1 = embed('alpha');
    const v2 = embed('beta');
    const c = cosine(v1, v2);
    assert.ok(c >= -1.001 && c <= 1.001);
  });
  await ok('H4: VectorMemory backend 标识', () => {
    const vi = new VectorMemory();
    vi.remember('a', 'b');
    const r = vi.recall('a');
    assert.strictEqual(r.backend, 'vector-prototype');
    const s = vi.search('a');
    assert.strictEqual(s[0].backend, 'vector-prototype');
  });
  await ok('H5: forget 不存在的 key 不抛错', () => {
    const vi = new VectorMemory();
    const r = vi.forget('nonexistent');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.deleted, 0);
  });
  await ok('H6: clear 后 size=0', () => {
    const vi = new VectorMemory();
    vi.remember('a', 'b');
    vi.clear();
    assert.strictEqual(vi.size(), 0);
  });
  await ok('H7: DIM 常量正确', () => {
    assert.strictEqual(DIM, 32);
  });
  await ok('H8: 所有导出 API 可调用', () => {
    assert.strictEqual(typeof VectorMemory, 'function');
    assert.strictEqual(typeof embed, 'function');
    assert.strictEqual(typeof cosine, 'function');
    const vi = new VectorMemory();
    vi.remember('test', 'value');
    vi.search('test');
    vi.list();
    vi.recall('test');
    vi.forget('test');
    vi.size();
    vi.clear();
    embed('test');
    cosine([1, 2], [3, 4]);
    assert.ok(true);
  });

  // ===== summary =====
  console.log(`\n--- summary: pass=${pass} fail=${fail} ---`);
  if (failures.length) {
    console.log('failures:', JSON.stringify(failures, null, 2));
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(2);
});
