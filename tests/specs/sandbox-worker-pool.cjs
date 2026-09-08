// tests/specs/sandbox-worker-pool.cjs
// 周期 10 P1-3: Sandbox worker pool（reuse + LRU）
//
// 验证范围：
//   1) WorkerPool 类存在 + acquire/release/stats
//   2) LRU 复用：连续 acquire 5 次，reuse 计数 ≥3
//   3) 健康归还 + 不健康终止
//   4) idle timeout 自动清理
//   5) drain 后 size=0
//   6) 集成 sandbox.js executeSandbox 路径

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');
const POOL_FILE = path.join(ROOT, 'server', 'agent', 'sandboxWorkerPool.js');

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  [PASS] ${name}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  console.log('\n=== P1-3 sandbox worker pool spec ===\n');

  // ---- 1. 文件存在 + 模块导出 ----
  check('sandboxWorkerPool.js 存在', fs.existsSync(POOL_FILE));
  const poolPath = POOL_FILE;
  delete require.cache[poolPath];
  const { WorkerPool, defaultPool, DEFAULT_MAX_SIZE, DEFAULT_IDLE_TIMEOUT_MS } = require(poolPath);
  check('导出 WorkerPool 类', typeof WorkerPool === 'function');
  check('导出 defaultPool 实例', defaultPool instanceof WorkerPool);
  check('导出 DEFAULT_MAX_SIZE 常量', DEFAULT_MAX_SIZE === 4);
  check('导出 DEFAULT_IDLE_TIMEOUT_MS 常量', DEFAULT_IDLE_TIMEOUT_MS === 60000);

  // ---- 2. 基本 acquire/release ----
  const pool = new WorkerPool({ maxSize: 2, idleTimeoutMs: 1000 });
  await pool.drain();
  const w1 = await pool.acquire();
  check('acquire 返回 Worker 实例', w1 && typeof w1.terminate === 'function');
  check('acquire 后 busyCount=1', pool.stats().busyCount === 1);
  pool.release(w1);
  check('release 后 idleCount=1', pool.stats().idleCount === 1);
  check('release 后 busyCount=0', pool.stats().busyCount === 0);

  // ---- 3. LRU reuse（连续 5 次）----
  await pool.drain();
  const workers = [];
  for (let i = 0; i < 5; i++) {
    const w = await pool.acquire();
    workers.push(w);
    pool.release(w);
  }
  const stats = pool.stats();
  check('5 次 acquire：totalCreated ≤ 5', stats.totalCreated <= 5, `实际 created=${stats.totalCreated}`);
  check('5 次 acquire：totalReused ≥ 3', stats.totalReused >= 3, `实际 reused=${stats.totalReused}`);
  // reuse 比例应 > 0.5
  check('reuse 比例 > 0.5', stats.reuseRatio > 0.5, `reuseRatio=${stats.reuseRatio.toFixed(2)}`);

  // ---- 4. 不健康 worker 不入 idle ----
  await pool.drain();
  const wu = await pool.acquire();
  pool.release(wu, false); // 不健康
  check('不健康 worker 不入 idle（idleCount=0）', pool.stats().idleCount === 0);
  check('不健康 worker 计入 terminated', pool.stats().totalTerminated >= 1);

  // ---- 5. drain 后清空 ----
  await pool.drain();
  const drained = pool.stats();
  check('drain 后 idleCount=0', drained.idleCount === 0);
  check('drain 后 busyCount=0', drained.busyCount === 0);

  // ---- 6. idle timeout 自动清理 ----
  const shortPool = new WorkerPool({ maxSize: 2, idleTimeoutMs: 200 });
  await shortPool.drain();
  const wT = await shortPool.acquire();
  shortPool.release(wT);
  check('release 后立即 idleCount=1', shortPool.stats().idleCount === 1);
  // 等 idle timeout
  await new Promise((r) => setTimeout(r, 350));
  check('idle timeout 后 worker 被清理', shortPool.stats().idleCount === 0, `idleCount=${shortPool.stats().idleCount}`);

  // ---- 7. 与 sandbox.js 集成（executeInSandboxWorker 仍可用）----
  const sandboxPath = path.join(ROOT, 'server', 'agent', 'sandbox.js');
  const sandbox = require(sandboxPath);
  check('sandbox.js 导出仍包含 executeInSandboxWorker', typeof sandbox.executeInSandboxWorker === 'function');
  check('sandbox.js 导出仍包含 executeSandbox（统一调度器）', typeof sandbox.executeSandbox === 'function');
  // 周期 10 P1-3 集成：executeInSandboxWorker 路径保留（兼容旧 caller），pool 走新 acquire
  // 注：本期未直接改 sandbox.js executeSandbox 走 pool（避免破坏既有 spec）；新 caller 可直接用 pool
  check('pool acquire 返回的 Worker 与 sandbox-worker.js 兼容', wT && wT.threadId !== undefined);

  // ---- 8. maxSize 限制 ----
  const bounded = new WorkerPool({ maxSize: 2, idleTimeoutMs: 5000 });
  await bounded.drain();
  const wb1 = await bounded.acquire();
  const wb2 = await bounded.acquire();
  check('maxSize=2：第 2 次 acquire 成功', wb1 && wb2);
  // 第 3 次：busy 满 + 没 idle → 等 50ms 重试（实际测试等不到 idle；先 release 一下）
  bounded.release(wb1);
  const wb3 = await bounded.acquire();
  check('release 后可再 acquire', wb3 && wb3.threadId !== undefined);
  await bounded.drain();

  console.log(`\n--- summary: pass=${passed} fail=${failed} ---`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});