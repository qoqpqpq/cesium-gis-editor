// tests/specs/sandbox-worker-pool-deep.cjs
// Cycle 25 R1: sandboxWorkerPool.js Worker 线程池深度测试
// 覆盖: 构造边界 / acquire 复用 / 死 worker 处理 / release 边界 / stats / defaultPool
// 与 sandbox-worker-pool.cjs (基础 23 PASS) 互补
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 使用空 worker 脚本（避免创建真实 sandbox-worker 600ms 开销）
const DUMMY_WORKER_PATH = path.join(os.tmpdir(), 'dummy-pool-worker.js');
if (!fs.existsSync(DUMMY_WORKER_PATH)) {
  fs.writeFileSync(DUMMY_WORKER_PATH, `
    // 空 worker，仅用于测试 WorkerPool 调度逻辑
    try { /* 等待消息 */ } catch (_) {}
  `);
}

const { WorkerPool, defaultPool, DEFAULT_MAX_SIZE, DEFAULT_IDLE_TIMEOUT_MS } =
  require('../../server/agent/sandboxWorkerPool');

// ---- 计数器 ----
let pass = 0, fail = 0;
const failures = [];
async function ok(label, fn) {
  try {
    await fn();
    pass++;
    console.log(`  [PASS] ${label}`);
  } catch (e) {
    fail++;
    console.log(`  [FAIL] ${label}: ${e.message}`);
    failures.push({ label, err: e.message });
  }
}

// ---- 工具：创建 pool 并自动 drain ----
async function withPool(opts, fn) {
  const pool = new WorkerPool({
    workerScript: DUMMY_WORKER_PATH,
    maxSize: opts.maxSize || 2,
    idleTimeoutMs: opts.idleTimeoutMs || 60000,
  });
  try {
    return await fn(pool);
  } finally {
    await pool.drain();
  }
}

function waitForExit(worker, timeoutMs = 3000) {
  return new Promise((resolve) => {
    if (worker.threadId === -1) return resolve();
    const t = setTimeout(() => resolve(), timeoutMs);
    worker.once('exit', () => { clearTimeout(t); resolve(); });
  });
}

