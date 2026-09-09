// server/agent/hybridRetrieval.js
// 周期 12 P0-1: 混合检索（向量 + FTS5 + 时间衰减 RRF）
//
// 背景：
//   - 周期 11 P0-1 落 memoryVectorPrototype（内存级 cosine 检索）
//   - 周期 8 P0-1 已落 SQLite FTS5 bm25 检索（memory.search）
//   - 周期 11 调研结论：2026 共识是"向量 + BM25 + 时间加权"四融合（不是单通道）
//
// 设计：
//   - hybridSearch(query, opts) 主入口
//   - 三通道：vector（cosine）、fts5（bm25）、recency（exp decay）
//   - RRF（Reciprocal Rank Fusion）融合：score = Σ weight_i / (k0 + rank_i)
//   - 默认 k0=60；可配置
//   - 任一通道不可用时 graceful fallback（仅返回其他通道）
//   - 输入校验：query 空 / limit 非正 / weight 负 → 返回空数组
//
// 验收（tests/specs/hybrid-retrieval-rrf.cjs）：
//   - 5 类 query 排序正确
//   - 空 query / 越界 k / 负权重 防御性返回 []
//   - 1000 文档 P95 < 30ms
//   - 三通道融合权重正确

'use strict';

const { VectorMemory, embed, cosine, DIM } = require('./memoryVectorPrototype');

// 周期 14 P1-3: OTel semantic span attributes hook（兼容 otelDevHook.js）
let _otelHook = null;
function _otel() {
  if (_otelHook !== null) return _otelHook;
  try {
    _otelHook = require('./otelDevHook');
  } catch (_) {
    _otelHook = false; // 不可用时为 false
  }
  return _otelHook || null;
}

/**
 * 周期 14 P1-3: 包装 span attributes hook（hybrid retrieval 调用）
 * @param {string} strategy
 * @param {string} query
 * @param {Array} results
 * @returns {object|null}
 */
function buildRetrievalSpanAttributes(strategy, query, results) {
  const hook = _otel();
  if (!hook || typeof hook.buildLlmSpanAttributes !== 'function') return null;
  return {
    'retrieval.strategy': strategy,
    'retrieval.query_length': typeof query === 'string' ? query.length : 0,
    'retrieval.result_count': Array.isArray(results) ? results.length : 0,
    'retrieval.top_score': Array.isArray(results) && results.length > 0
      ? (results[0].score || 0)
      : 0,
    'gen_ai.operation': 'retrieval',
  };
}

const DEFAULT_K0 = 60;
const DEFAULT_HALF_LIFE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 通道类型
 *   - 'fts5'：用 store.search()（若 store 启用 FTS5）
 *   - 'vector'：用 VectorMemory（周期 11 P0-1 prototype）
 *   - 'recency'：基于 ts 的 exp 衰减
 *
 * @typedef {Object} HybridOptions
 * @property {number} [k=10] - 返回条数
 * @property {Object} [weights={vector:0.6, fts5:0.3, recency:0.1}] - 三通道权重
 * @property {number} [k0=60] - RRF 平滑常数
 * @property {number} [recencyHalfLifeDays=30] - 时间衰减半衰期（天）
 * @property {number} [ftsK=50] - FTS5 预取数（候选集大小）
 * @property {number} [vectorK=50] - 向量预取数
 * @property {string} [userId] - 仅返回该 userId 的记忆
 * @property {number} [minScore=0.0] - 过滤融合分数 < minScore 的项
 */

/**
 * 构造混合检索器（绑定 store + vectorMem）
 * @param {Object} store - MemoryStore 实例（提供 search + list）
 * @param {Object} [vectorMem] - VectorMemory 实例；缺省懒初始化
 * @returns {{search: Function, buildIndex: Function, _state: Object}}
 */
