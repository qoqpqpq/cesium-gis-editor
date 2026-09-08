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
    // 周期 8 P0-1: FTS5 虚拟表（contentless 模式 —— value 存原表）
    //   - SQLite ≥ 3.9 支持 FTS5
    //   - better-sqlite3 自带 FTS5
    //   - 同步三触发器：AI / AD / DELETE（保持虚拟表与原表一致）
    //   - 失败回退 LIKE（_initMemory 不会受影响）
    this._ftsEnabled = this._tryInitFts5();
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
    // 周期 8 P0-1: FTS5 search 预编译语句（仅在 _ftsEnabled=true 时可用）
    if (this._ftsEnabled) {
      this._stmtFtsSearch = this.driver.prepare(
        `SELECT m.key, m.value, m.tags, m.userId, m.ts, bm25(${this.table}_fts) AS score
         FROM ${this.table}_fts
         JOIN ${this.table} m ON m.rowid = ${this.table}_fts.rowid
         WHERE ${this.table}_fts MATCH ?
         ORDER BY score ASC
         LIMIT ?`
      );
      this._stmtFtsSearchByUser = this.driver.prepare(
        `SELECT m.key, m.value, m.tags, m.userId, m.ts, bm25(${this.table}_fts) AS score
         FROM ${this.table}_fts
         JOIN ${this.table} m ON m.rowid = ${this.table}_fts.rowid
         WHERE ${this.table}_fts MATCH ? AND m.userId = ?
         ORDER BY score ASC
         LIMIT ?`
      );
      this._stmtFtsCount = this.driver.prepare(
        `SELECT COUNT(*) AS c FROM ${this.table}_fts`
      );
    }
  }

  /**
   * 周期 8 P0-1: 尝试初始化 FTS5 虚拟表 + 同步触发器
   * - 失败（SQLite < 3.9 / 编译选项关闭）→ 回退 LIKE，不抛错
   * - 成功 → _ftsEnabled=true，search() 走 bm25 路径
   * @returns {boolean} 是否启用 FTS5
   */
  _tryInitFts5() {
    try {
      const ftsTable = `${this.table}_fts`;
      this.driver.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS ${ftsTable} USING fts5(
          value,
          content='${this.table}',
          content_rowid='rowid',
          tokenize='unicode61'
        );
        -- 同步触发器（保持 FTS 表与原表一致）
        CREATE TRIGGER IF NOT EXISTS ${this.table}_ai AFTER INSERT ON ${this.table} BEGIN
          INSERT INTO ${ftsTable}(rowid, value) VALUES (new.rowid, new.value);
        END;
        CREATE TRIGGER IF NOT EXISTS ${this.table}_ad AFTER DELETE ON ${this.table} BEGIN
          INSERT INTO ${ftsTable}(${ftsTable}, rowid, value) VALUES ('delete', old.rowid, old.value);
        END;
        CREATE TRIGGER IF NOT EXISTS ${this.table}_au AFTER UPDATE ON ${this.table} BEGIN
          INSERT INTO ${ftsTable}(${ftsTable}, rowid, value) VALUES ('delete', old.rowid, old.value);
          INSERT INTO ${ftsTable}(rowid, value) VALUES (new.rowid, new.value);
        END;
      `);
      return true;
    } catch (e) {
      // FTS5 不可用（SQLite < 3.9 / 编译选项关闭 / better-sqlite3 编译不带 FTS5）
      // 回退 LIKE 路径；不抛错
      return false;
    }
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
   * 全文检索
   * 周期 8 P0-1: 优先 FTS5 (bm25 排序)；失败/不可用回退 LIKE
   * @param {string} query
   * @param {object} [opts]
   * @param {number} [opts.limit=10]
   * @param {string} [opts.userId]
   * @returns {Array<{key, value, tags, userId, ts, backend, score?: number, searchEngine?: string}>}
   */
  search(query, opts = {}) {
    const limit = opts.limit || 10;
    const userId = opts.userId || null;
    // 转义 FTS5 特殊字符（防止用户输入破坏 MATCH 语法）
    const safeQuery = this._sanitizeFtsQuery(query);
    if (this.driver && this._ftsEnabled && safeQuery) {
      // 周期 8 P0-1: FTS5 路径（bm25 排序）
      this.backend = 'sqlite';
      try {
        const rows = userId
          ? this._stmtFtsSearchByUser.all(safeQuery, userId, limit)
          : this._stmtFtsSearch.all(safeQuery, limit);
        return rows.map((r) => ({
          key: r.key,
          value: r.value,
          tags: r.tags ? JSON.parse(r.tags) : [],
          userId: r.userId,
          ts: r.ts,
          backend: this.backend,
          score: typeof r.score === 'number' ? r.score : undefined,
          searchEngine: 'fts5',
        }));
      } catch (e) {
        // FTS5 查询失败（MATCH 语法错）→ 回退 LIKE
        // eslint-disable-next-line no-console
        console.warn('[memory] FTS5 search 失败，回退 LIKE:', e.message);
      }
    }
    // 回退：LIKE 路径（兼容老逻辑）
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
        searchEngine: 'like',
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
            searchEngine: 'like',
          });
        }
        if (out.length >= limit) break;
      }
      return out;
    }
  }

  /**
   * 周期 8 P0-1: FTS5 query 转义
   * - FTS5 语法特殊字符：' " ( ) * : - 需保留作 wildcard
   * - 简单策略：去掉控制字符；保留字母/数字/中文/CJK/空格
   * - 空 query 返回 null（调用方走 LIKE 路径）
   */
  _sanitizeFtsQuery(q) {
    if (!q || typeof q !== 'string') return null;
    // 去掉 FTS5 保留字符（用户输入的引号/括号/星号）
    // 注意：这里只去掉真正会破坏 MATCH 语法的字符；正常空格 + 字母数字保留
    const cleaned = q.replace(/[\x00-\x1f\x7f"()*:^]/g, ' ').trim();
    if (!cleaned) return null;
    // 把多空格压成单空格
    return cleaned.replace(/\s+/g, ' ');
  }

  /**
   * 周期 8 P0-1: 是否启用 FTS5
   */
  get ftsEnabled() {
    return !!this._ftsEnabled;
  }

  /**
   * 周期 8 P0-1: FTS5 表行数（仅在 _ftsEnabled=true 时返回；否则 0）
   */
  ftsCount() {
    if (!this.driver || !this._ftsEnabled || !this._stmtFtsCount) return 0;
    return this._stmtFtsCount.get().c;
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

  /**
   * 周期 8 P1-3: Express middleware —— 自动注入 userId / sessionId 到 ALS
   *
   * 用法：
   *   const { memoryContextMiddleware } = require('./server/agent/memory');
   *   app.use(memoryContextMiddleware({ extractUserId: (req) => req.user?.id }));
   *
   * 提取策略（按顺序尝试）：
   *   1. opts.extractUserId(req) 函数返回（业务自定义）
   *   2. req.headers['x-user-id']
   *   3. req.user?.id （Passport 等）
   *   4. req.ip（兜底；匿名用户用 IP 区分 session）
   *
   * 注入到 ALS 的字段：
   *   - userId
   *   - sessionId（req.headers['x-session-id'] 或 req.sessionID 或自动生成）
   *   - requestId（req.headers['x-request-id'] 或自动生成）
   *   - ts（请求起始时间）
   */
  static memoryContextMiddleware(opts = {}) {
    const extractUserId = opts.extractUserId || ((req) => {
      return req.headers['x-user-id']
        || (req.user && req.user.id)
        || req.ip
        || null;
    });
    const extractSessionId = opts.extractSessionId || ((req) => {
      return req.headers['x-session-id']
        || req.sessionID
        || null;
    });
    const extractRequestId = opts.extractRequestId || ((req, res) => {
      const existing = req.headers['x-request-id'];
      if (existing) return existing;
      // 周期 8 P1-3: 自动生成 requestId
      const id = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      // 写入响应头供客户端记录
      if (res && typeof res.setHeader === 'function') {
        res.setHeader('x-request-id', id);
      }
      return id;
    });
    return function memoryContextMw(req, res, next) {
      const ctx = {
        userId: extractUserId(req),
        sessionId: extractSessionId(req),
        requestId: extractRequestId(req, res),
        ts: Date.now(),
      };
      // 在 ALS context 内执行 next() —— 之后的 req handler 都可通过 MemoryStore.getContext() 拿到
      conversationContext.run(ctx, () => next());
    };
  }
}

// 兼容 module.exports 风格调用：直接 require('memory').memoryContextMiddleware
function memoryContextMiddleware(opts) {
  return MemoryStore.memoryContextMiddleware(opts);
}

module.exports = {
  MemoryStore,
  conversationContext,
  DEFAULT_DB_PATH,
  memoryContextMiddleware, // 周期 8 P1-3
};
