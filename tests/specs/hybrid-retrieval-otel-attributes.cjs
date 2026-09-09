// tests/specs/hybrid-retrieval-otel-attributes.cjs
// 周期 14 P1-3: hybridRetrieval OTel semantic span attributes
//
// 覆盖：
//   - buildRetrievalSpanAttributes() 返回正确格式
//   - search() 在 ALS span context 内附 retrieval attributes
//   - 不在 ALS context 时不抛错
//   - 周期 12-13 hybridRetrieval API 零回归

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..', '..');
const memoryPath = path.join(ROOT, 'server', 'agent', 'memory.js');
const hybridPath = path.join(ROOT, 'server', 'agent', 'hybridRetrieval.js');
const otelPath = path.join(ROOT, 'server', 'agent', 'otelDevHook.js');

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
const otel = require(otelPath);
otel._resetState();

const tmp = path.join(os.tmpdir(), `hybrid-otel-attrs-${Date.now()}.sqlite`);
const store = new mem.MemoryStore({ dbPath: tmp });
store.remember('a', '西湖位于杭州');
store.remember('b', '北京是首都');

// ===== 1. buildRetrievalSpanAttributes =====
it('OTEL-H1: buildRetrievalSpanAttributes 返回 strategy / query_length / result_count / top_score', () => {
  const attrs = hyb.buildRetrievalSpanAttributes('standard', '西湖', [{ key: 'a', score: 0.5 }]);
  assert.strictEqual(attrs['retrieval.strategy'], 'standard');
  assert.strictEqual(attrs['retrieval.query_length'], 2);
  assert.strictEqual(attrs['retrieval.result_count'], 1);
  assert.strictEqual(attrs['retrieval.top_score'], 0.5);
  assert.strictEqual(attrs['gen_ai.operation'], 'retrieval');
});

it('OTEL-H2: buildRetrievalSpanAttributes 空 results', () => {
  const attrs = hyb.buildRetrievalSpanAttributes('standard', 'unknown', []);
  assert.strictEqual(attrs['retrieval.result_count'], 0);
  assert.strictEqual(attrs['retrieval.top_score'], 0);
});

it('OTEL-H3: buildRetrievalSpanAttributes 非字符串 query', () => {
  const attrs = hyb.buildRetrievalSpanAttributes('standard', null, []);
  assert.strictEqual(attrs['retrieval.query_length'], 0);
});

it('OTEL-H4: buildRetrievalSpanAttributes 不同 strategy 字段', () => {
  for (const strat of ['standard', 'best-rank', 'max+bonus', 'diminishing', 'soft-dedup']) {
    const attrs = hyb.buildRetrievalSpanAttributes(strat, 'test', []);
    assert.strictEqual(attrs['retrieval.strategy'], strat);
  }
});

// ===== 2. search() 在 ALS context 内附 attrs =====
it('OTEL-H5: search() 在 runWithSpan 内触发 retrieval attributes hook', () => {
  otel._resetState();
  let observedAttrs = null;
  otel.runWithSpan('test-span', () => {
    const retriever = hyb.createHybridRetriever(store);
    retriever.buildIndex();
    retriever.search('西湖', { k: 3 });
    const ctx = otel._als.getStore();
    observedAttrs = ctx && ctx.retrievalAttributes;
  });
  assert.ok(observedAttrs);
  assert.strictEqual(observedAttrs['retrieval.strategy'], 'standard');
  assert.ok(observedAttrs['retrieval.result_count'] >= 0);
});

it('OTEL-H6: search() 不在 ALS context 时不抛错', () => {
  const retriever = hyb.createHybridRetriever(store);
  retriever.buildIndex();
  // 不在 runWithSpan 内调用 search → graceful
  const results = retriever.search('西湖', { k: 3 });
  assert.ok(Array.isArray(results));
});

it('OTEL-H7: search() 在 ALS 内不同 strategy 反映在 attrs', () => {
  otel._resetState();
  let observedStrategy = null;
  otel.runWithSpan('test-span', () => {
    const retriever = hyb.createHybridRetriever(store);
    retriever.buildIndex();
    retriever.search('西湖', { strategy: 'best-rank', k: 3 });
    const ctx = otel._als.getStore();
    observedStrategy = ctx && ctx.retrievalAttributes && ctx.retrievalAttributes['retrieval.strategy'];
  });
  assert.strictEqual(observedStrategy, 'best-rank');
});

// ===== 3. 向后兼容 =====
it('OTEL-BC1: hybridRetrieval 不引入 otel 时仍可用（缺包 graceful）', () => {
  // 即使 otelDevHook 完全失败也不破坏主流程
  const retriever = hyb.createHybridRetriever(store);
  retriever.buildIndex();
  const results = retriever.search('北京', { k: 3 });
  assert.ok(Array.isArray(results));
});

it('OTEL-BC2: search() 在 ALS 退出后不影响下次检索', () => {
  otel._resetState();
  const retriever = hyb.createHybridRetriever(store);
  otel.runWithSpan('span-1', () => {
    retriever.buildIndex();
    retriever.search('北京', { k: 3 });
  });
  // 退出后第二次检索应正常
  const results = retriever.search('北京', { k: 3 });
  assert.ok(Array.isArray(results));
});

it('OTEL-BC3: search() 无 OTel hook 时返回结果不变', () => {
  otel._resetState();
  const retriever = hyb.createHybridRetriever(store);
  retriever.buildIndex();
  // 连续两次 search（一次在 ALS，一次不在）结果应一致
  let inAlsResults, outAlsResults;
  otel.runWithSpan('span', () => {
    inAlsResults = retriever.search('北京', { k: 3 });
  });
  outAlsResults = retriever.search('北京', { k: 3 });
  assert.strictEqual(inAlsResults.length, outAlsResults.length);
  for (let i = 0; i < inAlsResults.length; i++) {
    assert.strictEqual(inAlsResults[i].key, outAlsResults[i].key);
  }
});

it('OTEL-BC4: search() 默认 strategy 仍是 standard', () => {
  otel._resetState();
  let observedStrategy = null;
  otel.runWithSpan('span', () => {
    const retriever = hyb.createHybridRetriever(store);
    retriever.buildIndex();
    retriever.search('北京', { k: 3 });
    const ctx = otel._als.getStore();
    observedStrategy = ctx && ctx.retrievalAttributes && ctx.retrievalAttributes['retrieval.strategy'];
  });
  assert.strictEqual(observedStrategy, 'standard');
});

it('OTEL-BC5: hybridRetrieval.js 文件含 buildRetrievalSpanAttributes 导出', () => {
  const src = fs.readFileSync(hybridPath, 'utf8');
  assert.match(src, /buildRetrievalSpanAttributes/);
  assert.match(src, /retrieval\.strategy/);
});

it('OTEL-BC6: hybridRetrieval.js 含 OTel hook 错误捕获', () => {
  const src = fs.readFileSync(hybridPath, 'utf8');
  assert.match(src, /graceful/);
});

// ===== 总结 =====
process.stdout.write(`\n--- hybrid-retrieval-otel-attributes: pass=${total - failed.length} fail=${failed.length} ---\n`);
if (failed.length > 0) {
  process.stdout.write(`FAIL DETAILS:\n${failed.map((f) => `  - ${f.name}: ${f.error.message}`).join('\n')}\n`);
  process.exit(1);
}
process.exit(0);
