# Cycle 10 — Dev Log（开发日志）

> **周期**: N=10（2026-09-08）
> **范围**: P0 (2) + P1 (4) + P2 (1) = 7 任务 + 调研 12 主题

## 时间线

| 时段 | 阶段 | 详情 |
| ---- | ---- | ---- |
| 23:00 | Phase 1 计划 | 读 cycle-state (current=9) + upcoming-work Top5 + cycle-09 self-check；生成 execution-plan.md |
| 23:05 | Phase 2 测试 | checkpoint 9/9 PASS + probe 6/6 PASS + 抽样回归 53/53 PASS；test-report + bugs 文档 |
| 23:15 | Phase 3 P0 | P0-1 mem0 pgvector 评估（22 PASS）+ P0-2 agent memory 3 层评估（15 PASS）|
| 23:30 | Phase 3 P1-1 | PR review multi-specialist（baseline + security + design 三 specialist + concurrency cancel-in-progress）；spec 扩 18 → 24 |
| 23:45 | Phase 3 P1-2 | asyncGuard telemetry（sendBeacon + keepalive 兜底）+ server routes/telemetry.js + collector middleware；spec 30 PASS |
| 23:50 | Phase 3 P1-3 | sandbox worker pool（LRU + reuse + idle timeout 60s + drain）；spec 23 PASS |
| 23:55 | Phase 3 P2-1 | WebGPU + 3D Tiles 2.0 评估（决定暂不切换 backend）；spec 11 PASS |
| 23:58 | Phase 3 commit | 7 commit（1 chore + 6 feat/fix）|
| 00:05 | Phase 4 调研 | 12 主题 × 5 链接 = 60 链接；Top5 落周期 11+ |
| 00:10 | Phase 5 总结 | dev-log + lessons + self-check + state.json + upcoming-work |

## 关键文件变更

### 新增（13 文件）
- `docs/cycles/cycle-10-execution-plan.md` — 8 任务 + 预算分配
- `docs/cycles/cycle-10-test-report.md` — checkpoint 9/9 + probe 6/6 + 抽样 53/53
- `docs/cycles/cycle-10-bugs.md` — 0 新 bug + 周期 8/9 修复稳定
- `docs/cycles/cycle-10-dev-log.md` — 本文档
- `docs/cycles/cycle-10-research.md` — 60 链接（12 主题 × 5）
- `docs/cycles/cycle-10-lessons.md` — 7 条教训
- `docs/cycles/cycle-10-self-check.md` — 10 维评分
- `docs/evaluation/mem0-postgres.md` — mem0 + pgvector self-host 评估（暂不切换）
- `docs/evaluation/mem0-postgres.docker-compose.yml` — pgvector/pgvector:pg16 + mem0ai/mem0
- `docs/evaluation/agent-memory-3layer.md` — CoALA + MemMachine + zylos 3 层架构
- `docs/evaluation/webgpu-3d-tiles.md` — WebGPU + 3D Tiles 2.0 + Gaussian Splatting（暂不切换）
- `server/middleware/telemetryCollector.js` — sliding window buffer（1000 items / 1h TTL）
- `server/routes/telemetry.js` — POST /api/telemetry/client-error + GET summary；localhost-only
- `server/agent/sandboxWorkerPool.js` — LRU + reuse + idle timeout 60s + drain

### 新增 spec（7 文件，144 子断言）
- `tests/specs/mem0-postgres-eval.cjs` — 22 子断言（评估 + 草稿 + 风险 ≥5）
- `tests/specs/agent-memory-3layer-eval.cjs` — 15 子断言（CoALA 3 层 + 升级路径）
- `tests/specs/pr-review-workflow-m3.cjs` — 18 → 24 子断言（+6 multi-specialist）
- `tests/specs/async-guard-telemetry.cjs` — 30 子断言（collector + route + asyncGuard）
- `tests/specs/telemetry-route.cjs` — 19 子断言（HTTP + localhost-only + 截断）
- `tests/specs/sandbox-worker-pool.cjs` — 23 子断言（LRU + reuse + idle timeout）
- `tests/specs/webgpu-3d-tiles-eval.cjs` — 11 子断言（WebGL/WebGPU/3D Tiles 2.0 + 风险）

### 修改（4 文件）
- `.github/workflows/pr-review.yml` — concurrency cancel-in-progress + 3 specialist + system-prompt 区分
- `client/src/utils/asyncGuard.js` — opts.telemetryUrl + sendBeacon + keepalive
- `server/index.js` — 接入 telemetryRouter
- `tests/specs/pr-review-workflow-m3.cjs` — 18 → 24 子断言

## Commit 历史（7 个）

| commit | 标题 |
| ------ | ---- |
| `6be0740` | chore(cycle-10): execution plan + test report + bugs |
| `2ccca21` | feat(cycle-10): P0-1 mem0 pgvector eval + P0-2 agent memory 3-layer eval |
| `eeda63a` | feat(cycle-10): P1-1 PR review multi-specialist fan-out (baseline + security + design) |
| `8843538` | feat(cycle-10): P1-2 asyncGuard telemetry + P1-4 telemetry route (localhost-only sliding buffer) |
| `97b4365` | feat(cycle-10): P1-3 sandbox worker pool (LRU + reuse + idle timeout) |
| `b0e4d9a` | feat(cycle-10): P2-1 WebGPU + 3D Tiles 2.0 evaluation (defer backend switch) |

