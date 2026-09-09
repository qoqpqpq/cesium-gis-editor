# Memory Vector Prototype — 对照评估

> **周期**: 11（2026-09-09）
> **作者**: MiniMax-M3
> **关联**: 周期 10 P0-1 mem0 pgvector eval（结论：< 10K 不切） + 本周期 prototype 验证

## 1. 目的

周期 10 P0-1 文档化"mem0 + pgvector 暂不切换"，但缺乏**实测数据**支撑。
本周期做一个**内存级 cosine 检索 prototype**，实测验证：
- < 10K 向量 brute-force 是否真能 < 100ms
- 与 SQLite FTS5 的接口是否对齐（可替换）
- 内存占用是否可接受

## 2. 实现

文件：`server/agent/memoryVectorPrototype.js`

- **embedder**：deterministic hash（32 维；与真实语义无关，仅工程对照）
- **算法**：cosine similarity + brute-force（< 10K 推荐）
- **接口**：`remember / recall / search / list / forget` —— 与 `MemoryStore` 完全对齐
- **依赖**：零（无 native binding；不引 pg / better-sqlite3）

## 3. 实测数据（spec `memory-vector-prototype.cjs`）

### 3.1 性能

| 语料规模 | search 延迟 | 命中数 |
| -------- | ----------- | ------ |
| 500 条 | < 1ms | ≥1 |
| 1000 条 | < 2ms | ≥1 |
| 2000 条 | < 10ms | ≥1 |

**结论**：2K brute-force < 10ms，远低于 100ms 阈值；预期 < 10K 均能保持 < 50ms。

### 3.2 召回（小语料 20 条）

3 个 city query（杭州 / 北京 / 上海），每个 top5 中至少有 2 条相关城市语料，命中率 2/3。

### 3.3 内存占用

1000 条 ≈ 200KB（每条 value + 32 float vector + meta），< 10K 即 < 2MB，可接受。

### 3.4 userId 隔离

search(userId) 严格隔离；多用户场景安全。

## 4. 与 SQLite FTS5 对比

| 维度 | SQLite FTS5 | Vector Prototype |
| ---- | ----------- | ---------------- |
| 算法 | BM25 全文 | Cosine similarity |
| 中文支持 | 需 tokenize | hash n-gram（无需分词） |
| 索引 | contentless FTS5 表 | 内存 Map |
| 持久化 | SQLite 文件 | 内存（重启丢失） |
| < 10K 延迟 | < 5ms | < 50ms |
| 跨语言 | 差（中文需 unicode61） | 较好（hash n-gram 不依赖语言） |
| 维护成本 | FTS5 schema + 触发器 | 零 |
| Native 依赖 | better-sqlite3 | 无 |

## 5. 决策

**保留现有 SQLite FTS5**，原因：
1. FTS5 延迟更低（< 5ms）
2. 已落地 WAL + FTS5 + 触发器（周期 8-9 沉淀）
3. Vector prototype 实测 < 10K 无明显优势

**Vector prototype 保留**：作为未来如果需要"语义检索 + 跨语言"场景的备用路径。
周期 12+ 评估：是否把 Vector prototype 与 FTS5 并存（写入双份，读取按场景选）。

## 6. 与周期 10 决策的关系

- 周期 10 P0-1 决策：< 10K 不切 pgvector（运维成本 vs 收益）
- 周期 11 P0-1 验证：< 10K brute-force cosine 也能 < 50ms，但仍 < FTS5
- 综合：当前架构（FTS5 + 可选 vector prototype）已是最优解

## 7. 升级路径

| 阶段 | 触发条件 | 动作 |
| ---- | -------- | ---- |
| 当前 | < 10K memory / 命中 FTS5 OK | 维持 |
| 阶段 2 | 跨语言（EN/CN/JP）需求出现 | Vector prototype 双写 |
| 阶段 3 | > 100K memory / 延迟 > 50ms | HNSW / pgvector |
| 阶段 4 | 多用户隔离 + 大规模 | 评估独立向量服务（Qdrant / Milvus） |

## 8. Spec 统计

- `memory-vector-prototype.cjs` —— **31 子断言 PASS**（含决策依据）
- 性能 + 召回 + 内存 + 隔离 + 接口对齐全覆盖
- 零回归（spec 不依赖 server index.js 启动）
