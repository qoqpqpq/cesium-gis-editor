# Cycle 09 — Research（调研）

> **周期**: N=9（2026-09-08）
> **范围**: 12 个主题 × 5 条链接 = **60 链接**
> **格式**: 主题 → 一句话摘要 → 行动建议
> **原则**: 聚焦 2026 年最新资料，优先落地动作（skip/defer/upgrade）

---

## 1. cesium 2026 MCP tool integration WebGPU browser

### 1.1 [Cesium MCP 开源实践 (CSDN 2026-03)](https://blog.csdn.net/qq_40266212/article/details/159085390)
一句话：cesium-mcp 把 CesiumJS 能力通过 MCP 协议暴露，让 AI Agent 用自然语言操控三维地球；19 个工具覆盖相机 / 图层 / 3D Tiles / 动画 / 截图，3 分钟跑通。
行动：**周期 9 P1-1 已落** —— 评估嵌入 cesium-mcp-bridge SDK（实测包大小 + 集成测试）；周期 10+ 考虑更多工具。

### 1.2 [Cesium MCP GitHub Repo](https://github.com/nefmame/cesium-mcp)
一句话：fork from gaopengbin/cesium-mcp；120 commits；58 个可用工具分 12 类；默认模式启用相机 / 图层 / entity / 空间分析。
行动：周期 9+ 评估 `cesium-mcp-bridge` npm package（v1.143.4 compatible）的接入路径；测试 5 个核心工具能否直接复用本项目 Viewer。

### 1.3 [cesium-mcp-bridge npm package](https://www.npmjs.com/package/cesium-mcp-bridge)
一句话：v1.143.4 / public / 2 days ago；43 命令覆盖视图控制 / Entity / Layer / Animation / 3D Scene / Interaction；protocol-agnostic；可被 SSE / MCP / WebSocket 任一驱动。
行动：**周期 9 P1-1 已落** —— 包大小评估 + 兼容性测试；与本项目 P1-1 mcpManifest 集成。

### 1.4 [CesiumGS/cesium-ai-integrations (deprecated)](https://github.com/cesiumgs/cesium-ai-integrations)
一句话：已被弃用；推荐迁移到 `cesiumjs-ai-starter-app`（AI SDK tools + 内置聊天 UI + WebMCP via `document.modelContext`）。
行动：**跳过** —— 直接迁移到 starter-app 不现实；保留 P1-1 内部 manifest 实现。

### 1.5 [skillsllm - cesium-mcp](https://skillsllm.com/skill/cesium-mcp)
一句话：5/7/2026 添加；135 stars；JavaScript；MCP / WebMCP / browser-agent / 12 类工具；要求安全 catalog scan 通过。
行动：监控社区评分；用作长期兼容性参考。

---

## 2. mapbox ai 2026 GL JS Mapbox Intelligence features

### 2.1 [Mapbox Location AI 主页](https://www.mapbox.com/?amp_device_id=IMcXNfSX6Pjbx9qv9Rsued)
一句话：Mapbox 2026 主推 Location AI（给 AI Agent 地理上下文）；Snap SPECS AR 眼镜 + Toyota 下一代导航 + 3D Lanes + 室内机场地图。
行动：**监控** —— Mapbox AI 方向确认；本项目自研 MCP manifest 与之并行。

### 2.2 [mapbox-map-tools-mcp GitHub](https://github.com/moritzzzzz/mapbox-map-tools-mcp)
一句话：MCP 兼容工具库（geocoding / directions / isochrones / 旅行时间矩阵 / 单一 `draw_trip_on_map` 调用）；与 Mapbox hosted MCP server 协同。
行动：**跳过** —— 本项目使用 CesiumJS 非 Mapbox GL JS；参考其 API 设计做未来扩展。

### 2.3 [Mapbox AI Framework](https://github.com/MapDemos/mapbox-ai-framework)
一句话：v0.4.3 / 2026-03；Claude + Gemini 客户端 + Mapbox GL JS + 15+ 工具 + MCP 模式 + Lambda 代理 + 语音识别。
行动：参考 Lambda proxy 的限流 / 鉴权设计；本项目已有 aiDailyLimiter + aiLimiter。

