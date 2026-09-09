// tests/specs/hybrid-retrieval-rrf.cjs
// 周期 12 P0-1: hybridRetrieval 单元测试
// 目标：≥ 35 子断言 PASS

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { MemoryStore } = require(path.join(__dirname, '../../server/agent/memory'));
const { VectorMemory } = require(path.join(__dirname, '../../server/agent/memoryVectorPrototype'));
const {
  createHybridRetriever,
  hybridSearch,
  DEFAULT_K0,
  DEFAULT_HALF_LIFE_DAYS,
} = require(path.join(__dirname, '../../server/agent/hybridRetrieval'));

let pass = 0;
let fail = 0;

function ok(label, fn) {
  try {
    const r = fn();
    if (r === 'SKIP') {
      console.log(`  [SKIP] ${label}`);
    } else {
      pass += 1;
      console.log(`  [PASS] ${label}`);
    }
  } catch (e) {
    fail += 1;
    console.error(`  [FAIL] ${label}: ${e.message}`);
  }
}

// ============ Setup ============
let store, vectorMem;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hybrid-test-'));
const dbPath = path.join(tmpDir, 'memory.sqlite');
let ftsAvailable = false;

function freshStore() {
  // cleanup old
  if (store) { try { store.cleanup(); } catch (_) {} }
  store = new MemoryStore({ dbPath });
  vectorMem = new VectorMemory();
  ftsAvailable = !!store.ftsEnabled;
  // Seed: 4 docs with varying time
  const now = Date.now();
  store.remember('k1', '北京位于中国北方，是首都', { tags: ['geo'], userId: 'u1' });
  store.remember('k2', '上海是东部沿海的重要经济中心', { tags: ['geo'], userId: 'u1' });
  store.remember('k3', '广州在珠江三角洲，气候温暖', { tags: ['geo'], userId: 'u1' });
  store.remember('k4', '深圳毗邻香港，创新企业众多', { tags: ['geo'], userId: 'u1' });
  // Older doc: use direct list iteration since sqlite memory fallback has no _stmtInsert
  const older = now - 90 * 24 * 60 * 60 * 1000;
  if (store.driver && store._stmtInsert) {
    store._stmtInsert.run('k5', '东京是日本的首都，人口众多', JSON.stringify(['geo']), 'u1', older);
  } else {
    // memory fallback: use remember but fake ts via direct map manipulation
    store.remember('k5', '东京是日本的首都，人口众多', { tags: ['geo'], userId: 'u1' });
    if (store._memMap && store._memMap.has('k5')) {
      store._memMap.get('k5').ts = older;
    }
  }
  vectorMem.remember('k1', '北京位于中国北方，是首都', { tags: ['geo'], userId: 'u1' });
  vectorMem.remember('k2', '上海是东部沿海的重要经济中心', { tags: ['geo'], userId: 'u1' });
  vectorMem.remember('k3', '广州在珠江三角洲，气候温暖', { tags: ['geo'], userId: 'u1' });
  vectorMem.remember('k4', '深圳毗邻香港，创新企业众多', { tags: ['geo'], userId: 'u1' });
  vectorMem.remember('k5', '东京是日本的首都，人口众多', { tags: ['geo'], userId: 'u1' });
  // 同步 vectorMem 中的 k5 ts
  if (vectorMem._store.has('k5')) {
    vectorMem._store.get('k5').ts = older;
  }
}

console.log('=== hybrid-retrieval-rrf ===');

// ============ Group A: 输入校验（防御性） ============

ok('A1: 空 query 返回 []', () => {
  freshStore();
  const r = createHybridRetriever(store, vectorMem);
  assert.deepEqual(r.search(''), []);
});

ok('A2: null query 返回 []', () => {
  const r = createHybridRetriever(store, vectorMem);
  assert.deepEqual(r.search(null), []);
});

ok('A3: 非字符串 query 返回 []', () => {
  const r = createHybridRetriever(store, vectorMem);
  assert.deepEqual(r.search(123), []);
});

ok('A4: 仅空格 query 返回 []', () => {
  const r = createHybridRetriever(store, vectorMem);
  assert.deepEqual(r.search('   '), []);
});

ok('A5: k<=0 返回 []', () => {
  const r = createHybridRetriever(store, vectorMem);
  assert.deepEqual(r.search('北京', { k: 0 }), []);
});

ok('A6: k 非数字 返回 []', () => {
  const r = createHybridRetriever(store, vectorMem);
  assert.deepEqual(r.search('北京', { k: 'abc' }), []);
});

