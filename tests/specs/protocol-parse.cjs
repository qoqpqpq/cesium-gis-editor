// tests/specs/protocol-parse.cjs
// 周期 21 R2: protocol/parse.js 协议解析测试
// 目标：≥ 20 PASS
//
// 覆盖：
//   - parse.js re-export 验证
//   - parseArgs 参数解析
//   - parseToolTags 工具标签解析
//   - unquote 字符串去引号
//   - 常量导出验证

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const PARSE_SRC = fs.readFileSync(path.join(ROOT, 'server/agent/protocol/parse.js'), 'utf8');
const INDEX_SRC = fs.readFileSync(path.join(ROOT, 'server/agent/protocol/index.js'), 'utf8');
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
  console.log('=== protocol-parse ===');

  // ============ Group A: parse.js re-export 验证 ============
  await ok('A1: parse.js 导入 index.js', () => {
    assert.match(PARSE_SRC, /require\s*\(\s*['"]\.\/index['"]\s*\)/);
  });
  await ok('A2: 导出 parseToolTags', () => {
    assert.match(PARSE_SRC, /parseToolTags/);
  });
  await ok('A3: 导出 parseArgs', () => {
    assert.match(PARSE_SRC, /parseArgs/);
  });
  await ok('A4: 导出 TOOL_RE', () => {
    assert.match(PARSE_SRC, /TOOL_RE/);
  });
  await ok('A5: 导出 TOOL_OPEN', () => {
    assert.match(PARSE_SRC, /TOOL_OPEN/);
  });
  await ok('A6: 导出 TOOL_CLOSE', () => {
    assert.match(PARSE_SRC, /TOOL_CLOSE/);
  });
  await ok('A7: 导出 TOOL_CALLS_JSON_RE', () => {
    assert.match(PARSE_SRC, /TOOL_CALLS_JSON_RE/);
  });
  await ok('A8: 导出 TOOL_CALLS_INLINE_RE', () => {
    assert.match(PARSE_SRC, /TOOL_CALLS_INLINE_RE/);
  });
  await ok('A9: 导出 TOOL_CALL_JSON_RE', () => {
    assert.match(PARSE_SRC, /TOOL_CALL_JSON_RE/);
  });
  await ok('A10: parse.js 是 re-export 文件', () => {
    assert.match(PARSE_SRC, /module\.exports\s*=\s*\{/);
  });

  // ============ Group B: constants.js 常量验证 ============
  await ok('B1: TOOL_OPEN 常量', () => {
    assert.match(CONSTANTS_SRC, /TOOL_OPEN\s*=\s*['"]<tool>['"]/);
  });
  await ok('B2: TOOL_CLOSE 常量', () => {
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

  // ============ Group C: index.js parseArgs 函数验证 ============
  await ok('C1: parseArgs 函数定义', () => {
    assert.match(INDEX_SRC, /function\s+parseArgs\s*\(\s*raw\s*\)/);
  });
  await ok('C2: trim 处理', () => {
    assert.match(INDEX_SRC, /const\s+s\s*=\s*\(raw\s*\|\|\s*''\)\.trim\s*\(\s*\)/);
  });
  await ok('C3: 空字符串返回空数组', () => {
    assert.match(INDEX_SRC, /if\s*\(\s*!\s*s\s*\)\s+return\s+\[\]/);
  });
  await ok('C4: JSON.parse 尝试', () => {
    assert.match(INDEX_SRC, /JSON\.parse\s*\(\s*['"]\[\s*['"]\s*\+\s*s\s*\+\s*['"]\]\s*['"]/);
  });
  await ok('C5: Array.isArray 检查', () => {
    assert.match(INDEX_SRC, /Array\.isArray\s*\(\s*parsed\s*\)/);
  });
  await ok('C6: 逗号切分', () => {
    assert.match(INDEX_SRC, /ch\s*===\s*['"],['"]/);
  });
  await ok('C7: 括号深度跟踪', () => {
    assert.match(INDEX_SRC, /depth\s*\+\+/);
  });
  await ok('C8: 引号跟踪', () => {
    assert.match(INDEX_SRC, /inStr\s*=\s*ch/);
  });
  await ok('C9: 最终 push', () => {
    assert.match(INDEX_SRC, /out\.push\s*\(\s*unquote\s*\(\s*buf\.trim\s*\(\s*\)\s*\)\s*\)/);
  });

  // ============ Group D: index.js unquote 函数验证 ============
  await ok('D1: unquote 函数定义', () => {
    assert.match(INDEX_SRC, /function\s+unquote\s*\(\s*s\s*\)/);
  });
  await ok('D2: 空字符串处理', () => {
    assert.match(INDEX_SRC, /if\s*\(\s*!\s*s\s*\)\s+return\s+s/);
  });
  await ok('D3: 双引号处理', () => {
    assert.match(INDEX_SRC, /startsWith\s*\(\s*['"]['"]['"]\s*\)\s*&&\s*s\.endsWith\s*\(\s*['"]['"]['"]\s*\)/);
  });
  await ok('D4: 单引号处理', () => {
    assert.match(INDEX_SRC, /startsWith\s*\(\s*['"]['"]/);
  });
  await ok('D5: slice 去引号', () => {
    assert.match(INDEX_SRC, /s\.slice\s*\(\s*1\s*,\s*-1\s*\)/);
  });

  // ============ Group E: index.js parseToolTags 函数验证 ============
  await ok('E1: parseToolTags 函数定义', () => {
    assert.match(INDEX_SRC, /function\s+parseToolTags\s*\(\s*text\s*\)/);
  });
  await ok('E2: 空文本处理', () => {
    assert.match(INDEX_SRC, /if\s*\(\s*!\s*text\s*\)\s+return\s+\{\s*tools:\s*\[\]\s*,\s*pending:\s*null\s*\}/);
  });
  await ok('E3: tools 数组初始化', () => {
    assert.match(INDEX_SRC, /const\s+tools\s*=\s*\[\]/);
  });
  await ok('E4: TOOL_RE exec 循环', () => {
    assert.match(INDEX_SRC, /TOOL_RE\.lastIndex\s*=\s*0/);
  });
  await ok('E5: 工具对象构建', () => {
    assert.match(INDEX_SRC, /id:\s*`tool_\$\{randomUUID\(\)\}`/);
  });
  await ok('E6: 类型设为 function', () => {
    assert.match(INDEX_SRC, /type:\s*['"]function['"]/);
  });
  await ok('E7: function 对象', () => {
    assert.match(INDEX_SRC, /function:\s*\{\s*name:\s*m\[1\]\s*,\s*arguments:\s*m\[2\]\.trim\s*\(\s*\)/);
  });
  await ok('E8: TOOL_CALLS_JSON_RE 处理', () => {
    assert.match(INDEX_SRC, /TOOL_CALLS_JSON_RE\.lastIndex\s*=\s*0/);
  });
  await ok('E9: TOOL_CALLS_INLINE_RE 处理', () => {
    assert.match(INDEX_SRC, /TOOL_CALLS_INLINE_RE\.lastIndex\s*=\s*0/);
  });
  await ok('E10: matchedRanges 防重复', () => {
    assert.match(INDEX_SRC, /const\s+matchedRanges\s*=\s*\[\]/);
  });
  await ok('E11: pending 检测', () => {
    assert.match(INDEX_SRC, /text\.lastIndexOf\s*\(\s*TOOL_OPEN\s*\)/);
  });
  await ok('E12: 返回 tools 和 pending', () => {
    assert.match(INDEX_SRC, /return\s+\{\s*tools\s*,\s*pending\s*\}/);
  });

  // ============ Group F: 实际测试 - parseArgs ============
  const { parseArgs, parseToolTags, TOOL_OPEN, TOOL_CLOSE, TOOL_RE } = require(path.join(ROOT, 'server/agent/protocol/parse.js'));
  const { unquote } = require(path.join(ROOT, 'server/agent/protocol/index.js'));

  await ok('F1: parseArgs 空字符串', () => {
    assert.deepEqual(parseArgs(''), []);
  });

  await ok('F2: parseArgs 单个数字', () => {
    assert.deepEqual(parseArgs('123'), [123]);
  });

  await ok('F3: parseArgs 单个字符串（双引号）', () => {
    assert.deepEqual(parseArgs('"hello"'), ['hello']);
  });

  await ok('F4: parseArgs 单个字符串（单引号）', () => {
    assert.deepEqual(parseArgs("'hello'"), ['hello']);
  });

  await ok('F5: parseArgs 多个参数', () => {
    assert.deepEqual(parseArgs('1, "hello", true'), [1, 'hello', true]);
  });

  await ok('F6: parseArgs JSON 数组', () => {
    assert.deepEqual(parseArgs('[1,2,3]'), [[1, 2, 3]]);
  });

  await ok('F7: parseArgs 带空格的参数', () => {
    assert.deepEqual(parseArgs('  1  ,  "hello"  '), [1, 'hello']);
  });

  await ok('F8: parseArgs null 输入', () => {
    assert.deepEqual(parseArgs(null), []);
  });

  await ok('F9: parseArgs undefined 输入', () => {
    assert.deepEqual(parseArgs(undefined), []);
  });

  // ============ Group G: 实际测试 - unquote ============
  await ok('G1: unquote 空字符串', () => {
    assert.equal(unquote(''), '');
  });

  await ok('G2: unquote 双引号', () => {
    assert.equal(unquote('"hello"'), 'hello');
  });

  await ok('G3: unquote 单引号', () => {
    assert.equal(unquote("'hello'"), 'hello');
  });

  await ok('G4: unquote 无引号', () => {
    assert.equal(unquote('hello'), 'hello');
  });

  await ok('G5: unquote 数字字符串', () => {
    assert.equal(unquote('123'), '123');
  });

  // ============ Group H: 实际测试 - parseToolTags ============
  await ok('H1: parseToolTags 空文本', () => {
    const result = parseToolTags('');
    assert.deepEqual(result.tools, []);
    assert.equal(result.pending, null);
  });

  await ok('H2: parseToolTags 单个工具调用', () => {
    const text = '<tool>get_weather("Beijing")</tool>';
    const result = parseToolTags(text);
    assert.equal(result.tools.length, 1);
    assert.equal(result.tools[0].name, 'get_weather');
    assert.equal(result.tools[0].args, '"Beijing"');
  });

  await ok('H3: parseToolTags 多个工具调用', () => {
    const text = '<tool>tool1("arg1")</tool> some text <tool>tool2("arg2")</tool>';
    const result = parseToolTags(text);
    assert.equal(result.tools.length, 2);
    assert.equal(result.tools[0].name, 'tool1');
    assert.equal(result.tools[1].name, 'tool2');
  });

  await ok('H4: parseToolTags 未闭合标签（pending）', () => {
    const text = '<tool>get_weather("Beijing")';
    const result = parseToolTags(text);
    assert.equal(result.tools.length, 0);
    assert.notEqual(result.pending, null);
    assert.ok(result.pending.includes('get_weather'));
  });

  await ok('H5: parseToolTags 混合已完成和 pending', () => {
    const text = '<tool>tool1("arg1")</tool> <tool>tool2("arg2")';
    const result = parseToolTags(text);
    assert.equal(result.tools.length, 1);
    assert.equal(result.tools[0].name, 'tool1');
    assert.notEqual(result.pending, null);
  });

  await ok('H6: parseToolTags OpenAI JSON 格式', () => {
    const text = '```json {"tool_calls":[{"id":"1","type":"function","function":{"name":"get_weather","arguments":"{\\"city\\":\\"Beijing\\"}"}}]}```';
    const result = parseToolTags(text);
    assert.equal(result.tools.length, 1);
    assert.equal(result.tools[0].name, 'get_weather');
    assert.equal(result.tools[0].source, 'openai');
  });

  await ok('H7: parseToolTags OpenAI 行内 JSON', () => {
    const text = '{"tool_calls":[{"id":"1","type":"function","function":{"name":"get_weather","arguments":"{\\"city\\":\\"Beijing\\"}"}}]}';
    const result = parseToolTags(text);
    assert.equal(result.tools.length, 1);
    assert.equal(result.tools[0].name, 'get_weather');
    assert.equal(result.tools[0].source, 'openai');
  });

  await ok('H8: parseToolTags 工具对象结构', () => {
    const text = '<tool>test_tool("arg")</tool>';
    const result = parseToolTags(text);
    const tool = result.tools[0];
    assert.ok(tool.id);
    assert.equal(tool.type, 'function');
    assert.equal(tool.function.name, 'test_tool');
    assert.equal(tool.function.arguments, '"arg"');
    assert.equal(tool.name, 'test_tool');
    assert.equal(tool.args, '"arg"');
    assert.ok(tool.raw);
    assert.ok(tool.index >= 0);
  });

  await ok('H9: parseToolTags 工具名包含大写字母', () => {
    const text = '<tool>InvalidName("arg")</tool>';
    const result = parseToolTags(text);
    assert.equal(result.tools.length, 1);
    assert.equal(result.tools[0].name, 'InvalidName');
  });

  await ok('H10: parseToolTags 工具名包含数字', () => {
    const text = '<tool>tool123("arg")</tool>';
    const result = parseToolTags(text);
    assert.equal(result.tools.length, 1);
    assert.equal(result.tools[0].name, 'tool123');
  });

  // ============ Group I: 实际测试 - 常量 ============
  await ok('I1: TOOL_OPEN 值', () => {
    assert.equal(TOOL_OPEN, '<tool>');
  });

  await ok('I2: TOOL_CLOSE 值', () => {
    assert.equal(TOOL_CLOSE, '</tool>');
  });

  await ok('I3: TOOL_RE 是正则', () => {
    assert.ok(TOOL_RE instanceof RegExp);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
