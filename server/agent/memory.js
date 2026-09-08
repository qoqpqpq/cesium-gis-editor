// server/agent/memory.js
// 周期 7 P1-5: AI Agent 长期记忆 prototype（ALS + SQLite）
//
// 背景：
//   - mem0 / OpenMemory 是 2025+ 流行的 AI Agent 长期记忆方案
//   - mem0 通常用 vector DB + LLM 做 embedding + 语义检索
//   - 周期 7+ 评估：先用 AsyncLocalStorage + SQLite 做 prototype
//     - ALS：保存 conversation context（请求内）
//     - SQLite：保存跨请求 memory（key-value + 时间戳）
//     - recall：用 FTS5 全文检索（暂不做 embedding）
//
// 设计：
//   - MemoryStore 类：SQLite 后端（better-sqlite3 或 sqlite3）；fallback 内存 Map
//   - conversationContext：AsyncLocalStorage 实例，存 { userId, sessionId, convId }
//   - remember(key, value, { tags })：写入 SQLite + 可选附 ALS context
//   - recall(query, { limit, tags })：FTS5 / LIKE 检索
//   - list({ userId, tags })：列所有记忆
//   - forget(key)：删除
//
// 验收：
//   - ALS context 隔离（不同请求不共享）
//   - SQLite 持久化（重启后数据仍在）
//   - remember / recall / list / forget 四个操作
//   - 在 SQLite 不可用时降级到 InMemoryStore（不崩溃）
//
// 周期 7 范围：prototype，不做 embedding 检索 / 自动 consolidation / 跨用户隔离鉴权

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { AsyncLocalStorage } = require('node:async_hooks');

const conversationContext = new AsyncLocalStorage();

/**
 * 默认 db 路径：项目根 / .cache / memory.sqlite
 * 测试时可通过 MEMORY_DB_PATH 环境变量覆盖
 */
const DEFAULT_DB_PATH = process.env.MEMORY_DB_PATH
  || path.join(os.tmpdir(), `cesium-gis-editor-memory-${process.pid}.sqlite`);

/**
 * 周期 7 P1-5: SQLite 后端（使用 sqlite3 子进程；避免 better-sqlite3 native 编译）
 * 简化为：内部直接用 better-sqlite3（如可用）；否则用 fs 内存 Map fallback
 *
 * 为什么不直接用 better-sqlite3：周期 7 评估先做"功能可用"，
 *   SQLite 驱动兼容性等周期 8+ 评估
 */
class MemoryStore {
  /**
   * @param {object} [opts]
   * @param {string} [opts.dbPath] - SQLite 文件路径；缺省 tmpdir
   * @param {string} [opts.table='memories'] - 表名
   */
  constructor(opts = {}) {
    this.dbPath = opts.dbPath || DEFAULT_DB_PATH;
    this.table = opts.table || 'memories';
    this.driver = opts.driver || null; // 周期 7 P1-5: 默认 null → 自动选 better-sqlite3 / 内存
    // 自动初始化
    if (!this.driver) {
      this.driver = this._tryLoadSqlite();
    }
    if (this.driver) {
      this._initSqlite();
    } else {
      this._initMemory();
    }
  }

  _tryLoadSqlite() {
    // 周期 7 P1-5: 评估 — better-sqlite3 优先；若 native 编译失败 fallback
    try {
      const BetterSqlite = require('better-sqlite3');
      return new BetterSqlite(this.dbPath);
    } catch (e) {
      // better-sqlite3 不可用；fallback 内存
      return null;
    }
  }

