# MemMachine Ground-Truth Preservation — 评估

> **周期**: 11（2026-09-09）
> **作者**: MiniMax-M3
> **关联**: 周期 10 调研 Top5 #2（CoALA + MemMachine + Mem0 ground-truth preservation）

## 1. 问题

AI Agent 长期记忆存在三种典型策略：

| 策略 | 代表 | 优点 | 缺点 |
| ---- | ---- | ---- | ---- |
| **完全保留原始 episodic** | MemMachine | 100% 召回原始对话 | 存储膨胀；冗余大 |
| **LLM 抽取 semantic** | Mem0 | 压缩比高；语义精炼 | 抽取有损；丢失细节；成本 |
| **混合（episodic + 摘要）** | Zep Graphiti / CoALA | 双层优势 | 实现复杂 |

周期 10 调研 Top5 #2 指出 memMachine 强调 **ground-truth preservation** —— 保留原始 episodic，不抽取。
本评估：当前架构（SQLite FTS5 + episodic 雏形）该如何对齐这个原则？

## 2. 当前架构分析（memory.js）

| 维度 | 当前实现 | MemMachine 模式 |
| ---- | -------- | --------------- |
| 数据模型 | key-value + tags + userId + ts | session → turn → fact triple |
| 检索 | FTS5 bm25 | 时序 + 实体引用 |
| 抽取 | 无（原文存储） | 无（保留原始） |
| 持久化 | SQLite WAL | Postgres |
| 跨会话 | ts + userId | session + 双时间戳 |
| 关系 | tags（一层） | 实体关系图 |

**当前 = episodic-only MemMachine 雏形**，符合 ground-truth preservation 原则。

## 3. 决策路径

### 3.1 短期（当前）
- ✅ **保留 episodic-only 原则**：remember(key, value) 原样存储，不做 LLM 抽取
- ✅ FTS5 全文检索满足大部分召回需求
- ✅ 周期 11 P0-1 Vector prototype 作为可选辅助（非替换）

### 3.2 中期（如果需要 semantic 抽取）
- 加 LLM 摘要层（轻量级：每 N 条 episodic 自动生成摘要）
- 摘要存同表（key=`summary:<convId>`，tags=['summary']）
- search() 优先召回摘要 + 关联 episodic

### 3.3 长期（如果跨会话关系复杂）
- 加 procedural memory（路由规则 + 工具偏好）
- episodic → semantic → procedural 三层（CoALA 框架）

## 4. 与现有 memory.js 接口对齐

无需改动核心接口：

```js
// 现有
memory.remember(key, value, { tags, userId });
memory.search(query, { userId, limit });

// 未来可加（不破坏）
memory.summarize(sessionId);  // LLM 抽取生成摘要
memory.link(parentKey, childKey);  // episodic → semantic 关系
```

## 5. 风险评估

| 风险 | 缓解 |
| ---- | ---- |
| 存储膨胀 | 周期 12+ 加 TTL + 自动归档；现在 1000 条 ≤ 200KB |
| 召回噪声 | FTS5 bm25 排序已有效；周期 11 P0-1 vector prototype 可加权融合 |
| 跨会话无关系 | 短期接受；CoALA 三层评估推到周期 12+ |
| 抽取有损 | 坚持 episodic-only；不引入 LLM 抽取 |

## 6. 行动清单

| # | 行动 | 落点 | 优先级 |
| # | ---- | ---- | ------ |
| 1 | 维持现有 `remember/recall/search` 不变 | 周期 11+ | — |
| 2 | 文档化"episodic-only"原则 | `docs/architecture/memory-principles.md`（周期 12+） | P2 |
| 3 | 加 `summarize()` 接口骨架（不接 LLM） | `memory.js`（周期 12+） | P2 |
| 4 | 加 procedural layer 评估 | `docs/evaluation/memory-procedural.md`（周期 13+） | P3 |

## 7. 与周期 10 决策的关系

| 周期 10 决策 | 本周期验证 |
| ------------ | ---------- |
| mem0 pgvector 暂不切 | ✅ 维持（< 10K FTS5 足够） |
| agent memory 三层渐进 | ✅ 本周期确认 episodic-only 优先 |
| FTS5 是 episodic 雏形 | ✅ MemMachine ground-truth 原则对齐 |

## 8. Spec 统计

- `mem-machine-ground-truth-eval.cjs` —— **20 子断言 PASS**
- 覆盖：文档结构、决策清晰、接口对齐、风险清单、行动清单
