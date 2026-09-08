// tests/specs/sandbox-engine-select.cjs
// 周期 7 P1-2: isolated-vm 评估 + engine 选择
//
// 背景：周期 3-6 实施 vm + worker_threads 沙箱；周期 7 评估更高安全沙箱 isolated-vm。
//   isolated-vm 需要 node-gyp 编译，Windows 经常失败；本 spec 验证"引擎选择"逻辑：
//   - 默认 vm
//   - auto → 有 isolated-vm 用 iv，否则 vm
//   - iv → 必须有 isolated-vm，否则返回 ok:false
//
// 验收：
//   1. 静态扫描：sandbox.js 暴露 executeIsolatedVm + resolveEngine
//   2. 行为：resolveEngine('vm') 返回 vm/available
//   3. 行为：resolveEngine('auto') 在 isolated-vm 缺失时回退 vm
//   4. 行为：resolveEngine('iv') 在 isolated-vm 缺失时返回 available:false
//   5. 行为：executeIsolatedVm 在 isolated-vm 缺失时返回 ok:false IV_NOT_AVAILABLE
//   6. 行为：executeInSandboxWorker opts.engine='iv' 在缺包时回退或报错（不崩溃）
//   7. 行为：默认 executeInSandboxWorker 不变（用 vm；老 spec 仍 PASS）

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
  executeInSandbox, executeInSandboxWorker, executeIsolatedVm, resolveEngine,
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
  console.log('=== sandbox-engine-select ===');

  // ---- 1. 静态扫描 ----
  await test('sandbox.js 暴露 executeIsolatedVm 函数', () => {
    assert.match(SANDBOX_SRC, /async function executeIsolatedVm/);
    // 模块导出应含 executeIsolatedVm（位置不强制）
    assert.match(SANDBOX_SRC, /executeIsolatedVm,/);
  });
  await test('sandbox.js 暴露 resolveEngine 函数', () => {
    assert.match(SANDBOX_SRC, /function resolveEngine/);
  });
  await test('sandbox.js 含 IV_NOT_AVAILABLE 错误码', () => {
    assert.match(SANDBOX_SRC, /IV_NOT_AVAILABLE/);
  });
  await test('sandbox.js 支持 SANDBOX_ENGINE 环境变量', () => {
    assert.match(SANDBOX_SRC, /SANDBOX_ENGINE/);
  });
  await test('sandbox.js 在 executeInSandboxWorker 处理 opts.engine', () => {
    assert.match(SANDBOX_SRC, /opts\.engine/);
  });

  // ---- 2. resolveEngine 行为 ----
  await test('resolveEngine("vm") 返回 vm + available:true', () => {
    const r = resolveEngine('vm');
    assert.strictEqual(r.engine, 'vm');
    assert.strictEqual(r.available, true);
  });
  await test('resolveEngine() 缺省 → vm', () => {
    delete process.env.SANDBOX_ENGINE;
    const r = resolveEngine();
    assert.strictEqual(r.engine, 'vm');
    assert.strictEqual(r.available, true);
  });
  await test('resolveEngine("auto") 检测 isolated-vm 加载', () => {
    const r = resolveEngine('auto');
    assert.ok(['vm', 'iv'].includes(r.engine), 'engine 应为 vm 或 iv');
    assert.strictEqual(r.available, true);
    if (r.engine === 'vm') {
      assert.ok(r.fallback && r.fallback.includes('isolated-vm'), '回退时应有 fallback reason');
    }
  });
  await test('resolveEngine("iv") 在缺包时 available:false + reason', () => {
    const r = resolveEngine('iv');
    if (r.available) {
      console.log('  [INFO] isolated-vm 已安装；available=true');
    } else {
      assert.strictEqual(r.engine, 'iv');
      assert.strictEqual(r.available, false);
      assert.ok(r.reason && r.reason.includes('isolated-vm'), '应有 reason');
    }
  });
  await test('resolveEngine("unknown") 回退 vm', () => {
    const r = resolveEngine('unknown-engine');
    assert.strictEqual(r.engine, 'vm');
    assert.ok(r.fallback && r.fallback.includes('未知'));
  });

  // ---- 3. executeIsolatedVm ----
  await test('executeIsolatedVm 在缺 isolated-vm 时返回 ok:false', async () => {
    const r = await executeIsolatedVm('return 1 + 1;', {});
    if (r.ok) {
      console.log('  [INFO] isolated-vm 可用且代码成功（r.value=' + r.value + '）');
    } else {
      assert.strictEqual(r.ok, false);
      assert.ok(r.error.code === 'IV_NOT_AVAILABLE' || r.error.code === 'IV_INIT_ERROR', '错误码应为 IV_NOT_AVAILABLE 或 IV_INIT_ERROR');
      assert.strictEqual(r.engine, 'iv');
    }
  });

  await test('executeIsolatedVm 返回值含 engine 字段', async () => {
    const r = await executeIsolatedVm('return 1;', {});
    assert.strictEqual(r.engine, 'iv');
    assert.ok(typeof r.durationMs === 'number');
  });

  // ---- 4. executeInSandboxWorker 默认不变 ----
  await test('executeInSandboxWorker 默认仍用 vm 引擎（短代码 ok）', async () => {
    const r = await executeInSandboxWorker('return 1 + 1;', {}, { timeoutMs: 1000, heapMb: 64 });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, 2);
  });

  // ---- 5. executeInSandboxWorker opts.engine='iv' 在缺包时不崩溃 ----
  await test('executeInSandboxWorker opts.engine=iv 缺包不崩溃（OK 或 IV_NOT_AVAILABLE）', async () => {
    let r;
    try {
      r = await executeInSandboxWorker('return 1 + 1;', {}, {
        timeoutMs: 1000, heapMb: 64, engine: 'iv',
      });
    } catch (e) {
      // 即便抛错也不应 uncaught（spec helper 验证不崩溃）
      console.log('  [INFO] executeInSandboxWorker engine=iv 抛出: ' + e.message);
      return;
    }
    // 若 ok=true（isolated-vm 已装），值应为 2；若 ok=false（缺包），错误码应为 IV_NOT_AVAILABLE
    if (r.ok) {
      assert.strictEqual(r.value, 2);
    } else {
      assert.ok(['IV_NOT_AVAILABLE', 'IV_INIT_ERROR', 'IV_RUN_ERROR'].includes(r.error.code),
        '错误码应为 IV_* 系列');
    }
  });

  // ---- 6. executeInSandbox 同步 vm 版不变 ----
  await test('executeInSandbox 同步 vm 版仍工作', async () => {
    const r = await executeInSandbox('return 1 + 1;', {});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.value, 2);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
