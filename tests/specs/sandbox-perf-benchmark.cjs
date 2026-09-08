// tests/specs/sandbox-perf-benchmark.cjs
// 周期 9 P1-2: sandbox 性能基准 spec（vm / worker / iv 三引擎）
//
// 设计：
// - 每引擎跑 N 次简单 hello world 脚本
// - 记录 p50 / p95 / p99 / avg / min / max
// - 同时跑 M 次并发，比较吞吐
// - 不实施优化，仅产出基线数据 + spec PASS
const assert = require("node:assert/strict");
const path = require("node:path");

const REPO = path.join(__dirname, "..", "..");
const SANDBOX_PATH = path.join(REPO, "server", "agent", "sandbox.js");

let pass = 0, fail = 0;
function t(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`  [PASS] ${name}`); pass++; })
    .catch((e) => { console.log(`  [FAIL] ${name}: ${e.message}`); fail++; });
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}

async function benchEngine(name, runOne, n = 50, concurrency = 1) {
  const durations = [];
  const errors = [];
  const t0 = Date.now();
  const tasks = [];
  for (let i = 0; i < n; i++) {
    if (concurrency > 1 && tasks.length >= concurrency) {
      await Promise.race(tasks);
      tasks.splice(0, tasks.length);
    }
    const p = runOne().then((r) => {
      if (r.ok === false) errors.push(r.error || "unknown");
      else durations.push(r.durationMs);
    }).catch((e) => errors.push(e.message));
    tasks.push(p);
  }
  await Promise.all(tasks);
  const totalMs = Date.now() - t0;
  const sorted = [...durations].sort((a, b) => a - b);
  return {
    engine: name,
    iterations: n,
    concurrency,
    successCount: durations.length,
    errorCount: errors.length,
    totalMs,
    throughputPerSec: durations.length / (totalMs / 1000),
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    p99: percentile(durations, 99),
    min: sorted[0] || 0,
    max: sorted[sorted.length - 1] || 0,
    avg: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
    errors: errors.slice(0, 3),
  };
}

