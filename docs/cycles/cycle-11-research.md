# Cycle 11 Research — 12 主题 × 5 链接调研

> 执行日期：2026-09-09
> 执行方式：WebSearch 12 主题，每个主题返回前 5 条链接（60 条总计）。
> 目标：为 cycle-12+ 选出 Top5 落地行动。

---

## 1. CesiumJS 2026 MCP / WebMCP 集成

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [Cesium MCP (gaopengbin/cesium-mcp)](https://github.com/gaopengbin/cesium-mcp) | 一个开源 MCP Server，将 60 个 CesiumJS 工具（相机/实体/图层/3D Tiles）暴露给 Claude/Cursor/Copilot；通过 WebSocket bridge 直连浏览器 Viewer。 | 在本项目 `server/` 旁增设 `server/mcp/` 子模块，参照 cesium-mcp-bridge 的 60 工具契约定义本项目的 MCP 工具集。 |
| 2 | [CesiumGS 官方 AI Integrations 仓库](https://github.com/cesiumgs/cesium-ai-integrations) | CesiumGS 官方放弃 WebSocket bridge 模式（不能多用户/生产），改为 AI SDK tools + 浏览器原生 WebMCP Imperative API（`document.modelContext`）。 | 评估把 client Viewer 工具通过 `document.modelContext` 直接暴露，而非依赖外部进程，简化部署。 |
| 3 | [CSDN: 让 AI 用自然语言操控三维地球](https://blog.csdn.net/qq_40266212/article/details/159085390) | 中文实操指南：bridge SDK 嵌入 → 启动 MCP runtime → Claude Desktop 配置 `mcpServers`，3 步即可自然语言操控 Viewer。 | 写一份本项目 `docs/integrations/cesium-mcp-setup.md`，覆盖 Claude Desktop/Cursor/Cline/Windsurf 配置文件模板。 |
| 4 | [FreeMcpLab: Cesium MCP 完整配置](https://www.freemcplab.com/play/cesium-mcp/) | 跨 6 个客户端的 `mcpServers` 配置文件模板集合（Claude Desktop / Cursor / Cline / Windsurf / Continue / Zed / Claude Code CLI）。 | 在 `client/src/mcp/` 增加客户端适配层（统一 `mcp.json` schema），降低多端接入门槛。 |
| 5 | [npm: cesium-mcp-bridge](https://npm.io/package/cesium-mcp-bridge) | 协议无关的执行层：可由浏览器内 agent、SSE、MCP、WebSocket、function-calling loop 多渠道驱动；提供 60 个浏览器安全 executors 与 schema 验证。 | 把 bridge 的 `execute({action, params})` 模式移植到本项目的 `client/src/utils/`，让现有 `agentTool.executeAction()` 复用同一 dispatcher。 |

**主题小结**：CesiumGS 已将"MCP + WebMCP"作为 2026 的官方 AI 集成方向；社区 cesium-mcp 提供 60 工具 + 协议无关执行层，可作为本项目 AI 工具的 baseline。本项目已有 `client/src/utils/asyncGuard.js` 与 `server/agent/memory.js`，下一步可按 bridge 的 action/params schema 抽象工具契约。

---

## 2. Mapbox GL JS 2026 AI 能力

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [Mapbox Map MCP Tools Library (moritzzzzz)](https://github.com/moritzzzzz/mapbox-map-tools-mcp) | JS 库把 Mapbox GL JS 地图抽象为 MCP 兼容工具（含 `draw_trip_on_map`、`get_map_state`、`registerExternalLayers`）；框架无关、UMD/ESM/CJS 三格式。 | 本项目若引入 Mapbox tiles，可直接复用此 layer registry 模式（与 cesium-mcp-bridge 的 `executors` 同构）。 |
| 2 | [Mapbox AI Framework (MapDemos)](https://github.com/MapDemos/mapbox-ai-framework) | Claude/Gemini 预建客户端 + 15+ Mapbox 工具 + MCP 模式 + Lambda 代理（带速率限制与 CORS）；XSS 防护、Token 管理、生产级配置。 | 抽取其 `DataSourceBase`/`BaseApp` 抽象为本项目 `server/agent/` 的 DataSourceAdapter，避免每个数据源重复样板。 |
| 3 | [Mapbox 官方主页](https://www.mapbox.com/) | Mapbox 已推出 Location AI 产品线：把矢量瓦片/路网/POI 通过 LLM tool 暴露给 Agent，含 entrance-level 地理编码、3D Lanes、procedural buildings。 | 在 `docs/evaluation/mapbox-vs-cesiumjs.md` 增加"Location AI 工具集"维度对比，便于选型决策。 |
| 4 | [Mapbox Build 2026 Agenda](https://www.mapbox.com/build/agenda) | Mapbox Build 2026 议程：GL JS 模块化（更小 bundle、按需加载）、AI 工具实战工作坊、AI 导航 app prompt-to-prod。 | 关注 Mapbox GL JS v4+ 模块化路线：本项目 CesiumJS 已是大 bundle（~500KB+），但 2D 场景可考虑按需加载 MapLibre 子集。 |
| 5 | [Mapbox Agents for JavaScript (mattpodwysocki)](https://gist.github.com/mattpodwysocki/7366f3974a413cd9a1b7e7579582cf03) | Mapbox 开源 `@mapbox/agents-tools` + `@mapbox/agents-llm-providers`；`ConversationManager` 支持 in-memory/SQLite/Postgres/Redis 后端；含 PII 脱敏/关键词拦截/HITL 审批中间件。 | 把 `ConversationManager` 的多后端持久化设计移植为本项目 `server/agent/memory.js` 的 storage adapter（已用 SQLite，可扩展 Postgres）。 |

**主题小结**：Mapbox 2026 把"Location AI"作为完整产品线；`@mapbox/agents-tools` 的中间件管线（PII/KW/HITL）值得作为本项目 `agentTool.execute()` 的中间件框架参考。

---

## 3. GIS AI Agent 2026 自主地理空间趋势

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [Mansourian & Oucheikh 2026 (TandF)](https://www.tandfonline.com/doi/pdf/10.1080/17538947.2026.2633849) | 多 Agent + CoT + RAG + QGIS 算法工具化框架；1-2 步任务达 100% 执行成功率 / 87.5% 语义正确率；多步任务性能下降明显。 | 本项目 `memoryVectorPrototype` 应保留"RAG + 工具使用"双轨；UI 暴露每步推理链（plan-act-reflect）便于调试。 |
| 2 | [Project Geospatial: Talk to the Map](https://projectgeospatial.org/geospatial-frontiers/talk-to-the-map-is-natural-language-gis-the-next-public-geoportal-interface) | "对话式 GIS"被视为继 Google Earth 之后的第二次空间赋能浪潮；3-5 年内将向多维、预测性情报引擎演化（Google Earth AI 主导）。 | 在 `docs/roadmap/2027-gis-conversational.md` 加入 NL-GIS 三阶段路线：脚本化 → 对话 → 多 Agent 自治。 |
| 3 | [Penn State GIScience: Autonomous GIS](https://giscience.psu.edu/2026/02/25/rapid-progress-toward-autonomous-gis-across-research-and-industry/) | 综述：Esri ArcGIS Pro Assistant 3.6/3.7、Microsoft + NASA Earth Copilot、Google Geospatial Reasoning、CARTO Agentic GIS、NV5 GeoAgent、Atlas Navi、Codvo NeIO 已商业化。 | 在 cycle-12 P0 候选中纳入"Earth Copilot 兼容的数据查询层"（本项目 `server/agent/memory.js` 已存地理 FTS5，扩展为 Earth Copilot 风格接口）。 |
| 4 | [arXiv: GIScience in the Era of AI](https://export.arxiv.org/pdf/2503.23633) | 提出 Autonomous GIS 五目标/五自主的研究议程：LLM 作为决策核心，独立生成并执行地理处理工作流。 | 抽 1 张图谱（autonomy ladder：script → chatbot → planner → actor → self-critic），写入 `docs/architecture/autonomy-ladder.md`。 |
| 5 | [GeoHey: UC 2026 之后 Esri 希望 AI "使唤" GIS](https://blog.geohey.com/uc-2026-zhi-hou-esri-xie-wang-ai-shi-huan-gisma/) | Esri UC 2026 推出 ArcGIS Location Platform MCP beta、ArcGIS Maps SDK JS 的 AI components、ArcGIS Pro Assistant 3.7；社交媒体反应冷淡（功能边缘，未深入工程主干）。 | 本项目 `client/src/utils/` 的 AI 工具应**深度绑定核心工作流**（如 3D Tiles 加载、相机飞行、几何运算），而非仅在 UI 外挂聊天框。 |

**主题小结**：2026 是 GIS Agent 从研究走向商业化的分水岭；商业路径分歧明显（headless infra vs UI 边缘）。**Top5 候选 #1**：把本项目核心 viewer/IO 工具重写为 `headless`-first 风格（先 MCP，后 UI 二次包装）。

---

## 4. React 19 useActionState 最佳实践

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [React 官方 useActionState 文档](https://reactjs.ac.cn/reference/react/useActionState) | `useActionState(fn, initialState, permalink?)` 返回 `[state, formAction, isPending]`；签名 `(prevState, formData) → newState`；配合 server functions 支持渐进增强。 | 本项目 `client/src/utils/useActionStateGuard.js`（cycle-11 已产出）应继续提供 React 18 fallback，但 README 标注升级到 React 19 后可去掉 try/catch 样板。 |
| 2 | [dev.to: React 19 useActionState (Monalisa Das)](https://dev.to/letusai15/react-19-useactionstate-from-usestate-chaos-to-server-action-clarity-143j) | 把 3 个 `useState`（loading/error/success）+ 手写 `e.preventDefault()` 替换为单一 hook；并列举两个常见错：把 action 传给 `onSubmit` 而非 `form.action`、签名顺序写反。 | 在 `useActionStateGuard.js` 的 JSDoc 显式标注"`formAction` 必须挂在 `<form action={...}>` 上，不可挂 `onSubmit`"。 |
| 3 | [Steve Kinney: useActionState Performance](https://github.com/stevekinney/stevekinney.net/blob/main/courses/react-performance/useactionstate-performance.md) | 自动 race condition 防护、批量更新（3-4 次 render → 1 次）、优化了 `isPending` 自动管理；适合 mutation 频繁的表单。 | 把 `serializeError` 与 isPending 解耦（本项目 guard 已实现），下个 cycle 增加"乐观更新"路线（`useOptimistic`）。 |
| 4 | [JetamCZ React 19 Workshop: Forms](https://github.com/JetamCZ/react19-workshop/blob/main/docs/02-forms.md) | R18 → R19 对比表：受控/非受控切换、`useFormStatus` 在子组件读 pending、`formData.get()` 取代逐字段 `useState`、Server Actions 自动 revalidation。 | 把上述差异表写入 `client/src/utils/useActionStateGuard.js` 的 README，方便迁移者参考。 |
| 5 | [SitePoint: useOptimistic + useActionState (Jun 2026)](https://www.sitepoint.com/react-19s-useoptimistic-and-useactionstate-replacing-80-of-your-state-boilerplate/) | 两 hook 联合使用可消灭 80% 状态样板；自动回滚乐观更新；12 行声明式代码替代原本的墙式 boilerplate。 | cycle-12 候选：在 `client/src/hooks/` 加 `useOptimisticAction.js`，组合本项目的 error-serialization + 乐观 UI。 |

**主题小结**：React 19 的 useActionState 已是事实标准的 mutation 状态机；本项目 cycle-11 产出的 guard 是"渐进采用 + 错误安全"的折中。**Top5 候选 #2**：下一 cycle 实现 `useOptimistic` + guard 的联合封装。

---

## 5. SQLite WAL 模式性能调优 2026

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [SQLite 官方 WAL 文档](https://sqlite.org/wal.html#walresetbug) | WAL 优：写不阻塞读，fsync 更少；劣：单主机限制、跨库事务非原子、page_size 不可改、读性能随 WAL 大小退化。 | 本项目 `server/data/blog.db`（开发）保持 WAL；持续监控 `wal_autocheckpoint`（默认 1000 pages）。 |
| 2 | [c13n.club: SQLite WAL 模式与并发控制](https://c13n.club/blog/2026-07-17/index.pdf) | 写密集场景定期手动 `PRAGMA wal_checkpoint(TRUNCATE)`；NVC SSD 上 1 writer 可达 10K TPS；`synchronous = NORMAL` 配 WAL 安全。 | 在 `server/agent/memory.js` 启动时打印当前 `journal_mode`/`synchronous`/`wal_autocheckpoint`，便于运维快速诊断。 |
| 3 | [botmonster: SQLite scales to production](https://botmonster.com/coding/sqlite-application-database-when-how-to-use/) | 推荐组合：`journal_mode=WAL` + `synchronous=NORMAL` + `mmap_size=256MB` + `busy_timeout=5000` + `foreign_keys=ON` + `journal_size_limit=64MB`；NVMe 上 50K+ reads/s、10K+ writes/s。 | 把上述 6 个 pragma 封装为 `server/agent/sqlitePragmas.js`，让本项目 `memory.js`/FTS5 表启动时统一应用。 |
| 4 | [Android Developers: SQLite 性能最佳实践](https://developer.android.com/topic/performance/sqlite-performance-best-practices?hl=zh-cn) | 启用 WAL，除非用 `ATTACH DATABASE`；放宽 `synchronous`；事务合并（批量 INSERT/UPDATE 用事务包）。 | 本项目 `memoryContextMiddleware` 写入事件应使用 `db.transaction()` 批量写，避免每个事件 fsync 一次。 |
| 5 | [MicroLogics: SQLite in Production (Jul 2026)](https://micrologics.org/blog/sqlite-in-production-optimizing-wal-mode-concurrency-and-vfs-layers-for-low-latency-app-servers) | 检查点策略对比（PASSIVE/FULL/RESTART/TRUNCATE）；写密集场景需手动后台线程 `PRAGMA wal_checkpoint(PASSIVE)`；自定义 VFS 进一步降延迟。 | cycle-12 候选：实现 `setInterval` 每 60s 调一次 `wal_checkpoint(PASSIVE)`，作为 `telemetryCollector` 的同级后台任务。 |

**主题小结**：本项目 `server/data/blog.db` 用 WAL 是正确选择；下一步可在 `server/agent/memory.js` 启动时统一应用 6 个生产 pragma + 60s 后台 passive checkpoint。**Top5 候选 #3**：封装 `server/agent/sqlitePragmas.js`。

---

## 6. OpenTelemetry Node.js SDK 传播模式

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [OTel 官方 JS Propagation 文档](https://opentelemetry.io/bn/docs/languages/js/propagation/) | W3C Trace Context 默认传播；`@opentelemetry/instrumentation-http`/`-express` 自动跨服务传播；ESM 项目需 loader hook。 | 本项目 `server/middleware/logger.js` 已实现 W3C `traceparent` + AsyncLocalStorage，下一 cycle 可挂 `@opentelemetry/api` 兼容层（不引入 OTel SDK 本身，保持轻量）。 |
| 2 | [CSDN: Sentry Node.js 与 OTel 集成](https://blog.csdn.net/gitblog_00320/article/details/150853153) | Sentry Node SDK 已深度集成 OTel（自动 instrumentation、ESM loader hooks、`SentryPropagator`）；含 LRU 缓存避免重复正则匹配。 | 若本项目未来接入 Sentry，可直接复用现成的 W3C `traceparent`+`baggage` 注入；不重复造轮子。 |
| 3 | [studiomeyer-io/mcp-otel](https://github.com/studiomeyer-io/mcp-otel) | W3C Trace Context MCP 桥：自动嵌套 `host → tools/call <name> → downstream` 为单 trace；依赖 `NodeSDK`/`NodeTracerProvider.register()` 安装 context manager。 | 本项目 `server/agent/memory.js` 的 MCP server（如未来接入）应使用同样嵌套模式：让单 trace 跨越 `user-message → tool → sub-tool`。 |
| 4 | [oneuptime: OpenTelemetry B3 Propagation](https://oneuptime.com/blog/post/2026-01-30-opentelemetry-b3-propagation/view) | B3 vs W3C Trace Context 对比；新项目推荐 W3C；遗留 Zipkin 系统推荐 B3；混合生态用 composite propagator。 | 本项目无 Zipkin 历史依赖，**坚持 W3C**；保留 B3 作为 env 开关 `TRACEPARENT_MODE=w3c\|b3\|both`。 |
| 5 | [oneuptime: Troubleshoot Context Loss in Worker Threads](https://oneuptime.com/blog/post/2026-02-06-troubleshoot-context-loss-worker-threads/view) | Node worker_threads 默认丢失 OTel context；解决方案：在主线程 `propagation.inject` 到 carrier，在 worker `propagation.extract`。 | 本项目 `server/sandbox/` 的 worker 池已是 LRU + reuse 模式，下一 cycle 在每个 worker 任务注入时附带 carrier，worker 内部 `extract` 恢复 trace。 |

**主题小结**：本项目自实现 W3C traceparent + ALS 是 OTel-Lite 风格；下一步是在 worker 池跨线程传播。**Top5 候选 #4**：扩展 `server/middleware/logger.js` 支持 worker carrier 注入。

---

## 7. 自动化 PR Review AI 架构（Claude Code Action）

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [fanioz/claude-code-pr-automation](https://github.com/fanioz/claude-code-pr-automation) | 5 个并行专门 Agent（code-reviewer/silent-failure-hunter/type-design-analyzer/pr-test-analyzer/comment-analyzer）+ 置信度分级（Critical 90-100% / High 80-89% / Medium 70-79%）。 | 本项目 `docs/cycles/cycle-11-handler-design-checklist.md`（cycle-11 产出）的 8 维度可作为 single-reviewer 的子任务拆分依据。 |
| 2 | [CSDN: Claude Code Headless + CI/CD 集成](https://blog.csdn.net/weixin_63132747/article/details/160980987) | `claude -p` + `--output-format json` + `--max-turns` + `--allowedTools` 让 CI 管道消费结构化输出；3 套开箱即用 YAML（PR 审查/Push 测试/定时扫描）。 | 在 `.github/workflows/` 增加 cycle-12 自审工作流（解析 Claude JSON 输出 → 自动写入 GitHub PR 评论）。 |
| 3 | [az9713/claude-code-tutorials TUTORIAL_15](https://github.com/az9713/claude-code-tutorials/blob/main/TUTORIAL_15_GITHUB_ACTIONS.md) | `claude-code-action` 监听 PR/issue 事件；流程：Event → Context 聚合 → Claude API → Action（评论/提交/创建 PR）。 | cycle-12 候选：在 PR 创建时自动调本地 cycle-execution-plan 生成 + 评论草稿。 |
| 4 | [Smithl-Lin/codex-public 双代理流水线](https://github.com/Smithl-Lin/codex-public/blob/main/Codex_Claude_Dual_Agent_Pipeline.md) | Stage 1 Codex（lint/批量）+ Stage 2 Claude Code（深度/架构）+ Stage 3 人工（决策）；AGENTS.md 给 Codex、CLAUDE.md 给 Claude。 | 在本项目加 `AGENTS.md`（MiniMax 规则）+ `CLAUDE.md`（Claude 规则）双轨，配合 `CODEOWNERS` 保护分支。 |
| 5 | [baeseokjae: Claude Code PR Review Guide 2026](https://baeseokjae.github.io/posts/claude-code-pr-review-guide-2026/) | Claude Code Review 5 个并行 agent + Critic 验证层；200K context 可读全 diff；与 GitHub Copilot 对比（后者单 pass 无 critic）。 | cycle-12 候选：把 cycle-11 的 8-dim checklist 改造为 Critic-Stage 验证脚本（先 Agent-A 审查，Agent-B 对审查结果再校验）。 |

**主题小结**：5 并行 Agent + Critic 是 2026 PR-AI 范式；本项目已有 8-dim checklist 作为基础。**Top5 候选 #5**：cycle-12 把 checklist 转为 Critic 模式的 JSON 契约。

---

## 8. React 错误边界与 Suspense 模式 2026

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [dev.to: Suspense & Error Boundaries (Srikar)](https://dev.to/mspk97/react-suspense-and-error-boundaries-how-they-interact-and-how-to-debug-failures-4i1e) | Suspense 只抓 promise；Error Boundary 才抓错误；推荐"ErrorBoundary 包 Suspense"结构避免 React lane 优先级冲突。 | 本项目 `client/src/utils/asyncGuard.js`（cycle-10 产出）应明确标注"外 ErrorBoundary、内 Suspense"组合模板。 |
| 2 | [React 官方 `use` Hook 文档](https://uk.react.dev/reference/react/use) | `use(resource)` 读取 Promise/context；与 Suspense/ErrorBoundary 自动集成；可放在条件/循环内（与 Hook 不同）。 | cycle-12 候选：在 `client/src/hooks/useResource.js` 包装 `use()`，配合 cache() 避免每次 render 新 Promise 引起的无限循环。 |
| 3 | [CSDN: React 组件懒加载（三）](https://blog.csdn.net/Dingdangr/article/details/141550592) | 懒加载组件必须包 ErrorBoundary → Suspense 嵌套；类组件 ErrorBoundary 实现需 `getDerivedStateFromError`+`componentDidCatch`。 | 本项目 `<App />` 顶层已包 Suspense，下一 cycle 在每个路由组件加 ErrorBoundary fallback UI（避免单页路由崩溃全树）。 |
| 4 | [aiskillstore/react-19-patterns: Suspense Patterns](https://github.com/aiskillstore/marketplace/blob/main/skills/barnhardt-enterprises-inc/react-19-patterns/suspense-patterns.md) | Suspense 边界 DO/DON'T：路由级/慢组件级/分块并行；过细粒度会视觉抖动，过粗粒度失去渐进加载意义。 | 在 `client/src/App.jsx` 标注哪些组件有独立 Suspense（Cesium Viewer、AI ChatPanel、Telemetry 抽屉），哪些共享同一 boundary。 |
| 5 | [edge-cases.com: Suspense Error Recovery](https://www.edge-cases.com/react/react-suspense-error-recovery) | SSR 双阶段错误：服务端先渲染 Suspense fallback，水合后客户端才抛给 ErrorBoundary；`<ErrorBoundary resetKeys={[userId]}>` + `key`-based reset 是最佳恢复模式。 | 本项目纯 CSR 无 SSR，但保留 `resetKeys` 模式可让"切换项目/工作区"自动重置错误边界。 |

**主题小结**：Suspense+ErrorBoundary 嵌套顺序、边界粒度、recovery 模式是核心；本项目 `asyncGuard.js` 已部分覆盖。下一 cycle 重点在"路由级 ErrorBoundary + resetKeys 自动恢复"。

---

## 9. 开源 CesiumJS 替代（MapLibre / deck.gl / OpenLayers）

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [Die-Hu/awesome-giser: Web Mapping](https://github.com/Die-Hu/awesome-giser/blob/main/tools/web-mapping.md) | 选型表：原型→Leaflet、生产矢量瓦片→MapLibre GL JS、3D terrain→MapLibre v4/CesiumJS、海量点位→deck.gl、动画时间序列→deck.gl。 | 在 `docs/evaluation/3d-tiles-2-followup.md`（cycle-11 产出）加入"MapLibre v4 3D globe vs CesiumJS"对比表，便于 2D/3D 场景路由决策。 |
| 2 | [Colorlib: 8 Best JavaScript Map Libraries (2026)](https://colorlib.com/wp/javascript-libraries-for-creating-dynamic-maps/) | Mapbox GL JS v2+ 闭源、MapLibre GL JS 是社区 fork（BSD-2，已超原版）；CesiumJS 仍为唯一开源 3D globe + Ion 选需付费。 | 本项目坚持 CesiumJS（3D 刚需）+ 可选 MapLibre 作为 2D minimap 旁路（与 cesium-mcp-bridge 解耦的轻量 2D 渲染）。 |
| 3 | [Development Seed: Client-side rendering comparison](https://developmentseed.org/datacube-guide/latest/visualization/client-side-comparison.html) | Zarr 矢量在 deck.gl-raster / @carbonplan/maps / zarr-layer / zarr-cesium 四种方案对比；CesiumJS 适合 3D globe + 地球级 imagery。 | cycle-12 候选：若未来需加载大型气象/海洋栅格，可选 `zarr-cesium`（已有 CesiumJS 集成）。 |
| 4 | [CSDN: 商用地图收费 → 天地图 + 开源生态](https://blog.csdn.net/weixin_45511682/article/details/163078249) | 国内合规路线：天地图 WMTS（道路/卫星/注记三层）+ CesiumJS/MapLibre；坐标系差异（GCJ-02/BD-09/WGS-84）必须显式转换。 | 在 `client/src/utils/coords.js` 增加 GCJ-02 ↔ WGS-84 互转；存储原始 GPS（WGS-84），渲染时按底图决定是否偏移。 |
| 5 | [arXiv: CesiumJS vs MapLibre 性能评测](https://arxiv.org/pdf/2602.23660v1) | MapLibre 矢量瓦片 FCP 0.8s / TBT 0ms；CesiumJS 3D Tiles 1.1 FCP 1.6s、TBT 数十 ms；CesiumJS 在 point cloud 海量数据下 TBT 可达 21s。 | 若引入 PLATEAU 级别（>23M CityGML）数据，本项目需评估 `MapLibre + deck.gl` 作为 2.5D 替代；保留 CesiumJS 做地球尺度。 |

**主题小结**：CesiumJS 仍是 3D globe 唯一开源王者；MapLibre v4 3D 是 2.5D 替代候选。本项目坚持 CesiumJS 主线 + MapLibre 旁路用于轻量 2D minimap。

---

## 10. AI Agent 长记忆（向量 + 混合检索）2026

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [Lyzr Cognis (arXiv 2604.19771)](https://arxiv.org/pdf/2604.19771) | 双存储（OpenSearch BM25 + Matryoshka 向量）+ RRF 融合（70% 向量 / 30% BM25）+ 时间加权 + BGE-2 cross-encoder reranker；LongMemEval 上 92.4%。 | 本项目 cycle-11 的 `memoryVectorPrototype` 应补充 BM25/全文通道：使用 SQLite FTS5（已存在）作 BM25、cosine 作向量，融合用加权 RRF。 |
| 2 | [CSDN: AI Agent 记忆系统全景](https://blog.csdn.net/DK_Allen/article/details/162899163) | 四类记忆（工作/情景/语义/程序）+ 第五类组织上下文；向量数据库方案最大缺点是"语义相似度迟钝"，5 分钟前 vs 5 周前无法区分。 | 引入"时间衰减因子"到 `memoryVectorPrototype` 的 cosine 评分：`final = α·cosine + β·recency`。 |
| 3 | [MindStudio: Hybrid Memory Architecture](https://www.mindstudio.ai/blog/ai-agent-hybrid-memory-architecture) | 三层：自动 transcript 日志 + curated memory files（实体级）+ 向量语义检索；curation 步骤最关键（原始 transcript 不缩放）。 | 本项目 `memoryContextMiddleware` 写入应自动生成"实体级 curated memory"（压缩成 `<entity, fact, ts>` 三元组），向量与三元组并存。 |
| 4 | [KeyMem (aixiv 260326.000002)](https://aixiv.science/pdf/aixiv.260326.000002v1.0.pdf) | 知识图谱存储 + 双通道检索（keyword vector + graph traversal）+ 基于片段的增量更新；解决多跳与时间推理问题。 | cycle-12 候选：在 SQLite 加实体边表（source_id, target_id, relation），让检索可走图遍历补齐多跳问题。 |
| 5 | [selina.ai: MemGPT → Memory Standards](https://selina.ai/blog/memgpt-to-memory-standards-how-agent-operating-systems-became-the-default-architecture-for-ai-memory-in-2026) | 2026 共识：混合"向量 + 图"是生产默认；纯向量搜索在关系型问题上损失 ~15 个百分点；MCP 已成为通用基础设施。 | cycle-12 候选：把 `memory.js` 重构为三层（向量层 + 图层 + FTS5），并提供统一 `MemoryOS` 接口（与 MCP server 对接）。 |

**主题小结**：纯向量已过时；2026 共识是"向量 + 图 + BM25 + 时间加权"四融合。**Top5 候选 #1**：本项目 `memoryVectorPrototype` 应扩展为向量+FTS5 RRF 混合检索 + 时间衰减。

---

## 11. GitHub Actions cron / Windows runner 2026

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [GitHub Community: self-hosted runner cron 不触发](https://github.com/orgs/community/discussions/185024) | cron 由 GitHub 服务器评估，自托管 runner 只执行；常见原因：workflow 在非默认分支、仓库无活动导致定时被禁。 | 本项目 cycle cron 工作流必须放在 `main` 分支；定期 push 任意 commit 保持仓库活动。 |
| 2 | [Marketplace: Schedule Workflow (austenstone)](https://github.com/marketplace/actions/schedule-workflow) | 用 `workflow_dispatch` + `schedule` 轮询 GitHub Variables 实现"未来某时刻运行"；v1.5+ 默认 Node 24；macOS 13.4 与 ARM32 runner 需 pin `v1.3`。 | cycle-12 候选：使用 `austenstone/schedule@v1` 实现"未来某时间运行 cycle-12"（避免 cycle-N 的固定 cron 漂移）。 |
| 3 | [CSDN: GitHub Actions 定时任务实战](https://blog.csdn.net/weixin_42567046/article/details/160133832) | cron 是 5 字段 UTC；北京时间 = UTC + 8h；`concurrency` 防止长任务重叠；Secrets 通过 `${{ secrets.NAME }}` 引用。 | 在 cycle-12 cron YAML 显式注释 `Beijing time`（用户视角），不直接出现 `0 1 * * *` 这种 UTC cron 字符串（满足渲染规范）。 |
| 4 | [nwcast: How to Use GitHub Actions to Schedule Scripts](https://www.nwcast.com/article/guide-how-to-use-github-actions-to-schedule-scripts-20260711) | `.github/workflows/` 路径必须严格；最短 cron 间隔 5 分钟；脚本调用前先在本地测试；Secrets 在失败日志中默认遮蔽。 | cycle-12 cron 工作流沿用 `runs-on: ubuntu-latest`（与本项目开发机 Windows 分离），保证时间漂移可控。 |
| 5 | [Katalon Forum: Parallel Windows Desktop on Self-Hosted](https://forum.katalon.com/t/running-parallel-windows-desktop-automation-on-self-hosted-runners-via-github-actions/191242/1) | Windows 自托管 runner 可通过 matrix 并行分发；用 `runs-on: [self-hosted, Windows, windows-desktop-agent]` 标签锁定；KRE v10+ 去掉手动 WinAppDriver。 | 本项目暂不需要 Windows 桌面测试，但若 cycle-N 加 Playwright 桌面端 UI 测，可参照此模式在自托管 Windows runner 上跑矩阵。 |

**主题小结**：cron 必须 UTC；workflow 必须在默认分支；仓库需保持活跃。下一 cycle 工作流应在 main 分支维护，每 cycle 触发前 push 一次。

---

## 12. 3D Tiles 2.0 / CesiumJS 2026

| # | 链接 | 一句话摘要 | 可落地行动 |
|---|---|---|---|
| 1 | [Cesium Blog: Vector Tiles Tech Preview (Sep 2026)](https://cesium.com/blog/2026/09/02/vector-tiles-technology-preview-cesium-and-3d-tiles/) | 3D Tiles 2.0 引入矢量瓦片（基于 glTF 2.1 + 新扩展 `KHR_mesh_primitive_restart` / `EXT_mesh_polygon`），可减小 5× 文件大小。 | cycle-12 候选：在 `client/src/utils/tilesetLoader.js` 增加矢量瓦片检测（`tileset.extensionsUsed` 含 `EXT_mesh_polygon`）。 |
| 2 | [Cesium Blog: 3D Gaussian Splats with HLOD](https://cesium.com/blog/2026/04/27/3d-gaussian-splats-lod/) | 3D Gaussian splats + 3D Tiles HLOD；与 Khronos/OGC/Esri/Niantic 联合制定 `KHR_gaussian_splatting` + `KHR_gaussian_splatting_compression_spz`；CesiumJS 已支持。 | cycle-12 候选：在 `client/src/components/Viewer.jsx` 增加 `gaussianSplat` 渲染模式开关；与现有 `3d-tiles` 渲染模式并列。 |
| 3 | [Cesium Blog: Help Shape Vector Data Support](https://cesium.com/blog/2026/06/29/help-shape-vector-data-support-in-3d-tiles/) | 3D Tiles 2.0 扩展矢量瓦片到 3D 空间（点/线/多边形），且支持 Mapbox Vector Tiles 与 GeoJSON 共存。 | 本项目加载大型 GeoJSON 时应优先转 MVT 后再加载；评估 `tippecanoe` 工具链引入到 `server/tools/`。 |
| 4 | [掘金: 3D Tiles 2.0 技术审查笔记](https://juejin.cn/post/7618018587467808802) | 6 大能力：glTF 2.1 基础、voxel primitive（250MB→15.4MB）、temporal 3D Tiles、矢量瓦片、CAD-style 边线、procedural。2026 Q2 草案。 | 在 `docs/evaluation/3d-tiles-2-followup.md`（cycle-11）补充 voxel / temporal 部分（cycle-11 仅覆盖矢量瓦片与 Gaussian splat）。 |
| 5 | [Cesium Blog: CAD-Style Workflow Extensions (Jul 2026)](https://cesium.com/blog/2026/07/09/introducing-cad-style-workflow-extensions-for-gltf/) | 新增 `EXT_mesh_primitive_restart` + `EXT_mesh_primitive_edge_visibility` + `BENTLEY_materials_line_style` + `BENTLEY_materials_point_style`；CesiumJS 已有 Edge Display Sandcastle。 | cycle-12 候选：在 Viewer 工具栏加"CAD 模式"切换（线宽/边线/点尺寸），对应 `client/src/utils/cadStyle.js`。 |

**主题小结**：3D Tiles 2.0 2026 年内会正式通过；核心新能力（vector tiles、Gaussian splat、voxel、temporal）都需在本项目 `tilesetLoader` 中预留扩展点。

---

## Top5 落地行动（汇总）

> 综合 12 主题、60 链接的调研结论，按"投入产出比 + 与本项目契合度"排序，选出 cycle-12 优先级最高的 5 项：

1. **混合检索升级（向量 + FTS5 + 时间衰减）** — 来源于主题 10。
   - 在 `server/agent/memory.js` 加 RRF 融合（cosine + BM25 + recency）。
   - `tests/specs/memory-hybrid-retrieval.cjs`（≥30 PASS）。
   - 影响：本项目记忆系统的核心瓶颈是"语义相似度迟钝"。

2. **`useOptimistic` + Guard 联合 hook** — 来源于主题 4。
   - 在 `client/src/hooks/useOptimisticAction.js` 组合 `useActionStateGuard` + React 19 `useOptimistic`。
   - `tests/specs/react19-optimistic-guard.cjs`（≥25 PASS）。
   - 影响：UI 体验显著改善（点击立即反馈、失败自动回滚）。

3. **SQLite 生产 pragma + 后台 passive checkpoint** — 来源于主题 5。
   - 新增 `server/agent/sqlitePragmas.js`（6 个 PRAGMA + 60s `wal_checkpoint(PASSIVE)` 后台定时器）。
   - `tests/specs/sqlite-production-pragmas.cjs`（≥20 PASS）。
   - 影响：稳定高并发写入场景的尾延迟与磁盘占用。

4. **Worker 线程 trace carrier 注入** — 来源于主题 6。
   - 扩展 `server/middleware/logger.js` 把 ALS store 序列化到 worker `workerData`，worker `extract` 恢复。
   - `tests/specs/worker-trace-carrier.cjs`（≥15 PASS）。
   - 影响：跨 sandbox worker 的 trace 可串联，本项目"端到端排查"能力提升。

5. **3D Tiles 2.0 vector tiles + Gaussian splat 兼容层** — 来源于主题 12。
   - 在 `client/src/utils/tilesetLoader.js` 增加 `extensionsUsed` 检测，自动启用 vector tiles / Gaussian splat 渲染路径。
   - `tests/specs/3d-tiles-2-loader.cjs`（≥25 PASS）。
   - 影响：紧跟 2026 Cesium 主线，避免未来升级被破坏。

---

## 调研统计

- 12 主题 × 5 链接 = **60 条链接**（全部已收集）
- 一句话摘要 + 可落地行动：每条 100% 覆盖
- Top5 行动：**横跨主题 10 / 4 / 5 / 6 / 12**，覆盖服务端 + 客户端 + 工具链
- 优先级冲突：主题 7（PR review）的双轨架构与本项目 `cycle-11-handler-design-checklist` 已覆盖，**未入选 Top5**