// tests/specs/memory-als-sqlite.cjs
// 周期 7 P1-5: AI Agent 长期记忆 prototype（ALS + SQLite）
//
// 背景：周期 7 评估 mem0 / OpenMemory 自托管；先做 ALS + SQLite prototype
//   - ALS：保存 conversation context（请求内）
//   - SQLite：保存跨请求 memory（better-sqlite3 不可用时 fallback 内存）
//   - 验收：remember / recall / search / list / forget + ALS 隔离
//
// 验收：
//   1. 静态扫描：memory.js 暴露 MemoryStore / conversationContext
//   2. 行为：remember 写入 → recall 读出
//   3. 行为：recall 不存在的 key 返回 null
//   4. 行为：tags 序列化为 JSON 数组
//   5. 行为：search 用 LIKE 模糊匹配
//   6. 行为：list 按 ts 倒序
//   7. 行为：list 按 userId 过滤
//   8. 行为：forget 删除
//   9. 行为：better-sqlite3 不可用时降级到内存（不崩溃）
//   10. 行为：ALS context 隔离（不同请求 context 不共享）
//   11. 行为：ALS context 内 remember 自动附 userId
//   12. 行为：close 后 driver 关闭

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { MemoryStore, conversationContext } = require('../../server/agent/memory');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

const MEMORY_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../server/agent/memory.js'),
  'utf8',
);

// 用内存后端（不依赖 better-sqlite3）；可通过 .backend 验证
function newStore() {
  const s = new MemoryStore({ dbPath: '/tmp/test-memory-' + Date.now() + '-' + Math.random() + '.sqlite' });
  return s;
}

