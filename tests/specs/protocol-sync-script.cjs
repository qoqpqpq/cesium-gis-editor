// tests/specs/protocol-sync-script.cjs
// 周期 8 P1-5: client/server 协议同步验证脚本
//
// 背景：
//   - client/src/pages/gis/sandbox.js 与 server/agent/protocol/index.js / parse.js
//     都独立实现 <tool>name(args)</tool> 协议解析
//   - 任何一边修改协议字面，另一边需手动同步
//   - 周期 8 P1-5 写 scripts/check-protocol-sync.cjs 自动验证
//
// 验收：
//   1. 静态扫描：scripts/check-protocol-sync.cjs 存在
//   2. 行为：脚本能识别两端都含 <tool>...</tool> 协议字面
//   3. 行为：脚本能识别 <tool> / </tool> open/close 标签一致
//   4. 行为：脚本能识别工具名正则 [a-z_][a-z0-9_]* 一致
//   5. 行为：脚本能识别 server/agent/protocol/parse.js 也含一致协议
//   6. 行为：脚本对 client 端 const TOOL_RE = /.../gi 形式能正确提取
//   7. 行为：脚本 --json 模式输出 JSON 报告
//   8. 行为：脚本退出码 0（一致）/ 1（不一致）
//   9. 行为：缺 client 文件 → exit 2（致命）
//   10. 模拟不一致：临时改 client sandbox.js → 脚本应报告 FAIL

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

const SCRIPT_PATH = path.resolve(__dirname, '../../scripts/check-protocol-sync.cjs');

(async () => {
  console.log('=== protocol-sync-script ===');

  // ---- 1. 静态扫描 ----
  await test('scripts/check-protocol-sync.cjs 存在', () => {
    assert.ok(fs.existsSync(SCRIPT_PATH));
  });

  await test('脚本含 client/server 协议字面检查', () => {
    const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
    assert.match(src, /CLIENT_FILE/);
    assert.match(src, /SERVER_FILE/);
    assert.match(src, /SERVER_PARSE_FILE/);
  });

  await test('脚本检查 4 项关键内容：open 标签 / close 标签 / 工具名正则 / parse.js', () => {
    const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
    assert.match(src, /协议标签/);
    assert.match(src, /工具名正则/);
    assert.match(src, /parse\.js/);
  });

  await test('脚本支持 --json 模式', () => {
    const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
    assert.match(src, /JSON_OUTPUT/);
    assert.match(src, /--json/);
  });

  // ---- 2. 行为：当前状态 PASS ----
  await test('当前 client/server 协议一致（脚本 exit 0）', () => {
    const result = execSync(`node "${SCRIPT_PATH}"`, {
      encoding: 'utf8',
      cwd: path.resolve(__dirname, '../..'),
      timeout: 10000,
    });
    assert.match(result, /4\/4 PASS/);
    assert.match(result, /protocol-sync-check/);
  });

  // ---- 3. 行为：--json 模式 ----
  await test('--json 模式输出 JSON 报告', () => {
    const result = execSync(`node "${SCRIPT_PATH}" --json`, {
      encoding: 'utf8',
      cwd: path.resolve(__dirname, '../..'),
      timeout: 10000,
    });
    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.ok, true, 'json.ok 应为 true');
    assert.ok(Array.isArray(parsed.checks));
    assert.strictEqual(parsed.checks.length, 4);
  });

  // ---- 4. 行为：缺文件 → exit 2 ----
  await test('缺 client 文件 → exit 2（致命）', () => {
    // 临时改名 client sandbox.js → 触发 file not found 路径
    const clientFile = path.resolve(__dirname, '../../client/src/pages/gis/sandbox.js');
    const backupFile = clientFile + '.sync-test-backup';
    fs.renameSync(clientFile, backupFile);
    try {
      try {
        execSync(`node "${SCRIPT_PATH}"`, {
          encoding: 'utf8',
          cwd: path.resolve(__dirname, '../..'),
          timeout: 10000,
        });
        assert.fail('应抛 exit 2');
      } catch (e) {
        assert.strictEqual(e.status, 2, `应 exit 2，实际 ${e.status}`);
        assert.match(e.stderr || '', /file not found/i);
      }
    } finally {
      fs.renameSync(backupFile, clientFile);
    }
  });

  // ---- 5. 模拟不一致：临时改 client sandbox.js → 脚本应 FAIL ----
  await test('模拟不一致（临时改 client）→ 脚本 exit 1', () => {
    const clientFile = path.resolve(__dirname, '../../client/src/pages/gis/sandbox.js');
    const original = fs.readFileSync(clientFile, 'utf8');
    // 临时把 <tool> 改成 <mytool>（破坏协议一致性）
    const tampered = original.replace(/<tool>/g, '<mytool>').replace(/<\/tool>/g, '</mytool>');
    fs.writeFileSync(clientFile, tampered, 'utf8');
    try {
      try {
        execSync(`node "${SCRIPT_PATH}"`, {
          encoding: 'utf8',
          cwd: path.resolve(__dirname, '../..'),
          timeout: 10000,
        });
        assert.fail('应抛 exit 1');
      } catch (e) {
        // 非 0 exit code
        assert.strictEqual(e.status, 1, '不一致应 exit 1');
        assert.match(e.stdout || '', /FAIL/);
      }
    } finally {
      // 恢复原文
      fs.writeFileSync(clientFile, original, 'utf8');
    }
  });

  await test('恢复 client 后 → 脚本重新 PASS', () => {
    const result = execSync(`node "${SCRIPT_PATH}"`, {
      encoding: 'utf8',
      cwd: path.resolve(__dirname, '../..'),
      timeout: 10000,
    });
    assert.match(result, /4\/4 PASS/);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
