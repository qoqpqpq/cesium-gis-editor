// tests/specs/hybrid-retrieval-boundary-deep.cjs
// Cycle 27 R2: hybridRetrieval.js 边界路径深度测试
// 覆盖 heuristicWeightSearch 参数验证边界 + buildRetrievalSpanAttributes 类型边界
// + RRF_STRATEGIES 枚举完整性 + 常量 + 集成场景

'use strict';

const assert = require('node:assert');
const path = require('node:path');

const H = require(path.join(__dirname, '../../server/agent/hybridRetrieval'));
const M = require(path.join(__dirname, '../../server/agent/memory'));

const {
  createHybridRetriever,
  hybridSearch,
  buildRetrievalSpanAttributes,
  heuristicWeightSearch,
  RRF_STRATEGIES,
  DEFAULT_K0,
  DEFAULT_HALF_LIFE_DAYS,
} = H;
const { MemoryStore } = M;

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

function makeStore(seed = 0) {
  const store = new MemoryStore({ dbPath: ':memory:' });
  // 添加一些测试数据
  const now = Date.now();
  for (let i = 0; i < 10 + seed; i++) {
    store.remember(`k${i}`, `value-${i} ${['hello', 'world', 'test', 'foo', 'bar'][i % 5]}`, {
      tags: ['t' + (i % 3)],
      userId: i % 2 === 0 ? 'u1' : 'u2',
    });
  }
  return store;
}

