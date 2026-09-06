# Cycle 02 — 调研报告（Research Notes）

> **周期**: N=2（继承期）
> **范围**: 与本周期 P0/P1/P2 强相关的 12 个技术主题；每个主题 5 条链接 + 一句话摘要 + 行动建议。
> **本文件作用**: 留下可被后续周期复用的"权威资料库"；Top5 摘要同时落入 `docs/release-notes/upcoming-work.md` 的"调研 Top5"段（覆盖周期 1 Top5）。

---

## 1. SSRF 防护 / DNS Rebinding

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 1.1 | OWASP SSRF Prevention in Node.js | <https://owasp.org/www-community/pages/controls/SSRF_Prevention_in_Nodejs.html> | 六步防御：URL 规范化 → 协议白名单 → WHATWG URL 解析 → DNS 解析 + IP 分类 → 链路重校验 → 超时 / 禁重定向 | 周期 2 P1-8 已实现"URL 规范化 + DNS 解析 + IP 分类"三步；周期 3 再做"禁重定向 + 链路重校验" |
| 1.2 | Safeguard: Preventing SSRF in Node.js Applications (Jul 2026) | <https://safeguard.sh/resources/blog/nodejs-ssrf-prevention> | "Resolve, verify, then pin"：先 `dns.lookup` 拿到 IP，用 `ipaddr.js` 验证后再 socket 直连该 IP，避免 DNS rebinding 抢跑 | 周期 3+ 评估"pin IP"（在 node-fetch 层面 connect 到已验证 IP，TLS SNI 用原 hostname） |
| 1.3 | Node.js Security Best Practices（DNS Rebinding CWE-346） | <https://nodejs.org/learn/getting-started/security-best-practices> | Node 官方 threat list 把 DNS rebinding 列为内置威胁；建议在 `http.ServerResponse` 上挂 host 检查 middleware | 周期 3 评估对自家 `/api/*` 路由统一挂 host 白名单 middleware |
| 1.4 | DNS Rebinding 攻撃で localhost API が外部から叩かれる仕組み（Qiita） | <https://qiita.com/kawabe0201/items/e3e5381db65d72f797e4> | 实测攻击：TTL=0 + A 记录切换；防御 1 是 Host header 校验，防御 2 是 bind 127.0.0.1 | 周期 3+ 实施"host header allowlist"（仅 `localhost` / `127.0.0.1`） |
| 1.5 | swa pniluneva: ssrf-agent-guard (Network Agent 层) | <https://dev.to/swapniluneva/is-your-nodejs-app-vulnerable-to-ssrf-secure-axios-fetch-in-5-minutes-46of> | 拦截 `http.Agent` / `https.Agent` 的 socket 创建；支持 cloud metadata 黑名单 + DNS rebinding 实时检测 | 周期 3 评估：自家 `validateBaseUrlWithDns` 已覆盖 baseUrl 入口；如果之后允许用户上传 URL 再考虑 agent 拦截 |

**本主题落点**：本周期 P1-8（`validateBaseUrlWithDns` + `isPrivateIp`）已落地，参考 1.1 三步走。

---

