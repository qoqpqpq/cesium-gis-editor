// 服务端 AI 流并发控制（阶段 11 P0）
// 设计：per-platform semaphore + FIFO 队列
// 目的：防止 100 并发用户同时点 AI 工具 → 全部直转上游 → 刷爆 OpenAI/Anthropic 配额
//
// 用法（在 routes/ai.js 的流分支）：
//   const permit = await acquire(platform, { signal: req.signal });
//   try {
//     // ... chatStream 转发
//   } finally {
//     permit.release();
//   }
//
// 配置（环境变量）：
//   AI_MAX_INFLIGHT_PER_PLATFORM  默认 8
//   AI_MAX_QUEUE                  默认 50
//
// 队列溢出策略：超出 queueMax 直接 reject('queue_full') → 调用方应 catch → 返回 429
//
// AbortSignal：用户在客户端 abort 时立即从 waiting 队列移除并 reject('abort')
// acquire 返回的 permit.queuePos：0 = 已拿到 slot；>0 = 在队列中的位置

'use strict';

const MAX_INFLIGHT = Math.max(
  1,
  parseInt(process.env.AI_MAX_INFLIGHT_PER_PLATFORM || '8', 10)
);
const MAX_QUEUE = Math.max(
  0,
  parseInt(process.env.AI_MAX_QUEUE || '50', 10)
);

// 内部状态：platform -> { free, waiting: WaitingEntry[] }
const state = new Map();

function getPlatformSlot(platform) {
  let slot = state.get(platform);
  if (!slot) {
    slot = { free: MAX_INFLIGHT, waiting: [] };
    state.set(platform, slot);
  }
  return slot;
}

/**
 * 唤醒队列头部
 * @returns {WaitingEntry|null} 被唤醒的 entry（调用方负责 wrap）
 */
function wakeNext(platform) {
  const slot = getPlatformSlot(platform);
  const next = slot.waiting.shift();
  if (!next) return null;
  // 移除 abort listener（已承诺的等待位置不再响应 abort，因为 slot 即将分配给它）
  if (next.abortListener) {
    next.signal && next.signal.removeEventListener('abort', next.abortListener);
    next.abortListener = null;
  }
  return next;
}

function releaseSlot(platform) {
  const slot = getPlatformSlot(platform);
  slot.free += 1;
  const next = wakeNext(platform);
  if (next) {
    slot.free -= 1;
    next.resolve();
  }
}

/**
 * 申请一个并发槽
 * @param {string} platform openai/anthropic/gemini/...
 * @param {{signal?: AbortSignal}} opts
 * @returns {Promise<{release: () => void, queuePos: number}>}
 */
function acquire(platform, opts = {}) {
  const p = platform || 'unknown';
  const slot = getPlatformSlot(p);
  const signal = opts.signal || null;

  // 快速路径：直接有 free slot
  if (!signal || !signal.aborted) {
    if (slot.free > 0) {
      slot.free -= 1;
      return Promise.resolve({
        release: () => releaseSlot(p),
        queuePos: 0,
      });
    }
  } else {
    return Promise.reject(new Error('abort'));
  }

  // 排队路径
  return new Promise((resolve, reject) => {
    // 排队前再次检查
    if (slot.waiting.length >= MAX_QUEUE) {
      reject(new Error('queue_full'));
      return;
    }
    if (signal && signal.aborted) {
      reject(new Error('abort'));
      return;
    }

    const queuePos = slot.waiting.length + 1;

    let aborted = false;
    const onAbort = () => {
      if (aborted) return;
      aborted = true;
      const idx = slot.waiting.indexOf(entry);
      if (idx >= 0) {
        slot.waiting.splice(idx, 1);
        reject(new Error('abort'));
      }
    };

    const entry = {
      signal,
      abortListener: null,
      resolve: () => {
        if (aborted) return; // 已被 abort，不应 resolve
        resolve({
          release: () => releaseSlot(p),
          queuePos: 0,
        });
      },
    };

    if (signal) {
      entry.abortListener = onAbort;
      signal.addEventListener('abort', onAbort, { once: true });
    }
    slot.waiting.push(entry);
  });
}

/**
 * 获取当前所有平台的并发状态（用于监控 / 测试）
 * @returns {Record<string, {inflight: number, waiting: number, queueMax: number}>}
 */
function getStats() {
  const out = {};
  for (const [platform, slot] of state.entries()) {
    out[platform] = {
      inflight: MAX_INFLIGHT - slot.free,
      waiting: slot.waiting.length,
      queueMax: MAX_QUEUE,
    };
  }
  return out;
}

/**
 * 测试用：重置所有状态
 */
function resetForTests() {
  for (const slot of state.values()) {
    for (const e of slot.waiting) {
      if (e.signal && e.abortListener) {
        e.signal.removeEventListener('abort', e.abortListener);
      }
    }
  }
  state.clear();
}

module.exports = {
  acquire,
  getStats,
  resetForTests,
  MAX_INFLIGHT,
  MAX_QUEUE,
};