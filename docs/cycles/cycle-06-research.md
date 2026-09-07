# Cycle 06 — Research（12 主题 × 5 链接 = 60 链接）

> **周期**: N=6
> **方法**: WebSearch 每主题取 5 条结果，附"一句话摘要 + 可落地行动建议"。
> **Top5**: 末尾追加到 `docs/release-notes/upcoming-work.md` 调研 Top5 段（覆盖周期 5 Top5）。

## 1. Cesium 2026 MCP tool

| 链接 | 一句话摘要 | 可落地行动 |
| ---- | ---- | ---- |
| [让 AI 用自然语言操控三维地球 – Cesium MCP 开源实践](https://blog.csdn.net/qq_40266212/article/details/159085390) | 2024 末 MCP 协议让 AI 标准化调用工具，cesium-mcp 暴露 19 个 Cesium 工具（相机/图层/3D Tiles/截图） | 周期 7+ 评估 cesium-mcp-bridge SDK 嵌入我们 Viewer（暴露 webmcp / MCP 双 transport） |
| [Cesium AI Integrations (CesiumGS 官方)](https://github.com/cesiumgs/cesium-ai-integrations) | 官方仓库 2026 deprecated：原 WebSocket 桥接 → **Built-in Viewer Tools + WebMCP**（浏览器原生 modelContext API） | 周期 7+ 跟进 cesiumjs-ai-starter-app（生产级 WebMCP 集成） |
| [Cesium MCP (nefmame fork, 58 tools)](https://github.com/nefmame/cesium-mcp) | 58 tools + 2 meta-tools（dynamic discovery），12 toolsets；支持 stdio + HTTP（streamable） | 周期 7+ 评估 bridge + runtime 包结构（cesium-mcp-contracts 共享层） |
| [cesium-mcp-runtime npm](https://www.npmjs.com/package/cesium-mcp-runtime) | 1.144.1（2026），MCP SDK v2，支持 2025-11-25 + 2026-07-28 协议；62 tools + 2 meta-tools | 周期 7+ 跑 `npx cesium-mcp-runtime` 验接入 Claude Desktop / Cursor |
| [cesium-mcp 官方文档](https://raw.githubusercontent.com/gaopengbin/cesium-mcp/HEAD/README.zh-CN.md) | 4 种接入：browser-agent / WebMCP / function calling / MCP runtime；bridge 协议无关 | 周期 7+ 优先 browser-agent（零后端，最简） |

## 2. Mapbox AI 2026

| 链接 | 一句话摘要 | 可落地行动 |
| ---- | ---- | ---- |
| [Mapbox Blog (2026-08)](https://www-production.mbxsandbox.com/blog) | Mapbox Location AI：给 AI agent 地理空间上下文（Grounding LLM） | 周期 7+ 评估 Mapbox Location AI（我们仍用 Mapbox token 给 Cesium） |
| [Mapbox 主站 (Location AI 入口)](https://www.mapbox.com/) | "Upgrade AI with location intelligence" — AI agent + Mapbox 平台集成 | 不动（我们用 Mapbox 仅供 token / 瓦片） |
| [Mapbox 矢量瓦片技术栈（CSDN 综述）](https://blog.csdn.net/weixin_27134495/article/details/160816942) | 矢量瓦片减少 85-90% 数据传输；Mapbox GL JS v3 已闭源，MapLibre 替代 | 不动（cesium 用 raster WMTS 即可） |
| [mapbox-style-patterns skill](https://skills.cat/skills/mapbox/mapbox-agent-skills/mapbox-style-patterns) | 5 个常用 style pattern：餐厅 / 房产 / 数据可视化 / 路线 / 暗色 | 不动（cesium 不用 Mapbox style） |
| [Mapbox Maps 2026 概览](https://www.mapbox.com/ja/maps) | 2026 机场室内地图 / 3D Lanes / 详细建筑外观 | 不动 |

## 3. GIS agent 2026

| 链接 | 一句话摘要 | 可落地行动 |
| ---- | ---- | ---- |
| [GIS Copilot (Penn State arXiv 2024)](https://arxiv.org/pdf/2411.03205v4) | 100+ GIS 任务评测；基本 / 中级任务成功率高，高级任务仍需用户引导 | 周期 7+ 调研 GIS Copilot 的"任务分级 + 反馈循环"模式 |
| [GISclaw (arXiv 2026)](https://arxiv.org/html/2603.26845v1) | 600 runs × 6 LLM × 2 architectures；Dual Agent 对强模型有损；96% task success | 周期 7+ 评估 Single Agent vs Dual Agent（强模型优先 Single） |
| [Esri "Next Era of AI and ArcGIS" (2026)](https://www.esri.com/about/newsroom/arcnews/the-next-era-of-ai-and-arcgis) | Esri 进入 agentic AI：内置地理空间 agent + ArcGIS Maps SDK for JS | 不动（我们不绑 ArcGIS） |
| [Autonomous GIS Data Retrieval Agent (PSU)](https://giscience.psu.edu/geospatial-data-retrieval-agent/) | LLM 自动选择数据源 + handbook 模式；80-90% 成功率 | 周期 7+ 评估"数据源 handbook"模式（client 端 GIS 资源目录） |
| [SuperMap AgentX Server](https://help.supermap.com/AgentXServer/zh/Introduction/Introduction.htm) | 300+ GIS MCP 工具；工作流 + 自主规划 + 循环推理三种 agent 形态 | 周期 7+ 参考其"工具 → 工作流 → 自主 agent"分层架构 |

## 4. React 19 best practices 2026

| 链接 | 一句话摘要 | 可落地行动 |
| ---- | ---- | ---- |
| [React 官方 Server Components](https://react.dev/reference/rsc/server-components) | RSC 19 稳定；异步组件可 await；零客户端 bundle | 不动（我们是 SPA + Vite，暂不引入 RSC） |
| [React 19 Interview Q&A 2026](https://github.com/Devinterview-io/react-interview-questions) | `use()` hook + automatic transitions + Server Components + TypeScript 默认 | 不动 |
| [React 19 Best Practices skill (LobeHub)](https://lobehub.com/skills/comeonoliver-skillshub-react) | 41 条规则：Concurrent (6) / RSC (6) / Actions (5) / Data Fetching (5) / State (5) / Memo (5) / Effects (5) / Patterns (4) | 不动（我们 React 18） |
| [React Server Components 实战 PDF](https://www.theproblemsolver.dev/docs/react-advanced-2024.pdf) | RSC 异步传输 + Suspense + Streaming；Next.js App Router 是生产级 | 不动 |
| [2026 全栈前端 RSC + 边缘函数 + AI Agent](https://blog.csdn.net/2303_76234920/article/details/159579944) | RSC 5 年后稳定，bundle -218KB，TTI 4.2s → 2.5s | 不动（我们 React 18） |

## 5. SQLite performance tuning 2026

| 链接 | 一句话摘要 | 可落地行动 |
| ---- | ---- | ---- |
| [SQLite PRAGMA & Tuning (ChristopherDavenport)](https://github.com/christopherdavenport/christopherdavenport-marketplace/blob/main/backend/sqlite/skills/sqlite/references/pragmas-and-tuning.md) | 每连接必设：WAL / synchronous=NORMAL / foreign_keys=ON / busy_timeout / cache_size / temp_store / mmap_size | 周期 7+ 若我们引 SQLite（用户偏好 / agent 记忆）按此 PRAGMA 调优 |
| [SQLite 性能优化配置（CSDN 综述）](https://blog.csdn.net/horses/article/details/119817925) | 4 招：WAL / synchronous=NORMAL / temp_store=memory / mmap_size=30GB | 周期 7+ 复用 |
| [SQLite PRAGMA tuning (selfdrivingwiki #519)](https://github.com/tqbf/selfdrivingwiki/issues/519) | 4 个 PRAGMA 必加到 read-write + read-only init；NORMAL in WAL 是安全的 | 周期 7+ 复用 |
| [10 Essential SQLite Optimization Tips 2026](https://linuxvox.com/blog/tips-for-optimizing-an-sqlite-database-with-over-a-gig-of-data-in-it/) | 索引 + PRAGMA + EXPLAIN + VACUUM/ANALYZE + WAL + 文件系统 + 批量写 + LIMIT + 数据类型 + 监控 | 周期 7+ 复用 |
| [Memory-mapped I/O for Android SQLite (Jun 2026)](https://mvpfactory.io/blog/memory-mapped-i-o-for-android-sqlite-using-mmap-wal2-and-the-access-pattern) | mmap 仅作用于主 DB 文件（WAL 走标准 IO）；32-bit 进程地址空间风险 | 周期 7+ 注意服务端 Node.js 是 64-bit，无此风险 |

## 6. MiniMax M3 features 2026

| 链接 | 一句话摘要 | 可落地行动 |
| ---- | ---- | ---- |
| [MiniMax M3 发布博客 (2026-06-01)](https://www.minimaxi.com/blog/minimax-m3) | 1M 上下文 + MSA 稀疏注意力（1/20 计算量）+ 原生多模态（图文视频）+ Coding/Agent 前沿 | 我们固定用 M3；启用 thinking 模式做周期 Agent 长程任务 |
| [MiniMax M3 模型页 (English)](https://minimax-m2.com/minimax-m3) | Anthropic + OpenAI 兼容双端点；thinking 三模式（enabled/adaptive/disabled） | 我们用 Anthropic 兼容端点（默认） |
| [MiniMax Text Generation 文档](https://platform.minimax.io/docs/guides/text-generation) | 1M context, multimodal, agentic, tool use, M3 是最新旗舰 | 不动（已用） |
| [MiniMax-M3 GitHub](https://github.com/MiniMax-AI/MiniMax-M3) | 428B params, 23B activated; MSA 9x prefill / 15x decode | 周期 7+ 关注 MSA 在长程 agent 任务的 benchmark |
| [SiliconFlow: M3 上线 (2026-06-02)](https://www.siliconflow.com/blog/minimax-m3-now-on-siliconflow-frontier-coding-1m-context-and-native-multimodality) | BrowseComp 83.5（SOTA）；SWE-Bench Pro 击败 GPT-5.5 / Gemini 3.1 Pro | 不动（我们用 MiniMax 官方） |

## 7. Open code review architecture 2026

| 链接 | 一句话摘要 | 可落地行动 |
| ---- | ---- | ---- |
| [open-code-review (pubgo fork)](https://github.com/pubgo/open-code-review) | 阿里开源 "确定性工程 + LLM Agent" 混合架构：工程保证"不遗漏/位置准"，Agent 保证"看得懂/说得清" | 周期 7+ 评估接入 `npx @alibaba-group/open-code-review` 做 PR 自动化 review |
| [opencode-review (cedricwider)](https://github.com/cedricwider/opencode-review) | OpenCode 多 agent 配置：orchestrator + 5 specialist fan-out（design / solid / security / consistency / testing） | 周期 7+ 评估 OpenCode + agent 多专家 review |
| [阿里 open-code-review 解读 (cnblogs)](https://www.cnblogs.com/12lisu/p/22868077) | 行级精度；NPE / 线程安全 / XSS / SQL 注入确定性规则；位置准确率行级 | 周期 7+ 复用其"行级精度"思路到我们 AI cycle 自我 review |
| [chethanuk/open-code-review fork](https://github.com/chethanuk/open-code-review) | 643 commits；Claude Code / Codex plugin 集成 | 周期 7+ 跑 npx skills 集成到我们的 `feat/auto-cycle` |
| [OpenCodeReview 主页 (agentconn)](https://agentconn.com/agents/open-code-review/) | 200 真实 PR benchmark，Apache 2.0；Java 规则最强，LLM 覆盖其他语言 | 不动 |

## 8. React error boundary 2026

| 链接 | 一句话摘要 | 可落地行动 |
| ---- | ---- | ---- |
| [Suspense + Error Boundaries: Debug 实践 (dev.to)](https://dev.to/mspk97/react-suspense-and-error-boundaries-how-they-interact-and-how-to-debug-failures-4i1e) | Suspense 在外 / ErrorBoundary 在内；两阶段（render vs commit）易冲突 | 周期 7+ client 端：Cesium Viewer 加载包 ErrorBoundary（白屏兜底） |
| [React 官方 error-boundaries lint](https://react.dev/reference/eslint-plugin-react-hooks/lints/error-boundaries) | try/catch 抓不到 render 错误；只有 ErrorBoundary 能抓 | 周期 7+ 给 client 加 eslint-plugin-react-hooks 配置 |
| [Suspense Not Triggering Fix 2026](https://www.fixdevs.com/blog/react-suspense-not-triggering/) | `use()` hook (React 19) 替代 `React.lazy`；ErrorBoundary + Suspense 嵌套顺序 | 周期 7+ 改用 `use()` 做 client data fetching |
| [React Suspense for Data Fetching 2026](https://jsmanifest.com/react-suspense-data-fetching-2026) | wrapPromise + throw promise；删 useEffect + loading state | 周期 7+ 试 wrapPromise 做 AI chat 流式（pending 状态） |
| [React Suspense + ErrorBoundary 实战 (Korean, 2026-04)](https://blog.story-dict.com/posts/ai/2026-04-12-react-suspense-errorboundary-robust-smooth-ui) | Suspense 异步数据 + ErrorBoundary 错误隔离；保持 UI 健壮 | 周期 7+ 复用到 client 聊天界面 |

## 9. GIS open source cesium alternative

| 链接 | 一句话摘要 | 可落地行动 |
| ---- | ---- | ---- |
| [GIS 前端 2026 全景 (osgeo.cn)](https://osgeo.cn/post/1cca5/) | WebGPU 全面替代 WebGL；CesiumJS v3 默认 WebGPU；3D Tiles 2.0 定稿（支持 3D 高斯泼溅） | 周期 7+ 评估 CesiumJS WebGPU pipeline 升级（帧率 3-6x） |
| [MapLibre GL JS](https://maplibre.org/projects/gl-js/) | Mapbox GL JS 开源分支；社区驱动；GPU 加速 + WebGPU 即将 | 周期 7+ 评估 MapLibre 替代 Mapbox（成本） |
| [deck.gl 9.x 文档](https://deck.gl/docs) | WebGL/WebGPU2 高性能大数据可视化；MapLibre / Google Maps / ArcGIS 集成 | 周期 7+ 评估 deck.gl 替代部分 Cesium layer（聚合热力） |
| [Using deck.gl with a Base Map](https://github.com/dick-lam-lscm/deck.gl/blob/master/docs/get-started/using-with-map.md) | Mapbox GL JS / MapLibre 都是 deck.gl 兼容底图 | 不动（Cesium 已够用） |
| [Geospatial Stack 2026 完整指南 (youngju.dev)](https://www.youngju.dev/blog/culture/2026-05-16-geospatial-stack-2026-postgis-maplibre-mapbox-deckgl-kepler-protomaps-overture-h3-deep-dive.ja) | 6 层：Data Source / Tile Format / Tile Server / Renderer / Spatial DB / Service | 周期 7+ 整体栈评估（我们用 CesiumJS + Mapbox 瓦片 + turf.js） |

## 10. AI agent memory system 2026

| 链接 | 一句话摘要 | 可落地行动 |
| ---- | ---- | ---- |
| [State of AI Agent Memory 2026 (mem0)](https://mem0.ai/blog/state-of-ai-agent-memory-2026) | LoCoMo 92.5 / LongMemEval 94.4；92.5% 阈值；21 frameworks + 20 vector stores 集成 | 周期 7+ 评估 mem0（自托管 OpenMemory）做 agent 记忆 |
| [Mem0 / Zep / LangMem 实战对比 (juejin)](https://juejin.cn/post/7649582093870678052) | Mem0 自动提取 + 多信号检索；Zep 时间知识图谱；LangMem 适合 LangGraph | 周期 7+ 选 mem0（生态最大）或自研（in-context） |
| [Best AI Agent Memory Systems 2026 (memnexus)](https://memnexus.ai/blog/2026-07-23-best-ai-agent-memory-systems) | 9 系统对比：Mem0 / Hindsight / Letta / Zep / Cognee / Supermemory / LangMem | 周期 7+ 若选 mem0 / Letta 二选一 |
| [Graph-Based Memory Solutions 2026 (mem0)](https://mem0.ai/blog/graph-memory-solutions-ai-agents) | 5 系统对比：Mem0 / Cognee / Zep / Letta / MemGPT；向量+图混合 | 周期 7+ Graph memory 评估 |
| [Cognee Best AI Memory 2026](https://www.cognee.ai/blog/guides/best-ai-memory-layers-for-ai-agents-in-2026-comparison) | Cognee：图原生 + ECL pipeline + 多源 ingest（38+ 源） | 周期 7+ Cognee 适合企业知识图谱 |

## 11. PR review automation AI 2026

| 链接 | 一句话摘要 | 可落地行动 |
| ---- | ---- | ---- |
| [pr-ai-review-bot (mopemope)](https://github.com/mopemope/pr-ai-review-bot) | GitHub Action：自动 review + release notes 生成；99 commits | 周期 7+ 评估 `pr-ai-review-bot` 接 `feat/auto-cycle` |
| [AI-Powered PR Bot (Marketplace)](https://github.com/marketplace/actions/ai-powered-pr-bot) | Claude AI 驱动的 PR review / auto-approval；mod PR-Agent | 周期 7+ 评估 Claude 版 |
| [PR Code Review (MichaelFu1998-create)](https://github.com/marketplace/actions/pr-code-review) | Agentic LLM review + 12 read-only tools + SARIF output + 建议应用按钮 | 周期 7+ 评估 agent 模式（vs deterministic） |
| [ai-code-review-bot (GitHub Models + Azure AI)](https://github.com/gaetanovespero81/ai-code-review-bot) | GitHub Models + `openai/gpt-4o-mini` 跑 PR diff → 写 PR comment + artifact | 周期 7+ 复用其 GitHub Models 路径（成本低） |
| [GitHub Actions + Claude Code 自动 review (2026-07)](https://blog.csdn.net/pulong0748/article/details/163132654) | Claude Code GitHub Action：定位为"第一道防线"（不是自动审批）；权限最小化 | 周期 7+ 接入 claude-code-action @v1 |

## 12. GitHub actions cron windows 2026

| 链接 | 一句话摘要 | 可落地行动 |
| ---- | ---- | ----|
| [Schedule Workflow Action (austenstone)](https://github.com/marketplace/actions/schedule-workflow) | 自托管定时任务调度：每小时 poll GitHub Variables；Node 24 推荐 | 周期 7+ 评估（季度 metadata IP 同步 cron） |
| [GitHub / GitLab Actions cron 格式](https://blog.csdn.net/Ximerr/article/details/123501772) | 5 字段 cron，UTC（无时区），5 分钟最小间隔 | 不动（我们 cron 用法简单） |
| [Schedule Syntax (GitHub Agentic Workflows)](https://github.github.io/gh-aw/reference/schedule-syntax/) | Fuzzy schedules（推荐，自动 scatter 时间）+ fixed cron；防服务器峰值 | 周期 7+ 用 fuzzy（`daily on weekdays`） |
| [GitHub Actions 官方 workflow 语法](https://docs.github.com/en/enterprise-cloud@latest/actions/reference/workflows-and-actions/workflow-syntax) | `on.schedule` + POSIX cron + IANA timezone（v2024+） + UTC 默认 | 不动（已用 cron） |
| [GitHub Actions Cron 5 大陷阱 (cronbuilder.dev)](https://cronbuilder.dev/blog/github-actions-cron-schedule.html) | UTC only / 5 min min / 延迟执行 / 仓库 60 天不活跃 throttle / DOM+DOW 同用 bug | 周期 7+ 注意"60 天不活跃 throttle"（cron 自动停） |

## 调研 Top5（覆盖周期 5 Top5）

| 排名 | 主题 | 行动 | 落点 |
| --- | ---- | ---- | ---- |
| 1 | **Cesium MCP / WebMCP**（4 种接入：browser-agent / WebMCP / function calling / runtime） | 周期 7+ 评估 `cesium-mcp-bridge` 嵌入 Viewer（**优先 browser-agent 模式** — 零后端、3 分钟跑起来） | 升级 P1-1 / P2-3 续 |
| 2 | **OTel 完整接入** | 周期 5 P1-1 已自研 MetricsRegistry + /api/metrics；周期 7+ 评估 OTLP HTTP exporter → 接 Jaeger / Tempo（**与"商业化"绑一起做**） | 升级 P1-1 |
| 3 | **沙箱 isolated-vm / heap snapshot** | 周期 5 P1-2 完成 worker CPU watchdog + v8 heap snapshot；周期 7+ 评估 `isolated-vm`（高安全要求，**node-gyp 编译**，先 fallback） | 升级 P1-2 |
| 4 | **pako DecompressionStream polyfill** | 周期 6 P1-3 已实施；周期 7+ 评估 fflate（更小，~5KB）作为替代（pako 45KB） | 升级 P1-3 |
| 5 | **AI Agent 长期记忆** | 周期 7+ 评估 **mem0**（自托管 OpenMemory；61.6k stars；92.5/94.4 benchmark）；先做 prototype 验证 ALS+SQLite 自研，再决定是否引入依赖 | 新增 P0-1 |
