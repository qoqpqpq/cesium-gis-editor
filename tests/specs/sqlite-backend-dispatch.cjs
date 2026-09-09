// tests/specs/sqlite-backend-dispatch.cjs
// 周期 13 P0-2: sqliteBackend dispatch 单元测试
// 目标：≥ 22 子断言 PASS

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const { openDatabase, _detectRuntime, _createMemoryBackend } = require(path.join(__dirname, '../../server/agent/sqliteBackend'));

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
  console.log('=== sqlite-backend-dispatch ===');

  // ============ Group A: 模块导出 ============
  await ok('A1: openDatabase 已导出', () => {
    assert.equal(typeof openDatabase, 'function');
  });
  await ok('A2: _detectRuntime 已导出', () => {
    assert.equal(typeof _detectRuntime, 'function');
  });
  await ok('A3: _createMemoryBackend 已导出', () => {
    assert.equal(typeof _createMemoryBackend, 'function');
  });

  // ============ Group B: runtime 检测 ============
  await ok('B1: _detectRuntime 返回 string', () => {
    const r = _detectRuntime();
    assert.equal(typeof r, 'string');
    assert.ok(['node', 'better', 'bun', 'memory'].includes(r), `unexpected: ${r}`);
  });
  await ok('B2: 当前 Node v24 期望含 node 或 better', () => {
    const r = _detectRuntime();
    assert.ok(r === 'node' || r === 'better', `actual: ${r}`);
  });

  // ============ Group C: 强制 driver ============
  await ok('C1: 强制 memory backend', () => {
    const db = openDatabase({ driver: 'memory' });
    assert.equal(db.driver, 'memory');
    db.close();
  });
  await ok('C2: memory backend prepare/run', () => {
    const db = openDatabase({ driver: 'memory' });
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
    db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run(1, 'alice');
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(1);
    assert.equal(row.name, 'alice');
    db.close();
  });
  await ok('C3: memory backend all', () => {
    const db = openDatabase({ driver: 'memory' });
    db.exec('CREATE TABLE items (id INTEGER)');
    db.prepare('INSERT INTO items (id) VALUES (?)').run(1);
    db.prepare('INSERT INTO items (id) VALUES (?)').run(2);
    const rows = db.prepare('SELECT * FROM items').all();
    assert.equal(rows.length, 2);
    db.close();
  });
  await ok('C4: memory backend close 不抛', () => {
    const db = openDatabase({ driver: 'memory' });
    assert.doesNotThrow(() => db.close());
  });

  // ============ Group D: better-sqlite3 fallback ============
  await ok('D1: better driver 创建', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-test-'));
    const dbPath = path.join(tmpDir, 'test.sqlite');
    let db = null;
    try {
      db = openDatabase({ path: dbPath, driver: 'better' });
      // better-sqlite3 不在 → fallback to memory
      assert.ok(['better', 'memory'].includes(db.driver));
      db.close();
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  // ============ Group E: 真实 Node 24+ node:sqlite ============
  await ok('E1: node:sqlite 直接 require', () => {
    try {
      const nodeSqlite = require('node:sqlite');
      assert.equal(typeof nodeSqlite.DatabaseSync, 'function');
    } catch (e) {
      // node < 24 或缺失
      assert.match(e.message || '', /Cannot find module|MODULE_NOT_FOUND/i);
    }
  });
  await ok('E2: node driver 创建数据库', () => {
    try {
      const db = openDatabase({ driver: 'node' });
      assert.equal(db.driver, 'node');
      db.close();
    } catch (e) {
      // 缺 node:sqlite → throw
      assert.ok(e.message.includes('node:sqlite') || e.message.includes("Cannot find"));
    }
  });

  // ============ Group F: 错误处理 ============
  await ok('F1: 强制非法 driver → 不崩', () => {
    const db = openDatabase({ driver: 'invalid_driver' });
    // invalid_driver 不在 dispatch → 走 memory fallback
    assert.equal(db.driver, 'memory');
    db.close();
  });

  // ============ Group G: API 形状 ============
  await ok('G1: 返回含 driver / prepare / exec / pragma / close', () => {
    const db = openDatabase({ driver: 'memory' });
    for (const k of ['driver', 'prepare', 'exec', 'pragma', 'close']) {
      assert.ok(k in db, `missing ${k}`);
    }
    db.close();
  });
  await ok('G2: prepare 缓存（同名 SQL 复用 prepared）', () => {
    const db = openDatabase({ driver: 'memory' });
    db.exec('CREATE TABLE t (id INTEGER)');
    const p1 = db.prepare('INSERT INTO t (id) VALUES (?)');
    const p2 = db.prepare('INSERT INTO t (id) VALUES (?)');
    assert.equal(p1, p2, 'should return same wrapper');
    db.close();
  });
  await ok('G3: close 后 prepare throw', () => {
    const db = openDatabase({ driver: 'memory' });
    db.close();
    assert.throws(() => db.prepare('SELECT 1'), /database closed/);
  });
  await ok('G4: pragma 查询返回 string', () => {
    const db = openDatabase({ driver: 'memory' });
    const r = db.pragma('journal_mode');
    assert.equal(typeof r, 'string');
    db.close();
  });

  // ============ Group H: 关闭幂等 ============
  await ok('H1: close 二次调用不抛', () => {
    const db = openDatabase({ driver: 'memory' });
    db.close();
    assert.doesNotThrow(() => db.close());
  });

  // ============ Group I: 内存 backend 直接测试 ============
  await ok('I1: _createMemoryBackend 表结构', () => {
    const m = _createMemoryBackend(':memory:');
    m.exec('CREATE TABLE k (a TEXT, b INTEGER)');
    m.prepare('INSERT INTO k (a, b) VALUES (?, ?)').run('x', 1);
    const r = m.prepare('SELECT * FROM k').get();
    assert.equal(r.a, 'x');
    assert.equal(r.b, 1);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});