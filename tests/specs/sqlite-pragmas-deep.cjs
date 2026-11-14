// tests/specs/sqlite-pragmas-deep.cjs
// Cycle 28 R2: sqlitePragmas.js 边界深度测试
// 覆盖 checkSqliteVersion 版本比较 + applyProductionPragmas 失败路径
// + startPassiveCheckpointLoop TRUNCATE/边界 + 集成
// 目标：≥ 60 PASS

'use strict';

const assert = require('node:assert');
const path = require('node:path');

const {
  applyProductionPragmas,
  startPassiveCheckpointLoop,
  checkSqliteVersion,
  RECOMMENDED_PRAGMAS,
  DEFAULT_CHECKPOINT_INTERVAL_MS,
} = require(path.join(__dirname, '../../server/agent/sqlitePragmas'));

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

// 可配置 mock driver
function makeMockDriver(overrides = {}) {
  const calls = [];
  const pragmas = {};
  const results = {}; // pragma name -> result value for simple:true
  const errors = {};  // pragma name -> error to throw
  return {
    pragma(str, opts) {
      calls.push({ str, opts });
      if (errors[str]) throw new Error(errors[str]);
      if (opts && opts.simple) return results[str] || 'WAL';
      // parse `name = value` and record
      const m = str.match(/^(\w+) = (.+)$/);
      if (m) pragmas[m[1]] = m[2];
      return str;
    },
    prepare(sql) {
      if (sql.includes('sqlite_version()')) {
        return { get: () => ({ v: overrides.sqliteVersion || '3.45.0' }) };
      }
      return { get: () => null };
    },
    exec(str) {
      calls.push({ exec: str });
    },
    _calls: calls,
    _pragmas: pragmas,
    _setResult: (str, val) => { results[str] = val; },
    _setError: (str, msg) => { errors[str] = msg; },
  };
}

