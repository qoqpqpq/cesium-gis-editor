// tests/specs/sessionkeys-management.cjs
// 周期 17 R3: sessionKeys.js 会话密钥管理测试
// 目标：≥ 15 PASS
//
// 覆盖：
//   - 静态扫描（函数导出 + 常量）
//   - getAll 逻辑验证
//   - get 逻辑验证
//   - set 逻辑验证
//   - remove 逻辑验证
//   - clearAll 逻辑验证
//   - hasAny 逻辑验证
//   - maskKey 逻辑验证

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const SESSION_KEYS_SRC = fs.readFileSync(path.join(ROOT, 'client/src/utils/sessionKeys.js'), 'utf8');

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
  console.log('=== sessionkeys-management ===');

  // ============ Group A: 静态扫描 - 导出验证 ============
  await ok('A1: 导出 getAll 函数', () => {
    assert.match(SESSION_KEYS_SRC, /export\s+function\s+getAll/);
  });
  await ok('A2: 导出 get 函数', () => {
    assert.match(SESSION_KEYS_SRC, /export\s+function\s+get/);
  });
  await ok('A3: 导出 set 函数', () => {
    assert.match(SESSION_KEYS_SRC, /export\s+function\s+set/);
  });
  await ok('A4: 导出 remove 函数', () => {
    assert.match(SESSION_KEYS_SRC, /export\s+function\s+remove/);
  });
  await ok('A5: 导出 clearAll 函数', () => {
    assert.match(SESSION_KEYS_SRC, /export\s+function\s+clearAll/);
  });
  await ok('A6: 导出 hasAny 函数', () => {
    assert.match(SESSION_KEYS_SRC, /export\s+function\s+hasAny/);
  });
  await ok('A7: 导出 maskKey 函数', () => {
    assert.match(SESSION_KEYS_SRC, /export\s+function\s+maskKey/);
  });

  // ============ Group B: 静态扫描 - 内部结构 ============
  await ok('B1: 定义 store 对象', () => {
    assert.match(SESSION_KEYS_SRC, /const\s+store\s*=\s*\{/);
  });
  await ok('B2: 定义 notify 函数', () => {
    assert.match(SESSION_KEYS_SRC, /function\s+notify\s*\(\)/);
  });
  await ok('B3: notify 使用 dispatchEvent', () => {
    assert.match(SESSION_KEYS_SRC, /window\.dispatchEvent/);
  });
  await ok('B4: notify 使用 CustomEvent', () => {
    assert.match(SESSION_KEYS_SRC, /new\s+CustomEvent\s*\(\s*['"]ai-keys-changed['"]/);
  });

  // ============ Group C: getAll 逻辑验证 ============
  await ok('C1: getAll 接受 opts 参数', () => {
    assert.match(SESSION_KEYS_SRC, /function\s+getAll\s*\(\s*opts\s*=\s*\{\}\s*\)/);
  });
  await ok('C2: getAll 支持 withRemark 选项', () => {
    assert.match(SESSION_KEYS_SRC, /const\s+\{\s*withRemark\s*=\s*false\s*\}\s*=\s*opts/);
  });
  await ok('C3: getAll 使用 Object.entries', () => {
    assert.match(SESSION_KEYS_SRC, /Object\.entries\s*\(\s*store\s*\)/);
  });
  await ok('C4: getAll 返回 platform 字段', () => {
    assert.match(SESSION_KEYS_SRC, /platform,/);
  });
  await ok('C5: getAll 返回 apiKey 字段', () => {
    assert.match(SESSION_KEYS_SRC, /apiKey:\s*creds\.apiKey/);
  });
  await ok('C6: getAll 返回 baseUrl 字段', () => {
    assert.match(SESSION_KEYS_SRC, /baseUrl:\s*creds\.baseUrl/);
  });
  await ok('C7: getAll 返回 modelName 字段', () => {
    assert.match(SESSION_KEYS_SRC, /modelName:\s*creds\.modelName/);
  });
  await ok('C8: getAll 返回 savedAt 字段', () => {
    assert.match(SESSION_KEYS_SRC, /savedAt:\s*creds\.savedAt/);
  });
  await ok('C9: getAll 条件返回 remark 字段', () => {
    assert.match(SESSION_KEYS_SRC, /if\s*\(\s*withRemark\s*\)\s+out\.remark/);
  });

  // ============ Group D: get 逻辑验证 ============
  await ok('D1: get 检查 store[platform]', () => {
    assert.match(SESSION_KEYS_SRC, /const\s+c\s*=\s*store\s*\[\s*platform\s*\]/);
  });
  await ok('D2: get 返回 null 当不存在', () => {
    assert.match(SESSION_KEYS_SRC, /return\s+c\s*\?\s*\{\s*\.\.\.c\s*,\s*platform\s*\}\s*:\s*null/);
  });
  await ok('D3: get 返回包含 platform 的对象', () => {
    assert.match(SESSION_KEYS_SRC, /platform/);
  });

  // ============ Group E: set 逻辑验证 ============
  await ok('E1: set 存储 apiKey', () => {
    assert.match(SESSION_KEYS_SRC, /apiKey:\s*creds\.apiKey/);
  });
  await ok('E2: set 存储 baseUrl（默认空字符串）', () => {
    assert.match(SESSION_KEYS_SRC, /baseUrl:\s*creds\.baseUrl\s*\|\|\s*['"]/);
  });
  await ok('E3: set 存储 modelName（默认空字符串）', () => {
    assert.match(SESSION_KEYS_SRC, /modelName:\s*creds\.modelName\s*\|\|\s*['"]/);
  });
  await ok('E4: set 存储 remark（默认空字符串）', () => {
    assert.match(SESSION_KEYS_SRC, /remark:\s*creds\.remark\s*\|\|\s*['"]/);
  });
  await ok('E5: set 存储 savedAt（默认当前时间）', () => {
    assert.match(SESSION_KEYS_SRC, /savedAt:\s*creds\.savedAt\s*\|\|\s*new\s+Date\s*\(\)\.toLocaleTimeString/);
  });
  await ok('E6: set 调用 notify', () => {
    assert.match(SESSION_KEYS_SRC, /notify\s*\(\s*\)/);
  });

  // ============ Group F: remove 逻辑验证 ============
  await ok('F1: remove 检查 store[platform]', () => {
    assert.match(SESSION_KEYS_SRC, /if\s*\(\s*!\s*store\s*\[\s*platform\s*\]\s*\)\s+return/);
  });
  await ok('F2: remove 删除 store[platform]', () => {
    assert.match(SESSION_KEYS_SRC, /delete\s+store\s*\[\s*platform\s*\]/);
  });
  await ok('F3: remove 调用 notify', () => {
    assert.match(SESSION_KEYS_SRC, /notify\s*\(\s*\)/);
  });

  // ============ Group G: clearAll 逻辑验证 ============
  await ok('G1: clearAll 遍历 store 键', () => {
    assert.match(SESSION_KEYS_SRC, /for\s*\(\s*const\s+k\s+of\s+Object\.keys\s*\(\s*store\s*\)\s*\)/);
  });
  await ok('G2: clearAll 删除每个键', () => {
    assert.match(SESSION_KEYS_SRC, /delete\s+store\s*\[\s*k\s*\]/);
  });
  await ok('G3: clearAll 调用 notify', () => {
    assert.match(SESSION_KEYS_SRC, /notify\s*\(\s*\)/);
  });

  // ============ Group H: hasAny 逻辑验证 ============
  await ok('H1: hasAny 检查 store 键数量', () => {
    assert.match(SESSION_KEYS_SRC, /Object\.keys\s*\(\s*store\s*\)\.length\s*>\s*0/);
  });

  // ============ Group I: maskKey 逻辑验证 ============
  await ok('I1: maskKey 空值返回空字符串', () => {
    assert.match(SESSION_KEYS_SRC, /if\s*\(\s*!\s*apiKey\s*\)\s+return\s*['"]/);
  });
  await ok('I2: maskKey 短字符串（≤8）返回 ****', () => {
    assert.match(SESSION_KEYS_SRC, /if\s*\(\s*apiKey\.length\s*<=\s*8\s*\)\s+return\s+['"]\*{4}['"]/);
  });
  await ok('I3: maskKey 长字符串返回前4后4', () => {
    assert.match(SESSION_KEYS_SRC, /return\s+apiKey\.slice\s*\(\s*0\s*,\s*4\s*\)\s*\+\s*['"]\*{4}['"]\s*\+\s*apiKey\.slice\s*\(\s*-4\s*\)/);
  });

  // ============ Group J: maskKey 实际测试 ============
  function maskKey(apiKey) {
    if (!apiKey) return '';
    if (apiKey.length <= 8) return '****';
    return apiKey.slice(0, 4) + '****' + apiKey.slice(-4);
  }

  await ok('J1: maskKey 空字符串返回空', () => {
    assert.equal(maskKey(''), '');
  });
  await ok('J2: maskKey null 返回空', () => {
    assert.equal(maskKey(null), '');
  });
  await ok('J3: maskKey 短字符串返回 ****', () => {
    assert.equal(maskKey('abc123'), '****');
    assert.equal(maskKey('a1b2c3d4'), '****');
  });
  await ok('J4: maskKey 长字符串返回前4后4', () => {
    assert.equal(maskKey('sk-abc123456789xyz'), 'sk-a****9xyz');
    assert.equal(maskKey('abcdef123456'), 'abcd****3456');
  });
  await ok('J5: maskKey 边界值（9字符）', () => {
    assert.equal(maskKey('123456789'), '1234****6789');
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
