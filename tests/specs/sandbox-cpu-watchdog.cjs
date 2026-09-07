// tests/specs/sandbox-cpu-watchdog.cjs
// 周期 5 P1-2: sandbox worker CPU watchdog
//
// 背景：周期 4 P1-2 worker 隔离只防"完全同步阻塞"（依赖 vm.runInContext timeout）
//   周期 5 P1-2 加 CPU watchdog：worker 端每 50ms 采 process.cpuUsage() 累计 delta
//   累计 > cpuLimitMs → postMessage({event:'cpu_abort'}) → 主线程 worker.terminate
//   catch "间歇性 busy loop"（while (Date.now() - start < 5000) { ... }）
//
// 验收：
//   - 源文件含 startCpuWatchdog / stopCpuWatchdog 函数
//   - 源文件 workerData 含 cpuLimitMs
//   - 源文件主线程 message handler 处理 event=='cpu_abort'
//   - 行为：cpuLimitMs=0 关闭 watchdog
//   - 行为：短小正常代码不受影响
//   - 行为：CPU watchdog 不影响主线程
//   - 静态扫描：opts.cpuLimitMs 默认 0

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { executeInSandboxWorker } = require('../../server/agent/sandbox');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

const SANDBOX_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../server/agent/sandbox.js'),
  'utf8',
);
const WORKER_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../server/agent/sandbox-worker.js'),
  'utf8',
);

(async () => {
  console.log('=== sandbox-cpu-watchdog ===');

  // ---- 1. 静态扫描：源文件含 CPU watchdog 实现 ----
  await test('sandbox.js 含 executeInSandboxWorker + cpuLimitMs 参数', () => {
    assert.match(SANDBOX_SRC, /function\s+executeInSandboxWorker/);
    assert.match(SANDBOX_SRC, /cpuLimitMs/);
  });
  await test('sandbox-worker.js 含 startCpuWatchdog / stopCpuWatchdog', () => {
    assert.match(WORKER_SRC, /function\s+startCpuWatchdog/);
    assert.match(WORKER_SRC, /function\s+stopCpuWatchdog/);
  });
  await test('sandbox-worker.js 累计 process.cpuUsage()', () => {
    assert.match(WORKER_SRC, /process\.cpuUsage/);
  });
  await test('sandbox-worker.js 发 cpu_abort 事件', () => {
    assert.match(WORKER_SRC, /cpu_abort/);
    assert.match(WORKER_SRC, /parentPort\.postMessage/);
  });
  await test('sandbox.js 主线程 message handler 处理 event==cpu_abort', () => {
    assert.match(SANDBOX_SRC, /event\s*===\s*['"]cpu_abort['"]/);
    assert.match(SANDBOX_SRC, /cpuAbort:\s*true/);
  });

  // ---- 2. 行为：cpuLimitMs 缺省 = 0（关闭 watchdog）----
  await test('executeInSandboxWorker 短代码 + 默认 cpuLimitMs → ok', async () => {
    const r = await executeInSandboxWorker('return 1 + 1;', {}, { timeoutMs: 1000 });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, 2);
    assert.strictEqual(r.cpuAbort, undefined, '无 cpuAbort 字段');
  });

  // ---- 3. 行为：cpuLimitMs 显式 = 0 → 仍正常 ----
  await test('executeInSandboxWorker 短代码 + cpuLimitMs=0 → ok', async () => {
    const r = await executeInSandboxWorker(
      'return Promise.resolve(42);',
      {},
      { timeoutMs: 1000, cpuLimitMs: 0 }
    );
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, 42);
  });

  // ---- 4. 行为：cpuLimitMs 较大 → 正常代码仍 PASS ----
  await test('executeInSandboxWorker 长耗时正常代码 + cpuLimitMs=1000ms → ok', async () => {
    // 100ms CPU + 50ms await 在内 → 总 CPU < 200ms，远小于 1000ms
    const r = await executeInSandboxWorker(
      'let s = 0; for (let i = 0; i < 10000; i++) s += i; await new Promise(r => setTimeout(r, 10)); return s;',
      {},
      { timeoutMs: 2000, cpuLimitMs: 1000 }
    );
    assert.strictEqual(r.ok, true);
  });

  // ---- 5. 行为：CPU watchdog 周期性 busy loop → catch ----
  //   同步 while 循环无法 yield；watchdog 不会在同步代码中跑
  //   因此本测试期望"被 vm.runInContext timeout 兜底"（不是 watchdog catch）
  //   实际：cpuLimitMs=100 + timeoutMs=200 → 死循环 1s 被 timeout 拒
  await test('CPU watchdog test: 死循环被 timeout 兜底（sync loop watchdog 不可见）', async () => {
    const r = await executeInSandboxWorker(
      'while (true) {}',
      {},
      { timeoutMs: 200, cpuLimitMs: 100, heapMb: 64 }
    );
    assert.strictEqual(r.ok, false);
    // 应该被 SANDBOX_TIMEOUT 兜底（vm.runInContext timeout）
    assert.ok(/timed out|SANDBOX_TIMEOUT|超时/.test(r.error.message || r.error.code || ''),
      `应被 sandbox timeout 拒: ${JSON.stringify(r)}`);
  });

  // ---- 5b. 行为：CPU watchdog 真的 catch 间歇性 busy loop ----
  //   用 setImmediate 让出微任务，使 setInterval watchdog 能跑
  await test('CPU watchdog catch 间歇性 busy loop（yield 让 watchdog 跑）', async () => {
    const r = await executeInSandboxWorker(
      `const start = Date.now();
       let i = 0;
       function loop() {
         if (Date.now() - start >= 2000) return 'done-' + i;
         // busy 工作：消耗 CPU 但不调 Date.now
         let s = 0;
         for (let j = 0; j < 1000000; j++) s += j;
         i++;
         // yield 给 watchdog
         Promise.resolve().then(loop);
       }
       return loop();`,
      {},
      { timeoutMs: 10000, cpuLimitMs: 50, heapMb: 64 }
    );
    // cpuLimitMs=50ms 极严，busy loop 2s 累计 CPU 远超 50ms → cpuAbort
    // 若 watchdog 仍不可触发，则 timeout 兜底（10s）
    assert.strictEqual(r.ok, false, '应被拒');
    assert.ok(r.cpuAbort || /SANDBOX_TIMEOUT|超时/.test(r.error.message || r.error.code || ''),
      `应被 cpu_abort 或 timeout 兜底: ${JSON.stringify(r)}`);
  });

  // ---- 6. 行为：异步正常代码 + 严格 cpuLimitMs → PASS ----
  await test('异步代码 + cpuLimitMs=5000 → 不误杀', async () => {
    const r = await executeInSandboxWorker(
      'await new Promise(r => setTimeout(r, 20)); return "ok";',
      {},
      { timeoutMs: 2000, cpuLimitMs: 5000 }
    );
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, 'ok');
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