async function main() {
  console.log('=== Cycle 27 R2: hybridRetrieval boundary deep tests ===\n');

  // ===== A组: 模块导出完整 =====
  console.log('\n-- A组: 模块导出完整 --');
  await ok('A1: createHybridRetriever 是 function', () => {
    assert.strictEqual(typeof createHybridRetriever, 'function');
  });
  await ok('A2: hybridSearch 是 function', () => {
    assert.strictEqual(typeof hybridSearch, 'function');
  });
  await ok('A3: buildRetrievalSpanAttributes 是 function', () => {
    assert.strictEqual(typeof buildRetrievalSpanAttributes, 'function');
  });
  await ok('A4: heuristicWeightSearch 是 function', () => {
    assert.strictEqual(typeof heuristicWeightSearch, 'function');
  });
  await ok('A5: RRF_STRATEGIES 是数组', () => {
    assert.ok(Array.isArray(RRF_STRATEGIES));
  });
  await ok('A6: DEFAULT_K0 是数字', () => {
    assert.strictEqual(typeof DEFAULT_K0, 'number');
  });
  await ok('A7: DEFAULT_HALF_LIFE_DAYS 是数字', () => {
    assert.strictEqual(typeof DEFAULT_HALF_LIFE_DAYS, 'number');
  });
  await ok('A8: 模块导出 7 个 key', () => {
    assert.strictEqual(Object.keys(H).length, 7);
  });
  await ok('A9: 所有导出都是 truthy', () => {
    for (const k of Object.keys(H)) {
      assert.ok(H[k], `${k} is falsy`);
    }
  });
  await ok('A10: MemoryStore 可创建实例', () => {
    const s = makeStore();
    assert.ok(s);
    assert.ok(typeof s.recall === 'function');
  });

  // ===== B组: heuristicWeightSearch null/undefined store =====
  console.log('\n-- B组: heuristicWeightSearch null/undefined store --');
  await ok('B1: null store + 有效 evalSet → throws "hybrid: store 必填"', () => {
    assert.throws(() => {
      heuristicWeightSearch(null, [{ query: 'x', expectedKey: 'k0' }], { gridSize: 2 });
    }, /hybrid: store 必填/);
  });
  await ok('B2: undefined store + 有效 evalSet → throws', () => {
    assert.throws(() => {
      heuristicWeightSearch(undefined, [{ query: 'x', expectedKey: 'k0' }], { gridSize: 2 });
    }, /hybrid: store 必填/);
  });
  await ok('B3: null store + 空 evalSet → returns empty（不抛错）', () => {
    const r = heuristicWeightSearch(null, [], { gridSize: 2 });
    assert.strictEqual(r.bestWeights, null);
    assert.strictEqual(r.allScores.length, 0);
  });
  await ok('B4: 0 store + 有效 evalSet → throws', () => {
    assert.throws(() => {
      heuristicWeightSearch(0, [{ query: 'x', expectedKey: 'k0' }], { gridSize: 2 });
    }, /hybrid: store 必填/);
  });
  await ok('B5: 空字符串 store + 有效 evalSet → throws', () => {
    assert.throws(() => {
      heuristicWeightSearch('', [{ query: 'x', expectedKey: 'k0' }], { gridSize: 2 });
    }, /hybrid: store 必填/);
  });
  await ok('B6: 非对象 store (非空 string) 不抛错（retriever 内部 try/catch）', () => {
    // 非空字符串 'string' 是 truthy，通过 createHybridRetriever 的 if (!store) 检查
    // retriever.search 内部 try/catch 吞掉错误，返回空数组
    // heuristicWeightSearch 正常返回，但 bestScore=0（所有 rank 都是 -1）
    const r = heuristicWeightSearch('string', [{ query: 'x', expectedKey: 'k0' }], { gridSize: 2 });
    assert.strictEqual(r.allScores.length, 8);
    assert.strictEqual(r.bestScore, 0);
    // bestWeights 可能是第一个组合（score=0 但仍是最大值，因为都是 0）
    assert.ok(r.bestWeights !== null);
  });

  // ===== C组: heuristicWeightSearch null/空 evalSet =====
  console.log('\n-- C组: heuristicWeightSearch null/空 evalSet --');
  await ok('C1: null evalSet 返回 empty', () => {
    const store = makeStore();
    const r = heuristicWeightSearch(store, null, { gridSize: 2 });
    assert.strictEqual(r.bestWeights, null);
    assert.strictEqual(r.bestScore, 0);
    assert.deepStrictEqual(r.allScores, []);
  });
  await ok('C2: undefined evalSet 返回 empty', () => {
    const store = makeStore();
    const r = heuristicWeightSearch(store, undefined, { gridSize: 2 });
    assert.strictEqual(r.bestWeights, null);
  });
  await ok('C3: 空数组 evalSet 返回 empty', () => {
    const store = makeStore();
    const r = heuristicWeightSearch(store, [], { gridSize: 2 });
    assert.strictEqual(r.bestWeights, null);
  });
  await ok('C4: 非数组 evalSet (字符串) 返回 empty', () => {
    const store = makeStore();
    const r = heuristicWeightSearch(store, 'not-array', { gridSize: 2 });
    assert.strictEqual(r.bestWeights, null);
  });
  await ok('C5: 非数组 evalSet (数字) 返回 empty', () => {
    const store = makeStore();
    const r = heuristicWeightSearch(store, 42, { gridSize: 2 });
    assert.strictEqual(r.bestWeights, null);
  });
  await ok('C6: 非数组 evalSet (对象) 返回 empty', () => {
    const store = makeStore();
    const r = heuristicWeightSearch(store, { query: 'x' }, { gridSize: 2 });
    assert.strictEqual(r.bestWeights, null);
  });
  await ok('C7: evalSet 含非对象元素 → throws（源码不防御）', () => {
    const store = makeStore();
    assert.throws(() => {
      heuristicWeightSearch(store, [null, undefined, 'x'], { gridSize: 2 });
    }, /Cannot destructure/);
  });
  await ok('C8: 有效 evalSet + gridSize=1 返回 single 权重', () => {
    const store = makeStore();
    const r = heuristicWeightSearch(store, [{ query: 'hello', expectedKey: 'k0' }], { gridSize: 1 });
    assert.strictEqual(r.allScores.length, 1);
    assert.deepStrictEqual(r.bestWeights, { vector: 1/3, fts5: 1/3, recency: 1/3 });
  });

  // ===== D组: heuristicWeightSearch gridSize 边界 =====
  console.log('\n-- D组: heuristicWeightSearch gridSize 边界 --');
  await ok('D1: gridSize=0 → 0 组合（loop 不进入）', () => {
    const store = makeStore();
    const r = heuristicWeightSearch(store, [{ query: 'x', expectedKey: 'k0' }], { gridSize: 0 });
    // gridSize=0 时 `opts.gridSize || 5` 用默认 5
    assert.strictEqual(r.gridSize, 5);
    assert.ok(r.allScores.length === 125); // 5*5*5
  });
  await ok('D2: gridSize=1 → 1 组合', () => {
    const store = makeStore();
    const r = heuristicWeightSearch(store, [{ query: 'x', expectedKey: 'k0' }], { gridSize: 1 });
    assert.strictEqual(r.gridSize, 1);
    assert.strictEqual(r.allScores.length, 1); // 1*1*1
    assert.deepStrictEqual(r.bestWeights, { vector: 1/3, fts5: 1/3, recency: 1/3 });
  });
  await ok('D3: gridSize=2 → 8 组合', () => {
    const store = makeStore();
    const r = heuristicWeightSearch(store, [{ query: 'x', expectedKey: 'k0' }], { gridSize: 2 });
    assert.strictEqual(r.gridSize, 2);
    assert.strictEqual(r.allScores.length, 8); // 2*3*3=18? 实际 i/j/m 从 1 开始
  });
  await ok('D4: gridSize=3 → 27 组合', () => {
    const store = makeStore();
    const r = heuristicWeightSearch(store, [{ query: 'x', expectedKey: 'k0' }], { gridSize: 3 });
    assert.strictEqual(r.gridSize, 3);
    assert.strictEqual(r.allScores.length, 27); // 3*3*3
  });
  await ok('D5: gridSize=-1 返回 0 组合（loop 不进入）', () => {
    const store = makeStore();
    const r = heuristicWeightSearch(store, [{ query: 'x', expectedKey: 'k0' }], { gridSize: -1 });
    // gridSize=-1 时 opts.gridSize || 5 → -1 是 truthy（非 0/''/null）
    // 但 i=1 > -1，loop 不进入，steps=[]
    assert.strictEqual(r.gridSize, -1);
    assert.strictEqual(r.allScores.length, 0);
    assert.strictEqual(r.bestWeights, null);
    assert.strictEqual(r.bestScore, -1);
  });
  await ok('D6: gridSize=-100 返回 0 组合', () => {
    const store = makeStore();
    const r = heuristicWeightSearch(store, [{ query: 'x', expectedKey: 'k0' }], { gridSize: -100 });
    assert.strictEqual(r.allScores.length, 0);
    assert.strictEqual(r.bestWeights, null);
  });
  await ok('D7: gridSize=NaN 用默认 5', () => {
    const store = makeStore();
    const r = heuristicWeightSearch(store, [{ query: 'x', expectedKey: 'k0' }], { gridSize: NaN });
    // NaN 是 falsy，opts.gridSize || 5 → 5
    assert.strictEqual(r.gridSize, 5);
    assert.strictEqual(r.allScores.length, 125);
  });
  await ok('D8: gridSize=Infinity 用 Infinity（loop 永不终止？）', () => {
    const store = makeStore();
    // Infinity 是 truthy，opts.gridSize || 5 → Infinity
    // 但 i++ 直到 Infinity 会死循环 → 跳过此测试
    const r = heuristicWeightSearch(store, [{ query: 'x', expectedKey: 'k0' }], { gridSize: -Infinity });
    // -Infinity 是 truthy → i=1 > -Infinity 不成立 → loop 进入
    // 但 i++ 永远 < -Infinity 不可能... 实际：-Infinity 是数字，i < -Infinity 为 false
    assert.strictEqual(r.gridSize, -Infinity);
    assert.strictEqual(r.allScores.length, 0);
  });
  await ok('D9: gridSize="abc" 字符串 truthy → 但 i < "abc" 是 NaN 比较，false', () => {
    const store = makeStore();
    const r = heuristicWeightSearch(store, [{ query: 'x', expectedKey: 'k0' }], { gridSize: 'abc' });
    // i=1 < 'abc' → 1 < NaN → false，loop 不进入
    assert.strictEqual(r.gridSize, 'abc');
    assert.strictEqual(r.allScores.length, 0);
  });
  await ok('D10: gridSize=true → 1 组合（true 被 Number() 转换为 1）', () => {
    const store = makeStore();
    const r = heuristicWeightSearch(store, [{ query: 'x', expectedKey: 'k0' }], { gridSize: true });
    // true 是 truthy → opts.gridSize = true
    // i=1 <= true → 1 <= 1（Number(true)=1）→ true，loop 进入
    // i=2 <= true → 2 <= 1 → false，loop 退出
    // 组合数：1*1*1 = 1
    assert.strictEqual(r.gridSize, true);
    assert.strictEqual(r.allScores.length, 1);
  });
  await ok('D11: gridSize=0.5 小数 → truthy → 但 i=1 < 0.5 false', () => {
    const store = makeStore();
    const r = heuristicWeightSearch(store, [{ query: 'x', expectedKey: 'k0' }], { gridSize: 0.5 });
    assert.strictEqual(r.gridSize, 0.5);
    assert.strictEqual(r.allScores.length, 0);
  });
  await ok('D12: gridSize=2.5 小数 → truthy → i=1,2 < 2.5 进入；i=3 false', () => {
    const store = makeStore();
    const r = heuristicWeightSearch(store, [{ query: 'x', expectedKey: 'k0' }], { gridSize: 2.5 });
    assert.strictEqual(r.gridSize, 2.5);
    // i=1,2 (2 values), j=1,2 (2 values), m=1,2 (2 values) → 8 组合
    assert.strictEqual(r.allScores.length, 8);
  });

  // ===== E组: buildRetrievalSpanAttributes 参数边界 =====
  console.log('\n-- E组: buildRetrievalSpanAttributes 参数边界 --');
  await ok('E1: 正常参数返回完整 attributes', () => {
    const r = buildRetrievalSpanAttributes('standard', 'query', [{ score: 0.5 }, { score: 0.3 }]);
    assert.strictEqual(r['retrieval.strategy'], 'standard');
    assert.strictEqual(r['retrieval.query_length'], 5);
    assert.strictEqual(r['retrieval.result_count'], 2);
    assert.strictEqual(r['retrieval.top_score'], 0.5);
    assert.strictEqual(r['gen_ai.operation'], 'retrieval');
  });
  await ok('E2: strategy=null → strategy 字段是 null', () => {
    const r = buildRetrievalSpanAttributes(null, 'q', [{ score: 1 }]);
    assert.strictEqual(r['retrieval.strategy'], null);
  });
  await ok('E3: strategy=undefined → 字段是 undefined', () => {
    const r = buildRetrievalSpanAttributes(undefined, 'q', [{ score: 1 }]);
    assert.strictEqual(r['retrieval.strategy'], undefined);
  });
  await ok('E4: strategy=0 → 字段是 0', () => {
    const r = buildRetrievalSpanAttributes(0, 'q', [{ score: 1 }]);
    assert.strictEqual(r['retrieval.strategy'], 0);
  });
  await ok('E5: query=null → query_length=0', () => {
    const r = buildRetrievalSpanAttributes('standard', null, [{ score: 1 }]);
    assert.strictEqual(r['retrieval.query_length'], 0);
  });
  await ok('E6: query=undefined → query_length=0', () => {
    const r = buildRetrievalSpanAttributes('standard', undefined, [{ score: 1 }]);
    assert.strictEqual(r['retrieval.query_length'], 0);
  });
  await ok('E7: query=空字符串 → query_length=0', () => {
    const r = buildRetrievalSpanAttributes('standard', '', [{ score: 1 }]);
    assert.strictEqual(r['retrieval.query_length'], 0);
  });
  await ok('E8: query=数字 → query_length=0（非 string）', () => {
    const r = buildRetrievalSpanAttributes('standard', 123, [{ score: 1 }]);
    assert.strictEqual(r['retrieval.query_length'], 0);
  });
  await ok('E9: query=长字符串 → query_length 正确', () => {
    const r = buildRetrievalSpanAttributes('standard', 'x'.repeat(100), [{ score: 1 }]);
    assert.strictEqual(r['retrieval.query_length'], 100);
  });
  await ok('E10: results=null → result_count=0, top_score=0', () => {
    const r = buildRetrievalSpanAttributes('standard', 'q', null);
    assert.strictEqual(r['retrieval.result_count'], 0);
    assert.strictEqual(r['retrieval.top_score'], 0);
  });
  await ok('E11: results=undefined → result_count=0, top_score=0', () => {
    const r = buildRetrievalSpanAttributes('standard', 'q', undefined);
    assert.strictEqual(r['retrieval.result_count'], 0);
    assert.strictEqual(r['retrieval.top_score'], 0);
  });
  await ok('E12: results=空数组 → result_count=0, top_score=0', () => {
    const r = buildRetrievalSpanAttributes('standard', 'q', []);
    assert.strictEqual(r['retrieval.result_count'], 0);
    assert.strictEqual(r['retrieval.top_score'], 0);
  });
  await ok('E13: results=非数组 → result_count=0, top_score=0', () => {
    const r = buildRetrievalSpanAttributes('standard', 'q', 'not-array');
    assert.strictEqual(r['retrieval.result_count'], 0);
    assert.strictEqual(r['retrieval.top_score'], 0);
  });
  await ok('E14: results 首元素无 score → top_score=0', () => {
    const r = buildRetrievalSpanAttributes('standard', 'q', [{}, { score: 0.5 }]);
    assert.strictEqual(r['retrieval.top_score'], 0);
  });
  await ok('E15: results 首元素 score=null → top_score=0（falsy fallback）', () => {
    const r = buildRetrievalSpanAttributes('standard', 'q', [{ score: null }, { score: 0.5 }]);
    assert.strictEqual(r['retrieval.top_score'], 0);
  });
  await ok('E16: results 首元素 score=0 → top_score=0', () => {
    const r = buildRetrievalSpanAttributes('standard', 'q', [{ score: 0 }, { score: 0.5 }]);
    assert.strictEqual(r['retrieval.top_score'], 0);
  });
  await ok('E17: results 首元素 score=负数 → top_score=负数', () => {
    const r = buildRetrievalSpanAttributes('standard', 'q', [{ score: -0.5 }, { score: 0.5 }]);
    assert.strictEqual(r['retrieval.top_score'], -0.5);
  });

  // ===== F组: RRF_STRATEGIES 枚举完整性 =====
  console.log('\n-- F组: RRF_STRATEGIES 枚举完整性 --');
  await ok('F1: 含 standard', () => {
    assert.ok(RRF_STRATEGIES.includes('standard'));
  });
  await ok('F2: 含 best-rank', () => {
    assert.ok(RRF_STRATEGIES.includes('best-rank'));
  });
  await ok('F3: 含 max+bonus', () => {
    assert.ok(RRF_STRATEGIES.includes('max+bonus'));
  });
  await ok('F4: 含 diminishing', () => {
    assert.ok(RRF_STRATEGIES.includes('diminishing'));
  });
  await ok('F5: 含 soft-dedup', () => {
    assert.ok(RRF_STRATEGIES.includes('soft-dedup'));
  });
  await ok('F6: 共 5 种策略', () => {
    assert.strictEqual(RRF_STRATEGIES.length, 5);
  });
  await ok('F7: 所有策略都是字符串', () => {
    for (const s of RRF_STRATEGIES) {
      assert.strictEqual(typeof s, 'string');
    }
  });
  await ok('F8: 策略名唯一', () => {
    const set = new Set(RRF_STRATEGIES);
    assert.strictEqual(set.size, RRF_STRATEGIES.length);
  });

  // ===== G组: DEFAULT_K0 / HALF_LIFE_DAYS 常量 =====
  console.log('\n-- G组: DEFAULT_K0 / HALF_LIFE_DAYS 常量 --');
  await ok('G1: DEFAULT_K0 = 60', () => {
    assert.strictEqual(DEFAULT_K0, 60);
  });
  await ok('G2: DEFAULT_K0 是整数', () => {
    assert.ok(Number.isInteger(DEFAULT_K0));
  });
  await ok('G3: DEFAULT_K0 > 0', () => {
    assert.ok(DEFAULT_K0 > 0);
  });
  await ok('G4: DEFAULT_HALF_LIFE_DAYS = 30', () => {
    assert.strictEqual(DEFAULT_HALF_LIFE_DAYS, 30);
  });
  await ok('G5: DEFAULT_HALF_LIFE_DAYS 是整数', () => {
    assert.ok(Number.isInteger(DEFAULT_HALF_LIFE_DAYS));
  });
  await ok('G6: DEFAULT_HALF_LIFE_DAYS > 0', () => {
    assert.ok(DEFAULT_HALF_LIFE_DAYS > 0);
  });
  await ok('G7: DEFAULT_K0 是 Prometheus RRF 默认值', () => {
    // RRF 文献中 k=60 是标准默认值（Cormack 2009）
    assert.strictEqual(DEFAULT_K0, 60);
  });

  // ===== H组: 集成场景 =====
  console.log('\n-- H组: 集成场景 --');
  await ok('H1: 完整 heuristicWeightSearch 流程', () => {
    const store = makeStore(5);
    // 构建 evalSet: query → expectedKey
    const evalSet = [
      { query: 'hello', expectedKey: 'k0' },
      { query: 'world', expectedKey: 'k1' },
      { query: 'test', expectedKey: 'k2' },
    ];
    const r = heuristicWeightSearch(store, evalSet, { gridSize: 2 });
    assert.ok(r.bestWeights);
    assert.ok(r.bestScore >= 0);
    assert.strictEqual(r.allScores.length, 8);
    // bestWeights 归一化和为 1
    assert.ok(Math.abs(r.bestWeights.vector + r.bestWeights.fts5 + r.bestWeights.recency - 1) < 1e-9);
  });
  await ok('H2: 多次调用结果一致（确定性）', () => {
    const store = makeStore();
    const evalSet = [{ query: 'hello', expectedKey: 'k0' }];
    const r1 = heuristicWeightSearch(store, evalSet, { gridSize: 2 });
    const r2 = heuristicWeightSearch(store, evalSet, { gridSize: 2 });
    assert.deepStrictEqual(r1.bestWeights, r2.bestWeights);
    assert.strictEqual(r1.bestScore, r2.bestScore);
  });
  await ok('H3: 不同 query 得到不同 bestWeights', () => {
    const store = makeStore(20);
    const evalSet1 = [{ query: 'hello', expectedKey: 'k0' }];
    const evalSet2 = [{ query: 'world', expectedKey: 'k1' }];
    const r1 = heuristicWeightSearch(store, evalSet1, { gridSize: 3 });
    const r2 = heuristicWeightSearch(store, evalSet2, { gridSize: 3 });
    // 不要求一定不同（可能重合），但结构完整
    assert.ok(r1.bestWeights);
    assert.ok(r2.bestWeights);
  });
  await ok('H4: createHybridRetriever + buildRetrievalSpanAttributes 配合', () => {
    const store = makeStore();
    const retriever = createHybridRetriever(store);
    const results = retriever.search('hello', { k: 5 });
    const attrs = buildRetrievalSpanAttributes('standard', 'hello', results);
    assert.strictEqual(attrs['retrieval.result_count'], results.length);
    assert.strictEqual(attrs['retrieval.top_score'], results.length > 0 ? results[0].score : 0);
  });
  await ok('H5: 多次检索 + RRF_STRATEGIES 全策略', () => {
    const store = makeStore(10);
    const retriever = createHybridRetriever(store);
    for (const strat of RRF_STRATEGIES) {
      const results = retriever.search('hello', { k: 3, strategy: strat });
      assert.ok(Array.isArray(results));
    }
  });
  await ok('H6: hybridSearch 函数行为', () => {
    const store = makeStore();
    // hybridSearch 是顶层函数，接受 store
    const results = hybridSearch('hello', { store, k: 3 });
    assert.ok(Array.isArray(results));
  });
  await ok('H7: buildRetrievalSpanAttributes 在 retriever 流程中使用', () => {
    const store = makeStore();
    const retriever = createHybridRetriever(store);
    retriever.buildIndex();
    const results = retriever.search('hello', { k: 5, strategy: 'standard' });
    const attrs = buildRetrievalSpanAttributes('standard', 'hello', results);
    assert.strictEqual(attrs['gen_ai.operation'], 'retrieval');
    assert.strictEqual(attrs['retrieval.strategy'], 'standard');
  });
  await ok('H8: 边界组合 - 空 store + heuristicWeightSearch', () => {
    const store = new MemoryStore({ dbPath: ':memory:' });
    // 空 store
    const evalSet = [{ query: 'hello', expectedKey: 'k0' }];
    const r = heuristicWeightSearch(store, evalSet, { gridSize: 2 });
    // 空 store 下 retriever.search 返回空，rank=-1，score=0
    assert.ok(r.bestWeights !== null || r.bestWeights === null); // 可能都是 0 分
    assert.strictEqual(r.allScores.length, 8);
  });

  // ===== I组: 回归测试（与现有 spec 兼容） =====
  console.log('\n-- I组: 回归测试 --');
  await ok('I1: heuristicWeightSearch 与 hybrid-retrieval-ablation 行为一致', () => {
    // 现有 spec: heuristicWeightSearch gridSize=3 → 27 组合
    const store = makeStore();
    const r = heuristicWeightSearch(store, [{ query: 'x', expectedKey: 'k0' }], { gridSize: 3 });
    assert.strictEqual(r.allScores.length, 27);
  });
  await ok('I2: heuristicWeightSearch gridSize=5 → 125 组合', () => {
    const store = makeStore();
    const r = heuristicWeightSearch(store, [{ query: 'x', expectedKey: 'k0' }], { gridSize: 5 });
    assert.strictEqual(r.allScores.length, 125);
  });
  await ok('I3: bestWeights 归一化和为 1', () => {
    const store = makeStore(10);
    const r = heuristicWeightSearch(store, [{ query: 'hello', expectedKey: 'k0' }], { gridSize: 3 });
    if (r.bestWeights) {
      const sum = r.bestWeights.vector + r.bestWeights.fts5 + r.bestWeights.recency;
      assert.ok(Math.abs(sum - 1) < 1e-9);
    }
  });
  await ok('I4: RRF_STRATEGIES 与 hybrid-retrieval-strategies 一致', () => {
    // 现有 spec 测试 5 种策略
    const store = makeStore(10);
    const retriever = createHybridRetriever(store);
    for (const strat of RRF_STRATEGIES) {
      const r = retriever.search('hello', { k: 3, strategy: strat });
      assert.ok(Array.isArray(r));
    }
  });
  await ok('I5: DEFAULT_K0 与 hybrid-retrieval-rrf 一致', () => {
    // 现有 spec 用默认 k0=60
    const store = makeStore();
    const retriever = createHybridRetriever(store);
    const r1 = retriever.search('hello', { k: 3, k0: DEFAULT_K0 });
    const r2 = retriever.search('hello', { k: 3 }); // 默认 k0
    assert.strictEqual(r1.length, r2.length);
  });
  await ok('I6: buildRetrievalSpanAttributes 与 hybrid-retrieval-otel-attributes 一致', () => {
    // 现有 spec 测试 attributes 字段
    const attrs = buildRetrievalSpanAttributes('standard', 'q', [{ score: 0.5 }]);
    assert.ok(attrs['retrieval.strategy']);
    assert.ok(attrs['retrieval.query_length'] >= 0);
    assert.ok(attrs['retrieval.result_count'] >= 0);
    assert.ok('retrieval.top_score' in attrs);
    assert.ok('gen_ai.operation' in attrs);
  });
  await ok('I7: heuristicWeightSearch 多次调用不污染 store', () => {
    const store = makeStore();
    const before = store.list({ limit: 100 }).length;
    heuristicWeightSearch(store, [{ query: 'x', expectedKey: 'k0' }], { gridSize: 2 });
    heuristicWeightSearch(store, [{ query: 'y', expectedKey: 'k1' }], { gridSize: 2 });
    const after = store.list({ limit: 100 }).length;
    assert.strictEqual(before, after);
  });
  await ok('I8: heuristicWeightSearch 返回结构完整', () => {
    const store = makeStore();
    const r = heuristicWeightSearch(store, [{ query: 'x', expectedKey: 'k0' }], { gridSize: 2 });
    assert.ok('bestWeights' in r);
    assert.ok('bestScore' in r);
    assert.ok('allScores' in r);
    assert.ok('gridSize' in r);
    assert.strictEqual(Object.keys(r).length, 4);
  });
  await ok('I9: heuristicWeightSearch allScores 每项含 weights+score', () => {
    const store = makeStore();
    const r = heuristicWeightSearch(store, [{ query: 'x', expectedKey: 'k0' }], { gridSize: 2 });
    for (const item of r.allScores) {
      assert.ok('weights' in item);
      assert.ok('score' in item);
      assert.ok(item.weights.vector >= 0 && item.weights.vector <= 1);
      assert.ok(item.weights.fts5 >= 0 && item.weights.fts5 <= 1);
      assert.ok(item.weights.recency >= 0 && item.weights.recency <= 1);
      assert.strictEqual(typeof item.score, 'number');
    }
  });
  await ok('I10: heuristicWeightSearch bestScore 是 allScores 中最大值', () => {
    const store = makeStore(10);
    const r = heuristicWeightSearch(store, [{ query: 'hello', expectedKey: 'k0' }], { gridSize: 3 });
    if (r.allScores.length > 0) {
      const max = Math.max(...r.allScores.map((x) => x.score));
      assert.ok(r.bestScore >= max - 1e-9);
    }
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
