// tests/specs/protocol-shared.cjs
// 周期 6 P2-4 + P2-6: 协议共享模块 + OpenAI tool_calls 双格式
//
// 背景：周期 1-3 协议字符串 `<tool>name(args)</tool>` 在三处独立实现。
//   周期 6 P2-4: 抽到 server/agent/protocol/index.js（共享字面 + 解析）。
//   周期 6 P2-6: 同时支持 OpenAI tool_calls[] 双格式（Claude / Ollama / 通用 LLM）。
//
// 验收：
//   1. 静态扫描：server/agent/protocol/index.js 存在并暴露 parseToolTags / TOOL_OPEN / TOOL_CLOSE
//   2. 静态扫描：parse.js 改为 re-export（向后兼容）
//   3. 行为：<tool>web_search(北京天气)</tool> 仍能解析（周期 1 行为不变）
//   4. 行为：流式未闭合的 <tool> 返回 pending
//   5. 行为：OpenAI ```json {"tool_calls":[...]} ``` 格式解析
//   6. 行为：OpenAI 行内 JSON（无 markdown 包裹）也解析
//   7. 行为：两种格式混合时同时识别
//   8. 行为：OpenAI 解析后 source='openai' 标记
//   9. 行为：parseArgs 单 token / JSON 数组 / 引号字符串
//   10. 行为：与周期 1 老 spec agent-parse-tool-uuid.cjs 行为一致（向后兼容）

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const protocolIndex = require('../../server/agent/protocol');
const protocolParse = require('../../server/agent/protocol/parse');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

const PROTOCOL_INDEX_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../server/agent/protocol/index.js'),
  'utf8',
);
const PROTOCOL_PARSE_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../server/agent/protocol/parse.js'),
  'utf8',
);