  _initSqlite() {
    // 建表（key 主键 + value + tags + userId + ts + 全文索引）
    this.driver.exec(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        tags TEXT,
        userId TEXT,
        ts INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ${this.table}_ts ON ${this.table}(ts DESC);
      CREATE INDEX IF NOT EXISTS ${this.table}_userId ON ${this.table}(userId);
    `);
    // 注意：本周期不强制 FTS5（依赖 sqlite 版本）；用 LIKE 模糊匹配
    this._stmtInsert = this.driver.prepare(
      `INSERT OR REPLACE INTO ${this.table} (key, value, tags, userId, ts) VALUES (?, ?, ?, ?, ?)`
    );
    this._stmtSelect = this.driver.prepare(
      `SELECT key, value, tags, userId, ts FROM ${this.table} WHERE key = ?`
    );
    this._stmtDelete = this.driver.prepare(
      `DELETE FROM ${this.table} WHERE key = ?`
    );
    this._stmtList = this.driver.prepare(
      `SELECT key, value, tags, userId, ts FROM ${this.table} ORDER BY ts DESC LIMIT ?`
    );
    this._stmtListByUser = this.driver.prepare(
      `SELECT key, value, tags, userId, ts FROM ${this.table} WHERE userId = ? ORDER BY ts DESC LIMIT ?`
    );
    this._stmtSearch = this.driver.prepare(
      `SELECT key, value, tags, userId, ts FROM ${this.table} WHERE value LIKE ? ORDER BY ts DESC LIMIT ?`
    );
  }

  _initMemory() {
    // 内存 fallback；用于 better-sqlite3 不可用时
    this._memMap = new Map();
    this.backend = 'memory';
  }

  /**
   * 写入 / 更新一条记忆
   * @param {string} key
   * @param {string} value
   * @param {object} [opts]
   * @param {string[]} [opts.tags]
   * @param {string} [opts.userId] - 缺省取 ALS context.userId
   * @returns {{ok: boolean, key: string, backend: string}}
   */
  remember(key, value, opts = {}) {
    if (!key || typeof key !== 'string') {
      return { ok: false, key, backend: this.backend, error: 'key 必须是非空字符串' };
    }
    const ts = Date.now();
    const ctx = conversationContext.getStore() || {};
    const userId = opts.userId || ctx.userId || null;
    const tags = JSON.stringify(opts.tags || []);
    if (this.driver) {
      this.backend = 'sqlite';
      try {
        this._stmtInsert.run(key, String(value), tags, userId, ts);
        return { ok: true, key, backend: this.backend };
      } catch (e) {
        return { ok: false, key, backend: this.backend, error: e.message };
      }
    } else {
      this._memMap.set(key, { value: String(value), tags, userId, ts });
      return { ok: true, key, backend: this.backend };
    }
  }

  /**
   * 检索一条记忆
   * @param {string} key
   * @returns {{key, value, tags, userId, ts, backend} | null}
   */
  recall(key) {
    if (this.driver) {
      this.backend = 'sqlite';
      const row = this._stmtSelect.get(key);
      if (!row) return null;
      return {
        key: row.key,
        value: row.value,
        tags: row.tags ? JSON.parse(row.tags) : [],
        userId: row.userId,
        ts: row.ts,
        backend: this.backend,
      };
    } else {
      const v = this._memMap.get(key);
      if (!v) return null;
      return {
        key,
        value: v.value,
        tags: v.tags ? JSON.parse(v.tags) : [],
        userId: v.userId,
        ts: v.ts,
        backend: 'memory',
      };
    }
  }

  /**
   * 全文检索（LIKE 模糊匹配 value）
   * @param {string} query
   * @param {object} [opts]
   * @param {number} [opts.limit=10]
   * @param {string} [opts.userId]
   * @returns {Array<{key, value, tags, userId, ts, backend}>}
   */
  search(query, opts = {}) {
    const limit = opts.limit || 10;
    const userId = opts.userId || null;
    if (this.driver) {
      this.backend = 'sqlite';
      let rows;
      if (userId) {
        const stmt = this.driver.prepare(
          `SELECT key, value, tags, userId, ts FROM ${this.table} WHERE value LIKE ? AND userId = ? ORDER BY ts DESC LIMIT ?`
        );
        rows = stmt.all(`%${query}%`, userId, limit);
      } else {
        rows = this._stmtSearch.all(`%${query}%`, limit);
      }
      return rows.map((r) => ({
        key: r.key,
        value: r.value,
        tags: r.tags ? JSON.parse(r.tags) : [],
        userId: r.userId,
        ts: r.ts,
        backend: this.backend,
      }));
    } else {
      const lower = (query || '').toLowerCase();
      const out = [];
      for (const [k, v] of this._memMap.entries()) {
        if (v.value.toLowerCase().includes(lower)) {
          if (userId && v.userId !== userId) continue;
          out.push({
            key: k,
            value: v.value,
            tags: v.tags ? JSON.parse(v.tags) : [],
            userId: v.userId,
            ts: v.ts,
            backend: 'memory',
          });
        }
        if (out.length >= limit) break;
      }
      return out;
    }
  }

  /**
   * 列出所有记忆
   * @param {object} [opts]
   * @param {number} [opts.limit=50]
   * @param {string} [opts.userId]
   * @returns {Array}
   */
  list(opts = {}) {
    const limit = opts.limit || 50;
    const userId = opts.userId || null;
    if (this.driver) {
      this.backend = 'sqlite';
      const rows = userId
        ? this._stmtListByUser.all(userId, limit)
        : this._stmtList.all(limit);
      return rows.map((r) => ({
        key: r.key,
        value: r.value,
        tags: r.tags ? JSON.parse(r.tags) : [],
        userId: r.userId,
        ts: r.ts,
        backend: this.backend,
      }));
    } else {
      const out = [];
      for (const [k, v] of this._memMap.entries()) {
        if (userId && v.userId !== userId) continue;
        out.push({
          key: k,
          value: v.value,
          tags: v.tags ? JSON.parse(v.tags) : [],
          userId: v.userId,
          ts: v.ts,
          backend: 'memory',
        });
      }
      return out.sort((a, b) => b.ts - a.ts).slice(0, limit);
    }
  }

  /**
   * 删除一条记忆
   */
  forget(key) {
    if (this.driver) {
      this.backend = 'sqlite';
      const r = this._stmtDelete.run(key);
      return { ok: true, deleted: r.changes, backend: this.backend };
    } else {
      const existed = this._memMap.delete(key);
      return { ok: true, deleted: existed ? 1 : 0, backend: 'memory' };
    }
  }

  /**
   * 关闭 / 清理
   */
  close() {
    if (this.driver) {
      try { this.driver.close(); } catch (_) {}
      this.driver = null;
    }
    if (this._memMap) {
      this._memMap.clear();
    }
  }

  /**
   * 清理 db 文件（仅测试 helper；生产不要调）
   */
  cleanup() {
    this.close();
    if (fs.existsSync(this.dbPath)) {
      try { fs.unlinkSync(this.dbPath); } catch (_) {}
    }
  }

  /**
   * ALS context 包装：在 context 内执行的代码可通过 getStore() 拿 context
   * 周期 7 P1-5: ALS 隔离验证
   */
  static withContext(ctx, fn) {
    return conversationContext.run(ctx, fn);
  }

  static getContext() {
    return conversationContext.getStore() || null;
  }
}

module.exports = {
  MemoryStore,
  conversationContext,
  DEFAULT_DB_PATH,
};
