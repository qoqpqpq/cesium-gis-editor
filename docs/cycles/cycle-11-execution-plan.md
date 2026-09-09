# Cycle 11 — Execution Plan（执行计划）

> **周期**: N=11（2026-09-09）
> **模型**: MiniMax-M3
> **预算**: m3 ≤150, M3 ≤450, commits ≤12
> **范围**: 落周期 10 调研 Top5（pgvector prototype / memMachine ground-truth / OpenTelemetry SDK / React 19 Compiler / 3D Tiles 2.0 + WebGPU）；继续 P0/P1 池子；扣分项 1：handler design checklist 文件化

## 1. 周期 10 → 11 调研 → 落地映射

| 调研 Top5（来自 cycle-10-research.md） | 周期 11 落点 | 状态 |
| --- | --- | --- |
| 1. pgvector prototype < 10K | **P0-1**: 真做一个内存级 sqlite + js 向量检索 prototype（500–2000 条 memory embedding）做对照实验；写 spec 验证 prototype 召回率 vs SQLite FTS5 | plan |
| 2. memMachine ground-truth preservation | **P0-2**: `docs/evaluation/mem-machine-ground-truth.md` —— 评估"保留原始 episodic 不抽取"的具体策略；spec 验证 | plan |
| 3. OpenTelemetry SDK 替换 | **P1-1**: spike `@opentelemetry/sdk-node` + `@opentelemetry/exporter-trace-otlp-http`，写最小 demo（无副作用）；spec 验证决策 = 不替换 | plan |
| 4. React 19 Compiler + Actions | **P1-2**: 客户端引入 React 19 `useActionState` 包裹 AI agent 表单；CycleViewer 加 ErrorBoundary 升级版；spec 验证 actions 错误边界 | plan |
| 5. 3D Tiles 2.0 + WebGPU 跟踪 | **P1-3**: 跟踪 `KHR_gaussian_splatting` 在 Cesium ion 与 Mapbox 的实际落地进展；写 `docs/evaluation/3d-tiles-2-followup.md` + spec | plan |
| 调研外加成 | **P1-4**: handler design checklist 文件化（`docs/architecture/handler-design-checklist.md`）—— 周期 10 扣分项（10） | plan |

## 2. 任务清单（9 项 + 调研 12 主题）

### P0（必须完成，2 项）

- [ ] **P0-1** pgvector vs SQLite FTS5 prototype 对照实验
  - 新建 `server/agent/memoryVectorPrototype.js`：内存级 cosine 相似度检索，500–2000 条 mock embedding（用 deterministic hash embedder，与真实语义无关即可）
  - 写 `tests/specs/memory-vector-prototype.cjs`（≥15 子断言）：与现有 `memory-fts5.cjs` 同输入下召回率对比、延迟对比、内存占用
  - 写 `docs/evaluation/memory-vector-prototype.md`：结论（"< 10K 向量 prototype 决策依据"）
- [ ] **P0-2** memMachine ground-truth preservation 评估文档
  - 写 `docs/evaluation/mem-machine-ground-truth.md`：CoALA + MemMachine + Mem0 三方 ground-truth 策略对比；保留原始 episodic vs 抽取 semantic 的取舍
  - 写 `tests/specs/mem-machine-ground-truth-eval.cjs`（≥10 子断言）：文档结构、决策清晰、与 memory.js 接口对齐、风险清单

### P1（高优先级，至少完成 4 项）

- [ ] **P1-1** OpenTelemetry SDK spike（不替换，验证决策）
  - 写 `docs/evaluation/otel-sdk-spike.md`：spike `@opentelemetry/sdk-node` + `@opentelemetry/exporter-trace-otlp-http` 集成成本、依赖体积、API 兼容性
  - 写 `tests/specs/otel-sdk-spike.cjs`（≥12 子断言）：文档存在、风险评估、决策 = 暂不替换（自研 sliding buffer 够用）
- [ ] **P1-2** React 19 useActionState 错误边界（客户端）
  - 客户端 `package.json` 检查 React 版本；若 < 19 则 pin 19.x 并装
  - 加 `client/src/utils/useActionStateGuard.js`：useActionState wrapper，统一错误捕获（async throw → render 错误态）
  - 写 `tests/specs/react19-use-action-state-guard.cjs`（≥12 子断言）：错误捕获语义、async throw 兼容、reducer 正确性
- [ ] **P1-3** 3D Tiles 2.0 KHR_gaussian_splatting 跟进评估
  - 写 `docs/evaluation/3d-tiles-2-followup.md`：Khronos KHR_gaussian_splatting OGC 进展、Cesium ion 适配、Mapbox GL JS 3D 集成
  - 写 `tests/specs/3d-tiles-2-followup.cjs`（≥10 子断言）：文档结构、决策、与周期 10 P2-1 衔接
- [ ] **P1-4** Handler Design Checklist 文件化（扣分项 1）
  - 写 `docs/architecture/handler-design-checklist.md`：8 维度清单（返回值语义 / 同步异步 / 错误传递 / 类型 / 副作用 / 状态 / 文档 / 测试）
  - 写 `tests/specs/handler-design-checklist.cjs`（≥8 子断言）：文档存在、覆盖维度、引用反例（C9-B01/C9-B02/C8-B01）

### P2（中低优先级，按预算允许）

- [ ] **P2-1** Sandbox worker pool + Piscina 评估
  - 写 `docs/evaluation/piscina-vs-pool.md`：Piscina（独立包）vs 自研 pool（`sandboxWorkerPool.js`）对比（依赖、体积、API、性能、维护）
  - 写 `tests/specs/piscina-vs-pool-eval.cjs`（≥10 子断言）
