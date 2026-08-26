// GIS 相关代理路由：
//   GET /api/gis/cesium-token   返回 Cesium Ion Access Token（域名绑定）
//   GET /api/gis/tdt-token      返回天地图 token（域名绑定）
//   GET /api/gis/config         返回 GIS 模块可用配置（哪些 provider 已启用）
//
// 设计目的：
// - 敏感 token 不下发到浏览器 localStorage，避免 XSS 窃取
// - 浏览器只是"代为渲染"，真正凭证在服务端 .env
// - 生产环境按 Origin/Referer 域名绑定，只允许自有页面内请求拿 token
//   外部 curl / 第三方网站嵌入拿不到

const express = require('express');
const router = express.Router();

// 允许的来源（与 index.js CORS 对齐）：
//   - env GIS_ALLOWED_ORIGINS（可选，逗号分隔）优先；其次 ALLOWED_ORIGINS
//   - 始终放行本机回环（localhost / 127.0.0.1）——本地部署直接可达，
//     且浏览器无法伪造回环来源（第三方站点嵌入拿不到）
//   - 独立开源版：默认只放行 localhost，生产环境请配 ALLOWED_ORIGINS
const ALWAYS_ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
function hostOf(origin) {
  const s = String(origin || '').trim().toLowerCase();
  if (!s) return null;
  try {
    return new URL(s.includes('://') ? s : 'https://' + s).hostname;
  } catch (_) {
    return s;
  }
}
const CONFIGURED_HOSTS = (process.env.GIS_ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(hostOf)
  .filter(Boolean);
const ALLOWED_HOSTS = CONFIGURED_HOSTS.length
  ? new Set([...CONFIGURED_HOSTS, ...ALWAYS_ALLOWED_HOSTS])
  : new Set([...ALWAYS_ALLOWED_HOSTS]);

function mask(t) {
  if (!t) return '';
  if (t.length <= 8) return '****';
  return t.slice(0, 4) + '****' + t.slice(-4);
}

function assertOrigin(req, res, next) {
  if (process.env.NODE_ENV !== 'production') return next();
  const ref = (req.get('origin') || req.get('referer') || '').toLowerCase();
  if (!ref) {
    return res.status(403).json({ success: false, message: 'origin not allowed' });
  }
  try {
    const host = new URL(ref).hostname;
    if (!ALLOWED_HOSTS.has(host)) {
      return res.status(403).json({ success: false, message: 'origin not allowed' });
    }
  } catch (_) {
    return res.status(403).json({ success: false, message: 'origin not allowed' });
  }
  next();
}

// GET /api/gis/cesium-token
// 返回：{ success, data: { token, enabled } }
// enabled=false 时前端走无 token fallback（仍可加载 OSM/Esri/高德等公开底图）
router.get('/cesium-token', assertOrigin, (req, res) => {
  const token = (process.env.CESIUM_ION_TOKEN || '').trim();
  res.json({
    success: true,
    data: {
      token,
      enabled: !!token,
    },
  });
});

// GET /api/gis/tdt-token
router.get('/tdt-token', assertOrigin, (req, res) => {
  const token = (process.env.TIANDITU_TOKEN || '').trim();
  res.json({
    success: true,
    data: {
      token,
      enabled: !!token,
    },
  });
});

// GET /api/gis/config
// 一次性返回所有可用 token / 状态；前端启动时一次拉取即可
router.get('/config', (req, res) => {
  const cesium = (process.env.CESIUM_ION_TOKEN || '').trim();
  const tdt = (process.env.TIANDITU_TOKEN || '').trim();
  res.json({
    success: true,
    data: {
      cesiumIon: { enabled: !!cesium, masked: mask(cesium) },
      tianDitu: { enabled: !!tdt, masked: mask(tdt) },
    },
  });
});

module.exports = router;