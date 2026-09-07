# Upcoming Work（多周期累积池）

> 所有周期按"清除已完成的条目"的方式收敛。
> 顶部为最高优先级 P0，自上而下递减；周期结束后由对应周期把"已交付"项移到 commits 区。

## P0（必须本周期完成）

- [ ] **P0-1** SSRF 防御补齐（OWASP 6 步未齐）。当前已"URL 解析 + DNS + IP 分类 + 禁重定向"4 步；周期 4 补"host header allowlist middleware（防 DNS rebinding 通过 host 仍指向内网）" + "pin IP socket 连接" + "全 metadata IP 黑名单（169.254.169.254/32 + 169.254.170.2 ECS + fd00:ec2::254 IPv6 metadata）"。文件：`server/index.js` + `server/services/ssrf-guard.js`。验收：新增 `tests/specs/ssrf-host-allowlist.cjs` + `tests/specs/ssrf-metadata-ipv6.cjs` PASS。
- [ ] **P2-2** sliding window 分布式化。周期 3 P2-2 已抽 Store 接口 + RedisStore stub；周期 4 引入 `ioredis` + `rate-limit-redis`（ZADD + ZREMRANGEBYSCORE）实施真实 Redis 分布式限流 + 集群级 reset。文件：`server/middleware/rateLimitStore.js`。验收：`docker-compose up redis` 后跑 `tests/specs/ratelimit-redis-real.cjs` PASS。

## P1（高优先级，至少完成 3 项）

- [ ] **P1-1** pino + OpenTelemetry 升级。周期 3 P1-3 用 Node 内置 logger；周期 4 评估 `npm install pino pino-http` 性能提升（5x）+ `@opentelemetry/sdk-node` 接入 trace 跨服务 + W3C `traceparent` 头传递。文件：`server/middleware/logger.js` 升级 + `server/index.js` 接入 Otel SDK。验收：新增 `tests/specs/logger-pino-perf.cjs`（benchmark）+ `tests/specs/otel-traceid.cjs` PASS。
- [ ] **P1-2** 沙箱升级到 worker_threads + Resource limits。周期 3 P1-2 用 node:vm 仅时间隔离；周期 4 评估 worker_threads 隔离 + `process.cpuUsage()` 监控 + v8 堆限制（`--max-old-space-size`）+ worker.terminate() watchdog。文件：`server/agent/sandbox.js` 升级。验收：新增 `tests/specs/sandbox-worker-isolation.cjs` PASS。
- [ ] **P1-3** viewState lz-string 压缩 + 短链接服务。周期 3 P1-4 仅 8KB 降级；周期 4 评估 `lz-string` 压缩 payload 省 30-50% 长度 + `POST /api/shorten` 短链接服务（需数据库，与"商业化"绑一起做时再决定）。

## P2（中低优先级，按预算与时间允许）

- [ ] **P2-1** `server/services/ai.js` `PLATFORMS` 表内 10 个平台的 `defaultModel` 与定价表 `PRICING` 手工对齐，新增模型易漂移。需求：改为 `PLATFORMS[].pricing` 字段内联，或写个启动时自检脚本。
- [ ] **P2-3** `client/src/pages/gis/editor/utils/*.js` 中 9 个工具类文件（`coords / measure / picking / snap / analysis / ...`）有 3-4 处与 turf 互操作缺乏单元测试。
- [ ] **P2-4** helmet 8.x 升级。周期 3 P1-1 仍 helmet 7.x + 手写 Permissions-Policy；周期 4 评估升级 helmet 8.x（原生 Permissions-Policy + 默认 COEP require-corp），先 review CHANGELOG 兼容 Cesium 第三方瓦片。
- [ ] **P2-5** `client/src/pages/gis/sandbox.js` 与 `server/agent/protocol/parse.js` 协议字符串 `<tool>name(args)</tool>` 重复实现，注释里也提示"修改时务必同步"。需求：把"协议字面 + 解析"统一从 `client/src/pages/gis/protocol.js` 导出，server 用 ESM 风格 require 该模块（或保留双份但加 npm script 同步检查）。
- [ ] **P2-6** `client/src/pages/gis/aiAgent.js` 体积大且无注释（待通读），P2 阶段拆分候选。
- [ ] **P2-8** AI Agent 工具协议统一。引入 OpenAI 风格 `tool_calls[]`（与本地 `<tool>` 协议共存），便于 Claude / Ollama 接入；前端 UI 折叠工具过程。文件：`server/agent/protocol/parse.js`。验收：与原 P2-5 合并实施。
- [ ] **P2-9** SSE `Last-Event-ID` buffer 续传。当前 `_sse.js` 仅生成 `id` 不维护 buffer；上层业务需要自己做续传。需求：在 `sseStreamHandler` 接受可选 `bufferProvider`，按 lastEventId 续传；周期 4+ 实施（与"AI 上下文续传"绑一起做）。

## 调研 Top5（由周期 3 调研产出，落到 P0/P1/P2，覆盖周期 2 Top5）

> 调研全文见 `docs/cycles/cycle-03-research.md`（12 主题 × 5 链接 = 60 链接）。

| 排名 | 主题 | 行动 | 落点 |
| --- | ---- | ---- | ---- |
| 1 | SSRF 补齐（host allowlist + pin IP + 全 metadata IP 黑名单） | 周期 3 P0-1 已做 URL 入口 + IP 分类 + 禁重定向；周期 4 补 host allowlist middleware + pin IP + 169.254.169.254/32 + 169.254.170.2 (ECS) + fd00:ec2::254 (IPv6 metadata) | 升级 P0-1 |
| 2 | 限流分布式（Redis ZADD 实施） | 周期 3 P2-2 抽 Store 接口 + stub；周期 4 引入 ioredis + rate-limit-redis（ZADD + ZREMRANGEBYSCORE）；docker-compose 起 Redis 验证 | 升级 P2-2 |
| 3 | 可观察性升级（pino 性能 + Otel SDK） | 周期 3 P1-3 用 Node 内置；周期 4 评估 pino 性能收益（5x）+ OpenTelemetry Node SDK（trace 跨服务）+ W3C traceparent | 升级 P1-1 |
| 4 | 沙箱 Resource limits（CPU / heap / worker 隔离） | 周期 3 P1-2 用 node:vm + timeout；周期 4 评估 worker_threads 隔离 + process.cpuUsage() 监控 + v8 堆限制 | 升级 P1-2 |
| 5 | URL 短链接 + lz-string 压缩 | 周期 3 P1-4 8KB 降级；周期 4 评估 lz-string 压缩 payload 省 30-50% 长度 + 短链接服务（POST /api/shorten） | 升级 P1-3 |
