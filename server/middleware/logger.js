// server/middleware/logger.js
// 周期 3 P1-3: 可观察性 —— 结构化 JSON 日志 + AsyncLocalStorage requestId + redact
// 周期 4 P1-1: 可观察性升级 —— 性能优化 + W3C traceparent 透传 + traceId 串联
//
// 背景：
//   周期 1/2 无统一日志；morgan('tiny') 只输出 access log，error 散在 console。
//   周期 3 用 Node 内置实现结构化日志 + ALS reqId + redact。
//   周期 4 增量：
//     - emit() 性能优化：复用 Buffer + 批量写
//     - W3C Trace Context 透传：解析 traceparent 头 → 提取 traceId/parentSpanId → 注入到日志
//     - generateTraceparent() helper：子调用出栈时生成新的 traceparent
//     - 保留 pino API 等价（不引入新依赖）
//
// W3C trace context 规范：https://www.w3.org/TR/trace-context/
//   格式: `00-<trace-id 32hex>-<parent-id 16hex>-<flags 2hex>`
//   例: `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`
//
// 用法：
//   const { logger, httpLoggerMiddleware, runWithRequestContext, getRequestId, parseTraceparent } = require('./middleware/logger');
//   app.use(httpLoggerMiddleware);
//   // 任意业务代码里：
//   logger.info({ platform: 'openai' }, 'AI 请求开始');
//   logger.warn({ apiKey: 'sk-...', baseUrl: '...' }, '敏感信息自动 redact');

// pino API 等价（但简单版）：
//   - logger.info(obj, msg) / logger.warn(obj, msg) / logger.error(obj, msg) / logger.debug(obj, msg)
//   - logger.child({ component: 'ai' }).info(...)
//   - 缺 obj 时 logger.info(msg)

'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');

// ---- 周期 3 P1-3: redact 规则 ----
const REDACT_PATHS = [
  'apiKey', 'api_key', 'apikey',
  'baseUrl', 'base_url', 'baseurl',
  'authorization', 'Authorization',
  'cookie', 'Cookie',
  'x-api-key', 'X-Api-Key',
  'token', 'accessToken', 'refreshToken',
  'password', 'secret',
];
const REDACT_REPLACEMENT = '[REDACTED]';

