// server/middleware/permissionsPolicy.js
// 周期 9 P2-2: 自研 Permissions-Policy middleware（helmet 8.x 不输出该 header，关键发现：周期 8 P2-2 验证）
//
// 背景：
//   - helmet ^8.3.0 在本项目实测不输出 Permissions-Policy header（周期 8 P2-2 验证）
//   - 但 OWASP HTTP Headers Cheat Sheet 强烈建议输出 Permissions-Policy
//   - Cesium GIS Editor 需要 fullscreen=self + 关掉其他敏感 API
//
// 设计：
//   - Express middleware 输出 Permissions-Policy header
//   - 默认 20 项策略（与周期 3 P1-1 手写内容一致）
//   - 允许配置覆盖（opts.policies）
//   - 不破坏 helmet 8.x 其他功能
//
// 周期 9 范围：
//   - 默认策略集（20 项）
//   - opts 覆盖
//   - 已应用于 server/index.js 替代手写 middleware

'use strict';

const DEFAULT_POLICIES = [
  'accelerometer=()',
  'autoplay=(self)',
  'camera=()',
  'cross-origin-isolated=()',
  'display-capture=()',
  'encrypted-media=()',
  'fullscreen=(self)',
  'geolocation=()',
  'gyroscope=()',
  'keyboard-map=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'picture-in-picture=()',
  'publickey-credentials-get=(self)',
  'screen-wake-lock=(self)',
  'sync-xhr=()',
  'usb=()',
  'xr-spatial-tracking=()',
];

let _cachedHeader = null;
let _cachedOpts = null;

/**
 * 周期 9 P2-2: Permissions-Policy middleware
 * @param {object} [opts]
 * @param {string[]} [opts.policies] - 自定义策略数组（覆盖默认 20 项）
 * @param {boolean} [opts.disable] - true 时不输出 header（用于测试）
 * @returns {Function} Express middleware
 */
function permissionsPolicy(opts = {}) {
  const policies = Array.isArray(opts.policies) && opts.policies.length > 0 ? opts.policies : DEFAULT_POLICIES;
  // 缓存 header value（避免每次请求重建字符串）
  if (_cachedHeader === null || _cachedOpts !== opts) {
    _cachedHeader = policies.join(', ');
    _cachedOpts = opts;
  }
  const headerValue = opts.disable ? null : _cachedHeader;
  return function permissionsPolicyMiddleware(req, res, next) {
    if (headerValue !== null) {
      res.setHeader('Permissions-Policy', headerValue);
    }
    next();
  };
}

/**
 * 重置缓存（测试用 + 配置文件 reload 时）
 */
function _resetHeaderCache() {
  _cachedHeader = null;
  _cachedOpts = null;
}

/**
 * 获取默认策略（测试用）
 */
function _getDefaultPolicies() {
  return [...DEFAULT_POLICIES];
}

module.exports = permissionsPolicy;
module.exports.default = permissionsPolicy;
module.exports._resetHeaderCache = _resetHeaderCache;
module.exports._getDefaultPolicies = _getDefaultPolicies;
module.exports.DEFAULT_POLICIES = DEFAULT_POLICIES;