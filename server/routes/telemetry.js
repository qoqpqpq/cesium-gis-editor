// server/routes/telemetry.js
// 周期 10 P1-2: client error telemetry 端点
//
// POST /api/telemetry/client-error
//   body: { kind, message, stack?, source?, url?, userAgent?, ts? }
//   response: { success: true, data: { recorded: true } }
//
// GET /api/telemetry/client-error/summary
//   query: ?since=ts&limit=100
//   response: { success: true, data: { total, byKind, bySource, oldest, newest } }
//
// localhost-only（与 /api/metrics 同源：trust proxy + IP allowlist）

const express = require('express');
const {
  recordClientError,
  getRecentClientErrors,
  getClientErrorSummary,
} = require('../middleware/telemetryCollector');

const router = express.Router();

// localhost-only middleware（cycle 8 P1-4 风格）
function localhostOnly(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || '';
  // trust proxy 1：可能拿到 ::ffff:127.0.0.1 / 127.0.0.1 / ::1
  const allowed = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!allowed) {
    return res.status(403).json({ success: false, message: 'telemetry endpoint is localhost-only' });
  }
  next();
}

router.use(localhostOnly);

// POST /api/telemetry/client-error
router.post('/client-error', express.json({ limit: '32kb' }), (req, res) => {
  const ok = recordClientError(req.body || {});
  if (!ok) {
    return res.status(400).json({ success: false, message: 'invalid payload (message required)' });
  }
  return res.json({ success: true, data: { recorded: true } });
});

// GET /api/telemetry/client-error/summary
router.get('/client-error/summary', (req, res) => {
  const limit = Number(req.query.limit) || 100;
  const items = getRecentClientErrors({ limit });
  const summary = getClientErrorSummary();
  return res.json({
    success: true,
    data: {
      total: summary.total,
      byKind: summary.byKind,
      bySource: summary.bySource,
      oldest: summary.oldest,
      newest: summary.newest,
      sample: items.slice(-10), // 最近 10 条样本
    },
  });
});

module.exports = router;
module.exports.localhostOnly = localhostOnly;