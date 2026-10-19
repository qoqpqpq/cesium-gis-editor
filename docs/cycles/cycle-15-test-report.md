# Cycle 15 Test Report（Round 1）

> 周期 15 R1 测试报告（2026-10-15）
> 任务：修复 hybrid-retrieval-rrf.cjs 6 FAIL 回归（L14-1）

---

## 1. 主测试：hybrid-retrieval-rrf.cjs

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
