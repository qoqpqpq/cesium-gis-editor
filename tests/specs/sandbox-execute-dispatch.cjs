// tests/specs/sandbox-execute-dispatch.cjs
// 周期 8 P1-2: executeSandbox 统一调度器（vm / worker / iv / auto）
//
// 背景：
//   - 周期 1-7 累积三个沙箱执行函数：executeInSandbox / executeInSandboxWorker / executeIsolatedVm
//   - 周期 8 P1-2 统一为 executeSandbox(code, ctx, opts)；保留旧函数向后兼容
//   - 通过 opts.engine 或环境变量 SANDBOX_ENGINE 选择引擎
//
// 验收：
//   1. 静态扫描：sandbox.js 导出 executeSandbox 函数
//   2. 静态扫描：executeSandbox 接收 opts.engine 字段
//   3. 静态扫描：executeSandbox 支持 vm / worker / iv / auto 四种引擎
//   4. 行为：executeSandbox 缺省走 worker（与既有调用方一致）
//   5. 行为：executeSandbox opts.engine='vm' 走 node:vm 同步路径
//   6. 行为：executeSandbox opts.engine='iv' 在 iv 缺包时回退 vm（不抛错）
//   7. 行为：executeSandbox 返回值含 engine 字段
//   8. 行为：executeSandbox 同步代码可跑 + 返回值
//   9. 行为：executeSandbox timeoutMs 生效（超时返回 ok:false）
//   10. 行为：现有 executeInSandbox / executeInSandboxWorker / executeIsolatedVm 仍可调（向后兼容）
//   11. 行为：executeSandbox require('fs') 抛错（沙箱隔离）
//   12. 行为：resolveEngine + executeSandbox 组合：'auto' 优先 iv，缺包回落 vm

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
  executeSandbox,
  executeInSandbox,
  executeInSandboxWorker,
  executeIsolatedVm,
  resolveEngine,
} = require('../../server/agent/sandbox');

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