## 2. 速率限制算法（Sliding Window / Token Bucket / Leaky Bucket）

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 2.1 | express-rate-limit 官方文档：stores & algorithms | <https://express-rate-limit.mintlify.app/guides/troubleshooting-proxy-issues> | express-rate-limit 7.x 默认 MemoryStore = Fixed Window；RedisStore 才能真正跨实例 | 周期 3+ 评估 RedisStore + Sliding Window 算法 |
| 2.2 | Sliding Window Counter vs Leaky Bucket（Cloudflare 博客） | <https://blog.cloudflare.com/counting-things-a-lot-of-different-things/> | Sliding Window Counter 是工业级"折中"：O(1) per request、近似 Sliding Window Log、跨实例友好 | 周期 2 选型落地为"进程内 Sliding Window Log"；周期 3+ 切 Sliding Window Counter for Redis 共享 |
| 2.3 | Rate Limiting Algorithms — Token Bucket / Leaky Bucket / Fixed Window / Sliding Window（Anubhav Mishra） | <https://www.anubhavmishra.com/rate-limiting-algorithms> | 4 种算法对比表：内存、突发、平滑、实现难度 | 周期 2 已选 Sliding Window Log；周期 3+ 评估"按 API 重要性"分级（AI 严，static 宽） |
| 2.4 | Redis Sliding Window（Redis University） | <https://university.redis.io/learningpath/14nlg30m3wqjlq> | `ZADD + ZREMRANGEBYSCORE` 实现分布式 Sliding Window；TTL 自动清理 | 周期 3+ 引入；同步对比 Redis Pub/Sub 做"集群限流广播" |
| 2.5 | RFC 6585 — Additional HTTP Status Codes（429） | <https://datatracker.ietf.org/doc/html/rfc6585#section-4> | 429 状态码 + `Retry-After` 头（秒）应标配；`X-RateLimit-Remaining` / `X-RateLimit-Reset` 是 draft-7 标准 | 周期 2 sliding window 已设这三个头；后续统一在 helmet 或 rate-limit middleware 输出 |

**本主题落点**：本周期 P1-9（`slidingWindow` 自研 middleware）已落地，参考 2.1 默认 + 2.3 决策。

---

## 3. SSE 协议（retry / Last-Event-ID / reconnect）

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 3.1 | MDN: Server-Sent Events — retry field | <https://developer.mozilla.org/en-US-US/docs/Web/API/EventSource#retry> | 启动时写 `retry: <ms>` 帧，EventSource 重连按该间隔；默认 3s | 周期 2 P1-3 已输出 `retry: 3000` |
| 3.2 | MDN: Last-Event-ID header | <https://developer.mozilla.org/en-US-US/docs/Web/API/EventSource/lastEventId> | 每条事件附 `id: <x>`；重连时浏览器自动在请求头加 `Last-Event-ID: <x>` | 周期 2 P1-3 已附 id + 读 Last-Event-ID；buffer 续传留给上层 |
| 3.3 | HTML Living Standard — Server-Sent Events | <https://html.spec.whatwg.org/multipage/server-sent-events.html> | 完整帧格式：event / data / id / retry 字段、UTF-8 编码、`:comment` 行 | 周期 2 实现严格按 spec；下周期补"二进制事件"（ArrayBuffer） |
| 3.4 | Node.js Streams & SSE best practices（DEV 2025） | <https://dev.to/akdevcraft/node-streams-with-server-sent-events> | `res.write()` 多次调用的成本；`res.flushHeaders()` 提前发；心跳 `\n\n` 注释帧 | 周期 2 `_sse.js` 已用 `flushHeaders` + 注释帧 + 15s heartbeat |
| 3.5 | Connect 4+ 替代 SSE：WebSocket vs SSE 决策（Ably 2026） | <https://ably.com/blog/websockets-vs-server-sent-events> | SSE 优势：HTTP/2 多路复用友好、断线浏览器自动重连、单向流够用 | 维持 SSE 栈；周期 3+ 若需双向（如 tool 实时取消）再补 WebSocket |

**本主题落点**：本周期 P1-3 增量（retry + id + Last-Event-ID）已落地，参考 3.1-3.4。

---

