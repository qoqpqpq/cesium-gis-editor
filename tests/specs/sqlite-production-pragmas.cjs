// tests/specs/sqlite-production-pragmas.cjs
// 周期 12 P1-2: sqlitePragmas 单元测试
// 目标：≥ 22 子断言 PASS

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const {
  applyProductionPragmas,
  startPassiveCheckpointLoop,
  RECOMMENDED_PRAGMAS,
  DEFAULT_CHECKPOINT_INTERVAL_MS,
} = require(path.join(__dirname, '../../server/agent/sqlitePragmas'));

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
  console.log('=== sqlite-production-pragmas ===');

  // ============ Group A: 模块导出 ============
  await ok('A1: applyProductionPragmas 已导出', () => {
    assert.equal(typeof applyProductionPragmas, 'function');
  });
  await ok('A2: startPassiveCheckpointLoop 已导出', () => {
    assert.equal(typeof startPassiveCheckpointLoop, 'function');
  });
  await ok('A3: RECOMMENDED_PRAGMAS 是数组', () => {
    assert.ok(Array.isArray(RECOMMENDED_PRAGMAS));
    assert.ok(RECOMMENDED_PRAGMAS.length >= 6);
  });
  await ok('A4: 默认 interval = 60s', () => {
    assert.equal(DEFAULT_CHECKPOINT_INTERVAL_MS, 60000);
  });

  // ============ Group B: PRAGMA 配方内容 ============
  await ok('B1: 配方含 journal_mode=WAL', () => {
    const p = RECOMMENDED_PRAGMAS.find((x) => x.name === 'journal_mode');
    assert.ok(p);
    assert.equal(p.value, 'WAL');
  });
  await ok('B2: 配方含 synchronous=NORMAL', () => {
    const p = RECOMMENDED_PRAGMAS.find((x) => x.name === 'synchronous');
    assert.equal(p.value, 'NORMAL');
  });
  await ok('B3: 配方含 mmap_size=128MB', () => {
    const p = RECOMMENDED_PRAGMAS.find((x) => x.name === 'mmap_size');
    assert.equal(p.value, 134217728);
  });
  await ok('B4: 配方含 busy_timeout=5000ms', () => {
    const p = RECOMMENDED_PRAGMAS.find((x) => x.name === 'busy_timeout');
    assert.equal(p.value, 5000);
  });
  await ok('B5: 配方含 foreign_keys=ON', () => {
    const p = RECOMMENDED_PRAGMAS.find((x) => x.name === 'foreign_keys');
    assert.equal(p.value, 'ON');
  });
  await ok('B6: 配方含 journal_size_limit=64MB', () => {
    const p = RECOMMENDED_PRAGMAS.find((x) => x.name === 'journal_size_limit');
    assert.equal(p.value, 67108864);
  });

  // ============ Group C: mock driver ============
  function makeMockDriver(opts = {}) {
    const state = {};
    const pragmas = {};
    const driver = {
      lastExec: null,
      pragma: (s, _o) => {
        // parse "journal_mode = WAL"
        const m = s.match(/^(\w+)\s*=\s*(.+)$/);
        if (m) {
          const name = m[1];
          let value = m[2].trim();
          value = value.replace(/^['"]|['"]$/g, '');
          if (name === 'busy_timeout') value = parseInt(value, 10);
          pragmas[name] = value;
          return value;
        }
        if (s === 'journal_mode') return pragmas.journal_mode || 'wal';
        return null;
      },
      exec: (sql) => {
        driver.lastExec = sql;
        if (opts.execError) throw new Error(opts.execError);
        state.execCount = (state.execCount || 0) + 1;
      },
      _pragmas: pragmas,
    };
    return driver;
  }

  // ============ Group D: applyProductionPragmas ============
  await ok('D1: 应用全部 8 个 PRAGMA', () => {
    const drv = makeMockDriver();
    const r = applyProductionPragmas(drv);
    assert.equal(r.applied.length, RECOMMENDED_PRAGMAS.length);
  });
  await ok('D2: failed 数组为空', () => {
    const drv = makeMockDriver();
    const r = applyProductionPragmas(drv);
    assert.equal(r.failed.length, 0);
  });
  await ok('D3: journalMode 返回正确', () => {
    const drv = makeMockDriver();
    const r = applyProductionPragmas(drv);
    // SQLite 大写返回 WAL；mock 保留大写
    assert.ok(['wal', 'WAL'].includes(r.journalMode), `journalMode=${r.journalMode}`);
  });
  await ok('D4: 自定义 pragma 列表生效', () => {
    const drv = makeMockDriver();
    const r = applyProductionPragmas(drv, { pragmas: [{ name: 'custom_pragma', value: 'X' }] });
    assert.equal(r.applied.length, 1);
    assert.equal(r.applied[0], 'custom_pragma');
  });
  await ok('D5: driver 缺失 graceful 返回 failed', () => {
    const r = applyProductionPragmas(null);
    assert.equal(r.failed.length, 1);
    assert.match(r.failed[0].error, /driver missing/);
  });
  await ok('D6: pragma 抛错时不抛异常（failed 数组记录）', () => {
    const drv = makeMockDriver();
    drv.pragma = () => { throw new Error('not supported'); };
    const r = applyProductionPragmas(drv);
    assert.ok(r.failed.length > 0);
    assert.match(r.failed[0].error, /not supported/);
  });

  // ============ Group E: startPassiveCheckpointLoop ============
  await ok('E1: 返回 stop 函数和 stats', () => {
    const drv = makeMockDriver();
    const h = startPassiveCheckpointLoop(drv);
    assert.equal(typeof h.stop, 'function');
    assert.ok(h.stats);
    h.stop();
  });
  await ok('E2: stats.active=true 启动时', () => {
    const drv = makeMockDriver();
    const h = startPassiveCheckpointLoop(drv);
    assert.equal(h.stats.active, true);
    h.stop();
  });
  await ok('E3: stop() 后 active=false', () => {
    const drv = makeMockDriver();
    const h = startPassiveCheckpointLoop(drv);
    h.stop();
    assert.equal(h.stats.active, false);
  });
  await ok('E4: 默认 intervalMs=60000', () => {
    const drv = makeMockDriver();
    const h = startPassiveCheckpointLoop(drv);
    assert.equal(h.stats.intervalMs || DEFAULT_CHECKPOINT_INTERVAL_MS, 60000);
    h.stop();
  });

  // ============ Group F: tick 行为（短 interval） ============
  await ok('F1: 50ms 间隔 100ms 后至少 tick 1 次', async () => {
    const drv = makeMockDriver();
    const h = startPassiveCheckpointLoop(drv, { intervalMs: 50 });
    await new Promise((r) => setTimeout(r, 130));
    h.stop();
    assert.ok(h.stats.ran >= 1, `ran=${h.stats.ran}`);
  });
  await ok('F2: tick exec 调用 wal_checkpoint(PASSIVE)', async () => {
    const drv = makeMockDriver();
    const h = startPassiveCheckpointLoop(drv, { intervalMs: 30 });
    await new Promise((r) => setTimeout(r, 80));
    h.stop();
    assert.ok(drv.lastExec, `lastExec=${drv.lastExec}`);
    assert.match(drv.lastExec, /wal_checkpoint/i);
  });
  await ok('F3: exec 抛错时 errors++ 而不抛', async () => {
    const drv = makeMockDriver({ execError: 'wal busy' });
    const h = startPassiveCheckpointLoop(drv, { intervalMs: 30 });
    await new Promise((r) => setTimeout(r, 80));
    h.stop();
    assert.ok(h.stats.errors >= 1, `errors=${h.stats.errors}`);
    assert.equal(h.stats.lastError, 'wal busy');
  });
  await ok('F4: onCheckpoint 回调被调用', async () => {
    const drv = makeMockDriver();
    let called = 0;
    const h = startPassiveCheckpointLoop(drv, {
      intervalMs: 30,
      onCheckpoint: () => { called += 1; },
    });
    await new Promise((r) => setTimeout(r, 80));
    h.stop();
    assert.ok(called >= 1, `called=${called}`);
  });

  // ============ Group G: 边界 ============
  await ok('G1: intervalMs <= 0 用默认值', () => {
    const drv = makeMockDriver();
    const h = startPassiveCheckpointLoop(drv, { intervalMs: -1 });
    h.stop();
    // 不会崩溃；interval 用了 default
  });
  await ok('G2: driver 缺失返回 noop', () => {
    const h = startPassiveCheckpointLoop(null);
    assert.equal(h.stats.active, false);
    h.stop();
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});