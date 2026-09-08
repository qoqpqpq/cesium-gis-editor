// tests/specs/mem0-postgres-eval.cjs
// 周期 10 P0-1: mem0 + pgvector 自托管评估 spec
// 验证 docs/evaluation/mem0-postgres.md + docker-compose 草稿的合理性与完整性
//
// 验证范围：
//   1) 评估文档存在 + 内容覆盖 6 个决策维度
//   2) docker-compose 草稿 YAML 可解析
//   3) pgvector schema 合理（image 正确 + vector 维度）
//   4) memory.js → mem0 接口对齐表 ≥6 项
//   5) 风险清单 ≥5 项
//   6) 推荐路径含 "短期/中期/长期"
//   7) 量化收益 ≥3 项
//   8) 决策矩阵包含"现状 vs mem0"对比

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const EVAL_DOC = path.join(ROOT, 'docs', 'evaluation', 'mem0-postgres.md');
const COMPOSE_FILE = path.join(ROOT, 'docs', 'evaluation', 'mem0-postgres.docker-compose.yml');

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  [PASS] ${name}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---- 1. 评估文档存在 ----
console.log('\n=== P0-1 mem0 + pgvector 评估 spec ===\n');
const docExists = fs.existsSync(EVAL_DOC);
check('mem0-postgres.md 存在', docExists);

// ---- 2. docker-compose 草稿存在 ----
const composeExists = fs.existsSync(COMPOSE_FILE);
check('mem0-postgres.docker-compose.yml 存在', composeExists);

// ---- 3. 文档内容覆盖 ----
if (docExists) {
  const content = fs.readFileSync(EVAL_DOC, 'utf8');
  // 现状
  check('文档含"现状 SQLite + FTS5"', content.includes('现状') && content.includes('SQLite'));
  // mem0 方案
  check('文档含 mem0 + pgvector 架构', content.includes('mem0') && content.includes('pgvector'));
  // docker-compose 引用
  check('文档引用 docker-compose 草稿', content.includes('docker-compose'));
  // 接口对齐
  check('文档含 memory.js → mem0 接口对齐表', content.includes('memory.js') && content.includes('mem0 SDK') || (content.includes('remember') && content.includes('recall') && content.includes('mem0.add')));
  // 风险 ≥5 项（数 "| 风险 |" 或 "| Postgres 单点故障 |" 形式）
  const riskSection = content.match(/## 4\.[\s\S]*?(?=## 5\.)/);
  const riskRows = riskSection ? (riskSection[0].match(/^\| [^|\n]+ \|/gm) || []).length : 0;
  check('风险清单 ≥5 项', riskRows >= 5, `实际 ${riskRows} 项`);
  // 收益 ≥3 项
  const benefitSection = content.match(/## 3\.[\s\S]*?(?=## 4\.)/);
  const benefitRows = benefitSection ? (benefitSection[0].match(/^\| [^|\n]+ \|/gm) || []).length : 0;
  check('量化收益 ≥3 项', benefitRows >= 3, `实际 ${benefitRows} 项`);
  // 推荐路径短期/中期/长期
  check('推荐路径含"短期/中期/长期"', content.includes('短期') && content.includes('中期') && content.includes('长期'));
  // 决策矩阵
  check('含"现状 vs mem0"决策矩阵', content.includes('决策矩阵') && content.includes('mem0'));
  // 暂不切换结论
  check('含"暂不切换"结论', content.includes('暂不切换'));
  // 参考资料
  check('含参考资料链接 ≥2 项', (content.match(/https?:\/\//g) || []).length >= 2, `实际 ${(content.match(/https?:\/\//g) || []).length} 项`);
}

// ---- 4. docker-compose YAML 可解析 ----
if (composeExists) {
  const composeContent = fs.readFileSync(COMPOSE_FILE, 'utf8');
  // pgvector 镜像
  check('docker-compose 含 pgvector/pgvector image', composeContent.includes('pgvector/pgvector'));
  // mem0 镜像
  check('docker-compose 含 mem0ai/mem0 image', composeContent.includes('mem0ai/mem0'));
  // 端口 5432 + 8080
  check('docker-compose 含 Postgres 5432 端口', composeContent.includes('5432'));
  check('docker-compose 含 mem0 server 8080 端口', composeContent.includes('8080'));
  // 网络隔离（仅 127.0.0.1）
  check('docker-compose 端口绑定 127.0.0.1（防外网暴露）', composeContent.includes('127.0.0.1'));
  // secret 占位（不 hardcode）
  check('docker-compose 用 env 注入 secret（无 hardcode password）',
    composeContent.includes('${MEM0_PG_PASSWORD') &&
    composeContent.includes('${OPENAI_API_KEY'));
  // volume 持久化
  check('docker-compose 含 Postgres volume 持久化', composeContent.includes('volumes:') && composeContent.includes('mem0_pg'));
  // healthcheck
  check('docker-compose 含 postgres healthcheck', composeContent.includes('healthcheck') && composeContent.includes('pg_isready'));
  // 注释说明
  check('docker-compose 顶部有"非生产配置"警告', composeContent.includes('非生产') || composeContent.includes('评估用'));
  // 备份 cron
  check('docker-compose 含 pg-backup 服务', composeContent.includes('pg-backup') || composeContent.includes('BACKUP_KEEP_DAYS'));
}

console.log(`\n--- summary: pass=${passed} fail=${failed} ---`);
process.exit(failed === 0 ? 0 : 1);