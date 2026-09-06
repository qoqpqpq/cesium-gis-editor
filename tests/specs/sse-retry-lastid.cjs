// tests/specs/sse-retry-lastid.cjs
// 周期 2 P1-3: SSE 协议补 retry / Last-Event-ID
//
// 背景：MDN EventSource 规范
//   - 启动时若收到 `retry: <ms>` 帧，浏览器把重连间隔改为该值（默认 3s）
//   - 每条带 `id: <x>` 帧的事件在断线时，浏览器会在重连请求里加 Last-Event-ID: <x>
//
// 修复：sseStreamHandler()
//   - startSse() 写 `retry: 3000` 帧
//   - 每条事件附递增 `id: <n>`（BigInt 字符串，避免 Number 截断）
//   - 启动时读 req.headers['last-event-id']，便于上层 buffer 续传
//
// 验收（不依赖 express，直接调用 sseStreamHandler 内部函数 + writeSse/startSse）：
//   - writeSse 输出含 `id: ` 帧
//   - startSse 输出 `retry: 3000` 帧
//   - event id 自增且唯一
//   - 收到 Last-Event-ID 时启动帧含 resumed 注释

'use strict';

const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { writeSse, startSse, nextEventId, RETRY_MS } = require('../../server/routes/_sse');

let pass = 0;
let fail = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { console.log(`  [PASS] ${name}`); pass++; })
    .catch((e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; });
}

function makeRes() {
  const res = new EventEmitter();
  const chunks = [];
  res.writableEnded = false;
  res.destroyed = false;
  const headers = {};
  res.setHeader = (k, v) => { headers[k.toLowerCase()] = v; };
  res.getHeader = (k) => headers[k.toLowerCase()];
  res.flushHeaders = () => {};
  res.write = (chunk) => { chunks.push(String(chunk)); return true; };
  res.end = () => { res.writableEnded = true; };
  res._chunks = chunks;
  res._headers = headers;
  return res;
}

function makeReq(headers = {}) {
  const req = new EventEmitter();
  req.headers = headers;
  req.ip = '127.0.0.1';
  req.socket = { remoteAddress: '127.0.0.1' };
  return req;
}

(async () => {
  console.log('=== sse-retry-lastid ===');

  // ---- 1. RETRY 常量 ----
  await test('RETRY_MS 默认 3000', () => {
    assert.strictEqual(RETRY_MS, 3000);
  });

  // ---- 2. writeSse 输出含 id 帧 ----
  await test('writeSse 带 eventId → 输出含 `id: ` 行', () => {
    const res = makeRes();
    writeSse(res, 'delta', { content: 'hi' }, '42');
    const out = res._chunks.join('');
    assert.match(out, /^id: 42\n/);
    assert.match(out, /event: delta\n/);
    assert.match(out, /data: \{"content":"hi"\}\n\n$/);
  });

  await test('writeSve 不带 eventId → 不输出 id 帧', () => {
    const res = makeRes();
    writeSse(res, 'done', { ok: true });
    const out = res._chunks.join('');
    assert.doesNotMatch(out, /^id: /m);
    assert.match(out, /event: done\n/);
  });

  // ---- 3. nextEventId 单调递增 ----
  await test('nextEventId 单调递增', () => {
    const a = nextEventId();
    const b = nextEventId();
    const c = nextEventId();
    assert.ok(BigInt(b) > BigInt(a), 'b > a');
    assert.ok(BigInt(c) > BigInt(b), 'c > b');
    assert.notStrictEqual(a, b);
    assert.notStrictEqual(b, c);
  });

  // ---- 4. startSse 写 retry 帧 ----
  await test('startSse 写 retry: 3000 帧', () => {
    const res = makeRes();
    startSse(res, null);
    const out = res._chunks.join('');
    assert.match(out, /^retry: 3000\n\n/);
  });

  await test('startSse 收到 Last-Event-ID → 写 resumed 注释', () => {
    const res = makeRes();
    startSse(res, '17');
    const out = res._chunks.join('');
    assert.match(out, /retry: 3000\n\n/);
    assert.match(out, /: resumed after last-event-id=17\n\n/);
  });

  await test('startSse 缺 Last-Event-ID → 不写 resumed', () => {
    const res = makeRes();
    startSse(res, '');
    const out = res._chunks.join('');
    assert.doesNotMatch(out, /resumed/);
  });

  // ---- 5. startSse 写必要 SSE 头 ----
  await test('startSse 设了 Content-Type/Cache-Control/Connection', () => {
    const res = makeRes();
    startSse(res, null);
    assert.match(res._headers['content-type'], /text\/event-stream/);
    assert.match(res._headers['cache-control'], /no-cache/);
    assert.strictEqual(res._headers['connection'], 'keep-alive');
  });

  // ---- 6. writeSse 在 writableEnded 后跳过 ----
  await test('writeSse writableEnded 后不写', () => {
    const res = makeRes();
    res.writableEnded = true;
    writeSse(res, 'done', { ok: true }, '1');
    assert.strictEqual(res._chunks.length, 0);
  });

  // ---- 7. 完整事件流：id 顺序严格递增 ----
  await test('完整事件流 id 严格递增', () => {
    const res = makeRes();
    startSse(res, null);
    const a = nextEventId();
    writeSse(res, 'queue_status', { n: 1 }, a);
    const b = nextEventId();
    writeSse(res, 'delta', { content: 'x' }, b);
    const c = nextEventId();
    writeSse(res, 'done', { ok: true }, c);
    const out = res._chunks.join('');
    const ids = [...out.matchAll(/^id: (\d+)$/gm)].map(m => BigInt(m[1]));
    assert.strictEqual(ids.length, 3);
    assert.ok(ids[1] > ids[0] && ids[2] > ids[1], '严格递增');
  });

  // ---- summary ----
  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})();
