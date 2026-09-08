// server/agent/sandboxWorkerPool.js
// 周期 10 P1-3: Sandbox worker pool（reuse + LRU）
//
// 背景：
//   - 周期 9 P1-2 sandbox perf benchmark：worker-seq 30次 p50=628ms
//   - 主要开销：worker creation（~600ms / 每 worker）
//   - 周期 10 P1-3：实现 worker pool，reuse 已有 worker
//
// 设计：
//   - 周期 10 P1-3: LRU pool（默认 size=4）
//   - acquireWorker() 拿空闲 worker；busy 则创建新 worker 直到 size 上限
//   - releaseWorker(worker, healthy) 把 worker 归还到空闲队列
//   - 健康 worker 复用；不健康 worker terminate
//   - idle timeout（默认 60s）：自动清理空闲 worker
//   - 周期 11+ 评估：warm-up + shared worker thread（多请求并发）
//
// 用法：
//   const pool = require('./sandboxWorkerPool');
//   const worker = await pool.acquire();
//   try {
//     // ... use worker
//   } finally {
//     pool.release(worker, healthy);
//   }

'use strict';

const { Worker } = require('node:worker_threads');
const path = require('node:path');

const DEFAULT_MAX_SIZE = 4;
const DEFAULT_IDLE_TIMEOUT_MS = 60 * 1000; // 60s

class WorkerPool {
  constructor(opts = {}) {
    this.maxSize = Number(opts.maxSize) || DEFAULT_MAX_SIZE;
    this.idleTimeoutMs = Number(opts.idleTimeoutMs) || DEFAULT_IDLE_TIMEOUT_MS;
    this.workerScript = opts.workerScript || path.join(__dirname, 'sandbox-worker.js');
    this._idle = []; // 空闲 worker（LRU 顺序；队首最新）
    this._busy = new Set(); // 正在使用的 worker
    this._idleTimers = new WeakMap(); // worker -> timeout
    this._totalCreated = 0;
    this._totalReused = 0;
    this._totalTerminated = 0;
  }

  /**
   * 拿一个 worker（优先空闲；不足则创建；满则等）
   * @returns {Promise<Worker>}
   */
  async acquire() {
    // 1. 优先 idle 队列
    while (this._idle.length > 0) {
      const w = this._idle.shift();
      // 检查 worker 还活着
      if (w && w.threadId !== -1) {
        this._clearIdleTimer(w);
        this._busy.add(w);
        this._totalReused++;
        return w;
      }
      // worker 已死，丢弃
      this._totalTerminated++;
    }
    // 2. 创建新 worker
    if (this._totalCreated - this._totalTerminated < this.maxSize) {
      const w = new Worker(this.workerScript, {
        workerData: { code: '', ctx: {}, timeoutMs: 0, cpuLimitMs: 0 },
      });
      this._totalCreated++;
      this._busy.add(w);
      return w;
    }
    // 3. 满；简单等 50ms 重试（实际场景不达此分支）
    return new Promise((resolve) => {
      setTimeout(async () => {
        const w = await this.acquire();
        resolve(w);
      }, 50);
    });
  }

  /**
   * 归还 worker
   * @param {Worker} worker
   * @param {boolean} [healthy=true] - false 时直接 terminate
   */
  release(worker, healthy = true) {
    if (!worker) return;
    this._busy.delete(worker);
    if (!healthy || worker.threadId === -1) {
      try { worker.terminate(); } catch (_) { /* ignore */ }
      this._totalTerminated++;
      return;
    }
    // push 到 idle（LRU：shift/push 模式）
    this._idle.push(worker);
    // 启动 idle timer
    const timer = setTimeout(() => {
      // 超时未用 → 清理
      const idx = this._idle.indexOf(worker);
      if (idx >= 0) this._idle.splice(idx, 1);
      try { worker.terminate(); } catch (_) { /* ignore */ }
      this._totalTerminated++;
    }, this.idleTimeoutMs);
    this._idleTimers.set(worker, timer);
  }

  /**
   * 清空 pool（测试 / 关停时用）
   */
  async drain() {
    const all = [...this._idle, ...this._busy];
    for (const w of all) {
      try { w.terminate(); } catch (_) { /* ignore */ }
    }
    this._idle = [];
    this._busy.clear();
    this._totalTerminated += all.length;
  }

  /**
   * 统计信息
   */
  stats() {
    return {
      maxSize: this.maxSize,
      idleCount: this._idle.length,
      busyCount: this._busy.size,
      totalCreated: this._totalCreated,
      totalReused: this._totalReused,
      totalTerminated: this._totalTerminated,
      reuseRatio: this._totalCreated > 0 ? (this._totalReused / (this._totalCreated + this._totalReused)) : 0,
    };
  }

  _clearIdleTimer(worker) {
    const t = this._idleTimers.get(worker);
    if (t) {
      clearTimeout(t);
      this._idleTimers.delete(worker);
    }
  }
}

// 周期 10 P1-3: 单例（业务侧直接 require('./sandboxWorkerPool').defaultPool）
const defaultPool = new WorkerPool();

module.exports = {
  WorkerPool,
  defaultPool,
  DEFAULT_MAX_SIZE,
  DEFAULT_IDLE_TIMEOUT_MS,
};