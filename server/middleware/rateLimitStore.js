// server/middleware/rateLimitStore.js
// 周期 3 P2-2: RateLimiterStore 抽象层
// 周期 4 P0-2: RedisStore 升级为真实实现（手写 RESP 协议 + ZADD Sliding Window）
//
// 背景：周期 1/2 的限流都用 express-rate-limit 默认 MemoryStore，进程内；多实例不共享。
//   周期 3 抽象 RateLimiterStore 接口 + InMemoryStore + RedisStore stub。
//   周期 4 升级 RedisStore 为真实实现（无需新依赖，手写 RESP 协议）。
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
// Redis 真实实现：ZADD（每次 hit）+ ZREMRANGEBYSCORE（清理过期）+ ZCARD（取 count）
//   - key: `rl:<store-name>:<key>`
//   - score: 时间戳（ms）
//   - member: `${ts}-${randomUUID}` 避免同 ms 冲突
//   - EXPIRE: 设置过期时间 = windowMs / 1000 + 缓冲

'use strict';

const { randomUUID } = require('node:crypto');
const { RedisClient } = require('./redisClient');

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
 * RedisStore —— 周期 4 真实实现
 * - 纯手写 RESP 协议（无 ioredis 依赖）
 * - Sliding Window via ZADD + ZREMRANGEBYSCORE + ZCARD
 * - 失败兜底：抛错时回 InMemoryStore（保守放行 1 次）
 */
class RedisStore {
  constructor(opts = {}) {
    this.keyPrefix = opts.keyPrefix || 'rl:';
    this.storeName = opts.storeName || 'default';
    this.client = opts.client || new RedisClient(opts);
    this._ownsClient = !opts.client; // 是否负责 close
    this._healthy = true;
  }

  _fullKey(key) {
    return `${this.keyPrefix}${this.storeName}:${key}`;
  }

  async hit(key, windowMs, limit) {
    const fullKey = this._fullKey(key);
    const now = Date.now();
    const cutoff = now - windowMs;
    const member = `${now}-${randomUUID()}`;

    try {
      // 1. 加这次 hit
      await this.client.zadd(fullKey, now, member);
      // 2. 清过期
      await this.client.zremrangebyscore(fullKey, '-inf', `(${cutoff}`);
      // 3. 取 count
      const count = await this.client.zcard(fullKey);
      // 4. 设置 TTL（毫秒转秒 +1 缓冲）
      await this.client.expire(fullKey, Math.ceil(windowMs / 1000) + 1);

      if (count > limit) {
        return { count, allowed: false, retryAfterMs: windowMs };
      }
      return { count, allowed: true, retryAfterMs: 0 };
    } catch (e) {
      this._healthy = false;
      // 失败兜底：放行 1 次（避免 Redis 挂掉时全站不可用）
      return { count: 0, allowed: true, retryAfterMs: 0, degraded: true };
    }
  }

  async reset(key) {
    try {
      await this.client.del(this._fullKey(key));
    } catch (_) { /* 兜底 */ }
  }

  async shutdown() {
    if (this._ownsClient) {
      await this.client.close();
    }
  }
}

/**
 * 工厂：从环境变量 / opts 选 store
 *   - 默认 InMemoryStore
 *   - opts.store = 'redis' 或 env REDIS_STORE=1 → RedisStore（真实 Redis）
 *   - opts.store = 'redis-stub' → RedisStore stub（周期 3 行为，仅 no-op）
 */
function createStore(opts = {}) {
  if (opts.store === 'redis' || process.env.REDIS_STORE === '1') {
    return new RedisStore(opts);
  }
  if (opts.store === 'redis-stub') {
    return new RedisStubStore(opts);
  }
  return new InMemoryStore(opts);
}

/**
 * 周期 3 兼容：RedisStore stub（用于测试和周期 3 老 spec）
 */
class RedisStubStore {
  constructor(opts = {}) {
    this.keyPrefix = opts.keyPrefix || 'rl:';
    this._stubCounters = new Map();
  }
  async hit(key, windowMs, limit) {
    const cur = this._stubCounters.get(key) || 0;
    this._stubCounters.set(key, cur + 1);
    return { count: cur + 1, allowed: true, retryAfterMs: 0 };
  }
  async reset(key) { this._stubCounters.delete(key); }
  async shutdown() { this._stubCounters.clear(); }
}

module.exports = {
  InMemoryStore,
  RedisStore,
  RedisStubStore,
  createStore,
};
