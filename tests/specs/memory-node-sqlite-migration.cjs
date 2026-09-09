// tests/specs/memory-node-sqlite-migration.cjs
// 周期 14 P0-2: memory.js 真实迁移 node:sqlite backend（通过 sqliteBackend.js dispatch）
//
// 覆盖：
//   - MemoryStore 走 sqliteBackend dispatch（自动检测 node:sqlite / better / bun / memory）
//   - backendDriver getter 暴露 driver 名
//   - 兼容旧 backend getter（'sqlite' | 'memory'）
//   - WAL pragma 走统一抽象
//   - close 后调用 silent 不抛错
//   - 周期 7-13 老 API 零回归

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..', '..');
const memoryPath = path.join(ROOT, 'server', 'agent', 'memory.js');
const backendPath = path.join(ROOT, 'server', 'agent', 'sqliteBackend.js');

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
const backend = require(backendPath);

// ===== 1. sqliteBackend dispatch =====
it('MIG-1: sqliteBackend.openDatabase 返回 driver 名', () => {
  const db = backend.openDatabase({ path: ':memory:' });
  assert.ok(['node', 'better', 'bun', 'memory'].includes(db.driver));
  db.close();
});

it('MIG-2: sqliteBackend._detectRuntime 返回 string', () => {
  const r = backend._detectRuntime();
  assert.ok(typeof r === 'string');
  assert.ok(['node', 'better', 'bun', 'memory'].includes(r));
});

it('MIG-3: sqliteBackend memory backend prepare/exec/close 工作', () => {
  const db = backend.openDatabase({ driver: 'memory', path: ':memory:' });
  assert.strictEqual(db.driver, 'memory');
  db.exec('CREATE TABLE test (a INTEGER, b TEXT)');
  const stmt = db.prepare('INSERT INTO test (a, b) VALUES (?, ?)');
  stmt.run(1, 'hello');
  const sel = db.prepare('SELECT * FROM test');
  const rows = sel.all();
  assert.strictEqual(rows.length, 1);
  db.close();
});

it('MIG-4: sqliteBackend pragma(name) 返回 string', () => {
  const db = backend.openDatabase({ driver: 'memory', path: ':memory:' });
  const r = db.pragma('journal_mode');
  assert.strictEqual(typeof r, 'string');
  db.close();
});

it('MIG-5: sqliteBackend 关闭后 prepare 抛错', () => {
  const db = backend.openDatabase({ driver: 'memory', path: ':memory:' });
  db.close();
  assert.throws(() => db.prepare('SELECT 1'), /database closed/);
});

