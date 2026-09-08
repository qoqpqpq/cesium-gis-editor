# Cycle 10 — Research（调研）

> **周期**: N=10（2026-09-08）
> **范围**: 12 个主题 × 5 条链接 = **60 链接**
> **格式**: 主题 → 一句话摘要 → 行动建议
> **原则**: 聚焦 2026 年最新资料；优先落地动作（skip / defer / upgrade）

---

## 1. pgvector 性能调优（HNSW vs IVFFlat + m/ef_construction）

### 1.1 [pgvector 生产调优指南 (dibi8.com 2026)](https://www.dibi8.com/blog/2026/08/22/pgvector-production-tuning-guide)
一句话：47s 全表扫降到 3ms（pgvector 0.7 + HNSW m=32 / ef_construction=200 / ef_search=80 + parallel workers=4 + maintenance_work_mem=2GB）。
行动：**周期 10 P0-1 已落** —— mem0-postgres 评估采用 HNSW 而非 IVFFlat；不立即上 docker，先 prototype。

### 1.2 [HNSW vs IVFFlat 选型 (toolchew 2026)](https://www.toolchew.com/post/hnsw-vs-ivfflat-pgvector-pick)
一句话：HNSW 召回率 95%+，构建慢内存大；IVFFlat 召回率 80-90%，构建快内存小；100 万向量以下 HNSW 是默认选择。
行动：< 1M 向量走 HNSW；> 1M 走 IVFFlat 或量化（BQ）；本项目 prototype <10K → HNSW 即可。

### 1.3 [AWS Aurora HNSW + Binary Quantization 性能 (AWS BigBlog 2026)](https://aws.amazon.com/blogs/bigdata/aurora-pgvector-bq-throughput/)
一句话：HNSW + BQ 1.8 倍吞吐（38GB 内存 vs 367GB 原始向量），召回率 95%；适合 1 亿级向量场景。
行动：监控 BQ 进展；本项目 < 10K 不需要 BQ；保留升级路径。

### 1.4 [pgvector 0.8 限制 (postgres.ai)](https://postgres.ai/blog/2026/06/pgvector-0-8-limits)
一句话：pgvector 0.8 仍不支持并行构建索引；HNSW 在 1 亿级向量上有 memory leak（memory context 不能 release）。
行动：production 用 pgvector < 0.8 稳定版 + 监控 pgbouncer memory；本项目 prototype 仅 <10K，无该问题。

### 1.5 [pgvector 索引维护 (Crunchy Data)](https://www.crunchydata.com/blog/postgresql-pgvector-index-maintenance)
一句话：`REINDEX INDEX CONCURRENTLY` 必须并行；`VACUUM` 自动清理 dead tuples；定期 `ANALYZE` 更新统计。
行动：prototype 不需要 cron；周期 11+ 写 `scripts/reindex-pgvector-cron.cjs`。

---

## 2. Node.js worker_threads pool（Piscina / 自研 / 共享）

### 2.1 [Piscina 2026 生产指南 (hirenodejs.com)](https://www.hirenodejs.com/blog/2026/piscina-production-pool)
一句话：Piscina 默认 minThreads=CPU 数 / 2 / maxThreads=CPU 数；warm-up 100ms 比 cold-start 800ms 快 8 倍；AbortController + AbortSignal 取消长任务。
行动：**周期 10 P1-3 已落自研 pool** —— 默认 size=4；Piscina 评估周期 11+（独立 package，多一个依赖）。

### 2.2 [Node worker_threads 深度指南 (dev.to)](https://dev.to/cgrandval/the-deep-dive-into-nodejs-worker-threads-in-2026-3jp0)
一句话：每个 worker 独立 V8 isolate（独立 GC / 独立 heap）；sharedArrayBuffer 共享内存零拷贝；Atomics.wait 高效同步。
行动：周期 10 自研 pool 用 worker_threads + 独立 isolate；不共享堆内存（简化沙箱隔离）。

### 2.3 [worker pool + AbortSignal (teachmeidea)](https://www.teachmeidea.com/post/nodejs-worker-pool-abort-signal-2026)
一句话：AbortSignal + AbortController 取消 worker 长任务（CPU watchdog 配合）；超时不只是 kill，还需回收 isolate。
行动：周期 10 自研 pool 支持 `acquire({signal})`；超时信号触发 `worker.terminate()` + remove from idle。

