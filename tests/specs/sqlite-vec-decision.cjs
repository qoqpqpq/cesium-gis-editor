// tests/specs/sqlite-vec-decision.cjs
// 周期 13 P2-2: SQLite vector extension 决策文档 spec
// 目标：≥ 12 子断言 PASS

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const DOC = path.join(__dirname, '../../docs/evaluation/vector-extension-decision.md');

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
  console.log('=== sqlite-vec-decision ===');

  let src = '';
  await ok('A1: 决策文档存在', () => {
    assert.ok(fs.existsSync(DOC));
    src = fs.readFileSync(DOC, 'utf8');
  });

  // ============ Group A: 文档结构 ============
  await ok('A2: 含 5 个候选对比表', () => {
    assert.match(src, /brute-force cosine/);
    assert.match(src, /sqlite-vec/);
    assert.match(src, /Vec1/);
    assert.match(src, /vectorlite/);
    assert.match(src, /libSQL/);
  });
  await ok('A3: 决策矩阵含 7 个维度', () => {
    // 关键维度关键词
    for (const dim of ['当前规模', '100K 规模', '1M 规模', '集成成本', '内存占用', '跨平台', '维护活跃度']) {
      assert.ok(src.includes(dim), `missing dim: ${dim}`);
    }
  });
  await ok('A4: 含结论部分', () => {
    assert.match(src, /结论/);
  });
  await ok('A5: 含触发条件', () => {
    assert.match(src, /## 触发条件/);
    assert.match(src, /50K/);
    assert.match(src, /100ms/);
  });

  // ============ Group B: 推荐顺序 ============
  await ok('B1: 现状推荐保持 brute-force', () => {
    assert.match(src, /立即.*brute-force/);
  });
  await ok('B2: 3-6 月评估 sqlite-vec', () => {
    assert.match(src, /3-6 月/);
    assert.match(src, /sqlite-vec/);
  });
  await ok('B3: 6-12 月大规模迁移', () => {
    assert.match(src, /6-12 月/);
  });
  await ok('B4: 不推荐 vectorlite 与 libSQL', () => {
    assert.match(src, /不推荐/);
  });

  // ============ Group C: 性能数字 ============
  await ok('C1: 含 10K/100K/1M 性能数字', () => {
    assert.match(src, /10K/);
    assert.match(src, /100K/);
    assert.match(src, /1M/);
  });
  await ok('C2: 现状 brute-force 性能标注', () => {
    assert.match(src, /brute-force/);
    // 现有 5ms / 50ms / 500ms 量级
    assert.match(src, /5ms/);
    assert.match(src, /50ms/);
    assert.match(src, /500ms/);
  });

  // ============ Group D: 决策框架 ============
  await ok('D1: 含 ADR review 提醒', () => {
    assert.match(src, /ADR/);
  });
  await ok('D2: 含迁移触发阈值', () => {
    assert.match(src, /50K/);
    assert.match(src, /100ms/);
  });
  await ok('D3: 显式说明 metadata 过滤触发', () => {
    assert.match(src, /metadata 过滤/);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});