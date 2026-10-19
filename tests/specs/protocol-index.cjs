// tests/specs/protocol-index.cjs
// Cycle 21 R4: protocol/index.js 协议主模块测试
// 覆盖 parseArgs / unquote / parseToolTags 三个核心函数

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'server/agent/protocol/index.js');
const CONST_SRC = path.join(ROOT, 'server/agent/protocol/constants.js');

let pass = 0, fail = 0;
function ok(label, fn) {
  try { fn(); pass++; console.log(`  [PASS] ${label}`); }
  catch (e) { fail++; console.log(`  [FAIL] ${label}: ${e.message}`); }
}

(async () => {
  function loadModule(srcPath, localRequires = {}) {
    const sandbox = {
      module: { exports: {} }, exports: {},
      console, Buffer, JSON,
      require: (id) => {
        if (id in localRequires) return localRequires[id];
        if (id === 'node:crypto') return require('node:crypto');
        throw new Error(`unmocked require: ${id}`);
      },
      __dirname: path.dirname(srcPath),
    };
    const src = fs.readFileSync(srcPath, 'utf8');
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    return sandbox.module.exports;
  }

  const CONSTANTS = loadModule(CONST_SRC);
  const MODULE = loadModule(SRC, {
    './constants': CONSTANTS,
    'node:crypto': require('node:crypto'),
  });

  const { parseArgs, unquote, parseToolTags } = MODULE;
  const {
    TOOL_OPEN, TOOL_CLOSE, TOOL_NAME_RE, TOOL_RE,
    TOOL_CALLS_JSON_RE, TOOL_CALLS_INLINE_RE, TOOL_CALL_JSON_RE,
  } = MODULE;

  // Helper: convert cross-vm array to native array for deepStrictEqual
  function fromVm(arr) { return Array.from(arr); }
  function isRegExp(obj) { return Object.prototype.toString.call(obj) === '[object RegExp]'; }

  console.log('=== protocol-index ===');

  // ============ Group A: 模块导出验证 ============
  await ok('A1: parseArgs 导出', () => {
    assert.strictEqual(typeof parseArgs, 'function');
  });
  await ok('A2: unquote 导出', () => {
    assert.strictEqual(typeof unquote, 'function');
  });
  await ok('A3: parseToolTags 导出', () => {
    assert.strictEqual(typeof parseToolTags, 'function');
  });
  await ok('A4: 重新导出 TOOL_OPEN', () => {
    assert.strictEqual(TOOL_OPEN, '<tool>');
  });
  await ok('A5: 重新导出 TOOL_CLOSE', () => {
    assert.strictEqual(TOOL_CLOSE, '</tool>');
  });
  await ok('A6: 重新导出 TOOL_NAME_RE', () => {
    assert.strictEqual(TOOL_NAME_RE.toString(), '/[a-z_][a-z0-9_]*/');
  });
  await ok('A7: 重新导出 TOOL_RE', () => {
    assert.ok(isRegExp(TOOL_RE));
    assert.ok(TOOL_RE.flags.includes('g'));
  });
  await ok('A8: 重新导出 TOOL_CALLS_JSON_RE', () => {
    assert.ok(isRegExp(TOOL_CALLS_JSON_RE));
    assert.ok(TOOL_CALLS_JSON_RE.flags.includes('g'));
  });
  await ok('A9: 重新导出 TOOL_CALLS_INLINE_RE', () => {
    assert.ok(isRegExp(TOOL_CALLS_INLINE_RE));
    assert.ok(TOOL_CALLS_INLINE_RE.flags.includes('g'));
  });
  await ok('A10: 重新导出 TOOL_CALL_JSON_RE', () => {
    assert.ok(isRegExp(TOOL_CALL_JSON_RE));
    assert.ok(TOOL_CALL_JSON_RE.flags.includes('g'));
  });
  await ok('A11: 所有导出完整', () => {
    const keys = Object.keys(MODULE).sort();
    const expected = ['TOOL_CALLS_INLINE_RE', 'TOOL_CALLS_JSON_RE', 'TOOL_CALL_JSON_RE', 'TOOL_CLOSE', 'TOOL_NAME_RE', 'TOOL_OPEN', 'TOOL_RE', 'parseArgs', 'parseToolTags', 'unquote'].sort();
    assert.deepStrictEqual(keys, expected);
  });

  // ============ Group B: parseArgs 逻辑验证 ============
  await ok('B1: parseArgs 空字符串返回空数组', () => {
    assert.deepStrictEqual(fromVm(parseArgs('')), []);
  });
  await ok('B2: parseArgs null 返回空数组', () => {
    assert.deepStrictEqual(fromVm(parseArgs(null)), []);
  });
  await ok('B3: parseArgs undefined 返回空数组', () => {
    assert.deepStrictEqual(fromVm(parseArgs(undefined)), []);
  });
  await ok('B4: parseArgs JSON 数字', () => {
    assert.deepStrictEqual(fromVm(parseArgs('1')), [1]);
  });
  await ok('B5: parseArgs JSON 字符串', () => {
    assert.deepStrictEqual(fromVm(parseArgs('"hello"')), ['hello']);
  });
  await ok('B6: parseArgs JSON 对象', () => {
    assert.deepStrictEqual(fromVm(parseArgs('{"a":1}')), [{ a: 1 }]);
  });
  await ok('B7: parseArgs JSON 数组', () => {
    assert.deepStrictEqual(fromVm(parseArgs('[1,2]')), [[1, 2]]);
  });
  await ok('B8: parseArgs JSON 嵌套', () => {
    assert.deepStrictEqual(fromVm(parseArgs('[{"a":[1,2]}]')), [[{ a: [1, 2] }]]);
  });
  await ok('B9: parseArgs 裸字符串回退', () => {
    assert.deepStrictEqual(fromVm(parseArgs('hello')), ['hello']);
  });
  await ok('B10: parseArgs 多个裸字符串逗号分隔', () => {
    assert.deepStrictEqual(fromVm(parseArgs('a,b,c')), ['a', 'b', 'c']);
  });
  await ok('B11: parseArgs 数字裸值', () => {
    assert.deepStrictEqual(fromVm(parseArgs('1,2,3')), [1, 2, 3]);
  });
  await ok('B12: parseArgs 带引号字符串', () => {
    assert.deepStrictEqual(fromVm(parseArgs('"hello","world"')), ['hello', 'world']);
  });
  await ok('B13: parseArgs 带空格', () => {
    assert.deepStrictEqual(fromVm(parseArgs('  a , b  ')), ['a', 'b']);
  });

  // ============ Group C: unquote 逻辑验证 ============
  await ok('C1: unquote 双引号包裹', () => {
    assert.strictEqual(unquote('"hello"'), 'hello');
  });
  await ok('C2: unquote 单引号包裹', () => {
    assert.strictEqual(unquote("'hello'"), 'hello');
  });
  await ok('C3: unquote 无引号原样返回', () => {
    assert.strictEqual(unquote('hello'), 'hello');
  });
  await ok('C4: unquote 空字符串', () => {
    assert.strictEqual(unquote(''), '');
  });
  await ok('C5: unquote null 返回 null', () => {
    assert.strictEqual(unquote(null), null);
  });
  await ok('C6: unquote 不匹配引号', () => {
    assert.strictEqual(unquote('"hello'), '"hello');
  });
  await ok('C7: unquote 空引号对', () => {
    assert.strictEqual(unquote('""'), '');
  });

  // ============ Group D: parseToolTags 本地 <tool> 格式 ============
  await ok('D1: parseToolTags 空字符串返回空', () => {
    const r = parseToolTags('');
    assert.deepStrictEqual(fromVm(r.tools), []);
    assert.strictEqual(r.pending, null);
  });
  await ok('D2: parseToolTags null 返回空', () => {
    const r = parseToolTags(null);
    assert.deepStrictEqual(fromVm(r.tools), []);
    assert.strictEqual(r.pending, null);
  });
  await ok('D3: parseToolTags 单个 <tool>', () => {
    const r = parseToolTags('<tool>get_marker("abc")</tool>');
    assert.strictEqual(r.tools.length, 1);
    assert.strictEqual(r.tools[0].name, 'get_marker');
    assert.strictEqual(r.tools[0].args, '"abc"');
  });
  await ok('D4: parseToolTags 多工具', () => {
    const r = parseToolTags('<tool>a("x")</tool> text <tool>b("y")</tool>');
    assert.strictEqual(r.tools.length, 2);
    assert.strictEqual(r.tools[0].name, 'a');
    assert.strictEqual(r.tools[1].name, 'b');
  });
  await ok('D5: parseToolTags 工具对象结构', () => {
    const r = parseToolTags('<tool>foo("bar")</tool>');
    assert.ok(r.tools[0].id.startsWith('tool_'));
    assert.strictEqual(r.tools[0].type, 'function');
    assert.strictEqual(r.tools[0].function.name, 'foo');
    assert.strictEqual(r.tools[0].function.arguments, '"bar"');
    assert.ok(r.tools[0].raw.includes('<tool>'));
    assert.ok(r.tools[0].index >= 0);
  });
  await ok('D6: parseToolTags 无参数工具', () => {
    const r = parseToolTags('<tool>foo()</tool>');
    assert.strictEqual(r.tools[0].args, '');
  });

  // ============ Group E: parseToolTags OpenAI JSON (fenced) ============
  await ok('E1: parseToolTags fenced JSON', () => {
    const inner = '{"tool_calls":[{"id":"c1","type":"function","function":{"name":"get_x","arguments":"\\\"{\\\\\\\"a\\\\\\\":1}\\\""}}]}';
    const text = '```json ' + inner + '```';
    const r = parseToolTags(text);
    assert.strictEqual(r.tools.length, 1);
    assert.strictEqual(r.tools[0].name, 'get_x');
    assert.strictEqual(r.tools[0].source, 'openai');
  });
  await ok('E1b: parseToolTags fenced JSON 嵌套参数转义', () => {
    // arguments 值为 JSON 字符串时内层引号必须转义，否则整块不是合法 JSON
    const inner = '{"tool_calls":[{"id":"c1","type":"function","function":{"name":"get_x","arguments":"simple"}}]}';
    const text = '```json ' + inner + '```';
    const r = parseToolTags(text);
    assert.strictEqual(r.tools.length, 1);
    assert.strictEqual(r.tools[0].name, 'get_x');
  });
  await ok('E2: parseToolTags fenced 多工具', () => {
    const inner = '{"tool_calls":[{"id":"c1","type":"function","function":{"name":"a"}},{"id":"c2","type":"function","function":{"name":"b"}}]}';
    const text = '```json ' + inner + '```';
    const r = parseToolTags(text);
    assert.strictEqual(r.tools.length, 2);
  });
  await ok('E3: parseToolTags fenced 无 json 关键字', () => {
    const inner = '{"tool_calls":[{"id":"c1","type":"function","function":{"name":"get_x"}}]}';
    const text = '```' + inner + '```';
    const r = parseToolTags(text);
    assert.strictEqual(r.tools.length, 1);
  });
  await ok('E4: parseToolTags fenced 保留 id', () => {
    const inner = '{"tool_calls":[{"id":"my-id-123","type":"function","function":{"name":"x"}}]}';
    const text = '```json ' + inner + '```';
    const r = parseToolTags(text);
    assert.strictEqual(r.tools[0].id, 'my-id-123');
  });

  // ============ Group F: parseToolTags OpenAI JSON (inline) ============
  await ok('F1: parseToolTags 行内 JSON', () => {
    const text = '{"tool_calls":[{"id":"c1","type":"function","function":{"name":"get_x"}}]}';
    const r = parseToolTags(text);
    assert.strictEqual(r.tools.length, 1);
    assert.strictEqual(r.tools[0].name, 'get_x');
  });
  await ok('F2: parseToolTags fenced 优先于 inline 防重复', () => {
    const inner = '{"tool_calls":[{"id":"c1","type":"function","function":{"name":"a"}}]}';
    const text = '```json ' + inner + '```';
    const r = parseToolTags(text);
    assert.strictEqual(r.tools.length, 1);
  });

  // ============ Group G: parseToolTags pending 检测 ============
  await ok('G1: parseToolTags 完整块无 pending', () => {
    const r = parseToolTags('<tool>foo("x")</tool>');
    assert.strictEqual(r.pending, null);
  });
  await ok('G2: parseToolTags 未闭合 pending', () => {
    const r = parseToolTags('<tool>foo("x');
    assert.ok(r.pending);
    assert.ok(r.pending.startsWith('<tool>'));
  });
  await ok('G3: parseToolTags pending 在末尾', () => {
    const r = parseToolTags('<tool>complete("a")</tool> then <tool>partial');
    assert.ok(r.pending);
  });

  // ============ Group H: parseArgs 实际测试 ============
  await ok('H1: parseArgs JSON 数字', () => {
    assert.deepStrictEqual(fromVm(parseArgs('42')), [42]);
  });
  await ok('H2: parseArgs JSON 布尔值', () => {
    assert.deepStrictEqual(fromVm(parseArgs('true')), [true]);
  });
  await ok('H3: parseArgs JSON null', () => {
    assert.deepStrictEqual(fromVm(parseArgs('null')), [null]);
  });
  await ok('H4: parseArgs JSON 嵌套对象', () => {
    assert.deepStrictEqual(fromVm(parseArgs('{"nested":{"deep":1}}')), [{ nested: { deep: 1 } }]);
  });

  // ============ Group I: unquote 实际测试 ============
  await ok('I1: unquote 引号内特殊字符', () => {
    assert.strictEqual(unquote('"a,b"'), 'a,b');
  });
  await ok('I2: unquote 引号内空格', () => {
    assert.strictEqual(unquote('"hello world"'), 'hello world');
  });
  await ok('I3: unquote 仅引号无内容', () => {
    assert.strictEqual(unquote('""'), '');
  });

  // ============ Group J: parseToolTags 实际测试 ============
  await ok('J1: parseToolTags 混合文本和工具', () => {
    const text = '执行前<tool>check()</tool>然后<tool>run("go")</tool>结束';
    const r = parseToolTags(text);
    assert.strictEqual(r.tools.length, 2);
    assert.strictEqual(r.tools[0].name, 'check');
    assert.strictEqual(r.tools[1].name, 'run');
  });
  await ok('J2: parseToolTags 工具含复杂参数', () => {
    const text = '<tool>search({"q":"北京","limit":10})</tool>';
    const r = parseToolTags(text);
    assert.strictEqual(r.tools[0].args, '{"q":"北京","limit":10}');
  });
  await ok('J3: parseToolTags 空文本', () => {
    const r = parseToolTags('');
    assert.strictEqual(r.tools.length, 0);
    assert.strictEqual(r.pending, null);
  });
  await ok('J4: parseToolTags 只有文本无工具', () => {
    const r = parseToolTags('just some text');
    assert.strictEqual(r.tools.length, 0);
  });
  await ok('J5: parseToolTags 多个独立 fenced JSON', () => {
    const inner1 = '{"tool_calls":[{"id":"a","type":"function","function":{"name":"x"}}]}';
    const inner2 = '{"tool_calls":[{"id":"b","type":"function","function":{"name":"y"}}]}';
    const text = '```json ' + inner1 + '``` and ```json ' + inner2 + '```';
    const r = parseToolTags(text);
    assert.strictEqual(r.tools.length, 2);
  });
  await ok('J6: parseToolTags 无效 JSON 不阻断', () => {
    const text = '```json {"invalid json} ``` <tool>valid("x")</tool>';
    const r = parseToolTags(text);
    assert.strictEqual(r.tools.length, 1);
    assert.strictEqual(r.tools[0].name, 'valid');
  });

  // ============ Group K: 集成测试 ============
  await ok('K1: parseArgs + parseToolTags 配合', () => {
    const text = '<tool>calc(1,2,3)</tool>';
    const r = parseToolTags(text);
    assert.strictEqual(r.tools.length, 1);
    const args = parseArgs(r.tools[0].args);
    assert.deepStrictEqual(fromVm(args), [1, 2, 3]);
  });
  await ok('K2: 所有导出类型正确', () => {
    assert.strictEqual(typeof TOOL_OPEN, 'string');
    assert.strictEqual(typeof TOOL_CLOSE, 'string');
    assert.ok(isRegExp(TOOL_NAME_RE));
    assert.ok(isRegExp(TOOL_RE));
    assert.ok(isRegExp(TOOL_CALLS_JSON_RE));
    assert.ok(isRegExp(TOOL_CALLS_INLINE_RE));
    assert.ok(isRegExp(TOOL_CALL_JSON_RE));
    assert.strictEqual(typeof parseArgs, 'function');
    assert.strictEqual(typeof unquote, 'function');
    assert.strictEqual(typeof parseToolTags, 'function');
  });
  await ok('K3: re-export 一致性验证', () => {
    assert.strictEqual(TOOL_OPEN, CONSTANTS.TOOL_OPEN);
    assert.strictEqual(TOOL_CLOSE, CONSTANTS.TOOL_CLOSE);
    assert.strictEqual(TOOL_NAME_RE, CONSTANTS.TOOL_NAME_RE);
    assert.strictEqual(TOOL_RE, CONSTANTS.TOOL_RE);
    assert.strictEqual(TOOL_CALLS_JSON_RE, CONSTANTS.TOOL_CALLS_JSON_RE);
    assert.strictEqual(TOOL_CALLS_INLINE_RE, CONSTANTS.TOOL_CALLS_INLINE_RE);
    assert.strictEqual(TOOL_CALL_JSON_RE, CONSTANTS.TOOL_CALL_JSON_RE);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});