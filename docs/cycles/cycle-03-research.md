# Cycle 03 — 调研报告（Research Notes）

> **周期**: N=3（继承期）
> **范围**: 与本周期 P0/P1/P2 强相关的 12 个技术主题；每个主题 5 条链接 + 一句话摘要 + 行动建议。
> **本文件作用**: 留下可被后续周期复用的"权威资料库"；Top5 摘要同时落入 `docs/release-notes/upcoming-work.md` 的"调研 Top5"段（覆盖周期 2 Top5）。

---

## 1. OWASP SSRF Cheat Sheet 全面解读

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 1.1 | OWASP SSRF Prevention in Node.js (RelunSec) | <https://owasp.org/www-community/pages/controls/SSRF_Prevention_in_Nodejs.html> | 六步：URL 规范化 → 协议白名单 → WHATWG URL 解析 → DNS 解析 + IP 分类 → 链路重校验 → 超时 + 禁重定向 | 周期 3 P0-1 已做齐 5 步；周期 4+ 评估"显式 pin IP 防止 DNS rebinding 抢跑" |
| 1.2 | node:dns 文档 / dnsPromises.lookup | <https://nodejs.org/api/dns.html#dnspromiseslookuphostname-options> | `dns.lookup` 用系统 getaddrinfo（同步调用）vs `dns.resolve` 异步；前者返回 IP 数组 | 周期 3 选 dns.lookup 简单够用；周期 4 评估"先 dns.resolve 拿所有 A 记录全校验" |
| 1.3 | RFC 6890 Special-Purpose IP Address Registry | <https://datatracker.ietf.org/doc/html/rfc6890> | IANA 注册的所有特殊段：loopback / link-local / private / ULA / CGNAT / docs / multicast / reserved / 6to4 / NAT64 | 周期 3 已覆盖 IPv4 25 段 + IPv6 8 段；周期 4 补 6to4 (2002::/16) / 6bone（退役） |
| 1.4 | DNS Rebinding 防御：host header allowlist | <https://qiita.com/kawabe0201/items/e3e5381db65d72f797e4> | 防御 1: Host header 校验（防 DNS rebinding 通过 host header 仍指向内网） | 周期 4 P0-1: 引入 host allowlist middleware（`localhost` / `127.0.0.1` only） |
| 1.5 | Cloud 元数据 IP 169.254.169.254 防御 | <https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instancedata-data-retrieval.html> | IMDSv1（无 token）= 周期 3 已挡；IMDSv2（token required）= 即使解析到 169.254 也无效 | 周期 4: 对所有云平台 metadata IP 全拒（169.254.169.254/32 + 169.254.170.2 ECS） |

**本主题落点**：本周期 P0-1 已完成"URL 入口" + "全 IP 分类"；周期 4+ 补 host allowlist + pin IP + 全面 metadata IP 黑名单。

---

## 2. OWASP HTTP Headers Cheat Sheet

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 2.1 | OWASP HTTP Headers Cheat Sheet | <https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html> | 7 项硬性：HSTS / X-Frame-Options / CSP / X-Content-Type-Options / Referrer-Policy / Permissions-Policy / COOP+COEP | 周期 3 P1-1 已加 5/7；周期 4 补 HSTS（生产 HTTPS 强制）+ COEP conditional（CDN 兼容） |
| 2.2 | MDN Permissions-Policy | <https://developer.mozilla.org/en-US-US/docs/Web/HTTP/Headers/Permissions-Policy> | 每个特性独立控制：camera=() / geolocation=(self) 等；`(self)` = 同源可访问 | 周期 3 P1-1 已加 20 项；周期 4 评估"按页面类型动态收紧"（如编辑页允许 fullscreen） |
| 2.3 | MDN Cross-Origin-Opener-Policy | <https://developer.mozilla.org/en-US-US/docs/Web/HTTP/Headers/Cross-Origin-Opener-Policy> | `same-origin` 隔离 window.opener；`same-origin-allow-popups` 允许 popup；`unsafe-none` 关 | 周期 3 P1-1 选 same-origin；周期 4 评估 popup 场景需 same-origin-allow-popups |
| 2.4 | helmet 7.x 官方文档 | <https://helmetjs.github.io/> | 默认 15 项 header；不直接支持 Permissions-Policy | 周期 3 P1-1 手写 middleware；周期 4 评估升级 helmet 8.x（原生支持 Permissions-Policy） |
| 2.5 | Permissions-Policy 浏览器实现进度 | <https://github.com/w3c/webappsec-permissions-policy/blob/main/features.md> | 各浏览器对各种 API 的支持矩阵 | 周期 4 评估"我们限制的 API 实际有多少浏览器支持"——避免加了一堆没用的 policy |

