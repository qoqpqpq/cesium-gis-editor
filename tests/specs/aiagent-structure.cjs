// tests/specs/aiagent-structure.cjs
// 周期 16 R3: aiAgent.js 结构分析 + 拆分方案验证
// 目标：≥ 15 PASS
//
// 覆盖：
//   - 文件存在 + 大小验证
//   - 导出验证
//   - 常量定义验证
//   - 函数定义验证
//   - 依赖关系验证

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const AIAGENT_PATH = path.join(ROOT, 'client/src/pages/gis/aiAgent.js');

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
  console.log('=== aiagent-structure ===');

  // 读取文件内容
  const src = fs.readFileSync(AIAGENT_PATH, 'utf8');
  const lines = src.split('\n');

  // ============ Group A: 文件基本信息 ============
  await ok('A1: aiAgent.js 文件存在', () => {
    assert.ok(fs.existsSync(AIAGENT_PATH));
  });
  await ok('A2: aiAgent.js 行数 > 400', () => {
    assert.ok(lines.length > 400, `Expected > 400 lines, got ${lines.length}`);
  });
  await ok('A3: aiAgent.js 行数 < 500', () => {
    assert.ok(lines.length < 500, `Expected < 500 lines, got ${lines.length}`);
  });

  // ============ Group B: 常量定义验证 ============
  await ok('B1: 定义 MAX_TURNS 常量', () => {
    assert.match(src, /const\s+MAX_TURNS\s*=\s*6/);
  });
  await ok('B2: 定义 MAX_TRANSCRIPT_CHARS 常量', () => {
    assert.match(src, /const\s+MAX_TRANSCRIPT_CHARS\s*=\s*80_000/);
  });
  await ok('B3: 定义 CONFIRM_TIMEOUT_MS 常量', () => {
    assert.match(src, /const\s+CONFIRM_TIMEOUT_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
  });
  await ok('B4: 定义 THINK_TAG_RE 正则', () => {
    assert.match(src, /const\s+THINK_TAG_RE\s*=/);
  });

  // ============ Group C: 函数定义验证 ============
  await ok('C1: 定义 formatToolResult 函数', () => {
    assert.match(src, /function\s+formatToolResult\s*\(/);
  });
  await ok('C2: 定义 completedTools 函数', () => {
    assert.match(src, /function\s+completedTools\s*\(/);
  });
  await ok('C3: 定义 streamOnceWithEndpoint 函数', () => {
    assert.match(src, /function\s+streamOnceWithEndpoint\s*\(/);
  });
  await ok('C4: 定义 streamOnce 函数', () => {
    assert.match(src, /function\s+streamOnce\s*\(/);
  });
  await ok('C5: 定义 trimTranscript 函数', () => {
    assert.match(src, /function\s+trimTranscript\s*\(/);
  });
  await ok('C6: 定义 runAgentLoop 导出函数', () => {
    assert.match(src, /export\s+async\s+function\s+runAgentLoop\s*\(/);
  });

  // ============ Group D: 依赖关系验证 ============
  await ok('D1: 导入 aiApi', () => {
    assert.match(src, /import\s+\{\s*aiApi\s*\}\s+from\s+['"]\.\.\/\.\.\/api\/index\.js['"]/);
  });
  await ok('D2: 导入 parseToolTags', () => {
    assert.match(src, /import\s+\{\s*parseToolTags\s*\}\s+from\s+['"]\.\/sandbox\.js['"]/);
  });
  await ok('D3: 导入 executeTool', () => {
    assert.match(src, /executeTool/);
  });
  await ok('D4: 导入 executeWriteToolPayload', () => {
    assert.match(src, /executeWriteToolPayload/);
  });
  await ok('D5: 导入 describeWriteTool', () => {
    assert.match(src, /describeWriteTool/);
  });
  await ok('D6: 导入 shouldFallbackToLegacy', () => {
    assert.match(src, /import\s+\{\s*shouldFallbackToLegacy\s*\}\s+from\s+['"]\.\/legacyFallback\.js['"]/);
  });

  // ============ Group E: 关键逻辑验证 ============
  await ok('E1: 含 TOOL_RESULT 哨兵格式', () => {
    assert.match(src, /TOOL_RESULT/);
  });
  await ok('E2: 含 SYSTEM_NOTE 哨兵格式', () => {
    assert.match(src, /SYSTEM_NOTE/);
  });
  await ok('E3: 含 SSE event 解析（delta/tool_calls/usage/done/error）', () => {
    assert.match(src, /event\s*===\s*['"]delta['"]/);
    assert.match(src, /event\s*===\s*['"]tool_calls['"]/);
    assert.match(src, /event\s*===\s*['"]usage['"]/);
    assert.match(src, /event\s*===\s*['"]done['"]/);
    assert.match(src, /event\s*===\s*['"]error['"]/);
  });
  await ok('E4: 含 fallback 逻辑（agent → chat/stream）', () => {
    assert.match(src, /fallbackNeeded/);
    assert.match(src, /streamOnceWithEndpoint\s*\(\s*agentUrl/);
    assert.match(src, /streamOnceWithEndpoint\s*\(\s*legacyUrl/);
  });
  await ok('E5: 含工具去重逻辑', () => {
    assert.match(src, /seen\s*=\s*new\s+Set/);
    assert.match(src, /sigs\.find/);
  });
  await ok('E6: 含写工具确认逻辑', () => {
    assert.match(src, /needsConfirm/);
    assert.match(src, /confirmWrite/);
    assert.match(src, /CONFIRM_TIMEOUT_MS/);
  });
  await ok('E7: 含 transcript 裁剪逻辑', () => {
    assert.match(src, /trimTranscript/);
    assert.match(src, /MAX_TRANSCRIPT_CHARS/);
  });

  // ============ Group F: 拆分方案文档验证 ============
  const SPLIT_PLAN_PATH = path.join(ROOT, 'docs/cycles/cycle-16-aiagent-split-plan.md');
  const splitPlan = fs.readFileSync(SPLIT_PLAN_PATH, 'utf8');

  await ok('F1: 拆分方案文档存在', () => {
    assert.ok(fs.existsSync(SPLIT_PLAN_PATH));
  });
  await ok('F2: 拆分方案含 3 个方案', () => {
    assert.match(splitPlan, /方案\s*A/);
    assert.match(splitPlan, /方案\s*B/);
    assert.match(splitPlan, /方案\s*C/);
  });
  await ok('F3: 拆分方案含优先级表', () => {
    assert.match(splitPlan, /优先级/);
    assert.match(splitPlan, /P0/);
    assert.match(splitPlan, /P1/);
  });
  await ok('F4: 拆分方案含风险评估', () => {
    assert.match(splitPlan, /风险评估/);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
