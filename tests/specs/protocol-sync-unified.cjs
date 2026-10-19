// tests/specs/protocol-sync-unified.cjs
// 周期 16 R2: 协议字符串统一 + 同步检查
// 目标：≥ 20 PASS
//
// 覆盖：
//   - constants.js 导出验证
//   - index.js re-export 验证
//   - parse.js re-export 验证
//   - 同步检查脚本验证
//   - 协议解析功能验证

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '../..');

// 加载 server 端模块
const constants = require(path.join(ROOT, 'server/agent/protocol/constants'));
const protocol = require(path.join(ROOT, 'server/agent/protocol/index'));
const parse = require(path.join(ROOT, 'server/agent/protocol/parse'));

// 加载同步检查脚本（作为文本读取）
const syncScriptPath = path.join(ROOT, 'scripts/check-protocol-sync.cjs');
const syncScriptSrc = fs.readFileSync(syncScriptPath, 'utf8');

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
  console.log('=== protocol-sync-unified ===');

  // ============ Group A: constants.js 导出验证 ============
  await ok('A1: constants.js 导出 TOOL_OPEN', () => {
    assert.equal(typeof constants.TOOL_OPEN, 'string');
    assert.equal(constants.TOOL_OPEN, '<tool>');
  });
  await ok('A2: constants.js 导出 TOOL_CLOSE', () => {
    assert.equal(typeof constants.TOOL_CLOSE, 'string');
    assert.equal(constants.TOOL_CLOSE, '</tool>');
  });
  await ok('A3: constants.js 导出 TOOL_RE', () => {
    assert.ok(constants.TOOL_RE instanceof RegExp);
    assert.match(constants.TOOL_RE.toString(), /gi/);
  });
  await ok('A4: constants.js 导出 TOOL_NAME_RE', () => {
    assert.ok(constants.TOOL_NAME_RE instanceof RegExp);
    assert.match(constants.TOOL_NAME_RE.toString(), /a-z_.*a-z0-9_/);
  });
  await ok('A5: constants.js 导出 TOOL_CALLS_JSON_RE', () => {
    assert.ok(constants.TOOL_CALLS_JSON_RE instanceof RegExp);
    assert.match(constants.TOOL_CALLS_JSON_RE.toString(), /tool_calls/);
  });
  await ok('A6: constants.js 导出 TOOL_CALLS_INLINE_RE', () => {
    assert.ok(constants.TOOL_CALLS_INLINE_RE instanceof RegExp);
    assert.match(constants.TOOL_CALLS_INLINE_RE.toString(), /tool_calls/);
  });
  await ok('A7: constants.js 导出 TOOL_CALL_JSON_RE', () => {
    assert.ok(constants.TOOL_CALL_JSON_RE instanceof RegExp);
    assert.match(constants.TOOL_CALL_JSON_RE.toString(), /tool_call/);
  });

  // ============ Group B: index.js re-export 验证 ============
  await ok('B1: index.js re-export TOOL_OPEN', () => {
    assert.equal(protocol.TOOL_OPEN, constants.TOOL_OPEN);
  });
  await ok('B2: index.js re-export TOOL_CLOSE', () => {
    assert.equal(protocol.TOOL_CLOSE, constants.TOOL_CLOSE);
  });
  await ok('B3: index.js re-export TOOL_RE', () => {
    assert.equal(protocol.TOOL_RE, constants.TOOL_RE);
  });
  await ok('B4: index.js re-export parseToolTags', () => {
    assert.equal(typeof protocol.parseToolTags, 'function');
  });
  await ok('B5: index.js re-export parseArgs', () => {
    assert.equal(typeof protocol.parseArgs, 'function');
  });
  await ok('B6: index.js re-export unquote', () => {
    assert.equal(typeof protocol.unquote, 'function');
  });

  // ============ Group C: parse.js re-export 验证 ============
  await ok('C1: parse.js re-export parseToolTags', () => {
    assert.equal(typeof parse.parseToolTags, 'function');
  });
  await ok('C2: parse.js re-export parseArgs', () => {
    assert.equal(typeof parse.parseArgs, 'function');
  });
  await ok('C3: parse.js re-export TOOL_RE', () => {
    assert.equal(parse.TOOL_RE, constants.TOOL_RE);
  });
  await ok('C4: parse.js re-export TOOL_OPEN', () => {
    assert.equal(parse.TOOL_OPEN, constants.TOOL_OPEN);
  });
  await ok('C5: parse.js re-export TOOL_CLOSE', () => {
    assert.equal(parse.TOOL_CLOSE, constants.TOOL_CLOSE);
  });

  // ============ Group D: 同步检查脚本验证 ============
  await ok('D1: 同步检查脚本存在', () => {
    assert.ok(fs.existsSync(syncScriptPath));
  });
  await ok('D2: 同步检查脚本含 constants.js 检查', () => {
    assert.match(syncScriptSrc, /SERVER_CONSTANTS_FILE/);
    assert.match(syncScriptSrc, /constants\.js/);
  });
  await ok('D3: 同步检查脚本含 6 个常量检查', () => {
    assert.match(syncScriptSrc, /TOOL_OPEN/);
    assert.match(syncScriptSrc, /TOOL_CLOSE/);
    assert.match(syncScriptSrc, /TOOL_RE/);
    assert.match(syncScriptSrc, /TOOL_CALLS_JSON_RE/);
    assert.match(syncScriptSrc, /TOOL_CALLS_INLINE_RE/);
    assert.match(syncScriptSrc, /TOOL_CALL_JSON_RE/);
  });
  await ok('D4: 同步检查脚本含 JSON 输出支持', () => {
    assert.match(syncScriptSrc, /--json/);
    assert.match(syncScriptSrc, /JSON\.stringify/);
  });

  // ============ Group E: 协议解析功能验证 ============
  await ok('E1: parseToolTags 解析 <tool>name(args)</tool>', () => {
    const text = 'Hello <tool>web_search(Cesium 3D tiles)</tool> World';
    const result = protocol.parseToolTags(text);
    assert.equal(result.tools.length, 1);
    assert.equal(result.tools[0].name, 'web_search');
    assert.equal(result.tools[0].args, 'Cesium 3D tiles');
  });
  await ok('E2: parseToolTags 解析多个工具调用', () => {
    const text = '<tool>search(a)</tool> <tool>fetch(b)</tool>';
    const result = protocol.parseToolTags(text);
    assert.equal(result.tools.length, 2);
    assert.equal(result.tools[0].name, 'search');
    assert.equal(result.tools[1].name, 'fetch');
  });
  await ok('E3: parseToolTags 检测 pending', () => {
    const text = 'Hello <tool>incomplete';
    const result = protocol.parseToolTags(text);
    assert.equal(result.tools.length, 0);
    assert.ok(result.pending);
  });
  await ok('E4: parseArgs 解析 JSON 数组', () => {
    const args = protocol.parseArgs('["hello", "world"]');
    // parseArgs wraps in array: JSON.parse('[["hello", "world"]]') = [["hello", "world"]]
    assert.equal(args.length, 1);
    assert.deepEqual(args[0], ['hello', 'world']);
  });
  await ok('E5: parseArgs 解析单 token', () => {
    const args = protocol.parseArgs('hello');
    assert.deepEqual(args, ['hello']);
  });
  await ok('E6: parseArgs 解析带引号字符串', () => {
    const args = protocol.parseArgs('"hello world"');
    assert.deepEqual(args, ['hello world']);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
