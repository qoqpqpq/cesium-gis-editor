# sqlite-vec 决策文档

> 评估日期：2026-10-15（Cycle 15 R2）
> 评估结论：**暂不引入**（当前向量规模 < 10K，memoryVectorPrototype 足够）
> 重新评估触发条件：向量规模 > 50K 或搜索延迟 > 100ms

---

## 1. 背景

本项目周期 7-14 的向量搜索使用 `memoryVectorPrototype`（内存级实现）：
- `server/agent/memoryVectorPrototype.js`：内存 Map 存储向量，暴力搜索
- 无持久化，重启丢失
- 无 ANN（近似最近邻），全量暴力搜索

当前规模：
- 记忆条目：< 10K
- 向量维度：1536（OpenAI text-embedding-3-small）
- 搜索频率：低频（用户交互驱动）

---

## 2. 候选方案对比

| 方案 | 优势 | 劣势 | 适用规模 |
|---|---|---|---|
| **memoryVectorPrototype**（当前） | 零依赖、零编译、启动快 | 无持久化、O(n) 暴力搜索 | < 10K |
| **sqlite-vec** | SQLite 扩展、持久化、ANN 索引 | 需原生 C 编译、node:sqlite 不支持 loadExtension | 10K-1M |
| **pgvector** | Postgres 扩展、成熟生态、HNSW 索引 | 需独立 Postgres 实例、运维复杂 | 100K-10M |
| **Qdrant** | 专用向量数据库、云原生 | 独立服务、部署复杂 | 1M+ |
| **ChromaDB** | Python 友好、本地模式 | Python only、生产级不足 | < 100K |

---

## 3. sqlite-vec 评估详情

### 3.1 安装方式

```bash
# npm 安装（需预编译二进制或本地编译）
npm install sqlite-vec

# 需要 better-sqlite3（node:sqlite 不支持 loadExtension）
npm install better-sqlite3
```

### 3.2 关键限制

| 限制 | 详情 |
|---|---|
| node:sqlite 不支持 loadExtension | 需使用 better-sqlite3 或 bun:sqlite |
| 原生 C 编译 | 首次安装需编译（或下载预编译二进制） |
| 跨平台兼容 | macOS / Linux / Windows 各有编译要求 |
| Node ABI 兼容 | Node 版本升级可能导致编译失败 |

### 3.3 性能基准（理论值）

| 向量数 | 暴力搜索 | sqlite-vec HNSW | pgvector HNSW |
|---|---|---|---|
| 1K | < 1ms | < 1ms | < 2ms |
| 10K | < 5ms | < 2ms | < 3ms |
| 100K | < 50ms | < 5ms | < 5ms |
| 1M | < 500ms | < 10ms | < 10ms |
| 10M | 不可行 | < 20ms | < 20ms |

### 3.4 集成成本估算

| 工作项 | 工时 |
|---|---|
| 安装 + 编译验证 | 2h |
| memory.js 集成 sqlite-vec | 4h |
| spec 编写 + 调试 | 3h |
| 跨平台 CI 验证 | 2h |
| **合计** | **11h** |

---

## 4. 决策

### 4.1 当前决策：暂不引入

**理由**：
1. 当前向量规模 < 10K，memoryVectorPrototype 暴力搜索 < 5ms
2. sqlite-vec 需 better-sqlite3（node:sqlite 不支持 loadExtension）
3. 原生 C 编译增加部署复杂度
4. 本项目周期 10 P0-1 已评估 pgvector（决策：暂不引入）

### 4.2 重新评估触发条件

| 条件 | 阈值 | 动作 |
|---|---|---|
| 向量条目数 | > 50K | 评估 sqlite-vec 或 pgvector |
| 搜索延迟 | > 100ms | 引入 ANN 索引 |
| 多用户并发 | > 10 QPS | 评估专用向量数据库 |
| 持久化需求 | 必须 | 引入 sqlite-vec 或 pgvector |

### 4.3 升级路径

```
当前：< 10K → memoryVectorPrototype（暴力搜索）
  ↓ 触发条件 1
10K-100K → sqlite-vec（HNSW 索引，需 better-sqlite3）
  ↓ 触发条件 2
100K-1M → pgvector（HNSW 索引，需 Postgres）
  ↓ 触发条件 3
1M+ → Qdrant / Milvus（专用向量数据库）
```

---

## 5. 相关文档

- `server/agent/sqliteBackend.js` — SQLite backend dispatch
- `server/agent/memoryVectorPrototype.js` — 内存级向量搜索
- `tests/specs/sqlite-production-vec.cjs` — 生产验证 spec（25 PASS）
- `docs/cycles/cycle-10-dev-log.md` — pgvector 评估（周期 10）

---

## 6. 结论

**暂不引入 sqlite-vec**。当前 memoryVectorPrototype 满足需求，重新评估触发条件明确。当向量规模超过 50K 或搜索延迟超过 100ms 时，启动 sqlite-vec 评估。
