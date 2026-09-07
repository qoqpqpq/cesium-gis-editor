// server/middleware/logger.js
// 周期 3 P1-3: 可观察性 —— 结构化 JSON 日志 + AsyncLocalStorage requestId + redact
//
// 背景：周期 1/2 无统一日志；morgan('tiny') 只输出 access log，error 散在 console。
//   本周期用 Node 内置（无 pino 新依赖）实现：
//     - 结构化 JSON 日志（每行一个 JSON 对象，含 ts/level/msg/reqId/...）
//     - AsyncLocalStorage 跨 await 串联 requestId
//     - redact apiKey / baseUrl / authorization / cookie 字段
//     - 自动 capture unhandledRejection / uncaughtException
//     - 提供 httpLoggerMiddleware(req, res, next) 注入 reqId + 访问日志
//
// 用法：
//   const { logger, httpLoggerMiddleware, runWithRequestContext, getRequestId } = require('./middleware/logger');
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
  // 去掉 undefined
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return redact(out);
}

function emit(level, ...args) {
  if (LOG_LEVELS[level] < MIN_LEVEL) return;
  let out;
  try {
    if (args.length === 0) out = fmt(level, {}, '');
    else if (args.length === 1 && typeof args[0] === 'string') out = fmt(level, {}, args[0]);
    else if (args.length === 1) out = fmt(level, args[0], '');
    else out = fmt(level, args[0], args[1]);
  } catch (e) {
    out = { ts: new Date().toISOString(), level, msg: '日志序列化失败: ' + e.message };
  }
  // 输出：JSON 行（process.stdout.write 在 Node 默认 line-buffered，对单进程测试足够同步）
  process.stdout.write(JSON.stringify(out) + '\n');
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
  res.setHeader('X-Request-Id', reqId);
  const t0 = Date.now();
  // 保存 ctx 引用（因为 finish 事件在 als.run 外面触发）
  const ctx = { reqId, ip, method: req.method, route: req.originalUrl || req.url, startedAt: t0 };
  als.run(ctx, () => {
    emit('info', { event: 'http_start' }, `${req.method} ${req.originalUrl || req.url}`);
    res.on('finish', () => {
      // 临时恢复 ctx 让 emit 取到 reqId
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
};
