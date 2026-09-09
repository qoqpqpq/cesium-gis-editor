// server/agent/memoryVectorPrototype.js
// 周期 11 P0-1: pgvector vs SQLite FTS5 prototype 对照实验（内存级 cosine 检索）
//
// 背景：
//   - 周期 10 P0-1 已落 docs/evaluation/mem0-postgres.md：决策 < 10K 向量暂不切换 pgvector
//   - 本周期：做一个**内存级** cosine 检索 prototype（无 native 依赖）作为对照
//     验证决策的可行性 —— 用 500–2000 条 mock embedding + 50 条小语料对照 SQLite FTS5
//   - embedder：deterministic hash → 32 维向量（与真实语义无关，仅作工程对照）
//
// 设计原则：
//   - 不引 native 依赖（no better-sqlite3 / no pg）
//   - 与现有 MemoryStore 接口兼容（remember / search / list / forget）
//   - cosine 相似度 = dot(a,b) / (|a||b|)
//   - 支持 HNSW-lite 候选：当前用 brute-force（< 10K 向量 brute-force < 5ms）
//
// 验收（spec memory-vector-prototype.cjs）：
//   - 与 FTS5 同 50 条语料下召回率 / 延迟对比
//   - 与 MemoryStore 接口对齐
//   - 500/1000/2000 条 brute-force 延迟
//   - cosine 数学正确性
//   - 内存占用估算

'use strict';

/**
 * Deterministic hash embedder（32 维；仅工程对照，非真实语义）
 * 策略：FNV-1a 32-bit hash → 分桶到 32 维 → 归一化
 */
const DIM = 32;

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function embed(text) {
  const v = new Array(DIM).fill(0);
  if (!text) return v;
  // n-gram 分桶（2-gram 字符组合）
  const s = String(text).toLowerCase();
  for (let i = 0; i < s.length - 1; i++) {
    const gram = s.slice(i, i + 2);
    const h = fnv1a(gram);
    const bucket = h % DIM;
    const sign = (h & 1) === 0 ? 1 : -1;
    v[bucket] += sign;
  }
  // 单字符也贡献（处理 1 字符 query）
  for (let i = 0; i < s.length; i++) {
    const h = fnv1a(s[i]);
    const bucket = h % DIM;
    const sign = (h & 1) === 0 ? 1 : -1;
    v[bucket] += sign * 0.5;
  }
  // 归一化
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  // a / b 已归一化 → cosine = dot
  return dot;
}

class VectorMemory {
  /**
   * @param {object} [opts]
   * @param {number} [opts.dim=32]
   * @param {number} [opts.bruteForceLimit=10000] - 超过此规模建议切换 HNSW
   */
  constructor(opts = {}) {
    this.dim = opts.dim || DIM;
    this.bruteForceLimit = opts.bruteForceLimit || 10000;
    // store: key -> { value, vector, tags, userId, ts }
    this._store = new Map();
    this.backend = 'vector-prototype';
  }

  remember(key, value, opts = {}) {
    if (!key || typeof key !== 'string') {
      return { ok: false, key, backend: this.backend, error: 'key 必须是非空字符串' };
    }
    const vec = embed(value);
    const item = {
      key,
      value: String(value),
      vector: vec,
      tags: opts.tags || [],
      userId: opts.userId || null,
      ts: Date.now(),
    };
    this._store.set(key, item);
    return { ok: true, key, backend: this.backend };
  }

  recall(key) {
    const it = this._store.get(key);
    if (!it) return null;
    return {
      key: it.key,
      value: it.value,
      tags: it.tags,
      userId: it.userId,
      ts: it.ts,
      backend: this.backend,
    };
  }

  /**
   * Cosine 相似度检索（brute-force；< 10K 向量 < 5ms）
   * @param {string} query
   * @param {object} [opts]
   * @param {number} [opts.limit=10]
   * @param {number} [opts.threshold=0.0] - cosine 阈值（>= 才返回）
   * @param {string} [opts.userId]
   */
  search(query, opts = {}) {
    const limit = opts.limit || 10;
    const threshold = typeof opts.threshold === 'number' ? opts.threshold : 0.0;
    const userId = opts.userId || null;
    const qVec = embed(query);
    const scored = [];
    for (const it of this._store.values()) {
      if (userId && it.userId !== userId) continue;
      const score = cosine(qVec, it.vector);
      if (score >= threshold) {
        scored.push({
          key: it.key,
          value: it.value,
          tags: it.tags,
          userId: it.userId,
          ts: it.ts,
          backend: this.backend,
          score,
          searchEngine: 'cosine-brute-force',
        });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  list(opts = {}) {
    const limit = opts.limit || 50;
    const userId = opts.userId || null;
    const out = [];
    for (const it of this._store.values()) {
      if (userId && it.userId !== userId) continue;
      out.push({
        key: it.key,
        value: it.value,
        tags: it.tags,
        userId: it.userId,
        ts: it.ts,
        backend: this.backend,
      });
    }
    return out.sort((a, b) => b.ts - a.ts).slice(0, limit);
  }

  forget(key) {
    const existed = this._store.delete(key);
    return { ok: true, deleted: existed ? 1 : 0, backend: this.backend };
  }

  size() {
    return this._store.size;
  }

  clear() {
    this._store.clear();
  }
}

module.exports = {
  VectorMemory,
  embed,
  cosine,
  DIM,
};
