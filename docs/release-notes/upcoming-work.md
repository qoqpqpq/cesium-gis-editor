# Upcoming Work（多周期累积池）

> 所有周期按"清除已完成的条目"的方式收敛。
> 顶部为最高优先级 P0，自上而下递减；周期结束后由对应周期把"已交付"项移到 commits 区。

## P0（必须本周期完成）

- [ ] **P0-1** SSRF 终态：维护 metadata IP 黑名单表（与 IANA 同步），加 ECS task metadata IPv6（`fd00:ec2::253`）。文件：`server/services/ssrf-guard.js` + `docs/security/metadata-ips.md`（new）。验收：新增 `tests/specs/metadata-ip-maintenance.cjs`（每季度 cron 自动跑验证黑名单仍包含主流云厂商 metadata IP）。
- [ ] **P0-2** 限流分布式 + 多级。周期 4 P0-2 已实施 Redis 真实 Sliding Window；周期 5 评估 Redis Lua atomic（替代 ZADD+ZREM 2 步）+ IP/userId/API key 三级限流。文件：`server/middleware/rateLimit.js` + `server/middleware/redisClient.js`（加 EVAL/EVALSHA）。验收：新增 `tests/specs/redis-pipelining.cjs` + `tests/specs/ratelimit-multilevel.cjs` PASS。

## P1（高优先级，至少完成 3 项）

- [ ] **P1-1** 可观察性升级（Otel SDK + Metrics）。周期 4 P1-1 已实施自研 W3C traceparent；周期 5 评估 `@opentelemetry/sdk-node` + `@opentelemetry/auto-instrumentations-node` + Metrics（Prometheus）。文件：`server/middleware/logger.js` 升级 + `server/index.js` 接入 Otel SDK。验收：新增 `tests/specs/otel-logs-bridge.cjs` + `tests/specs/metrics-prometheus.cjs` PASS。
- [ ] **P1-2** 沙箱深度隔离（CPU watchdog + isolated-vm 备选）。周期 4 P1-2 实施 worker_threads；周期 5 评估 `process.cpuUsage()` watchdog（CPU 超阈值 → worker.terminate）+ `isolated-vm` 备选（高安全要求）。文件：`server/agent/sandbox.js`。验收：新增 `tests/specs/sandbox-cpu-watchdog.cjs` PASS。
- [ ] **P1-3** 压缩统一（浏览器侧 CompressionStream polyfill）。周期 4 P1-3 实施 Node 端 zlib 压缩（中文 73x 压缩比）；周期 5 评估 `DecompressionStream('deflate')` 浏览器解压 + `pako` 备选。文件：`client/src/utils/viewState.js`。验收：新增 `tests/specs/viewstate-browser-polyfill.cjs`（jsdom + DecompressionStream mock）PASS。

## P2（中低优先级，按预算与时间允许）

- [ ] **P2-1** helmet 8.x 升级。周期 3 P1-1 仍 helmet 7.x + 手写 Permissions-Policy；周期 5 评估升级 helmet 8.x（原生 Permissions-Policy + 默认 COEP require-corp），先 review CHANGELOG 兼容 Cesium 第三方瓦片。文件：`package.json`。
- [ ] **P2-2** `_sse.js` Last-Event-ID buffer 续传。`sseStreamHandler` 接受可选 `bufferProvider`；断线时按 Last-Event-ID 续传最近 N 条事件。文件：`server/routes/_sse.js`。验收：新增 `tests/specs/sse-last-event-id-buffer.cjs`（mock bufferProvider）PASS。
- [ ] **P2-3** `client/src/pages/gis/editor/utils/*.js` 中 9 个工具类文件（`coords / measure / picking / snap / analysis / ...`）有 3-4 处与 turf 互操作缺乏单元测试。
- [ ] **P2-4** `client/src/pages/gis/sandbox.js` 与 `server/agent/protocol/parse.js` 协议字符串 `<tool>name(args)</tool>` 重复实现，注释里也提示"修改时务必同步"。需求：把"协议字面 + 解析"统一从 `client/src/pages/gis/protocol.js` 导出，server 用 ESM 风格 require 该模块（或保留双份但加 npm script 同步检查）。
- [ ] **P2-5** `client/src/pages/gis/aiAgent.js` 体积大且无注释（待通读），P2 阶段拆分候选。
- [ ] **P2-6** AI Agent 工具协议统一。引入 OpenAI 风格 `tool_calls[]`（与本地 `<tool>` 协议共存），便于 Claude / Ollama 接入；前端 UI 折叠工具过程。文件：`server/agent/protocol/parse.js`。验收：与原 P2-4 合并实施。

## 调研 Top5（由周期 4 调研产出，落到 P0/P1/P2，覆盖周期 3 Top5）

> 调研全文见 `docs/cycles/cycle-04-research.md`（12 主题 × 5 链接 = 60 链接）。
> 周期 3 调研 Top5 全已落代码：SSRF 6 步全齐（OWASP） / Redis ZADD 限流 / W3C trace + 性能 / worker_threads + Resource limits / viewState zlib 压缩。

| 排名 | 主题 | 行动 | 落点 |
| --- | ---- | ---- | ---- |
| 1 | **AI Agent 长期记忆（Mem0/Zep/EverOS）** | 周期 5+ 评估集成 Mem0（与"商业化"绑一起做，需 SQLite/Postgres 后端） | 升级 C3-B09 审计日志 → 长期记忆层 |
| 2 | **CesiumJS MCP 桥接** | 周期 5+ 评估把现有 `<tool>` 协议包装为 MCP Server + WebMCP browser bridge | 与 P2-6 AI Agent 工具协议统一（合并实施） |
| 3 | **Helmet 8.x Permissions-Policy 原生支持** | helmet 8.3 仍未原生支持；继续手写 20 项即可；周期 5+ 关注 helmet 9.x | 周期 4 P2-1 已升级 8.x |
| 4 | **OpenTelemetry Node SDK 完整接入** | 周期 5+ 安装 `@opentelemetry/sdk-node` + `@opentelemetry/auto-instrumentations-node` + OTLP exporter 上报 Jaeger/Tempo | 升级 P1-1 W3C traceparent 部分 → 完整 trace |
| 5 | **PR Review 自动化（CodeRabbit / Claude Code /review）** | 周期 5+ 在 PR 流程接 CodeRabbit 或 Claude Code `/review`（周期结束前自动评审本周期 commit） | 与自动周期绑一起做 |