### 2.4 [worker pool LRU 实践 (bahmutov/cypress blog)](https://www.cypress.io/blog/2026/03/worker-pool-lru-reuse)
一句话：LRU reuse > cold start 6x；maxIdleMs=60000 自动驱逐；monitor `totalCreated - totalReused` 比值。
行动：**周期 10 P1-3 已落** —— LRU shift/push + idle timer WeakMap + 60s 自动 drain。

### 2.5 [Node 22 worker_threads memory bug (nodejs/issues/53214)](https://github.com/nodejs/node/issues/53214)
一句话：Node 22.0-22.5 worker.terminate 后 8KB/次内存 leak；22.6+ 已修；建议 Node 22 LTS。
行动：本项目 Node 22.6+；spec 检查 process.version。

---

## 3. OpenTelemetry 客户端侧埋点（browser SDK + collector）

### 3.1 [OpenTelemetry Web SDK 指南 (opentelemetry.io 2026)](https://opentelemetry.io/docs/languages/js/getting-started/browser/)
一句话：@opentelemetry/sdk-web 自动捕获 fetch / XHR / user-interaction；OTLP exporter 走 `/v1/traces`；B3 / W3C tracecontext 双支持。
行动：周期 11+ 评估 OTEL SDK 替换自研 MetricsRegistry；周期 10 P1-2 自研 collector 走 `/api/telemetry` 端点。

### 3.2 [OTel Collector 模式 agent vs gateway (signoz.io)](https://signoz.io/blog/opentelemetry-collector-agent-vs-gateway-pattern/)
一句话：agent 模式 sidecar（每应用一份，资源少）；gateway 模式集中（HA + 过滤）；生产推荐 hybrid。
行动：本项目单实例，agent 模式足够；周期 11+ 集群时升级 gateway。

### 3.3 [ClickHouse OTel 50M events/sec (clickhouse.com 2026)](https://clickhouse.com/blog/otel-50m-events-per-second)
一句话：OTel Collector 用 `file_storage` WAL extension（S3 后端）落 ClickHouse；50M events/sec @ 32 节点；wal truncate 防膨胀。
行动：本项目自研 sliding buffer 1000 items / 1h TTL；生产 OTel collector 周期 12+ 评估。

### 3.4 [navigator.sendBeacon for OTel export (Honeycomb)](https://www.honeycomb.io/blog/send-beacon-opentelemetry-exporter)
一句话：`navigator.sendBeacon` 95% 投递（page unload 时不丢）；64KB 硬限；Blob `application/json` 不触发 preflight。
行动：**周期 10 P1-2 已落** —— asyncGuard 上报走 sendBeacon（content-type text/plain 简化 CORS）。

### 3.5 [OTel browser resource detection (opentelemetry-js)](https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/opentelemetry-browser-detector)
一句话：`Resource.detect()` 自动读 navigator / screen / location；可注入 userId / sessionId 维度。
行动：周期 11+ 评估 OTel SDK 接入；周期 10 自研 telemetryCollector 暂手动注入 clientError 维度。

---

## 4. Cesium 3D Tiles 2.0 + Gaussian Splatting

### 4.1 [Cesium 3D Gaussian Splats LOD 2026 (cesium.com blog)](https://cesium.com/blog/2026/04/27/3d-gaussian-splats-lod/)
一句话：Hierarchical 3D Gaussian Splatting LOD —— 多分辨率 splat trees + 视锥体驱动的 tile streaming；KHR_gaussian_splatting extension 草案 OGC 2026-Q3。
行动：**周期 10 P2-1 已落** —— 评估文档（决定不切换 backend）；周期 11+ 跟踪 KHR 标准化。

### 4.2 [Khronos KHR_gaussian_splatting 标准化 (radiancefields.com 2026-Q2)](https://radiancefields.com/news/2026/khr-gaussian-splatting-ratified)
一句话：Khronos 2026-Q2 批准 glTF 2.1 KHR_gaussian_splatting extension；3D Tiles 2.0 将其纳入 standard 扩展。
行动：关注 Cesium ion 适配进度；本项目 prototype <1M splats 不切 3D Tiles 2.0。

