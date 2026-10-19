# Cycle 15 Dev Log

> 周期 15 实施日志（2026-10-15）
> 节奏：1h/轮，每轮一个任务
> 本轮：R1 —— 修复 hybrid-retrieval-rrf.cjs 6 FAIL 回归（L14-1）

---

## P0-1: 修复 hybrid-retrieval-rrf.cjs 6 FAIL 回归

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

## 总计

- **子断言**：37 PASS / 0 FAIL
- **Commits**：1 个
- **文件改动**：4 个修改 + 1 个新增（execution-plan）+ 4 个新增（dev-log / lessons / test-report / self-check）
