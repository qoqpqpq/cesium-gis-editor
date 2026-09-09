// tests/specs/mem-machine-ground-truth-eval.cjs
// 周期 11 P0-2: memMachine ground-truth preservation 评估文档验证

'use strict';

const path = require('path');
const fs = require('fs');

let pass = 0;
let fail = 0;

function assert(cond, name, detail) {
  const tag = cond ? 'PASS' : 'FAIL';
  process.stdout.write(`  [${tag}] ${name}${detail ? ' — ' + detail : ''}\n`);
  if (cond) pass += 1; else fail += 1;
}

(async () => {
  const root = path.resolve(__dirname, '..', '..');
  const docPath = path.join(root, 'docs/evaluation/mem-machine-ground-truth.md');
  process.stdout.write('\n=== mem-machine-ground-truth-eval ===\n');

  assert(fs.existsSync(docPath), 'document exists', docPath);
  const content = fs.readFileSync(docPath, 'utf8');

  // 1) 文档结构
  assert(/^#\s+MemMachine/m.test(content), 'H1 title present');
  assert(/周期.*11/m.test(content), 'cycle 11 referenced');
  assert(/MiniMax-M3/.test(content), 'MiniMax-M3 author');
  assert(/关联.*周期 10/m.test(content), 'cross-reference to cycle 10');

  // 2) 三种策略对比表
  assert(/完全保留原始 episodic/.test(content), 'episodic strategy mentioned');
  assert(/LLM 抽取 semantic/.test(content), 'semantic strategy mentioned');
  assert(/混合（episodic \+ 摘要）/.test(content), 'hybrid strategy mentioned');
  assert(/MemMachine/.test(content), 'MemMachine referenced');
  assert(/Mem0/.test(content), 'Mem0 referenced');
  assert(/CoALA/.test(content), 'CoALA referenced');

  // 3) 当前架构分析（与 memory.js 对齐）
  assert(/key-value \+ tags \+ userId \+ ts/.test(content), 'current data model described');
  assert(/FTS5 bm25/.test(content), 'FTS5 bm25 retrieval');
  assert(/episodic-only MemMachine 雏形/.test(content), 'episodic-only conclusion');

  // 4) 决策路径清晰
  assert(/短期（当前）/.test(content), 'short-term decision');
  assert(/中期/.test(content), 'mid-term decision');
  assert(/长期/.test(content), 'long-term decision');
  assert(/episodic-only 原则/.test(content), 'preserve episodic-only principle');

  // 5) 接口对齐（不破坏现有）
  assert(/memory\.remember/.test(content), 'remember interface');
  assert(/memory\.search/.test(content), 'search interface');
  assert(/memory\.summarize/.test(content), 'future summarize interface');
  assert(/不破坏/.test(content), 'non-breaking commitment');

  // 6) 风险评估（≥4 项）
  const riskLines = content.split('\n').filter((l) => /^\|/.test(l) && /膨胀|噪声|关系|有损/.test(l));
  assert(riskLines.length >= 4, 'risk list ≥4', `count=${riskLines.length}`);

  // 7) 行动清单（含落点）
  assert(/行动清单/.test(content), 'action checklist');
  assert(/周期 12\+/.test(content), 'deferred actions assigned');

  // 8) 与周期 10 决策对应
  assert(/mem0 pgvector 暂不切/.test(content), 'cycle 10 P0-1 decision referenced');
  assert(/agent memory 三层渐进/.test(content), 'cycle 10 P0-2 decision referenced');
  assert(/FTS5 是 episodic 雏形/.test(content), 'FTS5 is episodic primitive');

  // 9) Spec 统计声明
  assert(/20 子断言 PASS/.test(content), 'spec stats declared');

  // 10) 与 memory.js 实际接口一致（静态检查）
  const memoryPath = path.join(root, 'server/agent/memory.js');
  assert(fs.existsSync(memoryPath), 'memory.js exists');
  const memoryCode = fs.readFileSync(memoryPath, 'utf8');
  assert(/class MemoryStore/.test(memoryCode), 'MemoryStore class present');
  assert(/remember\(/.test(memoryCode), 'remember method');
  assert(/recall\(/.test(memoryCode), 'recall method');
  assert(/search\(/.test(memoryCode), 'search method');
  assert(/list\(/.test(memoryCode), 'list method');
  assert(/forget\(/.test(memoryCode), 'forget method');

  process.stdout.write(`\n--- summary: pass=${pass} fail=${fail} ---\n`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(2);
});
