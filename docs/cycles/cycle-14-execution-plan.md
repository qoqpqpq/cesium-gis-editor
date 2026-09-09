# Cycle 14 Execution Plan

> 周期 14 计划（2026-09-09）
> 总目标：落地 cycle-13 调研 Top5 + 反思驱动（OWASP ASI04/06/07 实质化 / node:sqlite 真实迁移 / OTel worker SDK + LLM span / CesiumJS Splat pipeline / RRF ablation）
> 预算：m3 ≤ 150 / M3 ≤ 450 / commits ≤ 12

---

## 总览

| 优先级 | ID | 任务 | 来源 | 子断言目标 |
|---|---|---|---|---|
| P0 | P0-1 | **AI 安全护栏深化（OWASP ASI04/06/07 实质化）** | cycle-13 Top5 #1 | ≥ 25 |
| P0 | P0-2 | **memory.js 真实迁移 node:sqlite backend** | cycle-13 Top5 #2 | ≥ 20 |
| P1 | P1-1 | **OTel worker SDK 集成 + LLM semantic span** | cycle-13 Top5 #3 | ≥ 18 |
| P1 | P1-2 | **RRF ablation spec（4 变体对比 + 启发式权重搜索）** | cycle-13 Top5 #5 | ≥ 20 |
| P1 | P1-3 | **hybridRetrieval LLM semantic span attributes** | cycle-13 Top5 #3 | ≥ 12 |
| P1 | P1-4 | **CesiumJS Splat pipeline 文档** | cycle-13 Top5 #4 | ≥ 10 |
| P2 | P2-1 | **handler-design checklist OWASP ASI 维度扩展** | cycle-13 反思 | ≥ 10 |
| P2 | P2-2 | **AI 风险映射 docs/security/ai-guardrails.md 扩展** | cycle-13 Top5 #1 | ≥ 8 |

合计：2 P0 + 4 P1 + 2 P2，**≥ 123 子断言**

---

## P0 详案

### P0-1：AI 安全护栏深化（OWASP ASI04/06/07 实质化）

**目标**：在 aiGuardrails.js 加 3 个新 guard 覆盖 ASI04/06/07，并扩展现有 5 步检查链到 8 步。

**新增/修改文件**：
- `server/middleware/aiGuardrails.js`：加 `validateManifest(manifest)`（ASI04 供应链：tool 来源/版本/签名校验）、`validateMemoryContext(payload)`（ASI06 记忆投毒：检测注入 payload）、`signInterAgentMessage(msg)`（ASI07 通信签名：HMAC-SHA256 + nonce）
- `tests/specs/ai-guardrails-deep.cjs`：≥ 25 子断言

**验收**：
- validateManifest 拒绝非白名单来源/版本不匹配/签名错
- validateMemoryContext 检测 3 类 memory 投毒模式（cross-user / replay / override）
- signInterAgentMessage HMAC 签名 + 验签 + nonce 防重放
- 周期 13 ai-guardrails.cjs 零回归

---

### P0-2：memory.js 真实迁移 node:sqlite backend

**目标**：把 memory.js 从 better-sqlite3 native binding 切到 sqliteBackend.js dispatch（自动检测 bun / node:sqlite / better-sqlite3 / 内存 fallback）。

**新增/修改文件**：
- `server/agent/memory.js`：MemoryStore 构造函数改造为接收 sqliteBackend 实例（或自动 dispatch）
- `tests/specs/memory-node-sqlite-migration.cjs`：≥ 20 子断言

**验收**：
- 真实跑通 Node 24+ node:sqlite（环境允许时）
- 自动 fallback better-sqlite3（若 node:sqlite 不可用）
- 旧 spec（memory-fts5 / memory-wal-pragma / memory-vector-prototype / memory-als-sqlite）零回归

---

## P1 详案

### P1-1：OTel worker SDK 集成 + LLM semantic span

**目标**：扩展 otelDevHook.js 加 `withWorkerSdkContext(carrier, fn)`（worker 内 install SDK） + ai.js / hybridRetrieval.js 加 LLM semantic span attributes。