// ===== 2. MemoryStore 走 sqliteBackend =====
it('MIG-6: MemoryStore 构造后 backendDriver ∈ {node, better, bun, memory}', () => {
  const tmp = path.join(os.tmpdir(), `mem-mig-${Date.now()}.sqlite`);
  try {
    const s = new mem.MemoryStore({ dbPath: tmp });
    assert.ok(['node', 'better', 'bun', 'memory'].includes(s.backendDriver));
    s.close();
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
});

it('MIG-7: MemoryStore backend getter 返回 sqlite/memory', () => {
  const tmp = path.join(os.tmpdir(), `mem-mig-${Date.now()}.sqlite`);
  try {
    const s = new mem.MemoryStore({ dbPath: tmp });
    assert.ok(['sqlite', 'memory'].includes(s.backend));
    s.close();
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
});

it('MIG-8: MemoryStore 强制 driverPref=memory 走内存 backend', () => {
  const s = new mem.MemoryStore({ driverPref: 'memory' });
  assert.strictEqual(s.backend, 'memory');
  assert.strictEqual(s.backendDriver, 'memory');
  // 内存 backend 也可写读
  s.remember('k', 'v');
  assert.strictEqual(s.recall('k').value, 'v');
  s.close();
});

it('MIG-9: MemoryStore 强制 driverPref=node 走 node:sqlite（若环境支持）', () => {
  // 注意：在没有 Node 24+ 的环境下会 fallback 到 memory
  const s = new mem.MemoryStore({ driverPref: 'node', dbPath: ':memory:' });
  assert.ok(['node', 'memory'].includes(s.backendDriver));
  s.close();
});

it('MIG-10: MemoryStore :memory: 不支持 WAL，journalMode 应为 memory', () => {
  const s = new mem.MemoryStore({ dbPath: ':memory:' });
  // node:sqlite :memory: 不支持 WAL；返回 'memory'
  assert.strictEqual(s.journalMode, 'memory');
  s.close();
});

it('MIG-11: MemoryStore 真实路径 → journalMode = wal', () => {
  const tmp = path.join(os.tmpdir(), `mem-mig-${Date.now()}.sqlite`);
  try {
    const s = new mem.MemoryStore({ dbPath: tmp });
    if (s.backend !== 'memory') {
      assert.strictEqual(s.journalMode, 'wal');
    } else {
      assert.strictEqual(s.journalMode, 'memory');
    }
    s.close();
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
});

// ===== 3. close 后调用 =====
it('MIG-12: close 后 remember 返回 ok=false, error=store_closed', () => {
  const s = new mem.MemoryStore({ dbPath: ':memory:' });
  s.close();
  const r = s.remember('x', 'y');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'store_closed');
});

it('MIG-13: 多次 close 幂等', () => {
  const s = new mem.MemoryStore({ dbPath: ':memory:' });
  s.close();
  s.close(); // 不应抛错
  assert.ok(true);
});

// ===== 4. 向后兼容：周期 7-13 API =====
it('MIG-14: remember/recall/search/list/forget 全可用', () => {
  const s = new mem.MemoryStore({ dbPath: ':memory:' });
  s.remember('a', 'alpha');
  assert.strictEqual(s.recall('a').value, 'alpha');
  const list = s.list();
  assert.ok(list.length >= 1);
  const sr = s.search('alpha');
  assert.ok(sr.length >= 1);
  assert.strictEqual(s.forget('a').ok, true);
  s.close();
});

it('MIG-15: ALS context 仍可用', () => {
  const s = new mem.MemoryStore({ dbPath: ':memory:' });
  mem.MemoryStore.withContext({ userId: 'alice' }, () => {
    s.remember('k', 'v');
    assert.strictEqual(s.recall('k').userId, 'alice');
  });
  s.close();
});

it('MIG-16: memoryContextMiddleware 仍可用', () => {
  const mw = mem.memoryContextMiddleware();
  assert.strictEqual(typeof mw, 'function');
});

it('MIG-17: ftsEnabled getter 存在', () => {
  const s = new mem.MemoryStore({ dbPath: ':memory:' });
  assert.strictEqual(typeof s.ftsEnabled, 'boolean');
  s.close();
});

it('MIG-18: optimizePragma 仍可用', () => {
  const s = new mem.MemoryStore({ dbPath: ':memory:' });
  const r = s.optimizePragma();
  assert.strictEqual(typeof r.ok, 'boolean');
  s.close();
});

it('MIG-19: 周期 13 driverPref=auto 检测不抛错', () => {
  const s = new mem.MemoryStore({ driverPref: 'auto' });
  assert.ok(s.backendDriver);
  s.close();
});

it('MIG-20: 周期 13 sqliteBackend.openDatabase 兼容 :memory: 与 path', () => {
  const d1 = backend.openDatabase({ path: ':memory:' });
  assert.ok(d1);
  d1.close();
  const tmp = path.join(os.tmpdir(), `backend-test-${Date.now()}.sqlite`);
  try {
    const d2 = backend.openDatabase({ path: tmp });
    assert.ok(d2);
    d2.close();
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
});

// ===== 总结 =====
process.stdout.write(`\n--- memory-node-sqlite-migration: pass=${total - failed.length} fail=${failed.length} ---\n`);
if (failed.length > 0) {
  process.stdout.write(`FAIL DETAILS:\n${failed.map((f) => `  - ${f.name}: ${f.error.message}`).join('\n')}\n`);
  process.exit(1);
}
process.exit(0);
