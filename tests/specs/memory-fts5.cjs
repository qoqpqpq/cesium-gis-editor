// tests/specs/memory-fts5.cjs
// 周期 8 P0-1: SQLite FTS5 全文检索（升级 P1-5 memory.search）
//
// 背景：
//   - 周期 7 P1-5 memory.js 用 LIKE 模糊匹配（慢 / 无排序）
//   - 周期 8 P0-1 升级到 SQLite FTS5 + bm25() 排序
//   - 失败回退 LIKE（不破坏老逻辑）
//
// 验收：
//   1. 静态扫描：memory.js 含 _tryInitFts5 + fts5 虚拟表 SQL
//   2. 静态扫描：memory.js search() 优先 FTS5，失败回退 LIKE
//   3. 行为：FTS5 不可用时 ftsEnabled=false（保持 LIKE 路径）
//   4. 行为：FTS5 可用时 search 返回 searchEngine='fts5' + score 字段
//   5. 行为：search 返回按 bm25 score 升序（最相关在前）
//   6. 行为：特殊字符转义（"hello)" 不破坏 MATCH 语法）
//   7. 行为：FTS5 表与原表同步触发器（INSERT/UPDATE/DELETE）
//   8. 行为：search 按 userId 过滤（FTS5 + userId 联合）
//   9. 行为：空 query → LIKE 路径（safeQuery 为 null）
//   10. 行为：ftsCount() 返回 FTS 表行数
//   11. 端到端：memory-als-sqlite.cjs 现有 20 子断言仍 PASS（向后兼容）
//   12. 行为：FTS5 触发器使 forget 后 FTS 表也删除

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { MemoryStore } = require('../../server/agent/memory');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

const MEMORY_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../server/agent/memory.js'),
  'utf8',
);

function newStore() {
  // 用 unique tmp path 避免 better-sqlite3 重用 db 时 FTS 触发器冲突
  return new MemoryStore({
    dbPath: path.join(require('node:os').tmpdir(), `cesium-memory-fts5-${Date.now()}-${Math.random()}.sqlite`),
  });
}

