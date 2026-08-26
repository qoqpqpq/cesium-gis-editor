// 限流配置
// - 全局 API 限流：宽松（防止全站被打挂）
// - AI 路由限流：更严（防止 LLM / 联网搜索配额被烧光）
// - 本地/loopback 默认不计入
const rateLimit = require('express-rate-limit');

function isLocal(req) {
  const ip = (req.ip || req.socket.remoteAddress || '').toString();
  return (
    ip === '::1' ||
    ip === '127.0.0.1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('172.16.')
  );
}

function skipLocal(handler) {
  return (req) => !isLocal(req) && handler(req);
}

/**
 * 全局 API 限流：每 IP 600 次 / 10 分钟
 * - 用于 /api/* 健康路径以外的常规接口（content / weather / settings）
 */
const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => isLocal(req),
  message: { success: false, message: '请求过于频繁，请稍后重试' },
});

/**
 * AI 路由限流：每 IP 60 次 / 分钟（chat / recommend / keys 等）
 * - recommend 会触发联网搜索 + LLM，最贵，独立更严
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => isLocal(req),
  message: { success: false, message: 'AI 请求过于频繁，请稍后重试' },
});

/**
 * recommend 端点特别限流：10 次 / 分钟
 * - 联网搜索 + AI 完整调用，最容易烧配额
 */
const recommendLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => isLocal(req),
  message: { success: false, message: '推荐请求过于频繁，请稍后重试' },
});

/**
 * 空间运算端点限流：30 次 / 分钟
 * - CPU 密集（Turf polygon-clipping 是 O(n*m)）
 * - 单次可能阻塞事件循环数百 ms，限制频次防雪崩
 */
const spatialLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => isLocal(req),
  message: { success: false, message: '空间运算请求过于频繁，请稍后重试' },
});

/**
 * 每日配额：每 IP N 次 / 24 小时（防烧 AI 配额 / 钱）
 * - N 默认 500，可通过环境变量 AI_DAILY_QUOTA 覆盖
 * - 仅作用于非本地 IP（dev 放行）
 * - 实际存储用 express-rate-limit 默认 memory store（重启清零；
 *   生产环境升级 Redis store 才能跨实例精确限流）
 */
const dailyAIBudget = parseInt(process.env.AI_DAILY_QUOTA || '500', 10);
const aiDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: dailyAIBudget,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => isLocal(req),
  message: {
    success: false,
    message: `今日 AI 调用配额已用完（每 IP 每天 ${dailyAIBudget} 次），请明日再试或联系管理员提高配额`,
  },
});

module.exports = {
  apiLimiter, aiLimiter, recommendLimiter, spatialLimiter, aiDailyLimiter, isLocal,
};
