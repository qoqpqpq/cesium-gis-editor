// 限流配置
// - 全局 API 限流：宽松（防止全站被打挂）
// - AI 路由限流：更严（防止 LLM / 联网搜索配额被烧光）
// - 周期 1 P0-2: 仅放行 loopback（127.0.0.1 / ::1）。
//   之前把 10/192.168/172.16 三个 RFC1918 段都当 local 跳过限流，但这些段在
//   云上 VPC（AWS / GCP / 阿里云）和企业内网中常被外部服务共用，把它们从
//   skip 列表里剔出会显著缩小攻击面。仅本机开发仍可完全放行。
// - 周期 2 P1-9: 增加 slidingWindow() 自研实现（Sliding Window Log 算法）
//   express-rate-limit 7.x 默认是 Fixed Window，窗口边界处会突发 2×limit；
//   sliding 方式按时间戳滑动计数更平滑。
// - 周期 3 P2-2: 抽 RateLimiterStore 接口 + InMemoryStore（默认）+ RedisStore stub
//   多实例 / Redis 共享待周期 4+ 实施（iouredis + ZADD）
const rateLimit = require('express-rate-limit');
const { createStore, InMemoryStore, RedisStore } = require('./rateLimitStore');

function isLocal(req) {
  const ip = (req.ip || req.socket.remoteAddress || '').toString();
  return (
    ip === '::1' ||
    ip === '127.0.0.1' ||
    ip === '::ffff:127.0.0.1'
  );
}

function skipLocal(handler) {
  return (req) => !isLocal(req) && handler(req);
}

/**
 * 周期 2 P1-9: Sliding Window Log 限流
 * - 每个 IP 在 hits 数组里记录请求时间戳
 * - 每次请求：清理 < now - windowMs 的旧时间戳；剩余 ≥ limit → 429
 * - 内存成本 O(limit) per IP；每窗口清理避免泄漏
 * - 替代 express-rate-limit 默认 Fixed Window；周期 1 P0-2 仍放行 loopback
 *
 * 周期 3 P2-2 增量：接受 opts.store 参数
 *   - 缺省 → 进程内 InMemoryStore（行为与周期 2 完全一致）
 *   - opts.store = 'redis' 或 env REDIS_STORE=1 → 切 RedisStore stub
 *   - opts.store 传实例 → 复用外部 store
 */
function slidingWindow(opts) {
  const {
    windowMs,
    limit,
    message = '请求过于频繁，请稍后重试',
    keyBy = (req) => req.ip || (req.socket && req.socket.remoteAddress) || 'unknown',
    skip,
    store, // 周期 3 P2-2 新增
  } = opts;
  if (typeof windowMs !== 'number' || windowMs <= 0) {
    throw new Error('slidingWindow: windowMs 必须是正数');
  }
  if (typeof limit !== 'number' || limit <= 0) {
    throw new Error('slidingWindow: limit 必须是正数');
  }
  // 周期 3 P2-2: 解析 store（字符串 → 实例）
  const resolvedStore = !store
    ? new InMemoryStore()
    : store === 'redis'
    ? new RedisStore()
    : store;

  return async function slidingWindowMiddleware(req, res, next) {
    if (typeof skip === 'function' && skip(req)) return next();
    const key = keyBy(req);
    let result;
    try {
      result = await resolvedStore.hit(key, windowMs, limit);
    } catch (e) {
      // 周期 3 P2-2: store 失败 → 保守放行 + console.error
      console.error('[slidingWindow] store.hit 失败:', e.message);
      return next();
    }
    if (!result.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      // 周期 6 P0-2 续: IETF draft-ietf-httpapi-ratelimit-headers 标准 header
      //   RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset
      //   保留 X-RateLimit-* 兼容老 client
      const resetSec = Math.ceil((Date.now() + result.retryAfterMs) / 1000);
      res.setHeader('RateLimit-Limit', String(limit));
      res.setHeader('RateLimit-Remaining', '0');
      res.setHeader('RateLimit-Reset', String(resetSec));
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', String(resetSec));
      return res.status(429).json({ success: false, message });
    }
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - result.count)));
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - result.count)));
    next();
  };
}

/**
 * 周期 6 P0-2 续: Token Bucket 限流（AI 端点用）
 * - 与 Sliding Window Log 不同：Token Bucket 允许"burst"
 *   - capacity = 桶容量（默认 limit）
 *   - refillPerSec = 1 token / (windowMs / limit) ms
 *   - 每次请求：消耗 1 token；不足 → 拒
 * - 内存成本 O(1) per key（仅 lastRefillAt + tokens）
 * - 适合 AI 端点（用户可能瞬时发 3 个对话，Token Bucket 放行；slidingWindow 也放行；
 *   但 Token Bucket 在 burst 5-10 时仍放行，slidingWindow 不会）
 * - 同样输出 IETF RateLimit-* header（周期 6 P0-2 续统一）
 */