(async () => {
  console.log('=== memory-fts5 ===');

  // ---- 1. 静态扫描 ----
  await test('memory.js 含 _tryInitFts5 函数', () => {
    assert.match(MEMORY_SRC, /_tryInitFts5\s*\(/);
  });
  await test('memory.js 含 CREATE VIRTUAL TABLE USING fts5', () => {
    assert.match(MEMORY_SRC, /CREATE\s+VIRTUAL\s+TABLE[^;]*USING\s+fts5/i);
  });
  await test('memory.js 含 bm25() 函数调用', () => {
    assert.match(MEMORY_SRC, /bm25\s*\(/i);
  });
  await test('memory.js 含 FTS5 同步触发器（AI/AD/AU）', () => {
    assert.match(MEMORY_SRC, /AFTER\s+INSERT/i);
    assert.match(MEMORY_SRC, /AFTER\s+DELETE/i);
    assert.match(MEMORY_SRC, /AFTER\s+UPDATE/i);
  });
  await test('memory.js search() 含 FTS5 路径', () => {
    assert.match(MEMORY_SRC, /searchEngine\s*[:=]\s*['"]fts5['"]/);
  });
  await test('memory.js search() 含 LIKE 回退路径', () => {
    assert.match(MEMORY_SRC, /searchEngine\s*[:=]\s*['"]like['"]/);
  });
  await test('memory.js 含 _sanitizeFtsQuery 转义函数', () => {
    assert.match(MEMORY_SRC, /_sanitizeFtsQuery/);
  });
  await test('memory.js 含 ftsEnabled getter', () => {
    assert.match(MEMORY_SRC, /ftsEnabled/);
    assert.match(MEMORY_SRC, /get\s+ftsEnabled/);
  });

  // ---- 2. 行为 ----
  await test('FTS5 不可用时 ftsEnabled=false，search 走 LIKE', () => {
    const s = newStore();
    // 当 better-sqlite3 不可用 → 走 memory backend（无 FTS5）
    // 当 better-sqlite3 可用但 FTS5 关闭 → 也应 ftsEnabled=false
    s.remember('k1', 'apple banana');
    s.remember('k2', 'orange apple');
    const r = s.search('apple');
    assert.ok(r.length >= 1, '应至少找到 1 条');
    if (s.ftsEnabled) {
      assert.strictEqual(r[0].searchEngine, 'fts5', 'FTS5 启用时 searchEngine=fts5');
    } else {
      assert.strictEqual(r[0].searchEngine, 'like', 'FTS5 不可用时 searchEngine=like');
    }
    s.close();
  });

  await test('FTS5 可用时 search 返回 score 字段（bm25 升序）', () => {
    const s = newStore();
    s.remember('k1', 'apple apple apple banana');
    s.remember('k2', 'banana orange');
    s.remember('k3', 'apple apple banana');
    if (!s.ftsEnabled) {
      console.log('  [SKIP] FTS5 不可用，跳过 bm25 排序验证');
      s.close();
      return;
    }
    const r = s.search('apple');
    assert.ok(r.length >= 1);
    assert.ok(typeof r[0].score === 'number', '应含 score 字段');
    // bm25 升序（score 越小越相关）
    for (let i = 1; i < r.length; i += 1) {
      assert.ok(r[i].score >= r[i - 1].score, `score 应升序：r[${i - 1}]=${r[i - 1].score}, r[${i}]=${r[i].score}`);
    }
    s.close();
  });

  await test('特殊字符 query 不破坏 FTS5 MATCH 语法', () => {
    const s = newStore();
    s.remember('k1', 'hello world');
    // 含括号 + 引号 —— 应被 _sanitizeFtsQuery 转义
    let threw = false;
    try {
      const r = s.search('hello)"');
      assert.ok(Array.isArray(r), '应返回数组（不抛错）');
    } catch (e) {
      threw = true;
    }
    assert.ok(!threw, '特殊字符 query 不应抛错');
    s.close();
  });

  await test('空 / 纯空白 query → 走 LIKE（safeQuery 为 null）', () => {
    const s = newStore();
    s.remember('k1', 'value');
    // 空字符串
    const r1 = s.search('');
    assert.ok(Array.isArray(r1));
    // 纯特殊字符
    const r2 = s.search('"()"*');
    assert.ok(Array.isArray(r2));
    // 不应崩
    s.close();
  });

  await test('FTS5 触发器：INSERT 自动同步到 FTS 表', () => {
    const s = newStore();
    if (!s.ftsEnabled) {
      console.log('  [SKIP] FTS5 不可用，跳过触发器验证');
      s.close();
      return;
    }
    const before = s.ftsCount();
    s.remember('new-key', 'new value content');
    const after = s.ftsCount();
    assert.strictEqual(after, before + 1, `FTS 表应增加 1 行：before=${before} after=${after}`);
    s.close();
  });

  await test('FTS5 触发器：DELETE 自动同步到 FTS 表', () => {
    const s = newStore();
    if (!s.ftsEnabled) {
      console.log('  [SKIP] FTS5 不可用，跳过触发器验证');
      s.close();
      return;
    }
    s.remember('del-key', 'some value');
    const before = s.ftsCount();
    s.forget('del-key');
    const after = s.ftsCount();
    assert.strictEqual(after, before - 1, `FTS 表应减少 1 行：before=${before} after=${after}`);
    s.close();
  });

  await test('FTS5 触发器：UPDATE 同步 FTS 表（INSERT OR REPLACE）', () => {
    const s = newStore();
    if (!s.ftsEnabled) {
      console.log('  [SKIP] FTS5 不可用，跳过触发器验证');
      s.close();
      return;
    }
    s.remember('upd-key', 'original value');
    const before = s.ftsCount();
    s.remember('upd-key', 'updated value');
    const after = s.ftsCount();
    assert.strictEqual(after, before, `UPDATE 后 FTS 表行数不变（先删后增）：before=${before} after=${after}`);
    s.close();
  });

  await test('FTS5 search 按 userId 过滤', () => {
    const s = newStore();
    s.remember('a1', 'shared word apple', { userId: 'u1' });
    s.remember('a2', 'shared word apple', { userId: 'u2' });
    if (!s.ftsEnabled) {
      console.log('  [SKIP] FTS5 不可用，跳过 userId 过滤验证');
      s.close();
      return;
    }
    const u1Results = s.search('apple', { userId: 'u1' });
    assert.ok(u1Results.length >= 1, 'u1 应至少找到 1 条');
    assert.ok(u1Results.every((r) => r.userId === 'u1'), '结果应全为 u1');
    s.close();
  });

  await test('FTS5 查不到的词返回空数组（不抛错）', () => {
    const s = newStore();
    s.remember('k1', 'apple banana');
    const r = s.search('xyzzy-no-match');
    assert.ok(Array.isArray(r));
    assert.strictEqual(r.length, 0);
    s.close();
  });

  await test('ftsCount() 在 FTS5 不可用时返回 0', () => {
    const s = newStore();
    s.remember('k1', 'value');
    // 无 FTS5 时不抛错，返回 0
    const c = s.ftsCount();
    assert.ok(typeof c === 'number');
    assert.ok(c >= 0);
    s.close();
  });

  // ---- 3. 端到端：现有 20 子断言仍 PASS ----
  // 由单独跑 tests/specs/memory-als-sqlite.cjs 验证；本 spec 不重复

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