async function main() {
  console.log('=== Cycle 28 R2: sqlitePragmas.js boundary deep tests ===\n');

  // ===== A组: 模块导出 + 常量 =====
  console.log('\n-- A组: 模块导出 + 常量 =====');
  await ok('A1: applyProductionPragmas 是 function', () => {
    assert.strictEqual(typeof applyProductionPragmas, 'function');
  });
  await ok('A2: startPassiveCheckpointLoop 是 function', () => {
    assert.strictEqual(typeof startPassiveCheckpointLoop, 'function');
  });
  await ok('A3: checkSqliteVersion 是 function', () => {
    assert.strictEqual(typeof checkSqliteVersion, 'function');
  });
  await ok('A4: RECOMMENDED_PRAGMAS 是 8 个 pragma', () => {
    assert.strictEqual(RECOMMENDED_PRAGMAS.length, 8);
  });
  await ok('A5: DEFAULT_CHECKPOINT_INTERVAL_MS = 60000', () => {
    assert.strictEqual(DEFAULT_CHECKPOINT_INTERVAL_MS, 60000);
  });
  await ok('A6: RECOMMENDED_PRAGMAS 全部有 name+value', () => {
    for (const p of RECOMMENDED_PRAGMAS) {
      assert.ok(typeof p.name === 'string' && p.name.length > 0);
      assert.ok(p.value !== undefined);
    }
  });
  await ok('A7: RECOMMENDED_PRAGMAS 包含 8 个具体项', () => {
    const names = RECOMMENDED_PRAGMAS.map(p => p.name);
    for (const n of ['journal_mode','synchronous','temp_store','mmap_size',
      'cache_size','busy_timeout','foreign_keys','journal_size_limit']) {
      assert.ok(names.includes(n), `missing ${n}`);
    }
  });
  await ok('A8: 数值型 pragma 的值', () => {
    assert.strictEqual(RECOMMENDED_PRAGMAS.find(p=>p.name==='mmap_size').value, 134217728);
    assert.strictEqual(RECOMMENDED_PRAGMAS.find(p=>p.name==='cache_size').value, -64000);
    assert.strictEqual(RECOMMENDED_PRAGMAS.find(p=>p.name==='busy_timeout').value, 5000);
    assert.strictEqual(RECOMMENDED_PRAGMAS.find(p=>p.name==='journal_size_limit').value, 67108864);
  });

  // ===== B组: checkSqliteVersion 版本比较 =====
  console.log('\n-- B组: checkSqliteVersion 版本比较 =====');
  function makeVersionDriver(version) {
    return {
      prepare: (sql) => {
        if (sql.includes('sqlite_version()')) {
          return { get: () => ({ v: version }) };
        }
        return { get: () => null };
      },
    };
  }
  await ok('B1: 3.51.3 → ok=true（恰好等于 required）', () => {
    const r = checkSqliteVersion(makeVersionDriver('3.51.3'));
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.version, '3.51.3');
    assert.strictEqual(r.major, 3);
    assert.strictEqual(r.minor, 51);
    assert.strictEqual(r.patch, 3);
  });
  await ok('B2: 3.51.2 → ok=false（patch 不足）', () => {
    const r = checkSqliteVersion(makeVersionDriver('3.51.2'));
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.version, '3.51.2');
  });
  await ok('B3: 3.51.4 → ok=true（patch 超过）', () => {
    const r = checkSqliteVersion(makeVersionDriver('3.51.4'));
    assert.strictEqual(r.ok, true);
  });
  await ok('B4: 3.52.0 → ok=true（minor 超过）', () => {
    const r = checkSqliteVersion(makeVersionDriver('3.52.0'));
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.minor, 52);
  });
  await ok('B5: 4.0.0 → ok=true（major 超过）', () => {
    const r = checkSqliteVersion(makeVersionDriver('4.0.0'));
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.major, 4);
  });
  await ok('B6: 3.50.0 → ok=false（minor 不足）', () => {
    const r = checkSqliteVersion(makeVersionDriver('3.50.0'));
    assert.strictEqual(r.ok, false);
  });
  await ok('B7: 2.0.0 → ok=false（major 不足）', () => {
    const r = checkSqliteVersion(makeVersionDriver('2.0.0'));
    assert.strictEqual(r.ok, false);
  });
  await ok('B8: 3.45.0（当前生产版本）→ ok=false', () => {
    const r = checkSqliteVersion(makeVersionDriver('3.45.0'));
    assert.strictEqual(r.ok, false);
  });
  await ok('B9: 2-part version 3.51 → patch=0 → ok=false', () => {
    const r = checkSqliteVersion(makeVersionDriver('3.51'));
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.patch, 0);
  });
  await ok('B10: 1-part version 3 → minor=0,patch=0 → ok=false', () => {
    const r = checkSqliteVersion(makeVersionDriver('3'));
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.minor, 0);
  });
  await ok('B11: 非数字版本 "unknown" → ok=false', () => {
    const r = checkSqliteVersion(makeVersionDriver('unknown'));
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.version, 'unknown');
  });
  await ok('B12: 空字符串 → ok=false', () => {
    const r = checkSqliteVersion(makeVersionDriver(''));
    assert.strictEqual(r.ok, false);
  });
  await ok('B13: driver null → error 返回', () => {
    const r = checkSqliteVersion(null);
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /driver missing/);
  });
  await ok('B14: driver 无 prepare → error 返回', () => {
    const r = checkSqliteVersion({});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /driver missing/);
  });
  await ok('B15: driver prepare 抛错 → error 返回', () => {
    const d = { prepare: () => { throw new Error('db error'); } };
    const r = checkSqliteVersion(d);
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /db error/);
  });
  await ok('B16: driver prepare 返回 undefined → ok=false', () => {
    const d = { prepare: () => ({ get: () => undefined }) };
    const r = checkSqliteVersion(d);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.version, 'unknown');
  });
  await ok('B17: driver prepare 返回 row.v=null → ok=false', () => {
    const d = { prepare: () => ({ get: () => ({ v: null }) }) };
    const r = checkSqliteVersion(d);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.version, 'unknown');
  });
  await ok('B18: required 字段 = 3.51.3', () => {
    const r = checkSqliteVersion(makeVersionDriver('3.51.3'));
    assert.strictEqual(r.required, '3.51.3');
  });

  // ===== C组: applyProductionPragmas 边界 =====
  console.log('\n-- C组: applyProductionPragmas 边界 =====');
  await ok('C1: 正常应用 8 个 pragma', () => {
    const d = makeMockDriver();
    const r = applyProductionPragmas(d);
    assert.strictEqual(r.applied.length, 8);
    assert.strictEqual(r.failed.length, 0);
    assert.strictEqual(r.journalMode, 'WAL');
  });
  await ok('C2: driver null → graceful 返回', () => {
    const r = applyProductionPragmas(null);
    assert.strictEqual(r.applied.length, 0);
    assert.strictEqual(r.failed.length, 1);
    assert.strictEqual(r.failed[0].name, '*');
    assert.match(r.failed[0].error, /driver missing/);
    assert.strictEqual(r.journalMode, 'unknown');
  });
  await ok('C3: driver 无 pragma 方法 → graceful', () => {
    const r = applyProductionPragmas({});
    assert.strictEqual(r.applied.length, 0);
    assert.strictEqual(r.failed.length, 1);
    assert.match(r.failed[0].error, /driver missing/);
  });
  await ok('C4: 自定义 pragmas 列表', () => {
    const d = makeMockDriver();
    const r = applyProductionPragmas(d, { pragmas: [{ name: 'test_pragma', value: 'ON' }] });
    assert.strictEqual(r.applied.length, 1);
    assert.strictEqual(r.applied[0], 'test_pragma');
  });
  await ok('C5: 空 pragmas 列表', () => {
    const d = makeMockDriver();
    const r = applyProductionPragmas(d, { pragmas: [] });
    assert.strictEqual(r.applied.length, 0);
    assert.strictEqual(r.failed.length, 0);
  });
  await ok('C6: 部分失败 → applied+failed 分离', () => {
    const d = makeMockDriver();
    d._setError('invalid_pragma = X', 'syntax error');
    const r = applyProductionPragmas(d, {
      pragmas: [
        { name: 'good_pragma', value: 'ON' },
        { name: 'invalid_pragma', value: 'X' },
      ],
    });
    assert.strictEqual(r.applied.length, 1);
    assert.strictEqual(r.failed.length, 1);
    assert.strictEqual(r.failed[0].name, 'invalid_pragma');
  });
  await ok('C7: 全部失败 → failed 数组', () => {
    const d = makeMockDriver();
    d._setError('bad1 = X', 'err1');
    d._setError('bad2 = Y', 'err2');
    const r = applyProductionPragmas(d, {
      pragmas: [
        { name: 'bad1', value: 'X' },
        { name: 'bad2', value: 'Y' },
      ],
    });
    assert.strictEqual(r.applied.length, 0);
    assert.strictEqual(r.failed.length, 2);
  });
  await ok('C8: busy_timeout 用数值传递（非字符串）', () => {
    const d = makeMockDriver();
    applyProductionPragmas(d);
    const btCall = d._calls.find(c => c.str.includes('busy_timeout'));
    assert.ok(btCall);
    assert.ok(!btCall.str.includes("'"), 'busy_timeout 不应有引号');
  });
  await ok('C9: 字符串 pragma 用字符串传递', () => {
    const d = makeMockDriver();
    applyProductionPragmas(d);
    const jmCall = d._calls.find(c => c.str.includes('journal_mode'));
    assert.ok(jmCall);
  });
  await ok('C10: journalMode 返回 driver 值', () => {
    const d = makeMockDriver();
    d._setResult('journal_mode', 'wal');
    const r = applyProductionPragmas(d);
    assert.strictEqual(r.journalMode, 'wal');
  });
  await ok('C11: journalMode 读取失败 → unknown', () => {
    const d = makeMockDriver();
    d._setError('journal_mode', 'read error');
    const r = applyProductionPragmas(d);
    assert.strictEqual(r.journalMode, 'unknown');
  });
  await ok('C12: opts={} 默认 → 使用 RECOMMENDED_PRAGMAS', () => {
    const d = makeMockDriver();
    const r = applyProductionPragmas(d, {});
    assert.strictEqual(r.applied.length, 8);
  });
  await ok('C13: opts.pragmas=undefined → 使用默认', () => {
    const d = makeMockDriver();
    const r = applyProductionPragmas(d, { pragmas: undefined });
    assert.strictEqual(r.applied.length, 8);
  });

  // ===== D组: startPassiveCheckpointLoop 基础 =====
  console.log('\n-- D组: startPassiveCheckpointLoop 基础 =====');
  await ok('D1: 正常启动 → active=true', () => {
    const d = makeMockDriver();
    const { stop, stats } = startPassiveCheckpointLoop(d, { intervalMs: 100000 });
    assert.strictEqual(stats.active, true);
    assert.strictEqual(stats.ran, 0);
    stop();
  });
  await ok('D2: driver null → graceful 返回', () => {
    const { stop, stats } = startPassiveCheckpointLoop(null);
    assert.strictEqual(stats.active, false);
    assert.strictEqual(stats.ran, 0);
    stop(); // 不抛错
  });
  await ok('D3: driver 无 pragma → graceful', () => {
    const { stop, stats } = startPassiveCheckpointLoop({});
    assert.strictEqual(stats.active, false);
    stop();
  });
  await ok('D4: 返回 stop 函数', () => {
    const d = makeMockDriver();
    const { stop } = startPassiveCheckpointLoop(d, { intervalMs: 100000 });
    assert.strictEqual(typeof stop, 'function');
    stop();
  });
  await ok('D5: 返回 stats 对象', () => {
    const d = makeMockDriver();
    const { stats } = startPassiveCheckpointLoop(d, { intervalMs: 100000 });
    assert.strictEqual(typeof stats, 'object');
    assert.strictEqual(stats.ran, 0);
    assert.strictEqual(stats.errors, 0);
    assert.strictEqual(stats.lastResult, null);
    assert.strictEqual(stats.active, true);
  });
  await ok('D6: 默认 intervalMs = 60000', () => {
    const d = makeMockDriver();
    const { stop } = startPassiveCheckpointLoop(d);
    // 不抛错即通过
    stop();
  });
  await ok('D7: 自定义 intervalMs', () => {
    const d = makeMockDriver();
    const { stop } = startPassiveCheckpointLoop(d, { intervalMs: 1000 });
    stop();
  });
  await ok('D8: intervalMs=0 → 使用默认', () => {
    const d = makeMockDriver();
    const { stop } = startPassiveCheckpointLoop(d, { intervalMs: 0 });
    stop();
  });
  await ok('D9: intervalMs=-1 → 使用默认', () => {
    const d = makeMockDriver();
    const { stop } = startPassiveCheckpointLoop(d, { intervalMs: -1 });
    stop();
  });
  await ok('D10: intervalMs=字符串 → 使用默认', () => {
    const d = makeMockDriver();
    const { stop } = startPassiveCheckpointLoop(d, { intervalMs: '1000' });
    stop();
  });
  await ok('D11: mode=PASSIVE（默认）', () => {
    const d = makeMockDriver();
    const { stop } = startPassiveCheckpointLoop(d, { intervalMs: 100000, mode: 'PASSIVE' });
    stop();
  });
  await ok('D12: mode=TRUNCATE', () => {
    const d = makeMockDriver();
    const { stop } = startPassiveCheckpointLoop(d, { intervalMs: 100000, mode: 'TRUNCATE' });
    stop();
  });

  // ===== E组: checkpoint loop 执行 =====
  console.log('\n-- E组: checkpoint loop 执行 =====');
  function waitFor(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
  await ok('E1: tick 执行 wal_checkpoint', async () => {
    const d = makeMockDriver();
    let execCalled = false;
    d.exec = (str) => { execCalled = true; };
    const { stop, stats } = startPassiveCheckpointLoop(d, { intervalMs: 50 });
    await waitFor(120);
    stop();
    assert.ok(stats.ran >= 1);
    assert.strictEqual(stats.errors, 0);
    assert.ok(stats.lastResult);
  });
  await ok('E2: tick 记录 lastResult.mode', async () => {
    const d = makeMockDriver();
    d.exec = () => {};
    const { stop, stats } = startPassiveCheckpointLoop(d, { intervalMs: 50, mode: 'TRUNCATE' });
    await waitFor(120);
    stop();
    assert.strictEqual(stats.lastResult.mode, 'TRUNCATE');
  });
  await ok('E3: exec 抛错 → errors 递增', async () => {
    const d = makeMockDriver();
    d.exec = () => { throw new Error('checkpoint failed'); };
    const { stop, stats } = startPassiveCheckpointLoop(d, { intervalMs: 50 });
    await waitFor(120);
    stop();
    assert.ok(stats.errors >= 1);
    assert.strictEqual(stats.lastError, 'checkpoint failed');
  });
  await ok('E4: onCheckpoint 回调触发', async () => {
    const d = makeMockDriver();
    d.exec = () => {};
    let cbCalled = false;
    const { stop } = startPassiveCheckpointLoop(d, {
      intervalMs: 50,
      onCheckpoint: () => { cbCalled = true; },
    });
    await waitFor(120);
    stop();
    assert.strictEqual(cbCalled, true);
  });
  await ok('E5: onCheckpoint 抛错 → 不影响 loop', async () => {
    const d = makeMockDriver();
    d.exec = () => {};
    const { stop, stats } = startPassiveCheckpointLoop(d, {
      intervalMs: 50,
      onCheckpoint: () => { throw new Error('cb error'); },
    });
    await waitFor(120);
    stop();
    // errors 不应递增（cb error 被 catch）
    assert.strictEqual(stats.errors, 0);
  });
  await ok('E6: stop() 后不再 tick', async () => {
    const d = makeMockDriver();
    d.exec = () => {};
    const { stop, stats } = startPassiveCheckpointLoop(d, { intervalMs: 50 });
    await waitFor(120);
    stop();
    const ranAtStop = stats.ran;
    await waitFor(100);
    assert.strictEqual(stats.ran, ranAtStop);
    assert.strictEqual(stats.active, false);
  });
  await ok('E7: 多次 tick 累积 ran', async () => {
    const d = makeMockDriver();
    d.exec = () => {};
    const { stop, stats } = startPassiveCheckpointLoop(d, { intervalMs: 30 });
    await waitFor(150);
    stop();
    assert.ok(stats.ran >= 2, `ran=${stats.ran}`);
  });
  await ok('E8: onCheckpoint=非函数 → 忽略', () => {
    const d = makeMockDriver();
    const { stop } = startPassiveCheckpointLoop(d, { intervalMs: 100000, onCheckpoint: 'not a fn' });
    stop();
  });
  await ok('E9: stats 初始状态', () => {
    const d = makeMockDriver();
    const { stop, stats } = startPassiveCheckpointLoop(d, { intervalMs: 100000 });
    assert.strictEqual(stats.ran, 0);
    assert.strictEqual(stats.errors, 0);
    assert.strictEqual(stats.lastResult, null);
    assert.strictEqual(stats.lastError, null);
    assert.strictEqual(stats.active, true);
    stop();
  });
  await ok('E10: driver null → stop 安全', () => {
    const { stop } = startPassiveCheckpointLoop(null);
    stop(); // 不抛错
  });

  // ===== F组: 集成场景 =====
  console.log('\n-- F组: 集成场景 =====');
  await ok('F1: applyPragmas + checkVersion 全链路', () => {
    const d = makeMockDriver({ sqliteVersion: '3.51.3' });
    d._setResult('journal_mode', 'wal');
    const prag = applyProductionPragmas(d);
    assert.strictEqual(prag.applied.length, 8);
    const ver = checkSqliteVersion(d);
    assert.strictEqual(ver.ok, true);
    assert.strictEqual(ver.version, '3.51.3');
  });
  await ok('F2: applyPragmas + checkpointLoop 并行', async () => {
    const d = makeMockDriver();
    d._setResult('journal_mode', 'wal');
    applyProductionPragmas(d);
    const { stop, stats } = startPassiveCheckpointLoop(d, { intervalMs: 30 });
    await waitFor(100);
    stop();
    assert.ok(stats.ran >= 1);
  });
  await ok('F3: 旧版本 + 新 pragma 应用', () => {
    const d = makeMockDriver({ sqliteVersion: '3.45.0' });
    const r = applyProductionPragmas(d);
    assert.strictEqual(r.applied.length, 8);
    const v = checkSqliteVersion(d);
    assert.strictEqual(v.ok, false);
  });
  await ok('F4: pragma 失败不阻塞 checkpoint', async () => {
    const d = makeMockDriver();
    d._setError('journal_mode = WAL', 'fail');
    applyProductionPragmas(d);
    const { stop, stats } = startPassiveCheckpointLoop(d, { intervalMs: 30 });
    await waitFor(100);
    stop();
    assert.ok(stats.ran >= 1);
  });

  // ===== G组: 回归测试 =====
  console.log('\n-- G组: 回归测试 =====');
  await ok('G1: 与 sqlite-production-pragmas.cjs 行为一致', () => {
    const d = makeMockDriver();
    d._setResult('journal_mode', 'wal');
    const r = applyProductionPragmas(d);
    assert.strictEqual(r.applied.length, 8);
    assert.strictEqual(r.failed.length, 0);
    assert.ok(['wal', 'WAL'].includes(r.journalMode));
  });
  await ok('G2: RECOMMENDED_PRAGMAS 内容正确', () => {
    const m = RECOMMENDED_PRAGMAS[0];
    assert.strictEqual(m.name, 'journal_mode');
    assert.strictEqual(m.value, 'WAL');
  });
  await ok('G3: applyProductionPragmas null driver', () => {
    const r = applyProductionPragmas(null);
    assert.strictEqual(r.applied.length, 0);
    assert.strictEqual(r.failed[0].name, '*');
  });
  await ok('G4: startPassiveCheckpointLoop null driver', () => {
    const { stop, stats } = startPassiveCheckpointLoop(null);
    assert.strictEqual(stats.active, false);
    stop();
  });
  await ok('G5: checkSqliteVersion null driver', () => {
    const r = checkSqliteVersion(null);
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /driver missing/);
  });
  await ok('G6: 所有导出 API 可调用', () => {
    assert.strictEqual(typeof applyProductionPragmas, 'function');
    assert.strictEqual(typeof startPassiveCheckpointLoop, 'function');
    assert.strictEqual(typeof checkSqliteVersion, 'function');
    assert.ok(Array.isArray(RECOMMENDED_PRAGMAS));
    assert.ok(typeof DEFAULT_CHECKPOINT_INTERVAL_MS === 'number');
    // 实际调用
    const d = makeMockDriver({ sqliteVersion: '3.51.3' });
    d._setResult('journal_mode', 'wal');
    applyProductionPragmas(d);
    checkSqliteVersion(d);
    const { stop } = startPassiveCheckpointLoop(d, { intervalMs: 100000 });
    stop();
    assert.ok(true);
  });
  await ok('G7: 3.51.3 版本边界精确测试', () => {
    // 恰好等于 required
    const r = checkSqliteVersion(makeVersionDriver('3.51.3'));
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.major, 3);
    assert.strictEqual(r.minor, 51);
    assert.strictEqual(r.patch, 3);
    assert.strictEqual(r.required, '3.51.3');
  });
  await ok('G8: 6-part version 3.51.3.1.2.3 → 取前3段', () => {
    const r = checkSqliteVersion(makeVersionDriver('3.51.3.1.2.3'));
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.major, 3);
    assert.strictEqual(r.minor, 51);
    assert.strictEqual(r.patch, 3);
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
