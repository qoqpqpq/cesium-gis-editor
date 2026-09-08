// tests/specs/pr-review-workflow.cjs
// 周期 7 P1-7: PR review automation（claude-code-action / open-code-review）
//
// 背景：
//   - 周期 7+ 接入 GitHub Actions 自动评审
//   - claude-code-action / open-code-review 是 2025+ 主流 AI PR 评审
//   - 周期 7 仅静态扫描 + 占位；周期 8+ 接入实际 AI Action
//
// 验收：
//   1. .github/workflows/pr-review.yml 存在
//   2. yml 含 on.pull_request 触发器
//   3. yml 含 baseline job（checkpoint + probe + specs）
//   4. yml 含 ai-review job（占位说明）
//   5. yml 含必要 permissions（contents / pull-requests）
//   6. yml 引用 tests/checkpoint.cjs --report-only
//   7. yml 引用 tests/probe-real-ai-tool-first.cjs
//   8. yml 引用 tests/specs/*.cjs 全量跑
//   9. yml 含失败退出（if FAIL > 0 then exit 1）
//   10. yml 不引用 .env 或 blog.db

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

const WORKFLOW_PATH = path.resolve(
  __dirname, '../../.github/workflows/pr-review.yml',
);

(async () => {
  console.log('=== pr-review-workflow ===');

  // ---- 1. 文件存在 ----
  await test('.github/workflows/pr-review.yml 存在', () => {
    assert.ok(fs.existsSync(WORKFLOW_PATH), 'yml 文件应存在');
  });

  const yml = fs.readFileSync(WORKFLOW_PATH, 'utf8');

  // ---- 2. yml 必备字段 ----
  await test('yml 含 on.pull_request 触发器', () => {
    assert.match(yml, /on:\s*\n\s*pull_request:/);
    assert.match(yml, /types:\s*\[\s*opened/);
  });

  await test('yml 含 workflow_dispatch 手动触发', () => {
    assert.match(yml, /workflow_dispatch:/);
  });

  await test('yml 含 permissions（contents / pull-requests）', () => {
    assert.match(yml, /permissions:/);
    assert.match(yml, /contents:\s*read/);
    assert.match(yml, /pull-requests:\s*write/);
  });

  await test('yml 含 baseline job', () => {
    assert.match(yml, /baseline:/);
    assert.match(yml, /jobs:/);
  });

  await test('yml 含 ai-review job', () => {
    assert.match(yml, /ai-review:/);
    assert.match(yml, /needs:\s*baseline/);
  });

  await test('baseline job 引用 tests/checkpoint.cjs', () => {
    assert.match(yml, /tests\/checkpoint\.cjs/);
    assert.match(yml, /--report-only/);
  });

  await test('baseline job 引用 tests/probe-real-ai-tool-first.cjs', () => {
    assert.match(yml, /tests\/probe-real-ai-tool-first\.cjs/);
  });

  await test('baseline job 跑 tests/specs/*.cjs 全量', () => {
    assert.match(yml, /tests\/specs\/\*\.cjs/);
  });

  await test('baseline 失败时 exit 1', () => {
    assert.match(yml, /if\s*\[\s*"\$FAIL"\s*-gt\s*0\s*\]/);
    assert.match(yml, /exit 1/);
  });

  // ---- 3. yml 不引用敏感文件（仅 run/script 区，注释里的"禁止事项"是合法的） ----
  // 检查所有"非注释"行的内容（去掉 # 开头）
  function nonCommentLines(text) {
    return text.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  }
  const codeLines = nonCommentLines(yml);

  await test('yml 非注释行不引用 .env', () => {
    assert.doesNotMatch(codeLines, /\.env/, '非注释行不应引用 .env');
  });

  await test('yml 非注释行不引用 blog.db', () => {
    assert.doesNotMatch(codeLines, /blog\.db/, '非注释行不应引用 blog.db');
  });

  await test('yml 注释里含禁止事项清单（评审 prompt 模板）', () => {
    // 注释里提到 .env / blog.db 是合法的（评审 prompt 模板里禁止提交这些）
    assert.match(yml, /No \.env|禁止|不允许/, '应提示禁止事项');
  });

  // ---- 4. yml 提及 AI Action 选项 ----
  await test('yml 注释提及 claude-code-action', () => {
    assert.match(yml, /claude-code-action/);
  });

  // ---- 5. 评审内容项 ----
  await test('yml 评审项含 security / spec coverage / commit format / cycle docs', () => {
    assert.match(yml, /[Ss]ecurity/);
    assert.match(yml, /spec/);
    assert.match(yml, /commit/);
    assert.match(yml, /cycle/);
  });

  // ---- 6. AI Action secrets 提示 ----
  await test('yml 提示 ANTHROPIC_API_KEY 或 OPENAI_API_KEY', () => {
    assert.match(yml, /ANTHROPIC_API_KEY|OPENAI_API_KEY/);
  });

  // ---- 7. 必填 Action 版本 ----
  await test('yml 使用 actions/checkout@v4 + actions/setup-node@v4', () => {
    assert.match(yml, /actions\/checkout@v4/);
    assert.match(yml, /actions\/setup-node@v4/);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
