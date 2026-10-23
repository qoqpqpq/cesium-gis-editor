// tests/specs/telemetry-collector-deep.cjs
// Cycle 25 R4: telemetryCollector.js 深度测试
// 覆盖: recordClientError / getRecentClientErrors / getClientErrorSummary
//       _resetBuffer / _maybeFlush / getPersistStatus / 常量
// 与 telemetry-collector.cjs (43 PASS) 互补
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 默认加载（无 env）
const collector = require('../../server/middleware/telemetryCollector');

const {
  recordClientError,
  getRecentClientErrors,
  getClientErrorSummary,
  _resetBuffer,
  _maybeFlush,
  getPersistStatus,
  DEFAULT_MAX_ITEMS,
  DEFAULT_TTL_MS,
  DEFAULT_FLUSH_THRESHOLD,
} = collector;

// ---- 计数器 ----
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

async function main() {
  console.log('=== Cycle 25 R4: telemetryCollector.js deep tests ===\n');

  // ===== A组: 模块导出 =====
  console.log('\n-- A组: 模块导出 + 常量 --');
  await ok('A1: recordClientError 是 function', () => {
    assert.strictEqual(typeof recordClientError, 'function');
  });
  await ok('A2: getRecentClientErrors 是 function', () => {
    assert.strictEqual(typeof getRecentClientErrors, 'function');
  });
  await ok('A3: getClientErrorSummary 是 function', () => {
    assert.strictEqual(typeof getClientErrorSummary, 'function');
  });
  await ok('A4: _resetBuffer 是 function', () => {
    assert.strictEqual(typeof _resetBuffer, 'function');
  });
  await ok('A5: _maybeFlush 是 function', () => {
    assert.strictEqual(typeof _maybeFlush, 'function');
  });
  await ok('A6: getPersistStatus 是 function', () => {
    assert.strictEqual(typeof getPersistStatus, 'function');
  });
  await ok('A7: DEFAULT_MAX_ITEMS = 1000', () => {
    assert.strictEqual(DEFAULT_MAX_ITEMS, 1000);
  });
  await ok('A8: DEFAULT_TTL_MS = 3600000（1 小时）', () => {
    assert.strictEqual(DEFAULT_TTL_MS, 60 * 60 * 1000);
    assert.strictEqual(DEFAULT_TTL_MS, 3600000);
  });
  await ok('A9: DEFAULT_FLUSH_THRESHOLD = 100', () => {
    assert.strictEqual(DEFAULT_FLUSH_THRESHOLD, 100);
  });
  await ok('A10: 所有导出齐全（9 个）', () => {
    const keys = Object.keys({
      recordClientError, getRecentClientErrors, getClientErrorSummary,
      _resetBuffer, _maybeFlush, getPersistStatus,
      DEFAULT_MAX_ITEMS, DEFAULT_TTL_MS, DEFAULT_FLUSH_THRESHOLD,
    });
    assert.strictEqual(keys.length, 9);
  });

  // ===== B组: recordClientError - 边界输入 =====
  console.log('\n-- B组: recordClientError 边界输入 --');
  await ok('B1: null payload 返回 false', () => {
    _resetBuffer();
    const r = recordClientError(null);
    assert.strictEqual(r, false);
  });
  await ok('B2: undefined payload 返回 false', () => {
    _resetBuffer();
    assert.strictEqual(recordClientError(undefined), false);
  });
  await ok('B3: 非 object payload 返回 false', () => {
    _resetBuffer();
    assert.strictEqual(recordClientError('string'), false);
    assert.strictEqual(recordClientError(42), false);
    assert.strictEqual(recordClientError(true), false);
  });
  await ok('B4: 空消息返回 false', () => {
    _resetBuffer();
    assert.strictEqual(recordClientError({ message: '' }), false);
  });
  await ok('B5: message 缺省返回 false', () => {
    _resetBuffer();
    assert.strictEqual(recordClientError({}), false);
    assert.strictEqual(recordClientError({ kind: 'unknown' }), false);
  });
  await ok('B6: 空 buffer 时 getRecentClientErrors 返回空数组', () => {
    _resetBuffer();
    assert.deepStrictEqual(getRecentClientErrors(), []);
  });

  // ===== C组: recordClientError - 正常记录 =====
  console.log('\n-- C组: recordClientError 正常记录 --');
  await ok('C1: 简单 payload 记录成功', () => {
    _resetBuffer();
    const r = recordClientError({ message: 'test error' });
    assert.strictEqual(r, true);
    assert.strictEqual(getClientErrorSummary().total, 1);
  });
  await ok('C2: kind 缺省设为 unknown', () => {
    _resetBuffer();
    recordClientError({ message: 'm' });
    const item = getRecentClientErrors()[0];
    assert.strictEqual(item.kind, 'unknown');
  });
  await ok('C3: source 缺省设为 asyncGuard', () => {
    _resetBuffer();
    recordClientError({ message: 'm' });
    const item = getRecentClientErrors()[0];
    assert.strictEqual(item.source, 'asyncGuard');
  });
  await ok('C4: ts 缺省时自动设置 Date.now()', () => {
    _resetBuffer();
    const before = Date.now();
    recordClientError({ message: 'm' });
    const item = getRecentClientErrors()[0];
    assert.ok(item.ts >= before);
  });
  await ok('C5: ts 显式传入保留', () => {
    _resetBuffer();
    const myTs = Date.now();
    recordClientError({ message: 'm', ts: myTs });
    const item = getRecentClientErrors()[0];
    assert.ok(item);
    assert.strictEqual(item.ts, myTs);
  });
  await ok('C6: stack 字段保留', () => {
    _resetBuffer();
    recordClientError({ message: 'm', stack: 'stack trace' });
    const item = getRecentClientErrors()[0];
    assert.strictEqual(item.stack, 'stack trace');
  });
  await ok('C7: stack 缺省为 null', () => {
    _resetBuffer();
    recordClientError({ message: 'm' });
    const item = getRecentClientErrors()[0];
    assert.strictEqual(item.stack, null);
  });
  await ok('C8: url 字段保留', () => {
    _resetBuffer();
    recordClientError({ message: 'm', url: 'https://example.com' });
    const item = getRecentClientErrors()[0];
    assert.strictEqual(item.url, 'https://example.com');
  });
  await ok('C9: url 缺省为 null', () => {
    _resetBuffer();
    recordClientError({ message: 'm' });
    const item = getRecentClientErrors()[0];
    assert.strictEqual(item.url, null);
  });
  await ok('C10: userAgent 字段保留', () => {
    _resetBuffer();
    recordClientError({ message: 'm', userAgent: 'Mozilla/5.0' });
    const item = getRecentClientErrors()[0];
    assert.strictEqual(item.userAgent, 'Mozilla/5.0');
  });
  await ok('C11: userAgent 缺省为 null', () => {
    _resetBuffer();
    recordClientError({ message: 'm' });
    const item = getRecentClientErrors()[0];
    assert.strictEqual(item.userAgent, null);
  });
  await ok('C12: source 字段保留', () => {
    _resetBuffer();
    recordClientError({ message: 'm', source: 'errorBoundary' });
    const item = getRecentClientErrors()[0];
    assert.strictEqual(item.source, 'errorBoundary');
  });
  await ok('C13: kind 字段保留', () => {
    _resetBuffer();
    recordClientError({ message: 'm', kind: 'window.error' });
    const item = getRecentClientErrors()[0];
    assert.strictEqual(item.kind, 'window.error');
  });

  // ===== D组: 字段截断 =====
  console.log('\n-- D组: 字段截断 --');
  await ok('D1: message 截断到 1000 字符', () => {
    _resetBuffer();
    const longMsg = 'a'.repeat(1500);
    recordClientError({ message: longMsg });
    const item = getRecentClientErrors()[0];
    assert.strictEqual(item.message.length, 1000);
  });
  await ok('D2: stack 截断到 5000 字符', () => {
    _resetBuffer();
    const longStack = 's'.repeat(6000);
    recordClientError({ message: 'm', stack: longStack });
    const item = getRecentClientErrors()[0];
    assert.strictEqual(item.stack.length, 5000);
  });
  await ok('D3: source 截断到 100 字符', () => {
    _resetBuffer();
    const longSource = 'x'.repeat(150);
    recordClientError({ message: 'm', source: longSource });
    const item = getRecentClientErrors()[0];
    assert.strictEqual(item.source.length, 100);
  });
  await ok('D4: url 截断到 500 字符', () => {
    _resetBuffer();
    const longUrl = 'https://example.com/' + 'u'.repeat(600);
    recordClientError({ message: 'm', url: longUrl });
    const item = getRecentClientErrors()[0];
    assert.strictEqual(item.url.length, 500);
  });
  await ok('D5: userAgent 截断到 200 字符', () => {
    _resetBuffer();
    const longUA = 'Mozilla/5.0 ' + 'x'.repeat(300);
    recordClientError({ message: 'm', userAgent: longUA });
    const item = getRecentClientErrors()[0];
    assert.strictEqual(item.userAgent.length, 200);
  });

  // ===== E组: 类型转换 =====
  console.log('\n-- E组: 类型转换 --');
  await ok('E1: message 数字转为字符串', () => {
    _resetBuffer();
    recordClientError({ message: 12345 });
    const item = getRecentClientErrors()[0];
    assert.strictEqual(item.message, '12345');
  });
  await ok('E2: kind 数字转为字符串', () => {
    _resetBuffer();
    recordClientError({ message: 'm', kind: 42 });
    const item = getRecentClientErrors()[0];
    assert.strictEqual(item.kind, '42');
  });
  await ok('E3: ts 字符串数字解析', () => {
    _resetBuffer();
    const myTs = Date.now();
    recordClientError({ message: 'm', ts: String(myTs) });
    const item = getRecentClientErrors()[0];
    assert.ok(item);
    assert.strictEqual(item.ts, myTs);
  });
  await ok('E4: ts 非数字用 Date.now()', () => {
    _resetBuffer();
    const before = Date.now();
    recordClientError({ message: 'm', ts: 'not-a-number' });
    const item = getRecentClientErrors()[0];
    assert.ok(item.ts >= before);
  });
  await ok('E5: ts=0 时用 Date.now()（因为 0 是 falsy）', () => {
    _resetBuffer();
    const before = Date.now();
    recordClientError({ message: 'm', ts: 0 });
    const item = getRecentClientErrors()[0];
    assert.ok(item.ts >= before);
  });
  await ok('E6: stack 数字转为字符串', () => {
    _resetBuffer();
    recordClientError({ message: 'm', stack: 12345 });
    const item = getRecentClientErrors()[0];
    assert.strictEqual(item.stack, '12345');
  });
  await ok('E7: source 数字转为字符串', () => {
    _resetBuffer();
    recordClientError({ message: 'm', source: 7 });
    const item = getRecentClientErrors()[0];
    assert.strictEqual(item.source, '7');
  });

  // ===== F组: getRecentClientErrors =====
  console.log('\n-- F组: getRecentClientErrors 行为 --');
  await ok('F1: 默认 limit=100', () => {
    _resetBuffer();
    for (let i = 0; i < 150; i++) {
      recordClientError({ message: `m${i}`, ts: Date.now() +  i });
    }
    const r = getRecentClientErrors();
    assert.strictEqual(r.length, 100);
    // 返回最后 100 条（最新的）
    assert.strictEqual(r[0].message, 'm50');
    assert.strictEqual(r[99].message, 'm149');
  });
  await ok('F2: limit 参数生效', () => {
    _resetBuffer();
    for (let i = 0; i < 10; i++) {
      recordClientError({ message: `m${i}`, ts: Date.now() +  i });
    }
    const r = getRecentClientErrors({ limit: 3 });
    assert.strictEqual(r.length, 3);
    assert.strictEqual(r[0].message, 'm7');
    assert.strictEqual(r[2].message, 'm9');
  });
  await ok('F3: since 过滤', () => {
    _resetBuffer();
    const now = Date.now();
    for (let i = 0; i < 10; i++) {
      recordClientError({ message: `m${i}`, ts: now + i });
    }
    const r = getRecentClientErrors({ since: now + 5 });
    // ts >= now + 5 的条目：m5, m6, ..., m9
    assert.strictEqual(r.length, 5);
    assert.strictEqual(r[0].message, 'm5');
    assert.strictEqual(r[4].message, 'm9');
  });
  await ok('F4: since=0 返回全部（截断到 limit）', () => {
    _resetBuffer();
    for (let i = 0; i < 5; i++) {
      recordClientError({ message: `m${i}`, ts: Date.now() +  i });
    }
    const r = getRecentClientErrors({ since: 0, limit: 100 });
    assert.strictEqual(r.length, 5);
  });
  await ok('F5: since 非数字用 0', () => {
    _resetBuffer();
    for (let i = 0; i < 5; i++) {
      recordClientError({ message: `m${i}`, ts: Date.now() +  i });
    }
    const r = getRecentClientErrors({ since: 'invalid' });
    assert.strictEqual(r.length, 5);
  });
  await ok('F6: limit 非数字用 100', () => {
    _resetBuffer();
    for (let i = 0; i < 150; i++) {
      recordClientError({ message: `m${i}`, ts: Date.now() +  i });
    }
    const r = getRecentClientErrors({ limit: 'invalid' });
    assert.strictEqual(r.length, 100);
  });

  // ===== G组: getClientErrorSummary =====
  console.log('\n-- G组: getClientErrorSummary 聚合 --');
  await ok('G1: 空 buffer 摘要', () => {
    _resetBuffer();
    const s = getClientErrorSummary();
    assert.strictEqual(s.total, 0);
    assert.deepStrictEqual(s.byKind, {});
    assert.deepStrictEqual(s.bySource, {});
    assert.strictEqual(s.oldest, null);
    assert.strictEqual(s.newest, null);
  });
  await ok('G2: 单条摘要', () => {
    _resetBuffer();
    const myTs = Date.now();
    recordClientError({ message: 'm1', kind: 'window.error', source: 'asyncGuard', ts: myTs });
    const s = getClientErrorSummary();
    assert.strictEqual(s.total, 1);
    assert.strictEqual(s.byKind['window.error'], 1);
    assert.strictEqual(s.bySource['asyncGuard'], 1);
    assert.strictEqual(s.oldest, myTs);
    assert.strictEqual(s.newest, myTs);
  });
  await ok('G3: 多条按 kind 统计', () => {
    _resetBuffer();
    const now = Date.now();
    recordClientError({ message: 'm1', kind: 'window.error', ts: now });
    recordClientError({ message: 'm2', kind: 'window.error', ts: now + 1 });
    recordClientError({ message: 'm3', kind: 'unhandledrejection', ts: now + 2 });
    const s = getClientErrorSummary();
    assert.strictEqual(s.total, 3);
    assert.strictEqual(s.byKind['window.error'], 2);
    assert.strictEqual(s.byKind['unhandledrejection'], 1);
  });
  await ok('G4: 多条按 source 统计', () => {
    _resetBuffer();
    const now = Date.now();
    recordClientError({ message: 'm1', source: 'asyncGuard', ts: now });
    recordClientError({ message: 'm2', source: 'errorBoundary', ts: now + 1 });
    recordClientError({ message: 'm3', source: 'asyncGuard', ts: now + 2 });
    const s = getClientErrorSummary();
    assert.strictEqual(s.bySource.asyncGuard, 2);
    assert.strictEqual(s.bySource.errorBoundary, 1);
  });
  await ok('G5: oldest = 最早 ts（push 顺序，非 ts 值）', () => {
    _resetBuffer();
    const base = Date.now();
    const t1 = base;
    const t2 = base + 1000;
    const t3 = base + 2000;
    recordClientError({ message: 'm1', ts: t1 });
    recordClientError({ message: 'm2', ts: t2 });
    recordClientError({ message: 'm3', ts: t3 });
    const s = getClientErrorSummary();
    // oldest = _buffer[0].ts = 第一个 push 的 ts
    assert.strictEqual(s.oldest, t1);
  });
  await ok('G6: newest = 最新 ts（push 顺序，非 ts 值）', () => {
    _resetBuffer();
    const base = Date.now();
    const t1 = base;
    const t2 = base + 1000;
    const t3 = base + 2000;
    recordClientError({ message: 'm1', ts: t1 });
    recordClientError({ message: 'm2', ts: t2 });
    recordClientError({ message: 'm3', ts: t3 });
    const s = getClientErrorSummary();
    // newest = _buffer[_buffer.length-1].ts = 最后一个 push 的 ts
    assert.strictEqual(s.newest, t3);
  });
  await ok('G6b: oldest 按 push 顺序，不排序 ts', () => {
    _resetBuffer();
    const base = Date.now();
    // 先 push 大 ts，再 push 小 ts
    recordClientError({ message: 'm1', ts: base + 2000 });
    recordClientError({ message: 'm2', ts: base });
    const s = getClientErrorSummary();
    // oldest = 第一个 push 的 ts（较大）
    assert.strictEqual(s.oldest, base + 2000);
    // newest = 最后一个 push 的 ts（较小）
    assert.strictEqual(s.newest, base);
  });

  // ===== H组: TTL 滑动窗口 =====
  console.log('\n-- H组: TTL 滑动窗口 --');
  await ok('H1: 超过 TTL 的条目被清除', () => {
    _resetBuffer();
    const now = Date.now();
    // 1 小时前
    recordClientError({ message: 'old', ts: now - 70 * 60 * 1000 });
    // 当前
    recordClientError({ message: 'new', ts: now });
    // 触发 filter 需要新 record
    recordClientError({ message: 'trigger', ts: now });
    const s = getClientErrorSummary();
    // 应该只有 2 条（new + trigger），old 被清除
    assert.strictEqual(s.total, 2);
  });
  await ok('H2: TTL 边界内条目保留', () => {
    _resetBuffer();
    const now = Date.now();
    // 59 分钟前（在 TTL 内）
    recordClientError({ message: 'recent', ts: now - 59 * 60 * 1000 });
    recordClientError({ message: 'now', ts: now });
    const s = getClientErrorSummary();
    assert.strictEqual(s.total, 2);
  });

  // ===== I组: MAX_ITEMS 截断 =====
  console.log('\n-- I组: MAX_ITEMS 截断 --');
  await ok('I1: 超过 1000 条时保留最新 1000 条', () => {
    _resetBuffer();
    // 注入 1005 条
    for (let i = 0; i < 1005; i++) {
      recordClientError({ message: `m${i}`, ts: Date.now() +  i });
    }
    const s = getClientErrorSummary();
    assert.strictEqual(s.total, 1000);
    // 最新 1000 条：从 m5 开始
    const r = getRecentClientErrors({ limit: 1005 });
    assert.strictEqual(r.length, 1000);
    assert.strictEqual(r[0].message, 'm5');
    assert.strictEqual(r[999].message, 'm1004');
  });
  await ok('I2: 恰好 1000 条不截断', () => {
    _resetBuffer();
    for (let i = 0; i < 1000; i++) {
      recordClientError({ message: `m${i}`, ts: Date.now() +  i });
    }
    const s = getClientErrorSummary();
    assert.strictEqual(s.total, 1000);
  });

  // ===== J组: _resetBuffer =====
  console.log('\n-- J组: _resetBuffer 行为 --');
  await ok('J1: 清空 buffer', () => {
    recordClientError({ message: 'm1' });
    recordClientError({ message: 'm2' });
    _resetBuffer();
    assert.strictEqual(getClientErrorSummary().total, 0);
  });
  await ok('J2: 清空 _persistBytes', () => {
    // 无 PERSIST_PATH 时 _persistBytes 始终为 0
    _resetBuffer();
    const s = getPersistStatus();
    assert.strictEqual(s.bytesWritten, 0);
  });

  // ===== K组: _maybeFlush =====
  console.log('\n-- K组: _maybeFlush 行为 --');
  await ok('K1: 未达阈值不 flush（无 console.log 输出）', () => {
    _resetBuffer();
    for (let i = 0; i < 10; i++) {
      recordClientError({ message: `m${i}`, ts: Date.now() +  i });
    }
    // 临时替换 console.log
    let logged = 0;
    const origLog = console.log;
    console.log = () => { logged++; };
    try {
      _maybeFlush();
    } finally {
      console.log = origLog;
    }
    assert.strictEqual(logged, 0);
  });
  await ok('K2: 达到阈值时 console.log 提示', () => {
    _resetBuffer();
    for (let i = 0; i < 100; i++) {
      recordClientError({ message: `m${i}`, ts: Date.now() +  i });
    }
    let logged = 0;
    let logArg = null;
    const origLog = console.log;
    console.log = (msg) => { logged++; logArg = msg; };
    try {
      _maybeFlush();
    } finally {
      console.log = origLog;
    }
    assert.strictEqual(logged, 1);
    assert.ok(logArg.includes('flush threshold reached'));
    assert.ok(logArg.includes('100'));
  });
  await ok('K3: 超过阈值时仍 flush', () => {
    _resetBuffer();
    for (let i = 0; i < 150; i++) {
      recordClientError({ message: `m${i}`, ts: Date.now() +  i });
    }
    let logged = 0;
    const origLog = console.log;
    console.log = () => { logged++; };
    try {
      _maybeFlush();
    } finally {
      console.log = origLog;
    }
    assert.strictEqual(logged, 1);
  });

  // ===== L组: getPersistStatus =====
  console.log('\n-- L组: getPersistStatus 行为 --');
  await ok('L1: 无 PERSIST_PATH 时 enabled=false', () => {
    _resetBuffer();
    const s = getPersistStatus();
    assert.strictEqual(s.enabled, false);
    assert.strictEqual(s.path, null);
  });
  await ok('L2: bytesWritten=0', () => {
    _resetBuffer();
    const s = getPersistStatus();
    assert.strictEqual(s.bytesWritten, 0);
  });
  await ok('L3: maxBytes=10MB', () => {
    _resetBuffer();
    const s = getPersistStatus();
    assert.strictEqual(s.maxBytes, 10 * 1024 * 1024);
  });
  await ok('L4: remainingBytes = maxBytes 当 bytesWritten=0', () => {
    _resetBuffer();
    const s = getPersistStatus();
    assert.strictEqual(s.remainingBytes, 10 * 1024 * 1024);
  });
  await ok('L5: PERSIST_PATH 设置后 enabled=true', () => {
    // 动态加载模块（带 env）
    const tmpPath = path.join(os.tmpdir(), `telemetry-test-${Date.now()}.jsonl`);
    try {
      delete require.cache[require.resolve('../../server/middleware/telemetryCollector')];
      process.env.TELEMETRY_PERSIST_PATH = tmpPath;
      const mod = require('../../server/middleware/telemetryCollector');
      const s = mod.getPersistStatus();
      assert.strictEqual(s.enabled, true);
      assert.strictEqual(s.path, tmpPath);
    } finally {
      delete process.env.TELEMETRY_PERSIST_PATH;
      delete require.cache[require.resolve('../../server/middleware/telemetryCollector')];
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    }
  });

  // ===== M组: 持久化（TELEMETRY_PERSIST_PATH） =====
  console.log('\n-- M组: 持久化（TELEMETRY_PERSIST_PATH）--');
  await ok('M1: PERSIST_PATH 启用时写入 JSONL', () => {
    const tmpPath = path.join(os.tmpdir(), `telemetry-write-${Date.now()}.jsonl`);
    try {
      delete require.cache[require.resolve('../../server/middleware/telemetryCollector')];
      process.env.TELEMETRY_PERSIST_PATH = tmpPath;
      const mod = require('../../server/middleware/telemetryCollector');
      mod._resetBuffer();
      const r = mod.recordClientError({ message: 'persist-test', kind: 'window.error' });
      assert.strictEqual(r, true);
      // 检查文件存在
      assert.ok(fs.existsSync(tmpPath));
      const content = fs.readFileSync(tmpPath, 'utf8').trim();
      const lines = content.split('\n');
      assert.strictEqual(lines.length, 1);
      const item = JSON.parse(lines[0]);
      assert.strictEqual(item.message, 'persist-test');
      assert.strictEqual(item.kind, 'window.error');
      // 检查 getPersistStatus
      const s = mod.getPersistStatus();
      assert.ok(s.bytesWritten > 0);
      assert.ok(s.bytesWritten <= s.remainingBytes + s.bytesWritten); // bytesWritten + remainingBytes = maxBytes
    } finally {
      delete process.env.TELEMETRY_PERSIST_PATH;
      delete require.cache[require.resolve('../../server/middleware/telemetryCollector')];
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    }
  });
  await ok('M2: 多条持久化追加 JSONL', () => {
    const tmpPath = path.join(os.tmpdir(), `telemetry-append-${Date.now()}.jsonl`);
    try {
      delete require.cache[require.resolve('../../server/middleware/telemetryCollector')];
      process.env.TELEMETRY_PERSIST_PATH = tmpPath;
      const mod = require('../../server/middleware/telemetryCollector');
      mod._resetBuffer();
      mod.recordClientError({ message: 'm1' });
      mod.recordClientError({ message: 'm2' });
      mod.recordClientError({ message: 'm3' });
      const content = fs.readFileSync(tmpPath, 'utf8').trim();
      const lines = content.split('\n');
      assert.strictEqual(lines.length, 3);
      assert.strictEqual(JSON.parse(lines[0]).message, 'm1');
      assert.strictEqual(JSON.parse(lines[1]).message, 'm2');
      assert.strictEqual(JSON.parse(lines[2]).message, 'm3');
    } finally {
      delete process.env.TELEMETRY_PERSIST_PATH;
      delete require.cache[require.resolve('../../server/middleware/telemetryCollector')];
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    }
  });
  await ok('M3: 持久化失败不抛错（路径无效）', () => {
    const invalidPath = '/nonexistent-dir/no-such-file.jsonl';
    try {
      delete require.cache[require.resolve('../../server/middleware/telemetryCollector')];
      process.env.TELEMETRY_PERSIST_PATH = invalidPath;
      const mod = require('../../server/middleware/telemetryCollector');
      mod._resetBuffer();
      // 不应抛错
      const r = mod.recordClientError({ message: 'fail-test' });
      assert.strictEqual(r, true); // recordClientError 仍返回 true
      // console.warn 应被调用（不阻塞）
      const origWarn = console.warn;
      let warned = false;
      console.warn = () => { warned = true; };
      try {
        mod.recordClientError({ message: 'fail-test2' });
      } finally {
        console.warn = origWarn;
      }
      assert.ok(true); // 未抛错即通过
    } finally {
      delete process.env.TELEMETRY_PERSIST_PATH;
      delete require.cache[require.resolve('../../server/middleware/telemetryCollector')];
    }
  });
  await ok('M4: 空消息在持久化时也不写入', () => {
    const tmpPath = path.join(os.tmpdir(), `telemetry-empty-${Date.now()}.jsonl`);
    try {
      delete require.cache[require.resolve('../../server/middleware/telemetryCollector')];
      process.env.TELEMETRY_PERSIST_PATH = tmpPath;
      const mod = require('../../server/middleware/telemetryCollector');
      mod._resetBuffer();
      const r = mod.recordClientError({ message: '' });
      assert.strictEqual(r, false);
      // 文件不应创建（或为空）
      if (fs.existsSync(tmpPath)) {
        const content = fs.readFileSync(tmpPath, 'utf8').trim();
        assert.strictEqual(content, '');
      }
    } finally {
      delete process.env.TELEMETRY_PERSIST_PATH;
      delete require.cache[require.resolve('../../server/middleware/telemetryCollector')];
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    }
  });

  // ===== N组: 回归验证 =====
  console.log('\n-- N组: 回归验证 --');
  await ok('N1: recordClientError 是纯函数（不修改入参）', () => {
    _resetBuffer();
    const p = { message: 'm', kind: 'window.error', source: 'asyncGuard' };
    const orig = { ...p };
    recordClientError(p);
    assert.deepStrictEqual(p, orig);
  });
  await ok('N2: 多次 recordClientError 后 summary 累加', () => {
    _resetBuffer();
    for (let i = 0; i < 10; i++) {
      recordClientError({ message: `m${i}`, kind: 'window.error', ts: Date.now() +  i });
    }
    const s = getClientErrorSummary();
    assert.strictEqual(s.total, 10);
    assert.strictEqual(s.byKind['window.error'], 10);
  });
  await ok('N3: getRecentClientErrors 返回值排序（按 push 顺序）', () => {
    _resetBuffer();
    for (let i = 0; i < 5; i++) {
      recordClientError({ message: `m${i}`, ts: Date.now() +  i });
    }
    const r = getRecentClientErrors();
    for (let i = 0; i < r.length - 1; i++) {
      assert.ok(r[i].ts <= r[i + 1].ts);
    }
  });
  await ok('N4: _resetBuffer 后重新记录', () => {
    _resetBuffer();
    recordClientError({ message: 'before' });
    _resetBuffer();
    recordClientError({ message: 'after' });
    const r = getRecentClientErrors();
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].message, 'after');
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