**修改文件**：
- `server/agent/otelDevHook.js`：加 `withWorkerSdkContext()`（检测 worker 入口自动 install SDK）
- `server/services/ai.js`：在 ai.js 加 LLM span attribute hooks（platform / model / tokens / prompt_tokens / completion_tokens）

**新增文件**：
- `tests/specs/otel-worker-sdk-integration.cjs`：≥ 18 PASS

---

### P1-2：RRF ablation spec

**目标**：ablation spec 对比 hybridRetrieval.js 5 种 RRF strategy（standard / best-rank / diminishing / max+bonus / soft-dedup）+ 启发式权重搜索（heuristic sweep 不引入 Optuna 依赖）。

**新增文件**：
- `server/agent/hybridRetrieval.js`：加 `heuristicWeightSearch(corpus, queries, opts)`
- `tests/specs/hybrid-retrieval-ablation.cjs`：≥ 20 PASS
- cycle-13 hybrid-retrieval-strategies.cjs 零回归

---

### P1-3：hybridRetrieval LLM semantic span attributes

**目标**：在 hybridRetrieval.js 加可选 OTel semantic span attributes（query / numSources / strategy / topScore），兼容 otelDevHook.js ALS。

**修改文件**：
- `server/agent/hybridRetrieval.js`：加 span attribute hooks

**新增文件**：
- `tests/specs/hybrid-retrieval-otel-attributes.cjs`：≥ 12 PASS

---

### P1-4：CesiumJS Splat pipeline 文档

**目标**：写 `docs/guides/splat-pipeline.md`：从 GPS EXIF → COLMAP → SuGaR → Cesium ion 完整 pipeline + Microsoft campus 公共 splat 资源接入指南。

**新增文件**：
- `docs/guides/splat-pipeline.md`：详细文档
- `tests/specs/splat-pipeline-doc.cjs`：≥ 10 PASS（验证文档结构）

---

## P2 详案

### P2-1：handler-design checklist OWASP ASI 维度扩展
docs/architecture/handler-design-checklist.md 加 OWASP ASI01-10 维度（AI 专用 8 维）。spec ≥ 10。

### P2-2：AI 风险映射 docs/security/ai-guardrails.md 扩展
现有 ai-guardrails.md 加 ASI04/06/07 三项实质化 + ASI03/10 决策文档。spec ≥ 8。

---

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| node:sqlite 在 Node 24+ 才可用 | try/catch + 三向 dispatch；spec 用 mock driver 测三个 backend |
| OTel SDK 仍未真正安装 | graceful fallback；spec 验证 ALS path 工作即可 |
| 跨周期回归 | 跑所有 cycle-13 specs（26+ 老 specs）确认零失败 |

---

## 子断言预算

| 项 | 目标 | 累计 |
|---|---|---|
| P0-1 AI guardrails deep | 25 | 25 |
| P0-2 memory node:sqlite | 20 | 45 |
| P1-1 OTel worker SDK | 18 | 63 |
| P1-2 RRF ablation | 20 | 83 |
| P1-3 hybridRetrieval OTel | 12 | 95 |
| P1-4 splat pipeline doc | 10 | 105 |
| P2-1 handler checklist ASI | 10 | 115 |
| P2-2 ai-guardrails doc | 8 | **123** |
| **合计** | **≥ 123** | |

---

## Commit 计划

预计 9 个 commit：
1. `feat(cycle-14): p0-1 ai guardrails deep (validateManifest + validateMemoryContext + signInterAgentMessage)`
2. `feat(cycle-14): p0-2 memory node:sqlite backend migration`
3. `feat(cycle-14): p1-1 otel worker SDK integration + LLM semantic span`
4. `feat(cycle-14): p1-2 hybrid retrieval RRF ablation + heuristic weight search`
5. `feat(cycle-14): p1-3 hybrid retrieval OTel semantic span attributes`
6. `feat(cycle-14): p1-4 cesium splat pipeline documentation`
7. `feat(cycle-14): p2-1 handler design checklist OWASP ASI dimension`
8. `feat(cycle-14): p2-2 ai guardrails docs ASI04/06/07 + ASI03/10 decisions`
9. `chore(cycle-14): docs (plan + test-report + dev-log + research + lessons + self-check) + update upcoming-work + cycle-state`