## 4. CSP / Vite 安全 / HTTPS 头部

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 4.1 | GHSA-vg6x-rcgg-rjx6 / CVE-2025-24010 官方 advisory | <https://github.com/advisories/ghsa-vg6x-rcgg-rjx6> | Vite dev server 默认 CORS `*` + WS Origin 校验缺失；fixed in 6.0.9 / 5.4.12 / 4.5.6 | 周期 2 P0-4 已升 Vite 5.4.12+ |
| 4.2 | CVE-2025-24010 技术细节（SentinelOne 2026-01） | <https://www.sentinelone.com/vulnerability-database/cve-2025-24010/> | CWE-346 Origin Validation Error；攻击者通过恶意网站 fetch `http://127.0.0.1:5173/main.js` 读源码 | 周期 2 已修；下周期考虑 dev 强制 `server.host='127.0.0.1'` 防 0.0.0.0 暴露 |
| 4.3 | MDN: Content-Security-Policy connect-src | <https://developer.mozilla.org/en-US-US/docs/Web/HTTP/Headers/Content-Security-Policy/connect-src> | connect-src 控制 fetch / XHR / WebSocket / EventSource；`'self'` + 显式白名单 | 周期 2 P1-6 已加 `localhost:*` / `127.0.0.1:*`；下周期补 `ws://localhost:8080` |
| 4.4 | helmet 官方：默认开启的 headers | <https://helmetjs.github.io/> | CSP / HSTS / X-Content-Type-Options / X-Frame-Options 默认开；推荐 12 项 | 周期 2 已 helmet + 自定义 CSP；周期 3 补 `crossOriginEmbedderPolicy: 'credentialless'` |
| 4.5 | OWASP Secure Headers Project | <https://owasp.org/www-project-secure-headers/> | 推荐 7 项硬性 + 3 项可选；最新 CSP Level 3 指令 | 周期 3 整合 helmet + 自定义 CSP 对照 OWASP 列表 review |

**本主题落点**：本周期 P0-4 + P1-6（Vite 升级 + CSP localhost）已落地，参考 4.1-4.3。

---

## 5. Node.js AbortController / 信号传递

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 5.1 | Node.js AbortController 官方文档 | <https://nodejs.org/api/globals.html#class-abortcontroller> | `new AbortController()` + `signal` 传 fetch / stream / 子进程；`reason` 字段是 AbortError.message | 周期 2 `_sse.js` 已用 AbortController 取消上游 AI fetch |
| 5.2 | Node.js 18+ `fetch` + AbortSignal 超时 | <https://nodejs.org/api/globals.html#fetch> | `fetch(url, { signal })`；`AbortSignal.timeout(ms)` 是简洁超时写法 | 周期 2 AI service 内部 fetch 已传 `signal`；周期 3 统一封装 `withTimeout(promise, ms)` |
| 5.3 | MDN: AbortSignal.any() — 组合多个信号 | <https://developer.mozilla.org/en-US-US/docs/Web/API/AbortSignal/any> | `AbortSignal.any([clientCancel, timeout])` 任一触发即 abort | 周期 3+ 评估"客户端断开 + 服务端超时"双信号串联 |
| 5.4 | Express 5 + Async Errors 指南 | <https://expressjs.com/en/advanced/best-practices-performance.html#error-handling> | Express 4 需要包装 try/catch；Express 5 async error 自动 next(err) | 周期 3 评估"是否升 Express 5"（本项目当前 4.x） |
| 5.5 | Patterns for Aborting Async Work in Node（Medium 2025） | <https://medium.com/patterns/abort-async-node> | 常见模式：req.on('close') → ac.abort()；记得在 finally 里清 setInterval | 周期 2 `_sse.js` 已用此模式 + finally 释放 permit |

**本主题落点**：本周期 P1-3 / P0-5（abort + e.status 透传）已落地，参考 5.1 + 5.5。

---

