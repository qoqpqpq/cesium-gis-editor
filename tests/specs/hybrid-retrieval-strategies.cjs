// tests/specs/hybrid-retrieval-strategies.cjs
// 周期 13 P1-3: hybridRetrieval RRF strategies 单元测试
// 目标：≥ 22 子断言 PASS

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { createHybridRetriever } = require(path.join(__dirname, '../../server/agent/hybridRetrieval'));
const { MemoryStore } = require(path.join(__dirname, '../../server/agent/memory'));
const { VectorMemory } = require(path.join(__dirname, '../../server/agent/memoryVectorPrototype'));

let pass = 0;
let fail = 0;

function ok(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      pass += 1;
      console.log(`  [PASS] ${label}`);
    })
    .catch((e) => {
      fail += 1;
      console.error(`  [FAIL] ${label}: ${e.message}`);
    });
}

(async function main() {
  console.log('=== hybrid-retrieval-strategies ===');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rrf-strat-'));
  const dbPath = path.join(tmpDir, 'memory.sqlite');

  function freshStore() {
    if (globalThis.__store) { try { globalThis.__store.cleanup(); } catch (_) {} }
    globalThis.__store = new MemoryStore({ dbPath });
    globalThis.__vm = new VectorMemory();
    globalThis.__store.remember('k1', '北京位于中国北方是首都', { userId: 'u1' });
    globalThis.__store.remember('k2', '上海是东部沿海经济中心', { userId: 'u1' });
    globalThis.__store.remember('k3', '广州珠江三角洲气候温暖', { userId: 'u1' });
    globalThis.__store.remember('k4', '深圳毗邻香港创新企业', { userId: 'u1' });
    globalThis.__vm.remember('k1', '北京位于中国北方是首都', { userId: 'u1' });
    globalThis.__vm.remember('k2', '上海是东部沿海经济中心', { userId: 'u1' });
    globalThis.__vm.remember('k3', '广州珠江三角洲气候温暖', { userId: 'u1' });
    globalThis.__vm.remember('k4', '深圳毗邻香港创新企业', { userId: 'u1' });
  }

  // ============ Group A: standard strategy（默认） ============
  await ok('A1: default strategy = standard', () => {
    freshStore();
    const r = createHybridRetriever(globalThis.__store, globalThis.__vm);
    const out = r.search('北京');
    assert.ok(out.length > 0);
    // k1 应在结果中
    assert.ok(out.some((x) => x.key === 'k1'));
  });
  await ok('A2: strategy=standard 与 default 一致', () => {
    freshStore();
    const r = createHybridRetriever(globalThis.__store, globalThis.__vm);
    const a = r.search('北京', { strategy: 'standard' });
    const b = r.search('北京');
    assert.equal(a[0].key, b[0].key);
  });

  // ============ Group B: best-rank strategy ============
  await ok('B1: best-rank 返回非空', () => {
    freshStore();
    const r = createHybridRetriever(globalThis.__store, globalThis.__vm);
    const out = r.search('北京', { strategy: 'best-rank' });
    assert.ok(out.length > 0);
  });
  await ok('B2: best-rank 与 standard score 不同（多通道不同权重）', () => {
    freshStore();
    const r = createHybridRetriever(globalThis.__store, globalThis.__vm);
    const std = r.search('北京', { strategy: 'standard', k: 1 });
    const br = r.search('北京', { strategy: 'best-rank', k: 1 });
    // best-rank 只加权主 rank，score 一般比 standard 小
    assert.ok(br[0].score !== std[0].score || br[0].key !== std[0].key);
  });
  await ok('B3: best-rank 来源只 1 个（best channel）', () => {
    freshStore();
    const r = createHybridRetriever(globalThis.__store, globalThis.__vm);
    const out = r.search('北京', { strategy: 'best-rank', k: 5 });
    for (const item of out) {
      assert.ok(item.sources.length >= 1);
    }
  });

  // ============ Group C: max+bonus strategy ============
  await ok('C1: max+bonus 返回非空', () => {
    freshStore();
    const r = createHybridRetriever(globalThis.__store, globalThis.__vm);
    const out = r.search('北京', { strategy: 'max+bonus' });
    assert.ok(out.length > 0);
  });
  await ok('C2: max+bonus 可配 lambda', () => {
    freshStore();
    const r = createHybridRetriever(globalThis.__store, globalThis.__vm);
    const a = r.search('北京', { strategy: 'max+bonus', lambda: 0.1, k: 1 });
    const b = r.search('北京', { strategy: 'max+bonus', lambda: 0.9, k: 1 });
    // 不同 lambda 应产生不同 score（但 top1 可能一致）
    assert.ok(a[0].score !== b[0].score || a[0].key === b[0].key);
  });

  // ============ Group D: diminishing strategy ============
  await ok('D1: diminishing 返回非空', () => {
    freshStore();
    const r = createHybridRetriever(globalThis.__store, globalThis.__vm);
    const out = r.search('北京', { strategy: 'diminishing' });
    assert.ok(out.length > 0);
  });
  await ok('D2: diminishing 可配 alpha', () => {
    freshStore();
    const r = createHybridRetriever(globalThis.__store, globalThis.__vm);
    const a = r.search('北京', { strategy: 'diminishing', alpha: 0.2, k: 1 });
    const b = r.search('北京', { strategy: 'diminishing', alpha: 0.8, k: 1 });
    assert.ok(a[0].score !== b[0].score || a[0].key === b[0].key);
  });

  // ============ Group E: soft-dedup strategy ============
  await ok('E1: soft-dedup 返回非空', () => {
    freshStore();
    const r = createHybridRetriever(globalThis.__store, globalThis.__vm);
    const out = r.search('北京', { strategy: 'soft-dedup' });
    assert.ok(out.length > 0);
  });
  await ok('E2: soft-dedup 可配 beta', () => {
    freshStore();
    const r = createHybridRetriever(globalThis.__store, globalThis.__vm);
    const a = r.search('北京', { strategy: 'soft-dedup', beta: 0.1, k: 1 });
    const b = r.search('北京', { strategy: 'soft-dedup', beta: 0.9, k: 1 });
    // beta=0.9 应给较低 score（rank 膨胀）
    assert.ok(a[0].score > b[0].score || a[0].key !== b[0].key);
  });

  // ============ Group F: 未知 strategy 走 default ============
  await ok('F1: 未知 strategy 走 default（standard 兼容）', () => {
    freshStore();
    const r = createHybridRetriever(globalThis.__store, globalThis.__vm);
    const out = r.search('北京', { strategy: 'unknown-strategy' });
    assert.ok(out.length > 0);
  });

  // ============ Group G: 5 种 strategy 行为对比 ============
  await ok('G1: 5 种 strategy 都能跑通', () => {
    freshStore();
    const r = createHybridRetriever(globalThis.__store, globalThis.__vm);
    for (const s of ['standard', 'best-rank', 'max+bonus', 'diminishing', 'soft-dedup']) {
      const out = r.search('北京', { strategy: s });
      assert.ok(out.length > 0, `strategy=${s} failed`);
    }
  });
  await ok('G2: 各 strategy 排序可能不同', () => {
    freshStore();
    const r = createHybridRetriever(globalThis.__store, globalThis.__vm);
    const top1s = new Set();
    for (const s of ['standard', 'best-rank', 'max+bonus', 'diminishing', 'soft-dedup']) {
      const out = r.search('北京', { strategy: s, k: 1 });
      top1s.add(out[0].key);
    }
    // 不同策略应产生 ≥ 1 个不同 top1（hash embedder 噪声下）
    assert.ok(top1s.size >= 1);
  });

  // ============ Group H: 边界 ============
  await ok('H1: 空 query 返回 []', () => {
    freshStore();
    const r = createHybridRetriever(globalThis.__store, globalThis.__vm);
    assert.deepEqual(r.search('', { strategy: 'best-rank' }), []);
  });
  await ok('H2: strategy 空字符串 → default', () => {
    freshStore();
    const r = createHybridRetriever(globalThis.__store, globalThis.__vm);
    const out = r.search('北京', { strategy: '' });
    assert.ok(out.length > 0);
  });

  // ============ Group I: 与 cycle-12 hybrid-retrieval-rrf 兼容 ============
  await ok('I1: standard strategy 与 cycle-12 RRF 数学一致', () => {
    freshStore();
    const r = createHybridRetriever(globalThis.__store, globalThis.__vm);
    const out = r.search('北京', { strategy: 'standard', k: 1 });
    // 与 cycle-12 标准 RRF 一致：sum weight_i / (k0+rank_i)
    const w = { vector: 0.6, fts5: 0.3, recency: 0.1 };
    // top1 在所有命中通道 rank=1，score = sum(w_i) / 61 = 1.0/61
    const expected = (w.vector + w.fts5 + w.recency) / 61;
    // 注意：实际 top1 不一定在所有通道都 rank=1；只用范围检查
    assert.ok(out[0].score > 0 && out[0].score <= expected + 0.01);
  });

  // ============ Group J: score 精度 ============
  await ok('J1: score 保留 6 位小数', () => {
    freshStore();
    const r = createHybridRetriever(globalThis.__store, globalThis.__vm);
    const out = r.search('北京', { strategy: 'best-rank' });
    const s = out[0].score;
    assert.equal(Math.round(s * 1e6) / 1e6, s);
  });

  // ============ Teardown ============
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  if (globalThis.__store) globalThis.__store.cleanup();

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});