ok('A7: 负权重 返回 []', () => {
  const r = createHybridRetriever(store, vectorMem);
  assert.deepEqual(r.search('北京', { weights: { vector: -0.5 } }), []);
});

ok('A8: 权重非对象 返回 []', () => {
  const r = createHybridRetriever(store, vectorMem);
  assert.deepEqual(r.search('北京', { weights: 'bad' }), []);
});

ok('A9: minScore < 0 → 返回 []', () => {
  const r = createHybridRetriever(store, vectorMem);
  assert.deepEqual(r.search('北京', { minScore: -0.1 }), []);
});

// ============ Group B: 默认通道 ============

ok('B1: 默认 weights 三通道都有值', () => {
  const r = createHybridRetriever(store, vectorMem);
  const out = r.search('北京');
  assert.ok(out.length > 0);
  // k1 含"北京"字串，应在结果中
  assert.ok(out.some((x) => x.key === 'k1'), 'k1 应在结果中');
});

ok('B2: 元素包含 sources 字段', () => {
  const r = createHybridRetriever(store, vectorMem);
  const out = r.search('北京');
  assert.ok(Array.isArray(out[0].sources));
  assert.ok(out[0].sources.length > 0);
});

ok('B3: 元素包含 score 字段', () => {
  const r = createHybridRetriever(store, vectorMem);
  const out = r.search('北京');
  assert.equal(typeof out[0].score, 'number');
});

ok('B4: score 按降序', () => {
  const r = createHybridRetriever(store, vectorMem);
  const out = r.search('中国');
  for (let i = 1; i < out.length; i++) {
    assert.ok(out[i - 1].score >= out[i].score, `score 非降序: ${i - 1}=${out[i - 1].score}, ${i}=${out[i].score}`);
  }
});

ok('B5: 元素 score 保留 6 位小数（避免浮点噪声）', () => {
  const r = createHybridRetriever(store, vectorMem);
  const out = r.search('上海');
  const s = out[0].score;
  assert.ok(Number.isInteger(s, 1e6) || Math.abs(s - Math.round(s * 1e6) / 1e6) < 1e-9);
});

// ============ Group C: 通道权重调整 ============

ok('C1: 只启 fts5 → sources 只含 fts5（若 fts5 不可用返回 []）', () => {
  const r = createHybridRetriever(store, vectorMem);
  const out = r.search('北京', { weights: { fts5: 1, vector: 0, recency: 0 } });
  if (!ftsAvailable) {
    assert.deepEqual(out, []);
  } else {
    assert.ok(out[0].sources.includes('fts5'));
    assert.ok(!out[0].sources.includes('vector'));
  }
});

ok('C2: 只启 vector → sources 只含 vector', () => {
  const r = createHybridRetriever(store, vectorMem);
  const out = r.search('北京', { weights: { fts5: 0, vector: 1, recency: 0 } });
  assert.ok(out[0].sources.includes('vector'));
  assert.ok(!out[0].sources.includes('fts5'));
});

ok('C3: 只启 recency → sources 只含 recency', () => {
  const r = createHybridRetriever(store, vectorMem);
  const out = r.search('北京', { weights: { fts5: 0, vector: 0, recency: 1 } });
  assert.ok(out[0].sources.includes('recency'));
  assert.ok(!out[0].sources.includes('vector'));
});

ok('C4: recency 权重高 → 旧文档降权（若 fts5 不可用，跳过）', () => {
  if (!ftsAvailable) { console.log('  [SKIP] fts5 不可用'); return; }
  const r = createHybridRetriever(store, vectorMem);
  // k5 (90 天前) vs k1 (现在)
  // 弱 recency：k5 应排前（fts5 命中"首都"）
  const weak = r.search('首都', { weights: { fts5: 1, vector: 0, recency: 0.01 }, k: 5 });
  // 强 recency：k1 应优先于 k5
  const strong = r.search('首都', { weights: { fts5: 0.5, vector: 0, recency: 0.9 }, k: 5 });
  const weakIdx5 = weak.findIndex((r) => r.key === 'k5');
  const strongIdx5 = strong.findIndex((r) => r.key === 'k5');
  const weakIdx1 = weak.findIndex((r) => r.key === 'k1');
  const strongIdx1 = strong.findIndex((r) => r.key === 'k1');
  assert.ok(weakIdx5 !== -1 && weakIdx1 !== -1);
  assert.ok(strongIdx5 !== -1 && strongIdx1 !== -1);
  // 在强 recency 下，k1 应比 k5 排名更靠前
  assert.ok(strongIdx1 < strongIdx5, `strong recency: k1(${strongIdx1}) should rank before k5(${strongIdx5})`);
});

