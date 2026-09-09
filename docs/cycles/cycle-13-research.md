# Cycle 13 Research — 12 主题 × 5 链接调研

> 执行日期：2026-09-09
> 执行方式：WebSearch 12 主题，每个主题返回前 5 条链接（60 条总计）。
> 目标：为 cycle-14+ 选出 Top5 落地行动。

---

## 1. OWASP AI Agent 安全护栏生产实践

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [Agent 工程化指南（掘金）](https://blog.csdn.net/qq_41244651/article/details/162849295) | 5 层纵深防御（感知 / 大脑 / 记忆 / 规划 / 行动）+ OWASP ASI01-10 详解 | cycle-13 P0-1 aiGuardrails.js 已实现 6 项；继续补 ASI04/06/07 |
| 2 | [Agentic AI Security Checklist（erdalozkaya）](https://erdalozkaya.com/agentic-ai-security-checklist/) | 15 项 CISO 控制 + 30/60/90 天行动计划 | cycle-14 写 docs/security/agentic-ciso-checklist.md |
| 3 | [Microsoft AGT OWASP ASI Reference Architecture](https://microsoft.github.io/agent-governance-toolkit/compliance/owasp-agentic-top10-architecture/) | Microsoft Agent Governance Toolkit（AGT）映射所有 10 项 ASI；详细 ship evidence | 参考 AGT 的"A11"（AGT extension 11）做 agent traceability |
| 4 | [OWASP Agentic Skills Top 10](https://owasp.org/www-project-agentic-skills-top-10/) | 2026 Q1：3984 skills 扫描，36.82% 含安全缺陷 | cycle-14 加 skills manifest 校验（AST04） |
| 5 | [OWASP Agentic AI Top 10 Fix in Production（BeyondScale）](https://beyondscale.tech/blog/owasp-agentic-ai-enterprise-implementation-guide) | 30/60/90 天企业实施指南；3 个最有效基础设施控制（circuit breaker / SPIFFE / ephemeral） | cycle-13 P0-1 circuit breaker 已实现；下周期加 SPIFFE identity（AST03） |

**主题小结**：2026 共识"防不住，只能容纳"——核心 3 控制：circuit breaker（cycle-13 已实现）+ tool allowlist（已实现）+ input sanitization（已实现）。

---

## 2. node:sqlite 替代 better-sqlite3 迁移

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [webjs #668: remove better-sqlite3](https://github.com/webjsdev/webjs/issues/668) | 2026-06 决定完整移除 better-sqlite3；Node 24+ 用 node:sqlite，Bun 用 bun:sqlite | cycle-13 P0-2 sqliteBackend.js 已实现 dispatch；下周期迁移 memory.js |
| 2 | [photostructure/node-sqlite library comparison](https://github.com/photostructure/node-sqlite/blob/main/doc/library-comparison.md) | 详细对比 node:sqlite / @photostructure/sqlite / better-sqlite3；按 Node 版本可用性表 | 写 docs/evaluation/sqlite-driver-decision.md（与本周期 decision 文档互补） |
| 3 | [daftari #72: NAPI binding](https://github.com/mavaali/daftari/issues/72) | Electron ABI 兼容性考虑；推荐 node:sqlite + Drizzle | 下周期 Electron 集成评估 |
| 4 | [jangwook: Node.js Built-in SQLite Guide](https://jangwook.net/en/blog/en/node-sqlite-builtin-practical-guide-2026/) | 完整 API + 真实测试；无 async/await；无 db.transaction() wrapper | cycle-14 sqlitePragmas 加事务 wrapper 适配 |
| 5 | [CSDN: Windows better-sqlite3 排雷](https://jishuzhan.net/article/2055127572614844418) | Windows 必装 VS Build Tools + 中文路径必避 | cycle-14 加 cross-platform CI 脚本 |

**主题小结**：cycle-13 P0-2 sqliteBackend.js 已落地抽象；cycle-14 真实迁移 memory.js 到 node:sqlite。

---

## 3. OTel 多线程上下文传播

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [OTel OBI distributed traces](https://opentelemetry.io/pt/docs/zero-code/obi/distributed-traces/) | eBPF-based 跨语言上下文传播；Node 8+ async_hooks 支持 | cycle-13 P1-1 withWorkerContext 已实现 ALS path |
| 2 | [oneuptime: OTel Multi-Threaded Apps](https://oneuptime.com/blog/post/2026-02-06-troubleshoot-opentelemetry-multi-threaded-applications/view) | Java/Python/Go 多线程断点诊断；contextvars.copy_context 模式 | cycle-14 加 Python 兼容模式（如果未来引入 Python 服务） |
| 3 | [oneuptime: Node.js Worker Threads](https://oneuptime.com/blog/post/2026-02-06-troubleshoot-context-loss-worker-threads/view) | 3 步：main inject → workerData 传 → worker propagation.extract；每 worker 需独立 SDK | cycle-13 P1-1 已实现手动传播；下周期评估 worker 内 install SDK |
| 4 | [CSDN: 生成式 AI 服务 OOM + Trace Span 模板](https://blog.csdn.net/LogicShoal/article/details/160217973) | LLM 应用链路追踪模板（Prompt / Embedding / Retrieval / LLM / Tool）；语义化 Span attributes | cycle-14 ai.js 加 OTel span attributes（platform/model/tokens） |
| 5 | [oneuptime: ThreadPoolExecutor Python](https://oneuptime.com/blog/post/2026-02-06-troubleshoot-threadpool-context-loss/view) | TracedThreadPoolExecutor 包装类；contextvars.copy_context() | 同 #2 兼容模式 |

**主题小结**：cycle-13 P1-1 已实现 Node.js worker 跨线程；cycle-14 加 LLM 语义化 span + 兼容 Python（如果引入）。

---

## 4. CesiumJS 1.144 Gaussian splat 集成

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [CesiumJS Releases GitHub](https://github.com/CesiumGS/cesium/releases) | 1.145 (2026-09-01) vector tile draping；1.144 (2026-08) CAD BENTLEY_materials_planar_fill + EXT_mesh_primitive_edge_visibility；1.140 SPZ splat | cycle-14 升级 client Cesium 至 1.144+；评估 vector drape |
| 2 | [CesiumJS Releases Page 2](https://github.com/CesiumGS/cesium/releases?page=2) | 1.135 KHR_spz_compression → KHR_gaussian_splatting_compression_spz_2；3D Tiles terrain 实验 | 跟 Cesium 路线图升级 |
| 3 | [CSDN: 3DGS GIS 可视化](https://blog.csdn.net/jin739738709/article/details/160635010) | libTileSplat C++ 工具：PLY → 3D Tiles；Cesium 1.125+ 支持 | cycle-14 评估 libTileSplat 引入 |
| 4 | [Cesium 3D Gaussian Splats LOD](https://cesium.com/blog/2026/04/27/3d-gaussian-splats-lod/) | CesiumGS + Khronos + OGC + Esri + Niantic 联合推出；KHR_gaussian_splatting extension | cycle-13 P2-1 splatLoader.js 已落地 API |
| 5 | [manudelu georeferenced_gsplat](https://github.com/manudelu/georeferenced_gsplat) | GPS EXIF → COLMAP → SuGaR → Cesium ion；完整 pipeline | cycle-14 写 docs/guides/splat-pipeline.md |

**主题小结**：CesiumJS 1.144+ 已稳定支持 splat；cycle-14 升级 + SPLAT pipeline 文档。

---

## 5. RRF variants 与 RAG Fusion 局限

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [AILS-NTUA SemEval-2026 RAG](https://aclanthology.org/2026.semeval-1.175.pdf) | nested RRF 聚合查询重写；多策略 rewrite 提升 recall 不损 precision；Task A nDCG@5 0.5776 +20.5% baseline | cycle-14 hybridRetrieval.js 加 nested RRF 选项 |
| 2 | [ZeroEntropy RRF](https://zeroentropy.dev/concepts/reciprocal-rank-fusion/) | 2026 production default；no tunable；k=60；RRF 给 up the right things | cycle-13 已落；下周期加权 weights 调优 |
| 3 | [Dell RAG Fusion Industry](https://arxiv.org/pdf/2603.02153) | 现实生产：fusion recall 增加但 rerank 后被抵消；Hit@10 0.51→0.48；增加 latency | cycle-14 加 ablation spec（无 fusion baseline） |
| 4 | [Google RRF Tuning Guide](https://discuss.google.dev/t/tuning-reciprocal-rank-fusion-in-agent-retrieval-a-practical-guide/378525) | Agent Retrieval 调优 k=60；Optuna sweep weights；Python SDK | cycle-14 写 Optuna-style 自动权重调优脚本 |
| 5 | [ReaderFI RRF Bruch et al.](https://readerfi.com/discover/54305) | convex combination 击败 RRF（9 数据集）；k=60 不是 free lunch | cycle-14 加 hybrid fusion（concave + RRF）实验 |

**主题小结**：cycle-13 P1-3 RRF 5 种变体；cycle-14 加 ablation + 自动权重调优。

---

## 6. sqlite-vec / sqlite-vector 性能

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [CSDN: sqlite-vec 10亿向量](https://blog.csdn.net/gitblog_00475/article/details/151320006) | chunk_size + mmap + 量化全调优；10亿向量毫秒级；int8 量化 | cycle-14 评估 sqlite-vec 引入 + 量化策略 |
| 2 | [sqliteai/sqlite-vector](https://github.com/sqliteai/sqlite-vector) | SQLite-Vector（非 sqlite-vec）：No virtual tables；TurboQuant 2/3/4-bit；30MB RAM；Float32/16/BFloat16/Int8/UInt8/1Bit | cycle-14 评估两个 SQLite-Vec 候选 |
| 3 | [HyperNexus: sqlite-vec vs Pinecone](https://dev.to/hypernexus/sqlite-vector-search-the-dependency-free-ai-memory-stack-that-outperforms-pinecone-5d27) | 10K-100K 向量：sqlite-vec p99 <12ms vs Chroma 200ms+；3 套生产迁移；节省 60% 成本 | cycle-14 sqlite-vec 真实接入 |
| 4 | [HyperNexus: Sub-10ms Pipeline](https://dev.to/hypernexus/sqlite-vector-search-building-a-dependency-free-ai-memory-pipeline-in-under-10-milliseconds-1nd9) | Gemini embedding + sqlite-vec + 语义切分；sub-10ms；WASM 支持 | cycle-14 切分策略参考 |
| 5 | [Gemilab: Gemini + sqlite-vec Solo](https://gemilab.net/en/articles/gemini-api/gemini-api-sqlite-vec-lightweight-rag-production-guide) | 100 万向量开始吃力（p95 400ms+）；个人/独立开发者指南；迁移 Pinecone 触发器 | cycle-14 决策文档已落（vector-extension-decision.md） |

**主题小结**：cycle-13 P2-2 已落 sqlite-vec 决策文档；cycle-14 真实接入 sqlite-vec。

---

## 7. Vitest + RTL 2026 最佳实践

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [Sharpskill React Testing 2026](https://sharpskill.dev/en/blog/react-next/react-testing-2026-vitest-rtl-best-practices) | Vitest + RTL 是 2026 默认；jsdom + setupFiles；user-event 替代 fireEvent | cycle-14 install jsdom + RTL 并启用真实集成测试 |
| 2 | [Vitest Component Testing](https://vitest.dev/guide/browser/component-testing) | Browser Mode 用真实浏览器；query 选 byRole 优先 byTestId | cycle-14 测试 query 全部用 byRole |
| 3 | [tekraze Vitest + RTL Setup](https://tekraze.com/vitest-react-testing-library/) | vitest.config + setupFiles + user-event + MSW 完整流程 | cycle-14 参考此 setup 改 cycle-13 脚手架 |
| 4 | [terrierscript 完全実践ガイド](https://terrierscript.com/react/40/) | 2026 RTL 完全指南：user-event v14 + renderHook + MSW；renderWithProviders | cycle-14 包装 renderWithProviders |
| 5 | [dualite Component Testing 2026](https://dualite.dev/blogs/component-tests-guide) | Vitest 52% 开发者采用；RTL 哲学未变；Vitest + Storybook 8 + Playwright 三层 | cycle-14 评估 Storybook 8 visual regression |

**主题小结**：cycle-13 P2-3 脚手架已落；cycle-14 install + 真实测试 useOptimisticAction / useOptimisticMarkerBridge。

---

## 8. AI Agent HITL 2026 模式

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [OpenAI Agents HITL](https://openrouter.ai/blog/tutorials/human-in-the-loop-tools/) | pause-and-resume 循环；onToolCalled 决策；返回 null 触发 HITL | cycle-13 P0-1 dangerousActionsRequireHITL 已实现 |
| 2 | [HITL Protocol](https://github.com/rotorstar/hitl-protocol) | 开放标准：用户停留在 Telegram/WhatsApp/Slack；HITL 决策 token | cycle-14 评估与 IM 集成 |
| 3 | [OpenRouter HITL Tools](https://openrouter.ai/blog/tutorials/human-in-the-loop-tools/) | Agent SDK 4 类工具：regular / manual / HITL / streaming | cycle-14 文档化本项目的 tool 类型 |
| 4 | [AWS AgentCore HITL](https://aws.amazon.com/blogs/publicsector/human-in-the-loop-claims-processing-with-amazon-bedrock-agentcore/) | Assist / Supervised / Autonomy 三层模式；Cedar policy；trust ≠ blast radius | cycle-14 写 docs/security/autonomy-ladder.md |
| 5 | [头条 AGI 智能体争议](https://m.toutiao.com/group/7683350978930524681/) | 行业：从"卖答案"到"卖结果"；支付令牌 only-specific 商户/金额 | cycle-14 docs/security/agent-blast-radius.md |

**主题小结**：cycle-13 P0-1 已实现 HITL approve path；cycle-14 autonomy ladder + IM 集成评估。

---

## 9. MCP 协议 2026 安全与治理

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [MCP 2026-07-28 RC SDK](https://blog.modelcontextprotocol.io/posts/sdk-betas-2026-07-28/) | MCP 协议 2026-07-28 RC：stateless（去 initialize）；Python v2 + TS v2（split packages） | cycle-14 评估 MCP server SDK 升级 |
| 2 | [ATSA: Attested Tool-Server Admission](https://arxiv.org/html/2605.24248v1) | offline-signed clearance assertion + per-server tool allowlist + flavor-gated enforcement | cycle-14 docs/security/mcp-atsa-evaluation.md |
| 3 | [Microsoft MCP Security & Governance](https://www.microsoft.com/insidetrack/blog/protecting-ai-conversations-at-microsoft-with-model-context-protocol-security-and-governance/) | 安全默认架构 + catalog + consent gating；"one misconfigured server = keys to your data" | cycle-14 加 MCP server catalog 校验 |
| 4 | [Maximize MCP 2026 Guide](https://www.getmaxim.ai/articles/what-is-model-context-protocol-mcp-a-complete-guide-for-2026/) | Bifrost MCP gateway：tool filtering + access control at inference + execution | cycle-14 评估 Bifrost-style gateway |
| 5 | [Obot MCP Compliance](https://obot.ai/resources/learning-center/mcp-compliance/) | Trusted MCP Registry（catalog + version pin + approved list）；policy enforcement；continuous re-validation | cycle-14 写 docs/security/mcp-registry-design.md |

**主题小结**：MCP 2026-07-28 RC 协议升级 + ATSA admission pattern 是 2026-2027 重要方向。

---

## 10. SQLite WAL checkpoint TRUNCATE vs PASSIVE

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [SQLite wal_checkpoint_v2 docs](https://www.sqlite.org/c3ref/wal_checkpoint_v2.html) | 4 模式：PASSIVE（不阻塞） / FULL（等 reader） / RESTART（reset WAL） / TRUNCATE（截断到 0 bytes） | cycle-13 P1-2 sqlitePragmas 加 mode 选项已落 |
| 2 | [Litestream WAL Truncate Threshold](https://litestream.io/guides/wal-truncate-threshold/) | 3-tier 策略：TruncatePageN（紧急）+ MinCheckpointPageN（被动）+ CheckpointInterval | cycle-14 写 WAL 阈值 ADR |
| 3 | [SQLite Forum Checkpoint Tuning](https://www.sqliteforum.com/p/checkpoint-algorithms-and-wal-performance) | 4 模式对比；PASSIVE 不完整；FULL 阻塞；TRUNCATE 高开销 | cycle-14 文档化本项目策略（PASSIVE 60s + 30min TRUNCATE） |
| 4 | [SQLite 中文 PRAGMA](https://sqlite.ac.cn/pragma.html) | 完整 PRAGMA 文档（含 wal_checkpoint 参数） | 参考文档 |
| 5 | [SQLite WAL 官方](https://www.sqlite.org/wal.html) | 自动 checkpoint 默认 wal_autocheckpoint=1000；PASSIVE 默认；WAL-Reset bug ≥ 3.51.3 | cycle-13 P1-1 checkSqliteVersion 已加 ≥ 3.51.3 检查 |

**主题小结**：cycle-13 P1-2 PASSIVE 60s + TRUNCATE 选项；cycle-14 加 30min TRUNCATE 后台 loop。

---

## 11. React 19 useActionState + useOptimistic 实战

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [React 19 KR 博客](https://ko.react.dev/blog/2024/12/05/react-19) | Actions 自动管理 pending / 乐观更新 / 错误 / form reset | cycle-13 P1-1 已实现 useOptimisticAction.js |
| 2 | [SitePoint useOptimistic Production](https://www.sitepoint.com/react-useoptimistic-production-patterns-for-instant-ui-updates/) | Production Checklist：source-of-truth、reducer pure、startTransition、idempotent | cycle-14 useOptimisticMarkerBridge 加 idempotencyKey |
| 3 | [CSDN React 19 Hooks 深度解析](https://blog.csdn.net/m0_46833693/article/details/158351132) | useActionState 状态机；use() Hook 的特性（条件调用/请求去重/Suspense 集成） | cycle-14 加 useActionState use 集成 |
| 4 | [react.docschina React 19](https://react.docschina.org/blog/2024/12/05/react-19) | 中文 React 19 详解；Actions 概念；form Actions 自动 reset | cycle-14 文档化中文 |
| 5 | [react.dev useActionState](https://react.dev/reference/react/useActionState) | 官方 API + `<form action>` 集成；与 useOptimistic 协作 | cycle-14 在 useOptimisticAction.js 加入 formAction 兼容 |

**主题小结**：cycle-13 已落 useOptimisticAction.js；cycle-14 加 form action 集成。

---

## 12. cesium ion Microsoft campus Gaussian splat

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [CesiumJS Gaussian Splats LOD Tutorial](https://cesium.com/learn/cesiumjs-learn/3d-guassian-splat-tilesets-lods/) | asset ID 4547222 Microsoft Redmond 110M splats；427.7 gigapixels；3.7 sq km；maxScreenSpaceError 8-16 高保真 / 24-64 性能 | cycle-13 P2-1 splatLoader.js 已落；下周期加真实加载 |
| 2 | [Cesium for Unreal 3D Gaussian Splat LODs](https://cesium.com/learn/unreal/3d-gaussian-splat-tilesets-lods/) | Cesium for Unreal + ion；同 Microsoft campus | cycle-14 评估 Unreal 集成 |
| 3 | [Cesium Releases May 2026](https://cesium.com/blog/2026/05/01/cesium-releases-in-may-2026) | CesiumJS 1.141（vector tiles metadata）+ 1.144 CAD + 1.145 vector drape | cycle-14 升级 CesiumJS 至 1.144+ |
| 4 | [Future 3D Cesium Software](https://www.thefuture3d.com/software/cesium/) | CesiumJS + 3D Tiles + Gaussian Splats；2024 Bentley 收购；DJI Terra 输出 | cycle-14 文档化 splat 数据来源 |
| 5 | [manudelu georeferenced_gsplat](https://github.com/manudelu/georeferenced_gsplat) | GPS EXIF → COLMAP → Gaussian Splatting → SuGaR mesh；完整 Docker pipeline | cycle-14 写 splat 制作指南 |

**主题小结**：Microsoft campus 公共 splat 资源已就绪；cycle-14 升级 CesiumJS + 写 splat pipeline 指南。

---

## Top5 落地行动（汇总）

> 综合 12 主题、60 链接的调研结论，按"投入产出比 + 与本项目契合度"排序，选出 cycle-14 优先级最高的 5 项：

1. **AI 安全护栏深化（OWASP ASI04/06/07 覆盖）** — 来源于主题 1。
   - 在 aiGuardrails.js 加 `validateManifest(tool)`（ASI04）+ `validateMemoryContext(payload)`（ASI06）
   - 加 `signInterAgentMessage(msg)`（ASI07）
   - `tests/specs/ai-guardrails-deep.cjs`（≥ 25 PASS）

2. **node:sqlite 真实迁移 memory.js** — 来源于主题 2。
   - 把 memory.js 从 better-sqlite3 native 切到 sqliteBackend.js（dispatch）
   - 真实跑通 Node 24+ node:sqlite
   - `tests/specs/memory-node-sqlite-migration.cjs`（≥ 20 PASS）

3. **OTel worker SDK 真正集成 + LLM 语义化 span** — 来源于主题 3。
   - 在 worker 内部 `install()` OTel SDK
   - ai.js 加 LLM semantic span attributes（platform/model/tokens）
   - `tests/specs/otel-worker-sdk-integration.cjs`（≥ 18 PASS）

4. **CesiumJS 1.144+ 升级 + Splat pipeline 文档** — 来源于主题 4 + 12。
   - 升级 client/package.json cesium 1.113 → 1.144+
   - 引入 Microsoft Redmond campus Gaussian splat demo
   - `docs/guides/splat-pipeline.md` + `tests/specs/cesium-144-integration.cjs`（≥ 15 PASS）

5. **RRF ablation + 自动权重调优（Optuna 风格）** — 来源于主题 5。
   - 写 ablation spec 对比 standard / best-rank / diminishing / linear fusion
   - 自动 sweep weights（heuristic search，无需 Optuna 依赖）
   - `tests/specs/hybrid-retrieval-ablation.cjs`（≥ 20 PASS）

---

## 调研统计

- 12 主题 × 5 链接 = **60 条链接**（全部已收集）
- 一句话摘要 + 可落地行动：每条 100% 覆盖
- Top5 行动：**横跨主题 1 / 2 / 3+5 / 4+12 / 5**，覆盖服务端 + 客户端 + 工具链
- 优先级冲突：主题 7（Vitest + RTL）脚手架已落，cycle-14 仅 install 真实依赖，不入选 Top5