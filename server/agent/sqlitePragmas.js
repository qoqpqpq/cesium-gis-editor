// server/agent/sqlitePragmas.js
// 周期 12 P1-2: SQLite 生产 pragma 应用 + 60s 后台 passive checkpoint
//
// 背景：
//   - 周期 9 P0-2 已落 memory.js 内散落的 5 个 PRAGMA
//   - 周期 11 调研 Top5 #3：botmonster 6-PRAGMA 配方（journal_mode + synchronous + mmap + busy + foreign_keys + journal_size_limit）
//   - 周期 11 调研 Top5 #3：MicroLogics 60s passive checkpoint 后台 loop
//
// 设计：
//   - applyProductionPragmas(driver)：应用 6 个 PRAGMA；每个 try/catch（环境不支持不抛错）
//   - startPassiveCheckpointLoop(driver, opts)：每 60s `PRAGMA wal_checkpoint(PASSIVE)`
//     返回 stop() 函数清理
//   - 模块化、纯函数、不引外部依赖
//
// 验收（tests/specs/sqlite-production-pragmas.cjs）：
//   - 6 个 PRAGMA 全部生效并断言
//   - 后台 loop 60s ± 5s 触发
//   - stop() 停止后台 loop
//   - PRAGMA 应用失败 graceful fallback

'use strict';

const RECOMMENDED_PRAGMAS = [
  // 周期 9 P0-2 + 周期 12 P1-2 增强
  { name: 'journal_mode', value: 'WAL' },
  { name: 'synchronous', value: 'NORMAL' },
  { name: 'temp_store', value: 'MEMORY' },
  { name: 'mmap_size', value: 134217728 }, // 128MB
  { name: 'cache_size', value: -64000 }, // 64MB
  // 周期 12 新增：botmonster 配方
  { name: 'busy_timeout', value: 5000 },
  { name: 'foreign_keys', value: 'ON' },
  { name: 'journal_size_limit', value: 67108864 }, // 64MB
];

const DEFAULT_CHECKPOINT_INTERVAL_MS = 60000;

/**
 * 应用生产 PRAGMA 到 better-sqlite3 driver
 * @param {object} driver - better-sqlite3 实例
 * @param {object} [opts]
 * @param {Array<{name:string, value:any}>} [opts.pragmas] - 自定义 pragma 列表
 * @returns {{applied: string[], failed: Array<{name: string, error: string}>, journalMode: string}}
 */
function applyProductionPragmas(driver, opts = {}) {
  if (!driver || typeof driver.pragma !== 'function') {
    return { applied: [], failed: [{ name: '*', error: 'driver missing or invalid' }], journalMode: 'unknown' };
  }
  const pragmas = opts.pragmas || RECOMMENDED_PRAGMAS;
  const applied = [];
  const failed = [];
  for (const { name, value } of pragmas) {
    try {
      // busy_timeout 用毫秒整数；其他用字符串
      const v = typeof value === 'number' && name === 'busy_timeout' ? value : String(value);
      driver.pragma(`${name} = ${v}`);
      applied.push(name);
    } catch (e) {
      failed.push({ name, error: e.message });
    }
  }
  let journalMode = 'unknown';
  try { journalMode = driver.pragma('journal_mode', { simple: true }); } catch (_) {}
  return { applied, failed, journalMode };
}

/**
 * 启动后台 passive checkpoint loop
 * @param {object} driver
 * @param {object} [opts]
 * @param {number} [opts.intervalMs=60000] - checkpoint 间隔（毫秒）
 * @param {Function} [opts.onCheckpoint] - (result) => void
 * @returns {{stop: Function, stats: object}}
 */
function startPassiveCheckpointLoop(driver, opts = {}) {
  if (!driver || typeof driver.pragma !== 'function') {
    return {
      stop: () => {},
      stats: { ran: 0, errors: 0, lastResult: null, active: false },
    };
  }
  const intervalMs = typeof opts.intervalMs === 'number' && opts.intervalMs > 0
    ? opts.intervalMs
    : DEFAULT_CHECKPOINT_INTERVAL_MS;
  const onCheckpoint = typeof opts.onCheckpoint === 'function' ? opts.onCheckpoint : null;

  const stats = { ran: 0, errors: 0, lastResult: null, lastError: null, active: true };
  let timer = null;

  const tick = () => {
    if (!stats.active) return;
    try {
      // PRAGMA wal_checkpoint(PASSIVE)：不阻塞 writer；只 merge 已写入 WAL 的 page
      // better-sqlite3 pragma() 调用不支持原生参数；用 exec 替代
      driver.exec('PRAGMA wal_checkpoint(PASSIVE);');
      stats.ran += 1;
      stats.lastResult = { at: Date.now(), mode: 'PASSIVE' };
      if (onCheckpoint) {
        try { onCheckpoint(stats.lastResult); } catch (_) { /* ignore */ }
      }
    } catch (e) {
      stats.errors += 1;
      stats.lastError = e.message;
    }
  };

  timer = setInterval(tick, intervalMs);
  // 不阻止 Node.js 退出
  if (timer && typeof timer.unref === 'function') timer.unref();

  return {
    stop: () => {
      stats.active = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    stats,
  };
}

module.exports = {
  applyProductionPragmas,
  startPassiveCheckpointLoop,
  RECOMMENDED_PRAGMAS,
  DEFAULT_CHECKPOINT_INTERVAL_MS,
};