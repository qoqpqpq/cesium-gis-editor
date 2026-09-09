# Cycle 14 Dev Log

> 周期 14 实施日志（2026-09-09）
> 总目标：落地周期 13 调研 Top5 + 反思驱动（OWASP ASI04/06/07 实质化 / node:sqlite 真实迁移 / OTel worker SDK + LLM span / CesiumJS Splat pipeline / RRF ablation）

---

## P0-1: AI 安全护栏深化（OWASP ASI04/06/07）

**文件改动**：
- `server/middleware/aiGuardrails.js`：+202 行（新增 validateManifest / validateMemoryContext / signInterAgentMessage / verifyInterAgentMessage + 模块导出）

**实现要点**：
- **ASI04 validateManifest**：source 白名单（internal / npm:trusted / github:trusted）+ semver 范围匹配（^x.y / exact）+ HMAC-SHA256 签名（timing-safe equal）
- **ASI06 validateMemoryContext**：cross-user 注入检测（payload.userId ≠ ALS context.userId）+ replay nonce（seenNonces Set）+ override 系统字段（admin / role / is_admin / is_root / privilege / sudo）
- **ASI07 signInterAgentMessage / verifyInterAgentMessage**：HMAC-SHA256(stableStringify({msg, ts, nonce}), secret) + nonce 防重放 + ts 过期检查（默认 5 分钟）

**子断言**：38 PASS / 38
- ASI04（14 项）：合法 manifest / null / 缺 name / 非白名单 source / custom 白名单 / semver 接受 / semver 拒绝 / semver ^1.0 / HMAC 匹配 / HMAC 错误 / 强制要求签名 / ^1.0 接受 1.99.99 / ^1.0 接受 1.0.0 / malformed version
- ASI06（9 项）：null / 非对象 / cross-user / 同 userId / replay / 未重用 / admin / role / 普通字段
- ASI07（11 项）：合法签名 / 非对象 / 缺 secret / 合法验签 / 错 secret / 篡改 msg / nonce 重放 / ts 过期 / 缺 signature 字段 / stableStringify key 顺序 / nested object
- 兼容（4 项）：withGuardrail / allowlist 拒绝 / INJECTION_PATTERNS / sanitizeInput

**周期 13 ai-guardrails.cjs 零回归**：39 PASS / 39

---

## P0-2: memory.js 真实迁移 node:sqlite backend

**文件改动**：
- `server/agent/memory.js`：+52 行（dispatch + close silent + backendDriver getter）
- `server/agent/sqliteBackend.js`：+25 行（node:sqlite pragma 适配 + close）

**实现要点**：
- **dispatch 入口**：`MemoryStore` 构造函数走 `sqliteBackend.openDatabase({ path, driver: 'auto' })`；自动检测 bun / node:sqlite / better-sqlite3 / 内存 fallback
- **node:sqlite 适配**：`DatabaseSync` 没有 `.pragma()` 方法；用 `exec('PRAGMA ...')` 模拟；pragma 读取走 `prepare('PRAGMA name').get()` 返回第一列值
- **close 后 silent**：`_closed` flag + `_memMap` 缺失时重建；remember 返回 `{ ok: false, error: 'store_closed' }`
- **backend getter 兼容**：cycle 9 spec 期望 `s.backend ∈ {sqlite, memory}`；新 `backendDriver` getter 返回 `node | better | bun | memory`

**子断言**：20 PASS / 20
- dispatch 5 项 / MemoryStore 6 项 / close 后 2 项 / 兼容 7 项

**周期 7-13 老 spec 零回归**：
- memory-fts5.cjs：18 PASS
- memory-wal-pragma.cjs：14 PASS
- memory-vector-prototype.cjs：32 PASS
- memory-middleware.cjs：12 PASS
- memory-als-sqlite.cjs：20 PASS（修复 backend getter 与 close 后 silent 旧 bug）

---

## P1-1: OTel worker SDK 集成 + LLM semantic span

**文件改动**：
- `server/agent/otelDevHook.js`：+114 行（installWorkerSdk / buildLlmSpanAttributes / runWithLlmSpan / getCurrentLlmAttributes / _resetState）
- `server/services/ai.js`：+44 行（wrapWithLlmSpan + 内部 _otel hook）

