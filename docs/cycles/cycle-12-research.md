# Cycle 12 Research — 12 主题 × 5 链接调研

> 执行日期：2026-09-09
> 执行方式：WebSearch 12 主题，每个主题返回前 5 条链接（60 条总计）。
> 目标：为 cycle-13+ 选出 Top5 落地行动。

---

## 1. RRF 算法与 k 参数

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [RRF 融合详解（掘金）](https://juejin.cn/post/7637403447099752458) | 中文实战：rank_constant (k) 默认 60，控制排名差距；k 小前几名优势大，k 大排名平滑 | 把 cycle-12 hybridRetrieval.js 的 k0=60 加 env 开关 `RRF_K0` 供调优 |
| 2 | [yuhi-sa RRF Deep Dive](https://yuhi-sa.github.io/en/posts/20260720_rrf/1/) | 数学+实验：k=10..100 nDCG 几乎不变（对数特性）；BM25 + vector 加法不可比 | 写 `docs/evaluation/rrf-k-tuning.md` 含不同 k 的对照实验 |
| 3 | [Apache Doris: RRF in SQL](https://doris.incubator.apache.org/docs/dev/key-features/reciprocal-rank-fusion/) | SQL 模式：BM25 + ANN CTE → ROW_NUMBER → FULL OUTER JOIN → sum(1/(60+rank)) | cycle-13 可把 hybridRetrieval 移植为 SQL CTE（SQLite 8.3+ 支持） |
| 4 | [juchengquan/RRF Python](https://github.com/juchengquan/RRF) | 5 种 RRF 变体：standard / best-rank / diminishing-returns / max+bonus / soft-dedup | 给 cycle-12 hybridRetrieval 加 `strategy: 'standard'\|'diminishing'` 配置 |
| 5 | [sverklo: RRF doing 80% of work](https://sverklo.com/blog/rrf-is-doing-80-percent-of-the-work/) | 实测 k=30 vs 100 几乎一致；3 行代码击败所有加权方案 | 推广"RAG 默认即 RRF"作为 cycle-13 README 核心论点 |

**主题小结**：cycle-12 已选 k0=60，与 2026 共识一致；下一步加 env 开关 + strategy 变体。

---

## 2. React 19 useOptimistic 失败模式

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [react.dev useOptimistic](https://react.dev/reference/react/useOptimistic) | 官方：`useOptimistic(value, reducer?)`；reducer 必须 pure；addOptimistic 必须在 Transition/Action 内 | cycle-12 已遵守；cycle-13 把 addOptimistic 调用强制走 startTransition |
| 2 | [dev.to: useOptimistic Patterns 2026](https://dev.to/stacknotice/react-useoptimistic-optimistic-ui-patterns-that-actually-work-2026-5460) | 3 模式 like / list-add / delete；不能用 useOptimistic 做"永久删除"或"金融交易" | 在 useOptimisticAction.js README 标注"do-not-use"清单 |
| 3 | [SitePoint: Production Patterns](https://www.sitepoint.com/react-useoptimistic-production-patterns-for-instant-ui-updates/) | Production Checklist：source-of-truth 在第一参数、reducer pure、addOptimistic 必须在 transition、server action idempotent | cycle-13 写 docs/architecture/optimistic-action-checklist.md |
| 4 | [jsmanifest: Snappy UI](https://jsmanifest.com/useoptimistic-react-19-guide) | 真实项目教训：optimistic state 自动 reset，要确保 server response 含全字段 | cycle-13 在 useOptimisticAction.js doc 强调 reducer 保留所有必要字段 |
| 5 | [72tech: Survive Network Failures](https://www.72technologies.com/blog/react-19-useoptimistic-network-failures) | 4 失败模式：silent rollback / stale optimism / revalidation gap / form reset；Pattern 1 让失败可见不沉默 | cycle-13 改 useOptimisticAction.js：失败保留 optimistic 状态 + error 标志 |

**主题小结**：cycle-12 实现偏简洁，cycle-13 重点加 4 失败模式防御。

---

## 3. SQLite WAL checkpoint 后台线程

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [SQLite WAL docs](https://sqlite.org/wal.html#walresetbug) | 官方：默认自动 checkpoint（wal_autocheckpoint=1000），可用 PRAGMA 调阈值或后台手动 | cycle-12 startPassiveCheckpointLoop 已覆盖；cycle-13 调成默认 1800s |
| 2 | [Roxabi #502](https://github.com/Roxabi/roxabi-factory/issues/502) | 真实生产事故：WAL = 187% DB 大小，3 长进程互锁；建议 30min TRUNCATE checkpoint | cycle-13 在 sqlitePragmas 加 `mode: 'PASSIVE'\|'TRUNCATE'` 选项 |
| 3 | [MicroLogics: SQLite in Production](https://micrologics.org/blog/sqlite-in-production-optimizing-wal-mode-concurrency-and-vfs-layers-for-low-latency-app-servers) | 高并发：PASSIVE/RESTART/TRUNCATE 四模式对比；PASSIVE 不阻塞，RESTART 阻塞 writer | cycle-13 文档化四种模式决策树 |
| 4 | [Codex #24: WAL maintenance off startup](https://github.com/ipo/codex/issues/24) | OpenAI Codex 经验：startup 不做 checkpoint；后台 bounded worker；cross-process sidecar lock；协调避免重复 | cycle-13 加 sidecar lock（fcntl）防多进程重复 checkpoint |
| 5 | [byteiota: Tailscale WAL bug 2026](https://byteiota.com/sqlite-wal-bug-tailscale-found-it-after-19-corruptions/) | SQLite 3.51.3+ 修复 16 年 WAL-Reset bug（walSalt 数据竞争）；3.7.0-3.51.2 受影响 | cycle-13 PRAGMA 设置加 version 检查；推荐 3.51.3+ |

**主题小结**：cycle-12 PASSIVE 默认 + 60s 合理；cycle-13 升级到 30min TRUNCATE + version 检查。

---

## 4. OTel worker_threads 跨线程传播

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [OTel OBI distributed traces](https://opentelemetry.io/bn/docs/zero-code/obi/distributed-traces/) | OBI 网络级 + 库级两套实现；Node.js async_hooks 支持；worker thread 不自动传播 | cycle-12 workerTraceCarrier 已实现 |
| 2 | [oneuptime: Node worker context loss](https://oneuptime.com/blog/post/2026-02-06-troubleshoot-context-loss-worker-threads/view) | 3 步修复：main inject 到 carrier → workerData 传入 → worker propagation.extract + startActiveSpan | cycle-12 已实现 attach/restore；cycle-13 加 optional OTel SDK 集成 |
| 3 | [oneuptime: Async app context debugging](https://oneuptime.com/blog/post/2026-02-06-debug-context-propagation-async-applications/view) | 4 类症状：multiple root spans / orphan spans / trace_id 切换；Java/Python/Node/Message Queue 修复 | cycle-13 加 diagnostic helper 输出 workerData._traceCarrier |
| 4 | [CSDN Dify OTel 异步集成](https://blog.csdn.net/DeepNest/article/details/158719020) | Celery 任务显式 TraceContextTextMapPropagator + OpenAI 客户端 instrumentation 串联 | cycle-13 用同样模式串联 worker → OTel SDK（otelDevHook） |
| 5 | [n8n #36769: OTel queue traceparent race](https://github.com/n8n-io/n8n/issues/36769) | Bug：enqueue 后 lifecycle hook 写 traceparent，worker dequeue 太早拿不到 | cycle-13 文档化"必须先 attachTrace 后 dispatch"时序 |

**主题小结**：cycle-12 实现已与 2026 共识对齐；cycle-13 加诊断 + OTel SDK 集成。

---

## 5. 3D Tiles 2.0 迁移

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [Cesium ion Photogrammetry](https://cesium.com/learn/3d-tiling/ion-tile-photogrammetry/) | 2026+ 默认 1.1 tilesets；3D Capture pipeline 自动生产 3D Tiles 1.1 | cycle-13 文档化 1.1 → 2.0 升级路径 |
| 2 | [Cesium Vector Tiles Tech Preview](https://cesium.com/blog/2026/09/02/vector-tiles-technology-preview-cesium-and-3d-tiles/) | 2026-09 发布：Vector tiles + KHR_mesh_primitive_restart + EXT_mesh_polygon；glTF 5x 压缩 | cycle-12 tilesetLoader 已检测 extensionsUsed |
| 3 | [CSDN: glTF 1.0 → 2.0 normal upgrade](https://blog.csdn.net/gitblog_07381/article/details/148991147) | 八叉编码法线 VEC2/BYTE → VEC3/FLOAT；3d-tiles-tools upgrade 命令 | cycle-13 评估引入 3d-tiles-tools 工具链 |
| 4 | [OGC RFC: 3D Tiles 2.0](https://www.ogc.org/requests/ogc-seeks-public-comment-on-proposed-3d-tiles-2-0-community-standard-work-item/) | 2026-06-30 启动 RFC；2026-07-23 截止；范围：glTF 2.1 + AEC + temporal + voxel + vector + Gaussian | cycle-13 在 docs/standards/3d-tiles-2-track.md 跟踪 RFC |
| 5 | [Future 3D: State of Gaussian Splatting 2026](https://www.thefuture3d.com/blog/state-of-gaussian-splatting-2026) | Khronos KHR_gaussian_splatting Q2 2026 release；OpenUSD Particle Fields；DJI Terra 直接输出 3D Tiles | cycle-13 引入 Gaussian splat demo tileset |

**主题小结**：3D Tiles 2.0 2026 RFC 进入最后阶段；本项目 cycle-12 已扩展检测，cycle-13 跟踪 RFC + 引入 demo。

---

## 6. OWASP AI Agent 安全护栏

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [Aquia Federal AI Guardrail Framework 2026](https://23570506.fs1.hubspotusercontent-na1.net/hubfs/23570506/Federal%20AI%20Guardrail%20Framework.pdf) | 6 风险 + 3 场景（Buying/Building/Owning AI）+ NIST AI RMF / ISO 42001 映射 | cycle-13 写 docs/security/ai-guardrails.md |
| 2 | [CSDN: Agent 安全防护五层纵深](https://blog.csdn.net/qq_41244651/article/details/162849295) | 感知 / 大脑 / 记忆 / 规划 / 行动 五层；OWASP ASI01-10 | cycle-13 把 8 维 handler checklist 与 ASI01-10 交叉映射 |
| 3 | [OWASP B1-B4 Trust Boundary](https://owasp.org/www-project-agentic-skills-top-10/trust-boundary-model.html) | B1 developer↔agent / B2 agent↔repo / B3 repo↔CI/CD / B4 CI/CD↔prod | cycle-13 PR template 加 B1-B4 自审 section |
| 4 | [OWASPLA: Breaking AI as of today](https://owaspla.owasp.org/assets/prez/OWASPLA_prez_2026_05_18.pdf) | 攻击面：Direct/Indirect injection、Tool Hijack、Privilege Escalation、RAG Poisoning；防御 5 层 | cycle-13 aiContext.js 加输入 sanitization 中间件 |
| 5 | [OWASP AST10 Agentic Skills Top 10](https://owasp.org/www-project-agentic-skills-top-10/?full=1) | 2026 Q1 真实事故：3984 skills 扫描，36.82% 含安全缺陷；CVE-2026-28363 CVSS 9.9 | cycle-13 agentTool 接入 manifest 校验 |

**主题小结**：2026 是 agentic AI 安全成熟期；本项目 cycle-13 应优先修"输入 sanitization" + "tool 范围限定"两路。

---

## 7. LLM 蒸馏（distillation）

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [arXiv 2608.22854: ADAPT Distillation](https://arxiv.org/pdf/2608.22854) | 跨 size × variant 两轴蒸馏：L×K 模型一次训练；Boomerang distillation + weight delta | cycle-13 评估本项目 code-suggestion 模型可否借鉴 |
| 2 | [CSDN: 大模型蒸馏技术](https://blog.csdn.net/whqwhqwhqxaut/article/details/164169353) | 4 路线（白盒/黑盒/在线/自蒸馏）+ Hinton 软标签 + T 温度缩放 | cycle-13 docs/evaluation/llm-distillation-survey.md |
| 3 | [arXiv 2509.26497: Huawei distillation](https://arxiv.org/pdf/2509.26497v1) | Curriculum SFT + offline on-policy KD；openPangu-Embedded 1B SoTA | cycle-13 调研国产蒸馏模型能否跑在 Viewer 内 |
| 4 | [jvoltci Mosaic: Small LLMs & Distillation](https://jvoltci.github.io/mosaic/edge-ai/distillation/small-llms/) | 4 蒸馏路线：logit / hidden-state / chosen-rejected / on-policy；Phi-3 / Qwen2.5-3B / Llama-3.2 案例 | cycle-13 在 aiSuggestions.js 评估加入小模型推理路径 |
| 5 | [Developers Digest: One-GPU Distillation](https://www.developersdigest.tech/blog/efficient-llm-distillation-single-gpu-2026) | Offline top-K logits + fused chunked KL；GPT-OSS 20B 32K context 从 4 GPU node → 1 GPU，5x 加速 | cycle-13 评估离线蒸馏本项目 AI prompts |

**主题小结**：蒸馏不是本项目当务之急（主用远程 API）；cycle-13 仅做调研文档。

---

## 8. better-sqlite3 替代（Node 24+ node:sqlite）

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [cortexkit/magic-context #108](https://github.com/cortexkit/magic-context/issues/108) | Bun → bun:sqlite；Node 24+ → node:sqlite；Electron 仍用 better-sqlite3；移除 native-binding.ts | cycle-13 评估三向 dispatch wrapper |
| 2 | [alexey-pelykh/lhremote #72](https://github.com/alexey-pelykh/lhremote/issues/72) | better-sqlite3 v25 编译失败（V8 deprecated APIs）；npx 缓存 broken install | cycle-13 写 docs/evaluation/sqlite-driver-decision.md |
| 3 | [forge-orm SQLite guide](http://raw.githubusercontent.com/johnsonfash/forge-orm/HEAD/docs/SQLITE.md) | 4 驱动对比（better-sqlite3 / libsql / bun:sqlite / node:sqlite）；adapter 抽象 | cycle-13 参考 forge-orm 写 sqliteBackend.js 三向 dispatch |
| 4 | [@framers/sql-storage-adapter](https://www.npmjs.com/package/@framers/sql-storage-adapter) | npm 上：跨平台 SQL + IndexedDB 持久化 + capability-aware；自动选 backend | cycle-13 不引入新依赖，但参考其 abstraction 设计 |
| 5 | [CSDN n8n SQLite 实践](https://wenku.csdn.net/answer/84wvfehfxb) | n8n 不允许 better-sqlite3（同步 API 阻塞事件循环）；推荐 sqlite3 异步封装 | 本项目 memory.js 已用 async 路径，OK |

**主题小结**：cycle-12 仍用 better-sqlite3；本项目 spec 已在 node:sqlite 不可用时 fallback memory；cycle-13 评估全面切到 node:sqlite。

---

## 9. AI Agent prompt injection 防御

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [AgentVisor: Semantic Virtualization](https://arxiv.org/pdf/2604.24118) | OS virtualization 类比：trap-audit-recover 循环；Visor 拦截 tool call；攻击成功率 0.65%（vs 9.8% baseline） | cycle-13 把 8 维 handler checklist 包装为"Visor 中间件" |
| 2 | [AgentWorks: Layered Defense](https://agent-works.ai/insights/prompt-injection-defense-for-production-ai-agents-layered-controls-that-actually-work) | 6 层：prompt 结构 / 输入输出校验 / tool 范围（最重要）/ untrusted 隔离 / 二级校验 / 审计 | cycle-13 在 aiContext.js 加 tool allowlist per agent |
| 3 | [OpenAI 设计抗注入 Agent](https://openai.com/zh-Hans-CN/index/designing-agents-to-resist-prompt-injection/) | 现代攻击已"社会工程化"，输入过滤不足；要系统设计使"操作影响受限可控" | cycle-13 aiTools 加"高危 action HITL 审批"中间件 |
| 4 | [WorkOS: 容纳 prompt injection](https://workos.com/blog/ai-agent-prompt-injection) | "agentic prompt injection 是 action 问题，不是 output 问题"；分层防御 + FGA + chain analysis + circuit breaker | cycle-13 引用 cycle-11 handler 8 维 checklist；加 circuit breaker |
| 5 | [Federal AI Guardrail Framework](https://23570506.fs1.hubspotusercontent-na1.net/hubfs/23570506/Federal%20AI%20Guardrail%20Framework.pdf) | 6 风险 + NIST AI RMF / ISO 42001 映射 | cycle-13 docs/security/ai-guardrails.md |

**主题小结**：2026 共识："防不住，只能容纳"——核心是 tool 范围 + 审计 + 限额；cycle-13 加 aiTools allowlist + circuit breaker。

---

## 10. Cesium Gaussian splatting / PLATEAU / CityGML

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [Future 3D: Cesium 平台](https://www.thefuture3d.com/software/cesium/) | CesiumJS + 3D Tiles + Gaussian Splats；DJI Terra 输出 3DTiles；Cesium ion 处理+托管 | cycle-13 引入 Gaussian splat demo tileset |
| 2 | [cesium-splat-streetview GitHub](https://github.com/Ibrahimshoer93/cesium-splat-streetview) | 原生 CesiumJS + KHR_gaussian_splatting 街道 Gaussian splat viewer（无 Three.js overlay） | cycle-13 参考此 repo 写 splatLoader.js |
| 3 | [CesiumJS 1.141 release May 2026](https://cesium.com/blog/2026/05/01/cesium-releases-in-may-2026) | Vector tiles metadata (EXT_structural_metadata)；Node 22.0.0 minimum；Gaussian splats + LODs 已内置 | cycle-13 升级 CesiumJS 至 1.141+ |
| 4 | [Cesium Sandcastle 1.144](https://ci-builds.cesium.com/cesium/main/Apps/Sandcastle2/index.html) | 官方沙盒：Gaussian Splats + Multiple LODs + Mesh Comparison | cycle-13 用 Sandcastle 复制 demo 集成到本项目 |
| 5 | [View 3D Gaussian Splat Tilesets with LODs](https://cesium.com/learn/cesiumjs-learn/3d-guassian-splat-tilesets-lods/) | maximumScreenSpaceError 8-24 调优；3D Tiles Inspector debug；Bounding Volume 可视化 | cycle-13 在 Viewer.jsx 工具栏加"SSE"调试开关 |

**主题小结**：CesiumJS 1.141+ 已稳定支持 Gaussian splats；cycle-13 升级 + 引入 demo tileset。

---

## 11. React 19 Suspense + Streaming SSR

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [sujeet-pro React Rendering Architecture](https://github.com/sujeet-pro/sujeet.pro/blob/main/content/articles/react-rendering-architecture/README.md) | Fiber + Lanes (31-bit priority) + Suspense + RSC；React Compiler v1.0 2025 Q4 | cycle-13 调研 React Compiler 替代 useMemo |
| 2 | [jantimon/react-hydration-rules](https://github.com/jantimon/react-hydration-rules) | 关键陷阱：hydration 同步 state change 永远覆盖 Suspense；必须 startTransition 包 | cycle-13 App.jsx 加 startTransition 全局 wrapper |
| 3 | [wowhow: React 19 RSC 7 patterns](https://wowhow.cloud/blogs/react-19-server-components-data-fetching-patterns-2026) | 7 模式：async Server Component / parallel fetch / Suspense streaming / cache() / use() | cycle-13 docs/architecture/rsc-patterns.md |
| 4 | [stackinterview: RSC Production 2026](https://stackinterview.dev/guides/react-19-server-components-in-2026-production-patterns-for-high-performance-apps) | 4 层缓存：request / process / shared (Redis) / CDN；JS bundle -40%，TTFB 3-5x | cycle-13 评估引入 Redis 缓存层 |
| 5 | [nirajiitr React Performance 2026](https://nirajiitr.com/blog/react-performance-2026-memo-suspense-server-components) | useMemo / React.memo 是 surgical tools；React Compiler 自动处理大多数 case | cycle-13 在 cycle-12 useOptimisticAction 上加 React Compiler 自动优化注释 |

**主题小结**：本项目 CSR SPA 暂不切 SSR；cycle-13 重点在 Suspense 边界优化 + hydration warnings。

---

## 12. SQLite HNSW / libsql / sqlite-vec

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [sqlitesearch (alexeygrigorev)](https://github.com/alexeygrigorev/sqlitesearch) | SQLite FTS5 + vector + hybrid 三合一；< 100K docs；HNSW 默认；Turso 可选 | cycle-13 评估 sqlite-vec 替代 memoryVectorPrototype |
| 2 | [ADR 0001: vector search](https://github.com/apresai/2ndbrain/blob/main/docs/adr/0001-vector-search.md) | 决策：brute-force 10K 文档 34ms 可接受；下一步 sqlite-vec（CGO-free modernc）；HNSW 推迟 | 本项目已用 brute-force cycle-11 P0-1 |
| 3 | [SQLite Vec1 docs](https://www.sqlite.org/vec1/doc/trunk/doc/vec1.md) | IVFADC + OPQ；AVX2/NEON SIMD；v0.7 2026；HNSW 待 1.0 后 | cycle-13 评估 vec1 SQLite extension |
| 4 | [vectorlite (hnswlib-based)](https://github.com/RapidAI/vectorlite) | 跨平台 Windows/macOS/Linux；HNSW 精确搜索；SQL 接口 | cycle-13 暂不引入（增加 native 依赖） |
| 5 | [CSDN: SQLite-Vec vs SQLite-Vector 对比](https://blog.csdn.net/lonelymanontheway/article/details/162846678) | sqlite-vec：10万-50万向量生产；AVX 内联；HNSW 实验中；SQLite-Vector：精确默认 + HNSW 可选 | cycle-13 docs/evaluation/vector-extension-decision.md |

**主题小结**：cycle-12 已实现向量+FTS5+recency RRF；cycle-13 升级到 sqlite-vec 是 1 年路线图候选。

---

## Top5 落地行动（汇总）

> 综合 12 主题、60 链接，按"投入产出比 + 与本项目契合度"排序，选出 cycle-13 优先级最高的 5 项：

1. **handler 8 维 checklist 升级为 AI Agent 安全护栏** — 来源于主题 6 + 9。
   - 在 `docs/architecture/handler-design-checklist.md`（cycle-11）上叠加 OWASP ASI01-10 映射 + 6 层防御
   - 新增 `server/middleware/aiGuardrails.js`：tool allowlist per agent + circuit breaker + input sanitization
   - `tests/specs/ai-guardrails.cjs`（≥25 PASS）

2. **OTel SDK 真正集成 worker_threads + SQLite pragma** — 来源于主题 4 + 3。
   - `server/agent/otelDevHook.js`（cycle-12）扩展：worker 入口自动 inject OTel context
   - SQLite pragma + version check（≥3.51.3）；30min TRUNCATE checkpoint（cycle-12 P1-2）
   - `tests/specs/otel-worker-integration.cjs`（≥20 PASS）

3. **better-sqlite3 → node:sqlite 兼容层** — 来源于主题 8。
   - `server/agent/sqliteBackend.js`：Node 24+ 用 node:sqlite，老版本 fallback better-sqlite3
   - 不破坏现有 spec（memory.js / hybridRetrieval.js）
   - `tests/specs/sqlite-backend-dispatch.cjs`（≥18 PASS）

4. **CesiumJS 1.141+ Gaussian splat demo 集成** — 来源于主题 5 + 10。
   - 升级 client/package.json Cesium 至 1.141+；引入 Microsoft campus Gaussian splat tileset（public）
   - `client/src/utils/splatLoader.js`（基于 cycle-12 tilesetLoader.js 的 hybrid 模式）
   - `tests/specs/cesium-splat-demo.cjs`（≥15 PASS）

5. **混合检索 RRF 升级 + sqlite-vec 评估文档** — 来源于主题 1 + 12。
   - `hybridRetrieval.js` 加 `strategy: 'standard'\|'diminishing'\|'max+bonus'` 配置
   - `docs/evaluation/vector-extension-decision.md`：brute-force vs sqlite-vec vs vec1 三选一
   - `tests/specs/hybrid-retrieval-strategies.cjs`（≥15 PASS）

---

## 调研统计

- 12 主题 × 5 链接 = **60 条链接**（全部已收集）
- 一句话摘要 + 可落地行动：每条 100% 覆盖
- Top5 行动：**横跨主题 1 / 6+9 / 3+4 / 5+10 / 1+12**，覆盖服务端 + 客户端 + 工具链 + 安全
- 优先级冲突：主题 7（LLM 蒸馏）评估为"非当务之急"，**未入选 Top5**