function tokenBucket(opts) {
  const {
    windowMs,
    limit,
    capacity = limit,
    refillPerSec = limit / (windowMs / 1000),
    message = '请求过于频繁，请稍后重试',
    keyBy = (req) => req.ip || (req.socket && req.socket.remoteAddress) || 'unknown',
    skip,
    store,
  } = opts;
  if (typeof windowMs !== 'number' || windowMs <= 0) {
    throw new Error('tokenBucket: windowMs 必须是正数');
  }
  if (typeof limit !== 'number' || limit <= 0) {
    throw new Error('tokenBucket: limit 必须是正数');
  }
  const resolvedStore = !store
    ? new InMemoryTokenBucketStore()
    : store === 'redis'
    ? new RedisTokenBucketStore()
    : store;

  return async function tokenBucketMiddleware(req, res, next) {
    if (typeof skip === 'function' && skip(req)) return next();
    const key = keyBy(req);
    let result;
    try {
      result = await resolvedStore.hit(key, { capacity, refillPerSec });
    } catch (e) {
      console.error('[tokenBucket] store.hit 失败:', e.message);
      return next();
    }
    if (!result.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      const resetSec = Math.ceil((Date.now() + result.retryAfterMs) / 1000);
      res.setHeader('RateLimit-Limit', String(limit));
      res.setHeader('RateLimit-Remaining', '0');
      res.setHeader('RateLimit-Reset', String(resetSec));
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', String(resetSec));
      return res.status(429).json({ success: false, message });
    }
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, Math.floor(result.tokens))));
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, Math.floor(result.tokens))));
    next();
  };
}

/**
 * 周期 6 P0-2 续: InMemory Token Bucket store
 * - 进程内；多实例不共享
 * - buckets: Map<key, { tokens, lastRefillAt }>
 */
class InMemoryTokenBucketStore {
  constructor() {
    this.buckets = new Map();
  }
  async hit(key, { capacity, refillPerSec }) {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: capacity, lastRefillAt: now };
      this.buckets.set(key, b);
    }
    const elapsed = (now - b.lastRefillAt) / 1000;
    const refilled = elapsed * refillPerSec;
    b.tokens = Math.min(capacity, b.tokens + refilled);
    b.lastRefillAt = now;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { allowed: true, tokens: b.tokens, retryAfterMs: 0 };
    }
    const needTokens = 1 - b.tokens;
    return {
      allowed: false,
      tokens: b.tokens,
      retryAfterMs: Math.ceil((needTokens / refillPerSec) * 1000),
    };
  }
  async reset(key) { this.buckets.delete(key); }
  async shutdown() { this.buckets.clear(); }
}

/**
 * 周期 6 P0-2 续: Redis Token Bucket store（stub 阶段）
 * - 当前实现降级到 InMemoryTokenBucketStore（Redis Lua 周期 7+ 实施）
 */
class RedisTokenBucketStore {
  constructor() {
    this.fallback = new InMemoryTokenBucketStore();
  }
  async hit(key, opts) {
    return this.fallback.hit(key, opts);
  }
  async reset(key) { return this.fallback.reset(key); }
  async shutdown() { return this.fallback.shutdown(); }
}

/**
 * 全局 API 限流：每 IP 600 次 / 10 分钟
 * - 用于 /api/* 健康路径以外的常规接口（content / weather / settings）
 */
const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => isLocal(req),
  message: { success: false, message: '请求过于频繁，请稍后重试' },
});

/**
 * AI 路由限流：每 IP 60 次 / 分钟（chat / recommend / keys 等）
 * - recommend 会触发联网搜索 + LLM，最贵，独立更严
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => isLocal(req),
  message: { success: false, message: 'AI 请求过于频繁，请稍后重试' },
});

/**
 * recommend 端点特别限流：10 次 / 分钟
 * - 联网搜索 + AI 完整调用，最容易烧配额
 */
const recommendLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => isLocal(req),
  message: { success: false, message: '推荐请求过于频繁，请稍后重试' },
});

/**
 * 空间运算端点限流：30 次 / 分钟
 * - CPU 密集（Turf polygon-clipping 是 O(n*m)）
 * - 单次可能阻塞事件循环数百 ms，限制频次防雪崩
 */
const spatialLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => isLocal(req),
  message: { success: false, message: '空间运算请求过于频繁，请稍后重试' },
});

/**
 * 每日配额：每 IP N 次 / 24 小时（防烧 AI 配额 / 钱）
 * - N 默认 500，可通过环境变量 AI_DAILY_QUOTA 覆盖
 * - 仅作用于非本地 IP（dev 放行）
 * - 实际存储用 express-rate-limit 默认 memory store（重启清零；
 *   生产环境升级 Redis store 才能跨实例精确限流）
 */
const dailyAIBudget = parseInt(process.env.AI_DAILY_QUOTA || '500', 10);
const aiDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: dailyAIBudget,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => isLocal(req),
  message: {
    success: false,
    message: `今日 AI 调用配额已用完（每 IP 每天 ${dailyAIBudget} 次），请明日再试或联系管理员提高配额`,
  },
});

