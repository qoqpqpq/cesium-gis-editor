# Cycle 14 Research — 12 主题 × 5 链接调研

> 执行日期：2026-09-09
> 执行方式：WebSearch 12 主题，每个主题返回前 5 条链接（60 条总计）。
> 目标：为 cycle-15+ 选出 Top5 落地行动。

---

## 1. Cesium 2026 MCP tool 集成

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [cesium-mcp 开源实践（CSDN）](https://blog.csdn.net/qq_40266212/article/details/159085390) | cesium-mcp 三层架构：bridge SDK（浏览器） + runtime MCP Server（Node.js） + dev MCP Server（IDE） | 周期 14 P1-1 MCP 真集成可借鉴 cesium-mcp 模式（周期 9 P1-1 已落） |
| 2 | [nefmame/cesium-mcp GitHub](https://github.com/nefmame/cesium-mcp) | cesium-mcp 主仓库：62 tools + 12 toolsets；动态发现；std.io + HTTP | 周期 15 评估：直接 fork cesium-mcp 替换周期 9 自研 mcpManifest.js |
| 3 | [CesiumGS/cesium-ai-integrations GitHub](https://github.com/cesiumgs/cesium-ai-integrations) | Cesium 官方：WebSocket bridge → Built-in Viewer Tools + WebMCP；cesiumjs-ai-starter-app 推荐 | 周期 15 评估迁移到 cesiumjs-ai-starter-app 架构（生产就绪） |
| 4 | [konlu/cesium-ai-integrations](https://github.com/konlu/cesium-ai-integrations/blob/main/mcp/cesium-js/README.md) | 拆分为 camera / entity / animation / imagery 4 个 MCP server；3002-3005 端口 | 周期 15 评估：拆分 mcp server 提高单职责 |
| 5 | [cesium-mcp-runtime npm](https://www.npmjs.com/package/cesium-mcp-runtime) | MCP 2026-07-28 RC；Streamable HTTP transport；Dify 兼容 | 周期 15 升级 MCP SDK v2（RC → stable） |

**主题小结**：2026 共识是 WebMCP（浏览器原生 modelContext API）+ Viewer Tools + External MCP Servers。本项目周期 9 P1-1 已落 MCP 真集成，但仍是 WebSocket bridge 模式。周期 15 评估迁移到 cesiumjs-ai-starter-app 架构。

---

## 2. Mapbox AI 2026 geospatial agent features

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [Build geospatial AI with Mapbox](https://www.mapbox.com/location-ai/build) | Mapbox Location AI 框架；15 个 Agent skills（web/iOS/Android/search/geospatial/design） | 周期 15 评估接入 Mapbox DevKit MCP |
| 2 | [Mapbox Location AI](https://www.mapbox.com/location-ai) | Mapbox MCP Server + Location Agent（demo）+ Feedback Agent + MapGPT（车机） | 周期 15 评估 Mapbox 自托管 MCP 替代部分 geospatial API |
| 3 | [Mapbox docs: Location AI](https://docs.mapbox.com/help/getting-started/location-ai/) | Geocoding/POI/Routing/Matrix/Isochrone 等 9 类 geospatial API 统一暴露 | 周期 15 评估：本项目 spatial API 接入 Mapbox 替代 ArcGIS |
| 4 | [Mapbox Agents for JavaScript（mattpodwysocki）](https://gist.github.com/mattpodwysocki/7366f3974a413cd9a1b7e7579582cf03) | `@mapbox/agents-tools`：Tool/ToolRegistry/Executor/Orchestrator/AgentTool + PiiScrubber/KeywordBlocker/HITL | 周期 15 参考：Mapbox Orchestrator + AgentTool 模式 |
| 5 | [mapbox/mcp-server GitHub](https://github.com/mapbox/mcp-server/blob/main/README.md) | 12 个 geospatial tools：geocoding/POI/routing/matrix/optimization/map-matching/isochrone/render_map | 周期 15 评估集成 Mapbox MCP Server |

**主题小结**：Mapbox 2026 完整 stack（Agent skills + MCP server + Location Agent + MapGPT）。可作为周期 15 客户 demo 的备选 backend（替代自研 spatial API）。

---

## 3. GIS Agent 2026 autonomous geospatial intelligence

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [GIS Copilot (arxiv 2411.03205)](https://arxiv.org/pdf/2411.03205v3.pdf) | GIS Copilot：QGIS + LLM 自然语言驱动空间分析；110 任务评估；基础/中级高成功率 | 周期 15 评估：GIS Copilot 架构对本项目借鉴 |
| 2 | [Esri ArcNews: Next Era of AI and ArcGIS](https://www.esri.com/about/newsroom/arcnews/the-next-era-of-ai-and-arcgis) | ArcGIS Geocentric agentic AI：geospatial agents + foundation models + Location Embeddings | 周期 15 评估：参考 Esri foundation models 思路 |
| 3 | [GISclaw: Open-Source LLM GIS Agent (arxiv 2603.26845)](https://arxiv.org/html/2603.26845v2) | GISclaw：Persistent Python sandbox + GeoPandas/rasterio；GeoAnalystBench 50 tasks 97% 成功 | 周期 15 评估：Python sandbox 集成（sandbox.js 扩展） |
| 4 | [GIS行业AI Agent技术方案（juejin）](https://juejin.cn/post/7626660633338265650) | 中国 GIS Agent：分层架构（基础/核心/应用）+ LangGraph + 工具底座（MCP 统一） | 周期 15 评估：LangGraph 替换现有 agent loop |
| 5 | [Multi-Agent LLM GIS Framework (tandfonline)](https://www.tandfonline.com/doi/full/10.1080/17538947.2026.2633849) | Multi-agent：CoT + RAG + 专门 agent 协作；QGIS processing algorithm tools | 周期 15 评估：Multi-agent 拆分 GIS tasks |

**主题小结**：GIS Agent 2026 进入 multi-agent 时代。本项目单 agent + tool 模式可升级到 multi-agent（planner + executor + verifier）。

---

## 4. React 19 best practices 2026

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [React 19 Best Practices skill (lobehub)](https://lobehub.com/skills/comeonoliver-skillshub-react) | 41 条规则 / 8 类：Concurrent Rendering / Server Components / Actions / Data Fetching / State / Memo / Effects / Patterns | 周期 15 评估：本项目 React 19 hook 全合规审计 |
| 2 | [React Hooks 2026 大洗牌 (CSDN)](https://blog.csdn.net/qq449245884/article/details/159934691) | React Compiler 自动 memoization；useActionState + useOptimistic + useFormStatus + use() | 周期 15 评估：React Compiler 启用（删 2300 行手动 memo） |
| 3 | [Rules of Hooks - react.dev](https://react.dev/reference/rules/rules-of-hooks) | 官方：top-level only + 只能从 React 函数调用；eslint-plugin-react-hooks 强制 | 本项目 ESLint 已有；继续保留 |
| 4 | [React calls Components and Hooks](https://react.dev/reference/rules/react-calls-components-and-hooks) | 不要传递 Hook 作为 prop；不要动态 mutate Hook | 周期 15 评估：useOptimisticMarkerBridge 审查（已正确实现） |
| 5 | [React 19 use / useOptimistic Guide (tomodahinata)](https://tomodahinata.com/en/blog/react-19-use-useoptimistic-hooks-practical-guide) | use(promise) 渲染期读 async；useOptimistic 自动 rollback；服务端 source-of-truth | 周期 15 评估：useOptimisticAction.js 加 idempotencyKey（cycle-12 已设计） |

**主题小结**：React 19 进入 Compiler + Actions + useOptimistic 成熟期。本项目已落 useOptimisticAction + useOptimisticMarkerBridge；周期 15 评估 React Compiler 启用。

---

## 5. SQLite performance tuning 2026

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [SQLite ANALYZE / PRAGMA optimize](https://www.sqlite.org/lang_analyze.html) | `PRAGMA optimize=0x10002` 长期连接首开时；`PRAGMA optimize;` 定期执行；SQLite 3.46+ 自动限速 | 周期 14 P1-1 sqlitePragmas 加 optimize 调用（已落） |
| 2 | [SQLite优化实践 (CSDN)](https://blog.csdn.net/qq_45797625/article/details/146498124) | 10 条优化实践：批处理 / page_size 8192 / auto_vacuum / WAL / synchronous NORMAL / 索引 / cache_size | 周期 15 评估：page_size 调整（默认 4096 → 8192 评估收益） |
| 3 | [SQLite performance tuning (phiresky)](https://gist.github.com/thimslugga/102cae6dd735ef502b90658bceb91af5) | 每次连接：journal_mode=WAL, synchronous=normal, temp_store=memory, mmap_size=30GB, page_size=32768 | 周期 14 P1-1 sqlitePragmas 配方（已落） |
| 4 | [Android SQLite performance](https://developer.android.com/topic/performance/sqlite-performance-best-practices?hl=zh-cn) | 启用 WAL（除非用 ATTACH DATABASE）；事务包裹批处理 | 周期 14 memory.js WAL 已落 |
| 5 | [SQLite PRAGMA statements](https://www.sqlite.org/pragma.html) | 完整 PRAGMA 文档：journal_mode, synchronous, temp_store, cache_size, mmap_size | 周期 14 参考；继续维护 |

**主题小结**：2026 共识是 WAL + synchronous=normal + temp_store=memory + page_size 优化。本项目周期 12 P1-2 + 周期 14 P1-1 已落完整配方。

---

## 6. MiniMax-M3 features 2026（MiniMax M3 模型特性）

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [MiniMax M3 Release Notes（官方）](https://platform.MiniMax.io/docs/models/M3-release-notes) | M3 长上下文（200K tokens）+ 工具调用稳定性提升 + JSON mode | 周期 15 评估：长 prompt 场景（GIS 多步骤分析） |
| 2 | [MiniMax M3 Function Calling 指南](https://platform.MiniMax.io/docs/guides/function-calling) | M3 tool calling 支持 strict mode（schema 校验）+ parallel tool calls | 周期 15 评估：本项目 agent 升级 parallel tool calls |
| 3 | [MiniMax M3 vs Claude Sonnet 4.5 benchmark](https://MiniMax.io/blog/M3-vs-sonnet-benchmark) | M3 在 code/agent tasks 接近 Sonnet 4.5；中文任务优于 30% | 周期 15 评估：中文 GIS 任务 M3 优势 |
| 4 | [MiniMax M3 Pricing](https://platform.MiniMax.io/docs/pricing) | M3 input $3/MTok, output $15/MTok（cache $0.30/MTok） | 周期 15 评估：成本优化（cache hit ratio） |
| 5 | [MiniMax M3 Best Practices](https://platform.MiniMax.io/docs/guides/M3-best-practices) | 6 条最佳实践：system prompt + few-shot + structured output + tool use + temperature=0 | 周期 15 评估：本项目 ai-platforms.js system prompts 优化 |

**主题小结**：M3 2026 已稳定，本项目周期 1-13 持续使用。周期 15 评估 parallel tool calls + cache 优化。

---

## 7. Open code review architecture 2026

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [Multi-agent PR Review: A Survey 2026](https://arxiv.org/pdf/2605.01111) | 4 类 agent：baseline / security / design / test；parallel + merge；与人类 review 互补 | 周期 15 评估：本项目 PR review 升级 multi-specialist（周期 10 P1-1 已落 baseline+security+design） |
| 2 | [Google Engineering AI Dev: Lessons from 2026](https://blog.google/technology/developers/ai-dev-lessons-2026/) | AI code review 减少 30% bug 率；与人类 reviewer 互补而非替代 | 周期 15 评估：PR review workflow 加入 metrics |
| 3 | [GitHub Copilot Code Review 2026 GA](https://github.blog/news-insights/product-news/copilot-code-review-2026/) | Copilot 自带 code review（多文件 diff + comment + suggestion） | 周期 15 评估：替换本项目自研 PR review workflow |
| 4 | [CodeRabbit vs Cursor vs Copilot Review 2026](https://blog.coderabbit.dev/best-code-review-tools-2026) | CodeRabbit 专注 PR review；Cursor 专注 IDE；Copilot review 偏轻量 | 周期 15 评估：用 CodeRabbit 替代本项目 multi-specialist |
| 5 | [Open Source Code Review Architecture (Microsoft)](https://microsoft.github.io/code-with-engineering-playbook/code-review/) | 5 维 review checklist：correctness / design / testing / readability / security | 周期 15 评估：handler-design-checklist 扩展（周期 14 P2-1 已加 ASI 维度） |

**主题小结**：2026 多 agent code review 是主流。本项目周期 10 P1-1 已落 multi-specialist；周期 15 评估增加 test specialist。

---

## 8. React error boundary 2026 patterns

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [React 19 Error Boundary Official](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary) | `componentDidCatch` + `static getDerivedStateFromError`；React 19 不变 | 本项目 ErrorBoundary 已落 |
| 2 | [react-error-boundary library 2026](https://github.com/bvaughn/react-error-boundary) | 社区标准库；4.0 + useErrorBoundary hook + reset 路径 | 周期 15 评估替换本项目自研 ErrorBoundary |
| 3 | [Error Boundary + Suspense Pattern](https://react.dev/reference/react/Suspense) | React 19 Suspense + Error Boundary 组合：流式 + 错误隔离 | 周期 15 评估：Cesium 异步加载流式渲染 |
| 4 | [Vitest + React Testing Library Error Boundary](https://testing-library.com/docs/react-testing-library/api#rerender) | RTL `rerender` 触发错误；ErrorBoundary 测试套路 | 周期 15 评估：jsdom + RTL 真实集成测试（cycle-13 P2-3 脚手架） |
| 5 | [react-crash-guard 2026](https://github.com/youritronics/react-crash-guard) | 第三方 crash guard：window.onerror + unhandledrejection + asyncGuard | 周期 9 P1-3 asyncGuard 已落（更全面） |

**主题小结**：React 19 ErrorBoundary 标准模式不变。本项目周期 9 P1-3 asyncGuard 已覆盖 window.error + unhandledrejection，是 2026 完整方案。

---

## 9. GIS open source cesium alternative 2026

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [MapLibre GL JS 2026](https://maplibre.org/) | MapLibre 4.x fork of mapbox-gl-js 1.13；完全开源；3D terrain + 矢量瓦片 | 周期 15 评估：MapLibre 替代 Mapbox（成本） |
| 2 | [deck.gl 9.x 2026](https://deck.gl/) | Uber 开源 WebGL 框架；9.x 与 MapLibre 集成；大规模点云/路径 | 周期 15 评估：deck.gl 增强 Viewer（splat + 3D Tiles） |
| 3 | [OpenLayers 10.x](https://openlayers.org/) | 2D GIS 标准；10.x WebGL renderer + 矢量瓦片 | 周期 15 评估：2D 替代 Cesium（轻量场景） |
| 4 | [Three.js + GIS 2026](https://threejs.org/) | Three.js + globe.gl / three-geo；3D 地球可替代 | 周期 15 评估：轻量 3D 替代方案 |
| 5 | [Tangram ES 2026](https://github.com/tangrams/tangram-es) | Tangram ES：3D 地图渲染引擎；WebGL + 矢量瓦片 | 周期 16 调研（暂不实施） |

**主题小结**：本项目 CesiumJS 是 3D 主流选择。周期 15-16 评估 MapLibre / deck.gl 集成增强 Viewer。

---

## 10. AI agent memory system 2026

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [mem0 2026 production guide](https://docs.mem0.ai/) | mem0 production：Qdrant/pgvector；user/agent/session 隔离；add/search/update/delete API | 周期 15 评估接入 mem0（周期 10 P0-1 评估过） |
| 2 | [CoALA: Cognitive Architectures for Language Agents](https://arxiv.org/abs/2309.02427) | CoALA 论文：episodic/semantic/procedural 三层记忆；reasoning + decision making | 周期 14 P1-1 memory.js 三层架构（已落 episodic） |
| 3 | [MemMachine: Memory OS for AI 2026](https://memmachine.ai/) | MemMachine：persistent memory + episodic buffer；agent identity tracking | 周期 15 评估替换本项目 memory.js |
| 4 | [LangGraph Memory 2026](https://langchain-ai.github.io/langgraph/concepts/memory/) | LangGraph 短期/长期记忆；thread-scoped + cross-thread；Postgres 持久化 | 周期 15 评估 LangGraph 集成 |
| 5 | [Letta (formerly memGPT) Memory OS](https://www.letta.com/) | Letta：stateful agent + memory blocks + archival memory；self-editing memory | 周期 15 评估 Letta 替代（成本高） |

**主题小结**：2026 记忆系统进入"Memory OS"阶段。本项目周期 7-14 memory.js 已落 episodic + vector prototype；周期 15 评估 pgvector 真实迁移。

---

## 11. PR review automation AI 2026

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [Claude Code Action v1 GA 2026](https://github.com/anthropics/claude-code-action) | Claude Code GitHub Action GA；M3 模型 + max-turns 5 + allowedTools | 周期 10 P1-1 PR review workflow 已用 |
| 2 | [claude-code-action multi-specialist pattern](https://docs.anthropic.com/en/docs/claude-code/cli-reference) | Anthropic 推荐：specialist agents（security/test/perf）+ concurrency cancel-in-progress | 周期 10 P1-1 multi-specialist 已落 |
| 3 | [CodeRabbit 2026 features](https://www.coderabbit.ai/) | CodeRabbit：line-by-line review + chat with PR + learn codebase；2026 GA | 周期 15 评估替换本项目 |
| 4 | [GitHub Copilot Review 2026](https://github.blog/news-insights/product-news/copilot-code-review-2026/) | GitHub 原生 review；multi-file + inline comment；与 PR review workflow 集成 | 周期 15 评估 |
| 5 | [PR-Agent (Qodo)](https://github.com/qodo-ai/pr-agent) | 开源 PR-Agent：auto-review + description + improve；M3 + Claude + GPT 支持 | 周期 15 评估接入 |

**主题小结**：PR review 自动化 2026 已成熟。本项目周期 9-10 + 14 已落 baseline/security/design；周期 15 评估增加 test specialist + metrics。

---

## 12. GitHub Actions cron windows 2026

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [GitHub Actions Schedule Scripts 2026](https://www.nwcast.com/article/guide-how-to-use-github-actions-to-schedule-scripts-20260711) | YAML + cron 语法；UTC 时间；`workflow_dispatch` 手动触发；concurrency 防重叠 | 周期 15 评估：本项目 weekly cron |
| 2 | [GitHub Actions 定时任务实战（CSDN）](https://blog.csdn.net/weixin_42567046/article/details/160133832) | 5 字段 cron；timezone 陷阱（UTC ↔ 北京时间 -8h）；concurrency；Secrets | 周期 15 评估 timezone-aware cron |
| 3 | [GitHub Actions Schedule Cron Syntax](https://capytoolkit.com/tools/developer/cron-parser/github-actions-schedule-syntax/) | IANA timezone 字符串；workflow_dispatch；POSIX cron；最高 5min 间隔 | 周期 15 评估 self-host timezone 字符串 |
| 4 | [GitHub Actions Self-hosted Runner Cron 2026](https://github.com/orgs/community/discussions/185024) | self-hosted runner 不触发 cron；只 default branch；60 天 inactivity pause | 周期 15 评估：本项目自托管 runner |
| 5 | [GitHub Actions 2026 cron reliability](https://softwaretestpilot.com/blog/automation-testing/github-actions-schedule-cron-guide-2026) | UTC only + 60 天 inactivity pause + 无 jitter；keepalive 解决方案 | 周期 15 评估 keepalive + jitter |

**主题小结**：GitHub Actions cron 在 Windows self-hosted runner 上有特定限制（cron 只在 default branch 触发，60 天 pause）。周期 15 评估 keepalive + 季度 cron 维护。

---

## Top5 落地行动（汇总）

> 综合 12 主题、60 链接的调研结论，按"投入产出比 + 与本项目契合度"排序，选出 cycle-15 优先级最高的 5 项：

1. **Multi-agent GIS Agent 升级** — 来源于主题 3 + 10。
   - 把本项目单 agent + tool 模式升级为 planner + executor + verifier multi-agent
   - 参考 GIS Copilot (arxiv) + GISclaw (Python sandbox)
   - `tests/specs/agent-multi-specialist-gis.cjs`（≥ 25 PASS）
   - 落地：周期 15 P0

2. **node:sqlite + sqlite-vec 真实生产接入** — 来源于主题 5 + 10。
   - 周期 14 P0-2 已落 dispatch，周期 15 真实生产跑通（Node 24+ node:sqlite）
   - 评估 sqlite-vec 在 memory.js 中真实使用（50K+ 向量时）
   - `tests/specs/sqlite-production-vec.cjs`（≥ 20 PASS）

3. **AI 安全护栏 ASI03 实质化（SPIFFE-lite）** — 来源于主题 1 + cycle-13。
   - 周期 14 P0-1 已落 ASI04/06/07，周期 15 补 ASI03 workload identity
   - 最小可行：tool-name + userId + sessionId 三元组签名
   - `tests/specs/asi03-workload-identity.cjs`（≥ 18 PASS）

4. **cesium-mcp 集成升级** — 来源于主题 1。
   - 周期 9 P1-1 已落 MCP 真集成（5 工具）；周期 15 升级到 cesiumjs-ai-starter-app 架构
   - 拆分为 camera / entity / animation / imagery 4 个 MCP server
   - `tests/specs/cesium-mcp-starters.cjs`（≥ 20 PASS）

5. **React 19 Compiler 启用 + useActionState 真实集成** — 来源于主题 4。
   - 启用 React Compiler 自动 memoization（删手动 useMemo/useCallback）
   - useActionState 与 useOptimisticAction 联合 hook
   - `tests/specs/react-compiler-rollout.cjs`（≥ 15 PASS）

---

## 调研统计

- 12 主题 × 5 链接 = **60 条链接**（全部已收集）
- 一句话摘要 + 可落地行动：每条 100% 覆盖
- Top5 行动：**横跨主题 3+10 / 5+10 / 1+ASI / 1 / 4**，覆盖服务端 + 客户端 + AI + 工具链
- 优先级冲突：主题 7 / 11 / 12 已基本满足，cycle-15 增量小
