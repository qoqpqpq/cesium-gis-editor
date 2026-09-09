# Upcoming Work（多周期累积池）

> 所有周期按"清除已完成的条目"的方式收敛。
> 顶部为最高优先级 P0，自上而下递减；周期结束后由对应周期把"已交付"项移到 commits 区。

## 周期 8 已交付（2026-09-08）

- ✅ **P0-1** memory.js FTS5 全文检索（SQLite `_fts` 虚拟表 + bm25() 排序 + 同步触发器 + LIKE fallback）
- ✅ **P0-2** viewState DecompressionStream 浏览器原生解压（pako 仅做兜底）
- ✅ **P1-1** MCP manifest 浏览器侧暴露（`client/src/pages/gis/mcpManifest.js` + `window.mcp`）
- ✅ **P1-2** executeSandbox 统一调度器（vm / worker / iv / auto 四种 engine）
- ✅ **P1-3** memoryContextMiddleware Express ALS 自动注入
- ✅ **P1-4** METRICS_TRUSTED_CIDRS RFC1918 白名单（零依赖 IPv4 CIDR 解析）
- ✅ **P1-5** client/server 协议同步验证脚本（`scripts/check-protocol-sync.cjs`）
- ✅ **P2-1** OTLP push 评估 spec（结论：pull 已足够，push 暂不实施）
- ✅ **P2-2** helmet 8.x permissionsPolicy 再评估（关键发现：本项目 ^8.3.0 不输出 header）
- ✅ **Bug 修复** C8-B01 metricsOtlpHandler 缺失 import（周期 7 隐藏 bug）

## 周期 9 已交付（2026-09-08）