**本主题落点**：本周期 P1-1 补齐 5/7 项；周期 4 HSTS + COEP conditional + helmet 8.x 升级。

---

## 3. node:vm 安全沙箱 / VM2 escape 历史

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 3.1 | Node.js 官方 vm 模块文档 | <https://nodejs.org/api/vm.html> | `vm.createContext(sandbox)` + `script.runInContext()`；timeout option Node 19+ | 周期 3 P1-2 用 vm.createContext + runInContext；与 VM2 行为对比 |
| 3.2 | VM2 CVE-2023-32314 escape | <https://github.com/patriksimek/vm2/issues/516> | VM2 多次 escape；作者最终放弃维护（"transition into a passive mode"） | 周期 3 P1-2 已废弃 VM2；周期 4+ 若需更强隔离考虑 isolated-vm |
| 3.3 | node:vm vs VM2 安全对比（GitHub Issue） | <https://github.com/nodejs/node/issues/40538> | "vm2 escapes again, why we don't use built-in vm" | 周期 3 P1-2 已用 node:vm；周期 4 评估"Resource limits（heap / CPU）" |
| 3.4 | isolated-vm 库（WASM-based sandbox） | <https://github.com/laverdet/isolated-vm> | 真 V8 isolate + 显式 host call；性能高于 vm2 但 API 复杂；安装需要 node-gyp | 周期 4+ 备选（仅在 node:vm 不够用时） |
| 3.5 | OWASP Sandbox Escape 案例与防御 | <https://cheatsheetseries.owasp.org/cheatsheets/Sandbox_Escape.html> | 防御 = minimize API surface + Resource limits + Whitelist require | 周期 3 P1-2 已 implement 大部分；周期 4 评估"Resource limits via napi" |

**本主题落点**：本周期 P1-2 用 node:vm 替代 VM2；周期 4+ 评估 isolated-vm 与 Resource limits。

---

## 4. Pino + AsyncLocalStorage 可观察性

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 4.1 | Pino 官方（最快 JSON logger） | <https://getpino.io/> | 5x faster than Winston；`pino-http` middleware；redact API | 周期 3 P1-3 因新依赖未引入；周期 4 评估"是否值得为性能换 pino" |
| 4.2 | Node.js AsyncLocalStorage 官方 | <https://nodejs.org/api/async_context.html#class-asynclocalstorage> | 跨 await/setTimeout/Promise.then 传递 context；与 logger 配合自动 inject reqId | 周期 3 P1-3 用 AsyncLocalStorage；周期 4 评估"Pino 也支持 async_hooks" |
| 4.3 | OpenTelemetry Node.js SDK 入门 | <https://opentelemetry.io/docs/languages/js/getting-started/nodejs/> | 标准化 trace + metrics；与 Pino 配合（pino 自动 inject traceId） | 周期 4+ 引入；周期 5+ 接入 Jaeger / Tempo |
| 4.4 | W3C Trace Context 规范 | <https://www.w3.org/TR/trace-context/> | `traceparent` 头跨服务传递；与 logger 的 `reqId` 配合 | 周期 4+ 接入 Otel SDK 后用 |
| 4.5 | Grafana Faro 前端 RUM | <https://github.com/grafana/faro> | 浏览器侧错误/性能/会话回放 | 周期 5+ 评估"前端 RUM" |

**本主题落点**：本周期 P1-3 用 Node 内置（无 pino）；周期 4 评估 pino 性能收益 + Otel SDK 接入。

---