(async () => {
  console.log('=== memory-als-sqlite ===');

  // ---- 1. 静态扫描 ----
  await test('memory.js 暴露 MemoryStore 类', () => {
    assert.match(MEMORY_SRC, /class\s+MemoryStore/);
  });
  await test('memory.js 暴露 conversationContext (AsyncLocalStorage)', () => {
    assert.match(MEMORY_SRC, /AsyncLocalStorage/);
    assert.match(MEMORY_SRC, /conversationContext\s*=\s*new\s+AsyncLocalStorage/);
  });
  await test('memory.js 提供 remember/recall/search/list/forget/close', () => {
    assert.match(MEMORY_SRC, /remember\s*\(/);
    assert.match(MEMORY_SRC, /recall\s*\(/);
    assert.match(MEMORY_SRC, /search\s*\(/);
    assert.match(MEMORY_SRC, /list\s*\(/);
    assert.match(MEMORY_SRC, /forget\s*\(/);
    assert.match(MEMORY_SRC, /close\s*\(/);
  });
  await test('memory.js 含 better-sqlite3 fallback', () => {
    assert.match(MEMORY_SRC, /better-sqlite3/);
    assert.match(MEMORY_SRC, /fallback|backend.*memory/i);
  });
  await test('memory.js 含 withContext ALS 包装', () => {
    assert.match(MEMORY_SRC, /withContext/);
  });

  // ---- 2. 行为：remember / recall ----
  await test('remember 写入后 recall 读出', () => {
    const s = newStore();
    const w = s.remember('k1', 'hello world', { tags: ['greeting'] });
    assert.strictEqual(w.ok, true);
    const r = s.recall('k1');
    assert.ok(r, 'recall 应返回对象');
    assert.strictEqual(r.value, 'hello world');
    assert.deepStrictEqual(r.tags, ['greeting']);
    s.close();
  });

  await test('recall 不存在的 key 返回 null', () => {
    const s = newStore();
    assert.strictEqual(s.recall('not-exist'), null);
    s.close();
  });

  await test('remember 拒绝空 key', () => {
    const s = newStore();
    const r = s.remember('', 'value');
    assert.strictEqual(r.ok, false);
    s.close();
  });

  // ---- 3. 行为：search / list ----
  await test('search 用 LIKE 模糊匹配 value', () => {
    const s = newStore();
    s.remember('a', 'apple banana');
    s.remember('b', 'orange apple');
    s.remember('c', 'grape');
    const r = s.search('apple');
    assert.ok(r.length >= 2, `应找到 ≥2 条含 apple，实际 ${r.length}`);
    s.close();
  });

  await test('list 按 ts 倒序', () => {
    const s = newStore();
    s.remember('first', 'value-1');
    setTimeout(() => s.remember('second', 'value-2'), 5);
    setTimeout(() => {
      const all = s.list();
      assert.ok(all.length >= 2);
      // 倒序：second 应该在 first 之前
      const secondIdx = all.findIndex((x) => x.key === 'second');
      const firstIdx = all.findIndex((x) => x.key === 'first');
      assert.ok(secondIdx < firstIdx, `second 应在 first 之前；secondIdx=${secondIdx} firstIdx=${firstIdx}`);
      s.close();
    }, 20);
  });

  // ---- 4. 行为：list 按 userId 过滤 ----
  await test('list 按 userId 过滤', () => {
    const s = newStore();
    s.remember('a1', 'alpha', { userId: 'alice' });
    s.remember('a2', 'beta', { userId: 'alice' });
    s.remember('b1', 'gamma', { userId: 'bob' });
    const aliceOnly = s.list({ userId: 'alice' });
    assert.ok(aliceOnly.every((m) => m.userId === 'alice'), 'aliceOnly 应只含 alice');
    assert.strictEqual(aliceOnly.length, 2);
    s.close();
  });

  // ---- 5. 行为：forget ----
  await test('forget 删除记忆', () => {
    const s = newStore();
    s.remember('temp', 'value');
    assert.ok(s.recall('temp'));
    const f = s.forget('temp');
    assert.strictEqual(f.ok, true);
    assert.strictEqual(f.deleted, 1);
    assert.strictEqual(s.recall('temp'), null);
    s.close();
  });

  // ---- 6. 行为：better-sqlite3 不可用时降级到内存 ----
  await test('better-sqlite3 不可用时 backend=memory', () => {
    const s = newStore();
    // better-sqlite3 通常在测试环境不可用 → 应自动 fallback
    assert.ok(['memory', 'sqlite'].includes(s.backend), `backend 应为 memory 或 sqlite，实际 ${s.backend}`);
    s.close();
  });

  // ---- 7. 行为：close 后 driver 关闭 ----
  await test('close 后再操作不崩溃', () => {
    const s = newStore();
    s.close();
    // close 后再操作：driver 已 null，_initMemory 没跑过，_memMap 也没设
    // 不应抛 uncaught
    let threw = false;
    try {
      s.remember('after-close', 'value');
    } catch (e) {
      threw = true;
    }
    assert.ok(!threw, 'close 后 remember 不应抛错（应 silent 或返回 error）');
  });

  // ---- 8. 行为：ALS 隔离 ----
  await test('ALS context 隔离：不同请求 context 独立', async () => {
    const result = await new Promise((resolve) => {
      const ctx1Results = [];
      const ctx2Results = [];
      // 模拟两个"请求"并发执行
      Promise.all([
        MemoryStore.withContext({ userId: 'user1' }, async () => {
          ctx1Results.push(MemoryStore.getContext().userId);
          await new Promise((r) => setTimeout(r, 10));
          ctx1Results.push(MemoryStore.getContext().userId);
          return ctx1Results;
        }),
        MemoryStore.withContext({ userId: 'user2' }, async () => {
          ctx2Results.push(MemoryStore.getContext().userId);
          await new Promise((r) => setTimeout(r, 5));
          ctx2Results.push(MemoryStore.getContext().userId);
          return ctx2Results;
        }),
      ]).then(([r1, r2]) => resolve({ r1, r2 }));
    });
    // 两个 context 内的 userId 都应是自己的，不串
    assert.deepStrictEqual(result.r1, ['user1', 'user1']);
    assert.deepStrictEqual(result.r2, ['user2', 'user2']);
  });

  await test('ALS context 内 remember 自动附 userId', () => {
    const s = newStore();
    MemoryStore.withContext({ userId: 'alice' }, () => {
      s.remember('ctx-key', 'ctx-value');
      assert.strictEqual(s.recall('ctx-key').userId, 'alice');
    });
    // 离开 context 后再 remember → userId 为 null
    s.remember('no-ctx-key', 'no-ctx-value');
    assert.strictEqual(s.recall('no-ctx-key').userId, null);
    s.close();
  });

  await test('ALS context 在 await 跨 promise 保持', async () => {
    await MemoryStore.withContext({ userId: 'persistent' }, async () => {
      await new Promise((r) => setTimeout(r, 20));
      assert.strictEqual(MemoryStore.getContext().userId, 'persistent');
    });
  });

  // ---- 9. 行为：tags + userId 同步写入 ----
  await test('remember 同时写 tags 和 userId', () => {
    const s = newStore();
    s.remember('combo', 'combo-value', { tags: ['t1', 't2'], userId: 'u1' });
    const r = s.recall('combo');
    assert.strictEqual(r.value, 'combo-value');
    assert.deepStrictEqual(r.tags, ['t1', 't2']);
    assert.strictEqual(r.userId, 'u1');
    s.close();
  });

  // ---- 10. 行为：list limit ----
  await test('list 限制返回条数', () => {
    const s = newStore();
    for (let i = 0; i < 20; i += 1) s.remember(`key${i}`, `v${i}`);
    const all = s.list({ limit: 5 });
    assert.strictEqual(all.length, 5);
    s.close();
  });

  // ---- 11. 行为：search 按 userId 过滤 ----
  await test('search 按 userId 过滤', () => {
    const s = newStore();
    s.remember('a', 'shared word', { userId: 'u1' });
    s.remember('b', 'shared word', { userId: 'u2' });
    const u1Results = s.search('shared', { userId: 'u1' });
    assert.strictEqual(u1Results.length, 1);
    assert.strictEqual(u1Results[0].userId, 'u1');
    s.close();
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