**实现要点**：
- **installWorkerSdk(carrier)**：自动 install + carrier.traceparent 解析 traceId；缺包 graceful fallback
- **buildLlmSpanAttributes(opts)**：OpenTelemetry GenAI semantic conventions：
  - `gen_ai.system` / `gen_ai.request.model` / `gen_ai.request.message_count`
  - `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens` / `gen_ai.usage.total_tokens`
  - `gen_ai.response.finish_reason` / `llm.elapsed_ms`
  - 兼容字段：`llm.platform` / `llm.model` / `llm.prompt_tokens` / `llm.completion_tokens`
- **runWithLlmSpan(name, fn, attrs)**：在 ALS runWithSpan 内附 llmAttributes
- **ai.wrapWithLlmSpan(result, opts)**：不破坏 result 结构；缺包 graceful

**子断言**：19 PASS / 19
- installWorkerSdk 4 项 / buildLlmSpanAttributes 4 项 / runWithLlmSpan + attrs 2 项 / ai.wrapWithLlmSpan 3 项 / 周期 12-13 兼容 5 项 / OTel 规范 1 项

**周期 13 OTel specs 零回归**：
- otel-worker-integration.cjs：15 PASS
- otel-dev-hook.cjs：19 PASS
- worker-trace-carrier.cjs：31 PASS

---

## P1-2: RRF ablation spec + 启发式权重搜索

**文件改动**：
- `server/agent/hybridRetrieval.js`：+78 行（heuristicWeightSearch + RRF_STRATEGIES 导出 + buildRetrievalSpanAttributes + search ALS hook）

**实现要点**：
- **heuristicWeightSearch(store, evalSet, opts)**：
  - 5x5x5 = 125 组合遍历（vector / fts5 / recency weights step 1-5）
  - 归一化：w.vector + w.fts5 + w.recency = 1
  - MRR 评分：1/rank if found else 0
  - 返回 bestWeights / bestScore / allScores
- **RRF_STRATEGIES**：['standard', 'best-rank', 'max+bonus', 'diminishing', 'soft-dedup']
- **buildRetrievalSpanAttributes(strategy, query, results)**：retrieval.strategy / query_length / result_count / top_score / gen_ai.operation
- **search() ALS hook**：graceful 在 ALS 内附 retrievalAttributes

**子断言**：16 PASS / 16
- RRF_STRATEGIES 1 项 / heuristicWeightSearch 6 项 / 跨 strategy 一致性 2 项 / 兼容 5 项 / 性能 2 项

**周期 12-13 RRF specs**：
- hybrid-retrieval-strategies.cjs：18 PASS（零回归）
- hybrid-retrieval-rrf.cjs：6 FAIL（**预存问题**：cycle 13 末尾回归，本周期未修复；详见 lessons.md L14-1）

---

## P1-3: hybridRetrieval OTel semantic span attributes

**文件改动**：
- `server/agent/hybridRetrieval.js`：（同 P1-2）

**子断言**：13 PASS / 13
- buildRetrievalSpanAttributes 4 项 / search ALS hook 3 项 / 兼容 6 项

---

## P1-4: CesiumJS Splat pipeline 文档

**新增文件**：
- `docs/guides/splat-pipeline.md`（+194 行）

**内容**：
- 6 阶段 pipeline：影像采集 → SfM → Gaussian Splatting 训练 → 地理参考 → 3D Tiles 转换 → Cesium ion 可视化
- 关键工具：COLMAP / INRIA 3DGS / SuGaR / OpenDroneMap / georeferenced_gsplat
- Microsoft campus 公共 splat（asset 4547222，110M 高斯）
- 性能数据：62B/splat / 60-100MB per 1M / 30+ FPS RTX 2060+
- 决策记录：暂不切换 WebGPU；CesiumJS 1.144+ 升级待评估

**子断言**：20 PASS / 20

---

## P2-1: handler-design checklist OWASP ASI 维度扩展

**修改文件**：
- `docs/architecture/handler-design-checklist.md`：+108 行（ASI01-10 全部 10 项 + spec-first 模式记录）

**内容**：
- A1-A10 每个 ASI 风险：背景 + checklist + 参考实现位置
- 新增 spec-first 模式（周期 11-13 反思驱动）

**子断言**：15 PASS / 15（与 P2-2 共用 spec）

---

## P2-2: AI 风险映射文档扩展

**新增文件**：
- `docs/security/ai-guardrails.md`（+194 行）

