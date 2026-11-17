# cycle-103 审计：全量回归验证（cycle-97/98/99 清理后）

## 背景

cycle-97/98/99 清除 `client/src` 全部未用导入（18 处）后，仅做过 `vite build` + CSS 门禁。本轮对**全量回归**（`tests/specs/*.cjs`）验证清理零回归（运行手册门禁 6）。

## 结果

- `tests/specs/*.cjs` 共 **160** 个：批跑 **157 PASS / 3 FAIL**。
- 逐项核验：
  - `helmet-8-permissionspolicy-recheck.cjs`：批跑失败因**超时**（>120s）；单跑 **PASS（4/4）**。
  - `hybrid-retrieval-rrf.cjs`：批跑失败因**超时**；单跑 **PASS（37/37）**。
  - `sandbox-perf-benchmark.cjs`：真实 FAIL 为 `perf benchmark 不修改任何状态（idempotent）: ratio 偏离 ±50%`。

## sandbox-perf-benchmark 判定（flaky，非回归）

- **清理前 commit（`2e0fc70`）复跑**：ratio=1.67 → **PASS**。
- **当前 HEAD 复跑 3 次**：ratio=0.80 PASS → 0.75 PASS → 0.50 FAIL。
- **结论**：同一 commit 上 pass/fail **翻转**，属**环境性 flaky 基准**（vm 两轮计时比值对 CPU 负载敏感，边界 0.5–2.0 偶超），**与 client 导入清理无关**（该基准测 vm 引擎计时，不依赖任何 client/src）。
- 建议：将 `sandbox-perf-benchmark` 视为**信息性基准**（非阻塞门禁）；回归门禁以 `csp-permissions-policy`/`css-*`/`design-token-audit` 等确定性测试为准。

## 结论

- **无回归**：cycle-97/98/99 清理零功能回归（全量确定性测试通过；仅 1 个 flaky 性能基准偶超，非清理所致）。
- 安全自动任务至此**全部完成且经全量回归背书**。