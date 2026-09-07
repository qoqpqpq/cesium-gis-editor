// tests/specs/sandbox-worker-isolation.cjs
// 周期 4 P1-2: 沙箱 worker_threads 隔离 + Resource limits
//
// 背景：周期 3 P1-2 用 node:vm 仅时间隔离；周期 4 升级为真线程隔离
//
// 验收：
//   - executeInSandboxWorker 同步代码 → ok + value
//   - async/await → ok + value
//   - require('fs') → 抛错
//   - process / global / Buffer undefined
//   - ctx 注入字段可访问
//   - 超时 → worker.terminate
//   - 死循环不会卡主线程（实测：spawn 死循环，主线程 setTimeout 仍能跑）
//   - 周期 3 老 executeInSandbox 行为不变（向后兼容）

'use strict';

const assert = require('node:assert');
const { executeInSandboxWorker, executeInSandbox, DEFAULT_WORKER_HEAP_MB } = require('../../server/agent/sandbox');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

(async () => {
  console.log('=== sandbox-worker-isolation ===');

  // ---- 1. 同步代码 ----
  await test('worker 同步代码返回值', async () => {
    const r = await executeInSandboxWorker('return 1 + 2;', {}, { timeoutMs: 1000 });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, 3);
    assert.ok(r.workerId > 0);
    assert.ok(r.durationMs >= 0);
  });

  // ---- 2. async/await ----
  await test('worker async + await', async () => {
    const r = await executeInSandboxWorker(
      'const v = await Promise.resolve(42); return v * 2;',
      {},
      { timeoutMs: 1000 },
    );
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, 84);
  });

  // ---- 3. 白名单拒绝 ----
  await test('worker require 抛错', async () => {
    const r = await executeInSandboxWorker(
      'return require("fs").readdirSync("/");',
      {},
      { timeoutMs: 1000 },
    );
    assert.strictEqual(r.ok, false);
    assert.match(r.error.message, /require is not (defined|a function)/);
  });

  await test('worker process undefined', async () => {
    const r = await executeInSandboxWorker('return typeof process;', {}, { timeoutMs: 1000 });
    assert.strictEqual(r.value, 'undefined');
  });

  await test('worker global undefined', async () => {
    const r = await executeInSandboxWorker('return typeof global;', {}, { timeoutMs: 1000 });
    assert.strictEqual(r.value, 'undefined');
  });

  await test('worker Buffer undefined', async () => {
    const r = await executeInSandboxWorker('return typeof Buffer;', {}, { timeoutMs: 1000 });
    assert.strictEqual(r.value, 'undefined');
  });

  // ---- 4. ctx 注入 ----
  await test('worker ctx 注入 viewer/Cesium', async () => {
    const r = await executeInSandboxWorker(
      'return viewer.name + "|" + Cesium.VERSION;',
      { viewer: { name: 'cesium' }, Cesium: { VERSION: '1.124' } },
      { timeoutMs: 1000 },
    );
    assert.strictEqual(r.value, 'cesium|1.124');
  });

  // ---- 5. 超时 → worker.terminate ----
  await test('worker 死循环被 timeout 兜底（不卡主线程）', async () => {
    const t0 = Date.now();
    const r = await executeInSandboxWorker('while (true) {}', {}, { timeoutMs: 200 });
    const ms = Date.now() - t0;
    assert.strictEqual(r.ok, false);
    // vm.runInContext 自身 timeout 抛 "Script execution timed out after Nms"
    // 我们自己的 SANDBOX_TIMEOUT 是兜底（timeoutMs + 200ms）
    assert.ok(
      /timed out|SANDBOX|超时/.test(r.error.message) || r.error.code === 'SANDBOX_TIMEOUT',
      `应抛超时: ${r.error.message}`
    );
    assert.ok(ms < 1500, `应 < 1.5s 实际 ${ms}ms`);
  });

  // ---- 6. 主线程不被卡住（关键：死循环跑在 worker 里）----
  await test('worker 死循环不卡主线程 setTimeout', async () => {
    let mainThreadTick = 0;
    const interval = setInterval(() => { mainThreadTick += 1; }, 50);
    const p = executeInSandboxWorker('while (true) {}', {}, { timeoutMs: 300 });
    await new Promise((r) => setTimeout(r, 500));
    await p;
    clearInterval(interval);
    // 主线程跑了 500ms 至少 5 次 tick（50ms 一次）
    assert.ok(mainThreadTick >= 5, `主线程 tick 次数 ${mainThreadTick} < 5`);
  });

  // ---- 7. 资源限制常量 ----
  await test('DEFAULT_WORKER_HEAP_MB = 64', () => {
    assert.strictEqual(DEFAULT_WORKER_HEAP_MB, 64);
  });

  // ---- 8. 周期 3 旧 API 仍可用 ----
  await test('周期 3 executeInSandbox 仍可用（向后兼容）', async () => {
    const r = await executeInSandbox('return 1 + 1;', {}, { timeoutMs: 1000 });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, 2);
  });

  // ---- 9. 错误捕获（throw） ----
  await test('worker throw 错误捕获', async () => {
    const r = await executeInSandboxWorker('throw new Error("worker-boom");', {}, { timeoutMs: 1000 });
    assert.strictEqual(r.ok, false);
    assert.match(r.error.message, /worker-boom/);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
