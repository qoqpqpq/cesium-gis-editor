# Cycle 10 — Execution Plan（执行计划）

> **周期**: N=10（2026-09-08）
> **模型**: MiniMax-M3
> **预算**: m3 ≤150, M3 ≤450, commits ≤12
> **范围**: 落周期 9 调研 Top5（Multi-specialist PR review / mem0 pgvector / asyncGuard → /api/telemetry / Worker pool / WebGPU）；继续 P0/P1 池子

## 1. 周期 9 → 10 调研 → 落地映射

| 调研 Top5（来自 cycle-09-research.md） | 周期 10 落点 | 状态 |
| --- | --- | --- |
| 1. Multi-specialist PR review | **P1-1**: 升级 pr-review.yml 加 security / design 三 specialist；扩 spec | plan |
| 2. mem0 pgvector | **P0-1**: `docs/evaluation/mem0-postgres.md` 评估文档 + docker-compose 草稿 + spec | plan |
| 3. asyncGuard → /api/telemetry | **P1-2**: 升级 `client/src/utils/asyncGuard.js` 上报 POST `/api/telemetry/client-error` + server 端 endpoint + spec | plan |
| 4. Sandbox worker pool | **P1-3**: 实现 `server/agent/sandboxWorkerPool.js`（LRU + reuse），spec 验证 worker-seq < 100ms | plan |
| 5. 3D Tiles 2.0 + WebGPU | **P2-1**: 评估 spec（cesiumJS v2 WebGPU + 3D Tiles 2.0 Gaussian Splatting），文档化决策 | plan |

## 2. 任务清单（8 项 + 评估 1 项）

### P0（必须完成，2 项）

- [ ] **P0-1** mem0 pgvector self-host 评估文档
  - 写 `docs/evaluation/mem0-postgres.md`（含 docker-compose 草稿 + 容量估算 + 风险评估）
  - 写 `tests/specs/mem0-postgres-eval.cjs`（12 子断言：文档存在 + 草稿可解析 + pgvector schema 合理 + 与 memory.js 接口对齐 + 风险清单 ≥5 项）
- [ ] **P0-2** Agent memory 三层架构（episodic + semantic + procedural）评估文档
  - 写 `docs/evaluation/agent-memory-3layer.md`（CoALA 框架 + memMachine 三层 + Zep Graphiti 双时间戳）
  - 写 `tests/specs/agent-memory-3layer-eval.cjs`（10 子断言：三层定义清晰 + memory.js 升级路径 + 与 FTS5 WAL 兼容 + 风险 ≤10 项）

### P1（高优先级，至少完成 4 项）

- [ ] **P1-1** PR review multi-specialist（baseline + security + design）
  - 升级 `.github/workflows/pr-review.yml`：拆分 3 个 specialist job（baseline / security / design），用 anthropics/claude-code-action 三次，system-prompt 区分
  - 扩 `tests/specs/pr-review-workflow-m3.cjs`（≥25 子断言）
- [ ] **P1-2** asyncGuard 上报到 /api/telemetry
  - 加 `server/routes/telemetry.js`（POST /api/telemetry/client-error + localhost-only）
  - 加 `server/middleware/telemetryCollector.js`（sliding window 内存 buffer，>100/分钟聚合）
  - 升级 `client/src/utils/asyncGuard.js`：opts.telemetryUrl 字段，POST 上报（navigator.sendBeacon 优先）
  - 写 `tests/specs/async-guard-telemetry.cjs`（15 子断言）
- [ ] **P1-3** Sandbox worker pool（reuse + LRU）
  - 写 `server/agent/sandboxWorkerPool.js`（LRU + size=N env 配置 + warm-up）
  - 改 `server/agent/sandbox.js`：executeSandbox 'worker' 路径走 pool
  - 写 `tests/specs/sandbox-worker-pool.cjs`（12 子断言：复用 ≥5 次 + warm < 100ms + LRU 驱逐）
- [ ] **P1-4** Telemetry 路由 spec（与 P1-2 配套）
  - 写 `tests/specs/telemetry-route.cjs`（10 子断言：POST 接受 + localhost-only + sliding buffer + 高 QPS 聚合）

### P2（中低优先级，按预算允许）

- [ ] **P2-1** 3D Tiles 2.0 + WebGPU pipeline 评估
  - 写 `docs/evaluation/webgpu-3d-tiles.md`（cesiumJS v2 WebGPU backend + 3D Tiles 2.0 Gaussian Splatting）
  - 写 `tests/specs/webgpu-3d-tiles-eval.cjs`（6 子断言：评估决策 + 风险 + 升级路径）

## 3. 周期 10 预算分配