### 4.3 [State of Gaussian Splatting 2026 (thefuture3d.com)](https://www.thefuture3d.com/blog/state-of-gaussian-splatting-2026)
一句话：OGC 3D Tiles 2.0 community standard 进程（2026 Q3 进入 candidate）；CesiumJS v2 WebGPU backend experimental。
行动：周期 11+ 评估 WebGPU backend；周期 12+ 评估 KHR_gaussian_splatting。

### 4.4 [Cesium 2026 GEOINT (cesium.com 2026-04)](https://cesium.com/blog/2026/04/20/geoint-2026/)
一句话：Cesium 2026 主推 3D Tiles 2.0 + Gaussian Splatting + LLM + MCP 整合；GEOINT 重点 mission-ready 3D geospatial data。
行动：监控 Cesium ion 是否提供 splat 服务；本项目 prototype 用本地 splat 文件。

### 4.5 [WebGPU caniuse (caniuse.com 2026)](https://caniuse.com/webgpu)
一句话：Chrome / Edge 113+（2026-04 全量），Safari 18+（2026-09），Firefox 130+（2026-08）；全球覆盖率 ~73%。
行动：**周期 10 P2-1 已落** —— WebGPU 覆盖率 < 80% 暂不切换；cesiumJS v2 仍需 fallback 到 WebGL2。

---

## 5. mem0 架构（semantic + episodic + procedural）

### 5.1 [mem0 State of AI Memory 2026 (mem0.ai)](https://mem0.ai/blog/state-of-ai-memory-2026)
一句话：mem0 4 层记忆（working / episodic / semantic / procedural）；LoCoMo 92.5 / LongMemEval 94.4；6900 tokens/query 成本控制。
行动：**周期 10 P0-2 已落** —— 本项目评估分层设计；不直接切 mem0（成本 + 复杂度）。

### 5.2 [MemMachine (arxiv 2604.04853)](https://arxiv.org/pdf/2604.04853)
一句话：MemVerge 2026-03 paper —— short-term + long-term episodic + profile memory 三层；ground-truth preserving（保留原始 episodic）；80% fewer tokens vs Mem0。
行动：参考其 "ground-truth preservation" 设计；本项目 memory.js FTS5 即是 episodic layer 雏形。

### 5.3 [CoALA 框架 (arXiv:2309.02427)](https://arxiv.org/abs/2309.02427)
一句话：Princeton 2023 论文 —— Cognitive Architectures for Language Agents；episodic / semantic / procedural 标准化分类。
行动：**周期 10 P0-2 已落** —— 评估文档严格按 CoALA 3 层定义；与 FTS5 WAL 兼容。

### 5.4 [Hierarchical Memory Systems for Agents (github Suchi-BITS)](https://github.com/Suchi-BITS/Hierarchical-Memory-Systems-for-Agents)
一句话：production-grade 多层记忆（working / episodic / semantic / procedural）；LangGraph + LLM + vector DB；完整 test suite。
行动：参考其分层数据模型（`memory.py`）；本项目周期 11+ 评估轻量版分层存储。

### 5.5 [OpenMemory 7-layer cognitive memory (github peter-j-thompson)](https://github.com/peter-j-thompson/openmemory)
一句话：7 层认知记忆（sensory / semantic / episodic / identity / relational）；AGE + pgvector；sleep-cycle 巩固。
行动：监控 sleep-cycle 概念；本项目不引入；周期 11+ 评估 episodic 巩固（`optimize(0x02)` 已落）。

---

## 6. navigator.sendBeacon vs fetch keepalive

### 6.1 [sendBeacon vs fetch keepalive 投递率 (CSDN 2026)](https://blog.csdn.net/qq_40266212/article/details/158351132)
一句话：sendBeacon 95.8% 投递 / fetch keepalive 84.9%；64KB 硬限；Blob JSON 触发 preflight。
行动：**周期 10 P1-2 已落** —— 默认 sendBeacon + fetch keepalive 兜底。

### 6.2 [fetchLater() Chrome 121+ (webperfclinic.com)](https://webperfclinic.com/articles/fetch-later-api-chrome-121)
一句话：`fetchLater()` Chrome 121+ stable（2025-01）；page unload 后延迟发送；不受 64KB 限制；返回 `AbortController`。
行动：监控 fetchLater 浏览器渗透率；周期 12+ 评估替换 sendBeacon（当前覆盖率不够）。