## 6. ipaddr.js / 内网 IP 段识别

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 6.1 | ipaddr.js README | <https://github.com/whitequark/ipaddr.js> | 解析 IPv4/IPv6 + `getRange()`：unicast / unicastLocal / linkLocal / loopback / multicast / reserved | 周期 3+ 用 ipaddr.js 替换自研 `isPrivateIp` 正则（覆盖 IPv6 + 边界 case） |
| 6.2 | RFC 1918 — Address Allocation for Private Internets | <https://datatracker.ietf.org/doc/html/rfc1918> | 10.0.0.0/8、172.16.0.0/12、192.168.0.0/16 是私网；公网不路由 | 周期 2 P1-8 已覆盖三段；周期 3 补 IPv6 唯一本地地址 fc00::/7 |
| 6.3 | RFC 6890 — Special-Purpose IP Address Registries | <https://datatracker.ietf.org/doc/html/rfc6890> | loopback / link-local / private / 文档示例 / benchmarking 等 25+ 段；isPrivateIp 应该全集检查 | 周期 3 用 ipaddr.js 一行代替手写 25 段正则 |
| 6.4 | IANA IPv4 Special-Purpose Address Registry | <https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml> | 当前 IANA 注册的所有特殊用途 IP 段 | 周期 3 audit 自家 `isPrivateIp` 是否漏段（100.64.0.0/10 CGNAT 等） |
| 6.5 | Cloud 元数据 IP：169.254.169.254 | <https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instancedata-data-retrieval.html> | AWS / GCP / Azure 统一为 169.254.169.254；imdsv2 强制 token 才能取数据 | 周期 2 P1-8 已拒 169.254.*；周期 3 评估"是否禁用 IMDSv1" |

**本主题落点**：本周期 P1-8（`isPrivateIp` 正则）已落地；周期 3 计划切 ipaddr.js。

---

## 7. EventSource 客户端实现

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 7.1 | MDN: EventSource — readyState / open / error / message | <https://developer.mozilla.org/en-US-US/docs/Web/API/EventSource> | 三个 readyState：CONNECTING / OPEN / CLOSED；error 事件后自动重连 | 周期 3 评估自家是否需要 polyfill（IE/老 Safari） |
| 7.2 | EventSource vs fetch + ReadableStream（StackOverflow 2025） | <https://stackoverflow.com/questions/tagged/eventsource> | EventSource 不能自定义 header（Cookie 仍可以），需要自定义 header 就用 fetch + ReadableStream | 周期 3 评估"AI 流式"是否需要 header（Authorization）切换方案 |
| 7.3 | react-streams / react-eventsource hooks | <https://github.com/robhitt/react-use-event-source> | useEventSource 简化 SSE 订阅；自动 cleanup + 状态 | 周期 3+ UI 层若需抽 hook 备选 |
| 7.4 | AbortController for EventSource（Mdn polyfill 提案） | <https://github.com/whatwg/fetch/issues/27> | 原生 EventSource 无 abort（要 `es.close()`）；社区在讨论 Promise + AbortSignal 化 | 周期 3+ 跟踪 spec；短期用闭包 + `close()` 即可 |
| 7.5 | 测试 EventSource：mock-server 模式（vitest） | <https://vitest.dev/guide/mocking.html> | 用 jsdom + vitest 启 mock server 模拟 SSE；assert 自动重连间隔 | 周期 3 补"客户端 EventSource 自动重连"单测 |

**本主题落点**：周期 3 评估是否需 EventSource polyfill 或自研 hook。

---

## 8. Helmet / Express 安全头部最佳实践

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 8.1 | helmet 8.x 官方：默认启用的 headers | <https://helmetjs.github.io/> | 默认 15 项：Content-Security-Policy / Cross-Origin-Opener-Policy / Strict-Transport-Security 等 | 周期 3 audit `server/index.js` helmet 调用是否传全 recommended options |
| 8.2 | OWASP Cheat Sheet: HTTP Headers | <https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html> | 7 项硬性（HSTS / Frame Options / CSP / Referrer-Policy / X-Content-Type-Options / Permissions-Policy / COOP/CORP） | 周期 3 对照打分表逐项核对 |
| 8.3 | Permissions-Policy 详解（Google Web Fundamentals） | <https://developer.chrome.com/articles/permissions-policy-deprecate-permissions-policy-report-only/> | 限制 camera / microphone / geolocation / accelerometer 等 API；Cesium 不需要这些 | 周期 3 配 `permissionsPolicy: { camera: [], microphone: [], geolocation: ['self'] }` |
| 8.4 | COEP / COOP / CORP 三件套 | <https://web.dev/articles/coop-coep> | 启用 `crossOriginIsolated` 即可用 `SharedArrayBuffer` + 高精度定时器 | 周期 3+ 评估（Cesium 部分 worker 用得上） |
| 8.5 | CSP Level 3 — `strict-dynamic` / `nonce-source` | <https://www.w3.org/TR/CSP3/> | `'strict-dynamic'` 配合 nonce 可信内联 script；避免 `'unsafe-inline'` | 周期 3 重构 CSP，避 `'unsafe-inline'` |