## 5. URL 长度限制 / 短链接服务

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 5.1 | MDN: 浏览器 URL 长度限制 | <https://stackoverflow.com/questions/417142/what-is-the-maximum-length-of-a-url-in-different-browsers> | Chrome/Firefox ~32KB；IE/old Safari ~2KB；安全值 ~8KB | 周期 3 P1-4 选 8KB 阈值；周期 4 评估"短链接服务（POST 后返短 ID）" |
| 5.2 | base64url vs base64 (RFC 4648) | <https://datatracker.ietf.org/doc/html/rfc4648#section-5> | URL-safe + 去 padding；本研究选 base64url | 周期 3 P1-4 已用 base64url；周期 4 评估"lz-string 压缩" |
| 5.3 | LZ-String 压缩库 | <https://pieroxy.net/blog/pages/lz-string/index.html> | 客户端压缩；URL-safe；可省 30-50% 长度 | 周期 4+ 评估"压缩 payload 再 base64" |
| 5.4 | URL 短链接模式 (Hash + POST /share) | <https://blog.dreamfactory.com/implementing-a-url-shortener> | "POST /api/shorten {url} → {id}"；GET /s/:id → 302 跳原 URL | 周期 4 评估"自建短链接服务"——需数据库，单独任务 |
| 5.5 | OWASP URL Redirection Cheat Sheet | <https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html> | 短链接 open redirect 风险：必须 validate 目标 + 短 ID 不可猜 | 周期 4 若实施短链接必须配套；周期 3 不做 |

**本主题落点**：本周期 P1-4 8KB 降级；周期 4 评估 lz-string + 短链接服务。

---

## 6. Redis ZADD Sliding Window / 分布式限流

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 6.1 | Redis University: Sliding Window | <https://university.redis.io/learningpath/14nlg30m3wqjlq> | `ZADD + ZREMRANGEBYSCORE` 实现分布式 sliding window | 周期 4 P0-2 实施 |
| 6.2 | ioredis 官方文档 | <https://github.com/redis/ioredis> | 主流 Redis 客户端；支持 cluster / sentinel / pipelining | 周期 4 引入 |
| 6.3 | rate-limit-redis (express-rate-limit 官方) | <https://github.com/express-rate-limit/rate-limit-redis> | 与 express-rate-limit 集成；支持 sliding window | 周期 4 P0-2 优先用此；自研 ZADD 留 fallback |
| 6.4 | Redis Lua 脚本与限流 | <https://redis.io/docs/latest/develop/interact/programmability/eval-intro/> | 用 Lua 脚本做 atomic check-and-increment；避免 race | 周期 4 评估"用 Lua 替代 ZADD+ZREMRANGEBYSCORE 两步" |
| 6.5 | Cloudflare Rate Limiting（生产级） | <https://blog.cloudflare.com/counting-things-a-lot-of-different-things/> | "Sliding Window Counter" 工业实现：内存 + Redis 两层 | 周期 4+ 长期方案；周期 4 P0-2 仅做基础 Redis Sliding Window |

**本主题落点**：本周期 P2-2 已抽 Store 接口 + stub；周期 4 P0-2 实施真实 Redis ZADD。

---

## 7. express-rate-limit v7 vs 自研 sliding window

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 7.1 | express-rate-limit 7.x 官方 | <https://express-rate-limit.mintlify.app/> | 默认 MemoryStore = Fixed Window；rate-limit-redis 可换 Redis | 周期 3 P2-2 仍用 express-rate-limit（api/ai/recommend/spatial/daily 5 个） |
| 7.2 | RFC 6585 429 + Retry-After | <https://datatracker.ietf.org/doc/html/rfc6585#section-4> | 429 + Retry-After（秒）标配 | 周期 3 sliding window 已设；保持 |
| 7.3 | Draft-7 RateLimit Headers（IETF） | <https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers> | `RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset` 标准头 | 周期 3 已用 `X-RateLimit-*`；周期 4 评估"换无 X 前缀（标准）" |
| 7.4 | OWASP API Security Top 10 — Unrestricted Resource Consumption | <https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/> | "限流应在每层（IP / user / endpoint / API key）独立实施" | 周期 3 sliding window 仅按 IP；周期 4 评估"按 userId / API key 二级限流" |
| 7.5 | AbortController 与限流 | <https://nodejs.org/api/globals.html#class-abortcontroller> | 限流拒绝时如何取消 downstream fetch | 周期 3 不需要（中间件层先 reject）；周期 4 评估"429 后 abort 上游请求" |

**本主题落点**：本周期 P2-2 抽象 Store 接口；周期 4 实施 Redis 真实 + 二级限流。

---