### 6.3 [clicky.com 切 fetch keepalive 后 (clicky.com blog)](https://clicky.com/blog/2026/switched-to-fetch-keepalive)
一句话：clicky.com 2026-03 弃 sendBeacon 切 fetch keepalive —— keepalive POST + Retry-After + 后端去重；reason: sendBeacon 无法观测失败。
行动：本项目 sendBeacon 仅 client-error 日志；后端 sliding buffer 自动去重；周期 11+ 评估切换。

### 6.4 [sendBeacon CORS preflight (developer.mozilla.org)](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon)
一句话：sendBeacon + `Blob({type: 'application/json'})` 触发 preflight；`text/plain` 不触发但服务端需手动 JSON.parse。
行动：**周期 10 P1-2 已落** —— telemetry route 接 `text/plain` 内容；后端 `JSON.parse(body)`；CORS 无 preflight。

### 6.5 [page unload analytics 模式 (perfplanet.com 2026)](https://perfplanet.com/2026/page-unload-analytics/)
一句话：page unload 4 策略 —— sendBeacon / fetch keepalive / visibilitychange / periodic timer；组合使用覆盖率 99%+。
行动：本项目组合 sendBeacon + visibilitychange；周期 11+ 加 periodic timer 兜底。

---

## 7. GitHub Actions claude-code-action 多 agent fan-out

### 7.1 [multi-agent GitHub Actions 实战 (venkatapgummadi 2026)](https://www.venkatapgummadi.com/blog/2026/github-actions-multi-agent-pr-review)
一句话：90% first-try 通过率；fan-out pattern（baseline + security + design 三 job 并行）；concurrency group cancel-in-progress。
行动：**周期 10 P1-1 已落** —— 3 specialist job + concurrency cancel-in-progress + system-prompt 区分。

### 7.2 [4 work-modes + GitHub Actions (baeseokjae 2026)](https://www.baeseokjae.com/notes/2026/github-actions-claude-code-multi-mode)
一句话：claude-code-action 支持 4 mode —— agent / code / review / plan；GitHub Actions 适合 agent + review（短任务）；plan 留给本地。
行动：**周期 10 P1-1 已落** —— 三个 job 都用 `--max-turns 3`（短任务），不用 plan mode（本地 IDE 专属）。

### 7.3 [fork agents + worktree 隔离 (Kirchlive blog 2026)](https://kirchlive.com/blog/2026/fork-agents-worktree)
一句话：`--worktree` 隔离每个 agent 修改；`--no-verify` 跳过本地 hook；fork 模式只读，适合 review。
行动：周期 10 PR review 不改代码，纯 review 模式（不需 worktree）；周期 11+ 自动修复 PR 用 worktree。

### 7.4 [claude-code-action v1 README (github anthropics)](https://github.com/anthropics/claude-code-action)
一句话：v1 stable（2026-04）；支持 anthropic_base_url 自定义 MiniMax / 自定义 model；`--allowedTools` 限制工具调用。
行动：**周期 10 P1-1 已落** —— `--allowedTools "Bash,Read,Grep,Glob"` + `--model MiniMax-M3` + `anthropic_base_url` 环境变量。

### 7.5 [GitHub Actions concurrency 取消策略 (docs.github.com)](https://docs.github.com/en/actions/using-jobs/using-concurrency)
一句话：`concurrency: group: ${{ github.workflow }}-${{ github.event.pull_request.number }}, cancel-in-progress: true`；自动取消旧 push 触发的 review。
行动：**周期 10 P1-1 已落** —— group 含 PR number 避免并发 cancel；cancel-in-progress 节约 token。

---

## 8. helmet 8.x Permissions-Policy 现状

### 8.1 [helmet npm 8.3.0 release notes](https://www.npmjs.com/package/helmet/v/8.3.0)
一句话：helmet 8.x 仍输出 `feature-policy`（deprecated by W3C）；**不输出** `permissions-policy` header（与 Permissions-Policy spec 不兼容）。
行动：**周期 9 P2-2 已落自研 middleware** —— server/middleware/permissionsPolicy.js 20 默认策略；helmet 8.x 替代方案。

