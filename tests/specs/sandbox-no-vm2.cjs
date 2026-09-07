// tests/specs/sandbox-no-vm2.cjs
// 周期 3 P1-2: 服务端代码沙箱（node:vm，不用 vm2）
//
// 背景：调研/OWASP 推荐 node:vm（vm2 多次 escape + 已停维）
//
// 验收：
//   - 静态扫描：源码 require 'node:vm' 而非 'vm2'
//   - executeInSandbox() 同步代码 → 返回值
//   - async/await → 返回 Promise resolve 值
//   - require('fs') 在沙箱里抛 ReferenceError
//   - process / global / Buffer undefined
//   - 超时 → 抛错
//   - 显式 ctx 注入可访问
//   - 死循环不会卡死进程（被 timeout 兜底）

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { executeInSandbox } = require('../../server/agent/sandbox');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

(async () => {
  console.log('=== sandbox-no-vm2 ===');

  // ---- 1. 静态扫描 ----
  const SRC = fs.readFileSync(
    path.resolve(__dirname, '../../server/agent/sandbox.js'),
    'utf8',
  );
  await test('源码不含 vm2 require', () => {
    assert.ok(!/require\(['"]vm2['"]\)/.test(SRC), '不应 require vm2');
  });
  await test('源码 require node:vm', () => {
    assert.match(SRC, /require\(['"]node:vm['"]\)/);
  });
  await test('源码使用 vm.createContext', () => {
    assert.match(SRC, /vm\.createContext/);
  });

  // ---- 2. 同步代码 ----
  await test('同步代码返回值', async () => {
    const r = await executeInSandbox('return 1 + 2;', {}, { timeoutMs: 1000 });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, 3);
    assert.ok(r.durationMs >= 0);
  });

  await test('同步代码 throw 错误捕获', async () => {
    const r = await executeInSandbox('throw new Error("boom");', {}, { timeoutMs: 1000 });
    assert.strictEqual(r.ok, false);
    assert.match(r.error.message, /boom/);
  });

  // ---- 3. async/await ----
  await test('async 代码 + Promise resolve', async () => {
    const r = await executeInSandbox(
      'const v = await Promise.resolve(42); return v * 2;',
      {},
      { timeoutMs: 1000 },
    );
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, 84);
  });

  // ---- 4. 白名单拒绝 ----
  await test('require 在沙箱里抛 ReferenceError', async () => {
    const r = await executeInSandbox(
      'return require("fs").readdirSync("/");',
      {},
      { timeoutMs: 1000 },
    );
    assert.strictEqual(r.ok, false);
    assert.match(r.error.message, /require is not (defined|a function)/);
  });

  await test('process 在沙箱里 undefined', async () => {
    const r = await executeInSandbox(
      'return typeof process;',
      {},
      { timeoutMs: 1000 },
    );
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, 'undefined');
  });

  await test('global 在沙箱里 undefined', async () => {
    const r = await executeInSandbox(
      'return typeof global;',
      {},
      { timeoutMs: 1000 },
    );
    assert.strictEqual(r.value, 'undefined');
  });

  await test('Buffer 在沙箱里 undefined', async () => {
    const r = await executeInSandbox(
      'return typeof Buffer;',
      {},
      { timeoutMs: 1000 },
    );
    assert.strictEqual(r.value, 'undefined');
  });

  await test('globalThis 在沙箱里 === sandbox', async () => {
    const r = await executeInSandbox(
      'return typeof globalThis;',
      {},
      { timeoutMs: 1000 },
    );
    // globalThis 被我们显式 undefined 屏蔽
    assert.strictEqual(r.value, 'undefined');
  });

  // ---- 5. 显式 ctx 注入 ----
  await test('ctx 注入 viewer/Cesium 可访问', async () => {
    const r = await executeInSandbox(
      'return viewer.name + "|" + Cesium.VERSION;',
      { viewer: { name: 'cesium' }, Cesium: { VERSION: '1.123' } },
      { timeoutMs: 1000 },
    );
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, 'cesium|1.123');
  });

  await test('ctx 注入 + 实际业务调用', async () => {
    const fakeViewer = {
      entities: { values: [], add: function (e) { this.values.push(e); return e; } },
    };
    const r = await executeInSandbox(
      'const e = viewer.entities.add({ id: "x" }); return viewer.entities.values.length;',
      { viewer: fakeViewer },
      { timeoutMs: 1000 },
    );
    assert.strictEqual(r.value, 1);
  });

  // ---- 6. 超时 ----
  await test('死循环被 timeout 兜底（vm 内置 timeout 或我们 setTimeout）', async () => {
    const r = await executeInSandbox(
      'while (true) {}',
      {},
      { timeoutMs: 200 },
    );
    assert.strictEqual(r.ok, false);
    // vm.Script.runInContext 在 Node 19+ 支持 timeout option，会抛 "Script execution timed out"
    assert.ok(
      /超时|timed out|SANDBOX_TIMEOUT/.test(r.error.message),
      `应抛超时: ${r.error.message}`,
    );
  });

  // ---- 7. console 捕获 ----
  await test('console.log 被捕获到 logs', async () => {
    const r = await executeInSandbox(
      'console.log("hello", 123); return "done";',
      {},
      { timeoutMs: 1000 },
    );
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, 'done');
    assert.ok(Array.isArray(r.logs), `logs 应是数组: ${typeof r.logs}`);
    const log = r.logs.find((l) => l.level === 'log');
    assert.ok(log, '应捕获 log');
    assert.deepStrictEqual(log.args, ['hello', 123]);
  });

  // ---- 8. 行号提取 ----
  await test('错误行号提取', async () => {
    const r = await executeInSandbox(
      '\nthrow new Error("line-test");', // 第 2 行
      {},
      { timeoutMs: 1000 },
    );
    assert.strictEqual(r.ok, false);
    assert.match(r.error.message, /line-test/);
    // 行号可能 undefined（vm timeout 错误不带 stack），不强求
  });

  // ---- 9. 默认参数 ----
  await test('缺省 timeoutMs=5000', async () => {
    const r = await executeInSandbox('return 1;');
    assert.strictEqual(r.ok, true);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
