# SQLite Vector Extension 选型评估（周期 13 P2-2）

> 状态：Decision Document
> 日期：2026-09-09
> 作者：M3（自动化周期）

## 背景

本项目周期 11-12 实现了 `memoryVectorPrototype.js`（32-dim hash embedder + brute-force cosine），
周期 12 升级到 `hybridRetrieval.js`（vector + FTS5 + recency RRF）。
当前规模 < 10K 向量，brute-force 实测 P95 < 30ms。

未来规模路径：10K → 100K → 1M。
周期 12 调研 #12 列出了 5 个候选扩展，本文档做决策。

## 候选对比

| 扩展 | 维护者 | 部署方式 | 算法 | 性能（10K / 100K / 1M） | 集成成本 | 许可证 |
|------|--------|----------|------|------------------------|----------|--------|
| **brute-force cosine**（现状） | 自研 | 内存 | O(N·D) | 5ms / 50ms / 500ms | 0 | MIT |
| **sqlite-vec** | asg017 (7.9K Star) | SQLite extension | KNN 分块 SIMD | ~5ms / ~20ms / ~200ms | 中（需 CGO/native） | MIT |
| **SQLite Vec1** | sqlite.org | SQLite extension | IVFADC + OPQ | ~10ms / ~30ms / ~300ms | 低（单 .c 文件） | Public Domain |
| **vectorlite** | 1yefuwang1 / RapidAI | SQLite extension | hnswlib HNSW | ~3ms / ~10ms / ~100ms | 高（hnswlib 依赖） | Apache-2.0 |
| **libSQL / Turso** | Turso | 网络服务 | HNSW + replication | 异步（10ms+网络） | 高（外部依赖） | MIT |

## 决策矩阵

| 维度 | 权重 | brute-force | sqlite-vec | Vec1 | vectorlite | libSQL |
|------|------|-------------|------------|------|------------|--------|
| 当前规模 < 10K 性能 | 高 | A | A | B | A | C |
| 100K 规模性能 | 中 | C | A | B | A | A |
| 1M 规模性能 | 低 | F | B | B | A | A |
| 集成成本（无新依赖） | 中 | A+ | C | A | D | D |
| 内存占用 | 中 | A+ | B | B | C | A+ |
| 跨平台（Win/macOS/Linux） | 中 | A+ | A | A | B | B |
| 维护活跃度 | 低 | A | A | A | B | A |
| 决策 | - | **现状** | 6-12 月评估 | - | - | - |

**结论**：

1. **立即（cycle 13-14）**：保持 brute-force；启动 `sqliteBackend.js`（周期 13 P0-2）做 driver 抽象，
   未来切换 zero-friction。
2. **3-6 月**：写 ADR 评估 `sqlite-vec`（pre-v1 慎用，但已经是 embedded VDB 默认）。
3. **6-12 月**：若规模到 100K+ 且查询延迟 > 100ms，迁移到 `sqlite-vec`。
4. **不推荐**：vectorlite（依赖重 + hnswlib）+ libSQL（异步 + 外部依赖）。

## 触发条件

下列任一条件触发迁移到 sqlite-vec：
- 总向量数 > 50K
- 单次查询 P95 > 100ms
- 内存占用 > 1GB
- 需要 metadata 过滤 KNN（vec0 支持，brute-force 不支持）

## 决策回顾

本文档每个周期 review 一次（cycle N self-check 强制看一次）。
任何 ADR 变更需在 `docs/adr/` 留档。