### 8.2 [helmet 8.x Permissions-Policy 不输出 issue (helmetjs/helmet#557)](https://github.com/helmetjs/helmet/issues/557)
一句话：open issue；helmet team 明确"Permissions-Policy 是新增 header，与 feature-policy 不同"，未列入 roadmap。
行动：监控 helmet 9.x；周期 11+ 重评估自研 middleware 是否仍需保留。

### 8.3 [10 分钟搞定 helmet 安全 header (CSDN 2026)](https://blog.csdn.net/qq_40266212/article/details/162899163)
一句话：helmet 7 大核心 header —— X-Frame-Options / X-Content-Type-Options / Strict-Transport-Security / Referrer-Policy / X-DNS-Prefetch-Control / X-Download-Options / X-Permitted-Cross-Domain-Policies。
行动：本项目周期 4/5 已落 helmet 7 项 + 自研 Permissions-Policy；持续监控 helmet 9.x。

### 8.4 [W3C Permissions-Policy spec 2026](https://www.w3.org/TR/permissions-policy/)
一句话：W3C 2026-08 候选推荐；与 feature-policy 不兼容；`Permissions-Policy: camera=(), microphone=(self), geolocation=(self)`。
行动：自研 middleware 输出格式严格按 W3C 草案；spec 验证 20 默认策略。

### 8.5 [浏览器 Permissions-Policy 默认值 (chromestatus.com)](https://chromestatus.com/feature/5660081973575680)
一句话：Chrome 88+ 默认禁止 camera / microphone / geolocation 等高权限 feature；本项目 GIS viewer 不需要这些，策略宽松即可。
行动：自研 middleware 默认值 = W3C 推荐（极宽松）；业务按需收紧。

---

## 9. cesium 2026 MCP server 集成 + browser-agent

### 9.1 [Cesium MCP 开源实践 (CSDN 2026-03)](https://blog.csdn.net/qq_40266212/article/details/159085390)
一句话：cesium-mcp 把 CesiumJS 能力通过 MCP 协议暴露；19 个工具覆盖相机 / 图层 / 3D Tiles / 动画 / 截图；3 分钟跑通。
行动：**周期 9 P1-1 已落** —— mcpManifest.js 暴露 5 核心 GIS 工具；周期 10+ 扩展更多工具（参考 cesium-mcp 19 个）。

### 9.2 [CesiumGS/cesium-ai-integrations (deprecated → starter-app)](https://github.com/cesiumgs/cesium-ai-integrations)
一句话：原仓库 deprecated；推荐 cesiumjs-ai-starter-app（AI SDK tools + 内置聊天 UI + WebMCP via `document.modelContext`）。
行动：**跳过** —— 直接迁 starter-app 不现实；保留 P1-1 内部 manifest；周期 12+ 评估 WebMCP。

### 9.3 [cesium-mcp-runtime v1.145.1 (npm 2026-09)](https://npm.io/package/cesium-mcp-runtime)
一句话：MCP SDK v2 stable；支持 MCP `2025-11-25` 和 `2026-07-28`；62 Cesium 工具 + 2 discovery meta-tools；HTTP / stdio 双模式。
行动：监控 SDK v2 兼容性；周期 12+ 评估 HTTP 模式接入（云端 agent 友好）。

### 9.4 [Cesium GEOINT 2026 (cesium.com blog 2026-04)](https://cesium.com/blog/2026/04/20/geoint-2026/)
一句话：Cesium 主推 3D Tiles 2.0 + Gaussian Splatting + LLM + MCP 整合；GEOINT mission-ready 3D geospatial。
行动：监控 Cesium ion 是否提供 MCP 服务；周期 11+ 评估 cesiumjs-ai-starter-app 集成。

### 9.5 [cesium-mcp 120 commits v1.143+ (github nefmame)](https://github.com/nefmame/cesium-mcp)
一句话：fork from gaopengbin/cesium-mcp；12 类工具（entity / animation / tiles / trajectory / view / layer / interaction）；Ion asset ID 支持。
行动：**周期 9 P1-1 已落** —— 5 核心 GIS 工具（飞行 / 标注 / 截图 / 3D Tiles / layer）；周期 11+ 评估 trajectory / animation 扩展。

---

## 10. mapbox 2026 AI / Location AI

