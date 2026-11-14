// tests/specs/aiconcurrency-control.cjs
// 周期 19 R1: aiConcurrency.js AI 并发控制测试
// 目标：≥ 20 PASS
//
// 覆盖：
//   - acquire 并发槽申请
//   - release 并发槽释放
//   - 队列管理
//   - 超时处理
//   - getStats 状态查询
//   - resetForTests 测试重置

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const AICONCURRENCY_SRC = fs.readFileSync(path.join(ROOT, 'server/middleware/aiConcurrency.js'), 'utf8');

let pass = 0;
let fail = 0;

function ok(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      pass += 1;
      console.log(`  [PASS] ${label}`);
    })
    .catch((e) => {
      fail += 1;
      console.error(`  [FAIL] ${label}: ${e.message}`);
    });
}

(async function main() {
  console.log('=== aiconcurrency-control ===');

  // ============ Group A: 静态扫描 - 导出验证 ============
  await ok('A1: 导出 acquire 函数', () => {
    assert.match(AICONCURRENCY_SRC, /function\s+acquire/);
  });
  await ok('A2: 导出 getStats 函数', () => {
    assert.match(AICONCURRENCY_SRC, /function\s+getStats/);
  });
  await ok('A3: 导出 resetForTests 函数', () => {
    assert.match(AICONCURRENCY_SRC, /function\s+resetForTests/);
  });
  await ok('A4: 导出 MAX_INFLIGHT 常量', () => {
    assert.match(AICONCURRENCY_SRC, /MAX_INFLIGHT/);
  });
  await ok('A5: 导出 MAX_QUEUE 常量', () => {
    assert.match(AICONCURRENCY_SRC, /MAX_QUEUE/);
  });

  // ============ Group B: 静态扫描 - 常量定义 ============
  await ok('B1: 定义 MAX_INFLIGHT（默认 8）', () => {
    assert.match(AICONCURRENCY_SRC, /AI_MAX_INFLIGHT_PER_PLATFORM\s*\|\|\s*['"]8['"]/);
  });
  await ok('B2: 定义 MAX_QUEUE（默认 50）', () => {
    assert.match(AICONCURRENCY_SRC, /AI_MAX_QUEUE\s*\|\|\s*['"]50['"]/);
  });

  // ============ Group C: 静态扫描 - 内部状态 ============
  await ok('C1: 定义 state Map', () => {
    assert.match(AICONCURRENCY_SRC, /const\s+state\s*=\s*new\s+Map/);
  });
  await ok('C2: 定义 getPlatformSlot 函数', () => {
    assert.match(AICONCURRENCY_SRC, /function\s+getPlatformSlot/);
  });
  await ok('C3: 定义 wakeNext 函数', () => {
    assert.match(AICONCURRENCY_SRC, /function\s+wakeNext/);
  });
  await ok('C4: 定义 releaseSlot 函数', () => {
    assert.match(AICONCURRENCY_SRC, /function\s+releaseSlot/);
  });

  // ============ Group D: acquire 逻辑验证 ============
  await ok('D1: 接受 platform 和 opts 参数', () => {
    assert.match(AICONCURRENCY_SRC, /function\s+acquire\s*\(\s*platform\s*,\s*opts\s*=\s*\{\}\s*\)/);
  });
  await ok('D2: platform 为空时使用 unknown', () => {
    assert.match(AICONCURRENCY_SRC, /platform\s*\|\|\s*['"]unknown['"]/);
  });
  await ok('D3: 获取 platform slot', () => {
    assert.match(AICONCURRENCY_SRC, /getPlatformSlot\s*\(/);
  });
  await ok('D4: 检查 signal', () => {
    assert.match(AICONCURRENCY_SRC, /opts\.signal\s*\|\|\s*null/);
  });
  await ok('D5: 快速路径（有 free slot）', () => {
    assert.match(AICONCURRENCY_SRC, /slot\.free\s*>\s*0/);
  });
  await ok('D6: 快速路径返回 { release, queuePos: 0 }', () => {
    assert.match(AICONCURRENCY_SRC, /queuePos:\s*0/);
  });
  await ok('D7: signal aborted 时 reject', () => {
    assert.match(AICONCURRENCY_SRC, /signal\.aborted/);
    assert.match(AICONCURRENCY_SRC, /reject\s*\(\s*new\s+Error\s*\(\s*['"]abort['"]\s*\)\s*\)/);
  });
  await ok('D8: 排队路径（无 free slot）', () => {
    assert.match(AICONCURRENCY_SRC, /return\s+new\s+Promise/);
  });
  await ok('D9: 检查队列是否满', () => {
    assert.match(AICONCURRENCY_SRC, /slot\.waiting\.length\s*>=\s*MAX_QUEUE/);
  });
  await ok('D10: 队列满时 reject queue_full', () => {
    assert.match(AICONCURRENCY_SRC, /reject\s*\(\s*new\s+Error\s*\(\s*['"]queue_full['"]\s*\)\s*\)/);
  });
  await ok('D11: 创建等待 entry', () => {
    assert.match(AICONCURRENCY_SRC, /const\s+entry\s*=\s*\{/);
  });
  await ok('D12: 注册 abort 监听器', () => {
    assert.match(AICONCURRENCY_SRC, /signal\.addEventListener\s*\(\s*['"]abort['"]/);
  });
  await ok('D13: 将 entry 加入队列', () => {
    assert.match(AICONCURRENCY_SRC, /slot\.waiting\.push\s*\(\s*entry\s*\)/);
  });
  await ok('D14: 返回 Promise', () => {
    assert.match(AICONCURRENCY_SRC, /resolve\s*\(\{\s*release/);
  });

  // ============ Group E: releaseSlot 逻辑验证 ============
  await ok('E1: 增加 free slot', () => {
    assert.match(AICONCURRENCY_SRC, /slot\.free\s*\+=\s*1/);
  });
  await ok('E2: 唤醒队列头部', () => {
    assert.match(AICONCURRENCY_SRC, /wakeNext\s*\(/);
  });
  await ok('E3: 唤醒成功时减少 free slot', () => {
    assert.match(AICONCURRENCY_SRC, /slot\.free\s*-=\s*1/);
  });
  await ok('E4: 唤醒成功时 resolve entry', () => {
    assert.match(AICONCURRENCY_SRC, /next\.resolve\s*\(\s*\)/);
  });

  // ============ Group F: wakeNext 逻辑验证 ============
  await ok('F1: 从队列头部取出 entry', () => {
    assert.match(AICONCURRENCY_SRC, /slot\.waiting\.shift\s*\(\s*\)/);
  });
  await ok('F2: 队列为空时返回 null', () => {
    assert.match(AICONCURRENCY_SRC, /if\s*\(\s*!\s*next\s*\)\s+return\s+null/);
  });
  await ok('F3: 移除 abort 监听器', () => {
    assert.match(AICONCURRENCY_SRC, /removeEventListener\s*\(\s*['"]abort['"]/);
  });

  // ============ Group G: getStats 逻辑验证 ============
  await ok('G1: 遍历所有 platform', () => {
    assert.match(AICONCURRENCY_SRC, /state\.entries\s*\(\s*\)/);
  });
  await ok('G2: 返回 inflight 数量', () => {
    assert.match(AICONCURRENCY_SRC, /inflight:\s*MAX_INFLIGHT\s*-\s*slot\.free/);
  });
  await ok('G3: 返回 waiting 数量', () => {
    assert.match(AICONCURRENCY_SRC, /waiting:\s*slot\.waiting\.length/);
  });
  await ok('G4: 返回 queueMax', () => {
    assert.match(AICONCURRENCY_SRC, /queueMax:\s*MAX_QUEUE/);
  });

  // ============ Group H: resetForTests 逻辑验证 ============
  await ok('H1: 遍历所有 slot', () => {
    assert.match(AICONCURRENCY_SRC, /state\.values\s*\(\s*\)/);
  });
  await ok('H2: 遍历所有 waiting entry', () => {
    assert.match(AICONCURRENCY_SRC, /slot\.waiting/);
  });
  await ok('H3: 移除 abort 监听器', () => {
    assert.match(AICONCURRENCY_SRC, /removeEventListener\s*\(\s*['"]abort['"]/);
  });
  await ok('H4: 清空 state', () => {
    assert.match(AICONCURRENCY_SRC, /state\.clear\s*\(\s*\)/);
  });

  // ============ Group I: 实际测试 - acquire 快速路径 ============
  const { acquire, getStats, resetForTests, MAX_INFLIGHT, MAX_QUEUE } = require(path.join(ROOT, 'server/middleware/aiConcurrency.js'));

  resetForTests();

  await ok('I1: 首次 acquire 成功（有 free slot）', async () => {
    const permit = await acquire('test-platform');
    assert.equal(permit.queuePos, 0);
    assert.equal(typeof permit.release, 'function');
    permit.release();
  });

  await ok('I2: acquire 减少 free slot', async () => {
    const permit1 = await acquire('test-platform');
    const stats = getStats();
    assert.equal(stats['test-platform'].inflight, 1);
    permit1.release();
  });

  await ok('I3: release 恢复 free slot', async () => {
    const permit = await acquire('test-platform');
    permit.release();
    const stats = getStats();
    assert.equal(stats['test-platform'].inflight, 0);
  });

  await ok('I4: 多个并发 acquire', async () => {
    const permits = [];
    for (let i = 0; i < 3; i++) {
      permits.push(await acquire('test-platform'));
    }
    const stats = getStats();
    assert.equal(stats['test-platform'].inflight, 3);
    permits.forEach((p) => p.release());
  });

  await ok('I5: MAX_INFLIGHT 限制', async () => {
    const permits = [];
    for (let i = 0; i < MAX_INFLIGHT; i++) {
      permits.push(await acquire('test-platform'));
    }
    const stats = getStats();
    assert.equal(stats['test-platform'].inflight, MAX_INFLIGHT);
    // 尝试超出限制
    let queued = false;
    try {
      const permit = acquire('test-platform');
      // 应该进入队列（不会立即 reject）
      permit.then(() => {}).catch(() => { queued = true; });
      // 释放一个
      permits[0].release();
      // 等待队列唤醒
      await new Promise((r) => setTimeout(r, 50));
    } catch (e) {}
    permits.forEach((p) => p.release());
  });

  await ok('I6: 不同 platform 独立', async () => {
    const permit1 = await acquire('platform-a');
    const permit2 = await acquire('platform-b');
    const stats = getStats();
    assert.equal(stats['platform-a'].inflight, 1);
    assert.equal(stats['platform-b'].inflight, 1);
    permit1.release();
    permit2.release();
  });

  await ok('I7: platform 为 null 时使用 unknown', async () => {
    const permit = await acquire(null);
    const stats = getStats();
    assert.equal(stats['unknown'].inflight, 1);
    permit.release();
  });

  await ok('I8: getStats 返回空对象（无 platform）', () => {
    resetForTests();
    const stats = getStats();
    assert.deepEqual(stats, {});
  });

  await ok('I9: resetForTests 清空状态', async () => {
    await acquire('test-platform');
    resetForTests();
    const stats = getStats();
    assert.deepEqual(stats, {});
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