| 类别 | 数量 | 模型调用 |
| ---- | ---- | -------- |
| P0 | 2 评估文档 | m3 ≤30 |
| P1 | 4 实现 | m3 ≤90 + M3 ≤300 |
| P2 | 1 评估 | m3 ≤15 |
| 调研 | 12 主题 × 5 链接 | M3 ≤120（web fetch） |
| 文档 | 6 文件（research/dev-log/lessons/self-check + 2 evaluation） | m3 ≤15 |
| **合计** | **8 任务 + 调研 60 链接** | **m3 150 / M3 420** |
| commits 预算 | 12 个，估算 9 个 | — |

## 4. 风险与缓解

| 风险 | 缓解 |
| ---- | ---- |
| PR review 拆 3 specialist 可能 token 爆 | 加 `concurrency: group: pr-review-${{ github.event.pull_request.number }}, cancel-in-progress: true`；每个 specialist `--max-turns 3` |
| asyncGuard 上报引入网络请求，影响页面性能 | 默认走 `navigator.sendBeacon`（异步、非阻塞）；失败仅 console.warn |
| Worker pool 在 prototype env 无 worker | fallback 到 vm；spec 测 prototype pool size=0 不崩 |
| mem0 docker-compose 太复杂 | 文档化"先 prototype 不上 docker"路径；spec 验证草稿 yaml 语法合法 |
| WebGPU backend 切换可能破坏现有 viewer | 评估 spec 优先；不切换，仅文档化决策 |

## 5. 与周期 9 自检差距

| 周期 9 自检扣分点 | 周期 10 行动 |
| --- | --- |
| "handler 调用语义需先用 spec 探明"软肋（扣 2 分） | P1-2 写"asyncGuard 上报设计 checklist"前置：先写 spec → 再写代码 |
| 调研 → 落地比例 4/5 (80%) | 周期 10 5/5 (100%)：每个 Top5 都落至少 1 个 P 任务 |

## 6. 验收硬关

- [ ] `node tests/checkpoint.cjs --report-only` → 9 项全 PASS
- [ ] `node tests/probe-real-ai-tool-first.cjs` → PASS
- [ ] 所有新增 spec PASS（≥67 新子断言）
- [ ] 旧 spec 零回归（≥116 + 105 = ≥221 子断言抽样 PASS）
- [ ] 12 commit ≤ 12 上限
- [ ] 调研 60 链接齐
- [ ] state.json 更新 current_cycle=10, last_run_status=completed
- [ ] push 到 origin/feat/auto-cycle

## 7. 周期时间分配（参考）

| 阶段 | 内容 | 时间估算 |
| ---- | ---- | -------- |
| Phase 1 | 本计划 | ✓ |
| Phase 2 | test report + bugs | 5 min |
| Phase 3 | 8 任务实现 + spec | 80 min |
| Phase 4 | 调研 60 链接 | 25 min |
| Phase 5 | research + dev-log + lessons + self-check + state | 15 min |
| **合计** | — | **125 min** |

## 8. 文件改动清单（预）

| 文件 | 操作 | 任务 |
| ---- | ---- | ---- |
| `docs/cycles/cycle-10-execution-plan.md` | create | Phase 1 |
| `docs/cycles/cycle-10-test-report.md` | create | Phase 2 |
| `docs/cycles/cycle-10-bugs.md` | create | Phase 2 |
| `docs/evaluation/mem0-postgres.md` | create | P0-1 |
| `tests/specs/mem0-postgres-eval.cjs` | create | P0-1 |
| `docs/evaluation/agent-memory-3layer.md` | create | P0-2 |
| `tests/specs/agent-memory-3layer-eval.cjs` | create | P0-2 |
| `.github/workflows/pr-review.yml` | modify | P1-1 |
| `tests/specs/pr-review-workflow-m3.cjs` | modify | P1-1 |
| `server/routes/telemetry.js` | create | P1-2 |
| `server/middleware/telemetryCollector.js` | create | P1-2 |
| `client/src/utils/asyncGuard.js` | modify | P1-2 |
| `tests/specs/async-guard-telemetry.cjs` | create | P1-2 |
| `server/agent/sandboxWorkerPool.js` | create | P1-3 |
| `server/agent/sandbox.js` | modify | P1-3 |
| `tests/specs/sandbox-worker-pool.cjs` | create | P1-3 |
| `tests/specs/telemetry-route.cjs` | create | P1-4 |
| `docs/evaluation/webgpu-3d-tiles.md` | create | P2-1 |
| `tests/specs/webgpu-3d-tiles-eval.cjs` | create | P2-1 |
| `docs/cycles/cycle-10-research.md` | create | Phase 4 |
| `docs/cycles/cycle-10-dev-log.md` | create | Phase 5 |
| `docs/cycles/cycle-10-lessons.md` | create | Phase 5 |
| `docs/cycles/cycle-10-self-check.md` | create | Phase 5 |
| `docs/release-notes/upcoming-work.md` | modify | Phase 5 |
| `state/cycle-state.json` | modify | Phase 5 |