### 10.1 [Mapbox Location AI 主页 (mapbox.com)](https://www.mapbox.com/location-ai)
一句话：Mapbox 2026 主推 Location AI（给 AI Agent 地理上下文）；MCP server + DevKit MCP + Agent skills + MapGPT 4 产品矩阵。
行动：**监控** —— Mapbox AI 方向确认；本项目用 CesiumJS 不切 Mapbox GL；仅参考其 MCP server API 设计。

### 10.2 [Build geospatial AI with Mapbox (mapbox.com/location-ai/build)](https://www.mapbox.com/location-ai/build)
一句话：partner program + structured plan + 真实地图数据；可定制 conversational map / 旅行助手 / 空间决策。
行动：**跳过** —— 本项目自研 Viewer；不依赖 Mapbox；周期 11+ 评估 Mapbox hosted MCP 远程接入。

### 10.3 [Mapbox MCP server (github mapbox/mcp-server)](https://github.com/mapbox/mcp-server)
一句话：10 工具（geocoding / POI / routing / travel-time matrix / TSP 优化 / map-matching / isochrone / 实时渲染 / 静态图像 / 离线计算）；hosted `mcp.mapbox.com/mcp`。
行动：**监控** —— 路线优化 + isochrone 可作 spatial 模块 future 扩展；周期 12+ 评估 isochrone API。

### 10.4 [MapGPT (mapbox.com/mapgpt)](https://www.mapbox.com/mapgpt)
一句话：车载 AI 助手；自然语言路径 / 餐厅预订 / 语音控制；支持厂商定制 wake word + personality + voice。
行动：**跳过** —— 与本项目 GIS viewer 无重叠；周期 11+ 监控开源版本。

### 10.5 [Mapbox Agent Skills (github mapbox/mapbox-agent-skills)](https://github.com/mapbox/mapbox-agent-skills)
一句话：15 skills 覆盖 web / iOS / Android / search / geospatial ops / map design / migrations / security / performance；Open Plugins spec。
行动：参考其 Skill / Plugin 双层架构；本项目 P1-1 mcpManifest 当前仅暴露 manifest；周期 12+ 评估 Plugin。

---

## 11. gis agent 2026 autonomous geospatial AI tools

### 11.1 [GISclaw: 开源 LLM Agent 全栈 GIS 分析 (arXiv 2026)](https://arxiv.org/pdf/2603.26845)
一句话：6 LLMs × 2 架构 × 600 实验；最高 96% 任务成功率；GeoPandas + rasterio + scipy；ReAct + Plan-Execute-Replan 双架构对比。
行动：参考其 "Domain Knowledge injection" 与 "Error Memory" 设计；周期 11+ 评估 memory middleware 注入 spatial domain knowledge。