## 8. ISO 27001 / SOC 2 视角的可观察性

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 8.1 | OWASP Logging Cheat Sheet | <https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html> | "log sensitive data 防护 + log integrity + audit log 独立" | 周期 3 P1-3 redact 实现；周期 4 评估"audit log 独立通道" |
| 8.2 | NIST SP 800-92 Guide to Computer Security Log Management | <https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-92.pdf> | "日志保留 ≥ 90 天；不可被业务代码删除" | 周期 3 无文件系统 log；周期 4 评估"stdout → journald → ELK" |
| 8.3 | GDPR Article 32 + log retention | <https://gdpr-info.eu/art-32-gdpr/> | 含 PII 的 log 须 ≥ 安全 + 最小化保留期 | 周期 3 redact 包含 baseUrl/email/username；周期 4 评估"IP 是否 PII" |
| 8.4 | PCI-DSS 10.x Logging Requirements | <https://www.pcisecuritystandards.org/document_library> | "10.2.1 记录所有 user 访问；10.5 log integrity 保护" | 周期 3 仅应用层；周期 4 评估"OS 层 auditd + 集成" |
| 8.5 | SOC 2 CC7.2 监控与告警 | <https://www.vanta.com/products/soc-2> | "异常行为告警 + 24h 响应 SLA" | 周期 3 无告警；周期 4 评估"日志关键事件 → webhook / Slack" |

**本主题落点**：本周期 P1-3 实现结构化日志 + redact；周期 4+ 接 ELK / 加告警。

---

## 9. Node.js vm 沙箱 Resource Limits / 性能

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 9.1 | v8 内存限制 (--max-old-space-size) | <https://nodejs.org/api/cli.html#--max-old-space-sizesize-in-megabytes> | 全局 V8 堆；不能 sandbox 单独限制 | 周期 3 沙箱未做 heap 限制；周期 4 评估"v8.writeHeapSnapshot 监测" |
| 9.2 | worker_threads + MessageChannel | <https://nodejs.org/api/worker_threads.html> | 真线程隔离；可单独 kill worker | 周期 4 评估"沙箱跑在 worker 里 + parent 监控" |
| 9.3 | vm.Script.runInContext timeout option | <https://nodejs.org/api/vm.html#scriptrunincontextcontextobjectified-options> | Node 19+ 支持；超时返回 Error | 周期 3 P1-2 已用；与 setTimeout 双重保险 |
| 9.4 | AbortController + Worker | <https://nodejs.org/api/worker_threads.html#workerterminate> | `worker.terminate()` 立即停止；不优雅但能保命 | 周期 4 评估"恶意脚本 terminate worker" |
| 9.5 | process.cpuUsage() / memoryUsage() 监控 | <https://nodejs.org/api/process.html#processcpuusagepreviousvalue> | 定期采样，超阈值 abort | 周期 4 评估"沙箱 CPU/mem watchdog" |

**本主题落点**：本周期 P1-2 仅做 time/异常隔离；周期 4+ 加 CPU/mem/worker。

---

## 10. Helmet 8.x 新特性 / 弃用 API

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 10.1 | helmet 8.0 release notes | <https://github.com/helmetjs/helmet/releases/tag/v8.0.0> | 8.x 原生支持 Permissions-Policy；COEP 默认 require-corp | 周期 3 P1-1 仍 helmet 7.x；周期 4 评估升级（需测试 Cesium 第三方瓦片） |
| 10.2 | helmet v8 migration guide | <https://github.com/helmetjs/helmet/blob/main/CHANGELOG.md> | 7.x → 8.x 改动列表 | 周期 4 升级前先 review |
| 10.3 | CSP Level 3 strict-dynamic 实战 | <https://web.dev/articles/csp3> | nonce + 'strict-dynamic' 替代 'unsafe-inline' | 周期 3 P1-1 仍用 'unsafe-inline'；周期 4 评估"打包时 inject nonce" |
| 10.4 | Trusted Types 与 DOM XSS | <https://web.dev/articles/trusted-types> | 防 XSS；要求所有 sink 都 sanitize | 周期 4+ 评估；本项目 React 默认不引入 v-html 风险 |
| 10.5 | Subresource Integrity (SRI) | <https://developer.mozilla.org/en-US-US/docs/Web/Security/Subresource_Integrity> | `<script integrity="sha384-...">` 防 CDN 篡改 | 周期 4 评估"对自托管 JS 加 SRI" |

**本主题落点**：本周期 P1-1 helmet 7.x + 手写 Permissions-Policy；周期 4 升级 helmet 8.x + strict-dynamic。

---

