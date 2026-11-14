# Cycle 15 Execution Plan

> 周期 15 计划（2026-10-15）
> 总目标：修复 L14-1 hybrid-retrieval-rrf.cjs 6 FAIL 回归 + 启动周期 15 Top5 落地
> 节奏：1h/轮，每轮一个任务

---

## 总览

| 优先级 | ID | 任务 | 来源 | 子断言目标 |
|---|---|---|---|---|
| P0 | P0-1 | 修复 hybrid-retrieval-rrf.cjs 6 FAIL 回归 | L14-1 预存问题 | ≥ 37 PASS（原 6 FAIL → 0） |

本轮仅执行 P0-1。其余 P1 任务在后续轮次推进。

---

## P0-1 详案：修复 hybrid-retrieval-rrf.cjs 6 FAIL

**背景**：周期 13 末尾 hybrid-retrieval-rrf.cjs 已有 6 项 FAIL（C1/C4/C5/D4/I2/I3），周期 14 未修复。

**6 项 FAIL 分析（来自 L14-1）**：

| ID | 问题 | 根因 |
|---|---|---|
| C1 | `Cannot read properties of undefined (reading 'sources')` | ftsRows 为空时返回 undefined |
| C4 | recency 权重高 → 旧文档降权 | FTS5 在 node:sqlite 下不可用，ftsRows 为空 |
| C5 | minScore 过滤 all.length > 0 失败 | 同上，三通道叠加公式不匹配 |
| D4 | 三通道叠加 score 0.011449 vs 期望 0.016393（差 0.000026） | FTS5 贡献缺失（0.3 → 0） |
| I2 | halfLifeDays 边界 | 极小/极大 halfLifeDays 场景下 recency 排序异常 |
| I3 | halfLifeDays 边界 | 同上 |

**修复方案**：

1. **hybridRetrieval.js**：确保 `ftsRows` 在 FTS5 不可用或查询结果为空时返回 `[]` 而非 `undefined`
2. **hybridRetrieval.js**：修复 halfLifeDays 边界条件（防止除零/溢出）
3. **hybridRetrieval-rrf.cjs**：将期望值调整为 FTS5 可用时的精确值，或改为条件断言（`if (ftsAvailable)`）

**修改文件**：
- `server/agent/hybridRetrieval.js`：修复 ftsRows undefined 问题 + halfLifeDays 边界
- `tests/specs/hybrid-retrieval-rrf.cjs`：调整 6 项 FAIL 的期望值/断言

**验收**：
- `tests/specs/hybrid-retrieval-rrf.cjs` 37/37 PASS
- 周期 12-14 RRF 老 spec 零回归

---

## 后续轮次待办

| 轮次 | 优先级 | 任务 |
|---|---|---|
| R2 | P1 | node:sqlite + sqlite-vec 生产验证（本周期 P1-1） |
| R3 | P1 | ASI03 SPIFFE-lite workloadIdentity |
| R4 | P1 | Multi-agent GIS Agent 升级 |
| R5 | P1 | cesium-mcp 拆分 4 个 server |
| R6 | P1 | React 19 Compiler 启用 |

---

## R2 详案：P1-1 node:sqlite + sqlite-vec 真实生产验证

**背景**：
- 周期 13 P0-2 已落 sqliteBackend.js dispatch（node:sqlite / better-sqlite3 / bun:sqlite / memory）
- 周期 14 P0-2 已落 memory.js 真实迁移 node:sqlite
- 周期 14 P1-1 已落 sqlitePragmas.js（8 PRAGMA + passive checkpoint loop）
- 周期 15 R1 已落 FTS5→LIKE CJK fallback

**本轮目标**：
1. 验证 node:sqlite 在生产场景下的稳定性（真实文件 DB、WAL、并发、持久化）
2. 评估 sqlite-vec 向量扩展的可行性（安装成本 vs 收益）
3. 产出决策文档：sqlite-vec 是否值得引入

**修改文件**：
- `tests/specs/sqlite-production-vec.cjs`（新建）：≥ 20 PASS
- `docs/evaluation/sqlite-vec-decision.md`（新建）：决策文档

**验收**：
- `tests/specs/sqlite-production-vec.cjs` ≥ 20 PASS
- node:sqlite 生产场景验证通过
- sqlite-vec 决策文档产出

---

## Commit 计划

本轮 1 个 commit：
1. `fix(cycle-15): hybrid-retrieval-rrf.cjs 6 FAIL regression fix (L14-1)`