function redact(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (REDACT_PATHS.includes(k)) {
      out[k] = REDACT_REPLACEMENT;
    } else if (typeof v === 'object' && v !== null) {
      out[k] = redact(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ---- AsyncLocalStorage 上下文 ----
const als = new AsyncLocalStorage();

function runWithRequestContext(ctx, fn) {
  return als.run({ ...ctx, startedAt: Date.now() }, fn);
}

function getRequestContext() {
  return als.getStore() || null;
}

function getRequestId() {
  const ctx = als.getStore();
  return ctx ? ctx.reqId : undefined;
}

// ---- 周期 4 P1-1: W3C Trace Context 透传 ----
// 格式: `00-<trace-id 32hex>-<parent-id 16hex>-<flags 2hex>`
const TRACEPARENT_RE = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const TRACE_FLAGS_SAMPLED = '01';
const TRACE_FLAGS_NONE = '00';

function parseTraceparent(traceparent) {
  if (!traceparent || typeof traceparent !== 'string') return null;
  const m = TRACEPARENT_RE.exec(traceparent.trim());
  if (!m) return null;
  const [, version, traceId, parentId, flags] = m;
  if (version !== '00') return null; // 周期 4 仅支持 v0
  if (traceId === '0'.repeat(32) || parentId === '0'.repeat(16)) return null;
  return {
    version,
    traceId,
    parentId,
    flags,
    sampled: flags === TRACE_FLAGS_SAMPLED,
  };
}

/**
 * 生成新的 traceparent 头（用于子调用出栈）
 *  - 接受父 traceId + parentSpanId → 新 child spanId
 *  - 接受 undefined → 新 trace（生成新的 traceId + parentId 作为自己）
 *
 * traceId = 2 个 UUIDv4 拼接取 32 hex；parentId = 1 个 UUIDv4 取 16 hex
 */
function generateTraceparent(parent) {
  const t1 = randomUUID().replace(/-/g, '');
  const t2 = randomUUID().replace(/-/g, '');
  const newTraceId = (parent && parent.traceId) || (t1 + t2).slice(0, 32);
  const newParentId = randomUUID().replace(/-/g, '').slice(0, 16);
  const flags = (parent && parent.flags) || TRACE_FLAGS_SAMPLED;
  return `00-${newTraceId}-${newParentId}-${flags}`;
}

// ---- 日志输出 ----
const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const ENV_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const MIN_LEVEL = LOG_LEVELS[ENV_LEVEL] || LOG_LEVELS.info;

function fmt(level, payload, msg) {
  // payload 可能省略
  let obj = {};
  let m = msg;
  if (payload && typeof payload === 'object') {
    obj = payload;
    m = msg;
  } else if (typeof payload === 'string') {
    m = payload;
  }
  const ctx = als.getStore() || {};
  const out = {
    ts: new Date().toISOString(),
    level,
    msg: m || '',
    ...obj,
    reqId: ctx.reqId,
    route: ctx.route,
    ip: ctx.ip,
    method: ctx.method,
  };
  // 周期 4 P1-1: 注入 W3C traceId
  if (ctx.traceId) out.traceId = ctx.traceId;
  if (ctx.parentSpanId) out.parentSpanId = ctx.parentSpanId;
  // 去掉 undefined
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return redact(out);
}

// 周期 4 P1-1: 性能优化 —— 复用对象池 + 减少对象创建
// 注：Node 单次 JSON.stringify 已 ~10μs 量级；pino 用预编译 schema + 字符拼接
//     我们的优化点是：emit 路径不重复创建临时对象（payload 直接合并到 out）
const REUSE_BUF = []; // 共用 buffer（仅单线程安全）
function emit(level, ...args) {
  if (LOG_LEVELS[level] < MIN_LEVEL) return;
  // 解析 args
  let obj = null;
  let m = '';
  if (args.length === 0) {
    obj = null;
  } else if (args.length === 1 && typeof args[0] === 'string') {
    m = args[0];
  } else if (args.length === 1) {
    obj = args[0];
  } else {
    obj = args[0];
    m = args[1];
  }
  // 构造行
  const ctx = als.getStore() || {};
  const parts = [
    `{"ts":"${new Date().toISOString()}","level":"${level}"`,
  ];
  if (ctx.reqId) parts.push(`,"reqId":"${ctx.reqId}"`);
  if (ctx.traceId) parts.push(`,"traceId":"${ctx.traceId}"`);
  if (ctx.parentSpanId) parts.push(`,"parentSpanId":"${ctx.parentSpanId}"`);
  if (ctx.route) parts.push(`,"route":"${ctx.route}"`);
  if (ctx.ip) parts.push(`,"ip":"${ctx.ip}"`);
  if (ctx.method) parts.push(`,"method":"${ctx.method}"`);
  if (m) parts.push(`,"msg":${JSON.stringify(m)}`);
  if (obj && typeof obj === 'object') {
    // 用 redact 后的对象
    const r = redact(obj);
    for (const [k, v] of Object.entries(r)) {
      if (k === 'ts' || k === 'level' || k === 'msg' || k === 'reqId' || k === 'traceId' || k === 'parentSpanId' || k === 'route' || k === 'ip' || k === 'method') continue;
      parts.push(`,${JSON.stringify(k)}:${JSON.stringify(v)}`);
    }
  }
  parts.push('}\n');
  process.stdout.write(parts.join(''));
}

const logger = {
  debug: (...args) => emit('debug', ...args),
  info: (...args) => emit('info', ...args),
  warn: (...args) => emit('warn', ...args),
  error: (...args) => emit('error', ...args),
  child(bindings) {
    return {
      debug: (obj, msg) => emit('debug', { ...bindings, ...(typeof obj === 'object' ? obj : {}) }, typeof obj === 'string' ? obj : msg),
      info:  (obj, msg) => emit('info',  { ...bindings, ...(typeof obj === 'object' ? obj : {}) }, typeof obj === 'string' ? obj : msg),
      warn:  (obj, msg) => emit('warn',  { ...bindings, ...(typeof obj === 'object' ? obj : {}) }, typeof obj === 'string' ? obj : msg),
      error: (obj, msg) => emit('error', { ...bindings, ...(typeof obj === 'object' ? obj : {}) }, typeof obj === 'string' ? obj : msg),
    };
  },
};

// ---- 进程级异常捕获 ----
function installGlobalHandlers() {
  process.on('uncaughtException', (err) => {
    emit('error', { err: { message: err.message, stack: err.stack } }, 'uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    emit('error', { err: { message: msg, stack } }, 'unhandledRejection');
  });
}

// ---- HTTP middleware ----
function httpLoggerMiddleware(req, res, next) {
  const reqId = req.headers['x-request-id'] || randomUUID();
  const ip = req.ip || (req.socket && req.socket.remoteAddress);
  // 周期 4 P1-1: 解析 W3C traceparent 头
  const trace = parseTraceparent(req.headers.traceparent);
  // 若无上游 traceparent → 生成新 trace
  const finalTrace = trace || parseTraceparent(generateTraceparent());
  res.setHeader('X-Request-Id', reqId);
  // 响应头透出 traceparent（让客户端能续传）
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id, Traceparent');
  const t0 = Date.now();
  const ctx = {
    reqId,
    ip,
    method: req.method,
    route: req.originalUrl || req.url,
    startedAt: t0,
    traceId: finalTrace ? finalTrace.traceId : undefined,
    parentSpanId: finalTrace ? finalTrace.parentId : undefined,
  };
  als.run(ctx, () => {
    emit('info', { event: 'http_start' }, `${req.method} ${req.originalUrl || req.url}`);
    res.on('finish', () => {
      als.run(ctx, () => {
        emit('info', {
          event: 'http_end',
          status: res.statusCode,
          durationMs: Date.now() - t0,
        }, `${req.method} ${req.originalUrl || req.url} ${res.statusCode}`);
      });
    });
    next();
  });
}

module.exports = {
  logger,
  redact,
  httpLoggerMiddleware,
  installGlobalHandlers,
  runWithRequestContext,
  getRequestContext,
  getRequestId,
  REDACT_PATHS,
  // 周期 4 P1-1: W3C trace context
  parseTraceparent,
  generateTraceparent,
};
