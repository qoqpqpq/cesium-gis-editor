// server/middleware/rateLimitStore.js
// 周期 3 P2-2: RateLimiter Store 抽象层
//
// 背景：周期 1/2 的限流都用 express-rate-limit 默认 MemoryStore，进程内；多实例不共享。
//   周期 3 抽象 `RateLimiterStore` 接口，先实现 InMemoryStore（包装 Sliding Window Log）；
//   Redis Store 仅留 stub + TODO（不引入新依赖；周期 4 实施时再补 ioredis）。
//
// 接口设计（最小可用）：
//   - async hit(key, windowMs, limit) → { count, allowed, retryAfterMs }
//     - key: 任意字符串（IP / userId）
//     - windowMs: 时间窗
//     - limit: 上限
//     - 行为：记录"这次 hit"并返回当前 count + 是否超限 + 多久后可重试
//   - async reset(key) → 清空某个 key 的计数（运维 / 测试用）
//   - async shutdown() → 关闭连接（Redis 需要；Memory no-op）
//
// 周期 3 范围：仅抽象 + InMemoryStore（基于已有 slidingWindow 逻辑）+ Redis stub
//   周期 4+ 再做 Redis 真实实现 + docker-compose

'use strict';

/**
 * InMemoryStore —— 进程内 Sliding Window Log
 * - 与周期 2 P1-9 slidingWindow 行为一致
 * - 周期清扫避免 Map 内存泄漏
 */
class InMemoryStore {
  constructor(opts = {}) {
    this.sweepIntervalMs = opts.sweepIntervalMs || 60000;
    this.hits = new Map();
    this._lastSweep = Date.now();
  }

  _sweep(now, windowMs) {
    if (now - this._lastSweep < this.sweepIntervalMs) return;
    this._lastSweep = now;
    const cutoff = now - windowMs;
    for (const [key, arr] of this.hits.entries()) {
      let i = 0;
      while (i < arr.length && arr[i] < cutoff) i += 1;
      if (i > 0) arr.splice(0, i);
      if (arr.length === 0) this.hits.delete(key);
    }
  }

  async hit(key, windowMs, limit) {
    const now = Date.now();
    this._sweep(now, windowMs);
    const cutoff = now - windowMs;
    let arr = this.hits.get(key);
    if (!arr) {
      arr = [];
      this.hits.set(key, arr);
    }
    let i = 0;
    while (i < arr.length && arr[i] < cutoff) i += 1;
    if (i > 0) arr.splice(0, i);

    if (arr.length >= limit) {
      const retryAfterMs = Math.max(1000, arr[0] + windowMs - now);
      return {
        count: arr.length,
        allowed: false,
        retryAfterMs,
      };
    }
    arr.push(now);
    return {
      count: arr.length,
      allowed: true,
      retryAfterMs: 0,
    };
  }

  async reset(key) {
    this.hits.delete(key);
  }

  async shutdown() {
    this.hits.clear();
  }
}

/**
 * RedisStore —— 周期 4 实施的占位 stub
 * - 当前用 no-op 实现（不引入新依赖）
 * - 周期 4 用 ioredis 实现 ZADD + ZREMRANGEBYSCORE
 * - 行为：所有 hit 都视为 allowed，便于测试和未来切真实实现
 *
 * ⚠️ 警告：周期 3 期间若启用 RedisStore，**实际不限制**请求（开发期无 Redis 也能跑）
 *   真正的限流只在 enable=true 且 process.env.REDIS_URL 设置时启用
 */
class RedisStore {
  constructor(opts = {}) {
    this.url = opts.url || process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    this.keyPrefix = opts.keyPrefix || 'rl:';
    this._stubCounters = new Map(); // no-op 内存代替，避免引入依赖
  }

  async hit(key, windowMs, limit) {
    // TODO(周期 4): ioredis 实现
    //   const now = Date.now();
    //   const cutoff = now - windowMs;
    //   await redis.zadd(this.keyPrefix + key, now, `${now}-${randomUUID()}`);
    //   await redis.zremrangebyscore(this.keyPrefix + key, '-inf', cutoff);
    //   const count = await redis.zcard(this.keyPrefix + key);
    //   await redis.pexpire(this.keyPrefix + key, windowMs);
    //   if (count > limit) return { count, allowed: false, retryAfterMs: ... };
    //   return { count, allowed: true, retryAfterMs: 0 };
    const cur = this._stubCounters.get(key) || 0;
    this._stubCounters.set(key, cur + 1);
    return { count: cur + 1, allowed: true, retryAfterMs: 0 };
  }

  async reset(key) {
    this._stubCounters.delete(key);
  }

  async shutdown() {
    this._stubCounters.clear();
  }
}

/**
 * 工厂：从环境变量 / opts 选 store
 *   - 默认 InMemoryStore
 *   - 设 REDIS_STORE=1 切 RedisStore（当前为 stub）
 */
function createStore(opts = {}) {
  if (opts.store === 'redis' || process.env.REDIS_STORE === '1') {
    return new RedisStore(opts);
  }
  return new InMemoryStore(opts);
}

module.exports = {
  InMemoryStore,
  RedisStore,
  createStore,
};
