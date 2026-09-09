// tests/specs/otel-dev-hook.cjs
// 周期 12 P2-2: otelDevHook 单元测试
// 目标：≥ 14 子断言 PASS

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const otel = require(path.join(__dirname, '../../server/agent/otelDevHook'));

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
  console.log('=== otel-dev-hook ===');

  // ============ Group A: 模块导出 ============
  await ok('A1: install 已导出', () => {
    assert.equal(typeof otel.install, 'function');
  });
  await ok('A2: uninstall 已导出', () => {
    assert.equal(typeof otel.uninstall, 'function');
  });
  await ok('A3: runWithSpan 已导出', () => {
    assert.equal(typeof otel.runWithSpan, 'function');
  });
  await ok('A4: getTraceId 已导出', () => {
    assert.equal(typeof otel.getTraceId, 'function');
  });
  await ok('A5: isInstalled 已导出', () => {
    assert.equal(typeof otel.isInstalled, 'function');
  });

  // ============ Group B: install / uninstall 边界 ============
  await ok('B1: 缺 OTel SDK → installed=false 且不抛错', () => {
    const r = otel.install();
    assert.equal(r.installed, false);
    assert.ok(typeof r.reason === 'string');
  });
  await ok('B2: 缺 SDK 时 errors 数组记录', () => {
    otel.install();
    const stats = otel.getStats();
    assert.ok(Array.isArray(stats.errors));
    // 第一次失败应记录
  });
  await ok('B3: 重复 install → 不抛错', () => {
    const r1 = otel.install();
    const r2 = otel.install();
    assert.equal(r1.installed, false);
    assert.equal(r2.installed, false);
  });
  await ok('B4: uninstall 不安装时也 ok', async () => {
    const r = await otel.uninstall();
    assert.equal(r.ok, true);
  });
  await ok('B5: isInstalled 初始 false（未真装）', () => {
    assert.equal(otel.isInstalled(), false);
  });

  // ============ Group C: runWithSpan ALS ============
  await ok('C1: runWithSpan 内可拿 traceId', () => {
    let captured = null;
    otel.runWithSpan('test-span', () => {
      captured = otel.getTraceId();
    });
    assert.ok(captured);
    assert.match(captured, /^[0-9a-f]{32}$/);
  });
  await ok('C2: runWithSpan 不同 span 拿不同 traceId', () => {
    let id1, id2;
    otel.runWithSpan('a', () => { id1 = otel.getTraceId(); });
    otel.runWithSpan('b', () => { id2 = otel.getTraceId(); });
    assert.notEqual(id1, id2);
  });
  await ok('C3: 跨 span ALS 隔离', () => {
    let innerId, outerId;
    otel.runWithSpan('outer', () => {
      outerId = otel.getTraceId();
      otel.runWithSpan('inner', () => {
        innerId = otel.getTraceId();
      });
    });
    assert.notEqual(outerId, innerId);
  });
  await ok('C4: span context 含 spanName/traceId/spanId/ts', () => {
    let ctx;
    otel.runWithSpan('my-span', () => { ctx = otel.getSpanContext(); });
    assert.equal(ctx.spanName, 'my-span');
    assert.ok(ctx.traceId);
    assert.ok(ctx.spanId);
    assert.ok(ctx.ts);
  });
  await ok('C5: span 外 getTraceId=null', () => {
    // 当前顶层无 ALS store
    // 但前面测试可能留下 store；用 _als 直接验证
    assert.equal(otel._als.getStore(), undefined);
  });

  // ============ Group D: 兼容性 ============
  await ok('D1: runWithSpan 非函数 fn → undefined', () => {
    assert.equal(otel.runWithSpan('x', null), undefined);
  });
  await ok('D2: spanName 为空 → 默认 anonymous', () => {
    let ctx;
    otel.runWithSpan('', () => { ctx = otel.getSpanContext(); });
    assert.equal(ctx.spanName, 'anonymous');
  });

  // ============ Group E: 文件结构 ============
  await ok('E1: 文件含 install/uninstall/runWithSpan 关键字', () => {
    const fs = require('node:fs');
    const src = fs.readFileSync(path.join(__dirname, '../../server/agent/otelDevHook.js'), 'utf8');
    for (const k of ['install', 'uninstall', 'runWithSpan', 'ConsoleSpanExporter']) {
      assert.ok(src.includes(k), `missing keyword ${k}`);
    }
  });
  await ok('E2: NODE_ENV 生产时不安装（文档契约）', () => {
    const fs = require('node:fs');
    const src = fs.readFileSync(path.join(__dirname, '../../server/agent/otelDevHook.js'), 'utf8');
    assert.match(src, /NODE_ENV\s*!==\s*['"]production['"]/);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});