**本主题落点**：周期 3 audit + 升级到 OWASP 满分。

---

## 9. Node.js child_process / 沙箱执行（AI Code 沙箱）

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 9.1 | Node.js child_process.exec / spawn 官方 | <https://nodejs.org/api/child_process.html> | 默认继承 env；用 `shell: true` 会跑 `/bin/sh -c`；超时信号可 kill | 周期 2 已用 VM2 + custom sandbox；周期 3 评估 `node:vm` + `--experimental-vm-modules` |
| 9.2 | VM2 vs node:vm 对比（Security 工作组 2024） | <https://github.com/patriksimek/vm2/issues?q=is%3Aissue+security> | VM2 多次 escape；Node 18+ 推荐用 `node:vm` `Script` + 自定义 context | 周期 3 计划废弃 VM2 |
| 9.3 | isolated-vm（WASM-based sandbox） | <https://github.com/laverdet/isolated-vm> | 真正隔离的 V8 isolate + 显式 host call；性能高但 API 复杂 | 周期 3+ 备选 |
| 9.4 | Cloudflare Workers / V8 Isolates 模型 | <https://developers.cloudflare.com/workers/learning/how-workers-works/> | "isolate" 共享 OS 进程但 V8 context 隔离；启动 < 5ms | 周期 3 借鉴"快速 spawn + 强隔离"思路重构 AI sandbox |
| 9.5 | OWASP Sandbox Escape 案例 | <https://owasp.org/www-community/attacks/Code_Injection> | 历史漏洞：VM2 CVE-2023-32314、eval/Function、Prototype Pollution；防御 = minimize API surface | 周期 3 整合：白名单 + 拦截 require + Resource limits |

**本主题落点**：周期 3 AI Code 沙箱重构（废弃 VM2 / 改用 node:vm + 白名单）。

---

## 10. JSON Schema 校验（Ajv 进阶）

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 10.1 | Ajv JSON Type Definitions 官方 | <https://ajv.js.org/json-type-definition.html> | Ajv 8 新版 JTD（JSON Type Definition）= 强 schema、零默认值、严格路径 | 周期 3 评估是否切 JTD |
| 10.2 | Ajv `discriminator` + `oneOf` 联合类型 | <https://ajv.js.org/json-schema.html#discriminator> | `if/then/else` + `oneOf` + `discriminator: 'kind'` 区分 Feature/FeatureCollection/Geometry | 周期 2 已有手写 `normalizeLayer`；周期 3 切 Ajv 减少手写 |
| 10.3 | Ajv async + loadSchema 实践 | <https://ajv.js.org/guide/async-validation.html> | `$async: true` 用于网络 / 数据库交叉校验；用 `addKeyword` 自定义 | 周期 3+ 视需求 |
| 10.4 | Fastify / Hono 用的 TypeBox | <https://github.com/sinclairzx81/typebox> | TS-first schema；编译产物 = TS type + JSON Schema + runtime validator | 周期 3+ 备选（如有 TS 重构计划） |
| 10.5 | ajv-formats（RFC 3339 / email / uri 等） | <https://github.com/ajv-validator/ajv-formats> | 必装：date-time / email / uri / uuid 等格式校验 | 周期 3 引入 ajv-formats |

**本主题落点**：周期 3 评估是否引入 ajv 统一校验 spatial 输入。

---

