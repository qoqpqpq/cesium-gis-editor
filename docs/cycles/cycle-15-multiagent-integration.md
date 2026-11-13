// server/agent/multiAgentPlanner.js — 集成说明（供下一轮接 LLM planner 用）

> 周期 15 P0-1 交付：Multi-agent GIS Agent 骨架（planner + executor + verifier）。
> 本文件为增量集成说明，避免在主文档整段复制。

## 导出
`require('server/agent/multiAgentPlanner')`
- `createMultiAgentOrchestrator(config)` → `{ plan, execute, verify, run, tools }`
- `normalizeStep`, `detectCycle`（测试用内部函数）
- `PHASE_ORDER`, `DEFAULT_DANGEROUS_ACTIONS`, `DEFAULT_MAX_STEPS`

## config
- `tools`: `name -> { description, capability, phase, dangerous, inputSchema }`
- `allowlist`: `string[] | null`（缺省不限制；建议生产显式白名单，ASI02）
- `dangerousActionsRequireHITL`: 危险操作清单（默认与 aiGuardrails 对齐）
- `onConfirm(step)`: HITL 异步确认回调（ASI09）
- `maxSteps`: 单计划上限（默认 32）

## 三阶段
- `plan(goal)`：`{ steps }` 显式 / `{ capabilities, args? }` 按能力编排（按 phase 排序成 DAG）；fail-fast 校验未知依赖/环/白名单/步数上限
- `execute(plan, handlers)`：依赖感知，独立步骤并行；失败/阻断阻断下游（`skipped: upstream_failed`）；危险操作无 `onConfirm` → `blocked`，拒绝 → `blocked: hitl_rejected`
- `verify(plan, execution)`：按 `step.verify` 契约（`type` / `required` / `equals`）校验产物
- `run(goal, handlers, { requireAllVerified })`：一站式，`status ∈ completed | failed | blocked`

## 下一轮接 LLM planner 的路径
当前 planner 为确定性规则（capability/phase）。接入真实 LLM 时：保留 `execute`/`verify` 不变，仅把 `plan(goal)` 换成「LLM 产出 steps JSON → `normalizeStep` + `detectCycle` + 白名单校验」的适配层，即可复用既有门禁与 HITL，无需改动 executor/verifier。