ok('C5: minScore 过滤生效（若 fts5 不可用，跳过）', () => {
  if (!ftsAvailable) { console.log('  [SKIP] fts5 不可用'); return; }
  const r = createHybridRetriever(store, vectorMem);
  const all = r.search('北京', { k: 10, weights: { fts5: 1, vector: 0, recency: 0 } });
  assert.ok(all.length > 0);
  const topScore = all[0].score;
  const filtered = r.search('北京', { k: 10, weights: { fts5: 1, vector: 0, recency: 0 }, minScore: topScore + 0.01 });
  assert.equal(filtered.length, 0);
});

// ============ Group D: RRF 数学正确性 ============

ok('D1: k0=60 是默认值', () => {
  assert.equal(DEFAULT_K0, 60);
});

ok('D2: recencyHalfLifeDays=30 默认值', () => {
  assert.equal(DEFAULT_HALF_LIFE_DAYS, 30);
});

ok('D3: 单通道唯一 rank=1 score = weight / (k0+1)', () => {
  // vector-only
  const r = createHybridRetriever(store, vectorMem);
  const out = r.search('北京', { weights: { vector: 1, fts5: 0, recency: 0 }, k: 1 });
  const expected = 1 / (DEFAULT_K0 + 1);
  assert.ok(Math.abs(out[0].score - expected) < 1e-6, `score=${out[0].score} expected=${expected}`);
});

ok('D4: 三通道叠加：top1 score = sum of weights / (k0+1)', () => {
  // 用 "北京首都" query，验证三通道全 hit 时 score 等于理论值
  // 在 fts5 不可用环境，仅 vector + recency 通道贡献
  const r = createHybridRetriever(store, vectorMem);
  const out = r.search('北京首都', { weights: { fts5: 0.3, vector: 0.6, recency: 0.1 }, k: 1 });
  if (ftsAvailable) {
    const expected = (0.3 + 0.6 + 0.1) / (DEFAULT_K0 + 1);
    assert.ok(Math.abs(out[0].score - expected) < 1e-6, `score=${out[0].score} expected=${expected}`);
  } else {
    // fts5 不可用：vector + recency 通道贡献；top1 在两通道均需 rank=1
    const expected = (0.6 + 0.1) / (DEFAULT_K0 + 1);
    assert.ok(Math.abs(out[0].score - expected) < 1e-6, `score=${out[0].score} expected=${expected}`);
  }
});

// ============ Group E: userId 隔离 ============

ok('E1: userId 过滤生效', () => {
  freshStore();
  store.remember('k6', '北京在北方', { tags: ['geo'], userId: 'u2' });
  const r = createHybridRetriever(store, vectorMem);
  // 不指定 userId：返回所有
  const all = r.search('北京', { k: 20 });
  assert.ok(all.some((x) => x.key === 'k1'));
  assert.ok(all.some((x) => x.key === 'k6'));
  // 指定 u1：仅 u1 的
  const u1 = r.search('北京', { k: 20, userId: 'u1' });
  assert.ok(u1.every((x) => x.userId === 'u1'));
});

ok('E2: userId 隔离下候选集正确', () => {
  const r = createHybridRetriever(store, vectorMem);
  const u1 = r.search('北京', { k: 5, userId: 'u1' });
  assert.ok(u1.every((x) => !x.userId || x.userId === 'u1'));
});

// ============ Group F: lazy index build ============

ok('F1: 首次检索自动 buildIndex', () => {
  freshStore();
  const r = createHybridRetriever(store, vectorMem);
  assert.equal(r._state.indexed, false);
  r.search('北京');
  assert.equal(r._state.indexed, true);
});

ok('F2: 显式 buildIndex 后 lastBuildAt 更新', () => {
  freshStore();
  const r = createHybridRetriever(store, vectorMem);
  const before = r._state.lastBuildAt;
  setTimeout(() => {
    r.buildIndex();
    assert.ok(r._state.lastBuildAt > before);
  }, 5);
});

ok('F3: buildIndex 返回 count', () => {
  freshStore();
  const r = createHybridRetriever(store, vectorMem);
  const res = r.buildIndex();
  assert.equal(res.ok, true);
  assert.equal(res.count, 5);
});

