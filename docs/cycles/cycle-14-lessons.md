# Cycle 14 Lessons（经验沉淀）

> 周期 14 的踩坑、反思、可复用经验。
> L14-1 ~ L14-6 共 6 条。

---

## L14-1：hybrid-retrieval-rrf.cjs 6 FAIL 预存问题

**问题**：周期 13 末尾 hybrid-retrieval-rrf.cjs 已有 6 项 FAIL（C1/C4/C5/D4/I2/I3），周期 14 未修复。

**根因分析**：
- C1 `Cannot read properties of undefined (reading 'sources')` —— ftsRows 为空时返回 `undefined`，但 spec 期望访问 sources
- C4/C5/D4 —— FTS5 在 node:sqlite 下可能不可用（spec 假设 better-sqlite3），导致 ftsRows 为空 → 三通道叠加公式 `0.3 + 0.6 + 0.1 = 1.0` 期望 `0.016393`，但实际 `0.011449`（仅 vector + recency 两通道贡献）
- I2/I3 —— halfLifeDays 边界（极小/极大）场景下 recency 排序异常

**解决**：周期 15 修复 —— 把 spec 期望改为 `ftsAvailable === true` 严格条件，或修复 hybridRetrieval.js FTS5 fallback 行为（确保 ftsRows 不为 undefined）。

**可复用**：
- 跨周期回归测试必须跑全部老 spec，不能仅跑"看似相关"的 spec
- node:sqlite 兼容性变化必须全量验证（含 FTS5 / pragma / 索引）

---

## L14-2：getSpanContext() vs getCurrentSpanContext() 拼写错误

**问题**：周期 14 P1-3 spec 测试 `hook.getCurrentSpanContext()` 返回 null（function not found），实际函数名是 `getSpanContext`（otelDevHook.js）。

**解决**：hybridRetrieval.js 内调用统一用 `getSpanContext`。

**可复用**：
- 调用任何第三方 hook 前必须先验证函数名（不要凭印象写）
- spec 测试函数名应与 docstring 一致（`// @returns spanContext`）
- 如果函数名不一致，应在 hook 文件加 alias（`getCurrentSpanContext: getSpanContext`）兼容旧名

---

## L14-3：node:sqlite 没有 .pragma() 方法

**问题**：node:sqlite `DatabaseSync` 不暴露 `.pragma()` 方法；周期 13 sqliteBackend.js 的 node driver 走 `new DatabaseSync()` 后直接返回 inner，pragma 调用失败 → journalMode = 'unknown'。

**根因**：
- better-sqlite3 提供 `db.pragma('name')` 实例方法
- node:sqlite 只有 `db.exec(sql)` 和 `db.prepare(sql)`
- 跨 backend 抽象必须 verify 各 driver API 差异

**解决**：sqliteBackend.js 的 node driver 加 wrapper，pragma 走 `exec('PRAGMA name = value')`；读取用 `prepare('PRAGMA name').get()` 取第一列值。

**可复用**：
- 任何 SQLite 跨 backend 抽象必须 verify 各 driver API 差异；不能假设 better-sqlite3 API 通用
- 多 runtime 检测函数写 spec 时必须容错"环境差异"（L13-7 教训延伸）
- spec 测试可加 `['better', 'memory', 'node'].includes(db.driver)` 多 driver 兼容

---

## L14-4：backend getter 与 this.backend = 'xxx' 赋值冲突

**问题**：周期 9 spec memory-als-sqlite.cjs 期望 `s.backend` 是 string；周期 9 实现用 `this.backend = 'sqlite'` 赋值；周期 14 把 backend 改为 getter 后，所有 `this.backend = 'sqlite'` 赋值变 getter 覆盖错误（`Cannot set property backend of #<MemoryStore> which has only a getter`）。

**解决**：改为内部 `_backendDriver` 字段 + getter `backend`（string 简化版）/ `backendDriver`（driver 名）；旧代码兼容（cycle 9 spec 期望 `backend ∈ {sqlite, memory}` 满足）。

**可复用**：
- getter 与 setter 冲突时，引入私有字段（`_xxx`）；getter 只读不写
- 跨周期 spec 必须测试字段名（不能因为内部实现变了而破坏 spec）
- getter / setter 双向兼容方案：保留 setter 委托到 `_xxx`

---

## L14-5：close() 后再操作 silent 而非 throw

**问题**：周期 14 之前 close 后 `this._memMap` 被 clear，下一次 remember 走到 `else { this._memMap.set(...) }` 抛 `Cannot read properties of undefined`。

**解决**：
- close() 设 `_closed = true`
- remember 检查 `_closed` 返回 `{ ok: false, error: 'store_closed' }`
- `_memMap` 缺失时重建（`new Map()`），保持 fallback

**可复用**：
- close 后调用一律 silent 返回 error，不抛错
- 测试期望 `!threw`（cycle 9 已有这条 spec）
- 任何资源生命周期管理（DB / file / network）都应遵循 silent-fail 原则

---

## L14-6：ASI 文档化 ≠ 实质化

**决策**：周期 14 P2-2 决策 ASI03/ASI10 暂不代码实现（SPIFFE 部署成本高 + 当前威胁等级低），仅文档化决策 + 触发条件。

**理由**：
- ASI03 SPIFFE-style workload identity：需要 K8s + SPIRE + JWT verifier 部署
- ASI10 Rogue Agents：当前 3 层防御（Manifest + Audit + Kill Switch）已满足基础
- 多租户 / 法规要求 / 实际 abuse 案例出现时升级

**可复用**：
- OWASP ASI 是 10 项标准；本项目优先实现高 ROI（ASI01/02/04/05/06/07/08/09），低 ROI（ASI03/10）决策文档化 + 触发条件留待评估
- "防御性深度"不是"实现全部"，而是"知道何时升级"
- 决策记录在 ai-guardrails.md 永久保留，下周期调研时引用

---

## L14 周期总结

- 6 条 lessons：L14-1（预存回归）/ L14-2（hook 拼写）/ L14-3（node:sqlite API 差异）/ L14-4（getter 冲突）/ L14-5（close silent）/ L14-6（ASI 文档化决策）
- 周期 14 8 个 spec 全过、141 新增子断言
- 4 个 commit 全 green，10 commits 累计（cycle 14 1+1+1+1=4 + cycle 13 6 = 10）
- ASI 实质化从 5/10 提升到 8/10（ASI03/10 文档化决策）
- node:sqlite 真实迁移完成（旧 better-sqlite3 兼容性 fallback 保留）
- OTel LLM semantic span 完整接入（OpenTelemetry GenAI conventions）
- 客户端 CesiumJS Splat pipeline 文档化（为下周期 CesiumJS 1.144+ 升级铺垫）
- 下周期反思：multi-agent GIS agent 升级 + ASI03 SPIFFE-lite + sqlite-vec 真实生产
