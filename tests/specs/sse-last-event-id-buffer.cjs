// tests/specs/sse-last-event-id-buffer.cjs
// 周期 4 P2-2: SSE Last-Event-ID buffer 续传
//
// 背景：
//   - 周期 2 P1-3 加了 retry + Last-Event-ID：每条事件附 id 字段，浏览器断线
//     重连自动带 Last-Event-ID=<n>
//   - 但服务端只"接收" Last-Event-ID，并未真"续传"——需要外部业务自己维护
//     buffer 并把历史事件接上去
//   - 周期 4 把 buffer 维护下沉到 sseStreamHandler：接受可选 bufferProvider
//
// 验收：
//   1. writeSse 事件带 id
//   2. replaySseEvents 写出多事件（带正确 id）
//   3. sseStreamHandler 不带 bufferProvider + 不带 Last-Event-ID → 仍正常
//   4. sseStreamHandler 带 bufferProvider + Last-Event-ID=5 → 回放 id > 5 的事件
//   5. sseStreamHandler bufferProvider.getSince 抛错 → 主流程不中断
//   6. 源文件含 bufferProvider 字段
//   7. 源文件含 replaySseEvents 函数

'use strict';

const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

const { writeSse, replaySseEvents, sseStreamHandler } = require('../../server/routes/_sse');
const SESSION_SRC = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'server', 'routes', '_sse.js'),
  'utf8',
);

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

// mock express res — 收集所有 write() 的 chunk
function makeRes() {
  const res = new EventEmitter();
  const chunks = [];
  res.writableEnded = false;
  res.destroyed = false;
  res.write = (c) => { chunks.push(c); return true; };
  res.end = () => { res.writableEnded = true; res.emit('finish'); };
  res.setHeader = () => {};
  res.flushHeaders = () => {};
  res.status = () => res;
  res.json = () => res;
  res._chunks = chunks;
  return res;
}

function makeReq(headers = {}) {
  const r = new EventEmitter();
  r.headers = headers;
  return r;
}