### 2.4 [Mapbox Agent Skills (mapbox-mcp-devkit-patterns)](https://agskills.dev/mapbox/mapbox-agent-skills/mapbox-mcp-devkit-patterns)
一句话：Mapbox 官方 Agent Skills（Open Plugins spec）；提供 mapbox/mapbox-devkit/mapbox-docs MCP servers；教 AI 用 Mapbox 工具。
行动：参考其 Skill / Plugin 双层架构；本项目后续 MCP 工具注册可借鉴。

### 2.5 [mapbox/mcp-server](https://github.com/mapbox/mcp-server)
一句话：Mapbox 官方 MCP server；含路径优化 / 地图匹配 / 等时线 / live `render_map_tool` 渲染 + 静态地图图像。
行动：**监控** —— 路线优化 API 可作本项目 spatial 模块 future 扩展（matrix / isochrone）。

---

## 3. gis agent 2026 autonomous geospatial AI tools

### 3.1 [GISclaw: 开源 LLM Agent 全栈 GIS 分析 (arXiv 2026)](https://arxiv.org/pdf/2603.26845)
一句话：6 LLMs × 2 架构 × 600 实验，最高 96% 任务成功率；GeoPandas + rasterio + scipy；ReAct + Plan-Execute-Replan 双架构对比。
行动：参考其 "Domain Knowledge injection" 与 "Error Memory" 设计；本项目 P1-3 memoryMiddleware 可借鉴 domain knowledge pattern。