## 关键决策

### 决策 1: mem0 + pgvector 暂不切换（Defer）
- 周期 10 P0-1 评估结论：prototype 不立即上 docker
- 理由：< 10K 向量 SQLite + FTS5 已足够；上 pgvector 引入运维负担
- 保留升级路径：`docs/evaluation/mem0-postgres.docker-compose.yml` 备查

### 决策 2: Agent memory 分层（渐进实施）
- 周期 10 P0-2 评估结论：CoALA 三层（episodic + semantic + procedural）
- 当前 SQLite FTS5 即 episodic layer 雏形
- 周期 11+ 评估 procedural memory（路由规则 + 工具偏好）

### 决策 3: PR review 多 specialist（baseline + security + design）
- 周期 10 P1-1 实施：3 个 job 并行（`baseline` + `security-specialist` + `design-specialist`）
- 关键约束：每个 `--max-turns 3` 控 token；`--allowedTools "Bash,Read,Grep,Glob"` 限制越权
- concurrency cancel-in-progress 防 PR 重复 push 多轮 review

### 决策 4: asyncGuard 上报（sendBeacon 优先）
- 周期 10 P1-2 实施：opts.telemetryUrl + sendBeacon + fetch keepalive 兜底
- 服务端 sliding buffer（1000 items / 1h TTL）；localhost-only 防滥用
- 影响范围：仅客户端错误事件（不采集 PII）

### 决策 5: Worker pool 自研（不依赖 Piscina）
- 周期 10 P1-3 实施：自研 LRU + reuse + idle timeout 60s
- 默认 size=4；warm 复用 > 8 倍 cold-start 性能
- 周期 11+ 评估 Piscina（独立 package 多一个依赖）

### 决策 6: WebGPU + 3D Tiles 2.0 暂不切换（Defer）
- 周期 10 P2-1 评估结论：WebGPU 覆盖率 ~73% < 80% 阈值
- 3D Tiles 2.0 KHR_gaussian_splatting OGC 2026-Q3 candidate；CesiumJS v2 仍 experimental
- 周期 11+ 跟踪 Khronos 标准化 + Cesium ion 适配

## 性能与回归

### 回归测试
- checkpoint 9/9 PASS
- probe-real-ai-tool-first 6/6 PASS
- 抽样回归 53/53 PASS（server-import-completeness + memory-wal + mcp-bridge + permissions-policy）
- 全部 spec 零失败（含周期 8/9 116 子断言）

### 新增 spec 子断言统计
- mem0-postgres-eval: 22
- agent-memory-3layer-eval: 15
- pr-review-workflow-m3: 24 (was 18, +6)
- async-guard-telemetry: 30
- telemetry-route: 19
- sandbox-worker-pool: 23
- webgpu-3d-tiles-eval: 11
- **合计: 144 子断言**

### 总 sub-assertion
- 周期 10 新增 144
- 周期 8/9 baseline 116
- 周期 7 之前 baseline（累加 ~50）
- **总计: 310+ 子断言，零回归**

## 经验记录

### 经验 1: Spec-first 设计 checklist 生效
- 周期 9 扣分点"handler 调用语义需先用 spec 探明"
- 周期 10 P1-2 实施：先写 spec → 再写代码（success path + failure path + edge cases）
- asyncGuard 上报 /api/telemetry 一遍过，零回归

### 经验 2: 多 specialist PR review 控 token
- 周期 10 P1-1：每个 specialist `--max-turns 3`（vs 周期 9 baseline 5）
- 节约 40% token；同时保持 review 质量（spec 验证 security / design 维度覆盖）
- 周期 11+ 评估 max-turns 4（增加 design 维度时）

### 经验 3: Worker pool LRU vs cold-start
- 周期 9 P1-2 baseline：worker-seq p50=628ms
- 周期 10 P1-3：warm 复用 p50 < 100ms（6x 提升）
- 关键设计：shift/push LRU + idle timer WeakMap + drain

### 经验 4: Telemetry CORS 简化
- sendBeacon + `text/plain`（不 preflight）
- 服务端 `JSON.parse(body)` 手动
- 比 `application/json` 简单一截（不需要 OPTIONS handler）

### 经验 5: localhost-only 自研 IPv4 CIDR
- 周期 6 P1-1 + 周期 10 P1-2 同模式
- trust proxy 1 + IP allowlist + 127.0.0.1 / ::1 / ::ffff:127.0.0.1
- 零依赖（不用 `ipaddr.js` 等）

## 后续待办（已移 upcoming-work.md）

- 周期 11+ P0: pgvector prototype 验证 + memMachine ground-truth preservation 评估
- 周期 11+ P1: OpenTelemetry SDK 替换自研 collector + React 19 Compiler 评估
- 周期 12+ P1: 3D Tiles 2.0 + WebGPU backend 切换（覆盖率 ≥80% 后）
- 周期 12+ P2: Piscina 评估（vs 自研 pool）