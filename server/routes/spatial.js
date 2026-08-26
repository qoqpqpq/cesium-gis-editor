// server/routes/spatial.js
// 空间叠加运算端点
// - 故意不挂 requireAdmin —— 只读计算，无数据暴露
// - AI agent 可直接调用
// - 单请求 body 5 MB（仅本路由放宽，全局仍 2 MB）
// - 30 秒超时 + 堆 80% 时 503，避免大文件饿死整个 Node 进程

const express = require('express');
const router = express.Router();

const spatial = require('../services/spatial');
const { spatialLimiter } = require('../middleware/rateLimit');

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_BODY = '5mb';
// 堆比例检查：默认关。开发机 V8 基线就 0.65+，假阳性太多。
// 启用方法：env SPATIAL_HEAP_CHECK=1（生产可考虑开）。
const HEAP_LIMIT_RATIO = 0.95;
const HEAP_CHECK_ENABLED = process.env.SPATIAL_HEAP_CHECK === '1';

// 双 layer 输入（{layerA, layerB}）
const DOUBLE_OPS = new Set(['intersect', 'difference', 'union']);
// 单 layer + groupBy（dissolve 不传 groupBy 时降级为 union）
const DISSOLVE_OP = 'dissolve';
// 单 layer 输入 + 额外参数
const SINGLE_LAYER_OPS = new Set(['centroid', 'convexHull']);
const BUFFER_OP = 'buffer';

const bigJson = express.json({ limit: MAX_BODY });

function checkHeap(req, res, next) {
  if (!HEAP_CHECK_ENABLED) return next();
  const m = process.memoryUsage();
  if (m.heapUsed / m.heapTotal > HEAP_LIMIT_RATIO) {
    return res.status(503).json({
      success: false,
      message: '服务暂忙，请稍后重试',
    });
  }
  next();
}

function withTimeout(req, res, next) {
  req.setTimeout(REQUEST_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      res.status(503).json({
        success: false,
        message: `运算超时（>${REQUEST_TIMEOUT_MS / 1000}s），请减小输入`,
      });
    }
  });
  next();
}

function makeHandler(op) {
  return (req, res) => {
    const t0 = Date.now();
    try {
      const body = req.body || {};
      let result;

      if (DOUBLE_OPS.has(op)) {
        const { layerA, layerB } = body;
        if (!layerA || !layerB) {
          return res.status(400).json({
            success: false,
            message: '请求体需要 layerA 和 layerB 两个 GeoJSON 输入',
          });
        }
        result = spatial[op](layerA, layerB);
      } else if (op === DISSOLVE_OP) {
        // 双 layer 入口 + 可选 groupBy
        const { layerA, layerB, groupBy } = body;
        if (!layerA || !layerB) {
          return res.status(400).json({
            success: false,
            message: '请求体需要 layerA 和 layerB 两个 GeoJSON 输入',
          });
        }
        result = spatial.dissolve(layerA, layerB, { groupBy });
      } else if (op === BUFFER_OP) {
        const { layer, distance } = body;
        if (!layer) {
          return res.status(400).json({
            success: false,
            message: '请求体需要 layer GeoJSON 输入',
          });
        }
        result = spatial.buffer(layer, distance);
      } else if (SINGLE_LAYER_OPS.has(op)) {
        const { layer } = body;
        if (!layer) {
          return res.status(400).json({
            success: false,
            message: '请求体需要 layer GeoJSON 输入',
          });
        }
        result = spatial[op](layer);
      } else {
        return res.status(400).json({
          success: false,
          message: `未知 op: ${op}`,
        });
      }

      const ms = Date.now() - t0;
      console.log(`[spatial] ${op} ok, ms=${ms}`);
      return res.json({ success: true, data: result });
    } catch (e) {
      const ms = Date.now() - t0;
      const status = e.status || 500;
      const message =
        status === 500
          ? '服务器内部错误（可能是输入几何无效或自相交）'
          : e.message;
      console.error(`[spatial] ${op} failed, ms=${ms}, status=${status}:`, e.message);
      return res.status(status).json({ success: false, message });
    }
  };
}

// ---- 路由注册 ----
const mw = [spatialLimiter, bigJson, checkHeap, withTimeout];
router.post('/intersect',  ...mw, makeHandler('intersect'));
router.post('/difference', ...mw, makeHandler('difference'));
router.post('/union',      ...mw, makeHandler('union'));
router.post('/dissolve',   ...mw, makeHandler('dissolve'));
router.post('/buffer',     ...mw, makeHandler('buffer'));
router.post('/centroid',   ...mw, makeHandler('centroid'));
router.post('/convexHull', ...mw, makeHandler('convexHull'));

module.exports = router;