### 3.2 [MEKXH/golem (GeoAI Agent)](https://github.com/MEKXH/golem)
一句话：Go + Eino 框架的 GeoAI Agent；GDAL/PostGIS 工具调用 + WebUI/TUI/IM 三端；带审批与审计框架。
行动：**监控** —— 商业 GIS Agent 趋势；本项目自研 server/agent/* 路径类似但更轻量。

### 3.3 [SuperMap AgentX Server 产品介绍](https://help.supermap.com/AgentXServer/zh/Introduction/Introduction.htm)
一句话：超图 2026 空间智能体平台；300+ MCP 工具（iPortal / iServer / GPA）；支持工作流 + 长规划 + 循环推理三种 agent 形态。
行动：商业参考；本项目自研 MCP 仅暴露核心 Viewer 能力，差异显著。

### 3.4 [Esri: The Next Era of AI and ArcGIS](https://www.esri.com/about/newsroom/arcnews/the-next-era-of-ai-and-arcgis)
一句话：Esri 2026 summer 推出 "Geospatial agents"；ArcGIS Maps SDK JS 内置；外部 agent 可连接 ArcGIS 工具。
行动：商业玩家全面布局；本项目自研 manifest 与之并行。

### 3.5 [CARTO for Agents: GIS for the Agentic Enterprise](https://carto.com/blog/introducing-carto-for-agents-gis-for-the-agentic-enterprise/)
一句话：CARTO 第一个面向 Agentic Enterprise 的 GIS 平台；extended CARTO CLI + 20+ Agent Skills + 强化 MCP Server；CLI 是 agent 接触 CARTO 的主要界面。
行动：参考其 "CARTO CLI 为 agent 界面" 思路；本项目 P1-1 mcpManifest 当前只暴露 manifest，不实现 CLI bridge。

---

## 4. react 19 best practices 2026 server components actions

### 4.1 [React 19 Server Functions Reference](https://react.dev/reference/rsc/server-functions.md)
一句话：Server Functions（2024.09 前叫 Server Actions）；用 `"use server"` 指令；client 可直接调 server 异步函数；React 19 stable；框架 API 不保证 semver。
行动：监控；本项目 client 是 Vite SPA 而非 Next.js，server functions 不直接适用。

### 4.2 [React 19 Complete Guide (softaims 2026)](https://softaims.com/blog/react-19-server-components-actions-guide-2026)
一句话：RSC 仅在 server 跑；bundle 零客户端 JS；Server Actions 替代 API route；useActionState 替代 useState+loading。
行动：监控；本项目用 Vite SPA 模式不直接用 RSC。

### 4.3 [React 19 Best Practices (25 项)](https://reactdevelopers.org/docs/react-19/best-practices/)
一句话：Install @types/react 19 同步；Context.Provider 弃用 → 直接渲染；Server Components 可 async；Server→Client 边界可传 Date/Map/Set/FormData；use server 标记单函数而非文件；useActionState 完全覆盖 state（不 merge）。
行动：监控；本项目 React 19 + Vite；CSP 当前已放 `'unsafe-eval'` 满足 React 19 编译需要。

### 4.4 [Mastering React Server Components (The Problem Solver)](https://www.theproblemsolver.dev/docs/react-advanced-2024.pdf)
一句话：Server Component 不发送 client；client 只能渲染 client；Next.js App Router 是 RSC 最成熟框架；Remix 不支持。
行动：监控；本项目非 Next.js App Router，RSC 不适用。

### 4.5 [React 19 Server Components: 7 Data Fetching Patterns (wowhow 2026)](https://wowhow.cloud/blogs/react-19-server-components-data-fetching-patterns-2026)
一句话：useEffect 数据获取是 anti-pattern；async server components 默认；parallel via Promise.all；Suspense streaming；cache() dedup；use() hook；Server Functions。
行动：**周期 9+ 评估**：本项目是否有客户端 React 19 组件能用 RSC 替代（几乎无 client 端 React 组件）。

---

## 5. sqlite performance tuning 2026 WAL mode pragma

### 5.1 [SQLite WAL Mode 官方文档](https://www.sqlite.org/wal.html)
一句话：WAL 比默认 rollback journal 快；reader/writer 不互锁；WAL 不能网络文件系统；不支持只读（除非 -shm/-wal 存在）。
行动：**周期 9 P0-2 已落** —— memory.js 加 `PRAGMA journal_mode=WAL`（更好并发）；写 spec 验证。

### 5.2 [SQLite WAL 模式与并发控制 (c13n 2026-07)](https://c13n.club/blog/2026-07-17/index.pdf)
一句话：WAL 三文件模型（main/.db-wal/.db-shm）；synchronous OFF/NORMAL/FULL/EXTRA；wal_autocheckpoint 默认 1000 页；写多读少手动 checkpoint(TRUNCATE)。
行动：周期 9+ 评估 `PRAGMA wal_checkpoint(TRUNCATE)` 周期触发（避免 .db-wal 无限增长）。

### 5.3 [SQLite Performance Tuning (thimslugga gist)](https://gist.github.com/thimslugga/102cae6dd735ef502b90658bceb91af5)
一句话：必跑 pragma `journal_mode=WAL` + `synchronous=NORMAL` + `temp_store=memory` + `mmap_size=30000000000`；定期 `pragma optimize`。
行动：**周期 9 P0-2 已落** —— 这些 pragma 加入 memory.js `_initSqlite`（默认启用）；spec PASS。

### 5.4 [Android SQLite Performance Best Practices](https://developer.android.com/topic/performance/sqlite-performance-best-practices?hl=zh-cn)
一句话：除非用 ATTACH，否则默认开 WAL；事务批量写；index 列覆盖 query 关键列。
行动：参考；本项目 memory.js 是 prototype，量化数据未达 ATTACH 复杂度。

### 5.5 [10 Essential SQLite Optimization Tips (linuxvox 2026)](https://linuxvox.com/blog/tips-for-optimizing-an-sqlite-database-with-over-a-gig-of-data-in-it/)
一句话：1GB+ DB 调优清单 —— 索引避免 over-indexing / PRAGMA tuning / EXPLAIN QUERY PLAN / VACUUM + ANALYZE / WAL / 文件系统 / 批量写 / LIMIT / 数据类型 / 监控。
行动：周期 9+：memory.js 数据量 < 1MB 时无需 WAL；定期 `ANALYZE` 即可；落 PRAGMA optimize。

---

## 6. MiniMax M3 features 2026

### 6.1 [MiniMax M3 官方页](https://www.minimaxi.com/models/text/m3)
一句话：M3 是 MiniMax 自研 MSA (MiniMax Sparse Attention) 架构；1M tokens 上下文（保证 512K 可用）；原生多模态（图文视频）；SWE-Bench Pro / Terminal-Bench 2.1 领先；BrowseComp 83.5 超 Opus 4.7 (79.3)。
行动：作为本自动化周期默认模型；周期 9+ 评估 M3 vs M2.7 speed trade-off（M2.7-highspeed 100 tps）。

### 6.2 [MiniMax M3 Deep Dive (Quriosity 2026-05)](https://github.com/Quriosity-agent/articles/blob/main/2026-05-31/2026-05-31-minimax-m3-frontier-model-agent-coding-1m-multimodal-en.md)
一句话：M3 是 frontier 三合一（coding + 1M context + native multimodality）；MSA 注意力架构 + KV outer gather Q 比 Flash-Sparse-Attention/flash-moba 快 4x+；1M 上下文下每 token 计算量 1/20。
行动：M3 在 coding + agent 任务上的领先是本周期自动化的核心能力；继续用 M3 不切 Auto。

### 6.3 [MiniMax Text Generation API Docs](https://platform.minimax.io/docs/guides/text-generation?_bhlid=b34262857fc0c4c744efe1c04da68f2d8166b416)
一句话：base_url Anthropic-compatible `https://api.minimax.io/anthropic`；支持 thinking 模式 + non-thinking 模式切换；模型名 `MiniMax-M3`。
行动：API 调用兼容性已验证（周期 7+ 跑通）；周期 9+ 评估 thinking mode 在本自动化周期是否带来额外价值。

### 6.4 [MiniMax M3 官方发布博客 (2026-06)](https://www.minimaxi.com/blog/minimax-m3)
一句话：MSA 在 1M 上下文下 prefill 9× / decode 15× 加速；交互式用户模拟器框架（真实研发协作）；ICLR 论文复现 / FP8 kernel 优化 / PostTrainBench 三个真实任务验证。
行动：M3 的"长程协作能力"契合本自动化周期（每周期 7-10 步 commit + push + 测试 + 文档）；保持使用。

### 6.5 [MiniMax M3 on SiliconFlow (2026-06)](https://www.siliconflow.com/blog/minimax-m3-now-on-siliconflow-frontier-coding-1m-context-and-native-multimodality)
一句话：M3 在 SiliconFlow 同步上线；\$0.12/\$0.60/\$2.40 per 1M tokens；前 7 天 50% off；与 OpenAI/Anthropic 完全兼容。
行动：备用渠道（如果 api.minimax.io 故障）；价格信息参考。

---

## 7. open code review architecture 2026 AI PR automation github

### 7.1 [cedricwider/opencode-review](https://github.com/cedricwider/opencode-review)
一句话：orchestrator + specialist fan-out 模式（pr-review-design / solid / security / consistency / testing）；每个 specialist 单一关注点返回 JSON。
行动：**周期 9+ 评估** —— 把本周期 pr-review.yml 升级为多 specialist 模式（先 baseline + design + security 三 specialist）。

### 7.2 [salious/open-code-review fork](https://github.com/salious/open-code-review)
一句话：fork from alibaba/open-code-review；545 commits behind；批评通用 agent 模式 "unstable quality"。
行动：参考其评估结果。

### 7.3 [alibaba/open-code-review](https://github.com/alibaba/open-code-review)
一句话：阿里 2026 开源；确定工程 + LLM Agent 混合架构（精准文件筛选 + 智能文件分组 + 模板引擎规则 + 独立定位/反思模块 + LLM 动态上下文检索）；连续 5 天 GitHub Trending；F1 25.10%（vs 通用 agent ~13%）；Token 1/9。
行动：核心架构决策参考 —— 不要纯依赖 LLM，关键步骤用工程硬约束；本周期 pr-review.yml 已在 baseline 阶段用硬规则。

### 7.4 [open-code-review Trending 解析 (CSDN 2026-08)](https://blog.csdn.net/gitblog_00806/article/details/159851978)
一句话：阿里内部两年数万名开发者产出百万级 bug 后开源；80+ 资深工程师标注 1505 ground-truth；1 分钟 vs 8-14 分钟；精确率优先（召回率有意低）。
行动：本项目 pr-review.yml 走"精确率优先"思路（不报低信号 issue）；参考 1505 ground-truth 数据集评估自己。

### 7.5 [Open Code Review GitHub Action Marketplace](https://github.com/marketplace/actions/open-code-review)
一句话：v2.1.5；专攻 AI 生成代码的 lint（幻觉 import / 过时 API / context window artifacts / over-engineering）；3 层分析（structural + embedding + LLM deep scan）。
行动：作为 PR baseline 阶段的"补充 lint"工具考虑（周期 9+）。

---

## 8. react error boundary 2026 production best practice

### 8.1 [React Error Boundaries: Don't Let One Bug Crash Everything (2026-03)](https://www.aicodingguild.com/blog/react-error-boundaries-dont-let-one-bug-crash-everything)
一句话：React 16+ 任何 uncaught render error unmount 整个 component tree；ErrorBoundary 只 catch render/lifecycle，**不 catch** event handlers / async code / SSR。
行动：参考其生产清单（route-level + widget-level 边界）；本项目 ErrorBoundary.jsx 已存在，周期 9+ 评估边界粒度。

### 8.2 [mughalhere/react-crash-guard](https://github.com/mughalhere/react-crash-guard)
一句话：三层 ErrorBoundary（GlobalErrorBoundary / RouteErrorBoundary / FeatureErrorBoundary）；含 async error 捕获 + Sentry/CloudWatch 集成；零运行时依赖。
行动：**周期 9 P1-3 已落** —— 写自研 asyncGuard.js（window.unhandledrejection + window.error），替代 react-crash-guard（避免引第三方依赖）。

### 8.3 [React错误边界失效？4 层防护体系 (CSDN 2026-08)](https://blog.csdn.net/FuncInk/article/details/153262815)
一句话：event handler 错误 → try/catch；Promise reject → `window.addEventListener('unhandledrejection')`；SSR 错误 → 服务端日志 + 降级 HTML；ErrorBoundary + Sentry 是生产必备。
行动：**周期 9 P1-3 已落** —— 在 client/src/utils/asyncGuard.js 加全局 unhandledrejection 监听；周期 10+ 上报 /api/telemetry。

### 8.4 [ErrorBoundary Component Dev Docs (prime-QA-TCMS)](https://github.com/prime-QA-TCMS/fog-ui/blob/main/src/components/errorBoundary/README.md)
一句话：production-ready ErrorBoundary；custom fallback UI 或函数；onError callback；reset functionality；ARIA labels；100% 测试覆盖。
行动：参考其 `fallback as function` 模式；本项目 ErrorBoundary.jsx 暂未实现。

### 8.5 [React Suspense and Error Boundaries (keval 2026-04)](https://www.keval.site/blog/react-suspense-error-boundaries)
一句话：Suspense 是 render 协调（throw Promise → fallback）；ErrorBoundary 必是 class component（React 19 仍如此）；function-as-fallback pattern（传 error + reset）。
行动：周期 9+：评估本项目是否能用 Suspense 替代部分 isLoading state（如 system prompts 加载）。

---

## 9. gis open source cesium alternative 2026 maplibre deck.gl

### 9.1 [GIS 前端主流新技术 2026 全景 (osgeo.cn)](https://osgeo.cn/post/1cca5/)
一句话：WebGPU 全面替代 WebGL（CPU 渲染开销降 80-95%）；CesiumJS / MapLibre / deck.gl / OpenLayers 全部 WebGPU 化；3D Tiles 2.0 定型（含 3D Gaussian Splatting）；AI 原生 GIS（自然语言驱动）。
行动：周期 9+ 评估 WebGPU pipeline（周期 7 P0-3 已评估 spec 但未切换 backend）；监控 3D Tiles 2.0。

### 9.2 [deck.gl 官网](https://deck.gl/)
一句话：GPU-powered 大规模数据可视化；64-bit float emulation；WebGL2 + WebGPU；与 Mapbox/MapLibre/Google Maps 集成。
行动：本项目 vector 数据可视化用 CesiumJS 已足够；deck.gl 用于周期 9+ 大数据量场景（如百万级 IoT 轨迹）。

### 9.3 [MapLibre GL JS](https://maplibre.org/projects/gl-js/)
一句话：开源 TypeScript 矢量瓦片地图库；GPU 加速 WebGL（soon WebGPU）；Globe + 3D Terrain + 3D Buildings + Deck.gl 集成。
行动：**监控** —— 周期 9+ 评估本项目 2D 视图是否可拆为 MapLibre（Cesium 地球模式仍保留 3D 场景）。

### 9.4 [Awesome Web Geospatial (naranyala)](https://github.com/naranyala/awesome-web-geospatial)
一句话：web-first 地理工具清单（Leaflet / MapLibre / OpenLayers / CesiumJS / deck.gl / Mapbox / Google Maps / CARTO）。
行动：综合参考；本项目选型已 stable（Cesium + Turf）。

### 9.5 [Best JavaScript Map Libraries 2026 (js-maps.com)](https://js-maps.com/best-javascript-map-libraries/)
一句话：2026 决策矩阵 —— Leaflet 轻量、Mapbox/MapLibre 矢量、OpenLayers GIS、CesiumJS 3D、deck.gl 大数据；按项目 DNA 选型。
行动：与本项目选型一致（CesiumJS + Turf）；无需切换。

---

## 10. ai agent memory system 2026 episodic semantic procedural

### 10.1 [MemMachine: Ground-Truth-Preserving Memory (arXiv 2026)](https://arxiv.org/pdf/2604.04853)
一句话：短时 + 长时情景 + profile 三层；保留原始对话 episode（避免 LLM 抽取错误）；LoCoMo 91.69% / LongMemEval 93.0%；比 Mem0 少 80% input tokens。
行动：周期 9+ 评估 —— 本项目 memory.js 当前 SQLite + FTS5；可参考其 "preserve raw episodes" 模式（不加 LLM 抽取层）。

### 10.2 [AI Agent 记忆系统全景 (CSDN 2026-07)](https://blog.csdn.net/DK_Allen/article/details/162899163)
一句话：四类记忆 —— 工作（context window）/ 情景（事件 + 时间戳）/ 语义（事实 + 向量）/ 程序（技能 + 规则）；CoALA 框架是理论根。
行动：周期 9+ 把 memory.js 升级到四层 —— episodic（已有 raw row）+ semantic（待做 LLM 抽取）+ procedural（system prompt 注入）。

### 10.3 [AI Agent Memory Architectures (zylos 2026-04)](https://zylos.ai/research/2026-04-05-ai-agent-memory-architectures-persistent-knowledge/)
一句话：三 taxonomy 共识（episodic/semantic/procedural）；no single store dominates；hybrid vector + graph 是趋势；Mem0 (48K stars) / Zep / Letta 是领先者。
行动：周期 9+ 评估 Zep Graphiti（双时间戳 + 图结构）vs 现有 SQLite + FTS5。

### 10.4 [LAION-AI/agent-bud-e](https://github.com/LAION-AI/agent-bud-e)
一句话：三部分 file-based 记忆（episodic + semantic + procedural）；JSON 文件 + 时间补丁历史；Context Constructor Agent + Main Agent + Memory Consolidation Agent。
行动：参考其 file-based JSON 设计；本项目 memory.js SQLite 等价但更可扩展。

### 10.5 [AI Agent Memory Types Patterns (heym 2026-04)](https://heym.run/blog/ai-agent-memory)
一句话：三层（semantic 向量 / episodic 关系型 / procedural KV）；四种架构（in-context / external / hybrid hot+cold / graph-backed）；无单一技术胜出。
行动：周期 9+ 评估 hybrid hot+cold —— 热记忆 ALS（已有）+ 冷记忆 SQLite + FTS5（已落）+ procedural 注入。

---

## 11. pr review automation ai 2026 best practices github actions

### 11.1 [akalata/ai-pr-review fork](https://github.com/akalata/ai-pr-review)
一句话：fork from tag1consulting；1373 commits；含 `_bmad/` `ai_pr_review/` `language-profiles/` `memory-bank/` `prompts/` `tests/` 子目录。
行动：参考其 memory-bank 设计（按语言/项目定制规则）；本项目 .github 目录简单。

### 11.2 [Claude 自动化 PR 工作流 (CSDN 2026-06)](https://blog.csdn.net/weixin_70573287/article/details/161677320)
一句话：claude-code-action GitHub Action；`/review-pr --post` 自动评论；`/review-pr --fix --auto-commit` 自动修；CLAUDE.md 自定义规则。
行动：**周期 9 P1-4 已落** —— pr-review.yml 接 anthropics/claude-code-action@v1 + anthropic_base_url + M3_API_KEY。

### 11.3 [Claude Opus Bedrock PR Review (gist 2026-07)](https://gist.github.com/rlueder/a3e7b1eb40d90c29f587a4a8cb7c5a70)
一句话：双轮 review（round 1 全 diff / round 2 仅新提交）；inline PR 评论；cost tracking；docs-only 自动跳过；大 diff > 150k 字符截断。
行动：参考其 cost tracking + diff size limit；本项目 pr-review.yml 周期 9+ 增强。

### 11.4 [AI PR Review via Bedrock Proxy (gchaix gist)](https://gist.github.com/gchaix/bb425eb3f557f6830d0609c51612f40e)
一句话：TypeScript reusable Action；按文件扩展名自动检测语言；multi-agent 编排；model routing 降成本；Bedrock proxy + Anthropic 兼容。
行动：参考其 TypeScript action 结构；本项目 pr-review.yml 是 yml 占位，周期 9+ 评估转 TS。

### 11.5 [PR-Agent Setup Guide 2026 (metacto)](https://www.metacto.com/blogs/automating-pull-request-workflows-with-pr-agent)
一句话：开源 PR-Agent（the-pr-agent/pr-agent）；GitHub Action 一键部署；`/describe` `/review` `/improve` `/ask` 四命令；先开 describe 再 review 最后 improve 渐进。
行动：参考渐进式 rollout 策略；本项目先 baseline + ai-review 占位，再深入。

---

## 12. github actions cron windows 2026 schedule workflow

### 12.1 [Schedule Workflow Action](https://github.com/marketplace/actions/schedule-workflow)
一句话：austenstone/schedule@v1.5（Node 24 required）；GitHub App 或 PAT + workflow_call；`austenstone/schedule@v1.3` 兼容 Node 20（fallback）。
行动：周期 9+ 评估用 schedule action 实现精确时间触发（替代 cron 的 UTC-only + 5min 最小间隔）。

### 12.2 [GitHub Actions Workflow Syntax Docs](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax?ref=automate-it)
一句话：on.schedule 用 POSIX cron；UTC only（不读 repo / runner 时区）；默认 branch 最新 commit；concurrency group 避免重入。
行动：监控；本项目 cron 已在生产使用。

### 12.3 [GitHub Agentic Workflows Schedule Syntax](https://github.github.io/gh-aw/reference/schedule-syntax/)
一句话：fuzzy schedules（`daily` / `every 2h` / `weekly on monday`）+ fixed cron；5 min 最小间隔；fuzzy 自动 scatter 避免 spike。
行动：周期 9+ 把元数据 IP 同步脚本从 fixed cron 改 fuzzy cron（更稳）。

### 12.4 [GitHub Actions Cron Syntax Guide 2026 (xerobit)](https://xerobit.dev/blog/github-actions-schedule/)
一句话：UTC only；workflow_dispatch + schedule 配合便于手动测试；UTC 转换表（India 08:00 IST → 02:30 UTC）；concurrency group 防重入。
行动：周期 9+ 在 pr-review.yml 加 `concurrency: group: pr-review-${{ github.event.pull_request.number }}, cancel-in-progress: false`。

### 12.5 [GitHub Actions Schedule Cron 2026 Reliability Fixes (softwaretestpilot 2026-07)](https://softwaretestpilot.com/blog/automation-testing/github-actions-schedule-cron-guide-2026)
一句话：3 怪癖 —— UTC only / 60 天无活动自动停 / 全部 :00 触发导致 spike；用 `:17` 这种奇数分钟 + keepalive action 防停。
行动：周期 9+：cron 错峰（避免 :00）；pr-review.yml 加 `gautamkrishnar/keepalive-workflow@v2` 防停。

---

## 调研 Top5（落 upcoming-work，周期 10+ 优先）

| 排名 | 主题 | 行动 | 落点 |
| --- | ---- | ---- | ---- |
| 1 | **Multi-specialist PR review（baseline + design + security）** | 周期 10+ 评估：用 anthropics/claude-code-action 接 M3 时启用 `--system-prompt` 多 mode；周期 9 P1-4 已落 baseline mode | 升级 pr-review.yml |
| 2 | **mem0 向量化（pgvector）**（周期 7 P1-5 已落 SQLite + FTS5；周期 9 P0-2 已落 WAL） | 周期 10+ 评估：SQLite → Postgres + pgvector + LLM 抽取层（episodic + semantic + procedural） | 升级 memory.js |
| 3 | **asyncGuard → /api/telemetry 上报** | 周期 10+：把 client/src/utils/asyncGuard.js 捕获的 unhandledrejection / window.error 上报到 /api/telemetry | 升级 asyncGuard.js |
| 4 | **Sandbox worker pool（替换 worker-per-call）** | 周期 10+：基于周期 9 P1-2 sandbox perf benchmark 数据，worker-seq p50=628ms 主要来自 worker creation；引入 worker pool（reuse + LRU） | 升级 sandbox |
| 5 | **3D Tiles 2.0 + WebGPU pipeline** | 周期 11+ 评估：cesiumJS v2+ WebGPU backend 切换；3D Tiles 2.0 Gaussian Splatting 支持 | 升级 viewer |
