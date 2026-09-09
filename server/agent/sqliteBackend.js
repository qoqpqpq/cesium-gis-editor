// server/agent/sqliteBackend.js
// 周期 13 P0-2: SQLite backend dispatch（node:sqlite / better-sqlite3 / bun:sqlite）
//
// 背景：
//   - 周期 12 调研 #8：cortexkit magic-context #108 + lhremote #72 提议移除 better-sqlite3
//   - Node 24+ 内置 `node:sqlite`（DatabaseSync / StatementSync）
//   - Bun 内置 `bun:sqlite`
//   - 周期 9 P0-2: memory.js 用 better-sqlite3；fallback 内存 Map
//
// 设计：
//   - openDatabase({ path })：自动检测 runtime，dispatch 到对应 backend
//   - 返回统一抽象 { driver, prepare, exec, pragma, close }
//   - 三 driver：node:sqlite / better-sqlite3 / bun:sqlite / memory fallback
//   - 缺包 graceful fallback（never throw）
//
// 验收（spec ≥22 PASS）：
//   - 三 driver 都有 mock 测试
//   - Node 24+ 真实加载 node:sqlite（用 try/catch）
//   - better-sqlite3 fallback 不崩溃
//   - 旧 spec（hybrid-retrieval-rrf）零回归

'use strict';

function _detectRuntime() {
  // Bun global
  try {
    // eslint-disable-next-line global-require
    const { Database } = require('bun:sqlite');
    if (typeof Database === 'function') return 'bun';
  } catch (_) { /* not bun */ }
  // Node 24+ 内置 node:sqlite
  try {
    // eslint-disable-next-line global-require
    const ns = require('node:sqlite');
    if (ns && typeof ns.DatabaseSync === 'function') return 'node';
  } catch (_) { /* not node 24+ */ }
  // 老 Node：better-sqlite3
  try {
    // eslint-disable-next-line global-require
    const BetterSqlite = require('better-sqlite3');
    if (typeof BetterSqlite === 'function') return 'better';
  } catch (_) { /* not installed */ }
  return 'memory';
}

/**
 * 内存 backend fallback
 */
function _createMemoryBackend(path) {
  const tables = new Map();
  const backend = {
    path,
    prepare(sql) {
      const sqlLower = sql.toLowerCase().trim();
      return {
        run: (...args) => { _memoryExec(tables, sqlLower, args); return { changes: 1 }; },
        get: (...args) => _memoryQuery(tables, sqlLower, args)[0] || undefined,
        all: (...args) => _memoryQuery(tables, sqlLower, args),
      };
    },
    exec(sql) { _memoryExec(tables, sql.toLowerCase().trim(), []); return undefined; },
    pragma(name) {
      const m = String(name).match(/^(\w+)/);
      return m ? m[1] : 'unknown';
    },
    close() { tables.clear(); },
  };
  return backend;
}

function _memoryExec(tables, sql, args) {
  const m = sql.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?(\w+)\s*\(([^)]*)\)/);
  if (m) {
    tables.set(m[1], { cols: m[2].split(',').map((s) => s.trim().split(/\s+/)[0]), rows: [] });
    return;
  }
  const ins = sql.match(/insert\s+(?:or\s+\w+\s+)?into\s+(\w+)\s*\(([^)]+)\)/);
  if (ins) {
    const t = tables.get(ins[1]);
    if (t) {
      const cols = ins[2].split(',').map((s) => s.trim());
      const obj = {};
      cols.forEach((c, i) => { obj[c] = args[i]; });
      t.rows.push(obj);
    }
    return;
  }
}

function _memoryQuery(tables, sql, args) {
  const sel = sql.match(/select\s+([\w,\s*]+)\s+from\s+(\w+)(?:\s+where\s+(\w+)\s*=\s*\?)?/);
  if (sel) {
    const t = tables.get(sel[2]);
    if (!t) return [];
    let rows = t.rows.slice();
    if (sel[3] && args.length > 0) {
      const col = sel[3];
      rows = rows.filter((r) => r[col] === args[0]);
    }
    return rows.map((r) => ({ ...r }));
  }
  return [];
}

/**
 * 打开 SQLite 数据库
 * @param {object} [opts]
 * @param {string} [opts.path] - 文件路径；缺省 ':memory:'
 * @param {string} [opts.driver] - 强制 driver（'node' | 'better' | 'bun' | 'memory' | 'auto'）
 * @returns {object} { driver, prepare, exec, pragma, close }
 */
function openDatabase(opts = {}) {
  const dbPath = opts.path || ':memory:';
  const driverPref = opts.driver || 'auto';
  const driver = driverPref === 'auto' ? _detectRuntime() : driverPref;
  let inner = null;
  let realDriver = driver;

  if (driver === 'bun') {
    try {
      // eslint-disable-next-line global-require
      const { Database } = require('bun:sqlite');
      inner = new Database(dbPath);
    } catch (e) {
      inner = _createMemoryBackend(dbPath);
      realDriver = 'memory';
    }
  } else if (driver === 'node') {
    try {
      // eslint-disable-next-line global-require
      const { DatabaseSync } = require('node:sqlite');
      inner = new DatabaseSync(dbPath);
    } catch (e) {
      inner = _createMemoryBackend(dbPath);
      realDriver = 'memory';
    }
  } else if (driver === 'better') {
    try {
      // eslint-disable-next-line global-require
      const BetterSqlite = require('better-sqlite3');
      inner = new BetterSqlite(dbPath);
    } catch (e) {
      inner = _createMemoryBackend(dbPath);
      realDriver = 'memory';
    }
  } else if (driver === 'memory') {
    inner = _createMemoryBackend(dbPath);
    realDriver = 'memory';
  } else {
    // 非法 driver → graceful fallback memory
    inner = _createMemoryBackend(dbPath);
    realDriver = 'memory';
  }

  const prepared = new Map();
  let closed = false;

  function getPrepared(sql) {
    if (prepared.has(sql)) return prepared.get(sql);
    let stmt;
    try {
      stmt = inner.prepare(sql);
    } catch (e) {
      return null;
    }
    const wrapper = {
      run: (...args) => stmt.run(...args),
      get: (...args) => stmt.get(...args),
      all: (...args) => stmt.all(...args),
    };
    prepared.set(sql, wrapper);
    return wrapper;
  }

  return {
    driver: realDriver,
    prepare(sql) {
      if (closed) throw new Error('database closed');
      const p = getPrepared(sql);
      if (!p) throw new Error(`prepare failed: ${sql}`);
      return p;
    },
    exec(sql) {
      if (closed) throw new Error('database closed');
      if (typeof inner.exec === 'function') return inner.exec(sql);
      return inner.prepare(sql).run();
    },
    pragma(name, value) {
      if (closed) throw new Error('database closed');
      if (typeof inner.pragma === 'function') {
        if (value === undefined) return inner.pragma(name);
        return inner.pragma(`${name} = ${value}`);
      }
      return 'unknown';
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        if (inner && typeof inner.close === 'function') inner.close();
      } catch (_) { /* ignore */ }
      prepared.clear();
    },
  };
}

module.exports = {
  openDatabase,
  _detectRuntime,
  _createMemoryBackend,
};