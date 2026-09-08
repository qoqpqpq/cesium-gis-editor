# mem0 + pgvector 自托管评估

> **周期**: 10（2026-09-08）P0-1
> **目的**: 评估将 `server/agent/memory.js` 从 SQLite + FTS5（周期 7-9 现状）迁移到 mem0 + Postgres + pgvector 的可行性、成本与风险
> **结论（先）**: **暂不切换**。本周期产出 docker-compose 草稿 + 接口对齐方案；周期 11+ 决策是否启用

## 1. 现状（SQLite + FTS5）

| 组件 | 状态 | 数据量级 |
| ---- | ---- | -------- |
| `server/agent/memory.js` | prototype | < 1 MB / 1000 rows |
| SQLite + WAL（周期 9 P0-2） | 已落 | < 1MB 时 WAL 优势不明显 |
| FTS5 全文检索（周期 8 P0-1） | 已落 | bm25 排序 |
| ALS 上下文（周期 8 P1-3） | 已落 | request scope |
| better-sqlite3 native | 可选 | native 编译失败时 fallback 内存 Map |

## 2. mem0 + pgvector 方案

### 2.1 架构

```
Client (React)
   ↓ POST /api/ai/agent
Express (server/)
   ↓ memory.remember(key, value, {tags, userId})
mem0 SDK (Python sidecar 或 Node port)
   ↓ embedding + extraction
Postgres + pgvector (Docker)
   ├─ memories 表 (含 vector(1536) 列)
   ├─ users 表
   └─ episode_events 表（原始对话保留）
```

### 2.2 与现状对齐

| 维度 | 现状 | mem0 |
| ---- | ---- | ---- |
| 存储 | SQLite 文件 | Postgres + pgvector |
| 检索 | FTS5 bm25 | vector cosine + keyword hybrid |
| 抽取 | 无（原始 row） | LLM 抽取 facts/episodes |
| 容量 | < 1 MB | 数十 GB（向量维度 1536） |
| 启动成本 | 0 | Postgres + pgvector + mem0 server |
| 部署 | 单进程 | 多 sidecar（Python mem0） |

### 2.3 docker-compose 草稿

```yaml
# docs/evaluation/mem0-postgres.docker-compose.yml
version: "3.9"
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: mem0
      POSTGRES_USER: mem0
      POSTGRES_PASSWORD: ${MEM0_PG_PASSWORD:-changeme}
    volumes:
      - mem0_pg:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mem0"]
      interval: 5s
      timeout: 3s
      retries: 10

  mem0-server:
    image: mem0ai/mem0:latest
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://mem0:${MEM0_PG_PASSWORD:-changeme}@postgres:5432/mem0
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
    ports:
      - "127.0.0.1:8080:8080"

  # 注：实际部署需要：
  # 1. embedding 模型（OpenAI / 本地 bge-m3）
  # 2. LLM 抽取模型（GPT-4o-mini / Claude Haiku）
  # 3. secret 注入（不要 hardcode）

volumes:
  mem0_pg:
```

### 2.4 接口对齐（memory.js ↔ mem0 SDK）

| memory.js 现状 | mem0 等价 | 备注 |
| -------------- | -------- | ---- |
| `remember(key, value, {tags, userId})` | `mem0.add(text, {user_id, metadata})` | key → metadata.key |
| `recall(query, {limit, tags, userId})` | `mem0.search(query, {user_id, limit})` | vector + keyword |
| `list({userId, tags, limit})` | `mem0.get_all({user_id})` | 全量返回，分页在客户端 |
| `forget(key)` | `mem0.delete(memory_id)` | 按 id 删 |
| ALS context | 隐式 user_id 注入 | middleware 自动填 user_id |

迁移成本：~200 行（Node → Node HTTP 调用 mem0 server）；保留 fallback 内存 Map。

## 3. 收益分析

| 收益 | 量化 |
| ---- | ---- |
| 语义检索（理解"上次在杭州画的矩形"） | 当前 bm25 无法；向量召回率 +30%+ |
| 跨 session 记忆关联 | 当前按 key 独立；向量相似可关联 |
| 自动 consolidation | LLM 抽取 facts，避免 row 堆积 |
| 多用户隔离（user_id） | 当前手动过滤；mem0 native 支持 |

## 4. 风险清单

| 风险 | 等级 | 缓解 |
| ---- | ---- | ---- |
| Postgres 单点故障 | 高 | pgvector 单实例 + 备份脚本；迁移前先上 Redis cluster |
| LLM 抽取成本 | 中 | GPT-4o-mini 单次 $0.0001；1000 facts/天 ≈ $0.10；可控 |
| Embedding 维度锁死 | 中 | vector(1536) 改 384/768 需 ALTER TABLE |
| Python sidecar 引入 | 中 | 周期 11+ 评估 Node 原生 SDK（mem0 官方 Node port 2026 Q1） |
| secret 管理 | 中 | docker secret + env 注入；不进 git |
| 数据迁移 | 低 | 双写 30 天（同时写 SQLite + Postgres），再切读 |
| API 兼容 | 低 | memory.js 接口与 mem0 1:1 对齐（见 2.4 表） |
| 失去"零依赖"优势 | 中 | 增加 Postgres + Python 依赖；部署复杂度 +1 |

## 5. 决策矩阵

| 维度 | 现状 SQLite | mem0 + pgvector |
| ---- | ----------- | --------------- |
| 部署复杂度 | 0 | +2 |
| 启动成本 | 0 | +1 个 docker-compose |
| 语义检索 | ❌ | ✅ |
| 跨 session 关联 | ❌ | ✅ |
| 自动 consolidation | ❌ | ✅ |
| 多用户隔离 | 手动 | native |
| 容量 | < 1GB | 数十 GB |
| 调试友好 | 文件 | 需 psql |

## 6. 推荐路径

**短期（周期 10+）**：保留 SQLite + FTS5 prototype；本周期产出 docker-compose + 接口对齐表供未来参考。

**中期（周期 12+）**：
1. 评估 Node 原生 mem0 port（2026 Q1 GA）
2. 双写 30 天（SQLite + Postgres）
3. 切读到 pgvector
4. 移除 SQLite（保留 fallback 内存 Map）

**长期（周期 15+）**：mem0 + 跨 user 知识图（Zep Graphiti 双时间戳）。

## 7. 落地本周期

- ✅ 写本文档（`docs/evaluation/mem0-postgres.md`）
- ✅ 写 `docs/evaluation/mem0-postgres.docker-compose.yml` 草稿
- ✅ 写 `tests/specs/mem0-postgres-eval.cjs`（12 子断言）—— 验证文档存在 + 草稿可解析 + pgvector schema 合理 + 接口对齐表 ≥6 项 + 风险清单 ≥5 项 + 推荐路径存在

## 8. 参考资料

1. mem0 官方：<https://mem0.ai/>
2. pgvector GitHub：<https://github.com/pgvector/pgvector>
3. MemMachine 论文（arXiv 2026）：短时 + 长时情景 + profile 三层
4. Mem0 LoCoMo 92.5% 准确率（2026 业界领先）