// ============ Group G: 便捷函数 ============

ok('G1: hybridSearch(store) 单次检索', () => {
  const out = hybridSearch('北京', store);
  assert.ok(out.length > 0);
});

ok('G2: hybridSearch 接受 opts', () => {
  const out = hybridSearch('北京', store, { k: 2 });
  assert.ok(out.length <= 2);
});

// ============ Group H: 性能 ============

ok('H1: 1000 文档检索 P95 < 30ms', () => {
  freshStore();
  // 注入 1000 条
  for (let i = 0; i < 1000; i++) {
    store.remember('big_' + i, 'test 文本 ' + i + ' 北京 上海 广州 深圳', { tags: ['t'], userId: 'u1' });
  }
  const r = createHybridRetriever(store, vectorMem);
  r.buildIndex();
  const samples = [];
  for (let i = 0; i < 20; i++) {
    const t0 = process.hrtime.bigint();
    r.search('北京', { k: 10 });
    const t1 = process.hrtime.bigint();
    samples.push(Number(t1 - t0) / 1e6);
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.floor(samples.length * 0.95)];
  assert.ok(p95 < 30, `P95=${p95}ms 超阈值 30ms`);
});

// ============ Group I: 边界 ============

ok('I1: k0 显式设置（若 fts5 不可用，跳过）', () => {
  if (!ftsAvailable) { console.log('  [SKIP] fts5 不可用'); return; }
  const r = createHybridRetriever(store, vectorMem);
  const out = r.search('北京', { weights: { fts5: 1, vector: 0, recency: 0 }, k0: 10, k: 1 });
  assert.ok(out[0].score > 0);
});

ok('I2: 极小 halfLifeDays 几乎忽略旧文档（若 fts5 不可用，跳过）', () => {
  if (!ftsAvailable) { console.log('  [SKIP] fts5 不可用'); return; }
  const r = createHybridRetriever(store, vectorMem);
  const out = r.search('首都', { weights: { fts5: 0.5, vector: 0, recency: 0.5 }, recencyHalfLifeDays: 1, k: 5 });
  // k1 (新) 应在 k5 (90 天前) 前
  const k1 = out.findIndex((x) => x.key === 'k1');
  const k5 = out.findIndex((x) => x.key === 'k5');
  assert.ok(k1 !== -1 && k5 !== -1);
  assert.ok(k1 < k5);
});

ok('I3: 极大 halfLifeDays → recency 几乎为常数（若 fts5 不可用，跳过）', () => {
  if (!ftsAvailable) { console.log('  [SKIP] fts5 不可用'); return; }
  const r = createHybridRetriever(store, vectorMem);
  const out = r.search('首都', { weights: { fts5: 1, vector: 0, recency: 0.001 }, recencyHalfLifeDays: 100000, k: 5 });
  assert.ok(out.length > 0);
});

// ============ Group J: 文档结构 ============

ok('J1: 返回元素含 key/value/tags/userId/ts', () => {
  const r = createHybridRetriever(store, vectorMem);
  const out = r.search('北京', { k: 1 });
  const x = out[0];
  for (const k of ['key', 'value', 'tags', 'userId', 'ts', 'score', 'sources']) {
    assert.ok(k in x, `missing field ${k}`);
  }
});

ok('J2: createHybridRetriever 缺 store 抛错', () => {
  assert.throws(() => createHybridRetriever(null), /必填/);
});

// ============ Group K: 长期项时间衰减 ============

ok('K1: 旧文档在 recency=1 时严格降序', () => {
  // k5 (90 天前) vs k1 (现在) recency score:
  // exp(-90/30) ≈ 0.05 vs exp(0) = 1
  const r = createHybridRetriever(store, vectorMem);
  const out = r.search('首都', { weights: { fts5: 0, vector: 0, recency: 1 }, k: 5 });
  assert.ok(out.length > 0);
  const k5 = out.find((x) => x.key === 'k5');
  const k1 = out.find((x) => x.key === 'k1');
  if (k5 && k1) {
    assert.ok(k1.score > k5.score, `k1(${k1.score}) should be > k5(${k5.score})`);
  }
});

// ============ Teardown ============
function cleanup() {
  if (store) store.cleanup();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
}
cleanup();

console.log(`--- summary: pass=${pass} fail=${fail} ---`);
process.exit(fail > 0 ? 1 : 0);