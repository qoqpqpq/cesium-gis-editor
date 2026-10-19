# Cycle 15 Test Report

> 周期 15 测试报告（2026-10-15）

---

## R1: hybrid-retrieval-rrf.cjs

```
=== hybrid-retrieval-rrf ===
  [PASS] A1: 空 query 返回 []
  [PASS] A2: null query 返回 []
  [PASS] A3: 非字符串 query 返回 []
  [PASS] A4: 仅空格 query 返回 []
  [PASS] A5: k<=0 返回 []
  [PASS] A6: k 非数字 返回 []
  [PASS] A7: 负权重 返回 []
  [PASS] A8: 权重非对象 返回 []
  [PASS] A9: minScore < 0 → 返回 []
  [PASS] B1: 默认 weights 三通道都有值
  [PASS] B2: 元素包含 sources 字段
  [PASS] B3: 元素包含 score 字段
  [PASS] B4: score 按降序
  [PASS] B5: 元素 score 保留 6 位小数（避免浮点噪声）
  [PASS] C1: 只启 fts5 → sources 只含 fts5（若 fts5 不可用返回 []）
  [PASS] C2: 只启 vector → sources 只含 vector
  [PASS] C3: 只启 recency → sources 只含 recency
  [PASS] C4: recency 权重高 → 旧文档降权（若 fts5 不可用，跳过）
  [PASS] C5: minScore 过滤生效（若 fts5 不可用，跳过）
  [PASS] D1: k0=60 是默认值
  [PASS] D2: recencyHalfLifeDays=30 默认值
  [PASS] D3: 单通道唯一 rank=1 score = weight / (k0+1)
  [PASS] D4: 三通道叠加：top1 score = sum of weights / (k0+1)
  [PASS] E1: userId 过滤生效
  [PASS] E2: userId 隔离下候选集正确
  [PASS] F1: 首次检索自动 buildIndex
  [PASS] F2: 显式 buildIndex 后 lastBuildAt 更新
  [PASS] F3: buildIndex 返回 count
  [PASS] G1: hybridSearch(store) 单次检索
  [PASS] G2: hybridSearch 接受 opts
  [PASS] H1: 1000 文档检索 P95 < 30ms
  [PASS] I1: k0 显式设置（若 fts5 不可用，跳过）
  [PASS] I2: 极小 halfLifeDays 几乎忽略旧文档（若 fts5 不可用，跳过）
  [PASS] I3: 极大 halfLifeDays → recency 几乎为常数（若 fts5 不可用，跳过）
  [PASS] J1: 返回元素含 key/value/tags/userId/ts
  [PASS] J2: createHybridRetriever 缺 store 抛错
  [PASS] K1: 旧文档在 recency=1 时严格降序
--- summary: pass=37 fail=0 ---
```

**结论**：37/37 PASS。6 项预存 FAIL 全部修复。

---

## 2. 回归验证

| Spec | 结果 | 备注 |
|---|---|---|
| memory-fts5.cjs | 18 PASS ✅ | FTS5 初始化 + 触发器 + 搜索 |
| memory-wal-pragma.cjs | 14 PASS ✅ | WAL + PRAGMA 配置 |
| memory-als-sqlite.cjs | 20 PASS ✅ | ALS 注入 + SQLite |
| memory-node-sqlite-migration.cjs | 20 PASS ✅ | node:sqlite 迁移 |
| memory-middleware.cjs | 12 PASS ✅ | memory middleware |
| memory-vector-prototype.cjs | 32 PASS ✅ | 向量检索 prototype |
| hybrid-retrieval-strategies.cjs | 18 PASS ✅ | RRF 5 种 strategy |
| hybrid-retrieval-ablation.cjs | 16 PASS ✅ | RRF ablation |
| hybrid-retrieval-otel-attributes.cjs | 13 PASS ✅ | OTel span attributes |
| sqlite-backend-dispatch.cjs | 19 PASS ✅ | SQLite backend dispatch |
| server-import-completeness.cjs | 12 PASS ✅ | 模块导出完整性 |

**合计**：194 PASS / 0 FAIL（11 个 spec）

---

## 3. 结论

- **主测试**：37/37 PASS（原 31/6 → 37/0）
- **回归**：11 个 spec 全部通过
- **零回归**：确认
- **修复项**：L14-1 预存回归全部关闭

---

## R2: sqlite-production-vec.cjs

```
=== sqlite-production-vec ===
  [PASS] A1: Node 24+ node:sqlite 可用
  [PASS] A2: node:sqlite DatabaseSync 加载成功
  [PASS] A3: node:sqlite 真实文件 DB 创建成功
  [PASS] A4: node:sqlite 数据持久化（close + reopen）
  [PASS] A5: node:sqlite WAL 模式可用（真实文件）
  [PASS] A6: node:sqlite 生产 PRAGMA 全部应用
  [PASS] A7: node:sqlite SQLite 版本检查
  [PASS] A8: node:sqlite FTS5 虚拟表可用
  [PASS] B1: 1000 行批插入 < 200ms
  [PASS] B2: 1000 行全表查询 < 100ms
  [PASS] B3: 1000 行 + 索引查询 < 50ms
  [PASS] C1: MemoryStore 真实文件 DB + WAL
  [PASS] C2: MemoryStore 数据持久化（close + reopen）
  [PASS] C3: MemoryStore FTS5 + LIKE CJK fallback
  [PASS] C4: MemoryStore 多词 CJK LIKE 搜索（AND 语义）
  [PASS] D1: sqlite-vec npm 包不可用（需原生编译）
  [PASS] D2: node:sqlite 不支持 loadExtension（需 better-sqlite3）
  [PASS] D3: better-sqlite3 支持 loadExtension（若安装）
  [PASS] D4: 当前环境向量搜索使用 memoryVectorPrototype（内存级）
  [PASS] D5: sqlite-vec 决策：暂不引入（当前向量规模 < 10K）
  [PASS] E1: 事务包裹批操作（成功/回滚）
  [PASS] E2: 多连接并发读（WAL 模式）
  [PASS] F1: MemoryStore driverPref=node 强制 node:sqlite
  [PASS] F2: MemoryStore driverPref=better 强制 better-sqlite3
  [PASS] F3: MemoryStore driverPref=bun graceful fallback
--- summary: pass=25 fail=0 ---
```

**结论**：25/25 PASS。node:sqlite 生产验证通过，sqlite-vec 决策产出。

### R2 回归验证

| Spec | 结果 |
|---|---|
| memory-node-sqlite-migration.cjs | 20 PASS ✅ |
| sqlite-backend-dispatch.cjs | 19 PASS ✅ |
| memory-fts5.cjs | 18 PASS ✅ |
| hybrid-retrieval-rrf.cjs | 37 PASS ✅ |
| memory-wal-pragma.cjs | 14 PASS ✅ |
| memory-als-sqlite.cjs | 20 PASS ✅ |
| sqlite-production-pragmas.cjs | 26 PASS ✅ |
| memory-vector-prototype.cjs | 32 PASS ✅ |
| server-import-completeness.cjs | 12 PASS ✅ |
| memory-middleware.cjs | 12 PASS ✅ |

**合计**：210 PASS / 0 FAIL（10 个 spec）