(async () => {
  console.log('=== protocol-shared ===');

  // ---- 1. 静态扫描 ----
  await test('server/agent/protocol/index.js 存在', () => {
    const p = path.resolve(__dirname, '../../server/agent/protocol/index.js');
    assert.ok(fs.existsSync(p));
  });
  await test('protocol/index.js 暴露 parseToolTags', () => {
    assert.match(PROTOCOL_INDEX_SRC, /function\s+parseToolTags/);
    assert.match(PROTOCOL_INDEX_SRC, /parseToolTags/);
  });
  await test('protocol/index.js 暴露 TOOL_OPEN / TOOL_CLOSE 常量', () => {
    assert.match(PROTOCOL_INDEX_SRC, /const\s+TOOL_OPEN\s*=\s*['"]<tool>['"]/);
    assert.match(PROTOCOL_INDEX_SRC, /const\s+TOOL_CLOSE\s*=\s*['"]<\/tool>['"]/);
  });
  await test('parse.js 改为 re-export（向后兼容）', () => {
    assert.match(PROTOCOL_PARSE_SRC, /require\(['"]\.\/index['"]\)/);
    assert.match(PROTOCOL_PARSE_SRC, /module\.exports\s*=\s*\{[^}]*parseToolTags/);
  });
  await test('protocol/index.js 包含 OpenAI 解析逻辑（TOOL_CALLS_JSON_RE / TOOL_CALLS_INLINE_RE）', () => {
    assert.match(PROTOCOL_INDEX_SRC, /TOOL_CALLS_JSON_RE/);
    assert.match(PROTOCOL_INDEX_SRC, /TOOL_CALLS_INLINE_RE/);
    assert.match(PROTOCOL_INDEX_SRC, /tool_calls/);
  });

  // ---- 2. 行为：<tool>web_search(北京天气)</tool> ----
  await test('解析 <tool>name(args)</tool> 本地协议', () => {
    const r = protocolIndex.parseToolTags('<tool>web_search(北京天气)</tool>');
    assert.strictEqual(r.tools.length, 1);
    assert.strictEqual(r.tools[0].name, 'web_search');
    assert.strictEqual(r.tools[0].args, '北京天气');
    assert.strictEqual(r.tools[0].type, 'function');
    assert.strictEqual(r.tools[0].function.name, 'web_search');
    assert.match(r.tools[0].id, /^tool_/);
  });

  // ---- 3. 行为：流式未闭合 ----
  await test('流式未闭合 <tool> 返回 pending', () => {
    const r = protocolIndex.parseToolTags('我帮你查\n<tool>web_search(北京');
    assert.strictEqual(r.tools.length, 0);
    assert.ok(r.pending, '应返回 pending');
    assert.match(r.pending, /<tool>web_search\(北京/);
  });

  // ---- 4. 行为：已闭合 + pending 混合 ----
  await test('流式混合：已闭合 <tool></tool> + 后续未闭合', () => {
    const r = protocolIndex.parseToolTags('<tool>web_search(A)</tool> 好的<tool>web_search(B');
    assert.strictEqual(r.tools.length, 1);
    assert.strictEqual(r.tools[0].args, 'A');
    assert.ok(r.pending, '后续未闭合应 pending');
  });

  // ---- 5. 行为：OpenAI ```json 格式 ----
  await test('解析 OpenAI ```json {"tool_calls":[{...}]} ``` 格式', () => {
    const text = '```json\n{"tool_calls":[{"id":"call_abc","type":"function","function":{"name":"web_search","arguments":"\\"北京天气\\""}}]}\n```';
    const r = protocolIndex.parseToolTags(text);
    assert.strictEqual(r.tools.length, 1);
    assert.strictEqual(r.tools[0].name, 'web_search');
    assert.strictEqual(r.tools[0].function.name, 'web_search');
    assert.strictEqual(r.tools[0].id, 'call_abc');
    assert.strictEqual(r.tools[0].source, 'openai');
  });

  // ---- 6. 行为：OpenAI 行内 JSON ----
  await test('解析 OpenAI 行内 JSON（无 markdown 包裹）', () => {
    const text = '查询结果：{"tool_calls":[{"id":"call_xyz","type":"function","function":{"name":"web_search","arguments":"上海"}}]}';
    const r = protocolIndex.parseToolTags(text);
    assert.strictEqual(r.tools.length, 1);
    assert.strictEqual(r.tools[0].function.name, 'web_search');
    assert.strictEqual(r.tools[0].id, 'call_xyz');
  });

  // ---- 7. 行为：两种格式混合 ----
  await test('本地 <tool> + OpenAI tool_calls 混合识别', () => {
    const text = '<tool>foo(1)</tool> 中间文字 {"tool_calls":[{"id":"a","type":"function","function":{"name":"bar","arguments":"2"}}]}';
    const r = protocolIndex.parseToolTags(text);
    assert.strictEqual(r.tools.length, 2);
    const names = r.tools.map((t) => t.name);
    assert.ok(names.includes('foo'));
    assert.ok(names.includes('bar'));
  });

  // ---- 8. 行为：OpenAI source 标记 ----
  await test('OpenAI 解析后 source="openai" 标记', () => {
    const text = '```json\n{"tool_calls":[{"id":"x","type":"function","function":{"name":"a","arguments":"b"}}]}\n```';
    const r = protocolIndex.parseToolTags(text);
    assert.strictEqual(r.tools[0].source, 'openai');
  });
  await test('本地 <tool> 解析无 source 字段', () => {
    const r = protocolIndex.parseToolTags('<tool>a(b)</tool>');
    assert.strictEqual(r.tools[0].source, undefined);
  });

  // ---- 9. 行为：parseArgs ----
  await test('parseArgs 单 token', () => {
    const r = protocolIndex.parseArgs('hello');
    assert.deepStrictEqual(r, ['hello']);
  });
  await test('parseArgs JSON 数组', () => {
    const r = protocolIndex.parseArgs('"a", 1, true');
    assert.deepStrictEqual(r, ['a', 1, true]);
  });
  await test('parseArgs 字符串 + 引号', () => {
    const r = protocolIndex.parseArgs('"hello world", \'foo bar\'');
    assert.deepStrictEqual(r, ['hello world', 'foo bar']);
  });
  await test('parseArgs 嵌套括号', () => {
    const r = protocolIndex.parseArgs('"a", [1, 2, 3], "c"');
    assert.deepStrictEqual(r, ['a', [1, 2, 3], 'c']);
  });

  // ---- 10. 向后兼容：parse.js 的 parseToolTags 与 protocol/index 一致 ----
  await test('parse.js 的 parseToolTags 与 protocol/index 行为一致', () => {
    const text = '<tool>foo(bar)</tool>';
    const a = protocolIndex.parseToolTags(text);
    const b = protocolParse.parseToolTags(text);
    assert.strictEqual(a.tools.length, b.tools.length);
    assert.strictEqual(a.tools[0].name, b.tools[0].name);
  });
  await test('parse.js 暴露 TOOL_OPEN / TOOL_CLOSE', () => {
    assert.strictEqual(protocolParse.TOOL_OPEN, '<tool>');
    assert.strictEqual(protocolParse.TOOL_CLOSE, '</tool>');
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
