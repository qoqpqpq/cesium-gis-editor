# Cycle 15 Dev Log

> 周期 15 实施日志（2026-10-15）
> 节奏：1h/轮，每轮一个任务

---

## R1: P0-1 修复 hybrid-retrieval-rrf.cjs 6 FAIL 回归

**来源**：周期 14 L14-1 反思记录（预存回归，6 项 FAIL 跨周期未修复）

**修复内容**：

| 文件 | 改动 | 说明 |
|---|---|---|
| `server/agent/memory.js` | +42 行 | ① 加 `engine: 'like'` 选项强制 LIKE 路径 ② FTS5 返回空时自动回退 LIKE ③ LIKE 多词 + CJK 分词支持 |
| `server/agent/hybridRetrieval.js` | +9 行 | ① fetchChannel FTS5→LIKE 回退 ② computeRecencyScores halfLifeMs 守卫 |
| `docs/release-notes/upcoming-work.md` | 清理 | 移除 11 项过期条目，新增周期 15 待办（1 P0 + 5 P1 + 4 P2） |
| `state/cycle-state.json` | 更新 | current_cycle=15, status=in_progress |
| `docs/cycles/cycle-15-execution-plan.md` | 新建 | 本轮计划 |

**6 项 FAIL 根因分析**：

| ID | 问题 | 根因 | 修复 |
|---|---|---|---|
| C1 | `Cannot read properties of undefined (reading 'sources')` | FTS5 unicode61 分词器不支持 CJK，MATCH 返回 0 行 | FTS5→LIKE 自动回退 |
| C4 | `weakIdx5 !== -1 && weakIdx1 !== -1` | FTS5 返回空，候选集为空 | 同上 |
| C5 | `all.length > 0` | 同上 | 同上 |
| D4 | `score=0.011475 expected=0.016393` | FTS5 通道缺失（0.3 权重未贡献）+ LIKE 多词不匹配 | FTS5→LIKE 回退 + CJK 逐字拆分 |
| I2 | `k1 !== -1 && k5 !== -1` | FTS5 返回空 | 同上 |
| I3 | `out.length > 0` | FTS5 返回空 | 同上 |

**修复策略**：
1. **memory.js**：
   - 加 `engine: 'like'` 选项，调用方可强制 LIKE 路径
   - FTS5 返回空但 `ftsCount() > 0` 时，递归调用 LIKE 路径
   - LIKE 路径支持多词 AND 查询：按空格分词 + CJK 2 字一组拆分
2. **hybridRetrieval.js**：
   - `fetchChannel`：FTS5 返回空时自动调用 LIKE 回退
   - `computeRecencyScores`：守卫 `halfLifeMs <= 0` 防止除零

**子断言**：37 PASS / 0 FAIL（原 31 PASS / 6 FAIL）

**回归验证**：
- memory-fts5: 18 PASS ✅
- memory-wal-pragma: 14 PASS ✅
- memory-als-sqlite: 20 PASS ✅
- memory-node-sqlite-migration: 20 PASS ✅
- memory-middleware: 12 PASS ✅
- memory-vector-prototype: 32 PASS ✅
- hybrid-retrieval-strategies: 18 PASS ✅
- hybrid-retrieval-ablation: 16 PASS ✅
- hybrid-retrieval-otel-attributes: 13 PASS ✅
- sqlite-backend-dispatch: 19 PASS ✅
- server-import-completeness: 12 PASS ✅

**零回归确认**：11 个 spec 全部通过。

---

## R2: P1-1 node:sqlite + sqlite-vec 真实生产验证

**来源**：周期 14 调研 Top5 #2

**修复内容**：

| 文件 | 改动 | 说明 |
|---|---|---|
| `tests/specs/sqlite-production-vec.cjs` | 新建 | 25 PASS：node:sqlite 生产验证 + sqlite-vec 评估 |
| `docs/evaluation/sqlite-vec-decision.md` | 新建 | sqlite-vec 决策文档（暂不引入） |

**验证内容**：
- A组（8项）：node:sqlite 可用性、真实文件 DB、持久化、WAL、PRAGMA、版本检查、FTS5
- B组（3项）：1000行批插入/查询/索引查询性能基准
- C组（4项）：MemoryStore 集成（WAL、持久化、FTS5 CJK fallback、多词 LIKE）
- D组（5项）：sqlite-vec 评估（不可用、node:sqlite 限制、better-sqlite3、决策记录）
- E组（2项）：事务、并发读
- F组（3项）：driverPref 强制 node/better/bun fallback

**子断言**：25 PASS / 0 FAIL

**sqlite-vec 决策**：
- 暂不引入（当前向量规模 < 10K，memoryVectorPrototype 足够）
- 触发条件：向量规模 > 50K 或搜索延迟 > 100ms
- node:sqlite 不支持 loadExtension，需 better-sqlite3

**回归验证**：
- memory-node-sqlite-migration: 20 PASS ✅
- sqlite-backend-dispatch: 19 PASS ✅
- memory-fts5: 18 PASS ✅
- hybrid-retrieval-rrf: 37 PASS ✅
- memory-wal-pragma: 14 PASS ✅
- memory-als-sqlite: 20 PASS ✅
- sqlite-production-pragmas: 26 PASS ✅
- memory-vector-prototype: 32 PASS ✅
- server-import-completeness: 12 PASS ✅
- memory-middleware: 12 PASS ✅

