// server/routes/_sse.js
// 周期 1 P1-3: 抽出 SSE 流式公共封装，避免 chat/stream 与 agent 流式分支
// 重复 ~80 行（acquire permit / heartbeat / abort / 错误事件 / usage 事件 /
// permit.release）。
//
// 周期 2 P1-3 增量: 加 retry / Last-Event-ID
//   - 每条事件附 `id: <n>` 字段（递增 64-bit 字符串），浏览器断线重连
//     时会在请求头带上 Last-Event-ID=<n>，服务端可识别断点
//   - 启动时若收到 Last-Event-ID，从该 id 之后继续（依赖外部业务 buffer，
//     这里仅负责生成/暴露事件 id；buffer 维护留给上层）
//   - 启动时写 `retry: 3000`（毫秒）—— 浏览器默认 3s 间隔重连
//
// 用法（routes/ai.js 内的两个流式分支都可以替换为这一处调用）：
//   const { sseStreamHandler } = require('./_sse');
//   sseStreamHandler(req, res, {
//     platform,
//     run: ({ signal }) => aiService.chatStream(platform, messages, options, onDelta, signal, ...),
//     onFinalContent: (fullText) => { /* e.g. parse tool tags */ },
//     usageMeta: { sessionId, roundId },
//     source: 'stream' | 'agent-stream',
//   });
'use strict';

const aiConcurrency = require('../middleware/aiConcurrency');

const HEARTBEAT_MS = 15000;
const RETRY_MS = 3000;

// 事件 id 计数器（避免依赖外部传入；进程内单递增即可）
// 64-bit BigInt 字符串，避免被 JS Number 精度截断
let EVENT_COUNTER = 0n;
function nextEventId() {
  EVENT_COUNTER += 1n;
  return EVENT_COUNTER.toString();
}

function writeSse(res, event, data, eventId) {
  if (res.writableEnded || res.destroyed) return;
  try {
    let chunk = '';
    if (eventId) chunk += `id: ${eventId}\n`;
    chunk += `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    res.write(chunk);
  } catch (_) {
    /* swallow */
  }
}

function startSse(res, lastEventId) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  // 周期 2 P1-3: 启动时写 retry 指令 + 一个注释帧（让浏览器立即看到 retry 字段）
  try {
    res.write(`retry: ${RETRY_MS}\n\n`);
    if (lastEventId) {
      res.write(`: resumed after last-event-id=${lastEventId}\n\n`);
    }
  } catch (_) { /* ignore */ }
}

function acquirePermit(platform, signal) {
  return aiConcurrency.acquire(platform, { signal });
}

function makeAbortController(req) {
  const ac = new AbortController();
  let clientClosed = false;
  req.on('close', () => {
    clientClosed = true;
    try { ac.abort(); } catch (_) { /* ignore */ }
  });
  return { ac, isClosed: () => clientClosed };
}

function startHeartbeat(res, isClosed) {
  const t = setInterval(() => {
    if (isClosed() || res.writableEnded || res.destroyed) return;
    try { res.write(':keepalive\n\n'); } catch (_) { /* ignore */ }
  }, HEARTBEAT_MS);
  return t;
}

/**
 * SSE 流式 handler
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{
 *   platform: string,
 *   run: ({ signal, onDelta }) => Promise<{ platform, model, content, usage }>,
 *   onFinalContent?: (fullText: string) => any,
 *   onUsage?: (usageRecord) => any,
 *   sessionId?: string|null,
 *   roundId?: string|null,
 *   source?: string,
 * }} opts
 */
async function sseStreamHandler(req, res, opts) {
  const {
    platform,
    run,
    onFinalContent,
    onUsage,
    sessionId = null,
    roundId = null,
    source = 'stream',
  } = opts;
  // 周期 2 P1-3: 读取 Last-Event-ID 头（EventSource 断线重连会自动带）
  const lastEventId = (req.headers['last-event-id'] || '').toString().trim();
  startSse(res, lastEventId);
  const { ac, isClosed } = makeAbortController(req);
  const heartbeat = startHeartbeat(res, isClosed);

  let permit = null;
  try {
    permit = await acquirePermit(platform, ac.signal);
  } catch (e) {
    clearInterval(heartbeat);
    writeSse(res, 'error', {
      success: false,
      status: 429,
      message: e.message === 'queue_full' ? 'AI 服务繁忙，请稍后再试' : '请求已取消',
    }, nextEventId());
    try { res.end(); } catch (_) { /* ignore */ }
    return;
  }
  writeSse(res, 'queue_status', {
    inflight: aiConcurrency.getStats()[platform]?.inflight ?? null,
    waiting: aiConcurrency.getStats()[platform]?.waiting ?? null,
  }, nextEventId());

  const release = () => {
    clearInterval(heartbeat);
    if (permit) { try { permit.release(); } catch (_) {} permit = null; }
  };

  try {
    const result = await run({ signal: ac.signal, onDelta: (d) => writeSse(res, 'delta', { content: d }, nextEventId()) });
    writeSse(res, 'done', { platform: result.platform, model: result.model }, nextEventId());
    if (typeof onUsage === 'function') {
      const rec = onUsage(result);
      if (rec) writeSse(res, 'usage', { ...rec, sessionId, roundId }, nextEventId());
    }
    if (typeof onFinalContent === 'function') {
      const extra = onFinalContent(result.content || '');
      if (extra && Array.isArray(extra.toolCalls) && extra.toolCalls.length > 0) {
        writeSse(res, 'tool_calls', { toolCalls: extra.toolCalls }, nextEventId());
      }
    }
    try { res.end(); } catch (_) { /* ignore */ }
  } catch (e) {
    // 周期 2 P0-5: 把 e.status 透传给客户端（默认 500），便于前端 alert 区分
    //   客户端错（如未知 platform 4xx）也走 error 事件，UI 自行决定提示级别
    if (!isClosed()) writeSse(res, 'error', { message: e.message, status: e.status || 500 }, nextEventId());
    try { res.end(); } catch (_) { /* ignore */ }
  } finally {
    release();
    void source;
  }
}

module.exports = { sseStreamHandler, writeSse, startSse, makeAbortController, startHeartbeat, nextEventId, RETRY_MS };
