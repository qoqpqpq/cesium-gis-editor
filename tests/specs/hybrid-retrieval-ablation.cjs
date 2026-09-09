// tests/specs/hybrid-retrieval-ablation.cjs
// 周期 14 P1-2: RRF ablation + 启发式权重搜索
//
// 覆盖：
//   - heuristicWeightSearch() 5x5x5 = 125 组合搜索 + best 选取
//   - RRF_STRATEGIES 列出 5 种
//   - 周期 12-13 RRF 零回归
//   - 跨 ablation 一致性（同 corpus → 至少 1 种 strategy 命中 expectedKey）

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..', '..');
const memoryPath = path.join(ROOT, 'server', 'agent', 'memory.js');
const hybridPath = path.join(ROOT, 'server', 'agent', 'hybridRetrieval.js');

let total = 0;
const failed = [];

function it(name, fn) {
  total += 1;
  try {
    fn();
    process.stdout.write(`  [PASS] ${name}\n`);
  } catch (e) {
    failed.push({ name, error: e });
    process.stdout.write(`  [FAIL] ${name} — ${e.message}\n`);
  }
}

const mem = require(memoryPath);
const hyb = require(hybridPath);

const corpus = [
  { key: 'a', value: '西湖位于浙江省杭州市', tags: ['杭州', '西湖'], userId: 'u1' },
  { key: 'b', value: '西湖是中国著名的淡水湖', tags: ['西湖'], userId: 'u1' },
  { key: 'c', value: '北京是中国的首都', tags: ['北京'], userId: 'u2' },
  { key: 'd', value: '上海是中国的经济中心', tags: ['上海'], userId: 'u2' },
  { key: 'e', value: '广州是广东省的省会', tags: ['广州'], userId: 'u3' },
];

function makeStore() {
  const tmp = path.join(os.tmpdir(), `hybrid-ablation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sqlite`);
  const s = new mem.MemoryStore({ dbPath: tmp });
  for (const c of corpus) s.remember(c.key, c.value, { tags: c.tags, userId: c.userId });
  return { store: s, dbPath: tmp };
}

function cleanup(store) {
  try { store.close(); } catch (_) {}
  if (store.dbPath) {
    try { fs.unlinkSync(store.dbPath); } catch (_) {}
    try { fs.unlinkSync(store.dbPath + '-wal'); } catch (_) {}
    try { fs.unlinkSync(store.dbPath + '-shm'); } catch (_) {}
  }
}

// ===== 1. RRF_STRATEGIES =====
it('ABL-1: RRF_STRATEGIES 列出 5 种 strategy', () => {
  assert.strictEqual(hyb.RRF_STRATEGIES.length, 5);
  for (const s of ['standard', 'best-rank', 'max+bonus', 'diminishing', 'soft-dedup']) {
    assert.ok(hyb.RRF_STRATEGIES.includes(s));
  }
});

// ===== 2. heuristicWeightSearch =====
it('ABL-2: heuristicWeightSearch 返回 bestWeights / bestScore', () => {
  const { store, dbPath } = makeStore();
  try {
    const evalSet = [
      { query: '西湖', expectedKey: 'a' },
      { query: '北京', expectedKey: 'c' },
    ];
    const r = hyb.heuristicWeightSearch(store, evalSet, { gridSize: 3 });
    assert.ok(r.bestWeights);
    assert.ok(typeof r.bestScore === 'number');
    assert.ok(r.bestScore >= 0 && r.bestScore <= 1);
    assert.ok(Array.isArray(r.allScores));
  } finally { cleanup(store); try { fs.unlinkSync(dbPath); } catch (_) {} }
});

it('ABL-3: heuristicWeightSearch gridSize=3 → 27 组合 (3*3*3)', () => {
  const { store, dbPath } = makeStore();
  try {
    const evalSet = [{ query: '西湖', expectedKey: 'a' }];
    const r = hyb.heuristicWeightSearch(store, evalSet, { gridSize: 3 });
    assert.strictEqual(r.allScores.length, 27);
  } finally { cleanup(store); try { fs.unlinkSync(dbPath); } catch (_) {} }
});

it('ABL-4: heuristicWeightSearch gridSize=5 → 125 组合', () => {
  const { store, dbPath } = makeStore();
  try {
    const evalSet = [{ query: '西湖', expectedKey: 'a' }];
    const r = hyb.heuristicWeightSearch(store, evalSet, { gridSize: 5 });
    assert.strictEqual(r.allScores.length, 125);
  } finally { cleanup(store); try { fs.unlinkSync(dbPath); } catch (_) {} }
});

it('ABL-5: heuristicWeightSearch bestWeights 三值归一化和为 1', () => {
  const { store, dbPath } = makeStore();
  try {
    const evalSet = [{ query: '西湖', expectedKey: 'a' }, { query: '北京', expectedKey: 'c' }];
    const r = hyb.heuristicWeightSearch(store, evalSet, { gridSize: 3 });
    if (r.bestWeights) {
      const sum = r.bestWeights.vector + r.bestWeights.fts5 + r.bestWeights.recency;
      assert.ok(Math.abs(sum - 1) < 1e-6);
    }
  } finally { cleanup(store); try { fs.unlinkSync(dbPath); } catch (_) {} }
});

