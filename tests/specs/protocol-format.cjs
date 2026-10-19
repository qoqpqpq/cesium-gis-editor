// tests/specs/protocol-format.cjs
// 周期 21 R1: protocol/format.js 协议格式化测试
// 目标：≥ 15 PASS
//
// 覆盖：
//   - formatToolResult 工具结果格式化
//   - formatSystemNote 系统笔记格式化
//   - lastToolSignature 最后工具签名检测
//   - TOOL_RESULT_RE 正则表达式
//   - 边界情况处理

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const FORMAT_SRC = fs.readFileSync(path.join(ROOT, 'server/agent/protocol/format.js'), 'utf8');

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
  console.log('=== protocol-format ===');

  // ============ Group A: 静态扫描 - 导出验证 ============
  await ok('A1: 导出 formatToolResult', () => {
    assert.match(FORMAT_SRC, /formatToolResult/);
  });
  await ok('A2: 导出 formatSystemNote', () => {
    assert.match(FORMAT_SRC, /formatSystemNote/);
  });
  await ok('A3: 导出 lastToolSignature', () => {
    assert.match(FORMAT_SRC, /lastToolSignature/);
  });
  await ok('A4: 导出 TOOL_RESULT_RE', () => {
    assert.match(FORMAT_SRC, /TOOL_RESULT_RE/);
  });

  // ============ Group B: TOOL_RESULT_RE 正则验证 ============
  await ok('B1: 定义 TOOL_RESULT_RE', () => {
    assert.match(FORMAT_SRC, /const\s+TOOL_RESULT_RE\s*=\s*\/\^/);
  });
  await ok('B2: 匹配 <<<TOOL_RESULT', () => {
    assert.match(FORMAT_SRC, /TOOL_RESULT/);
  });
  await ok('B3: 匹配工具名', () => {
    assert.match(FORMAT_SRC, /\(\[a-z_\]\[a-z0-9_\]\*\)/);
  });
  await ok('B4: 匹配 OK|ERROR', () => {
    assert.match(FORMAT_SRC, /\(OK\|ERROR\)/);
  });
  await ok('B5: 匹配 <<<END>>>', () => {
    assert.match(FORMAT_SRC, /<<<END>>>/);
  });
  await ok('B6: 使用 [\s\S]*? 匹配 body', () => {
    assert.match(FORMAT_SRC, /\\[\\s\\S\\]/);
  });

  // ============ Group C: formatToolResult 逻辑验证 ============
  await ok('C1: 接受 name, ok, result 参数', () => {
    assert.match(FORMAT_SRC, /function\s+formatToolResult\s*\(\s*name\s*,\s*ok\s*,\s*result\s*\)/);
  });
  await ok('C2: 构建 tag', () => {
    assert.match(FORMAT_SRC, /const\s+tag\s*=\s*`<<<TOOL_RESULT\s+\$\{name\}/);
  });
  await ok('C3: ok 为 true 时输出 OK', () => {
    assert.match(FORMAT_SRC, /ok\s*\?\s*['"]OK['"]/);
  });
  await ok('C4: ok 为 false 时输出 ERROR', () => {
    assert.match(FORMAT_SRC, /['"]ERROR['"]/);
  });
  await ok('C5: 构建 end', () => {
    assert.match(FORMAT_SRC, /const\s+end\s*=\s*['"]<<<END>>>['"]/);
  });
  await ok('C6: result 为字符串时直接使用', () => {
    assert.match(FORMAT_SRC, /typeof\s+result\s*===\s*['"]string['"]/);
  });
  await ok('C7: result 非字符串时 JSON.stringify', () => {
    assert.match(FORMAT_SRC, /JSON\.stringify\s*\(\s*result\s*,\s*null\s*,\s*0\s*\)/);
  });
  await ok('C8: 返回格式化字符串', () => {
    assert.match(FORMAT_SRC, /return\s+`\$\{tag\}\\n\$\{body\}\\n\$\{end\}`/);
  });

  // ============ Group D: formatSystemNote 逻辑验证 ============
  await ok('D1: 接受 body 参数', () => {
    assert.match(FORMAT_SRC, /function\s+formatSystemNote\s*\(\s*body\s*\)/);
  });
  await ok('D2: 返回格式化的系统笔记', () => {
    assert.match(FORMAT_SRC, /return\s+`<<<SYSTEM_NOTE>>>/);
  });

  // ============ Group E: lastToolSignature 逻辑验证 ============
  await ok('E1: 接受 text 参数', () => {
    assert.match(FORMAT_SRC, /function\s+lastToolSignature\s*\(\s*text\s*\)/);
  });
  await ok('E2: 使用 match 方法', () => {
    assert.match(FORMAT_SRC, /text\.match\s*\(\s*TOOL_RESULT_RE\s*\)/);
  });
  await ok('E3: 匹配成功返回签名', () => {
    assert.match(FORMAT_SRC, /m\s*\?\s*`\$\{m\[1\]\}:\$\{m\[2\]\}`/);
  });
  await ok('E4: 匹配失败返回 null', () => {
    assert.match(FORMAT_SRC, /:\s*null/);
  });

  // ============ Group F: 实际测试 - formatToolResult ============
  const { formatToolResult, formatSystemNote, lastToolSignature, TOOL_RESULT_RE } = require(path.join(ROOT, 'server/agent/protocol/format.js'));

  await ok('F1: formatToolResult 成功', () => {
    const result = formatToolResult('test_tool', true, 'test result');
    assert.match(result, /<<<TOOL_RESULT test_tool OK>>>/);
    assert.match(result, /test result/);
    assert.match(result, /<<<END>>>/);
  });

  await ok('F2: formatToolResult 失败', () => {
    const result = formatToolResult('test_tool', false, 'error message');
    assert.match(result, /<<<TOOL_RESULT test_tool ERROR>>>/);
    assert.match(result, /error message/);
    assert.match(result, /<<<END>>>/);
  });

  await ok('F3: formatToolResult 对象 result', () => {
    const result = formatToolResult('test_tool', true, { key: 'value' });
    assert.match(result, /"key":"value"/);
  });

  await ok('F4: formatToolResult 数字 result', () => {
    const result = formatToolResult('test_tool', true, 123);
    assert.match(result, /123/);
  });

  await ok('F5: formatToolResult 数组 result', () => {
    const result = formatToolResult('test_tool', true, [1, 2, 3]);
    assert.match(result, /\[1,2,3\]/);
  });

  await ok('F6: formatToolResult 多行 body', () => {
    const result = formatToolResult('test_tool', true, 'line1\nline2');
    assert.match(result, /line1\nline2/);
  });

  await ok('F7: formatToolResult 特殊字符 name', () => {
    const result = formatToolResult('tool_123', true, 'test');
    assert.match(result, /<<<TOOL_RESULT tool_123 OK>>>/);
  });

  // ============ Group G: 实际测试 - formatSystemNote ============
  await ok('G1: formatSystemNote 基本测试', () => {
    const result = formatSystemNote('test note');
    assert.match(result, /<<<SYSTEM_NOTE>>>/);
    assert.match(result, /test note/);
    assert.match(result, /<<<END>>>/);
  });

  await ok('G2: formatSystemNote 多行 body', () => {
    const result = formatSystemNote('line1\nline2');
    assert.match(result, /line1\nline2/);
  });

  await ok('G3: formatSystemNote 空 body', () => {
    const result = formatSystemNote('');
    assert.match(result, /<<<SYSTEM_NOTE>>>\n\n<<<END>>>/);
  });

  // ============ Group H: 实际测试 - lastToolSignature ============
  await ok('H1: lastToolSignature 匹配成功', () => {
    const text = '<<<TOOL_RESULT test_tool OK>>>\ntest result\n<<<END>>>';
    const sig = lastToolSignature(text);
    assert.equal(sig, 'test_tool:OK');
  });

  await ok('H2: lastToolSignature 匹配失败', () => {
    const text = '<<<TOOL_RESULT test_tool ERROR>>>\nerror message\n<<<END>>>';
    const sig = lastToolSignature(text);
    assert.equal(sig, 'test_tool:ERROR');
  });

  await ok('H3: lastToolSignature 无匹配返回 null', () => {
    const text = 'no tool result here';
    const sig = lastToolSignature(text);
    assert.equal(sig, null);
  });

  await ok('H4: lastToolSignature 空字符串返回 null', () => {
    const sig = lastToolSignature('');
    assert.equal(sig, null);
  });

  await ok('H5: lastToolSignature 多个块返回第一个匹配', () => {
    const text = '<<<TOOL_RESULT tool1 OK>>>\nresult1\n<<<END>>>\n<<<TOOL_RESULT tool2 ERROR>>>\nresult2\n<<<END>>>';
    const sig = lastToolSignature(text);
    assert.equal(sig, 'tool1:OK');
  });

  await ok('H6: lastToolSignature 格式错误返回 null', () => {
    const text = '<<<TOOL_RESULT tool1>>>result<<<END>>>';
    const sig = lastToolSignature(text);
    assert.equal(sig, null);
  });

  // ============ Group I: 实际测试 - TOOL_RESULT_RE ============
  await ok('I1: TOOL_RESULT_RE 匹配完整格式', () => {
    const text = '<<<TOOL_RESULT test_tool OK>>>\ntest result\n<<<END>>>';
    assert.ok(TOOL_RESULT_RE.test(text));
  });

  await ok('I2: TOOL_RESULT_RE 不匹配格式错误', () => {
    const text = '<<<TOOL_RESULT tool1>>>result<<<END>>>';
    assert.ok(!TOOL_RESULT_RE.test(text));
  });

  await ok('I3: TOOL_RESULT_RE 匹配 ERROR', () => {
    const text = '<<<TOOL_RESULT test_tool ERROR>>>\nerror message\n<<<END>>>';
    assert.ok(TOOL_RESULT_RE.test(text));
  });

  await ok('I4: TOOL_RESULT_RE 不匹配空 name', () => {
    const text = '<<<TOOL_RESULT  OK>>>\nresult\n<<<END>>>';
    assert.ok(!TOOL_RESULT_RE.test(text));
  });

  await ok('I5: TOOL_RESULT_RE 匹配特殊 name', () => {
    const text = '<<<TOOL_RESULT tool_123_test OK>>>\nresult\n<<<END>>>';
    assert.ok(TOOL_RESULT_RE.test(text));
  });

  await ok('I6: TOOL_RESULT_RE 不匹配非法 name', () => {
    const text = '<<<TOOL_RESULT Tool OK>>>\nresult\n<<<END>>>';
    assert.ok(!TOOL_RESULT_RE.test(text));
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
