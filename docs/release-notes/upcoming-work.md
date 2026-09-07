# Upcoming Work（多周期累积池）

> 所有周期按"清除已完成的条目"的方式收敛。
> 顶部为最高优先级 P0，自上而下递减；周期结束后由对应周期把"已交付"项移到 commits 区。

## P0（必须本周期完成）

- [ ] **P0-1** SSRF metadata IP 同步：写"从 cloud-metadata.com 自动同步新 IP"脚本 + 季度 cron + spec。文件：`server/services/ssrf-guard.js` + `scripts/sync-metadata-ips.cjs`（new）+ `docs/security/metadata-ips.md` 维护。验收：新增 `tests/specs/metadata-ip-sync.cjs` PASS。
- [ ] **P0-2** 限流算法升级：Token Bucket（AI 端点）+ 标准 header（去 X 前缀）+ SCRIPT LOAD EVALSHA 缓存 + multiLevelLimiter routes/ 接入。文件：`server/middleware/rateLimit.js` + `server/middleware/rateLimitStore.js`。验收：新增 `tests/specs/ratelimit-token-bucket.cjs` + `tests/specs/ratelimit-standard-headers.cjs` + `tests/specs/ratelimit-routes-integration.cjs` PASS。

## P1（高优先级，至少完成 3 项）

- [ ] **P1-1** 可观察性升级（Otel SDK 集成）：自研 W3C traceparent（周期 4 P1-1）→ Otel SDK（auto-instrumentation + Metrics）。文件：`server/middleware/logger.js` 升级 + `server/index.js` 接入 Otel SDK。验收：新增 `tests/specs/otel-sdk-integration.cjs`（验证 traceId 自动注入） + `tests/specs/otel-metrics.cjs`（验证 metrics 暴露）PASS。
- [ ] **P1-2** 沙箱深度隔离：isolated-vm 备选（高安全要求）+ v8 heapSnapshot 自动 dump。文件：`server/agent/sandbox.js` + `server/agent/sandbox-iso.cjs`（new）。验收：新增 `tests/specs/sandbox-isolated-vm.cjs`（条件性：跳过若 node-gyp 不可用）+ `tests/specs/sandbox-heap-snapshot.cjs` PASS。
- [ ] **P1-3** DecompressionStream polyfill：客户端解压 v2 hash。文件：`client/src/utils/viewState.js`。验收：新增 `tests/specs/viewstate-browser-decompress.cjs`（jsdom + DecompressionStream mock）PASS。

## P2（中低优先级，按预算与时间允许）

- [ ] **P2-1** helmet 8.x 内置 Permissions-Policy 替代手写 20 项。文件：`server/index.js`。验收：与 `tests/specs/csp-permissions-policy.cjs` 行为一致 + 静态扫描源文件移除手写 middleware。
- [ ] **P2-2** `_sse.js` Last-Event-ID buffer 续传（已完成 by 94c3622）。验收：现有 `tests/specs/sse-last-event-id-buffer.cjs` PASS（不再 0/0）。
- [ ] **P2-3** `client/src/pages/gis/editor/utils/*.js` 中 9 个工具类文件（`coords / measure / picking / snap / analysis / ...`）有 3-4 处与 turf 互操作缺乏单元测试。
- [ ] **P2-4** `client/src/pages/gis/sandbox.js` 与 `server/agent/protocol/parse.js` 协议字符串 `<tool>name(args)</tool>` 重复实现，注释里也提示"修改时务必同步"。需求：把"协议字面 + 解析"统一从 `client/src/pages/gis/protocol.js` 导出，server 用 ESM 风格 require 该模块（或保留双份但加 npm script 同步检查）。
- [ ] **P2-5** `client/src/pages/gis/aiAgent.js` 体积大且无注释（待通读），P2 阶段拆分候选。
- [ ] **P2-6** AI Agent 工具协议统一。引入 OpenAI 风格 `tool_calls[]`（与本地 `<tool>` 协议共存），便于 Claude / Ollama 接入；前端 UI 折叠工具过程。文件：`server/agent/protocol/parse.js`。验收：与原 P2-4 合并实施。

## 调研 Top5（由周期 5 调研产出，落到 P0/P1/P2，覆盖周期 4 Top5）

> 调研全文见 `docs/cycles/cycle-05-research.md`（12 主题 × 5 链接 = 60 链接）。

| 排名 | 主题 | 行动 | 落点 |
| --- | ---- | ---- | ---- |
| 1 | SSRF metadata IP 同步 + IANA 季度维护 | 周期 5 P0-1 已建维护文档 + cron spec；周期 6 写"自动从 cloud-metadata.com 拉取新 IP"脚本 | 升级 P0-1 |
| 2 | 限流算法 + 标准 header | 周期 5 P0-2 完成 Lua atomic + multi-level；周期 6 评估 Token Bucket（AI 端点）+ IETF draft 标准 header（去 X 前缀）+ SCRIPT LOAD EVALSHA 缓存 | 升级 P0-2 |
| 3 | 可观察性升级（Otel SDK + Metrics） | 周期 4 P1-1 实施自研 W3C traceparent；周期 6 评估全 Otel SDK（auto-instrumentation）+ Metrics（Prometheus）+ Logs Bridge | 升级 P1-1 |
| 4 | 沙箱深度隔离（CPU watchdog + isolated-vm） | 周期 5 P1-2 完成 worker CPU watchdog；周期 6 评估 isolated-vm（高安全要求）+ v8 heapSnapshot | 升级 P1-2 |
| 5 | CompressionStream 客户端 polyfill | 周期 4 P1-3 实施 zlib Node 端压缩；周期 6 浏览器侧引入 pako / fflate 做 DecompressionStream polyfill | 升级 P1-3 |