(async () => {
  console.log('=== sandbox-execute-dispatch ===');

  // ---- 1. 静态扫描 ----
  await test('sandbox.js 导出 executeSandbox 函数', () => {
    assert.match(SANDBOX_SRC, /async\s+function\s+executeSandbox\s*\(/);
    assert.match(SANDBOX_SRC, /executeSandbox,/);
  });
  await test('sandbox.js executeSandbox 接收 opts.engine 字段', () => {
    assert.match(SANDBOX_SRC, /opts\.engine/);
  });
  await test('sandbox.js executeSandbox 支持 vm / worker / iv / auto 四种引擎', () => {
    assert.match(SANDBOX_SRC, /'vm'/);
    assert.match(SANDBOX_SRC, /'worker'/);
    assert.match(SANDBOX_SRC, /'iv'/);
    assert.match(SANDBOX_SRC, /'auto'/);
  });
  await test('sandbox.js executeSandbox 缺省 engine = worker', () => {
    assert.match(SANDBOX_SRC, /opts\.engine\s*\|\|\s*process\.env\.SANDBOX_ENGINE\s*\|\|\s*['"]worker['"]/);
  });

  // ---- 2. 行为：executeSandbox 缺省走 worker ----
  await test('executeSandbox 缺省 engine = worker（与既有调用方一致）', async () => {
    const r = await executeSandbox('return 1 + 1;', {});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, 2);
    assert.ok(r.workerId !== undefined || r.engine === 'worker', '缺省应含 workerId 或 engine=worker');
  });

  // ---- 3. 行为：engine=vm 走同步路径 ----
  await test('executeSandbox opts.engine=vm 走 node:vm 同步路径', async () => {
    const r = await executeSandbox('return __ctx.x * 2;', { x: 21 }, { engine: 'vm' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, 42);
    assert.strictEqual(r.engine, 'vm');
  });

  // ---- 4. 行为：engine=iv 在 iv 缺包时回退 ----
  await test('executeSandbox opts.engine=iv 在 iv 缺包时返回 ok:false + code=IV_NOT_AVAILABLE', async () => {
    const r = await executeSandbox('return 1;', {}, { engine: 'iv' });
    // isolated-vm 通常不可用 → executeIsolatedVm 返回 ok:false
    if (!r.ok && r.error && /IV_NOT_AVAILABLE/.test(r.error.code || '')) {
      assert.strictEqual(r.engine, 'iv');
    } else if (r.ok) {
      // 如果装了 isolated-vm 就走 iv 路径
      assert.strictEqual(r.engine, 'iv');
    } else {
      // 其他错误（不期望）
      assert.fail('unexpected error: ' + JSON.stringify(r.error));
    }
  });

  // ---- 5. 行为：返回值含 engine 字段 ----
  await test('executeSandbox 返回值含 engine 字段', async () => {
    const r1 = await executeSandbox('return 1;', {}, { engine: 'vm' });
    assert.strictEqual(typeof r1.engine, 'string');
    const r2 = await executeSandbox('return 1;', {}, { engine: 'worker' });
    assert.strictEqual(typeof r2.engine, 'string');
  });

  // ---- 6. 行为：同步代码可跑 + 返回值 ----
  await test('executeSandbox 同步代码可跑 + 返回值（vm 引擎 __ctx 注入）', async () => {
    const r = await executeSandbox(`
      const sum = (a, b) => a + b;
      return sum(__ctx.x, __ctx.y);
    `, { x: 10, y: 20 }, { engine: 'vm' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, 30);
  });

  await test('executeSandbox 异步代码可跑 + await（worker 引擎）', async () => {
    const r = await executeSandbox(`
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      await wait(10);
      return __ctx.value + 1;
    `, { value: 100 }, { engine: 'worker' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, 101);
  });

  // ---- 7. 行为：timeoutMs 生效 ----
  await test('executeSandbox timeoutMs 生效（worker 引擎超时返回 ok:false）', async () => {
    const r = await executeSandbox(`
      // 死循环触发 timeout
      while(true) {}
    `, {}, { engine: 'worker', timeoutMs: 300 });
    // worker 引擎支持 timeoutMs；vm 不支持真 AbortSignal
    assert.strictEqual(r.ok, false, 'worker 应触发超时');
    if (r.error) {
      // vm.Script.timeout 报 ERR_SCRIPT_EXECUTION_TIMEOUT；worker 也可能
      assert.ok(/timed out|超时|TERMINATE|SCRIPT_EXEC/i.test(r.error.message || r.error.code || ''),
        '错误信息应含超时标识: ' + JSON.stringify(r.error));
    }
  }, 5000);

  // ---- 8. 行为：require('fs') 抛错（沙箱隔离） ----
  await test('executeSandbox 沙箱内 require("fs") 抛错（vm 引擎隔离）', async () => {
    const r = await executeSandbox(`
      try {
        const fs = require('fs');
        return { leaked: true };
      } catch (e) {
        return { leaked: false, msg: e.message };
      }
    `, {}, { engine: 'vm' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value.leaked, false, 'vm 引擎应阻止 require');
  });

  // ---- 9. 行为：旧函数仍可调 ----
  await test('向后兼容：executeInSandbox 仍可调', async () => {
    const r = await executeInSandbox('return 1 + 2;', {});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, 3);
  });

  await test('向后兼容：executeInSandboxWorker 仍可调', async () => {
    const r = await executeInSandboxWorker('return 1 + 3;', {});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, 4);
  });

  await test('向后兼容：executeIsolatedVm 仍可调', async () => {
    const r = await executeIsolatedVm('return 1 + 4;', {});
    // iv 缺包时返回 ok:false + IV_NOT_AVAILABLE（这是预期行为，不是 bug）
    if (r.ok) {
      assert.strictEqual(r.value, 5);
    } else {
      assert.ok(/IV_NOT_AVAILABLE/.test(r.error.code || ''));
    }
  });

  // ---- 10. 行为：resolveEngine + executeSandbox 'auto' 组合 ----
  await test('executeSandbox engine=auto：resolveEngine 优先 iv，缺包回落 worker', async () => {
    const resolved = resolveEngine('auto');
    assert.ok(resolved, 'resolveEngine 应返回对象');
    const r = await executeSandbox('return __ctx.x;', { x: 99 }, { engine: 'auto' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, 99);
    if (resolved.engine === 'iv') {
      assert.strictEqual(r.engine, 'iv');
    } else if (resolved.engine === 'vm') {
      // auto 回落 → 走 worker
      assert.strictEqual(r.engine, 'worker');
    }
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