(async () => {
  console.log('=== sse-last-event-id-buffer ===');

  // ---- 1. writeSse ----
  await test('writeSse 带 id 字段', () => {
    const res = makeRes();
    writeSse(res, 'delta', { content: 'hi' }, '42');
    const out = res._chunks.join('');
    assert.match(out, /^id: 42\n/);
    assert.match(out, /event: delta\n/);
    assert.match(out, /data: \{"content":"hi"\}\n\n$/);
  });

  await test('writeSse 不带 id 字段', () => {
    const res = makeRes();
    writeSse(res, 'done', { ok: true });
    const out = res._chunks.join('');
    assert.ok(!/^id:/.test(out));
    assert.match(out, /event: done\n/);
  });

  // ---- 2. replaySseEvents ----
  await test('replaySseEvents 回放多事件（按数组顺序）', () => {
    const res = makeRes();
    replaySseEvents(res, [
      { event: 'delta', data: { content: 'A' }, id: '10' },
      { event: 'delta', data: { content: 'B' }, id: '11' },
      { event: 'done', data: { ok: true }, id: '12' },
    ]);
    const out = res._chunks.join('');
    assert.match(out, /id: 10\n/);
    assert.match(out, /id: 11\n/);
    assert.match(out, /id: 12\n/);
    // 顺序：10 在 11 之前
    assert.ok(out.indexOf('id: 10') < out.indexOf('id: 11'));
    assert.ok(out.indexOf('id: 11') < out.indexOf('id: 12'));
  });

  await test('replaySseEvents 空数组不报错', () => {
    const res = makeRes();
    replaySseEvents(res, []);
    assert.strictEqual(res._chunks.length, 0);
  });

  await test('replaySseEvents 非数组不报错', () => {
    const res = makeRes();
    replaySseEvents(res, null);
    replaySseEvents(res, undefined);
    assert.strictEqual(res._chunks.length, 0);
  });

  // ---- 3. sseStreamHandler 集成 ----
  await test('sseStreamHandler 无 bufferProvider + 无 Last-Event-ID → 正常实时流', async () => {
    const res = makeRes();
    const req = makeReq({});
    let runCalled = false;
    await sseStreamHandler(req, res, {
      platform: 'openai',
      run: async () => { runCalled = true; return { platform: 'openai', model: 'm', content: 'hi' }; },
    });
    assert.ok(runCalled);
    // 至少要写出 'done' 事件
    const out = res._chunks.join('');
    assert.match(out, /event: done/);
  });

  await test('sseStreamHandler 带 Last-Event-ID 但无 bufferProvider → 不回放（向后兼容）', async () => {
    const res = makeRes();
    const req = makeReq({ 'last-event-id': '5' });
    let runCalled = false;
    await sseStreamHandler(req, res, {
      platform: 'openai',
      run: async () => { runCalled = true; return { platform: 'openai', model: 'm', content: 'hi' }; },
    });
    assert.ok(runCalled);
    const out = res._chunks.join('');
    assert.match(out, /event: done/);
  });

  await test('sseStreamHandler 带 bufferProvider + Last-Event-ID=10 → 调用 getSince(10)', async () => {
    const res = makeRes();
    const req = makeReq({ 'last-event-id': '10' });
    const past = [
      { event: 'delta', data: { content: 'replayed1' }, id: '11' },
      { event: 'delta', data: { content: 'replayed2' }, id: '12' },
    ];
    let getSinceCalledWith = null;
    let runCalled = false;
    await sseStreamHandler(req, res, {
      platform: 'openai',
      bufferProvider: { getSince: async (lastId) => { getSinceCalledWith = lastId; return past; } },
      run: async () => { runCalled = true; return { platform: 'openai', model: 'm', content: 'live' }; },
    });
    assert.strictEqual(getSinceCalledWith, '10', 'getSince 应被调用，参数为 Last-Event-ID');
    assert.ok(runCalled, 'run 仍应被调用（主流程不中断）');
    const out = res._chunks.join('');
    // 回放的事件要在 live 事件之前
    const replayedIdx = out.indexOf('replayed1');
    const doneIdx = out.indexOf('event: done');
    assert.ok(replayedIdx > 0, 'replayed1 应出现在输出');
    assert.ok(doneIdx > 0, 'done 应出现');
    assert.ok(replayedIdx < doneIdx, '回放事件应在 done 之前');
  });

  await test('sseStreamHandler bufferProvider.getSince 抛错 → 主流程不中断', async () => {
    const res = makeRes();
    const req = makeReq({ 'last-event-id': '5' });
    let runCalled = false;
    await sseStreamHandler(req, res, {
      platform: 'openai',
      bufferProvider: { getSince: async () => { throw new Error('buffer down'); } },
      run: async () => { runCalled = true; return { platform: 'openai', model: 'm', content: 'hi' }; },
    });
    assert.ok(runCalled, 'getSince 抛错后 run 仍应被调用');
    const out = res._chunks.join('');
    assert.match(out, /event: done/, 'done 事件应仍写出');
  });

  await test('sseStreamHandler bufferProvider.getSince 返回空数组 → 不写多余事件', async () => {
    const res = makeRes();
    const req = makeReq({ 'last-event-id': '5' });
    await sseStreamHandler(req, res, {
      platform: 'openai',
      bufferProvider: { getSince: async () => [] },
      run: async () => ({ platform: 'openai', model: 'm', content: 'hi' }),
    });
    const out = res._chunks.join('');
    assert.ok(!/replayed/.test(out));
    assert.match(out, /event: done/);
  });

  await test('sseStreamHandler bufferProvider.getSince 不是函数 → 不调用', async () => {
    const res = makeRes();
    const req = makeReq({ 'last-event-id': '5' });
    let runCalled = false;
    await sseStreamHandler(req, res, {
      platform: 'openai',
      bufferProvider: { getSince: 'not-a-fn' },
      run: async () => { runCalled = true; return { platform: 'openai', model: 'm', content: 'hi' }; },
    });
    assert.ok(runCalled, '非 getSince 函数 → 不回放但 run 仍跑');
  });

  // ---- 4. 源文件检查 ----
  await test('源文件导出 replaySseEvents', () => {
    assert.match(SESSION_SRC, /module\.exports[\s\S]*replaySseEvents/);
  });
  await test('源文件接受 bufferProvider 参数', () => {
    assert.match(SESSION_SRC, /bufferProvider/);
  });
  await test('源文件在 Last-Event-ID 非空时调 getSince', () => {
    assert.match(SESSION_SRC, /lastEventId\s*&&\s*bufferProvider[\s\S]*getSince/);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});