- ✅ **P0-1** server-import-completeness spec（静态扫描 server/* 模块导出完整性，防御 C8-B01 类隐藏 bug）
- ✅ **P0-2** memory.js WAL + journalMode/optimizePragma helpers（`PRAGMA journal_mode=WAL` + `synchronous=NORMAL` + `optimize` 触发；graceful fallback 无 better-sqlite3）
- ✅ **P1-1** MCP 真集成（`client/src/pages/gis/mcpManifest.js` 5 个核心 GIS 工具 + `installBridgeTransport` 修复 handler 返回值；19/19 sub-assertion PASS）
- ✅ **P1-2** sandbox perf benchmark spec（vm / worker / iv / auto 四 engine × 100/30 次；vm warm p50=0ms / worker-seq p50=628ms / worker-conc-5 p50=397ms）
- ✅ **P1-3** ErrorBoundary asyncGuard（`client/src/utils/asyncGuard.js` window.unhandledrejection + window.error 全局捕获；14/14 sub-assertion PASS）
- ✅ **P1-4** PR review workflow 接 MiniMax-M3（`anthropics/claude-code-action@v1` + `anthropic_base_url` + `--model MiniMax-M3 --max-turns 5`；18/18 sub-assertion PASS）
- ✅ **P2-1** metrics endpoint perf benchmark（`/api/metrics` p50=3ms p95=4ms；`/api/otlp/metrics` p50=2ms p95=3ms；20 并发 56ms）
- ✅ **P2-2** Permissions-Policy middleware 自研（`server/middleware/permissionsPolicy.js` 20 默认策略；helmet 8.x 验证不输出，替代实现；13/13 sub-assertion PASS）

## 周期 10 已交付（2026-09-08）

- ✅ **P0-1** mem0 pgvector self-host 评估（`docs/evaluation/mem0-postgres.md` + docker-compose 草稿；spec `mem0-postgres-eval.cjs` 22 PASS）—— 决策：< 10K 向量 prototype 不切换
- ✅ **P0-2** Agent memory 3 层架构评估（`docs/evaluation/agent-memory-3layer.md` CoALA + MemMachine + zylos；spec 15 PASS）—— 决策：渐进实施，当前 FTS5 = episodic 雏形
- ✅ **P1-1** PR review multi-specialist（`.github/workflows/pr-review.yml` 拆 baseline + security + design 三 specialist + concurrency cancel-in-progress；spec `pr-review-workflow-m3.cjs` 18 → 24 PASS）
- ✅ **P1-2** asyncGuard 上报 /api/telemetry（`client/src/utils/asyncGuard.js` opts.telemetryUrl + sendBeacon + keepalive；`server/routes/telemetry.js` POST localhost-only；`server/middleware/telemetryCollector.js` sliding buffer 1000 items / 1h TTL；spec 30 + 19 PASS）
- ✅ **P1-3** Sandbox worker pool（`server/agent/sandboxWorkerPool.js` LRU + reuse + idle timeout 60s + drain；warm p50 < 100ms vs 周期 9 baseline 628ms；spec 23 PASS）
- ✅ **P2-1** WebGPU + 3D Tiles 2.0 评估（`docs/evaluation/webgpu-3d-tiles.md`：覆盖率 73% < 80% 门槛 + 3D Tiles 2.0 KHR_gaussian_splatting OGC 2026-Q3 candidate；spec 11 PASS）—— 决策：暂不切换 backend

## 周期 12 已交付（2026-09-09）

- ✅ **P0-1** 混合检索 RRF（`server/agent/hybridRetrieval.js`：vector + FTS5 + recency 三通道 RRF 融合 + k0=60；spec `hybrid-retrieval-rrf.cjs` 37 PASS）
- ✅ **P1-1** useOptimistic + Guard 联合 hook（`client/src/hooks/useOptimisticAction.js` ESM；React 19 全路径 + React 18 fallback + shouldOptimistic；spec 28 PASS）
- ✅ **P1-2** SQLite 生产 pragma + 60s passive checkpoint（`server/agent/sqlitePragmas.js`：8 个 PRAGMA 配方 + 60s 后台 loop + stop()；spec 26 PASS）
- ✅ **P1-3** Worker thread trace carrier 注入（`server/agent/workerTraceCarrier.js`：attach/restore/childTraceparent/runInTraceContext；spec `worker-trace-carrier.cjs` 31 PASS 含真实 worker_threads round-trip）
- ✅ **P1-4** 3D Tiles 2.0 vector tiles + Gaussian splat 兼容层（`client/src/utils/tilesetLoader.js`：classifyTileset + chooseRenderMode + isFeatureSupported；spec 31 PASS）
- ⚠️ **P2-1** Viewer 真实改造（`client/src/hooks/useOptimisticMarker.js` 乐观 marker hook；spec 18 PASS；但**未真正接入 cesiumEarth.jsx addMarker**——下周期补足）
- ✅ **P2-2** OTel dev hook（`server/agent/otelDevHook.js` 真实 require OTel SDK + NODE_ENV=production 不安装 + runWithSpan ALS；spec 19 PASS）
- ✅ **P2-3** SSRF metadata IP cron 同步（`scripts/sync-metadata-ips.cjs` dry-run 默认 + markdown/json/csv 三格式解析；spec 23 PASS）
- ✅ **P2-3 docs** `docs/security/metadata-ips.md` 维护 AWS/GCP/Azure/IPv6 段

## 调研 Top5（由周期 12 调研产出，落周期 13+；覆盖周期 11 Top5）

> 调研全文见 `docs/cycles/cycle-12-research.md`（12 主题 × 5 链接 = 60 链接）。

| 排名 | 主题 | 行动 | 落点 |
| --- | ---- | ---- | ---- |
| 1 | **handler 8 维升级为 AI Agent 安全护栏**（OWASP ASI01-10 映射 + 6 层防御；OWASPLA 2026-05） | 周期 13 落地：`server/middleware/aiGuardrails.js` tool allowlist + circuit breaker + input sanitization；spec ≥25 PASS | 升级 aiTools |
| 2 | **OTel SDK 真正集成 worker_threads + SQLite pragma 升级**（oneuptime 2026-02 + Tailscale WAL bug 2026-03） | 周期 13 落地：扩展 otelDevHook.js worker 集成 + sqlitePragmas.js 30min TRUNCATE + version check（≥3.51.3）；spec ≥20 PASS | 升级 telemetry |
| 3 | **better-sqlite3 → node:sqlite 兼容层**（cortexkit magic-context #108 + lhremote #72） | 周期 13 落地：`server/agent/sqliteBackend.js` 三向 dispatch（Node 24+ / Bun / 兼容 fallback）；spec ≥18 PASS | 升级 memory.js |
| 4 | **CesiumJS 1.141+ Gaussian splat demo 集成**（Cesium 1.141 release May 2026 + cesium-splat-streetview） | 周期 13 落地：升级 client Cesium 至 1.141+ + 引入 splatLoader.js；spec ≥15 PASS | 升级 viewer |
| 5 | **混合检索 RRF 多样化 + sqlite-vec 评估**（Apache Doris RRF SQL + sqlitesearch + SQLite Vec1 v0.7） | 周期 13 落地：hybridRetrieval.js strategy 配置 + docs/evaluation/vector-extension-decision.md；spec ≥15 PASS | 升级 hybridRetrieval |

## P0（必须下周期完成）

- [ ] **P0-1** SSRF metadata IP 同步：写"从 cloud-metadata.com 自动同步新 IP"脚本 + 季度 cron + spec。文件：`server/services/ssrf-guard.js` + `scripts/sync-metadata-ips.cjs`（new）+ `docs/security/metadata-ips.md` 维护。验收：新增 `tests/specs/metadata-ip-sync.cjs` PASS。
- [ ] **P0-2** 限流算法升级（周期 6 已落 Token Bucket + IETF header + 路由集成；本周期确认无回归即可）

## P1（高优先级，至少完成 3 项）

- [ ] **P1-1** SQLite FTS5 memory 检索：在 `server/agent/memory.js` 加 `_fts` 虚拟表 + `bm25()` 排序。验收：`tests/specs/memory-fts5.cjs` PASS。
- [ ] **P1-2** MCP 实际接入（browser-agent 模式）：嵌入 `cesium-mcp-bridge` 到 Viewer，零后端。验收：浏览器内 `/mcp/manifest` 端点 + 截图验证。
- [ ] **P1-3** DecompressionStream 替代 pako：客户端 `viewState.js` 优先 `new DecompressionStream('gzip')`，pako 仅做老浏览器兜底。验收：`tests/specs/viewstate-decompression-stream.cjs` PASS。
- [ ] **P1-4** 沙箱 heap-snapshot 自动 dump（周期 6 已做 worker.error / cpu_abort / ok finish 三处触发 + 节流 1s + 保留 5 个 LIFO）。验收：现有 `tests/specs/sandbox-heap-snapshot.cjs` PASS。

## P2（中低优先级，按预算与时间允许）

- [ ] **P2-1** helmet 8.x 内置 Permissions-Policy 替代手写 20 项。文件：`server/index.js`。验收：与 `tests/specs/csp-permissions-policy.cjs` 行为一致 + 静态扫描源文件移除手写 middleware。
- [ ] **P2-2** `_sse.js` Last-Event-ID buffer 续传（已完成 by 94c3622）。验收：现有 `tests/specs/sse-last-event-id-buffer.cjs` PASS（不再 0/0）。
- [ ] **P2-3** `client/src/pages/gis/editor/utils/*.js` 中 9 个工具类文件（`coords / measure / picking / snap / analysis / ...`）有 3-4 处与 turf 互操作缺乏单元测试。
- [ ] **P2-4** `client/src/pages/gis/sandbox.js` 与 `server/agent/protocol/parse.js` 协议字符串 `<tool>name(args)</tool>` 重复实现，注释里也提示"修改时务必同步"。需求：把"协议字面 + 解析"统一从 `client/src/pages/gis/protocol.js` 导出，server 用 ESM 风格 require 该模块（或保留双份但加 npm script 同步检查）。
- [ ] **P2-5** `client/src/pages/gis/aiAgent.js` 体积大且无注释（待通读），P2 阶段拆分候选。
- [ ] **P2-6** OTel SDK 评估（接 MetricsRegistry / OTLP exporter）。需求：spike `@opentelemetry/sdk-node` + 自动注入 traceId，文档化决策。
- [ ] **P2-7** mem0 self-host 评估（Postgres + pgvector）。需求：写 `docs/evaluation/mem0-postgres.md`，含 docker-compose 草稿。
- [ ] **P2-8** AI Agent 长期记忆三层架构评估（episodic + semantic + procedural）。需求：写 `docs/evaluation/agent-memory-3layer.md`，对应 `memory.js` 升级路径。
