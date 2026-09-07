# Cycle 04 — Research（12 主题 × 5 链接 = 60 链接）

> **周期**: N=4
> **目的**: 把周期 4 调研落到 P0-1 / P0-2 / P1-1 / P1-2 / P1-3 / P2-1 / P2-2 的同时，预研周期 5+ 方向。
> 调研方法: WebSearch 5 条链接 / 主题 + WebFetch 读取核心内容 + 一句话摘要 + 行动建议。
> 落地方式: Top5 追加到 `docs/release-notes/upcoming-work.md` 调研 Top5 段（覆盖周期 3 Top5）。

---

## 1. cesium 2026 mcp tool — CesiumJS + Model Context Protocol 集成

**核心摘要**: CesiumJS 已正式支持 MCP（Model Context Protocol），2026 年开源生态有 cesium-mcp（桥接浏览器 + AI Agent 19 工具 + WebSocket）。CesiumGS 官方 cesiumjs-ai-starter-app 提供 AI SDK tools + 内置聊天 UI + 外部 MCP 服务器支持 + WebMCP（浏览器原生 `document.modelContext` Imperative API）。

| # | 链接 | 一句话摘要 |
| - | ---- | ---------- |
| 1 | [GitHub - nefmame/cesium-mcp](https://github.com/nefmame/cesium-mcp) | 浏览器 SDK + MCP Server 19 工具（飞行 / 标记 / 图层 / 3D Tiles / 动画）桥接 CesiumJS 与 Claude/Copilot/Cursor |
| 2 | [CSDN - 让 AI 用自然语言操控三维地球 Cesium MCP 开源实践](https://blog.csdn.net/qq_40266212/article/details/159085390) | 三层架构: cesium-mcp-bridge (浏览器 SDK) + cesium-mcp-runtime (MCP Server) + cesium-mcp-dev (IDE AI 助手) |
| 3 | [npm - cesium-mcp-runtime](https://www.npmjs.com/package/cesium-mcp-runtime) | MCP SDK v2，支持 stdio + HTTP 传输（Streamable HTTP），62 个 Cesium 命令工具，5 个 toolset |
| 4 | [GitHub - CesiumGS/cesium-ai-integrations](https://github.com/cesiumgs/cesium-ai-integrations) | 官方 deprecated，迁移到 cesiumjs-ai-starter-app：AI SDK tools + 内置聊天 + 外部 MCP 服务器支持 + WebMCP 实验 |
| 5 | [npm - cesium-mcp-bridge](https://www.npmjs.com/package/cesium-mcp-bridge) | 协议无关 core，60+ 工具，AI Agent → SSE/MCP/WebSocket → Cesium Viewer，peer dep cesium ~1.143.0 |

**行动建议**: 周期 5+ 评估把现有 `<tool>` 协议（`server/agent/protocol/parse.js` + `client/src/pages/gis/sandbox.js`）包装为 MCP Server，对接 Claude Desktop + VS Code Copilot + Cursor；前端 UI 折叠工具过程。短期不改：MCP 包装需协议层重构 + 浏览器桥接 SDK。

---

## 2. mapbox ai 2026 — Mapbox Location AI + 生成式制图

**核心摘要**: Mapbox 2026 主推 Location AI（给 AI Agent 地理空间上下文）+ 生成式地图艺术 + 3D 高斯泼溅 + Cesium 等开源竞争激烈。Mapbox GL JS 商业化后（BSL v2），MapLibre GL JS（Linux 基金会）成为事实标准 + WebGPU + Globe 投影。

| # | 链接 | 一句话摘要 |
| - | ---- | ---------- |
| 1 | [Mapbox Build Agenda 2026](https://www.mapbox.com/build/agenda) | Mapbox 2026 三大方向：Geocoding 入口级精度 / Tableau 空间智能 / AI 生成导航应用（从 prompt 到生产） |
| 2 | [Cartosketch - 2026 AI 地图艺术生成器 8 工具对比](https://cartosketch.com/ja/blog/best-ai-map-art-generators-2026-comparison) | GPX 是核心竞争力，Cartosketch 唯一能商用打印；Midjourney/ChatGPT 几何好但地理捏造；Flux+ControlNet 几何保真但需自建 pipeline |
| 3 | [Moonlight - MapStory: LLM-Powered Text-Driven Map Animation Prototyping](https://www.themoonlight.io/fr/review/mapstory-llm-powered-text-driven-map-animation-prototyping-with-human-in-the-loop-editing) | MapStory 用 o1 做 Scene Breakdown + Perplexity sonar-pro 做事实 grounding（OSM Nominatim），可编辑 timeline 编辑器 |
| 4 | [Mapbox Homepage - Location AI](https://www.mapbox.com/) | Mapbox Location AI: 给 AI Agent 地理空间上下文（precision 入口级精度 + 全球边界 + 实时交通） |
| 5 | [ArXiv - MapStory 论文 (2505.21966)](https://arxiv.org/pdf/2505.21966v1.pdf) | MapStory 是 React.js + TypeScript + Mapbox + Fabric.js 的 agentic 系统（双 agent），专业动画师可用、自然语言驱动 |

**行动建议**: 周期 5+ 评估在 client/src/pages/gis/aiTools.js 增加"Mapbox 风格 3D 建筑拉伸"（参考 Mapbox 3D Lanes / Mapbox Standard 详细建筑）+ "生成式样式"（参考 Mapbox Location AI 输入 prompt 改 Cesium 样式）。短期不接 Mapbox 商业 API（成本 + 锁定）。

---

## 3. gis agent 2026 — GIS 自主 Agent 系统

**核心摘要**: GIS Agent 2026 进入"agentic"时代。代表系统：GISclaw（96% 任务成功，多模型 × 多架构 600 实验）、Golem（自演化 GeoAI Agent，Go + Eino）、Esri ArcGIS AI Assistant（自然语言 + WebMCP）、SuperMap AgentX（智能体原生）。核心架构：ReAct / Plan-and-Execute / Multi-Agent / Reflective / Tool-Augmented / Memory-Augmented / RAG / Autonomous Loop。

| # | 链接 | 一句话摘要 |
| - | ---- | ---------- |
| 1 | [ArXiv - GISclaw: Open-Source LLM-Powered Agent System for Full-Stack Geospatial Analysis](https://arxiv.org/pdf/2603.26845) | GISclaw 支持 vector/raster/tabular，6 模型 × 2 架构 × 600 实验，最高 96% 任务成功；Dual Agent 反而降低强模型表现 |
| 2 | [GitHub - MEKXH/golem](https://github.com/MEKXH/golem) | Golem（自演化 GeoAI Agent），Go + Eino，GDAL/PostGIS 工具，本地部署，approval + audit framework |
| 3 | [Esri - The Next Era of AI and ArcGIS](https://www.esri.com/about/newsroom/arcnews/the-next-era-of-ai-and-arcgis) | ArcGIS 2026 agentic AI，external agents 可调用 ArcGIS 工具，用户可构建 geospatial agents 自动化 GIS workflow |
| 4 | [PSU GIScience - Autonomous GIS Data Retrieval Agent](https://giscience.psu.edu/geospatial-data-retrieval-agent/) | LLM-Find：自然语言数据下载，OpenStreetMap + US Census + ESRI World Imagery + DEM + 气象数据，80-90% 成功率 |
| 5 | [SuperMap - 一体化智能化 SuperMap GIS 2026 焕新发布](https://cn.supermap.com/zh-cn/a/news/2_5067.html) | SuperMap AgentX（Pre-Beta）空间智能体桌面平台，自然语言 + IM 远程任务 + Skill Hub 内置 GIS 专家库 |

**行动建议**: 周期 5+ 评估"自然语言 → Cesium 实体生成"（参考 LLM-Find）：用户在 chat 输入"画一个杭州矩形 + 标记 5 个 POI"，Agent 自动调用 `addGeoJsonLayer` / `addMarker`。短期不改：需扩展 client/src/pages/gis/aiAgent.js 的 tool 协议（与 P2-8 协议统一绑一起做）。

---

## 4. react 19 best practices 2026 — React 19 稳定 + RSC

**核心摘要**: React 19 稳定 Server Components（async + await 渲染）+ `use()` hook 读 Promise + Server Actions + `useActionState` / `useOptimistic` / `useFormStatus` + ref as prop + Context 直接作为 Provider + 文档 metadata hoisting。React 19.2.3 是 2026 Q1 推荐默认。

| # | 链接 | 一句话摘要 |
| - | ---- | ---------- |
| 1 | [React.dev - Server Components](https://react.dev/reference/rsc/server-components) | React 19 Server Components：async/await in render，独立环境渲染，可一次构建 + 客户端只下载 RSC Payload |
| 2 | [ReactDevelopers - React 19 Best Practices](https://reactdevelopers.org/docs/react-19/best-practices/) | 25 项最佳实践：Context 直接作 Provider / Server Component 才能 async / Server→Client 序列化支持 Date/Map/Set/Promise / useActionState 全覆盖 state |
| 3 | [wowhow - React 19 ServerComponents: 7 DataFetching Patterns](https://wowhow.cloud/blogs/react-19-server-components-data-fetching-patterns-2026) | 7 种 useEffect 替代：Async Server Component / Parallel Promise.all / Suspense 流式 / React cache() 去重 / use() hook |
| 4 | [Ecosire - React 19 Server Components Migration Guide 2026](https://ecosire.com/ur/blog/react-19-server-components-migration-guide) | 生产环境迁移经验：JS bundle 降 38%、LCP 改善 24%、TTI 改善 31%、DB 往返省 15% —— 关键是"audit first + leaf-up + measure after each merge" |
| 5 | [CSDN - 2026 全栈前端新纪元 React 19 RSC + 边缘函数 + AI Agent](https://blog.csdn.net/2303_76234920/article/details/159579944) | React 19.2.3 是 RSC 稳定版；边缘函数（Cloudflare Workers / Vercel Edge / 阿里云）全球 3000+ 节点，冷启动 5ms；与 AI Agent 一起构建企业级智能客服 |

**行动建议**: 周期 5+ 评估把 CesiumGIS Editor 重构为 Next.js 16 + React 19 RSC（参考 Ecosire 经验，bundle -38% / LCP -24%）。**短期不改**：本项目 client 是 Vite + 客户端 SPA，迁移成本大；与"商业化"绑一起做（Next.js 适合 SaaS 化）。

---

## 5. sqlite performance tuning 2026 — WAL + mmap + PRAGMA

**核心摘要**: 2026 SQLite 性能最佳实践：`PRAGMA journal_mode=WAL`（读不阻塞写）+ `PRAGMA synchronous=NORMAL`（WAL 下安全 + 快）+ `PRAGMA mmap_size=128MB`（读多写少）+ `PRAGMA temp_store=MEMORY` + `PRAGMA optimize`（定期）+ `PRAGMA wal_checkpoint(TRUNCATE)`（写多读少时手动截断）。

| # | 链接 | 一句话摘要 |
| - | ---- | ---------- |
| 1 | [SQLite.org - Write-Ahead Logging](https://www.sqlite.org/wal.html) | WAL 模式：读写并发、写不阻塞读、fsync 少；缺点：必须在同一主机、page_size 不可变、WAL 文件可能持续增长 |
| 2 | [c13n.club - SQLite WAL 模式与并发控制](https://c13n.club/blog/2026-07-17/index.pdf) | WAL 三文件模型（主 DB + WAL + 共享内存 .db-shm），快照隔离；wal_autocheckpoint + mmap_size 调优指南 |
| 3 | [Gist - thimslugga SQLite Performance Tuning](https://gist.github.com/thimslugga/102cae6dd735ef502b90658bceb91af5) | WAL + synchronous=NORMAL + temp_store=memory + mmap_size + page_size=32768 + 定期 PRAGMA optimize + wal_checkpoint |
| 4 | [Android Developers - SQLite 性能最佳实践](https://developer.android.com/topic/performance/sqlite-performance-best-practices?hl=zh-cn) | Android 官方推荐：启用 WAL + ATTACH DATABASE 例外 + 定期 checkpoint + INDEX 优化 |
| 5 | [GitHub - ChristopherDavenport Pragmas & Tuning](https://github.com/christopherdavenport/christopherdavenport-marketplace/blob/main/backend/sqlite/skills/sqlite/references/pragmas-and-tuning.md) | 每个连接必设：WAL / NORMAL / foreign_keys / busy_timeout=5000 / cache_size=-64000 / temp_store=MEMORY / mmap_size=128MiB |

**行动建议**: 本项目无 SQLite 数据库（server/data/blog.db 旧部署遗留，本周期未用）。**短期不实施**。若周期 5+ 加 SQLite（如用户偏好 / Agent 记忆存储），按此 5 项 PRAGMA 实施即可。

---

## 6. minimax m3 M3 features 2026 — MiniMax M3 模型能力

**核心摘要**: MiniMax-M3 (MiniMax M3) 是 2026-06-01 发布的旗舰模型。基于 MSA（MiniMax Sparse Attention）支持 1M token 上下文，9× faster prefill / 15× faster decoding。M3 是原生多模态（文本 + 图像 + 视频从 step 0 训练）。性能：SWE-Bench Pro 59.0% / Terminal-Bench 2.1 66.0% / MCP Atlas 74.2%。

| # | 链接 | 一句话摘要 |
| - | ---- | ---------- |
| 1 | [MiniMax M3 Product Page](https://www.minimaxi.com/models/text/m3) | M3: MSA 自研稀疏注意力 + 1M token 上下文 + 512K 至少可用 + 原生多模态；SWE-Bench Pro / Terminal-Bench / BrowseComp 行业顶尖 |
| 2 | [MiniMax Research Blog](https://www.minimax.io/blog) | MiniMax Research 全模型线：M3 (1M context 多模态) / Music 3.0 (开源音乐) / H3 (omni-modal) / MaxProof (数学证明) / Agent Team (long-running tasks) |
| 3 | [NVIDIA Build - MiniMax-M3 Model Card](https://build.nvidia.com/minimaxai/minimax-m3) | MoE 架构 428B 总参数 / 22B 激活；vLLM + SGLang runtime；NVIDIA Blackwell/Hopper；上下文 1M tokens |
| 4 | [SambaNova - MiniMax M3 Running Fastest on SambaCloud](https://sambanova.ai/blog/minimax-m3-running-fastest-on-sambacloud) | M3 on SambaCloud 跑得最快，9× faster prefill / 15× faster decoding at 1M context；FP8 GEMM CUDA 优化 24h 自治 9.4× speedup |
| 5 | [MiniMax Platform Docs - Model Invocation](https://platform.minimax.io/docs/guides/text-generation) | API 调用：base_url https://api.minimax.io/anthropic (推荐) 或 /v1 (OpenAI-compatible)；多模态支持 image_url + video_url |

**行动建议**: 本项目 server/services/ai.js 已支持 `api.minimaxi.com`（MiniMax M3 厂商）。**短期不实施**额外优化。M3 上下文 1M 适合长会话（多轮 AI 对话 + viewState + tool history），但当前 viewState 8KB + AI 60/min 限流，1M 上下文暂用不上。

---

## 7. open code review architecture 2026 — AI 代码评审架构

**核心摘要**: 2026 AI 代码评审两大流派：①阿里 Open Code Review（确定性开源 × Agent 混合，月活 2 万 / 3.7M 评审 / 采纳 30%）；②Anthropic Claude Code 多 Agent 并行 + Cross-Verification（False-Positive < 1%，PR 覆盖率 16% → 54%）；③Codex CLI `--output-schema` 强制 JSON 输出，Self-Hosted Pipeline（GitLab/Azure DevOps/Jenkins）。

| # | 链接 | 一句话摘要 |
| - | ---- | ---------- |
| 1 | [CSDN - 阿里开源 Open Code Review 一周 5k star](https://deepseek.csdn.net/6a3e1c6b662f9a54cb84a76d.html) | Open Code Review 内部 2 万月活 / 370 万次评审 / 采纳 30% / 位置准确率 97% —— 核心：确定性开源（文件过滤 + 规则匹配 + 反思）+ Agent 决策 |
| 2 | [GitHub - MVS-source/open-code-review](https://github.com/MVS-source/open-code-review) | Open Code Review fork，294 commits，Claude/VS Code/IntelliJ 集成；npm + Go + VS Code extension |
| 3 | [GitHub - ha0txu/js-razor Code Review Agent Architecture Guide](https://github.com/ha0txu/js-razor/blob/main/Code_Review_Agent_Architecture_Guide.md) | 5 个 specialized agents（Logic/Security/Performance/Architecture/Edge Cases）+ Verification Agent 交叉验证，Anthropic 内部生产部署 |
| 4 | [codex.danielvaughan - Self-Hosted Code Review Pipelines](https://codex.danielvaughan.com/2026/04/29/codex-cli-self-hosted-code-review-pipelines-multi-platform-ci-cd/) | Codex CLI `--output-schema` 强制 JSON 输出，GitHub Actions / GitLab CI / Azure DevOps / Jenkins 通用 pipeline；--sandbox read-only + --ephemeral |
| 5 | [GitHub - kodflow /review v2 evidence-bound](https://github.com/kodflow/devcontainer-template/issues/395) | 14 维度 taxonomy + technique catalog + anti-theater 机制；blast-radius review（cross-file 依赖图）+ Intent-vs-implementation + temporal coupling 检测 |

**行动建议**: 周期 5+ 给 cesium-gis-editor 项目接入 Open Code Review 或 Claude Code `/code-review`（PR 自动化评审）。**短期不实施**：当前是单人 / 单 AI Agent 周期工作流，PR review 是"周期主调度自己审自己"。先把 commit message 规范化（已有 `feat(cycle-NN): ...` 格式）+ commit history 清晰即可。

---

## 8. react error boundary 2026 — Error Boundary 生产模式

**核心摘要**: React 19 仍只能用 class component（`getDerivedStateFromError` + `componentDidCatch`）做 Error Boundary；功能组件不行（错误可能逃逸）。生产模式：①App-wide root + 关键组件（dialogs/sheets）局部；②resetKeys（referential equality）控制 reset；③非渲染错误（事件 / 异步）需 try/catch + window.onerror + unhandledrejection。

| # | 链接 | 一句话摘要 |
| - | ---- | ---------- |
| 1 | [React Legacy Docs - Error Boundaries](https://legacy.reactjs.org/docs/error-boundaries.html) | Error Boundary 仅捕获子组件 render/lifecycle/constructor 错误；事件 / 异步 / SSR / 自身错不捕获；React 16+ 必须有 error boundary 否则 unmount 整个树 |
| 2 | [CSDN - React 错误边界失效 全面掌握前端异常捕获的 4 层防护](https://blog.csdn.net/FuncInk/article/details/153262815) | 4 层防护：错误边界（render 错）+ try/catch（事件错）+ unhandledrejection（Promise 错）+ SSR 错误降级 HTML |
| 3 | [xjavascript - React ErrorBoundary: Why Fallback UI Gets Replaced](https://www.xjavascript.com/blog/react-still-showing-errors-after-catching-with-errorboundary/) | 必须用 class component；reset state 只在 resetKeys 变更时；App-wide root + 关键组件局部双层 |
| 4 | [GitHub PR - feat(toolkit): ErrorBoundary ein kaputter Bereich reisst nicht die App ab](https://github.com/real-life-org/real-life-stack/pull/285) | ErrorBoundary 放在 DialogContent / SheetContent（不是 caller）；close button 在外 + retry 仅在 children；Radix DialogTitle 用于 a11y |
| 5 | [jsmanifest - React Error Boundaries Production-Ready Patterns](https://jsmanifest.com/posts/react-error-boundaries-production-ready-patterns) | ProductionErrorBoundary 模板：getDerivedStateFromError + componentDidCatch + resetError + dev-only stack trace + "Try Again" 按钮 |

**行动建议**: 本项目 client/src/components/ErrorBoundary.jsx 已存在。**短期不实施**改造。周期 5+ 评估给 Cesium 关键组件（AiSidePanel / EditorPanel）套独立 ErrorBoundary（参考 real-life-stack PR 285 模式）。

---

## 9. gis open source cesium alternative — 开源 GIS 引擎对比

**核心摘要**: 2026 GIS 前端三大开源方向：①WebGPU 替代 WebGL（CesiumJS / MapLibre GL / deck.gl 全部已支持）；②3D Tiles 2.0（2026 定稿：3D 高斯泼溅 + 体素 + 时序动态瓦片）；③AI 原生 GIS（ArcGIS AI Assistant / SuperMap AgentX / LLM+GeoPandas）。

| # | 链接 | 一句话摘要 |
| - | ---- | ---------- |
| 1 | [osgeo - GIS 前端主流新技术 2026 最新全景](https://osgeo.cn/post/1cca5/) | WebGPU 全面替代 WebGL；Cesium/MapLibre/deck.gl 默认 WebGPU；3D Tiles 2.0（高斯泼溅 + 体素）；AI 原生 GIS（ArcGIS / SuperMap / LLM+GeoPandas） |
| 2 | [GitHub - Die-Hu/awesome-giser Web Mapping Libraries](https://github.com/Die-Hu/awesome-giser/blob/main/tools/web-mapping.md) | MapLibre GL JS（SOTA 开源，Linux 基金会 + AWS/Microsoft/Meta）+ Mapbox GL JS（v2 起 BSL）+ Deck.gl + CesiumJS（3D Globe）+ Leaflet（轻量 2D） |
| 3 | [deck.gl Docs](https://deck.gl/docs) | deck.gl 是 WebGL/WebGPU 大数据可视化（points/hexagon/heatmap/path），与 MapLibre/Mapbox/ArcGIS 互操作 |
| 4 | [youngju - ジオスペーシャル スタック 2026 完全ガイド](https://www.youngju.dev/blog/culture/2026-05-16-geospatial-stack-2026-postgis-maplibre-mapbox-deckgl-kepler-protomaps-overture-h3-deep-dive.ja) | 2026 Geospatial 6 层：Data Source / Tile Format / Tile Server / Renderer / Spatial DB / Service；关键词"vendor lock-in 脱出" |
| 5 | [colorlib - Best JavaScript Map Libraries 2026](https://colorlib.com/wp/javascript-libraries-for-creating-dynamic-maps/) | MapLibre（BSD-2，~220KB）/ Mapbox GL JS（v2 商业 50K loads/mo）/ CesiumJS（~500KB）/ Leaflet（~42KB 2D only）/ OpenLayers（~170KB 2.5D） |

**行动建议**: 本项目主选 CesiumJS（3D globe + Cesium Ion 瓦片 + 第三方兼容）；短期不切换。**周期 5+ 评估**给某些 2D-only 场景（如 stat panel）替换为 MapLibre GL JS（BSD-2，比 Mapbox 自由）。

---

## 10. ai agent memory system 2026 — Agent 长期记忆架构

**核心摘要**: 2026 Agent Memory 进入"Memory OS"时代。代表系统：Mem0（提取优先）/ Zep（时序图 + memory service）/ MemU / MemOS / EverMemOS（lifecycle-based Agentic Memory OS）。关键洞察：①长上下文 ≠ 长期记忆；②Vector DB 不够（需 ADD/UPDATE/DELETE/版本追踪）；③Hybrid Retrieval（BM25 + Vector + RRF）+ Temporal Boosting + Reranker。

| # | 链接 | 一句话摘要 |
| - | ---- | ---------- |
| 1 | [ArXiv - Cognis: Context-Aware Memory for Conversational AI Agents](https://arxiv.org/pdf/2604.19771v1) | Lyzr Cognis：双 store（OpenSearch BM25 + Vector）+ RRF + 时序增强 + BGE-2 cross-encoder reranker + 版本追踪；LongMemEval 92.4% 准确率 |
| 2 | [掘金 - 2026 硬核干货 8 大 AI Agent 主流架构全拆解](https://juejin.cn/post/7658567805047504937) | 8 大架构：ReAct / Plan-and-Execute / Multi-Agent / Reflective / Tool-Augmented / Memory-Augmented / RAG Agent / Autonomous Loop |
| 3 | [Alibaba Cloud - Agent Memory: Why Persistent Recall Needs More Than a Vector Database](https://www.alibabacloud.com/blog/agent-memory-why-persistent-recall-needs-more-than-a-vector-database_603532) | Vector DB 是 building block 不是全部；memory 是 infrastructure layer；Hologres Long Memory Service + Mem0 框架；跨会话 + 跨 user + 跨 team |
| 4 | [EverMind - Top AI Memory Systems Benchmarked 2026](https://evermind.ai/blogs/top-ai-memory-systems-benchmarked-in-2026) | 4 代架构：extraction-first (Mem0) / temporal graph (Zep) / trainable memory (MemU/MemOS) / lifecycle Agentic Memory OS (EverMemOS/EverOS) |
| 5 | [GitHub - MEKXH/golem (Vertical AI Agent)](https://github.com/MEKXH/golem) | Golem 垂直 GeoAI Agent，approval + audit framework + learned pipeline reuse + skill telemetry loops |

**行动建议**: 周期 5+ 评估"AI Agent 长期记忆"：每个 session 记忆 (camera + layer + AI description + last tool call) 跨 session 恢复。**短期不实施**：与"商业化"绑一起做；Mem0 / Zep / EverOS 都需要部署 + 存储后端。本项目当前是纯前端 + Express，引入 Memory OS 是大工程。

---

## 11. PR review automation ai 2026 — 自动化 PR Review

**核心摘要**: 2026 PR Review AI 工具爆发：①CodeRabbit（diff-only AI 评）；②Claude Code `/review`（4 个固定并行 agent）；③Claude Code PR Review Toolkit（6 specialized agents）；④Codex GitHub Connector（AGENTS.md 配置 + auto-fix）；⑤Gemini + 结构化输出。

| # | 链接 | 一句话摘要 |
| - | ---- | ---------- |
| 1 | [GitHub - ThierryRakotomanana articles ai-pr-reviewer](https://github.com/ThierryRakotomanana/articles/blob/main/published/ai/ai-pr-reviewer.md) | GitHub Actions + Gemini + 结构化 JSON 输出 + 行级 PR comment；`actions/checkout@v4` + `git diff` + Python inline script |
| 2 | [CSDN - 第三十三篇 自动化 PR 工作流让 Claude 介入代码审查与合并](https://blog.csdn.net/weixin_70573287/article/details/161677320) | AI 负责可自动化（lint/test/bug/security）+ 人负责架构设计；`/review-pr --post` 自动评论 + `--fix --auto-commit` 自动修复 |
| 3 | [GitHub - Quriosity-agent articles pr-review-toolkit-en](https://github.com/Quriosity-agent/articles/blob/main/2026-02-22/pr-review-toolkit-en.md) | 6 个 specialized agents：code-reviewer / code-simplifier / comment-analyzer / pr-test-analyzer / silent-failure-hunter / type-design-analyzer |
| 4 | [gitautoreview - GitHub Code Review Best Practices 2026](https://gitautoreview.com/blog/github-code-review-best-practices-2026) | PR 200-400 行 defect detection 75%+，>1000 行降 70%；Google 9M 评审数据：review 质量随大小可预测下降 |
| 5 | [articles.firstaimovers - Codex GitHub Connector Automated PR Review](https://articles.firstaimovers.com/articles/codex-github-connector-automated-pr-review-2026/) | OpenAI Codex GitHub App + AGENTS.md 团队规则 + auto-fix 推送分支；OpenAI 内部 100% PR 审查用 |

**行动建议**: 周期 5+ 给项目接 CodeRabbit 或 Claude Code `/review`（自动 PR 评审）。**短期不实施**：本项目周期工作流是"AI Agent 自己提交 PR"，接外部 PR Review 反而是自我评审；可改为周期结束前跑一遍"自检脚本" + Claude Code review 当前 commit diff。

---

## 12. github actions cron windows 2026 — GH Actions 定时 Windows

**核心摘要**: 2026 GitHub Actions schedule 用 POSIX cron 语法（默认 UTC）；可加 IANA timezone；最小间隔 5 分钟；scheduled workflows 只在 default branch 跑；repository 不活动会禁用。Windows self-hosted runner 的 cron 不触发 ≠ runner 故障，是 GitHub 服务端未触发。

| # | 链接 | 一句话摘要 |
| - | ---- | ---------- |
| 1 | [GitHub - austenstone/schedule](https://github.com/austenstone/schedule) | Schedule Workflow Runs Action：基于 schedule event 轮询 GitHub variables；Node 24 runtime；macOS 13.4 不支持 |
| 2 | [GitHub Community Discussion 185024](https://github.com/orgs/community/discussions/185024) | Scheduled (cron) Actions 由 GitHub 服务端触发（不是 self-hosted runner）；常见原因：workflow 在 non-default branch / 仓库不活动 |
| 3 | [GitHub Docs - Workflow Syntax for GitHub Actions](https://docs.github.com/en/enterprise-cloud@latest/actions/reference/workflows-and-actions/workflow-syntax) | `on.schedule` POSIX cron 语法；可选 IANA timezone；默认 UTC；2026 GitHub Agentic Workflows 支持 fuzzy schedules |
| 4 | [CSDN - GitHub Actions 定时任务实战 GDOS 自动签到](https://blog.csdn.net/weixin_42567046/article/details/160133832) | cron 5 字段（分/时/日/月/周）；时区陷阱（UTC vs 北京）；`concurrency` 防任务重叠；Secrets 注入 `${{ secrets.NAME }}` |
| 5 | [GitHub - gh-aw Schedule Syntax](https://github.github.io/gh-aw/reference/schedule-syntax/) | Fuzzy Schedules（recommended）：自动散开执行时间避免 load spikes；fixed（cron）：特定时间但可能撞峰；`daily around 9am on weekdays` 人类可读 |

**行动建议**: 本项目当前无 GitHub Actions 配置。**周期 5+ 评估**给项目加 CI：每周日 02:00 UTC 自动跑全套 spec + checkpoint + probe（保证 main 分支健康）。与"商业化"绑一起做（GitHub Action 公开 badge 增加信任）。

---

## 调研 Top5（落到周期 5 upcoming-work）

| 排名 | 主题 | 行动 | 落点 |
| --- | ---- | ---- | ---- |
| 1 | **AI Agent 长期记忆（Mem0/Zep/EverOS）** | 周期 5+ 评估集成 Mem0（与"商业化"绑一起做，需 SQLite/Postgres 后端） | 升级 C3-B09 审计日志 → 长期记忆层 |
| 2 | **CesiumJS MCP 桥接** | 周期 5+ 评估把现有 `<tool>` 协议包装为 MCP Server + WebMCP browser bridge | 与 P2-8 AI Agent 工具协议统一（合并实施） |
| 3 | **Helmet 8.x Permissions-Policy 原生支持** | helmet 8.3 仍未原生支持；继续手写 20 项即可；周期 5+ 关注 helmet 9.x | 周期 4 P2-1 已升级 8.x |
| 4 | **OpenTelemetry Node SDK 完整接入** | 周期 5+ 安装 `@opentelemetry/sdk-node` + `@opentelemetry/auto-instrumentations-node` + OTLP exporter 上报 Jaeger/Tempo | 升级 P1-1 W3C traceparent 部分 → 完整 trace |
| 5 | **PR Review 自动化（CodeRabbit / Claude Code /review）** | 周期 5+ 在 PR 流程接 CodeRabbit 或 Claude Code `/review`（周期结束前自动评审本周期 commit） | 与自动周期绑一起做 |