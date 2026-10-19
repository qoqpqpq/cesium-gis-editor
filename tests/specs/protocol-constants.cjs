// tests/specs/protocol-constants.cjs
// 周期 21 R3: protocol/constants.js 协议常量测试
// 目标：≥ 20 PASS
//
// 覆盖：
//   - 静态扫描 - 导出验证
//   - 常量值验证
//   - 正则表达式匹配测试
//   - 边界情况处理

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const CONSTANTS_SRC = fs.readFileSync(path.join(ROOT, 'server/agent/protocol/constants.js'), 'utf8');

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
  console.log('=== protocol-constants ===');

  // ============ Group A: 静态扫描 - 导出验证 ============
  await ok('A1: 导出 TOOL_OPEN', () => {
    assert.match(CONSTANTS_SRC, /TOOL_OPEN/);
  });
  await ok('A2: 导出 TOOL_CLOSE', () => {
    assert.match(CONSTANTS_SRC, /TOOL_CLOSE/);
  });
  await ok('A3: 导出 TOOL_NAME_RE', () => {
    assert.match(CONSTANTS_SRC, /TOOL_NAME_RE/);
  });
  await ok('A4: 导出 TOOL_RE', () => {
    assert.match(CONSTANTS_SRC, /TOOL_RE/);
  });
  await ok('A5: 导出 TOOL_CALLS_JSON_RE', () => {
    assert.match(CONSTANTS_SRC, /TOOL_CALLS_JSON_RE/);
  });
  await ok('A6: 导出 TOOL_CALLS_INLINE_RE', () => {
    assert.match(CONSTANTS_SRC, /TOOL_CALLS_INLINE_RE/);
  });
  await ok('A7: 导出 TOOL_CALL_JSON_RE', () => {
    assert.match(CONSTANTS_SRC, /TOOL_CALL_JSON_RE/);
  });
  await ok('A8: 导出语句', () => {
    assert.match(CONSTANTS_SRC, /module\.exports\s*=\s*\{/);
  });

  // ============ Group B: 常量值验证 ============
  await ok('B1: TOOL_OPEN 值', () => {
    assert.match(CONSTANTS_SRC, /TOOL_OPEN\s*=\s*['"]<tool>['"]/);
  });
  await ok('B2: TOOL_CLOSE 值', () => {
    assert.match(CONSTANTS_SRC, /TOOL_CLOSE\s*=\s*['"]<\/tool>['"]/);
  });
  await ok('B3: TOOL_NAME_RE 正则', () => {
    assert.match(CONSTANTS_SRC, /TOOL_NAME_RE\s*=\s*\/\[a-z_\]/);
  });
  await ok('B4: TOOL_RE 正则', () => {
    assert.match(CONSTANTS_SRC, /TOOL_RE\s*=\s*\/<tool>/);
  });
  await ok('B5: TOOL_CALLS_JSON_RE 正则', () => {
    assert.match(CONSTANTS_SRC, /TOOL_CALLS_JSON_RE\s*=\s*\/```/);
  });
  await ok('B6: TOOL_CALLS_INLINE_RE 正则', () => {
    assert.match(CONSTANTS_SRC, /TOOL_CALLS_INLINE_RE\s*=\s*\/\\\{"tool_calls"/);
  });
  await ok('B7: TOOL_CALL_JSON_RE 正则', () => {
    assert.match(CONSTANTS_SRC, /TOOL_CALL_JSON_RE\s*=\s*\/<\\u200b?\?tool_call>/);
  });

  // ============ Group C: TOOL_OPEN 测试 ============
  const { TOOL_OPEN, TOOL_CLOSE, TOOL_NAME_RE, TOOL_RE, TOOL_CALLS_JSON_RE, TOOL_CALLS_INLINE_RE, TOOL_CALL_JSON_RE } = require(path.join(ROOT, 'server/agent/protocol/constants.js'));

  await ok('C1: TOOL_OPEN 是字符串', () => {
    assert.equal(typeof TOOL_OPEN, 'string');
  });
  await ok('C2: TOOL_OPEN 值正确', () => {
    assert.equal(TOOL_OPEN, '<tool>');
  });
  await ok('C3: TOOL_CLOSE 是字符串', () => {
    assert.equal(typeof TOOL_CLOSE, 'string');
  });
  await ok('C4: TOOL_CLOSE 值正确', () => {
    assert.equal(TOOL_CLOSE, '</tool>');
  });
  await ok('C5: TOOL_OPEN 和 TOOL_CLOSE 配对', () => {
    const text = TOOL_OPEN + 'test' + TOOL_CLOSE;
    assert.ok(text.includes(TOOL_OPEN));
    assert.ok(text.includes(TOOL_CLOSE));
  });

  // ============ Group D: TOOL_NAME_RE 测试 ============
  await ok('D1: TOOL_NAME_RE 是正则', () => {
    assert.ok(TOOL_NAME_RE instanceof RegExp);
  });
  await ok('D2: TOOL_NAME_RE 匹配小写字母', () => {
    assert.ok(TOOL_NAME_RE.test('hello'));
  });
  await ok('D3: TOOL_NAME_RE 匹配下划线开头', () => {
    assert.ok(TOOL_NAME_RE.test('_hello'));
  });
  await ok('D4: TOOL_NAME_RE 匹配小写数字', () => {
    assert.ok(TOOL_NAME_RE.test('hello123'));
  });
  await ok('D5: TOOL_NAME_RE 匹配混合', () => {
    assert.ok(TOOL_NAME_RE.test('hello_world_123'));
  });
  await ok('D6: TOOL_NAME_RE 不匹配空字符串', () => {
    assert.ok(!TOOL_NAME_RE.test(''));
  });
  await ok('D7: TOOL_NAME_RE 完整匹配测试', () => {
    const m = TOOL_NAME_RE.exec('hello123');
    assert.equal(m[0], 'hello123');
  });

  // ============ Group E: TOOL_RE 测试 ============
  await ok('E1: TOOL_RE 是正则', () => {
    assert.ok(TOOL_RE instanceof RegExp);
  });
  await ok('E2: TOOL_RE 全局标志', () => {
    assert.ok(TOOL_RE.flags.includes('g'));
  });
  await ok('E3: TOOL_RE 忽略大小写', () => {
    assert.ok(TOOL_RE.flags.includes('i'));
  });
  await ok('E4: TOOL_RE 匹配完整工具调用', () => {
    const text = '<tool>get_weather("Beijing")</tool>';
    assert.ok(TOOL_RE.test(text));
  });
  await ok('E5: TOOL_RE 捕获工具名', () => {
    const text = '<tool>get_weather("Beijing")</tool>';
    TOOL_RE.lastIndex = 0;
    const m = TOOL_RE.exec(text);
    assert.equal(m[1], 'get_weather');
  });
  await ok('E6: TOOL_RE 捕获参数', () => {
    const text = '<tool>get_weather("Beijing")</tool>';
    TOOL_RE.lastIndex = 0;
    const m = TOOL_RE.exec(text);
    assert.equal(m[2], '"Beijing"');
  });
  await ok('E7: TOOL_RE 不匹配无闭合标签', () => {
    const text = '<tool>get_weather("Beijing")';
    assert.ok(!TOOL_RE.test(text));
  });
  await ok('E8: TOOL_RE 不匹配空工具名', () => {
    const text = '<tool>()</tool>';
    assert.ok(!TOOL_RE.test(text));
  });
  await ok('E9: TOOL_RE 匹配多个工具调用', () => {
    const text = '<tool>tool1("arg1")</tool> <tool>tool2("arg2")</tool>';
    TOOL_RE.lastIndex = 0;
    let count = 0;
    let m;
    while ((m = TOOL_RE.exec(text)) !== null) {
      count += 1;
    }
    assert.equal(count, 2);
  });
  await ok('E10: TOOL_RE 匹配大小写混合', () => {
    const text = '<tool>Get_Weather("Beijing")</tool>';
    assert.ok(TOOL_RE.test(text));
  });

  // ============ Group F: TOOL_CALLS_JSON_RE 测试 ============
  await ok('F1: TOOL_CALLS_JSON_RE 是正则', () => {
    assert.ok(TOOL_CALLS_JSON_RE instanceof RegExp);
  });
  await ok('F2: TOOL_CALLS_JSON_RE 全局标志', () => {
    assert.ok(TOOL_CALLS_JSON_RE.flags.includes('g'));
  });
  await ok('F3: TOOL_CALLS_JSON_RE 忽略大小写', () => {
    assert.ok(TOOL_CALLS_JSON_RE.flags.includes('i'));
  });
  await ok('F4: TOOL_CALLS_JSON_RE 匹配 json 代码块', () => {
    const text = '```json {"tool_calls":[]}```';
    TOOL_CALLS_JSON_RE.lastIndex = 0;
    assert.ok(TOOL_CALLS_JSON_RE.test(text));
  });
  await ok('F5: TOOL_CALLS_JSON_RE 匹配无 json 代码块', () => {
    const text = '```{"tool_calls":[]}```';
    TOOL_CALLS_JSON_RE.lastIndex = 0;
    assert.ok(TOOL_CALLS_JSON_RE.test(text));
  });
  await ok('F6: TOOL_CALLS_JSON_RE 捕获 JSON 内容', () => {
    const text = '```json {"tool_calls":[{"id":"1"}]}```';
    TOOL_CALLS_JSON_RE.lastIndex = 0;
    const m = TOOL_CALLS_JSON_RE.exec(text);
    assert.ok(m[1].includes('tool_calls'));
  });
  await ok('F7: TOOL_CALLS_JSON_RE 不匹配无 tool_calls', () => {
    const text = '```json {"other":[]}```';
    TOOL_CALLS_JSON_RE.lastIndex = 0;
    assert.ok(!TOOL_CALLS_JSON_RE.test(text));
  });

  // ============ Group G: TOOL_CALLS_INLINE_RE 测试 ============
  await ok('G1: TOOL_CALLS_INLINE_RE 是正则', () => {
    assert.ok(TOOL_CALLS_INLINE_RE instanceof RegExp);
  });
  await ok('G2: TOOL_CALLS_INLINE_RE 全局标志', () => {
    assert.ok(TOOL_CALLS_INLINE_RE.flags.includes('g'));
  });
  await ok('G3: TOOL_CALLS_INLINE_RE 匹配行内 JSON（含元素）', () => {
    const text = '{"tool_calls":[{"id":"1"}]}';
    assert.ok(TOOL_CALLS_INLINE_RE.test(text));
  });
  await ok('G4: TOOL_CALLS_INLINE_RE 不匹配代码块', () => {
    const text = '```{"tool_calls":[{"id":"1"}]}````';
    assert.ok(!TOOL_CALLS_INLINE_RE.test(text));
  });
  await ok('G5: TOOL_CALLS_INLINE_RE 不匹配无 tool_calls', () => {
    const text = '{"other":[{"id":"1"}]}';
    assert.ok(!TOOL_CALLS_INLINE_RE.test(text));
  });

  // ============ Group H: TOOL_CALL_JSON_RE 测试 ============
  await ok('H1: TOOL_CALL_JSON_RE 是正则', () => {
    assert.ok(TOOL_CALL_JSON_RE instanceof RegExp);
  });
  await ok('H2: TOOL_CALL_JSON_RE 全局标志', () => {
    assert.ok(TOOL_CALL_JSON_RE.flags.includes('g'));
  });
  await ok('H3: TOOL_CALL_JSON_RE 忽略大小写', () => {
    assert.ok(TOOL_CALL_JSON_RE.flags.includes('i'));
  });
  await ok('H4: TOOL_CALL_JSON_RE 匹配 <tool_call> 标签', () => {
    const text = '<\u200btool_call>{"name":"test","arguments":"{}"}<\/tool_call>';
    TOOL_CALL_JSON_RE.lastIndex = 0;
    assert.ok(TOOL_CALL_JSON_RE.test(text));
  });
  await ok('H5: TOOL_CALL_JSON_RE 捕获 JSON 内容', () => {
    const text = '<\u200btool_call>{"name":"test","arguments":"{}"}<\/tool_call>';
    TOOL_CALL_JSON_RE.lastIndex = 0;
    const m = TOOL_CALL_JSON_RE.exec(text);
    assert.ok(m[1].includes('name'));
  });
  await ok('H6: TOOL_CALL_JSON_RE 不匹配无闭合标签', () => {
    const text = '<\u200btool_call>{"name":"test","arguments":"{}"}';
    TOOL_CALL_JSON_RE.lastIndex = 0;
    assert.ok(!TOOL_CALL_JSON_RE.test(text));
  });

  // ============ Group I: 集成测试 ============
  await ok('I1: TOOL_RE 和 TOOL_OPEN/CLOSE 配合', () => {
    const text = TOOL_OPEN + 'test_tool("arg")' + TOOL_CLOSE;
    TOOL_RE.lastIndex = 0;
    assert.ok(TOOL_RE.test(text));
  });
  await ok('I2: 所有常量都导出', () => {
    assert.ok(TOOL_OPEN);
    assert.ok(TOOL_CLOSE);
    assert.ok(TOOL_NAME_RE);
    assert.ok(TOOL_RE);
    assert.ok(TOOL_CALLS_JSON_RE);
    assert.ok(TOOL_CALLS_INLINE_RE);
    assert.ok(TOOL_CALL_JSON_RE);
  });
  await ok('I3: 正则表达式都可以匹配', () => {
    TOOL_RE.lastIndex = 0;
    assert.ok(TOOL_RE.test('<tool>test("arg")</tool>'));
    TOOL_CALLS_JSON_RE.lastIndex = 0;
    assert.ok(TOOL_CALLS_JSON_RE.test('```json {"tool_calls":[]}```'));
    TOOL_CALLS_INLINE_RE.lastIndex = 0;
    assert.ok(TOOL_CALLS_INLINE_RE.test('{"tool_calls":[{"id":"1"}]}'));
    TOOL_CALL_JSON_RE.lastIndex = 0;
    assert.ok(TOOL_CALL_JSON_RE.test('<\u200btool_call>{"name":"test","arguments":"{}"}<\/tool_call>'));
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
