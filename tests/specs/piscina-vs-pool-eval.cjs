// tests/specs/piscina-vs-pool-eval.cjs
// 周期 11 P2-1: Piscina vs 自研 sandbox worker pool 评估

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
  const docPath = path.join(root, 'docs/evaluation/piscina-vs-pool.md');
  process.stdout.write('\n=== piscina-vs-pool-eval ===\n');

  assert(fs.existsSync(docPath), 'document exists', docPath);
  const content = fs.readFileSync(docPath, 'utf8');

  // 1) 文档结构
  assert(/^#\s+Piscina/m.test(content), 'H1 title present');
  assert(/周期.*11/m.test(content), 'cycle 11 referenced');
  assert(/MiniMax-M3/.test(content), 'MiniMax-M3 author');
  assert(/周期 10/.test(content), 'cycle 10 cross-reference');

  // 2) Piscina 引用
  assert(/Piscina/.test(content), 'Piscina library referenced');
  assert(/piscisaureus/.test(content), 'Piscina GitHub org');
  assert(/worker_threads/.test(content), 'worker_threads underlying');

  // 3) 自研 pool 引用
  assert(/sandboxWorkerPool/.test(content), 'in-house pool referenced');
  assert(/LRU/.test(content), 'LRU strategy');
  assert(/idle timeout/.test(content), 'idle timeout');

  // 4) 依赖对比
  assert(/~3KB/.test(content), 'in-house pool size');
  assert(/~30KB/.test(content), 'Piscina size');
  assert(/0 npm 依赖/.test(content) || /零依赖/.test(content), 'zero-dep claim');

  // 5) 功能对比表
  assert(/cold start/.test(content), 'cold start comparison');
  assert(/warm/.test(content), 'warm reuse comparison');

  // 6) 决策
  assert(/保留自研 pool/.test(content), 'keep in-house decision');
  assert(/零依赖/.test(content), 'zero-dep rationale');

  // 7) 升级触发条件
  assert(/升级触发条件/.test(content), 'upgrade triggers section');
  assert(/月度|季度|持续/.test(content), 'monitoring cadence');

  // 8) 周期 10 决策对应
  assert(/warm p50 < 100ms/.test(content), 'cycle 10 baseline referenced');

  // 9) 当前自研 pool 文件存在
  const poolPath = path.join(root, 'server/agent/sandboxWorkerPool.js');
  assert(fs.existsSync(poolPath), 'sandboxWorkerPool.js exists');

  // 10) Spec 统计
  assert(/18 子断言 PASS/.test(content), 'spec stats declared');

  process.stdout.write(`\n--- summary: pass=${pass} fail=${fail} ---\n`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(2);
});