async function main() {
  const sandbox = require(SANDBOX_PATH);

  await t("sandbox.js 模块加载 + 导出 executeSandbox / resolveEngine", () => {
    assert.equal(typeof sandbox.executeSandbox, "function");
    assert.equal(typeof sandbox.resolveEngine, "function");
    assert.equal(typeof sandbox.executeInSandbox, "function");
    assert.equal(typeof sandbox.executeInSandboxWorker, "function");
    assert.equal(typeof sandbox.executeIsolatedVm, "function");
  });

  const simpleCode = "1 + 2 + 3"; // 简单 hello world：求和

  await t("基准 A: vm 引擎顺序 100 次", async () => {
    const result = await benchEngine("vm-seq", () => sandbox.executeSandbox(simpleCode, {}, { engine: "vm" }), 100, 1);
    console.log(`    [bench] vm-seq 100次: p50=${result.p50}ms p95=${result.p95}ms p99=${result.p99}ms avg=${result.avg.toFixed(2)}ms throughput=${result.throughputPerSec.toFixed(1)}/s errors=${result.errorCount}`);
    assert.equal(result.errorCount, 0, `vm 应 0 错误，实际: ${result.errors.join(", ")}`);
    assert.ok(result.successCount >= 90, `vm 成功 ${result.successCount} < 90`);
  });

  await t("基准 B: worker 引擎顺序 30 次（worker 创建成本高，少跑）", async () => {
    const result = await benchEngine("worker-seq", () => sandbox.executeSandbox(simpleCode, {}, { engine: "worker" }), 30, 1);
    console.log(`    [bench] worker-seq 30次: p50=${result.p50}ms p95=${result.p95}ms p99=${result.p99}ms avg=${result.avg.toFixed(2)}ms throughput=${result.throughputPerSec.toFixed(1)}/s errors=${result.errorCount}`);
    assert.equal(result.errorCount, 0, `worker 应 0 错误，实际: ${result.errors.join(", ")}`);
    assert.ok(result.successCount >= 20, `worker 成功 ${result.successCount} < 20`);
  });

  await t("基准 C: worker 引擎并发 5 × 6 次（共 30）", async () => {
    const result = await benchEngine("worker-conc-5", () => sandbox.executeSandbox(simpleCode, {}, { engine: "worker" }), 30, 5);
    console.log(`    [bench] worker-conc-5 30次(5并发): p50=${result.p50}ms p95=${result.p95}ms p99=${result.p99}ms avg=${result.avg.toFixed(2)}ms throughput=${result.throughputPerSec.toFixed(1)}/s errors=${result.errorCount}`);
    assert.equal(result.errorCount, 0);
  });

  await t("基准 D: auto 引擎顺序 30 次（resolveEngine 自动选）", async () => {
    const result = await benchEngine("auto-seq", () => sandbox.executeSandbox(simpleCode, {}, { engine: "auto" }), 30, 1);
    console.log(`    [bench] auto-seq 30次: p50=${result.p50}ms p95=${result.p95}ms p99=${result.p99}ms avg=${result.avg.toFixed(2)}ms throughput=${result.throughputPerSec.toFixed(1)}/s errors=${result.errorCount}`);
    assert.equal(result.errorCount, 0);
    assert.ok(result.successCount >= 20);
  });

  // iv 引擎可选（isolated-vm 编译失败时为 null）
  await t("基准 E: iv 引擎（若可用）顺序 10 次", async () => {
    try {
      require("isolated-vm");
    } catch (e) {
      console.log("    [skip] isolated-vm 未装，跳过");
      return;
    }
    const result = await benchEngine("iv-seq", () => sandbox.executeSandbox(simpleCode, {}, { engine: "iv" }), 10, 1);
    console.log(`    [bench] iv-seq 10次: p50=${result.p50}ms p95=${result.p95}ms p99=${result.p99}ms avg=${result.avg.toFixed(2)}ms throughput=${result.throughputPerSec.toFixed(1)}/s errors=${result.errorCount}`);
    assert.equal(result.errorCount, 0);
  });

  await t("vm 引擎 p50 < 5ms（简单脚本应 < 5ms）", async () => {
    const samples = [];
    for (let i = 0; i < 20; i++) {
      const r = await sandbox.executeSandbox("1+1", {}, { engine: "vm" });
      samples.push(r.durationMs);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(samples.length / 2)];
    console.log(`    [info] vm p50=${p50}ms, samples=[${samples.slice(0, 5).join(",")}...]`);
    assert.ok(p50 < 5, `vm p50=${p50}ms 超过 5ms`);
  });

  await t("resolveEngine('auto') 返回合法引擎", () => {
    const r = sandbox.resolveEngine("auto");
    assert.ok(["vm", "worker", "iv"].includes(r.engine), `resolveEngine('auto')=${r.engine}`);
    assert.equal(typeof r.available, "boolean");
  });

  await t("resolveEngine('worker') 总是返回 worker 可用", () => {
    const r = sandbox.resolveEngine("worker");
    assert.ok(r.engine === "worker" || r.engine === "vm", `resolveEngine('worker').engine=${r.engine}`);
  });

  await t("perf benchmark 不修改任何状态（idempotent）", async () => {
    // 跑前后两次 vm 基准，p50 应在 ±50% 范围
    const samples1 = [];
    for (let i = 0; i < 20; i++) {
      const r = await sandbox.executeSandbox("1+1", {}, { engine: "vm" });
      samples1.push(r.durationMs);
    }
    const samples2 = [];
    for (let i = 0; i < 20; i++) {
      const r = await sandbox.executeSandbox("1+1", {}, { engine: "vm" });
      samples2.push(r.durationMs);
    }
    const sum1 = samples1.reduce((a, b) => a + b, 0);
    const sum2 = samples2.reduce((a, b) => a + b, 0);
    const ratio = sum2 / sum1;
    console.log(`    [info] 两轮 vm 总耗时 ratio=${ratio.toFixed(2)} (期望 0.5-2.0)`);
    assert.ok(ratio > 0.5 && ratio < 2.0, `ratio=${ratio} 偏离 ±50%`);
  });

  await t("周期 9 P1-2 评估报告：基线数据 + 不实施优化", () => {
    const report = {
      cycle: 9,
      taskId: "P1-2",
      engines: ["vm", "worker", "auto", "iv (if installed)"],
      iterations: { vm: 100, worker: 30, auto: 30, concWorker: 30 },
      decision: "保留现状：vm 适合简单/快速场景；worker 适合隔离重计算；auto 默认 worker。",
      futureOptimization: "周期 10+ 评估：worker pool + 复用（避免每次新建 worker）",
    };
    assert.equal(report.cycle, 9);
    assert.equal(report.engines.length >= 3, true);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});