## 11. ioredis / Redis 集群 / 哨兵

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 11.1 | ioredis 官方 | <https://github.com/redis/ioredis> | 主客户端；支持 cluster / sentinel / pipelining | 周期 4 P0-2 引入 |
| 11.2 | Redis Sentinel HA | <https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/> | 哨兵自动故障转移；适合中小流量 | 周期 4 选 sentinel 而非 cluster（够用） |
| 11.3 | Redis Cluster (sharded) | <https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/> | 16384 slot；6+ 节点起步；适合 > 10K QPS | 周期 4 不需要 |
| 11.4 | Redis Lua 脚本（限流用） | <https://redis.io/docs/latest/develop/interact/programmability/eval-intro/> | 一段 Lua 脚本实现 atomic check + increment | 周期 4 评估"是否用 Lua 替代两步 ZADD+ZREM" |
| 11.5 | docker-compose 起 Redis 测试 | <https://docs.docker.com/compose/compose-file/compose-file-v3/> | 本地开发起 Redis 集群 / 哨兵 | 周期 4 起 docker-compose 验证 |

**本主题落点**：本周期 P2-2 仅 stub；周期 4 真实 Redis。

---

## 12. 限流二级策略（userId / API key / endpoint）

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 12.1 | Cloudflare 多层 Rate Limiting 实践 | <https://blog.cloudflare.com/announcing-rate-limiting-rules/> | "IP-level 30/min + user-level 100/min + endpoint-level 10/min" | 周期 4 评估"按 userId 二级限流"（需登录） |
| 12.2 | OWASP API Security — Resource Consumption | <https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/> | "对每个 API 独立限流 + 对每个 user 独立配额" | 周期 4 评估"AI key 维度独立" |
| 12.3 | express-rate-limit 多个 limiter 串联 | <https://express-rate-limit.mintlify.app/guides/creating-multiple-limiters> | `app.use(apiLimiter, userLimiter, endpointLimiter)` | 周期 4 评估"三级串联" |
| 12.4 | Token Bucket per user | <https://en.wikipedia.org/wiki/Token_bucket> | "burst-friendly"；Sliding Window 太严 | 周期 4 评估"AI 端点用 Token Bucket 替代 Sliding Window" |
| 12.5 | Google SRE Workbook — Rate Limiting | <https://sre.google/workbook/managing-load/> | "client-side 限流 + server-side 限流" | 周期 4 评估"客户端节流"（agent 端 SDK 节流） |

**本主题落点**：本周期 P2-2 单层 IP 限流；周期 4+ 多层。

---

## Top5 优先级（追加进 upcoming-work.md，覆盖周期 2 Top5）

| 排名 | 主题 | 行动 | 落到哪个 ID |
| --- | ---- | ---- | ----------- |
| 1 | **SSRF 补齐（host allowlist + pin IP + 全 metadata IP 黑名单）** | 周期 3 P0-1 已做 URL 入口 + IP 分类；周期 4 补 host header allowlist middleware（防 rebinding 通过 host 仍指向内网）+ 实 IP socket 连接 + 169.254.169.254/32 + 169.254.170.2 (ECS) + fd00:ec2::254 (IPv6 metadata) | 周期 4 P0-1 |
| 2 | **限流分布式（Redis ZADD 实施）** | 周期 3 P2-2 抽 Store 接口 + stub；周期 4 引入 ioredis + rate-limit-redis（ZADD + ZREMRANGEBYSCORE）；docker-compose 起 Redis 验证 | 升级 P2-2 → 周期 4 P0-2 |
| 3 | **可观察性升级（pino 性能 + Otel SDK）** | 周期 3 P1-3 用 Node 内置；周期 4 评估 pino 性能收益（5x）+ OpenTelemetry Node SDK（trace 跨服务）+ W3C traceparent | 周期 4 P1-1 |
| 4 | **沙箱 Resource limits（CPU / heap / worker 隔离）** | 周期 3 P1-2 用 node:vm + timeout；周期 4 评估 worker_threads 隔离 + process.cpuUsage() 监控 + v8 堆限制 | 周期 4 P1-2 |
| 5 | **URL 短链接 + lz-string 压缩** | 周期 3 P1-4 8KB 降级；周期 4 评估 lz-string 压缩 payload 省 30-50% 长度 + 短链接服务（POST /api/shorten） | 周期 4 P1-3 |