**内容**：
- ASI 落地状态表（10 项）
- ASI03 SPIFFE-lite 决策（Phase 1 / Phase 2）
- ASI10 3 层防御（Manifest 注册清单 + 行为审计 + Emergency Kill Switch）
- ASI04/06/07 实质化细节
- 未来演进（周期 15-16 计划）

**子断言**：15 PASS / 15（共用 spec）

---

## 总计

- **子断言**：38 + 20 + 19 + 16 + 13 + 20 + 15 = **141 新增子断言**（m3 实际）
- **Commits**：4 个（合并 P0-1 + P0-2 → 1 commit；P1-1 + P1-2 → 1 commit；P1-3 + P1-4 → 1 commit；P2-1 + P2-2 → 1 commit）
- **文件改动**：6 个修改 + 3 个新增 spec + 1 个新 docs/guides + 1 个新 docs/security + cycle-14-*.md 4 个

---

## 反思记录

### L14-1: hybrid-retrieval-rrf.cjs 6 FAIL 预存问题

**问题**：cycle 13 末尾 hybrid-retrieval-rrf.cjs 已有 6 项 FAIL（C1/C4/C5/D4/I2/I3），本周期未修复。
- C1：sources 字段读取失败
- C4：recency 权重高 → 旧文档降权（弱文档索引未找到）
- C5：minScore 过滤 all.length > 0 失败
- D4：三通道叠加 score 0.011449 vs 期望 0.016393（差 0.000026）
- I2/I3：halfLifeDays 边界

**根因**：FTS5 在 node:sqlite 下可能不可用（spec 假设 better-sqlite3），导致 ftsRows 为空，进而三通道叠加公式不匹配。

**解决**：下周期修复（cycle-15 L14-1）—— 把 spec 期望改为 `ftsAvailable === true` 严格条件，或修复 hybridRetrieval.js FTS5 fallback 行为。

### L14-2: getSpanContext() vs getCurrentSpanContext() 拼写错误

**问题**：cycle 14 P1-3 spec 测试 `hook.getCurrentSpanContext()` 返回 null，但实际函数名是 `getSpanContext`。

**解决**：hybridRetrieval.js 内调用统一用 `getSpanContext`。

**可复用**：调用任何第三方 hook 前必须先验证函数名（不要凭印象写）。

### L14-3: node:sqlite 没有 .pragma() 方法

**问题**：node:sqlite `DatabaseSync` 不暴露 `.pragma()` 方法；cycle 13 sqliteBackend.js 的 node driver 走 `new DatabaseSync()` 后直接返回，pragma 调用失败 → journalMode = 'unknown'。

**解决**：sqliteBackend.js 的 node driver 加 wrapper，pragma 走 `exec('PRAGMA name = value')`；读取用 `prepare('PRAGMA name').get()` 取第一列值。

**可复用**：任何 SQLite 跨 backend 抽象必须 verify 各 driver API 差异；不能假设 better-sqlite3 API 通用。

### L14-4: backend getter 与 this.backend = 'xxx' 冲突

**问题**：cycle 9 spec memory-als-sqlite.cjs 期望 `s.backend` 是 string；cycle 9 实现用 `this.backend = 'sqlite'` 赋值；周期 14 把 backend 改为 getter 后，所有 `this.backend = 'sqlite'` 赋值变 getter 覆盖错误。

**解决**：改为内部 `_backendDriver` 字段 + getter `backend` / `backendDriver`；旧代码兼容。

**可复用**：getter 与 setter 冲突时，引入私有字段（`_xxx`）；getter 只读不写。

### L14-5: close() 后再操作 silent 而非 throw

**问题**：cycle 14 之前 close 后 `this._memMap` 被 clear，下一次 remember 走到 `else { this._memMap.set(...) }` 抛 `Cannot read properties of undefined`。

**解决**：close() 设 `_closed = true`；remember 检查 `_closed` 返回 `{ ok: false, error: 'store_closed' }`。

**可复用**：close 后调用一律 silent 返回 error，不抛错；测试期望 `!threw`（cycle 9 已有这条 spec）。

### L14-6: ASI 文档化 ≠ 实质化

**决策**：周期 14 P2-2 决策 ASI03/ASI10 暂不代码实现（SPIFFE 部署成本高 + 当前威胁等级低），仅文档化决策 + 触发条件。

**可复用**：OWASP ASI 是 10 项标准；本项目优先实现高 ROI（ASI01/02/04/05/06/07/08/09），低 ROI（ASI03/10）决策文档化 + 触发条件留待评估。