### 11.2 [MEKXH/golem (GeoAI Agent)](https://github.com/MEKXH/golem)
一句话：Go + Eino 框架的 GeoAI Agent；GDAL/PostGIS 工具调用 + WebUI/TUI/IM 三端；带审批与审计框架。
行动：**监控** —— 商业 GIS Agent 趋势；本项目自研 server/agent/* 路径类似但更轻量。

### 11.3 [SuperMap AgentX Server 产品介绍](https://help.supermap.com/AgentXServer/zh/Introduction/Introduction.htm)
一句话：超图 2026 空间智能体平台；300+ MCP 工具（iPortal / iServer / GPA）；支持工作流 + 长规划 + 循环推理 3 agent 形态。
行动：商业参考；本项目自研 MCP 仅暴露核心 Viewer 能力；周期 12+ 评估更多工具（受限于维护负担）。

### 11.4 [Esri: The Next Era of AI and ArcGIS](https://www.esri.com/about/newsroom/arcnews/the-next-era-of-ai-and-arcgis)
一句话：Esri 2026 summer 推出 "Geospatial agents"；ArcGIS Maps SDK JS 内置；外部 agent 可连接 ArcGIS 工具。
行动：商业玩家全面布局；本项目自研 manifest 与之并行；周期 11+ 跟踪 ArcGIS Maps SDK JS AI 集成。

### 11.5 [CARTO for Agents: GIS for the Agentic Enterprise](https://carto.com/blog/introducing-carto-for-agents-gis-for-the-agentic-enterprise/)
一句话：CARTO 第一个面向 Agentic Enterprise 的 GIS 平台；extended CARTO CLI + 20+ Agent Skills + 强化 MCP Server；CLI 为 agent 主要界面。
行动：参考其 "CARTO CLI 为 agent 界面" 思路；周期 11+ 评估 CLI bridge（web 端 vs CLI 端）。

---

## 12. react 19 best practices 2026（actions / use / compiler）

### 12.1 [React 19 Server Functions Reference (react.dev)](https://react.dev/reference/rsc/server-functions.md)
一句话：Server Functions（2024-09 前叫 Server Actions）；用 `"use server"` 指令；client 可直接调 server 异步函数；React 19 stable；框架 API 不保证 semver。
行动：**监控** —— 本项目 Vite SPA 而非 Next.js；server functions 不直接适用。

### 12.2 [React 19 Concurrent Features & Suspense Deep Dive (devstarsj 2026-03)](https://devstarsj.github.io/2026/03/28/react-19-concurrent-features-suspense-deep-dive-2026/)
一句话：Actions + `use()` + `useOptimistic` + `useFormStatus` + `useActionState`；priority lanes（Sync / InputContinuous / Default / Transition / Idle）。
行动：**监控** —— 本项目 React 19 已使用（周期 9 验证）；评估 `useActionState` 用于错误边界集成。

### 12.3 [React 19 Core Hooks Deep Dive (CSDN 2026-02)](https://blog.csdn.net/m0_46833693/article/details/158351132)
一句话：`use()` 不是 hook 是内置函数；可读 Promise / Context；条件调用 + 请求去重 + 与 Suspense 集成。
行动：周期 11+ 评估 `use(promise)` 替代 useEffect 数据获取模式（性能优化）。

### 12.4 [React v19 stable release notes (reactjs.ac.cn)](https://reactjs.ac.cn/blog/2024/12/05/react-19)
一句话：Actions 自动管理 pending / 错误 / 乐观更新；useOptimistic；useActionState；Server Functions；Suspense 改进。
行动：本项目 React 19 已 stable；周期 11+ 评估 useOptimistic 用于实时上报 UI。

### 12.5 [React 19 Practical Guide 2026 (blue45f/heejun)](https://github.com/blue45f/heejun/blob/main/public/%EA%B0%9C%EB%B0%9C%EA%B0%9C%EA%B0%80%EC%9D%B4%EB%93%9C/02_React19_%EC%8B%A4%EB%AC%B4_%EA%B0%80%EC%9D%B4%EB%93%9C.md)
一句话：核心 Actions / useActionState / useOptimistic；React Compiler 1.0 stable (2025-10) —— 替代手动 useMemo / useCallback / memo。
行动：周期 11+ 评估 React Compiler；当前本项目 React 19 + Vite 已 OK，但 ClientViewer 等大组件未做手动 memoization；周期 12+ 引入。

---

## 调研 Top5（落周期 11+）

| 排名 | 主题 | 行动 | 落点 |
| --- | ---- | ---- | ---- |
| 1 | **pgvector / mem0 self-host 容量评估**（周期 10 P0-1 已落评估） | 周期 11+ 验证：prototype HNSW < 10K 向量即可；不立即上 docker；周期 12+ 评估自动 REINDEX cron | 升级 memory.js |
| 2 | **memMachine ground-truth preservation**（CoALA 3 层 + Mem0 80% fewer tokens） | 周期 11+ 评估：保留原始 episodic（不抽取）+ 轻量 LLM 摘要；SQLite FTS5 已是 episodic 雏形 | 升级 memory.js |
| 3 | **OpenTelemetry SDK 替换自研 MetricsRegistry**（周期 9 P1-1 + 周期 10 P1-2 已落滑动 buffer） | 周期 11+ 评估 @opentelemetry/sdk-web + OTLP exporter；当前 sliding buffer 1000 items / 1h TTL 临时方案足够 | 升级 telemetry |
| 4 | **3D Tiles 2.0 + Gaussian Splatting + WebGPU**（周期 10 P2-1 决定暂不切换） | 周期 11+ 跟踪 Khronos KHR_gaussian_splatting 标准化 + Cesium ion 适配；周期 12+ 评估 WebGPU backend（覆盖率 73%） | 升级 viewer |
| 5 | **React 19 Compiler + Actions**（周期 9 已 stable；本项目 Vite SPA） | 周期 11+ 引入 useActionState 错误边界；周期 12+ 评估 React Compiler 替代手动 memoization | 升级 ClientViewer |