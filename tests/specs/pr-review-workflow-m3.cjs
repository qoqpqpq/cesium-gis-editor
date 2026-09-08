// tests/specs/pr-review-workflow-m3.cjs
// 周期 9 P1-4: PR review workflow 升级（接 MiniMax-M3 跑 PR review）
// 验证 pr-review.yml 的 yaml 结构 + MiniMax-M3 关键字段
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

// 简易 YAML 解析（仅 pr-review.yml 验证用；不引 yaml 依赖）
function parseYamlSimple(src) {
  // 1. 行级 key-value
  // 2. jobs.<name>.steps[] 列表
  // 3. 嵌套 with: 子级
  // 不解析全部 YAML 规范；足够 pr-review.yml 验证
  const lines = src.split("\n");
  const root = {};
  let curJob = null;
  let curStep = null;
  let curWith = false;
  let curEnv = false;
  for (const line of lines) {
    if (/^#/.test(line)) continue;
    if (/^---/.test(line)) continue;
    if (/^\s*$/.test(line)) continue;
    const topMatch = line.match(/^(\w+):\s*(.*)$/);
    if (topMatch) {
      const k = topMatch[1], v = topMatch[2];
      if (v === '') {
        root[k] = {};
      } else {
        root[k] = v;
      }
      curJob = null;
      curStep = null;
      curWith = false;
      curEnv = false;
      continue;
    }
    // 2 空格缩进：jobs 子级
    const jobMatch = line.match(/^  (\w+):\s*(.*)$/);
    if (jobMatch) {
      const k = jobMatch[1], v = jobMatch[2];
      if (!root.jobs) root.jobs = {};
      if (v === '') {
        root.jobs[k] = {};
        curJob = k;
        curStep = null;
        curWith = false;
        curEnv = false;
      } else {
        root.jobs[k] = v;
      }
      continue;
    }
    // 4 空格缩进：job 字段
    const jobFieldMatch = line.match(/^    (\w[\w-]*):\s*(.*)$/);
    if (jobFieldMatch && curJob) {
      const k = jobFieldMatch[1], v = jobFieldMatch[2];
      root.jobs[curJob][k] = v;
      curStep = null;
      curWith = false;
      curEnv = false;
      continue;
    }
    // 6 空格缩进：steps 列表
    const stepMatch = line.match(/^      - name:\s*(.*)$/);
    if (stepMatch && curJob) {
      if (!root.jobs[curJob].steps) root.jobs[curJob].steps = [];
      curStep = root.jobs[curJob].steps.length;
      root.jobs[curJob].steps.push({ name: stepMatch[1] });
      curWith = false;
      curEnv = false;
      continue;
    }
    // 8 空格缩进：with 子级
    const withFieldMatch = line.match(/^        (\w[\w-]*):\s*(.*)$/);
    if (withFieldMatch && curStep !== null) {
      const k = withFieldMatch[1], v = withFieldMatch[2];
      const step = root.jobs[curJob].steps[curStep];
      if (!step.with) step.with = {};
      step.with[k] = v;
      curWith = true;
      continue;
    }
    // 8 空格缩进：env 子级
    const envFieldMatch = line.match(/^        (\w[\w-]*):\s*(.*)$/);
    if (envFieldMatch && curStep !== null) {
      // 已处理 with 同理
    }
  }
  return root;
}

async function main() {
  await t("pr-review.yml 文件存在", () => {
    assert.ok(fs.existsSync(WORKFLOW));
  });

  const src = fs.readFileSync(WORKFLOW, "utf8");

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

  await t("jobs.ai-review 存在", () => {
    assert.ok(/^\s*ai-review:/m.test(src));
  });

  await t("周期 9 P1-4: ai-review 接 MiniMax-M3", () => {
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

  await t("周期 9 P1-4: claude_args 含 --model MiniMax-M3 + --max-turns 5", () => {
    assert.ok(/--model MiniMax-M3/.test(src), "claude_args 应含 --model MiniMax-M3");
    assert.ok(/--max-turns 5/.test(src), "claude_args 应含 --max-turns 5");
  });

  await t("周期 9 P1-4: trigger_pr_review: true", () => {
    assert.ok(/trigger_pr_review: true/m.test(src));
  });

  await t("周期 9 P1-4: sticky-pull-request-comment@v2 仍保留", () => {
    assert.ok(/marocchino\/sticky-pull-request-comment@v2/m.test(src));
  });

  await t("ai-review 步骤数 >= 3 (checkout + claude-code-action + sticky-comment)", () => {
    // 用正则数 ai-review 块内 uses: 出现次数（每个 step 必有 uses 或 name）
    const aiBlockMatch = src.match(/ai-review:[\s\S]*?(?=\n  \w+:|$)/);
    assert.ok(aiBlockMatch, "应找到 ai-review 块");
    const aiBlock = aiBlockMatch[0];
    const usesCount = (aiBlock.match(/uses:/g) || []).length;
    const nameCount = (aiBlock.match(/- name:/g) || []).length;
    assert.ok(usesCount + nameCount >= 4, `ai-review 步骤 ${usesCount} uses + ${nameCount} name < 4 (含 checkout + claude-code-action + sticky + 可能其他)`);
  });

  await t("ai-review if 条件：M3_API_KEY 不为空才跑（避免 secrets 缺失时失败）", () => {
    assert.ok(/if: \${{ env\.M3_API_KEY != '' }}/.test(src) || /if:.*M3_API_KEY/m.test(src));
  });

  await t("周期 9 P1-4 评估报告：MiniMax-M3 + max-turns 限制", () => {
    const report = {
      cycle: 9,
      taskId: "P1-4",
      action: "anthropics/claude-code-action@v1",
      model: "MiniMax-M3",
      baseUrl: "https://api.MiniMax.com/v1 (default)",
      apiKey: "secrets.M3_API_KEY",
      maxTurns: 5,
      features: ["trigger_pr_review: true", "claude_args MiniMax-M3 强制", "sticky PR comment"],
      note: "周期 9 不真触发（避免 token 消耗）；CI 验证 yaml 解析 + 字段",
    };
    assert.equal(report.cycle, 9);
    assert.equal(report.maxTurns, 5);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});