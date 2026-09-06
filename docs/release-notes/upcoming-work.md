# Upcoming Work（多周期累积池）

> 所有周期按"清除已完成的条目"的方式收敛。
> 顶部为最高优先级 P0，自上而下递减；周期结束后由对应周期把"已交付"项移到 commits 区。

## P0（必须本周期完成）

- [ ] **P0-1** SSRF 防御补齐（OWASP 6 步未齐）。当前仅"URL 解析 + DNS + IP 分类"三步；周期 3 补"禁重定向（`redirect:'manual'`） + 链路重校验（每 hop 重新跑 validate）" + 引入 `ipaddr.js` 替代正则覆盖 IPv6 / CGNAT 100.64/10 / 25 段特殊地址。文件：`server/services/ai.js`。验收：新增 `tests/specs/ssrf-redirect-no-follow.cjs` + `tests/specs/ssrf-ipaddr-ipv6.cjs` PASS。
- [ ] **P2-2** sliding window 分布式化（周期 1/2 P1-9 已有进程内 slidingWindow；周期 3 引入 `rate-limit-redis` + ZADD 实现真正分布式限流 + 集群级 reset）。文件：`server/middleware/rateLimit.js`。验收：本地 docker-compose 跑 Redis 后，跨进程计数共享。

## P1（高优先级，至少完成 4 项）

- [ ] **P1-1** CSP 全面审计（OWASP 7 项 + Permissions-Policy）。当前只补了 `connect-src` localhost；周期 3 对照 OWASP HTTP Headers Cheat Sheet 逐项打分 + 引入 Permissions-Policy（camera/mic/geolocation 限制）+ COOP/CORP。文件：`server/index.js`。验收：新增 `tests/specs/csp-permissions-policy.cjs` PASS。
- [ ] **P1-2** AI Code 沙箱重构（废弃 VM2）。VM2 多次 escape + 已停止维护；周期 3 改用 `node:vm` `Script` + 显式 context + Resource limits + 白名单 require。文件：`server/agent/sandbox.js`（或类似）。验收：新增 `tests/specs/sandbox-no-vm2.cjs` PASS。
- [ ] **P1-3** 可观察性（pino + redact + requestId）。当前无统一日志；API Key 在日志中可能明文。周期 3 引入 pino + pino-http（AsyncLocalStorage 串联 requestId）+ redact `apiKey` / `baseUrl` 字段。文件：`server/index.js`。验收：新增 `tests/specs/logger-redact.cjs` PASS。
- [ ] **P1-4** `client/src/utils/viewState.js` `base64UrlEncode` 在中文长字符串（>100KB 场景 AI 描述）下会因 `btoa(unescape(encodeURIComponent(str)))` 双倍膨胀，URL 长度超限。前端 `buildShareUrl` 失败时只回退到 `null`，无 UI 提示。需求：超出 ~8KB 时降级为只保留 camera 字段，并补一行 console.warn。

## P2（中低优先级，按预算与时间允许）

- [ ] **P2-1** `server/services/ai.js` `PLATFORMS` 表内 10 个平台的 `defaultModel` 与定价表 `PRICING` 手工对齐，新增模型易漂移。需求：改为 `PLATFORMS[].pricing` 字段内联，或写个启动时自检脚本。
- [ ] **P2-3** `client/src/pages/gis/editor/utils/*.js` 中 9 个工具类文件（`coords / measure / picking / snap / analysis / ...`）有 3-4 处与 turf 互操作缺乏单元测试。
- [ ] **P2-5** `client/src/pages/gis/sandbox.js` 与 `server/agent/protocol/parse.js` 协议字符串 `<tool>name(args)</tool>` 重复实现，注释里也提示"修改时务必同步"。需求：把"协议字面 + 解析"统一从 `client/src/pages/gis/protocol.js` 导出，server 用 ESM 风格 require 该模块（或保留双份但加 npm script 同步检查）。
- [ ] **P2-6** `client/src/pages/gis/aiAgent.js` 体积大且无注释（待通读），P2 阶段拆分候选。
- [ ] **P2-8** AI Agent 工具协议统一。引入 OpenAI 风格 `tool_calls[]`（与本地 `<tool>` 协议共存），便于 Claude / Ollama 接入；前端 UI 折叠工具过程。文件：`server/agent/protocol/parse.js`。验收：与原 P2-5 合并实施。
- [ ] **P2-9** SSE `Last-Event-ID` buffer 续传。当前 `_sse.js` 仅生成 `id` 不维护 buffer；上层业务需要自己做续传。需求：在 `sseStreamHandler` 接受可选 `bufferProvider`，按 lastEventId 续传；周期 4+ 实施（与"AI 上下文续传"绑一起做）。

## 调研 Top5（由周期 2 调研产出，落到 P0/P1/P2，覆盖周期 1 Top5）

> 调研全文见 `docs/cycles/cycle-02-research.md`（12 主题 × 5 链接 = 60 链接）。

| 排名 | 主题 | 行动 | 落点 |
| --- | ---- | ---- | ---- |
| 1 | SSRF 防护升级（OWASP 全套） | 当前 `validateBaseUrlWithDns` 只做"URL 解析 + DNS + IP 分类"三步；周期 3 补"禁重定向（`redirect:'manual'`） + 链路重校验" + 引入 `ipaddr.js` 替代正则 | 新增 P0-1 |
| 2 | 速率限制分布式化（Redis Sliding Window） | 当前 `slidingWindow` 仅进程内；周期 3 引入 `rate-limit-redis` + `ZADD` 实现真正分布式限流 + 集群级 reset | 升级 P2-2 |
| 3 | CSP 全面审计（OWASP 7 项 + Permissions-Policy） | 当前只补了 connect-src；周期 3 对照 OWASP HTTP Headers Cheat Sheet 逐项打分 + 引入 Permissions-Policy | 新增 P1-1 |
| 4 | AI Code 沙箱重构（废弃 VM2） | VM2 多次 escape + 已停止维护；周期 3 改用 `node:vm` `Script` + 显式 context + Resource limits + 白名单 require | 新增 P1-2 |
| 5 | 可观察性（pino + redact + requestId） | 当前无统一日志；周期 3 引入 pino + pino-http（AsyncLocalStorage 串联 requestId）+ redact API Key | 新增 P1-3 |