- [ ] **P2-2** AsyncGuard telemetry buffer persistence
  - 把周期 10 P1-2 + P1-4 sliding buffer 升级为可选持久化：env `TELEMETRY_PERSIST_PATH` 启用后写 JSONL
  - 写 `tests/specs/telemetry-buffer-persist.cjs`（≥10 子断言）
- [ ] **P2-3** Memory middleware ALS requestId 全链路 trace
  - 周期 8 P1-3 memoryContextMiddleware 已生成 `x-request-id` 写响应头；本周期把它串到日志（`server/middleware/logger.js` 已有 redact）
  - 写 `tests/specs/requestid-trace-link.cjs`（≥8 子断言）

## 3. 周期 11 预算分配

| 类别 | 数量 | 模型调用 |
| ---- | ---- | -------- |
| P0 | 2（1 prototype + 1 评估） | m3 ≤35 |
| P1 | 4（3 spike/评估 + 1 文档化） | m3 ≤75 + M3 ≤250 |
| P2 | 3（评估 + 持久化 + trace） | m3 ≤25 |
| 调研 | 12 主题 × 5 链接 = 60 链接 | M3 ≤120 |
| 文档 | 7 文件 + state 更新 | m3 ≤15 |
| **合计** | **9 任务 + 调研 60 链接** | **m3 150 / M3 370** |
| commits 预算 | 12 个，估算 8 个 | — |

## 4. 风险与缓解

| 风险 | 缓解 |
| ---- | ---- |
| pgvector prototype 召回率对比无 ground truth | 用 deterministic hash embedder + 自建 50 条小语料 + 关键词 gold set；声明"语义无关"为评估前提 |
| OTel SDK 引入依赖体积大 | 仅文档化 spike 报告，不实际 npm install；spec 验证仅文件存在 |
| React 19 升级可能破坏现有 Vite 配置 | spec 先验证现有 package.json；不实际升级 React 版本（pin 19.x 不在本周期范围） |
| useActionState 需要 React 19；当前项目可能未升 | 先 spec 检查；若 React < 19 则 spec 验证"等待升级"决策 |
| Piscina 评估需装包测试 | 仅文档化对比；spec 验证文档结构 |
| telemetry buffer 持久化引入磁盘 I/O | 仅 env 启用；默认关闭；spec 验证默认行为不变 |

## 5. 与周期 10 自检差距

| 周期 10 自检扣分点 | 周期 11 行动 |
| --- | --- |
| handler design checklist 未沉淀（扣 2 分） | **P1-4** 显式文件化 `docs/architecture/handler-design-checklist.md` + spec |

## 6. 验收硬关

- [ ] `node tests/checkpoint.cjs --report-only` → 9 项全 PASS
- [ ] `node tests/probe-real-ai-tool-first.cjs` → PASS
- [ ] 所有新增 spec PASS（≥75 新子断言）
- [ ] 旧 spec 零回归（抽样 ≥60 子断言 PASS）
- [ ] commits ≤ 12 上限
- [ ] 调研 60 链接齐
- [ ] state.json 更新 current_cycle=11, last_run_status=completed
- [ ] push 到 origin/feat/auto-cycle

## 7. 文件改动清单（预）

| 文件 | 操作 | 任务 |
| ---- | ---- | ---- |
| `docs/cycles/cycle-11-execution-plan.md` | create | Phase 1 |
| `docs/cycles/cycle-11-test-report.md` | create | Phase 2 |
| `docs/cycles/cycle-11-bugs.md` | create | Phase 2 |
| `server/agent/memoryVectorPrototype.js` | create | P0-1 |
| `tests/specs/memory-vector-prototype.cjs` | create | P0-1 |
| `docs/evaluation/memory-vector-prototype.md` | create | P0-1 |
| `docs/evaluation/mem-machine-ground-truth.md` | create | P0-2 |
| `tests/specs/mem-machine-ground-truth-eval.cjs` | create | P0-2 |
| `docs/evaluation/otel-sdk-spike.md` | create | P1-1 |
| `tests/specs/otel-sdk-spike.cjs` | create | P1-1 |
| `client/src/utils/useActionStateGuard.js` | create | P1-2 |
| `tests/specs/react19-use-action-state-guard.cjs` | create | P1-2 |
| `docs/evaluation/3d-tiles-2-followup.md` | create | P1-3 |
| `tests/specs/3d-tiles-2-followup.cjs` | create | P1-3 |
| `docs/architecture/handler-design-checklist.md` | create | P1-4 |
| `tests/specs/handler-design-checklist.cjs` | create | P1-4 |
| `docs/evaluation/piscina-vs-pool.md` | create | P2-1 |
| `tests/specs/piscina-vs-pool-eval.cjs` | create | P2-1 |
| `server/middleware/telemetryCollector.js` | modify | P2-2 |
| `tests/specs/telemetry-buffer-persist.cjs` | create | P2-2 |
| `server/middleware/logger.js` | modify | P2-3 |
| `tests/specs/requestid-trace-link.cjs` | create | P2-3 |
| `docs/cycles/cycle-11-research.md` | create | Phase 4 |
| `docs/cycles/cycle-11-dev-log.md` | create | Phase 5 |
| `docs/cycles/cycle-11-lessons.md` | create | Phase 5 |
| `docs/cycles/cycle-11-self-check.md` | create | Phase 5 |
| `docs/release-notes/upcoming-work.md` | modify | Phase 5 |
| `state/cycle-state.json` | modify | Phase 5 |
