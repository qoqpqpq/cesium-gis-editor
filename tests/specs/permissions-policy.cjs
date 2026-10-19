// tests/specs/permissions-policy.cjs
// 周期 19 R4: permissionsPolicy.js 权限策略测试
// 目标：≥ 15 PASS
//
// 覆盖：
//   - DEFAULT_POLICIES 默认策略集
//   - permissionsPolicy middleware 工厂函数
//   - 缓存机制（_cachedHeader/_cachedOpts）
//   - _resetHeaderCache 重置缓存
//   - _getDefaultPolicies 获取默认策略
//   - opts.policies 自定义策略覆盖
//   - opts.disable 禁用 header

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const PERMISSIONS_SRC = fs.readFileSync(path.join(ROOT, 'server/middleware/permissionsPolicy.js'), 'utf8');

let pass = 0;
let fail = 0;

function ok(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      pass += 1;
      console.log(`  [PASS] ${label}`);
    })
    .catch((e) => {
      fail += 1;
      console.error(`  [FAIL] ${label}: ${e.message}`);
    });
}

(async function main() {
  console.log('=== permissions-policy ===');

  // ============ Group A: 静态扫描 - 导出验证 ============
  await ok('A1: 导出 permissionsPolicy 函数', () => {
    assert.match(PERMISSIONS_SRC, /function\s+permissionsPolicy/);
  });
  await ok('A2: 导出 default', () => {
    assert.match(PERMISSIONS_SRC, /module\.exports\.default\s*=\s*permissionsPolicy/);
  });
  await ok('A3: 导出 _resetHeaderCache', () => {
    assert.match(PERMISSIONS_SRC, /module\.exports\._resetHeaderCache\s*=\s*_resetHeaderCache/);
  });
  await ok('A4: 导出 _getDefaultPolicies', () => {
    assert.match(PERMISSIONS_SRC, /module\.exports\._getDefaultPolicies\s*=\s*_getDefaultPolicies/);
  });
  await ok('A5: 导出 DEFAULT_POLICIES', () => {
    assert.match(PERMISSIONS_SRC, /module\.exports\.DEFAULT_POLICIES\s*=\s*DEFAULT_POLICIES/);
  });

  // ============ Group B: 静态扫描 - 默认策略集 ============
  await ok('B1: 定义 DEFAULT_POLICIES 数组', () => {
    assert.match(PERMISSIONS_SRC, /const\s+DEFAULT_POLICIES\s*=\s*\[/);
  });
  await ok('B2: 包含 accelerometer=()', () => {
    assert.match(PERMISSIONS_SRC, /accelerometer=\(\)/);
  });
  await ok('B3: 包含 autoplay=(self)', () => {
    assert.match(PERMISSIONS_SRC, /autoplay=\(self\)/);
  });
  await ok('B4: 包含 fullscreen=(self)', () => {
    assert.match(PERMISSIONS_SRC, /fullscreen=\(self\)/);
  });
  await ok('B5: 包含 publickey-credentials-get=(self)', () => {
    assert.match(PERMISSIONS_SRC, /publickey-credentials-get=\(self\)/);
  });
  await ok('B6: 包含 screen-wake-lock=(self)', () => {
    assert.match(PERMISSIONS_SRC, /screen-wake-lock=\(self\)/);
  });
  await ok('B7: 包含 xr-spatial-tracking=()', () => {
    assert.match(PERMISSIONS_SRC, /xr-spatial-tracking=\(\)/);
  });

  // ============ Group C: 静态扫描 - 内部状态 ============
  await ok('C1: 定义 _cachedHeader', () => {
    assert.match(PERMISSIONS_SRC, /let\s+_cachedHeader\s*=\s*null/);
  });
  await ok('C2: 定义 _cachedOpts', () => {
    assert.match(PERMISSIONS_SRC, /let\s+_cachedOpts\s*=\s*null/);
  });

  // ============ Group D: permissionsPolicy 逻辑验证 ============
  await ok('D1: 接受 opts 参数', () => {
    assert.match(PERMISSIONS_SRC, /function\s+permissionsPolicy\s*\(\s*opts\s*=\s*\{\}\s*\)/);
  });
  await ok('D2: 检查 opts.policies', () => {
    assert.match(PERMISSIONS_SRC, /Array\.isArray\s*\(\s*opts\.policies\s*\)/);
  });
  await ok('D3: 使用 DEFAULT_POLICIES 当无自定义', () => {
    assert.match(PERMISSIONS_SRC, /DEFAULT_POLICIES/);
  });
  await ok('D4: 缓存 header value', () => {
    assert.match(PERMISSIONS_SRC, /_cachedHeader\s*===\s*null\s*\|\|\s*_cachedOpts\s*!==\s*opts/);
  });
  await ok('D5: 使用 join 拼接策略', () => {
    assert.match(PERMISSIONS_SRC, /policies\.join\s*\(\s*['"],\s*['"]\s*\)/);
  });
  await ok('D6: 检查 opts.disable', () => {
    assert.match(PERMISSIONS_SRC, /opts\.disable\s*\?\s*null\s*:\s*_cachedHeader/);
  });
  await ok('D7: 返回 middleware 函数', () => {
    assert.match(PERMISSIONS_SRC, /return\s+function\s+permissionsPolicyMiddleware/);
  });
  await ok('D8: middleware 设置 Permissions-Policy header', () => {
    assert.match(PERMISSIONS_SRC, /res\.setHeader\s*\(\s*['"]Permissions-Policy['"]/);
  });
  await ok('D9: middleware 调用 next()', () => {
    assert.match(PERMISSIONS_SRC, /next\s*\(\s*\)/);
  });

  // ============ Group E: _resetHeaderCache 逻辑验证 ============
  await ok('E1: 重置 _cachedHeader 为 null', () => {
    assert.match(PERMISSIONS_SRC, /_cachedHeader\s*=\s*null/);
  });
  await ok('E2: 重置 _cachedOpts 为 null', () => {
    assert.match(PERMISSIONS_SRC, /_cachedOpts\s*=\s*null/);
  });

  // ============ Group F: _getDefaultPolicies 逻辑验证 ============
  await ok('F1: 返回 DEFAULT_POLICIES 副本', () => {
    assert.match(PERMISSIONS_SRC, /return\s+\[\s*\.\.\.DEFAULT_POLICIES\s*\]/);
  });

  // ============ Group G: 实际测试 ============
  const permissionsPolicy = require(path.join(ROOT, 'server/middleware/permissionsPolicy.js'));
  const { DEFAULT_POLICIES, _resetHeaderCache, _getDefaultPolicies } = permissionsPolicy;

  await ok('G1: DEFAULT_POLICIES 包含 20 项策略', () => {
    assert.equal(DEFAULT_POLICIES.length, 20);
  });

  await ok('G2: DEFAULT_POLICIES 包含 accelerometer=()', () => {
    assert.ok(DEFAULT_POLICIES.includes('accelerometer=()'));
  });

  await ok('G3: DEFAULT_POLICIES 包含 fullscreen=(self)', () => {
    assert.ok(DEFAULT_POLICIES.includes('fullscreen=(self)'));
  });

  await ok('G4: _getDefaultPolicies 返回数组副本', () => {
    const policies = _getDefaultPolicies();
    assert.equal(policies.length, 20);
    // 修改副本不影响原始
    policies.push('test=()');
    assert.equal(DEFAULT_POLICIES.length, 20);
  });

  await ok('G5: permissionsPolicy 无参数返回 middleware', () => {
    const mw = permissionsPolicy();
    assert.equal(typeof mw, 'function');
  });

  await ok('G6: permissionsPolicy 设置 Permissions-Policy header', () => {
    const mw = permissionsPolicy();
    const headers = {};
    const res = {
      setHeader: (k, v) => { headers[k] = v; },
    };
    mw({}, res, () => {});
    assert.ok(headers['Permissions-Policy']);
    assert.ok(headers['Permissions-Policy'].includes('fullscreen=(self)'));
  });

  await ok('G7: permissionsPolicy opts.disable=true 不设置 header', () => {
    const mw = permissionsPolicy({ disable: true });
    const headers = {};
    const res = {
      setHeader: (k, v) => { headers[k] = v; },
    };
    mw({}, res, () => {});
    assert.equal(headers['Permissions-Policy'], undefined);
  });

  await ok('G8: permissionsPolicy 自定义 policies', () => {
    const customPolicies = ['custom-policy=(self)'];
    const mw = permissionsPolicy({ policies: customPolicies });
    const headers = {};
    const res = {
      setHeader: (k, v) => { headers[k] = v; },
    };
    mw({}, res, () => {});
    assert.equal(headers['Permissions-Policy'], 'custom-policy=(self)');
  });

  await ok('G9: permissionsPolicy 空 policies 使用默认', () => {
    const mw = permissionsPolicy({ policies: [] });
    const headers = {};
    const res = {
      setHeader: (k, v) => { headers[k] = v; },
    };
    mw({}, res, () => {});
    assert.ok(headers['Permissions-Policy'].includes('fullscreen=(self)'));
  });

  await ok('G10: _resetHeaderCache 重置缓存', () => {
    // 先设置一个缓存
    permissionsPolicy({ policies: ['test=()'] });
    _resetHeaderCache();
    // 重置后应该重新计算
    const mw = permissionsPolicy();
    const headers = {};
    const res = {
      setHeader: (k, v) => { headers[k] = v; },
    };
    mw({}, res, () => {});
    assert.ok(headers['Permissions-Policy'].includes('fullscreen=(self)'));
  });

  await ok('G11: permissionsPolicy 缓存相同 opts', () => {
    const opts = { policies: ['cached=(self)'] };
    const mw1 = permissionsPolicy(opts);
    const mw2 = permissionsPolicy(opts);
    const headers1 = {};
    const headers2 = {};
    mw1({}, { setHeader: (k, v) => { headers1[k] = v; } }, () => {});
    mw2({}, { setHeader: (k, v) => { headers2[k] = v; } }, () => {});
    assert.equal(headers1['Permissions-Policy'], headers2['Permissions-Policy']);
    assert.equal(headers1['Permissions-Policy'], 'cached=(self)');
  });

  await ok('G12: permissionsPolicy 不同 opts 更新缓存', () => {
    permissionsPolicy({ policies: ['first=(self)'] });
    _resetHeaderCache();
    const mw = permissionsPolicy({ policies: ['second=(self)'] });
    const headers = {};
    mw({}, { setHeader: (k, v) => { headers[k] = v; } }, () => {});
    assert.equal(headers['Permissions-Policy'], 'second=(self)');
  });

  await ok('G13: module.exports.default 等于 permissionsPolicy', () => {
    assert.equal(permissionsPolicy.default, permissionsPolicy);
  });

  await ok('G14: module.exports._resetHeaderCache 是函数', () => {
    assert.equal(typeof permissionsPolicy._resetHeaderCache, 'function');
  });

  await ok('G15: module.exports._getDefaultPolicies 是函数', () => {
    assert.equal(typeof permissionsPolicy._getDefaultPolicies, 'function');
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
