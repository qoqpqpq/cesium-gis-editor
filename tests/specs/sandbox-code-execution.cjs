// tests/specs/sandbox-code-execution.cjs
// 周期 18 R1: sandbox.js 代码沙箱 + 工具解析测试
// 目标：≥ 30 PASS
//
// 覆盖：
//   - executeCesiumCode 基本功能（静态扫描）
//   - parseCodeBlocks 代码块解析
//   - parseToolTags 工具标签解析
//   - messageToSegmentsFull 消息分段
//   - 裸代码启发式识别

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const SANDBOX_SRC = fs.readFileSync(path.join(ROOT, 'client/src/pages/gis/sandbox.js'), 'utf8');

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
  console.log('=== sandbox-code-execution ===');

  // ============ Group A: 静态扫描 - 导出验证 ============
  await ok('A1: 导出 executeCesiumCode 函数', () => {
    assert.match(SANDBOX_SRC, /export\s+async\s+function\s+executeCesiumCode/);
  });
  await ok('A2: 导出 parseCodeBlocks 函数', () => {
    assert.match(SANDBOX_SRC, /export\s+function\s+parseCodeBlocks/);
  });
  await ok('A3: 导出 parseToolTags 函数', () => {
    assert.match(SANDBOX_SRC, /export\s+function\s+parseToolTags/);
  });
  await ok('A4: 导出 messageToSegmentsFull 函数', () => {
    assert.match(SANDBOX_SRC, /export\s+function\s+messageToSegmentsFull/);
  });

  // ============ Group B: 静态扫描 - 常量定义 ============
  await ok('B1: 定义 DEFAULT_TIMEOUT_MS 常量', () => {
    assert.match(SANDBOX_SRC, /const\s+DEFAULT_TIMEOUT_MS\s*=\s*5000/);
  });
  await ok('B2: 定义 TOOL_RE 正则', () => {
    assert.match(SANDBOX_SRC, /const\s+TOOL_RE\s*=/);
  });
  await ok('B3: 定义 TOOL_CALL_JSON_RE 正则', () => {
    assert.match(SANDBOX_SRC, /const\s+TOOL_CALL_JSON_RE\s*=/);
  });

  // ============ Group C: executeCesiumCode 逻辑验证 ============
  await ok('C1: 接受 ctx, code, opts 参数', () => {
    assert.match(SANDBOX_SRC, /function\s+executeCesiumCode\s*\(\s*ctx\s*,\s*code\s*,\s*opts\s*=\s*\{\}\s*\)/);
  });
  await ok('C2: 使用 DEFAULT_TIMEOUT_MS', () => {
    assert.match(SANDBOX_SRC, /opts\.timeoutMs\s*\?\?\s*DEFAULT_TIMEOUT_MS/);
  });
  await ok('C3: 备份 console 方法', () => {
    assert.match(SANDBOX_SRC, /const\s+orig\s*=\s*\{\}/);
    assert.match(SANDBOX_SRC, /orig\[k\]\s*=\s*console\[k\]/);
  });
  await ok('C4: 使用 Function 构造函数执行代码', () => {
    assert.match(SANDBOX_SRC, /new\s+Function\s*\(/);
  });
  await ok('C5: 注入 viewer, Cesium, scene, entities, canvas', () => {
    assert.match(SANDBOX_SRC, /'viewer'/);
    assert.match(SANDBOX_SRC, /'Cesium'/);
    assert.match(SANDBOX_SRC, /'scene'/);
    assert.match(SANDBOX_SRC, /'entities'/);
    assert.match(SANDBOX_SRC, /'canvas'/);
  });
  await ok('C6: 使用 Promise.race 实现超时', () => {
    assert.match(SANDBOX_SRC, /Promise\.race/);
    assert.match(SANDBOX_SRC, /setTimeout/);
  });
  await ok('C7: 返回 { ok, logs, error, durationMs }', () => {
    assert.match(SANDBOX_SRC, /return\s*\{\s*ok:\s*true\s*,\s*logs\s*,\s*durationMs/);
    assert.match(SANDBOX_SRC, /ok:\s*false/);
    assert.match(SANDBOX_SRC, /error:\s*parseError/);
  });
  await ok('C8: finally 块恢复 console', () => {
    assert.match(SANDBOX_SRC, /finally\s*\{/);
    assert.match(SANDBOX_SRC, /console\[k\]\s*=\s*fn/);
  });

  // ============ Group D: parseCodeBlocks 逻辑验证 ============
  await ok('D1: 接受 text 参数', () => {
    assert.match(SANDBOX_SRC, /function\s+parseCodeBlocks\s*\(\s*text\s*\)/);
  });
  await ok('D2: 使用正则匹配 fence', () => {
    assert.match(SANDBOX_SRC, /\/\^```/);
  });
  await ok('D3: 返回 { inBlock, blocks, texts, trailing }', () => {
    assert.match(SANDBOX_SRC, /return\s*\{\s*inBlock\s*,\s*blocks\s*,\s*texts\s*,\s*trailing/);
  });
  await ok('D4: blocks 包含 { lang, code }', () => {
    assert.match(SANDBOX_SRC, /blocks\.push\s*\(\s*\{\s*lang\s*:/);
  });
  await ok('D5: texts 包含 { content }', () => {
    assert.match(SANDBOX_SRC, /texts\.push\s*\(\s*\{\s*content/);
  });

  // ============ Group E: parseToolTags 逻辑验证 ============
  await ok('E1: 接受 text 参数', () => {
    assert.match(SANDBOX_SRC, /function\s+parseToolTags\s*\(\s*text\s*\)/);
  });
  await ok('E2: 使用 TOOL_RE 匹配', () => {
    assert.match(SANDBOX_SRC, /TOOL_RE\.exec/);
  });
  await ok('E3: 返回 { tools, pending }', () => {
    assert.match(SANDBOX_SRC, /return\s*\{\s*tools\s*,\s*pending/);
  });
  await ok('E4: tools 包含 { name, args, raw, index }', () => {
    assert.match(SANDBOX_SRC, /name:\s*m\[1\]/);
    assert.match(SANDBOX_SRC, /args:\s*m\[2\]/);
    assert.match(SANDBOX_SRC, /raw:\s*m\[0\]/);
    assert.match(SANDBOX_SRC, /index:\s*m\.index/);
  });
  await ok('E5: 检测未闭合 tool 标签', () => {
    assert.match(SANDBOX_SRC, /lastIndexOf\s*\(\s*['"]<tool>['"]/);
    assert.match(SANDBOX_SRC, /lastIndexOf\s*\(\s*['"]<\/tool>['"]/);
  });
  await ok('E6: 支持 OpenAI 风格 JSON fallback', () => {
    assert.match(SANDBOX_SRC, /TOOL_CALL_JSON_RE/);
  });

  // ============ Group F: messageToSegmentsFull 逻辑验证 ============
  await ok('F1: 接受 rawText 参数', () => {
    assert.match(SANDBOX_SRC, /function\s+messageToSegmentsFull\s*\(\s*rawText\s*\)/);
  });
  await ok('F2: 抽取 tool 标签位置', () => {
    assert.match(SANDBOX_SRC, /toolMatches/);
  });
  await ok('F3: 返回 segments 数组', () => {
    assert.match(SANDBOX_SRC, /return\s+segs/);
  });
  await ok('F4: 支持 text / code / tool 交替', () => {
    assert.match(SANDBOX_SRC, /type:\s*['"]text['"]/);
    assert.match(SANDBOX_SRC, /type:\s*['"]code['"]/);
    assert.match(SANDBOX_SRC, /type:\s*['"]tool['"]/);
  });
  await ok('F5: 支持 text-pending 类型', () => {
    assert.match(SANDBOX_SRC, /type:\s*['"]text-pending['"]/);
  });

  // ============ Group G: parseCodeBlocks 实际测试 ============
  function parseCodeBlocks(text) {
    const blocks = [];
    const texts = [];
    const lines = text.split('\n');
    let i = 0;
    let buf = [];
    let textBuf = [];
    let inBlock = false;
    let lang = '';

    while (i < lines.length) {
      const line = lines[i];
      const fence = line.match(/^```([a-zA-Z0-9_-]*)?\s*$/);
      if (fence) {
        if (textBuf.length) {
          texts.push({ content: textBuf.join('\n') });
          textBuf = [];
        }
        if (inBlock) {
          blocks.push({ lang: lang || 'js', code: buf.join('\n') });
          buf = [];
          lang = '';
          inBlock = false;
        } else {
          inBlock = true;
          lang = fence[1] || '';
        }
      } else if (inBlock) {
        buf.push(line);
      } else {
        textBuf.push(line);
      }
      i++;
    }
    if (!inBlock && textBuf.length) {
      texts.push({ content: textBuf.join('\n') });
    }
    return {
      inBlock,
      blocks,
      texts,
      trailing: inBlock ? buf.join('\n') : '',
    };
  }

  await ok('G1: 解析单个代码块', () => {
    const text = '```js\nconst x = 1;\n```';
    const result = parseCodeBlocks(text);
    assert.equal(result.blocks.length, 1);
    assert.equal(result.blocks[0].lang, 'js');
    assert.equal(result.blocks[0].code, 'const x = 1;');
  });
  await ok('G2: 解析多个代码块', () => {
    const text = '```js\nconst x = 1;\n```\n中间文本\n```python\nprint("hi")\n```';
    const result = parseCodeBlocks(text);
    assert.equal(result.blocks.length, 2);
    assert.equal(result.blocks[0].lang, 'js');
    assert.equal(result.blocks[1].lang, 'python');
  });
  await ok('G3: 解析纯文本（无代码块）', () => {
    const text = '这是一段普通文本\n没有代码块';
    const result = parseCodeBlocks(text);
    assert.equal(result.blocks.length, 0);
    assert.equal(result.texts.length, 1);
  });
  await ok('G4: 解析未闭合代码块', () => {
    const text = '```js\nconst x = 1;';
    const result = parseCodeBlocks(text);
    assert.equal(result.inBlock, true);
    assert.equal(result.trailing, 'const x = 1;');
  });
  await ok('G5: 解析空字符串', () => {
    const result = parseCodeBlocks('');
    assert.equal(result.blocks.length, 0);
    assert.equal(result.inBlock, false);
  });

  // ============ Group H: parseToolTags 实际测试 ============
  function parseToolTags(text) {
    const tools = [];
    const TOOL_RE = /<tool>([a-z_][a-z0-9_]*)\(([^)]*)\)<\/tool>/gi;
    let m;
    TOOL_RE.lastIndex = 0;
    while ((m = TOOL_RE.exec(text)) !== null) {
      tools.push({
        name: m[1],
        args: m[2].trim(),
        raw: m[0],
        index: m.index,
      });
    }
    const lastOpen = text.lastIndexOf('<tool>');
    const lastClose = text.lastIndexOf('</tool>');
    let pending = null;
    if (lastOpen > lastClose) {
      pending = text.slice(lastOpen);
    }
    return { tools, pending };
  }

  await ok('H1: 解析单个工具调用', () => {
    const text = 'Hello <tool>web_search(Cesium)</tool> world';
    const result = parseToolTags(text);
    assert.equal(result.tools.length, 1);
    assert.equal(result.tools[0].name, 'web_search');
    assert.equal(result.tools[0].args, 'Cesium');
  });
  await ok('H2: 解析多个工具调用', () => {
    const text = '<tool>tool1(arg1)</tool> <tool>tool2(arg2)</tool>';
    const result = parseToolTags(text);
    assert.equal(result.tools.length, 2);
    assert.equal(result.tools[0].name, 'tool1');
    assert.equal(result.tools[1].name, 'tool2');
  });
  await ok('H3: 检测未闭合工具标签', () => {
    const text = 'Hello <tool>web_search(Cesium)';
    const result = parseToolTags(text);
    assert.equal(result.tools.length, 0);
    assert.ok(result.pending);
  });
  await ok('H4: 解析无工具标签文本', () => {
    const text = 'Hello world, no tools here';
    const result = parseToolTags(text);
    assert.equal(result.tools.length, 0);
    assert.equal(result.pending, null);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
