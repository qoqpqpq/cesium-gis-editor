// server/routes/_sse.js
// 周期 1 P1-3: 抽出 SSE 流式公共封装，避免 chat/stream 与 agent 流式分支
// 重复 ~80 行（acquire permit / heartbeat / abort / 错误事件 / usage 事件 /
// permit.release）。
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

function writeSse(res, event, data) {
  if (res.writableEnded || res.destroyed) return;
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch (_) {
    /* swallow */
  }
}

function startSse(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
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
  startSse(res);
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
    });
    try { res.end(); } catch (_) { /* ignore */ }
    return;
  }
  writeSse(res, 'queue_status', {
    inflight: aiConcurrency.getStats()[platform]?.inflight ?? null,
    waiting: aiConcurrency.getStats()[platform]?.waiting ?? null,
  });

  const release = () => {
    clearInterval(heartbeat);
    if (permit) { try { permit.release(); } catch (_) {} permit = null; }
  };

  try {
    const result = await run({ signal: ac.signal, onDelta: (d) => writeSse(res, 'delta', { content: d }) });
    writeSse(res, 'done', { platform: result.platform, model: result.model });
    if (typeof onUsage === 'function') {
      const rec = onUsage(result);
      if (rec) writeSse(res, 'usage', { ...rec, sessionId, roundId });
    }
    if (typeof onFinalContent === 'function') {
      const extra = onFinalContent(result.content || '');
      if (extra && Array.isArray(extra.toolCalls) && extra.toolCalls.length > 0) {
        writeSse(res, 'tool_calls', { toolCalls: extra.toolCalls });
      }
    }
    try { res.end(); } catch (_) { /* ignore */ }
  } catch (e) {
    // 周期 2 P0-5: 把 e.status 透传给客户端（默认 500），便于前端 alert 区分
    //   客户端错（如未知 platform 4xx）也走 error 事件，UI 自行决定提示级别
    if (!isClosed()) writeSse(res, 'error', { message: e.message, status: e.status || 500 });
    try { res.end(); } catch (_) { /* ignore */ }
  } finally {
    release();
    void source;
  }
}

module.exports = { sseStreamHandler, writeSse, startSse, makeAbortController, startHeartbeat };
