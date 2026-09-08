# AI Agent 长期记忆三层架构评估（episodic + semantic + procedural）

> **周期**: 10（2026-09-08）P0-2
> **目的**: 评估将 `server/agent/memory.js`（周期 7-9 prototype）从单层（key-value + FTS5）升级到三层记忆（episodic + semantic + procedural）的可行性
> **理论根**: CoALA 框架（Berkeley 2024）+ MemMachine 三层 + zylos taxonomy 共识
> **结论（先）**: **分层设计 + 渐进实施**。周期 11+ 在 prototype 验证三层价值后再决定是否合并到 memory.js 主干

## 1. 三层定义（CoALA 框架）

| 层 | 定义 | 存储 | 检索方式 | 周期 |
| --- | ---- | ---- | -------- | ---- |
| **episodic**（情景） | 原始对话事件 + 时间戳；保留 ground-truth | 关系型 DB（SQLite/Postgres） | 时间窗口 + FTS5 全文 | 当前 |
| **semantic**（语义） | 抽取出的事实 + 向量；可关联相似事实 | 向量 DB（pgvector） | cosine + tag filter | 未来 |
| **procedural**（程序） | 工具调用规则 + 偏好 + 风险阈值；可被 LLM 注入 | KV / file | 直接注入 system prompt | 当前 |

## 2. 与现状对照

### 2.1 memory.js 当前实现

| 数据 | 现状归属 | 三层定位 |
| ---- | -------- | -------- |
| `MemoryStore.remember(key, value, {tags})` | 一层（key-value） | 应是 episodic 层 + semantic 层双写 |
| `_fts` 虚拟表（周期 8 P0-1） | 一层（FTS5） | 是 episodic 层的检索入口 |
| `_tryInitFts5()` 失败 fallback LIKE | 一层 | 同上 |
| `memoryContextMiddleware`（周期 8 P1-3） | ALS context | 隐式 episodic 上下文 |
| `conversationContext` AsyncLocalStorage | ALS（in-memory） | procedural 候选（preference 注入） |

### 2.2 缺口

- **semantic 层完全缺失** —— 没有 embedding，没有 LLM 抽取
- **procedural 层零散** —— system prompts 在 `services/ai-prompts.js`，未与 memory.js 联动
- **episodic 与 semantic 双写路径** —— 当前仅 single store，无双写协调

## 3. 升级路径（推荐）

### 3.1 短期（周期 11+）

1. 加 `memory.episodic.remember()` / `recall()` 子命名空间（保留旧 API 兼容）
2. 加 `memory.procedural.set()` / `get()` 显式 KV（不依赖 FTS5）
3. episodic 层继续走 SQLite + FTS5（周期 8-9 已落）
4. procedural 层用 SQLite 同表 + tag='procedural' 过滤（不引新依赖）
5. **spec**: `tests/specs/memory-3layer-coexistence.cjs` 验证三层不互相破坏

### 3.2 中期（周期 13+）

1. 引入 semantic 层（mem0 + pgvector；周期 10 P0-1 评估文档对接）
2. 双写 30 天（episodic 写 SQLite，semantic 异步写 pgvector）
3. recall 优先走 semantic，fallback episodic（FTS5）
4. **spec**: `tests/specs/memory-3layer-hybrid-recall.cjs` 验证 hybrid 命中率

### 3.3 长期（周期 15+）

1. procedural 层抽到独立 KV（user preferences + risk thresholds）
2. system prompts 注入 procedural（按 user 自动调整风险等级）
3. semantic 层接 Zep Graphiti 双时间戳（事件 + 状态）
4. **spec**: `tests/specs/memory-procedural-injection.cjs` 验证 prompt 注入

## 4. 三层价值