it('ABL-6: heuristicWeightSearch 空 evalSet 返回 0', () => {
  const { store, dbPath } = makeStore();
  try {
    const r = hyb.heuristicWeightSearch(store, []);
    assert.strictEqual(r.bestWeights, null);
    assert.strictEqual(r.bestScore, 0);
  } finally { cleanup(store); try { fs.unlinkSync(dbPath); } catch (_) {} }
});

it('ABL-7: heuristicWeightSearch 至少 1 组合 score > 0（能找到西湖）', () => {
  const { store, dbPath } = makeStore();
  try {
    const evalSet = [{ query: '西湖', expectedKey: 'a' }];
    const r = hyb.heuristicWeightSearch(store, evalSet, { gridSize: 5 });
    const hasPositive = r.allScores.some((s) => s.score > 0);
    assert.ok(hasPositive, 'At least one weights combo should find expectedKey');
  } finally { cleanup(store); try { fs.unlinkSync(dbPath); } catch (_) {} }
});

// ===== 3. 跨 5 种 strategy 一致性 =====
it('ABL-8: 5 种 strategy 在标准 query 都返回非空', () => {
  const { store, dbPath } = makeStore();
  try {
    const retriever = hyb.createHybridRetriever(store);
    retriever.buildIndex();
    for (const strat of hyb.RRF_STRATEGIES) {
      const results = retriever.search('西湖', { strategy: strat, k: 3 });
      assert.ok(results.length > 0, `strategy=${strat} returned empty`);
    }
  } finally { cleanup(store); try { fs.unlinkSync(dbPath); } catch (_) {} }
});

it('ABL-9: 5 种 strategy 至少 1 种 top-1 是 a 或 b（西湖相关）', () => {
  const { store, dbPath } = makeStore();
  try {
    const retriever = hyb.createHybridRetriever(store);
    retriever.buildIndex();
    let found = false;
    for (const strat of hyb.RRF_STRATEGIES) {
      const results = retriever.search('西湖', { strategy: strat, k: 1 });
      if (results.length > 0 && (results[0].key === 'a' || results[0].key === 'b')) {
        found = true;
        break;
      }
    }
    assert.ok(found, 'At least one strategy should rank 西湖 doc as top-1');
  } finally { cleanup(store); try { fs.unlinkSync(dbPath); } catch (_) {} }
});

// ===== 4. 向后兼容：周期 12-13 RRF API =====
it('ABL-BC1: createHybridRetriever 仍可用', () => {
  const { store, dbPath } = makeStore();
  try {
    const r = hyb.createHybridRetriever(store);
    assert.strictEqual(typeof r.search, 'function');
    assert.strictEqual(typeof r.buildIndex, 'function');
  } finally { cleanup(store); try { fs.unlinkSync(dbPath); } catch (_) {} }
});

it('ABL-BC2: hybridSearch 便捷函数仍可用', () => {
  const { store, dbPath } = makeStore();
  try {
    const results = hyb.hybridSearch('西湖', store, { k: 3 });
    assert.ok(Array.isArray(results));
  } finally { cleanup(store); try { fs.unlinkSync(dbPath); } catch (_) {} }
});

it('ABL-BC3: DEFAULT_K0 = 60 仍存在', () => {
  assert.strictEqual(hyb.DEFAULT_K0, 60);
});

it('ABL-BC4: 空 query 仍返回 []', () => {
  const { store, dbPath } = makeStore();
  try {
    const r = hyb.createHybridRetriever(store);
    assert.deepStrictEqual(r.search(''), []);
    assert.deepStrictEqual(r.search('   '), []);
  } finally { cleanup(store); try { fs.unlinkSync(dbPath); } catch (_) {} }
});

it('ABL-BC5: negative weights 仍返回 []', () => {
  const { store, dbPath } = makeStore();
  try {
    const r = hyb.createHybridRetriever(store);
    assert.deepStrictEqual(r.search('西湖', { weights: { vector: -0.1, fts5: 0.5, recency: 0.6 } }), []);
  } finally { cleanup(store); try { fs.unlinkSync(dbPath); } catch (_) {} }
});

// ===== 5. heuristicWeightSearch 性能边界 =====
it('ABL-P1: heuristicWeightSearch 125 组合 < 10s', () => {
  const { store, dbPath } = makeStore();
  try {
    const evalSet = [
      { query: '西湖', expectedKey: 'a' },
      { query: '北京', expectedKey: 'c' },
      { query: '上海', expectedKey: 'd' },
      { query: '广州', expectedKey: 'e' },
    ];
    const t0 = Date.now();
    hyb.heuristicWeightSearch(store, evalSet, { gridSize: 5 });
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 10000, `heuristic search took ${elapsed}ms, expected < 10s`);
  } finally { cleanup(store); try { fs.unlinkSync(dbPath); } catch (_) {} }
});

it('ABL-P2: heuristicWeightSearch 不抛错（store 关闭后）', () => {
  const { store, dbPath } = makeStore();
  cleanup(store); // close immediately
  try {
    assert.doesNotThrow(() => hyb.heuristicWeightSearch(store, [{ query: '西湖', expectedKey: 'a' }]));
  } finally { try { fs.unlinkSync(dbPath); } catch (_) {} }
});

// ===== 总结 =====
process.stdout.write(`\n--- hybrid-retrieval-ablation: pass=${total - failed.length} fail=${failed.length} ---\n`);
if (failed.length > 0) {
  process.stdout.write(`FAIL DETAILS:\n${failed.map((f) => `  - ${f.name}: ${f.error.message}`).join('\n')}\n`);
  process.exit(1);
}
process.exit(0);