**零回归确认**：10 个 spec 全部通过。

---

## R3: P1-2 ASI03 SPIFFE-lite workloadIdentity

**来源**：周期 14 调研 Top5 #3

**新增文件**：

| 文件 | 改动 | 说明 |
|---|---|---|
| `server/middleware/aiGuardrails.js` | +180 行 | ASI03 workload identity 实现 |
| `tests/specs/asi03-workload-identity.cjs` | 新建 | 39 PASS spec |

**实现内容**：
- `createWorkloadIdentity(opts)` — 三元组创建（toolName + userId + sessionId + privilege）
- `signWorkloadIdentity(identity, secret)` — HMAC-SHA256 签名
- `verifyWorkloadIdentity(signed, secret, opts)` — 签名验证 + ts 过期 + nonce 防重放
- `checkIdentityPrivilege(identity, requiredPrivilege)` — 权限级别检查（viewer < editor < admin < superadmin）
- `withWorkloadIdentity(toolFn, opts)` — 工具包装（身份验证 + 权限检查 + 执行）

**子断言**：39 PASS / 0 FAIL

**回归验证**：
- ai-guardrails: 39 PASS ✅
- ai-guardrails-deep: 38 PASS ✅
- server-import-completeness: 12 PASS ✅
- memory-fts5: 18 PASS ✅

**零回归确认**：4 个 spec 全部通过。

---

## R4: P1-3 Multi-agent GIS Agent 升级

**来源**：周期 14 调研 Top5 #3

**新增文件**：

| 文件 | 改动 | 说明 |
|---|---|---|
| `server/services/agentOrchestrator.js` | 新建 | Multi-agent 编排器（planner + executor + verifier） |
| `tests/specs/agent-multi-agent.cjs` | 新建 | 42 PASS spec |

**实现内容**：
- `createPlannerAgent(opts)` — 任务拆解为步骤列表
- `createExecutorAgent(opts)` — 执行单个步骤（支持工具调用 + 超时）
- `createVerifierAgent(opts)` — 验证步骤结果（pass/fail + feedback）
- `runOrchestratedTask(task, opts)` — 完整流水线（plan → execute → verify → retry）
- 辅助函数：parsePlan / parseExecutorResult / parseVerification / extractJson
- 默认系统提示词：DEFAULT_PLANNER_PROMPT / DEFAULT_EXECUTOR_PROMPT / DEFAULT_VERIFIER_PROMPT

**子断言**：42 PASS / 0 FAIL

**回归验证**：
- ai-guardrails: 39 PASS ✅
- ai-guardrails-deep: 38 PASS ✅
- server-import-completeness: 12 PASS ✅

**零回归确认**：3 个 spec 全部通过。

---

## R5: P1-4 cesium-mcp 拆分 4 个 server

**来源**：周期 14 调研 Top5 #4

**新增文件**：

| 文件 | 改动 | 说明 |
|---|---|---|
| `server/services/mcpServers/base.js` | 新建 | MCP Server 基类（manifest / callTool / listTools） |
| `server/services/mcpServers/cameraServer.js` | 新建 | Camera MCP Server（4 工具） |
| `server/services/mcpServers/entityServer.js` | 新建 | Entity MCP Server（4 工具） |
| `server/services/mcpServers/animationServer.js` | 新建 | Animation MCP Server（5 工具） |
| `server/services/mcpServers/imageryServer.js` | 新建 | Imagery MCP Server（5 工具） |
| `server/services/mcpServers/registry.js` | 新建 | MCP Server 注册表 |
| `server/services/mcpServers/index.js` | 新建 | 统一导出 |
| `tests/specs/cesium-mcp-servers.cjs` | 新建 | 36 PASS spec |

**实现内容**：
- `createMcpServer(opts)` — MCP Server 基类（tools 注册 / manifest / callTool / listTools）
- `createCameraServer(deps)` — Camera MCP Server（getCameraState / flyTo / getCameraHeading / setCameraMode）
- `createEntityServer(deps)` — Entity MCP Server（addMarker / removeMarker / listMarkers / spatialQuery）
- `createAnimationServer(deps)` — Animation MCP Server（playAnimation / pauseAnimation / stopAnimation / setAnimationSpeed / recordTimeline）
- `createImageryServer(deps)` — Imagery MCP Server（addImageryLayer / removeImageryLayer / listImageryLayers / screenshot / setImageryStyle）
- `createRegistry(deps)` — 注册表（4 server + 聚合 manifest + 总工具数 18）

**子断言**：36 PASS / 0 FAIL

**回归验证**：
- ai-guardrails: 39 PASS ✅
- ai-guardrails-deep: 38 PASS ✅
- server-import-completeness: 12 PASS ✅

**零回归确认**：3 个 spec 全部通过。

---

## 总计

- **R1**：37 PASS / 0 FAIL（P0-1）
- **R2**：25 PASS / 0 FAIL（P1-1）
- **R3**：39 PASS / 0 FAIL（P1-2）
- **R4**：42 PASS / 0 FAIL（P1-3）
- **R5**：36 PASS / 0 FAIL（P1-4）
- **Commits**：5 个
- **新增 spec**：4 个（sqlite-production-vec + asi03-workload-identity + agent-multi-agent + cesium-mcp-servers）
- **新增文档**：5 个（execution-plan 更新 + sqlite-vec-decision + execution-plan 更新 + execution-plan 更新 + execution-plan 更新）