/**
 * 周期 5 P0-2: 多级限流（IP + userId + API key 独立计数）
 * - 同一请求按 N 个维度独立计 limit，任一超限即拒
 * - 每个维度用各自的 slidingWindow 串行：先 IP 超限直接 429；否则 userId；否则 API key
 * - keyBy 各自独立：`<维度>:<ip>` / `<维度>:<userId>` / `<维度>:<apiKey>`
 * - 实际 store 与 slidingWindow 共享
 *
 * 典型应用：AI 端点同时按"每 IP 60/min" + "每 userId 200/min" + "每 API key 300/min" 限流
 *
 * @param {object} opts
 * @param {number} opts.windowMs
 * @param {number} opts.limit — IP 维度默认 limit
 * @param {object} [opts.store] — 共享 store
 * @param {function(req):string} [opts.userIdKey] — 从 req 提取 userId（默认 undefined）
 * @param {function(req):string} [opts.apiKeyKey] — 从 req 提取 apiKey（默认 undefined）
 * @param {number} [opts.userLimit] — userId 维度 limit
 * @param {number} [opts.apiKeyLimit] — API key 维度 limit
 */
function multiLevelLimiter(opts) {
  const dimensions = [
    {
      name: 'ip',
      limit: opts.limit,
      keyBy: (req) => 'ip:' + (req.ip || (req.socket && req.socket.remoteAddress) || 'unknown'),
    },
  ];
  if (opts.userIdKey) {
    dimensions.push({
      name: 'user',
      limit: opts.userLimit || opts.limit * 3,
      keyBy: (req) => {
        const uid = opts.userIdKey(req);
        return uid ? 'user:' + uid : null;
      },
    });
  }
  if (opts.apiKeyKey) {
    dimensions.push({
      name: 'apikey',
      limit: opts.apiKeyLimit || opts.limit * 5,
      keyBy: (req) => {
        const ak = opts.apiKeyKey(req);
        return ak ? 'apikey:' + ak.slice(0, 8) : null; // 截短 + 不存原始 key
      },
    });
  }
  // 周期 6 P1-4 修复: 共享 store（之前每次调 slidingWindow 都 new InMemoryStore，导致 limit 不生效）
  const sharedStore = opts.store || new InMemoryStore();
  return async function multiLevelMiddleware(req, res, next) {
    for (const dim of dimensions) {
      const key = dim.keyBy(req);
      if (!key) continue;
      // 单个维度调 slidingWindow；slidingWindow 在超限时直接 res.status(429).json(...)
      // 我们通过观察 res.statusCode 判断是否被拒
      const beforeStatus = res.statusCode;
      await new Promise((resolve) => {
        slidingWindow({
          windowMs: opts.windowMs,
          limit: dim.limit,
          store: sharedStore,
          message: `多级限流超限（${dim.name}）`,
          keyBy: () => key,
        })(req, res, () => resolve());
      });
      if (res.statusCode === 429) {
        // slidingWindow 已写 429 响应；不再继续后续维度
        return;
      }
    }
    next();
  };
}

module.exports = {
  apiLimiter, aiLimiter, recommendLimiter, spatialLimiter, aiDailyLimiter, isLocal,
  slidingWindow,
  // 周期 6 P0-2 续: Token Bucket
  tokenBucket, InMemoryTokenBucketStore, RedisTokenBucketStore,
  // 周期 3 P2-2: 暴露 store 抽象
  createStore, InMemoryStore, RedisStore,
  // 周期 5 P0-2: 暴露多级限流
  multiLevelLimiter,
  // 周期 6 P1-4: AI 端点专用多级限流（提取 userId / apikey）
  aiMultiLevelLimiter,
};

/**
 * 周期 6 P1-4: AI 端点专用多级限流
 * - 默认 IP 60/min + userId 200/min + apikey 300/min
 * - userId 从 req.body.userId / req.body.sessionId / req.headers['x-user-id'] 提取
 * - apikey 从 req.body.apiKey / req.headers.authorization Bearer 提取（截短 8 字符）
 * - 失败兜底：store 异常 → 放行（不变）
 * - 用于 /api/ai 路由（在 aiDailyLimiter 之后，aiLimiter 之前或之后均可）
 */
function aiMultiLevelLimiter(opts = {}) {
  const base = {
    windowMs: 60 * 1000,
    limit: 60,
    userLimit: 200,
    apiKeyLimit: 300,
    ...opts,
  };
  return multiLevelLimiter({
    ...base,
    userIdKey: (req) => {
      if (req.body && typeof req.body === 'object') {
        return req.body.userId || req.body.sessionId || null;
      }
      return req.headers['x-user-id'] || null;
    },
    apiKeyKey: (req) => {
      // 1) body.apiKey 2) Authorization: Bearer xxx
      if (req.body && req.body.apiKey) return req.body.apiKey;
      const auth = (req.headers && req.headers.authorization) || '';
      const m = /^Bearer\s+(\S+)/.exec(auth);
      return m ? m[1] : null;
    },
  });
}