function createHybridRetriever(store, vectorMem) {
  if (!store) throw new Error('hybrid: store 必填');
  const vm = vectorMem || new VectorMemory();
  // 缓存：key -> {ts, value}，用于 recency 计算
  const _state = {
    store,
    vector: vm,
    indexed: false,
    lastBuildAt: 0,
  };

  /**
   * 把 store 当前所有记录 build 到 vector 内存
   */
  function buildIndex() {
    const all = store.list({ limit: 100000 });
    vm.clear();
    for (const it of all) {
      vm.remember(it.key, it.value, { tags: it.tags, userId: it.userId });
    }
    _state.indexed = true;
    _state.lastBuildAt = Date.now();
    return { ok: true, count: all.length };
  }

  /**
   * 单通道检索（fts5 / vector）
   * @returns {Array<{key, value, score, source}>}
   */
  function fetchChannel(channel, query, opts) {
    if (channel === 'fts5') {
      if (!store.ftsEnabled) return [];
      try {
        const rows = store.search(query, { limit: opts.ftsK || 50, userId: opts.userId || null });
        // bm25 数值越小越好（更相关）；转成"越大越好"用于 RRF
        return rows.map((r) => ({
          key: r.key,
          value: r.value,
          tags: r.tags || [],
          userId: r.userId,
          ts: r.ts,
          rawScore: typeof r.score === 'number' ? -r.score : 0, // 越大越好
          source: 'fts5',
        }));
      } catch (e) {
        return [];
      }
    }
    if (channel === 'vector') {
      try {
        const rows = vm.search(query, { limit: opts.vectorK || 50, userId: opts.userId || null });
        return rows.map((r) => ({
          key: r.key,
          value: r.value,
          tags: r.tags || [],
          userId: r.userId,
          ts: r.ts,
          rawScore: typeof r.score === 'number' ? r.score : 0, // cosine 越大越好
          source: 'vector',
        }));
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  /**
   * recency 通道：对所有候选 key 计算 exp(-age_days / halfLife)
   * @returns {Map<string, number>}
   */
  function computeRecencyScores(candidateKeys, opts) {
    const halfLifeMs = (opts.recencyHalfLifeDays || DEFAULT_HALF_LIFE_DAYS) * DAY_MS;
    const now = Date.now();
    const out = new Map();
    for (const key of candidateKeys) {
      const row = store.recall(key);
      if (!row) continue;
      const ageMs = Math.max(0, now - row.ts);
      const score = Math.exp(-ageMs / halfLifeMs);
      out.set(key, score);
    }
    return out;
  }

  /**
   * 主入口
   * @param {string} query
   * @param {HybridOptions} [opts]
   * @returns {Array<{key, value, tags, userId, ts, score, sources: string[]}>}
   */
  function search(query, opts) {
    opts = opts || {};
    const k = typeof opts.k === 'number' && opts.k > 0 ? Math.floor(opts.k) : 10;
    const weights = opts.weights || { vector: 0.6, fts5: 0.3, recency: 0.1 };
    const k0 = typeof opts.k0 === 'number' && opts.k0 > 0 ? opts.k0 : DEFAULT_K0;
    const minScore = typeof opts.minScore === 'number' ? opts.minScore : 0.0;

    // 输入校验
    if (typeof query !== 'string' || query.trim() === '') return [];
    // k 必须显式给出且 > 0；opts.k<=0 / 非数字 → 返回 []（spec 期望）
    if (opts && Object.prototype.hasOwnProperty.call(opts, 'k')) {
      if (typeof opts.k !== 'number' || !Number.isFinite(opts.k) || opts.k <= 0) return [];
    }
    if (!Number.isFinite(k) || k <= 0) return [];
    if (!weights || typeof weights !== 'object') return [];
    for (const w of Object.values(weights)) {
      if (typeof w !== 'number' || w < 0) return [];
    }
    if (typeof minScore !== 'number' || minScore < 0) return [];

    // 懒构建索引
    if (!_state.indexed && weights.vector > 0) {
      try { buildIndex(); } catch (_) { /* graceful */ }
    }

    // 取各通道候选
    const ftsRows = weights.fts5 > 0 ? fetchChannel('fts5', query, opts) : [];
    const vecRows = weights.vector > 0 ? fetchChannel('vector', query, opts) : [];

    // 按 rawScore 降序排（已是），记录 rank
    const ftsRanks = new Map(); // key -> rank (1-based)
    ftsRows.forEach((r, i) => ftsRanks.set(r.key, i + 1));
    const vecRanks = new Map();
    vecRows.forEach((r, i) => vecRanks.set(r.key, i + 1));

    // 合并候选 key；若仅 recency 通道启用，候选来自 store全表
    let candidates;
    if (weights.recency > 0 && weights.fts5 === 0 && weights.vector === 0) {
      candidates = new Set(store.list({ limit: 100000, userId: opts.userId || null }).map((r) => r.key));
    } else {
      candidates = new Set([...ftsRanks.keys(), ...vecRanks.keys()]);
    }
    // recency 仅对在候选集中、且 store 中存在的 key 计算
    const recencyScores = weights.recency > 0 ? computeRecencyScores([...candidates], opts) : new Map();
    const recencyRanks = [...recencyScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map((e, i) => [e[0], i + 1]);
    const recencyRankMap = new Map(recencyRanks);

    // 周期 13 P1-3: RRF strategy 多种
    const strategy = opts.strategy || 'standard';
    // RRF 融合（按 strategy 分支）
    const fused = [];
    for (const key of candidates) {
      let score = 0;
      const sources = [];

      // 各通道的 rank（不在候选集中的通道 rank = Infinity / 0）
      const fRank = ftsRanks.get(key);
      const vRank = vecRanks.get(key);
      const rRank = recencyRankMap.get(key);

      // standard: sum_i weight_i / (k0 + rank_i)
      if (strategy === 'standard') {
        if (fRank !== undefined && weights.fts5 > 0) {
          score += weights.fts5 / (k0 + fRank);
          sources.push('fts5');
        }
        if (vRank !== undefined && weights.vector > 0) {
          score += weights.vector / (k0 + vRank);
          sources.push('vector');
        }
        if (rRank !== undefined && weights.recency > 0) {
          score += weights.recency / (k0 + rRank);
          sources.push('recency');
        }
      }
      // best-rank: 每通道取最小 rank，仅一次加权
      else if (strategy === 'best-rank') {
        const ranks = [];
        if (fRank !== undefined && weights.fts5 > 0) ranks.push({ r: fRank, w: weights.fts5, s: 'fts5' });
        if (vRank !== undefined && weights.vector > 0) ranks.push({ r: vRank, w: weights.vector, s: 'vector' });
        if (rRank !== undefined && weights.recency > 0) ranks.push({ r: rRank, w: weights.recency, s: 'recency' });
        if (ranks.length > 0) {
          // 取 weight 最高的 rank
          ranks.sort((a, b) => b.w - a.w);
          const top = ranks[0];
          score += top.w / (k0 + top.r);
          sources.push(top.s);
          // 其他通道以 0.5x 加成
          for (let i = 1; i < ranks.length; i++) {
            score += ranks[i].w * 0.5 / (k0 + ranks[i].r);
          }
        }
      }
      // max-plus-bonus: best rank 主导 + 其他 rank 衰减加成
      else if (strategy === 'max+bonus') {
        const lambda = typeof opts.lambda === 'number' ? opts.lambda : 0.3;
        const ranks = [];
        if (fRank !== undefined && weights.fts5 > 0) ranks.push({ r: fRank, w: weights.fts5, s: 'fts5' });
        if (vRank !== undefined && weights.vector > 0) ranks.push({ r: vRank, w: weights.vector, s: 'vector' });
        if (rRank !== undefined && weights.recency > 0) ranks.push({ r: rRank, w: weights.recency, s: 'recency' });
        if (ranks.length > 0) {
          ranks.sort((a, b) => a.r - b.r); // 最小 rank 优先
          const best = ranks[0];
          score += best.w / (k0 + best.r);
          sources.push(best.s);
          for (let i = 1; i < ranks.length; i++) {
            score += lambda * ranks[i].w / (k0 + ranks[i].r);
            sources.push(ranks[i].s);
          }
        }
      }
      // diminishing-returns: alpha^(j-1) 加权
      else if (strategy === 'diminishing') {
        const alpha = typeof opts.alpha === 'number' ? opts.alpha : 0.5;
        const ranks = [];
        if (fRank !== undefined && weights.fts5 > 0) ranks.push({ r: fRank, w: weights.fts5, s: 'fts5' });
        if (vRank !== undefined && weights.vector > 0) ranks.push({ r: vRank, w: weights.vector, s: 'vector' });
        if (rRank !== undefined && weights.recency > 0) ranks.push({ r: rRank, w: weights.recency, s: 'recency' });
        if (ranks.length > 0) {
          ranks.sort((a, b) => a.r - b.r);
          ranks.forEach((rk, j) => {
            const decay = Math.pow(alpha, j);
            score += decay * rk.w / (k0 + rk.r);
            if (j === 0) sources.push(rk.s);
          });
        }
      }
      // soft-dedup: 重复文档 rank 膨胀
      else if (strategy === 'soft-dedup') {
        const beta = typeof opts.beta === 'number' ? opts.beta : 0.1;
        const inflation = (rank) => rank * (1 + beta);
        if (fRank !== undefined && weights.fts5 > 0) {
          score += weights.fts5 / (k0 + inflation(fRank));
          sources.push('fts5');
        }
        if (vRank !== undefined && weights.vector > 0) {
          score += weights.vector / (k0 + inflation(vRank));
          sources.push('vector');
        }
        if (rRank !== undefined && weights.recency > 0) {
          score += weights.recency / (k0 + inflation(rRank));
          sources.push('recency');
        }
      }
      // default: standard
      else {
        if (fRank !== undefined && weights.fts5 > 0) {
          score += weights.fts5 / (k0 + fRank);
          sources.push('fts5');
        }
        if (vRank !== undefined && weights.vector > 0) {
          score += weights.vector / (k0 + vRank);
          sources.push('vector');
        }
        if (rRank !== undefined && weights.recency > 0) {
          score += weights.recency / (k0 + rRank);
          sources.push('recency');
        }
      }
      if (score < minScore) continue;
      // 取主条目详情（优先 fts5，其次 vector）
      const detail = ftsRows.find((r) => r.key === key) || vecRows.find((r) => r.key === key) || store.recall(key);
      if (!detail) continue;
      fused.push({
        key,
        value: detail.value,
        tags: detail.tags || [],
        userId: detail.userId,
        ts: detail.ts,
        score: Math.round(score * 1e6) / 1e6,
        sources,
      });
    }

    fused.sort((a, b) => b.score - a.score);
    const sliced = fused.slice(0, k);

    // 周期 14 P1-3: 触发 OTel span attributes hook（graceful — 缺包不抛错）
    try {
      const hook = _otel();
      if (hook && typeof hook.getCurrentSpanContext === 'function' && hook.getCurrentSpanContext()) {
        const attrs = buildRetrievalSpanAttributes(strategy, query, sliced);
        if (attrs) {
          const ctx = hook._als.getStore();
          if (ctx) ctx.retrievalAttributes = attrs;
        }
      }
    } catch (_) { /* graceful */ }

    return sliced;
  }

  return { search, buildIndex, _state };
}

/**
 * 一次性便捷函数（不绑定状态）
 * @param {string} query
 * @param {Object} store
 * @param {Object} [opts]
 */
function hybridSearch(query, store, opts) {
  const r = createHybridRetriever(store);
  return r.search(query, opts);
}

// ---- 周期 14 P1-2: RRF ablation + 启发式权重搜索 ----

/**
 * 周期 14 P1-2: 在 corpus 上做权重启发式搜索
 * - 对每个 (query, expectedKey) pair 评估当前权重的得分
 * - 评分 = mean reciprocal rank @ K (top-K 中 expectedKey 排名的倒数)
 * - 启发式搜索：固定权重 step，遍历 5x5x5 = 125 组合
 *
 * @param {Object} store - MemoryStore 实例
 * @param {Array<{query: string, expectedKey: string}>} evalSet - 评估集
 * @param {Object} [opts] - { gridSize?, k? }
 * @returns {{ bestWeights, bestScore, allScores: Array, gridSize: number }}
 */
function heuristicWeightSearch(store, evalSet, opts = {}) {
  const gridSize = opts.gridSize || 5;
  const k = opts.k || 5;
  if (!Array.isArray(evalSet) || evalSet.length === 0) {
    return { bestWeights: null, bestScore: 0, allScores: [], gridSize };
  }
  const retriever = createHybridRetriever(store);
  // 归一化 weights sum = 1
  const steps = [];
  for (let i = 1; i <= gridSize; i++) {
    for (let j = 1; j <= gridSize; j++) {
      for (let m = 1; m <= gridSize; m++) {
        const total = i + j + m;
        steps.push({ vector: i / total, fts5: j / total, recency: m / total });
      }
    }
  }
  const allScores = [];
  let best = { weights: null, score: -1 };
  for (const w of steps) {
    let score = 0;
    for (const { query, expectedKey } of evalSet) {
      let rank = -1;
      try {
        const results = retriever.search(query, {
          weights: w,
          k: Math.max(k, evalSet.length),
          strategy: 'standard',
        });
        for (let i = 0; i < results.length; i++) {
          if (results[i].key === expectedKey) {
            rank = i + 1;
            break;
          }
        }
      } catch (_) { /* skip */ }
      // MRR: 1 / rank if found, 0 if not
      score += rank > 0 ? 1 / rank : 0;
    }
    score = score / evalSet.length;
    allScores.push({ weights: w, score });
    if (score > best.score) {
      best = { weights: w, score };
    }
  }
  return {
    bestWeights: best.weights,
    bestScore: best.score,
    allScores,
    gridSize,
  };
}

/**
 * 周期 14 P1-2: RRF ablation spec helper — 列出 5 种 RRF strategy 名字
 */
const RRF_STRATEGIES = ['standard', 'best-rank', 'max+bonus', 'diminishing', 'soft-dedup'];

module.exports = {
  createHybridRetriever,
  hybridSearch,
  buildRetrievalSpanAttributes,  // 周期 14 P1-3
  heuristicWeightSearch,         // 周期 14 P1-2
  RRF_STRATEGIES,                // 周期 14 P1-2
  DEFAULT_K0,
  DEFAULT_HALF_LIFE_DAYS,
};