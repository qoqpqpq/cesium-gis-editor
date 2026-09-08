// tests/specs/webgpu-3d-tiles-eval.cjs
// 周期 10 P2-1: WebGPU + 3D Tiles 2.0 评估 spec
//
// 验证范围：
//   1) 评估文档存在 + 现状 / WebGPU / 3D Tiles 2.0 三节
//   2) 决策矩阵完整
//   3) 风险清单 ≥4 项
//   4) 推荐路径短期/中期/长期
//   5) 参考资料链接

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const EVAL_DOC = path.join(ROOT, 'docs', 'evaluation', 'webgpu-3d-tiles.md');

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  [PASS] ${name}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n=== P2-1 WebGPU + 3D Tiles 2.0 评估 spec ===\n');

const docExists = fs.existsSync(EVAL_DOC);
check('webgpu-3d-tiles.md 存在', docExists);

if (docExists) {
  const content = fs.readFileSync(EVAL_DOC, 'utf8');

  check('文档含"现状 WebGL" 章节', content.includes('现状') && content.includes('WebGL'));
  check('文档含"WebGPU 趋势" 章节', content.includes('WebGPU'));
  check('文档含"3D Tiles 2.0 状态" 章节', content.includes('3D Tiles 2.0'));
  check('文档含"Gaussian Splatting"', content.includes('Gaussian Splatting') || content.includes('3DGS'));

  check('含 cesiumJS WebGPU v2 roadmap 引用', content.includes('cesiumJS v2') || content.includes('Cesium v2') || content.includes('CesiumGS/cesium'));

  // 决策矩阵
  check('含决策矩阵（WebGL vs WebGPU vs 3D Tiles 2.0）',
    content.includes('决策矩阵') &&
    content.includes('WebGL') &&
    content.includes('WebGPU') &&
    content.includes('3D Tiles 2.0'));

  // 风险 ≥4 项
  const riskSection = content.match(/## 7\.[\s\S]*?(?=## 8\.)/);
  const riskRows = riskSection ? (riskSection[0].match(/^\| [^|\n]+ \|/gm) || []).length : 0;
  check('风险清单 ≥4 项', riskRows >= 4, `实际 ${riskRows} 项`);

  // 推荐路径短期/中期/长期
  check('推荐路径含"短期/中期/长期"', content.includes('短期') && content.includes('中期') && content.includes('长期'));

  // 参考资料
  const refs = (content.match(/https?:\/\//g) || []).length;
  check('参考资料 ≥3 项', refs >= 3, `实际 ${refs} 项`);

  // 暂不切换结论
  check('含"暂不切换"结论', content.includes('暂不切换'));
}

console.log(`\n--- summary: pass=${passed} fail=${failed} ---`);
process.exit(failed === 0 ? 0 : 1);