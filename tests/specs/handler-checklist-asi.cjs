// tests/specs/handler-checklist-asi.cjs
// 周期 14 P2-1: handler-design-checklist OWASP ASI 维度扩展验证
// 周期 14 P2-2: ai-guardrails.md ASI03/10 决策文档验证

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const checklistPath = path.join(ROOT, 'docs', 'architecture', 'handler-design-checklist.md');
const guardrailsDocPath = path.join(ROOT, 'docs', 'security', 'ai-guardrails.md');

let total = 0;
const failed = [];

function it(name, fn) {
  total += 1;
  try {
    fn();
    process.stdout.write(`  [PASS] ${name}\n`);
  } catch (e) {
    failed.push({ name, error: e });
    process.stdout.write(`  [FAIL] ${name} — ${e.message}\n`);
  }
}

const checklist = fs.readFileSync(checklistPath, 'utf8');
const guardrailsDoc = fs.readFileSync(guardrailsDocPath, 'utf8');

// ===== 1. handler-design-checklist.md OWASP ASI 维度 =====
it('ASI-A1: ASI01 Agent Goal Hijack 在 checklist 中', () => {
  assert.match(checklist, /ASI01/);
});

it('ASI-A2: ASI02 Tool Misuse 在 checklist 中', () => {
  assert.match(checklist, /ASI02/);
});

it('ASI-A3: ASI03 Identity & Privilege Abuse 在 checklist 中', () => {
  assert.match(checklist, /ASI03.*Identity.*Privilege/);
});

it('ASI-A4: ASI04 Agentic Supply Chain 在 checklist 中', () => {
  assert.match(checklist, /ASI04.*Supply Chain/);
});

it('ASI-A5: ASI05 RCE 在 checklist 中', () => {
  assert.match(checklist, /ASI05.*Code Execution/);
});

it('ASI-A6: ASI06 Memory & Context Poisoning 在 checklist 中', () => {
  assert.match(checklist, /ASI06.*Memory.*Context/);
});

it('ASI-A7: ASI07 Inter-Agent Communication 在 checklist 中', () => {
  assert.match(checklist, /ASI07.*Inter-Agent/);
});

it('ASI-A8: ASI08 Cascading Failures 在 checklist 中', () => {
  assert.match(checklist, /ASI08.*Cascading Failures/);
});

it('ASI-A9: ASI09 Trust Exploitation 在 checklist 中', () => {
  assert.match(checklist, /ASI09.*Trust Exploitation/);
});

it('ASI-A10: ASI10 Rogue Agents 在 checklist 中', () => {
  assert.match(checklist, /ASI10.*Rogue Agents/);
});

// ===== 2. ai-guardrails.md ASI03 决策 =====
it('ASI-D1: ai-guardrails.md 文档存在', () => {
  assert.ok(guardrailsDoc.length > 100);
});

it('ASI-D2: 文档含 ASI03 决策章节', () => {
  assert.match(guardrailsDoc, /ASI03 Identity.*Privilege Abuse/);
  assert.match(guardrailsDoc, /决策：最小可行方案/);
});

it('ASI-D3: 文档含 ASI10 决策章节', () => {
  assert.match(guardrailsDoc, /ASI10 Rogue Agents/);
  assert.match(guardrailsDoc, /3 层防御/);
});

it('ASI-D4: 文档含 ASI04/06/07 实质化细节', () => {
  assert.match(guardrailsDoc, /ASI04.*实质化/);
  assert.match(guardrailsDoc, /ASI06.*实质化/);
  assert.match(guardrailsDoc, /ASI07.*实质化/);
});

it('ASI-D5: 文档含未来演进计划', () => {
  assert.match(guardrailsDoc, /周期 15\+/);
  assert.match(guardrailsDoc, /SPIFFE/);
});

// ===== 6. 总结 =====
process.stdout.write(`\n--- handler-checklist-asi: pass=${total - failed.length} fail=${failed.length} ---\n`);
if (failed.length > 0) {
  process.stdout.write(`FAIL DETAILS:\n${failed.map((f) => `  - ${f.name}: ${f.error.message}`).join('\n')}\n`);
  process.exit(1);
}
process.exit(0);
