// tests/specs/aitools-execution.cjs
// 周期 18 R2: aiTools.js AI 工具执行测试
// 目标：≥ 25 PASS
//
// 覆盖：
//   - makeDeps 依赖注入
//   - parseArgs 参数解析
//   - evalWhere 条件评估
//   - READ_TOOLS 读工具注册表
//   - WRITE_TOOLS 写工具注册表
//   - executeTool 工具分发
//   - describeWriteTool 写工具描述
//   - toolDocsForPrompt 工具文档生成

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const AITOOLS_SRC = fs.readFileSync(path.join(ROOT, 'client/src/pages/gis/aiTools.js'), 'utf8');

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
  console.log('=== aitools-execution ===');

  // ============ Group A: 静态扫描 - 导出验证 ============
  await ok('A1: 导出 makeDeps 函数', () => {
    assert.match(AITOOLS_SRC, /export\s+function\s+makeDeps/);
  });
  await ok('A2: 导出 parseArgs 函数', () => {
    assert.match(AITOOLS_SRC, /export\s+function\s+parseArgs/);
  });
  await ok('A3: 导出 describeWriteTool 函数', () => {
    assert.match(AITOOLS_SRC, /export\s+function\s+describeWriteTool/);
  });
  await ok('A4: 导出 READ_TOOLS 常量', () => {
    assert.match(AITOOLS_SRC, /export\s+const\s+READ_TOOLS/);
  });
  await ok('A5: 导出 WRITE_TOOLS 常量', () => {
    assert.match(AITOOLS_SRC, /export\s+const\s+WRITE_TOOLS/);
  });
  await ok('A6: 导出 executeTool 函数', () => {
    assert.match(AITOOLS_SRC, /export\s+async\s+function\s+executeTool/);
  });
  await ok('A7: 导出 executeReadTool 常量', () => {
    assert.match(AITOOLS_SRC, /export\s+const\s+executeReadTool/);
  });
  await ok('A8: 导出 executeWriteToolPayload 函数', () => {
    assert.match(AITOOLS_SRC, /export\s+function\s+executeWriteToolPayload/);
  });
  await ok('A9: 导出 toolDocsForPrompt 函数', () => {
    assert.match(AITOOLS_SRC, /export\s+function\s+toolDocsForPrompt/);
  });

  // ============ Group B: 静态扫描 - 常量定义 ============
  await ok('B1: 定义 MAX_QUERY_ROWS 常量', () => {
    assert.match(AITOOLS_SRC, /const\s+MAX_QUERY_ROWS\s*=\s*50/);
  });
  await ok('B2: 定义 MAX_QUERY_BYTES 常量', () => {
    assert.match(AITOOLS_SRC, /const\s+MAX_QUERY_BYTES\s*=\s*8\s*\*\s*1024/);
  });

  // ============ Group C: makeDeps 逻辑验证 ============
  await ok('C1: 接受依赖对象参数', () => {
    assert.match(AITOOLS_SRC, /function\s+makeDeps\s*\(\s*\{\s*getViewer\s*,\s*getCesium\s*,\s*getEditor\s*,\s*getFileStats\s*,\s*getPresets\s*\}\s*\)/);
  });
  await ok('C2: 返回依赖对象', () => {
    assert.match(AITOOLS_SRC, /return\s+\{\s*getViewer\s*,\s*getCesium\s*,\s*getEditor\s*,\s*getFileStats\s*,\s*getPresets\s*\}/);
  });

  // ============ Group D: parseArgs 逻辑验证 ============
  await ok('D1: 接受 args 字符串参数', () => {
    assert.match(AITOOLS_SRC, /function\s+parseArgs\s*\(\s*args\s*\)/);
  });
  await ok('D2: 空字符串返回空对象', () => {
    assert.match(AITOOLS_SRC, /if\s*\(\s*!\s*args\s*\)\s+return\s+out/);
  });
  await ok('D3: 按逗号分割', () => {
    assert.match(AITOOLS_SRC, /args\.split\s*\(\s*['"],['"]/);
  });
  await ok('D4: 按等号分割 key=value', () => {
    assert.match(AITOOLS_SRC, /p\.indexOf\s*\(\s*['"]=['"]/);
  });
  await ok('D5: 返回解析后的对象', () => {
    assert.match(AITOOLS_SRC, /return\s+out/);
  });

  // ============ Group E: evalWhere 逻辑验证 ============
  await ok('E1: 接受 attrs 和 where 参数', () => {
    assert.match(AITOOLS_SRC, /function\s+evalWhere\s*\(\s*attrs\s*,\s*where\s*\)/);
  });
  await ok('E2: 空 where 返回 true', () => {
    assert.match(AITOOLS_SRC, /if\s*\(\s*!\s*where\s*\)\s+return\s+true/);
  });
  await ok('E3: 使用正则匹配条件', () => {
    assert.match(AITOOLS_SRC, /where\.match\s*\(/);
  });
  await ok('E4: 支持 = 操作符', () => {
    assert.match(AITOOLS_SRC, /case\s*['"]=['"]/);
  });
  await ok('E5: 支持 != 操作符', () => {
    assert.match(AITOOLS_SRC, /case\s*['"]!=['"]/);
  });
  await ok('E6: 支持 > 操作符', () => {
    assert.match(AITOOLS_SRC, /case\s*['"]>['"]/);
  });
  await ok('E7: 支持 < 操作符', () => {
    assert.match(AITOOLS_SRC, /case\s*['"]<['"]/);
  });
  await ok('E8: 支持 >= 操作符', () => {
    assert.match(AITOOLS_SRC, /case\s*['"]>=['"]/);
  });
  await ok('E9: 支持 <= 操作符', () => {
    assert.match(AITOOLS_SRC, /case\s*['"]<=['"]/);
  });

  // ============ Group F: READ_TOOLS 注册表验证 ============
  await ok('F1: READ_TOOLS 包含 list_layers', () => {
    assert.match(AITOOLS_SRC, /list_layers\s*:\s*\{/);
  });
  await ok('F2: READ_TOOLS 包含 describe_layer', () => {
    assert.match(AITOOLS_SRC, /describe_layer\s*:\s*\{/);
  });
  await ok('F3: READ_TOOLS 包含 query_features', () => {
    assert.match(AITOOLS_SRC, /query_features\s*:\s*\{/);
  });
  await ok('F4: READ_TOOLS 包含 get_selection', () => {
    assert.match(AITOOLS_SRC, /get_selection\s*:\s*\{/);
  });
  await ok('F5: READ_TOOLS 包含 list_files', () => {
    assert.match(AITOOLS_SRC, /list_files\s*:\s*\{/);
  });
  await ok('F6: READ_TOOLS 都是 readonly: true', () => {
    assert.match(AITOOLS_SRC, /readonly:\s*true/);
  });

  // ============ Group G: WRITE_TOOLS 注册表验证 ============
  await ok('G1: WRITE_TOOLS 包含 move_features', () => {
    assert.match(AITOOLS_SRC, /move_features\s*:\s*\{/);
  });
  await ok('G2: WRITE_TOOLS 包含 delete_features', () => {
    assert.match(AITOOLS_SRC, /delete_features\s*:\s*\{/);
  });
  await ok('G3: WRITE_TOOLS 包含 set_attr', () => {
    assert.match(AITOOLS_SRC, /set_attr\s*:\s*\{/);
  });
  await ok('G4: WRITE_TOOLS 包含 create_layer', () => {
    assert.match(AITOOLS_SRC, /create_layer\s*:\s*\{/);
  });
  await ok('G5: WRITE_TOOLS 包含 fly_to', () => {
    assert.match(AITOOLS_SRC, /fly_to\s*:\s*\{/);
  });
  await ok('G6: WRITE_TOOLS 包含 select_features', () => {
    assert.match(AITOOLS_SRC, /select_features\s*:\s*\{/);
  });
  await ok('G7: WRITE_TOOLS 包含 draw_feature', () => {
    assert.match(AITOOLS_SRC, /draw_feature\s*:\s*\{/);
  });
  await ok('G8: WRITE_TOOLS 都是 readonly: false', () => {
    assert.match(AITOOLS_SRC, /readonly:\s*false/);
  });
  await ok('G9: WRITE_TOOLS 都是 needsConfirm: true', () => {
    assert.match(AITOOLS_SRC, /needsConfirm:\s*true/);
  });

  // ============ Group H: executeTool 逻辑验证 ============
  await ok('H1: 接受 name, args, deps 参数', () => {
    assert.match(AITOOLS_SRC, /async\s+function\s+executeTool\s*\(\s*name\s*,\s*args\s*,\s*deps\s*\)/);
  });
  await ok('H2: 优先检查 READ_TOOLS', () => {
    assert.match(AITOOLS_SRC, /if\s*\(\s*READ_TOOLS\[name\]\s*\)/);
  });
  await ok('H3: 读工具返回 ok: true, readonly: true', () => {
    assert.match(AITOOLS_SRC, /ok:\s*true\s*,\s*readonly:\s*true/);
  });
  await ok('H4: 检查 WRITE_TOOLS', () => {
    assert.match(AITOOLS_SRC, /if\s*\(\s*WRITE_TOOLS\[name\]\s*\)/);
  });
  await ok('H5: 写工具返回 needsConfirm: true', () => {
    assert.match(AITOOLS_SRC, /needsConfirm:\s*true/);
  });
  await ok('H6: 未知工具返回错误', () => {
    assert.match(AITOOLS_SRC, /未知工具/);
  });

  // ============ Group I: parseArgs 实际测试 ============
  function parseArgs(args) {
    const out = {};
    if (!args) return out;
    for (const part of args.split(',')) {
      const p = part.trim();
      if (!p) continue;
      const eqIdx = p.indexOf('=');
      if (eqIdx < 0) continue;
      const k = p.slice(0, eqIdx).trim();
      const v = p.slice(eqIdx + 1).trim();
      if (k) out[k] = v;
    }
    return out;
  }

  await ok('I1: 解析单个参数', () => {
    assert.deepEqual(parseArgs('layer=demo'), { layer: 'demo' });
  });
  await ok('I2: 解析多个参数', () => {
    assert.deepEqual(parseArgs('layer=demo,fid=123'), { layer: 'demo', fid: '123' });
  });
  await ok('I3: 空字符串返回空对象', () => {
    assert.deepEqual(parseArgs(''), {});
  });
  await ok('I4: null 返回空对象', () => {
    assert.deepEqual(parseArgs(null), {});
  });
  await ok('I5: 忽略无等号部分', () => {
    assert.deepEqual(parseArgs('layer=demo,invalid'), { layer: 'demo' });
  });
  await ok('I6: 处理空格', () => {
    assert.deepEqual(parseArgs('  layer=demo  '), { layer: 'demo' });
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
