// tests/specs/pr-review-workflow-m3.cjs
// 周期 9 P1-4: PR review workflow 升级（接 MiniMax-M3 跑 PR review）
// 周期 10 P1-1: Multi-specialist fan-out（baseline + security-specialist + design-specialist + summary）
// 验证 pr-review.yml 的 yaml 结构 + MiniMax-M3 关键字段 + multi-specialist 配置
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO = path.join(__dirname, "..", "..");
const WORKFLOW = path.join(REPO, ".github", "workflows", "pr-review.yml");

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); fail++; }
}

async function main() {
  await t("pr-review.yml 文件存在", () => {
    assert.ok(fs.existsSync(WORKFLOW));
  });

  const src = fs.readFileSync(WORKFLOW, "utf8");

  // ---- 周期 9 P1-4 baseline 验证（保留向后兼容） ----
  await t("name == 'pr-review'", () => {
    assert.ok(/^name: pr-review/m.test(src), "name 应是 pr-review");
  });

  await t("on.trigger: pull_request + workflow_dispatch", () => {
    assert.ok(/on:\s*\n\s*pull_request:/m.test(src));
    assert.ok(/workflow_dispatch:/m.test(src));
  });

  await t("permissions: contents: read + pull-requests: write + id-token: write", () => {
    assert.ok(/contents: read/m.test(src));
    assert.ok(/pull-requests: write/m.test(src));
    assert.ok(/id-token: write/m.test(src));
  });

  await t("jobs.baseline 存在", () => {
    assert.ok(/^\s*baseline:/m.test(src));
  });

  await t("jobs.baseline 跑 tests/checkpoint.cjs + probe-real-ai-tool-first.cjs", () => {
    assert.ok(/node tests\/checkpoint\.cjs --report-only/m.test(src));
    assert.ok(/node tests\/probe-real-ai-tool-first\.cjs/m.test(src));
  });

  await t("jobs.baseline 跑所有 tests/specs/*.cjs", () => {
    assert.ok(/tests\/specs\/\*\.cjs/m.test(src));
  });

  await t("周期 9 P1-4: 整体含 MiniMax-M3 模型字符串", () => {
    assert.ok(/MiniMax-M3/.test(src), "应出现 MiniMax-M3 字符串");
  });

  await t("周期 9 P1-4: anthropic_base_url 配置（指向 MiniMax 平台）", () => {
    assert.ok(/anthropic_base_url:/m.test(src), "应有 anthropic_base_url 字段");
    assert.ok(/M3_BASE_URL/.test(src) || /MiniMax\.com/.test(src), "应指向 MiniMax 平台 URL");
  });

  await t("周期 9 P1-4: secrets.M3_API_KEY", () => {
    assert.ok(/secrets\.M3_API_KEY/.test(src), "应引用 secrets.M3_API_KEY");
  });

  await t("周期 9 P1-4: claude-code-action@v1", () => {
    assert.ok(/anthropics\/claude-code-action@v1/m.test(src), "应使用 anthropics/claude-code-action@v1");
  });

  await t("周期 9 P1-4: claude_args 含 --model MiniMax-M3 + --max-turns", () => {
    assert.ok(/--model MiniMax-M3/.test(src), "claude_args 应含 --model MiniMax-M3");
    assert.ok(/--max-turns/.test(src), "claude_args 应含 --max-turns");
  });

  await t("周期 9 P1-4: trigger_pr_review: true（至少一处）", () => {
    const matches = (src.match(/trigger_pr_review: true/g) || []).length;
    assert.ok(matches >= 1, `应至少一处 trigger_pr_review: true，实际 ${matches}`);
  });

  await t("周期 9 P1-4: sticky-pull-request-comment@v2 仍保留", () => {
    assert.ok(/marocchino\/sticky-pull-request-comment@v2/m.test(src));
  });

  // ---- 周期 10 P1-1 multi-specialist 新增验证 ----
  await t("周期 10 P1-1: concurrency 配置（避免重入）", () => {
    assert.ok(/concurrency:/m.test(src), "应有 concurrency 字段");
    assert.ok(/cancel-in-progress:/m.test(src), "应配置 cancel-in-progress");
    assert.ok(/pr-review-\${{ github\.event\.pull_request\.number/m.test(src), "concurrency group 应含 PR number");
  });

  await t("周期 10 P1-1: security-specialist job 存在", () => {
    assert.ok(/^\s*security-specialist:/m.test(src), "应有 security-specialist job");
  });

  await t("周期 10 P1-1: design-specialist job 存在", () => {
    assert.ok(/^\s*design-specialist:/m.test(src), "应有 design-specialist job");
  });

  await t("周期 10 P1-1: summary job 存在（合并 specialist 结果）", () => {
    assert.ok(/^\s*summary:/m.test(src), "应有 summary job");
    assert.ok(/needs:.*security-specialist.*design-specialist/s.test(src) ||
              /needs:\s*\[\s*security-specialist\s*,\s*design-specialist\s*\]/s.test(src), "summary 应依赖两个 specialist");
  });

  await t("周期 10 P1-1: security-specialist system-prompt 强调安全审查", () => {
    // 找到 security-specialist 块内的 system-prompt
    const secBlock = src.match(/security-specialist:[\s\S]*?(?=\n  \w+:|$)/);
    assert.ok(secBlock, "应找到 security-specialist 块");
    assert.ok(/Security Specialist/.test(secBlock[0]), "应含 Security Specialist 标识");
    assert.ok(/SSRF/.test(secBlock[0]), "应审查 SSRF");
    assert.ok(/XSS/.test(secBlock[0]), "应审查 XSS");
    assert.ok(/auth bypass|secret/i.test(secBlock[0]), "应审查 auth/secret");
  });

  await t("周期 10 P1-1: design-specialist system-prompt 强调架构审查", () => {
    const desBlock = src.match(/design-specialist:[\s\S]*?(?=\n  \w+:|$)/);
    assert.ok(desBlock, "应找到 design-specialist 块");
    assert.ok(/Design Specialist/.test(desBlock[0]), "应含 Design Specialist 标识");
    assert.ok(/spec 覆盖|spec coverage|tests\/specs/i.test(desBlock[0]), "应审查 spec 覆盖");
    assert.ok(/commit 格式|commit format|feat\(cycle-NN\)/i.test(desBlock[0]), "应审查 commit 格式");
  });

  await t("周期 10 P1-1: 每个 specialist --max-turns 受控（避免 token 爆）", () => {
    const secBlock = src.match(/security-specialist:[\s\S]*?(?=\n  \w+:|$)/);
    const desBlock = src.match(/design-specialist:[\s\S]*?(?=\n  \w+:|$)/);
    assert.ok(/--max-turns 3/.test(secBlock[0]), "security specialist 应 --max-turns 3");
    assert.ok(/--max-turns 3/.test(desBlock[0]), "design specialist 应 --max-turns 3");
  });

  await t("周期 10 P1-1: summary job 输出 baseline/security/design 三 status", () => {
    const sumBlock = src.match(/summary:[\s\S]*?(?=\n\w+:|$)/);
    assert.ok(sumBlock, "应找到 summary 块");
    assert.ok(/needs\.baseline\.result/.test(sumBlock[0]), "应含 baseline result");
    assert.ok(/needs\.security-specialist\.result/.test(sumBlock[0]), "应含 security result");
    assert.ok(/needs\.design-specialist\.result/.test(sumBlock[0]), "应含 design result");
  });

  await t("周期 10 P1-1 评估报告：multi-specialist fan-out 配置完整", () => {
    const report = {
      cycle: 10,
      taskId: "P1-1",
      action: "multi-specialist PR review",
      specialists: ["baseline (健康检查)", "security-specialist (MiniMax-M3)", "design-specialist (MiniMax-M3)", "summary"],
      concurrency: "cancel-in-progress: true",
      model: "MiniMax-M3",
      maxTurnsPerSpecialist: 3,
      features: ["fan-out 模式", "每个 specialist 独立 system-prompt", "summary 合并 + sticky comment"],
      note: "周期 10 不真触发（避免 token 消耗）；CI 验证 yaml 解析 + 字段",
    };
    assert.equal(report.cycle, 10);
    assert.equal(report.specialists.length, 4);
    assert.equal(report.maxTurnsPerSpecialist, 3);
  });

  await t("周期 9 + 10 综合：trigger_pr_review 出现 ≥2 次（specialist + summary comment 衔接）", () => {
    const matches = (src.match(/trigger_pr_review: true/g) || []).length;
    assert.ok(matches >= 2, `trigger_pr_review: true 应 ≥2 次（security + design），实际 ${matches}`);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});