| 价值 | 周期 | 落地难度 |
| ---- | ---- | -------- |
| episodic 时间窗口检索（"昨天我们改了什么"） | 11+ | 低（已落 FTS5） |
| semantic 相似检索（"上次类似的形状"） | 13+ | 中（需 embedding） |
| procedural 自适应风险（"用户偏好保守策略"） | 15+ | 中（需 prompt 工程） |

## 5. 风险清单

| 风险 | 等级 | 缓解 |
| ---- | ---- | ---- |
| 双写不一致 | 高 | 周期性 reconcile（每日 03:00）+ spec 验证一致性 |
| semantic 抽取成本 | 中 | GPT-4o-mini 单次 $0.0001；1000 events/天 ≈ $0.10 |
| embedding 维度锁死 | 中 | vector(1536) → 384/768 需 ALTER；周期 11 决定 |
| procedural 注入漂移 | 中 | versioned prompt + 周期 snapshot |
| episodic 容量爆炸 | 低 | 周期 90 天 rotate（archival table） |
| LLM 抽取错误 | 中 | MemMachine 主张"保留原始 episode"避免；本项目周期 11 沿用此原则 |
| API 兼容性 | 低 | 旧 remember/recall API 保留；新增 .episodic/.semantic/.procedural 子命名空间 |
| debug 复杂度 | 低 | 每层独立 log + trace_id |

## 6. 三层与 CoALA 对齐

| CoALA 概念 | 本项目映射 |
| ---------- | ---------- |
| Working Memory（context window） | ALS `conversationContext`（周期 8 P1-3） |
| Episodic Memory | `MemoryStore` + FTS5（周期 7-9 现状） |
| Semantic Memory | mem0 + pgvector（周期 13+ 引入） |
| Procedural Memory | `services/ai-prompts.js` + system prompt（周期 15+ 升级） |
| External Memory | `/api/ai/system-prompts` 端点（已落） |

## 7. 决策矩阵

| 维度 | 当前一层 | 三层（短期） | 三层（中期） |
| ---- | -------- | ------------ | ------------ |
| 部署复杂度 | 0 | +1 | +2 |
| 检索召回率 | 中（FTS5） | 中（不变） | 高（向量） |
| 用户偏好 | ❌ | ❌ | ✅ |
| 时间窗口 | 弱 | 中（episodic 优化） | 高（hybrid） |
| 跨 session | 弱 | 中 | 高 |

## 8. 与周期 9 P0-2（memory WAL）协同

- WAL 让 episodic 层并发读 + 单写；未来 semantic 双写不破坏 episodic 一致性
- `journalMode = WAL` + `synchronous = NORMAL` 已是三层架构的合规起点
- FTS5 触发器（周期 8 P0-1）保持 episodic 与全文索引同步

## 9. 落地本周期

- ✅ 写本文档（`docs/evaluation/agent-memory-3layer.md`）
- ✅ 写 `tests/specs/agent-memory-3layer-eval.cjs`（10 子断言）—— 验证文档存在 + 三层定义清晰 + memory.js 升级路径 + 与 FTS5 WAL 兼容 + 风险清单 ≥8 项 + CoALA 对齐 ≥5 项

## 10. 参考资料

1. CoALA 框架（Berkeley 2024 paper "Cognitive Architectures for Language Agents"）
2. MemMachine arXiv 2026：<https://arxiv.org/pdf/2604.04853>（短时 + 长时情景 + profile 三层）
3. zylos 2026-04：<https://zylos.ai/research/2026-04-05-ai-agent-memory-architectures-persistent-knowledge/>（三 taxonomy 共识 episodic/semantic/procedural）
4. CSDN 2026-07：<https://blog.csdn.net/DK_Allen/article/details/162899163>（四类记忆全景）
5. LAION-AI agent-bud-e：<https://github.com/LAION-AI/agent-bud-e>（file-based 三部分记忆设计）
6. Mem0 官方：<https://mem0.ai/>（LoCoMo 92.5% 准确率）
7. MemMachine GitHub：<https://github.com/memmachine/memmachine>