## 11. Pino / Winston / OpenTelemetry 可观察性

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 11.1 | Pino 官方（最快 JSON logger） | <https://getpino.io/> | 默认 JSON 输出；worker thread 异步；redaction 支持 | 周期 3 引入 pino + redact key（apiKey / baseUrl） |
| 11.2 | OpenTelemetry Node SDK 入门 | <https://opentelemetry.io/docs/languages/js/getting-started/nodejs/> | 标准化 trace/metrics；otel-collector 收 → tempo/jaeger | 周期 3+ 引入 otel-sdk，AI 调用埋点 |
| 11.3 | Pino + AsyncLocalStorage 关联 requestId | <https://github.com/pinojs/pino/blob/main/docs/api.md#logger-chindings-function> | child logger 自动带 `req.id`；串全链路 | 周期 3 引入 `pino-http` middleware |
| 11.4 | W3C Trace Context 规范 | <https://www.w3.org/TR/trace-context/> | `traceparent` header 跨服务传递 | 周期 3+ AI 调用透传 traceparent |
| 11.5 | Grafana Faro / Sentry 前端 RUM | <https://github.com/grafana/faro> | 浏览器侧错误/性能/会话回放；可选 Sentry SDK 替代 | 周期 3 选其一接入 |

**本主题落点**：周期 3 引入 pino + redact 关键字段 + requestId 串联。

---

## 12. CI / PR 检查 + Lint 工具链

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 12.1 | GitHub Actions: Node.js 入门 | <https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-nodejs> | `actions/setup-node@v4` + `actions/cache` 缓存 npm；推荐 4 步：install / lint / test / build | 周期 3 接入基础 CI（npm test / npm run build） |
| 12.2 | ESLint 9 flat config 入门 | <https://eslint.org/docs/latest/use/configure/configuration-files-new> | Flat config = `eslint.config.js`；比 legacy `.eslintrc` 简单 | 周期 3 评估升级到 ESLint 9 |
| 12.3 | Vitest 官方：与 Jest 兼容 API | <https://vitest.dev/guide/comparisons.html> | Vitest = Vite-native + watch + ESM 一等公民；Jest API 兼容 | 周期 3+ 评估把 cjs 测试迁 vitest（更快的 watch） |
| 12.4 | conventional commit + commitlint 强制规范 | <https://commitlint.js.org/> | `feat:` / `fix:` / `chore:` / `refactor:` 强制；CI 检查 PR 标题 | 周期 3 引入 commitlint + husky pre-commit |
| 12.5 | Renovate vs Dependabot（GitHub 自带） | <https://docs.github.com/en/code-security/dependabot> | Dependabot 零配置开箱；Renovate 自定义程度高 | 周期 3 选 Dependabot（项目小、配置少） |

**本主题落点**：周期 3 接入 GitHub Actions + commitlint + Dependabot。

---

## Top5 优先级（追加进 upcoming-work.md，覆盖周期 1 Top5）

| 排名 | 主题 | 行动 | 落到哪个 ID |
| --- | ---- | ---- | ----------- |
| 1 | **SSRF 防护升级（OWASP 全套）** | 当前 `validateBaseUrlWithDns` 只做"URL 解析 + DNS + IP 分类"三步；周期 3 补"禁重定向（`redirect:'manual'`） + 链路重校验" + 引入 ipaddr.js 替代正则 | 周期 3 P0-1 |
| 2 | **速率限制分布式化（Redis Sliding Window）** | 当前 `slidingWindow` 仅进程内；周期 3 引入 `rate-limit-redis` + `ZADD` 实现真正分布式限流 + 集群级 reset | 周期 3 P0-2 |
| 3 | **CSP 全面审计（OWASP 7 项 + Permissions-Policy）** | 当前只补了 connect-src；周期 3 对照 OWASP HTTP Headers Cheat Sheet 逐项打分 + 引入 Permissions-Policy | 周期 3 P1-1 |
| 4 | **AI Code 沙箱重构（废弃 VM2）** | VM2 多次 escape + 已停止维护；周期 3 改用 `node:vm` `Script` + 显式 context + Resource limits + 白名单 require | 周期 3 P1-2 |
| 5 | **可观察性（pino + redact + requestId）** | 当前无统一日志；周期 3 引入 pino + pino-http（AsyncLocalStorage 串联 requestId）+ redact API Key | 周期 3 P1-3 |
