// tests/specs/agent-memory-3layer-eval.cjs
// 周期 10 P0-2: AI Agent 长期记忆三层架构评估 spec
//
// 验证范围：
//   1) 评估文档存在 + CoALA 理论根 + 三层定义
//   2) memory.js 升级路径明确
//   3) 与 FTS5 + WAL 兼容
//   4) 风险清单 ≥8 项
//   5) CoALA 对齐 ≥5 项

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const EVAL_DOC = path.join(ROOT, 'docs', 'evaluation', 'agent-memory-3layer.md');

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  [PASS] ${name}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n=== P0-2 AI Agent 三层记忆评估 spec ===\n');

const docExists = fs.existsSync(EVAL_DOC);
check('agent-memory-3layer.md 存在', docExists);

if (docExists) {
  const content = fs.readFileSync(EVAL_DOC, 'utf8');

  // 三层定义
  check('文档含 episodic（情景）层定义', content.includes('episodic') && (content.includes('情景') || content.includes('原始对话事件')));
  check('文档含 semantic（语义）层定义', content.includes('semantic') && (content.includes('语义') || content.includes('抽取事实')));
  check('文档含 procedural（程序）层定义', content.includes('procedural') && (content.includes('程序') || content.includes('规则')));

  // CoALA 理论根
  check('文档引用 CoALA 框架', content.includes('CoALA') && (content.includes('Cognitive Architectures') || content.includes('Berkeley')));

  // memory.js 升级路径
  check('文档含 memory.js 升级路径', content.includes('memory.js') && content.includes('升级'));
  const upgradeSteps = (content.match(/短期[\s\S]*?中期[\s\S]*?长期/g) || []).length;
  check('升级路径含短期/中期/长期', upgradeSteps >= 1);

  // 与 FTS5 + WAL 兼容
  check('文档含与 FTS5 兼容说明', content.includes('FTS5'));
  check('文档含与 WAL 兼容说明', content.includes('WAL'));

  // 风险清单
  const riskSection = content.match(/## 5\.[\s\S]*?(?=## 6\.)/);
  const riskRows = riskSection ? (riskSection[0].match(/^\| [^|\n]+ \|/gm) || []).length : 0;
  check('风险清单 ≥8 项', riskRows >= 8, `实际 ${riskRows} 项`);

  // CoALA 对齐
  const coalaSection = content.match(/## 6\.[\s\S]*?(?=## 7\.)/);
  const coalaRows = coalaSection ? (coalaSection[0].match(/^\| [^|\n]+ \|/gm) || []).length : 0;
  check('CoALA 对齐 ≥5 项', coalaRows >= 5, `实际 ${coalaRows} 项`);

  // 决策矩阵
  check('含"当前一层 / 三层（短期/中期）"决策矩阵',
    content.includes('决策矩阵') &&
    content.includes('当前一层') &&
    content.includes('短期') &&
    content.includes('中期'));

  // 价值列表 ≥3 项
  const valueSection = content.match(/## 4\.[\s\S]*?(?=## 5\.)/);
  const valueRows = valueSection ? (valueSection[0].match(/^\| [^|\n]+ \|/gm) || []).length : 0;
  check('三层价值清单 ≥3 项', valueRows >= 3, `实际 ${valueRows} 项`);

  // 参考资料 ≥3 项
  const refs = (content.match(/https?:\/\//g) || []).length;
  check('参考资料 ≥3 项', refs >= 3, `实际 ${refs} 项`);

  // 与周期 9 协同说明
  check('含与周期 9 P0-2 WAL 协同说明', content.includes('周期 9') && content.includes('WAL'));
}

console.log(`\n--- summary: pass=${passed} fail=${failed} ---`);
process.exit(failed === 0 ? 0 : 1);