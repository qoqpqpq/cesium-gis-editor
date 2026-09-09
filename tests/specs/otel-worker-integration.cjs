// tests/specs/otel-worker-integration.cjs
// 周期 13 P1-1: otelDevHook worker 集成单元测试
// 目标：≥ 15 子断言 PASS

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
  console.log('=== otel-worker-integration ===');

  // ============ Group A: 模块导出扩展 ============
  await ok('A1: withWorkerContext 已导出', () => {
    assert.equal(typeof otel.withWorkerContext, 'function');
  });
  await ok('A2: getCurrentTraceparent 已导出', () => {
    assert.equal(typeof otel.getCurrentTraceparent, 'function');
  });
  await ok('A3: _state 已导出', () => {
    assert.ok(otel._state);
    assert.equal(typeof otel._state.installed, 'boolean');
  });

  // ============ Group B: withWorkerContext ============
  await ok('B1: null carrier → fn 仍执行', () => {
    let called = false;
    otel.withWorkerContext(null, () => { called = true; });
    assert.equal(called, true);
  });
  await ok('B2: 空对象 carrier → fn 执行（无 traceparent）', () => {
    let called = false;
    otel.withWorkerContext({}, () => { called = true; });
    assert.equal(called, true);
  });
  await ok('B3: 含 traceparent carrier → ALS store 内可拿', () => {
    const carrier = {
      traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01',
      traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      parentSpanId: 'bbbbbbbbbbbbbbbb',
      requestId: 'req_test',
    };
    let captured;
    otel.withWorkerContext(carrier, () => {
      captured = otel._als.getStore();
    });
    assert.ok(captured);
    assert.equal(captured.traceId, carrier.traceId);
    assert.equal(captured.parentId, carrier.parentSpanId);
    assert.equal(captured.requestId, 'req_test');
  });
  await ok('B4: 缺 traceId 自动生成', () => {
    const carrier = { traceparent: '00-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-cccccccccccccccc-01' };
    let captured;
    otel.withWorkerContext(carrier, () => {
      captured = otel._als.getStore();
    });
    assert.match(captured.traceId, /^[0-9a-f]{32}$/);
  });
  await ok('B5: 跨 span ALS 隔离', () => {
    let outerId, innerId;
    otel.withWorkerContext({ traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01' }, () => {
      outerId = otel.getTraceId();
      otel.withWorkerContext({ traceparent: '00-cccccccccccccccccccccccccccccccc-dddddddddddddddd-01' }, () => {
        innerId = otel.getTraceId();
      });
    });
    assert.notEqual(outerId, innerId);
  });
  await ok('B6: 真实 worker_threads round-trip', async () => {
    const { Worker } = require('node:worker_threads');
    const carrier = {
      traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-eeeeeeeeeeeeeeee-01',
      traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      requestId: 'req_worker_roundtrip',
    };
    const workerSrc = `
      const { parentPort, workerData } = require('node:worker_threads');
      const otel = require(${JSON.stringify(path.join(__dirname, '../../server/agent/otelDevHook'))});
      let captured = null;
      otel.withWorkerContext(workerData.carrier, () => {
        captured = {
          traceId: otel.getTraceId(),
          requestId: otel._als.getStore() && otel._als.getStore().requestId,
        };
      });
      parentPort.postMessage(captured);
    `;
    const result = await new Promise((resolve, reject) => {
      const w = new Worker(workerSrc, { eval: true, workerData: { carrier } });
      w.on('message', resolve);
      w.on('error', reject);
      w.on('exit', (c) => { if (c !== 0) reject(new Error('exit ' + c)); });
    });
    assert.equal(result.traceId, carrier.traceId);
    assert.equal(result.requestId, 'req_worker_roundtrip');
  });

  // ============ Group C: getCurrentTraceparent ============
  await ok('C1: 无 store → null', () => {
    // 不在 ALS store 内调用
    assert.equal(otel.getCurrentTraceparent(), null);
  });
  await ok('C2: store 内 → W3C traceparent', () => {
    let tp;
    const tpIn = '00-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-1111111111111111-01';
    otel.withWorkerContext({ traceparent: tpIn }, () => {
      tp = otel.getCurrentTraceparent();
    });
    assert.match(tp, /^00-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-[0-9a-f]{16}-01$/);
  });
  await ok('C3: 连续生成不同 spanId', () => {
    const tps = [];
    for (let i = 0; i < 5; i++) {
      otel.withWorkerContext({ traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1111111111111111-01' }, () => {
        tps.push(otel.getCurrentTraceparent());
      });
    }
    const set = new Set(tps);
    assert.equal(set.size, 5);
  });

  // ============ Group D: 兼容性 ============
  await ok('D1: 与 runWithSpan 不冲突', () => {
    let captured;
    otel.runWithSpan('test-span', () => {
      captured = otel.getTraceId();
    });
    assert.match(captured, /^[0-9a-f]{32}$/);
  });
  await ok('D2: withWorkerContext(fn=null) 返回 undefined', () => {
    assert.equal(otel.withWorkerContext({}, null), undefined);
  });
  await ok('D3: spanName 默认 worker:anonymous', () => {
    let captured;
    otel.withWorkerContext({ traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1111111111111111-01' }, () => {
      captured = otel._als.getStore().spanName;
    });
    assert.equal(captured, 'worker:anonymous');
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});