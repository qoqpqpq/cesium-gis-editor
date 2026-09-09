// tests/specs/worker-trace-carrier.cjs
// 周期 12 P1-3: workerTraceCarrier 单元测试
// 目标：≥ 18 子断言 PASS

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const carrier = require(path.join(__dirname, '../../server/agent/workerTraceCarrier'));
const { getRequestContext, runWithRequestContext } = require(path.join(__dirname, '../../server/middleware/logger'));

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
  console.log('=== worker-trace-carrier ===');

  // ============ Group A: 模块导出 ============
  await ok('A1: attachTraceToWorkerData 已导出', () => {
    assert.equal(typeof carrier.attachTraceToWorkerData, 'function');
  });
  await ok('A2: parseTraceCarrier 已导出', () => {
    assert.equal(typeof carrier.parseTraceCarrier, 'function');
  });
  await ok('A3: restoreTraceFromWorker 已导出', () => {
    assert.equal(typeof carrier.restoreTraceFromWorker, 'function');
  });
  await ok('A4: runInTraceContext 已导出', () => {
    assert.equal(typeof carrier.runInTraceContext, 'function');
  });
  await ok('A5: childTraceparent 已导出', () => {
    assert.equal(typeof carrier.childTraceparent, 'function');
  });
  await ok('A6: CARRIER_KEY 已导出', () => {
    assert.equal(carrier.CARRIER_KEY, '_traceCarrier');
  });

  // ============ Group B: attachTraceToWorkerData ============
  await ok('B1: 无 traceparent 头 → carrier.traceparent=null', () => {
    const req = { headers: {} };
    const wd = carrier.attachTraceToWorkerData(req);
    assert.equal(wd._traceCarrier.traceparent, null);
  });
  await ok('B2: 有 traceparent 头 → 复制', () => {
    const tp = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const req = { headers: { traceparent: tp } };
    const wd = carrier.attachTraceToWorkerData(req);
    assert.equal(wd._traceCarrier.traceparent, tp);
  });
  await ok('B3: 有 x-request-id 头 → 复制', () => {
    const req = { headers: { 'x-request-id': 'req_abc123' } };
    const wd = carrier.attachTraceToWorkerData(req);
    assert.equal(wd._traceCarrier.requestId, 'req_abc123');
  });
  await ok('B4: 有效 traceparent → 提取 traceId/parentSpanId', () => {
    const tp = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const req = { headers: { traceparent: tp } };
    const wd = carrier.attachTraceToWorkerData(req);
    assert.equal(wd._traceCarrier.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
    assert.equal(wd._traceCarrier.parentSpanId, '00f067aa0ba902b7');
  });
  await ok('B4b: 32 hex traceId 不足 → parseTraceparent 不命中（边界）', () => {
    const tp = '00-aaaa-1111-01'; // traceId 短
    const req = { headers: { traceparent: tp } };
    const wd = carrier.attachTraceToWorkerData(req);
    assert.equal(wd._traceCarrier.traceId, null);
  });
  await ok('B5: 无效 traceparent → traceId=null（不抛错）', () => {
    const req = { headers: { traceparent: 'invalid' } };
    const wd = carrier.attachTraceToWorkerData(req);
    assert.equal(wd._traceCarrier.traceId, null);
  });
  await ok('B6: 保留 baseWorkerData 字段', () => {
    const req = { headers: {} };
    const wd = carrier.attachTraceToWorkerData(req, { foo: 1, bar: 'x' });
    assert.equal(wd.foo, 1);
    assert.equal(wd.bar, 'x');
    assert.ok('_traceCarrier' in wd);
  });
  await ok('B7: req 缺失 → carrier=null', () => {
    const wd = carrier.attachTraceToWorkerData(null);
    assert.equal(wd._traceCarrier, null);
  });

  // ============ Group C: parseTraceCarrier ============
  await ok('C1: null → null', () => {
    assert.equal(carrier.parseTraceCarrier(null), null);
  });
  await ok('C2: 非对象 → null', () => {
    assert.equal(carrier.parseTraceCarrier('string'), null);
  });
  await ok('C3: 数组 → null', () => {
    assert.equal(carrier.parseTraceCarrier([]), null);
  });
  await ok('C4: 缺字段 → null 默认值', () => {
    const r = carrier.parseTraceCarrier({});
    assert.equal(r.traceparent, null);
    assert.equal(r.requestId, null);
  });
  await ok('C5: 字段类型不对 → null 替代', () => {
    const r = carrier.parseTraceCarrier({ traceparent: 123, requestId: true });
    assert.equal(r.traceparent, null);
    assert.equal(r.requestId, null);
  });
  await ok('C6: 合法字段 → 完整解析', () => {
    const r = carrier.parseTraceCarrier({
      traceparent: '00-aaaa-bbbb-01',
      requestId: 'req_x',
      traceId: 'aaaa',
      parentSpanId: 'bbbb',
      ts: 1000,
    });
    assert.equal(r.traceparent, '00-aaaa-bbbb-01');
    assert.equal(r.requestId, 'req_x');
    assert.equal(r.ts, 1000);
  });

  // ============ Group D: restoreTraceFromWorker ============
  await ok('D1: 缺 _traceCarrier → null', () => {
    assert.equal(carrier.restoreTraceFromWorker({}), null);
  });
  await ok('D2: 缺 workerData → null', () => {
    assert.equal(carrier.restoreTraceFromWorker(null), null);
  });
  await ok('D3: 完整 workerData → 解析成功', () => {
    const tp = '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01';
    const wd = carrier.attachTraceToWorkerData({
      headers: { traceparent: tp, 'x-request-id': 'req_1' },
    });
    const restored = carrier.restoreTraceFromWorker(wd);
    assert.equal(restored.traceId, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    assert.equal(restored.parentSpanId, 'bbbbbbbbbbbbbbbb');
  });

  // ============ Group E: runInTraceContext ============
  await ok('E1: 在 context 内可拿 traceId', () => {
    const ctx = {
      traceparent: '00-cccc-dddd-01',
      traceId: 'cccc',
      requestId: 'req_ctx',
    };
    let captured = null;
    carrier.runInTraceContext(ctx, () => {
      captured = getRequestContext();
    });
    assert.ok(captured);
    assert.equal(captured.traceId, 'cccc');
  });
  await ok('E2: carrier=null 时 fn 仍执行（无 context）', () => {
    let called = false;
    carrier.runInTraceContext(null, () => { called = true; });
    assert.equal(called, true);
  });
  await ok('E3: fn 非函数 → 返回 undefined', () => {
    assert.equal(carrier.runInTraceContext({}, null), undefined);
  });

  // ============ Group F: childTraceparent ============
  await ok('F1: 有效 carrier → 生成新 spanId + 保留 traceId', () => {
    const parent = {
      traceparent: '00-aaaa-1111-01',
      traceId: 'aaaa',
      parentSpanId: '1111',
    };
    const child = carrier.childTraceparent(parent);
    assert.ok(/^00-aaaa-[0-9a-f]{16}-01$/.test(child), `child=${child}`);
  });
  await ok('F2: carrier=null → null', () => {
    assert.equal(carrier.childTraceparent(null), null);
  });
  await ok('F3: 缺 traceId → null', () => {
    assert.equal(carrier.childTraceparent({}), null);
  });
  await ok('F4: 连续生成不同 spanId', () => {
    const parent = { traceId: 'aaaa' };
    const a = carrier.childTraceparent(parent);
    const b = carrier.childTraceparent(parent);
    assert.notEqual(a, b);
  });

  // ============ Group G: 跨"线程"行为（真实 worker_threads） ============
  await ok('G1: 主→worker round-trip 通过 worker_threads', async () => {
    const { Worker } = require('node:worker_threads');
    const tp = '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1111111111111111-01';
    const wd = carrier.attachTraceToWorkerData({
      headers: {
        traceparent: tp,
        'x-request-id': 'req_roundtrip',
      },
    });
    const workerSrc = `
      const { parentPort, workerData } = require('node:worker_threads');
      const carrierMod = require(${JSON.stringify(path.join(__dirname, '../../server/agent/workerTraceCarrier'))});
      const restored = carrierMod.restoreTraceFromWorker(workerData);
      let inCtx = null;
      carrierMod.runInTraceContext(restored, () => {
        inCtx = { traceId: restored.traceId, requestId: restored.requestId };
      });
      parentPort.postMessage(inCtx);
    `;
    const result = await new Promise((resolve, reject) => {
      const w = new Worker(workerSrc, { eval: true, workerData: wd });
      w.on('message', resolve);
      w.on('error', reject);
      w.on('exit', (c) => { if (c !== 0) reject(new Error('exit ' + c)); });
    });
    assert.equal(result.traceId, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    assert.equal(result.requestId, 'req_roundtrip');
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});