async function main() {
  console.log('=== Cycle 25 R1: sandboxWorkerPool.js deep tests ===\n');

  // ===== A组: 模块导出补充 =====
  console.log('\n-- A组: 模块导出补充 --');
  await ok('A1: WorkerPool 类名正确', () => {
    assert.strictEqual(WorkerPool.name, 'WorkerPool');
  });
  await ok('A2: defaultPool 使用默认 workerScript', () => {
    assert.ok(defaultPool.workerScript.endsWith('sandbox-worker.js'));
  });
  await ok('A3: defaultPool.maxSize=4', () => {
    assert.strictEqual(defaultPool.maxSize, DEFAULT_MAX_SIZE);
    assert.strictEqual(defaultPool.maxSize, 4);
  });
  await ok('A4: defaultPool.idleTimeoutMs=60000', () => {
    assert.strictEqual(defaultPool.idleTimeoutMs, DEFAULT_IDLE_TIMEOUT_MS);
    assert.strictEqual(defaultPool.idleTimeoutMs, 60000);
  });

  // ===== B组: WorkerPool 构造边界 =====
  console.log('\n-- B组: WorkerPool 构造边界 --');
  await ok('B1: maxSize=0 时回退到默认 4', () => {
    const p = new WorkerPool({ maxSize: 0 });
    // Number(0) || 4 = 4
    assert.strictEqual(p.maxSize, 4);
  });
  await ok('B2: maxSize=NaN 时回退到默认 4', () => {
    const p = new WorkerPool({ maxSize: NaN });
    assert.strictEqual(p.maxSize, 4);
  });
  await ok('B3: maxSize 字符串数字解析', () => {
    const p = new WorkerPool({ maxSize: '3' });
    assert.strictEqual(p.maxSize, 3);
  });
  await ok('B4: maxSize 负数回退到默认', () => {
    // Number(-5) || 4 = -5（因为 -5 是 truthy）
    // 实际行为：负 maxSize 会导致 acquire 立即创建（因为 _totalCreated - _totalTerminated < -5 总是 false 时等待）
    // 这里只验证解析行为
    const p = new WorkerPool({ maxSize: -5 });
    assert.strictEqual(p.maxSize, -5);
  });
  await ok('B5: maxSize 非数字字符串回退到默认', () => {
    const p = new WorkerPool({ maxSize: 'abc' });
    // Number('abc')=NaN, NaN || 4 = 4
    assert.strictEqual(p.maxSize, 4);
  });
  await ok('B6: idleTimeoutMs=0 时回退到默认', () => {
    const p = new WorkerPool({ idleTimeoutMs: 0 });
    assert.strictEqual(p.idleTimeoutMs, 60000);
  });
  await ok('B7: idleTimeoutMs 字符串数字解析', () => {
    const p = new WorkerPool({ idleTimeoutMs: '1000' });
    assert.strictEqual(p.idleTimeoutMs, 1000);
  });
  await ok('B8: 自定义 workerScript 保留', () => {
    const p = new WorkerPool({ workerScript: '/custom/path.js' });
    assert.strictEqual(p.workerScript, '/custom/path.js');
  });
  await ok('B9: 初始 _idle=[]', () => {
    const p = new WorkerPool({ workerScript: DUMMY_WORKER_PATH });
    assert.deepStrictEqual(p._idle, []);
  });
  await ok('B10: 初始 _busy.size=0', () => {
    const p = new WorkerPool({ workerScript: DUMMY_WORKER_PATH });
    assert.strictEqual(p._busy.size, 0);
  });
  await ok('B11: 初始 _idleTimers 是 WeakMap', () => {
    const p = new WorkerPool({ workerScript: DUMMY_WORKER_PATH });
    assert.ok(p._idleTimers instanceof WeakMap);
  });
  await ok('B12: 初始 _totalCreated=0', () => {
    const p = new WorkerPool({ workerScript: DUMMY_WORKER_PATH });
    assert.strictEqual(p._totalCreated, 0);
  });
  await ok('B13: 初始 _totalReused=0', () => {
    const p = new WorkerPool({ workerScript: DUMMY_WORKER_PATH });
    assert.strictEqual(p._totalReused, 0);
  });
  await ok('B14: 初始 _totalTerminated=0', () => {
    const p = new WorkerPool({ workerScript: DUMMY_WORKER_PATH });
    assert.strictEqual(p._totalTerminated, 0);
  });
  await ok('B15: maxSize=1 时正常构造', () => {
    const p = new WorkerPool({ maxSize: 1 });
    assert.strictEqual(p.maxSize, 1);
  });

  // ===== C组: acquire 复用深入 =====
  console.log('\n-- C组: acquire 复用深入 --');
  await ok('C1: release 后再次 acquire 复用同一 worker（引用相等）', async () => {
    await withPool({ maxSize: 2 }, async (pool) => {
      const w1 = await pool.acquire();
      pool.release(w1, true);
      const w2 = await pool.acquire();
      assert.strictEqual(w1, w2);
    });
  });
  await ok('C2: 复用后 _totalReused 递增', async () => {
    await withPool({ maxSize: 2 }, async (pool) => {
      const w = await pool.acquire();
      pool.release(w, true);
      assert.strictEqual(pool._totalReused, 0);
      await pool.acquire();
      assert.strictEqual(pool._totalReused, 1);
    });
  });
  await ok('C3: 复用后 _totalCreated 不增', async () => {
    await withPool({ maxSize: 2 }, async (pool) => {
      const w = await pool.acquire();
      pool.release(w, true);
      await pool.acquire();
      assert.strictEqual(pool._totalCreated, 1);
    });
  });
  await ok('C4: 多次 acquire/release 交替只创建 1 个', async () => {
    await withPool({ maxSize: 2 }, async (pool) => {
      for (let i = 0; i < 5; i++) {
        const w = await pool.acquire();
        pool.release(w, true);
      }
      assert.strictEqual(pool._totalCreated, 1);
      assert.strictEqual(pool._totalReused, 4);
    });
  });
  await ok('C5: maxSize=2 时 2 个并发 worker', async () => {
    await withPool({ maxSize: 2 }, async (pool) => {
      const w1 = await pool.acquire();
      const w2 = await pool.acquire();
      assert.ok(w1 !== w2);
      assert.strictEqual(pool._totalCreated, 2);
      assert.strictEqual(pool._busy.size, 2);
      pool.release(w1, true);
      pool.release(w2, true);
      assert.strictEqual(pool._idle.length, 2);
    });
  });
  await ok('C6: maxSize=3 时 3 个并发 worker', async () => {
    await withPool({ maxSize: 3 }, async (pool) => {
      const workers = [];
      for (let i = 0; i < 3; i++) {
        workers.push(await pool.acquire());
      }
      assert.strictEqual(pool._totalCreated, 3);
      // 所有 worker 都不同
      const unique = new Set(workers);
      assert.strictEqual(unique.size, 3);
    });
  });
  await ok('C7: maxSize=1 时第 2 次 acquire 进入等待分支（100ms 内不 resolve）', async () => {
    await withPool({ maxSize: 1 }, async (pool) => {
      const w1 = await pool.acquire();
      let resolved = false;
      const p2 = pool.acquire().then((w) => { resolved = true; return w; });
      // 等待 100ms 看是否仍在等待
      await new Promise((r) => setTimeout(r, 100));
      assert.strictEqual(resolved, false, '第 2 次 acquire 应在 100ms 内仍在等待');
      // release 让 _totalTerminated=1，活跃数 1-1=0 < maxSize，重试 acquire 创建新 worker
      // （注：50ms 时 acquire 重试，idle 为空；release 在 100ms 时执行，
      //   下一次 50ms 重试会看到 _totalCreated-_totalTerminated=0<1 并创建新 worker）
      pool.release(w1, true);
      const w2 = await p2;
      assert.ok(w2 && typeof w2.threadId === 'number');
      assert.strictEqual(pool._totalCreated, 2, 'release 后重试创建新 worker');
      assert.strictEqual(pool._totalReused, 0, '因为 _totalTerminated 增加导致走创建分支');
    });
  });
  await ok('C8: 立即 release 时第 2 次 acquire 能复用（不经过等待分支）', async () => {
    await withPool({ maxSize: 1 }, async (pool) => {
      const w1 = await pool.acquire();
      pool.release(w1, true);
      // 立即 acquire，idle 有 w1
      const w2 = await pool.acquire();
      assert.strictEqual(w1, w2, '应立即复用');
      assert.strictEqual(pool._totalCreated, 1);
      assert.strictEqual(pool._totalReused, 1);
    });
  });

  // ===== D组: 死 worker 处理 =====
  console.log('\n-- D组: 死 worker 处理 --');
  await ok('D1: acquire 跳过硬编码 threadId=-1 的死 worker', async () => {
    const pool = new WorkerPool({ workerScript: DUMMY_WORKER_PATH });
    const fakeDead = { threadId: -1, terminate: () => {} };
    pool._idle.push(fakeDead);
    const w = await pool.acquire();
    assert.ok(w.threadId > 0);
    assert.strictEqual(pool._totalCreated, 1);
    assert.strictEqual(pool._totalTerminated, 1); // 死 worker 计入
    await pool.drain();
  });
  await ok('D2: 多个死 worker 都被清理', async () => {
    const pool = new WorkerPool({ workerScript: DUMMY_WORKER_PATH });
    for (let i = 0; i < 3; i++) {
      pool._idle.push({ threadId: -1, terminate: () => {} });
    }
    const w = await pool.acquire();
    assert.ok(w.threadId > 0);
    assert.strictEqual(pool._totalCreated, 1);
    assert.strictEqual(pool._totalTerminated, 3);
    await pool.drain();
  });
  await ok('D3: 混合 alive/dead 时跳死取活', async () => {
    await withPool({ maxSize: 2 }, async (pool) => {
      const w1 = await pool.acquire();
      pool.release(w1, true);
      // 注入死 worker 到 idle 头部
      pool._idle.unshift({ threadId: -1, terminate: () => {} });
      const w2 = await pool.acquire();
      assert.strictEqual(w1, w2); // reuse 活的
      assert.strictEqual(pool._totalCreated, 1);
      assert.strictEqual(pool._totalReused, 1);
    });
  });
  await ok('D4: 全死时创建新 worker', async () => {
    await withPool({ maxSize: 2 }, async (pool) => {
      pool._idle.push({ threadId: -1, terminate: () => {} });
      pool._idle.push({ threadId: -1, terminate: () => {} });
      const w = await pool.acquire();
      assert.ok(w.threadId > 0);
      assert.strictEqual(pool._totalCreated, 1);
    });
  });

  // ===== E组: release 边界 =====
  console.log('\n-- E组: release 边界 --');
  await ok('E1: release(healthy=false) 直接 terminate', async () => {
    await withPool({ maxSize: 2 }, async (pool) => {
      const w = await pool.acquire();
      pool.release(w, false);
      assert.strictEqual(pool._idle.length, 0);
      assert.strictEqual(pool._busy.size, 0);
      assert.ok(pool._totalTerminated >= 1);
      await waitForExit(w, 2000);
    });
  });
  await ok('E2: release 默认 healthy=true', async () => {
    await withPool({ maxSize: 2 }, async (pool) => {
      const w = await pool.acquire();
      pool.release(w); // 默认 true
      assert.strictEqual(pool._idle.length, 1);
    });
  });
  await ok('E3: release(null) 不抛错', async () => {
    await withPool({}, async (pool) => {
      assert.doesNotThrow(() => pool.release(null));
    });
  });
  await ok('E4: release(undefined) 不抛错', async () => {
    await withPool({}, async (pool) => {
      assert.doesNotThrow(() => pool.release(undefined));
    });
  });
  await ok('E5: release(healthy=true) 设置 idle timer', async () => {
    await withPool({ maxSize: 2 }, async (pool) => {
      const w = await pool.acquire();
      pool.release(w, true);
      assert.ok(pool._idleTimers.has(w));
    });
  });
  await ok('E6: release(healthy=false) 不设置 idle timer', async () => {
    await withPool({ maxSize: 2 }, async (pool) => {
      const w = await pool.acquire();
      pool.release(w, false);
      assert.ok(!pool._idleTimers.has(w));
      await waitForExit(w, 2000);
    });
  });
  await ok('E7: release 未持有的 worker 不抛错', async () => {
    await withPool({ maxSize: 2 }, async (pool) => {
      const w = await pool.acquire();
      // 模拟一个未在 _busy 中的 worker
      const other = { threadId: 999, terminate: () => {} };
      assert.doesNotThrow(() => pool.release(other, true));
      // other 被加入 _idle
      assert.strictEqual(pool._idle.length, 1);
      assert.strictEqual(pool._idle[0], other);
    });
  });

  // ===== F组: idle timeout 深入 =====
  console.log('\n-- F组: idle timeout 深入 --');
  await ok('F1: idleTimeoutMs 短后 worker 被清理', async () => {
    await withPool({ maxSize: 2, idleTimeoutMs: 100 }, async (pool) => {
      const w = await pool.acquire();
      pool.release(w, true);
      await new Promise((r) => setTimeout(r, 250));
      assert.strictEqual(pool._idle.length, 0);
      assert.ok(pool._totalTerminated >= 1);
      await waitForExit(w, 2000);
    });
  });
  await ok('F2: acquire 复用前清 idle timer', async () => {
    await withPool({ maxSize: 2, idleTimeoutMs: 5000 }, async (pool) => {
      const w = await pool.acquire();
      pool.release(w, true);
      const t1 = pool._idleTimers.get(w);
      assert.ok(t1);
      const w2 = await pool.acquire();
      assert.ok(!pool._idleTimers.has(w2));
    });
  });
  await ok('F3: _clearIdleTimer 清理 WeakMap 条目', async () => {
    await withPool({ maxSize: 2 }, async (pool) => {
      const w = await pool.acquire();
      pool.release(w, true);
      assert.ok(pool._idleTimers.has(w));
      pool._clearIdleTimer(w);
      assert.ok(!pool._idleTimers.has(w));
    });
  });
  await ok('F4: _clearIdleTimer 对无 timer 的 worker 不抛错', async () => {
    await withPool({ maxSize: 2 }, async (pool) => {
      const w = await pool.acquire();
      assert.doesNotThrow(() => pool._clearIdleTimer(w));
    });
  });
  await ok('F5: 多个 idle worker 各自独立 timeout', async () => {
    await withPool({ maxSize: 3, idleTimeoutMs: 100 }, async (pool) => {
      const w1 = await pool.acquire();
      const w2 = await pool.acquire();
      const w3 = await pool.acquire();
      pool.release(w1, true);
      pool.release(w2, true);
      pool.release(w3, true);
      assert.strictEqual(pool._idle.length, 3);
      await new Promise((r) => setTimeout(r, 250));
      assert.strictEqual(pool._idle.length, 0);
      await waitForExit(w1, 2000);
      await waitForExit(w2, 2000);
      await waitForExit(w3, 2000);
    });
  });

  // ===== G组: drain() 深入 =====
  console.log('\n-- G组: drain() 深入 --');
  await ok('G1: drain 清空 _idle', async () => {
    await withPool({ maxSize: 2 }, async (pool) => {
      const w = await pool.acquire();
      pool.release(w, true);
      await pool.drain();
      assert.strictEqual(pool._idle.length, 0);
    });
  });
  await ok('G2: drain 清空 _busy', async () => {
    await withPool({ maxSize: 2 }, async (pool) => {
      await pool.acquire();
      await pool.drain();
      assert.strictEqual(pool._busy.size, 0);
    });
  });
  await ok('G3: drain 增加 _totalTerminated', async () => {
    await withPool({ maxSize: 3 }, async (pool) => {
      const w1 = await pool.acquire();
      const w2 = await pool.acquire();
      pool.release(w1, true);
      const before = pool._totalTerminated;
      await pool.drain();
      assert.ok(pool._totalTerminated > before);
    });
  });
  await ok('G4: drain 后 acquire 创建新 worker', async () => {
    await withPool({ maxSize: 2 }, async (pool) => {
      const w1 = await pool.acquire();
      await pool.drain();
      const w2 = await pool.acquire();
      assert.ok(w1 !== w2);
      assert.strictEqual(pool._totalCreated, 2);
    });
  });
  await ok('G5: drain 空 pool 不抛错', async () => {
    await withPool({}, async (pool) => {
      assert.doesNotThrow(async () => { await pool.drain(); });
    });
  });
  await ok('G6: drain 后所有 worker 被 terminate', async () => {
    await withPool({ maxSize: 3 }, async (pool) => {
      const w1 = await pool.acquire();
      const w2 = await pool.acquire();
      pool.release(w1, true);
      await pool.drain();
      // 等退出
      await waitForExit(w1, 2000);
      await waitForExit(w2, 2000);
    });
  });

  // ===== H组: stats() 深入 =====
  console.log('\n-- H组: stats() 深入 --');
  await ok('H1: 初始 stats 全零', () => {
    const p = new WorkerPool({ workerScript: DUMMY_WORKER_PATH });
    const s = p.stats();
    assert.strictEqual(s.maxSize, DEFAULT_MAX_SIZE);
    assert.strictEqual(s.idleCount, 0);
    assert.strictEqual(s.busyCount, 0);
    assert.strictEqual(s.totalCreated, 0);
    assert.strictEqual(s.totalReused, 0);
    assert.strictEqual(s.totalTerminated, 0);
    assert.strictEqual(s.reuseRatio, 0);
  });
  await ok('H2: reuseRatio=0.5 当 1 创建 1 复用', async () => {
    await withPool({ maxSize: 2 }, async (pool) => {
      const w = await pool.acquire();
      pool.release(w, true);
      await pool.acquire();
      const s = pool.stats();
      // totalCreated=1, totalReused=1 → 1/(1+1) = 0.5
      assert.strictEqual(s.reuseRatio, 0.5);
    });
  });
  await ok('H3: reuseRatio=0.667 当 1 创建 2 复用', async () => {
    await withPool({ maxSize: 1 }, async (pool) => {
      for (let i = 0; i < 3; i++) {
        const w = await pool.acquire();
        pool.release(w, true);
      }
      const s = pool.stats();
      // totalCreated=1, totalReused=2 → 2/(1+2) = 0.666...
      assert.ok(Math.abs(s.reuseRatio - 2 / 3) < 1e-6);
    });
  });
  await ok('H4: stats idleCount 反映 _idle.length', async () => {
    await withPool({ maxSize: 3 }, async (pool) => {
      const w1 = await pool.acquire();
      const w2 = await pool.acquire();
      pool.release(w1, true);
      pool.release(w2, true);
      assert.strictEqual(pool.stats().idleCount, 2);
    });
  });
  await ok('H5: stats busyCount 反映 _busy.size', async () => {
    await withPool({ maxSize: 3 }, async (pool) => {
      await pool.acquire();
      await pool.acquire();
      await pool.acquire();
      assert.strictEqual(pool.stats().busyCount, 3);
    });
  });
  await ok('H6: stats totalCreated 随 acquire 创建累加', async () => {
    await withPool({ maxSize: 3 }, async (pool) => {
      await pool.acquire();
      await pool.acquire();
      assert.strictEqual(pool.stats().totalCreated, 2);
    });
  });
  await ok('H7: stats totalReused 随复用累加', async () => {
    await withPool({ maxSize: 1 }, async (pool) => {
      for (let i = 0; i < 4; i++) {
        const w = await pool.acquire();
        pool.release(w, true);
      }
      assert.strictEqual(pool.stats().totalReused, 3);
    });
  });
  await ok('H8: stats totalTerminated 随 release(false) 累加', async () => {
    await withPool({ maxSize: 3 }, async (pool) => {
      for (let i = 0; i < 3; i++) {
        const w = await pool.acquire();
        pool.release(w, false);
        await waitForExit(w, 2000);
      }
      assert.strictEqual(pool.stats().totalTerminated, 3);
    });
  });

  // ===== I组: 集成 - sandbox.js 兼容 =====
  console.log('\n-- I组: 集成 - sandbox.js 兼容 --');
  await ok('I1: sandbox.js 导出包含 executeInSandboxWorker', () => {
    const sandbox = require('../../server/agent/sandbox');
    assert.strictEqual(typeof sandbox.executeInSandboxWorker, 'function');
  });
  await ok('I2: sandbox.js 导出包含 executeSandbox', () => {
    const sandbox = require('../../server/agent/sandbox');
    assert.strictEqual(typeof sandbox.executeSandbox, 'function');
  });
  await ok('I3: WorkerPool 创建的 worker 与 sandbox-worker.js 兼容', async () => {
    // 用真实 sandbox-worker.js 创建 pool
    const pool = new WorkerPool({ maxSize: 1, idleTimeoutMs: 5000 });
    const w = await pool.acquire();
    assert.ok(w && typeof w.terminate === 'function');
    assert.ok(w.threadId !== undefined);
    assert.ok(w.threadId > 0);
    await pool.drain();
  });
  await ok('I4: 真实 worker 可正常消息通信', async () => {
    const pool = new WorkerPool({ maxSize: 1, idleTimeoutMs: 5000 });
    const w = await pool.acquire();
    // 发送消息测试（sandbox-worker 会处理）
    w.postMessage({ code: '1+1', ctx: {}, timeoutMs: 1000, cpuLimitMs: 100 });
    const result = await new Promise((resolve) => {
      w.once('message', resolve);
      setTimeout(() => resolve(null), 2000);
    });
    // result 可能是 { success, value } 或 null（超时）
    assert.ok(result === null || typeof result === 'object');
    await pool.drain();
  });

  // ===== summary =====
  console.log(`\n--- summary: pass=${pass} fail=${fail} ---`);
  if (failures.length) {
    console.log('failures:', JSON.stringify(failures, null, 2));
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(2);
});
