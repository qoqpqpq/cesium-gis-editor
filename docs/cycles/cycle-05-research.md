# Cycle 05 — 调研报告（Research Notes）

> **周期**: N=5（继承期）
> **范围**: 与本周期 P0/P1/P2 强相关的 12 个技术主题；每个主题 5 条链接 + 一句话摘要 + 行动建议。
> **本文件作用**: 留下可被后续周期复用的"权威资料库"；Top5 摘要同时落入 `docs/release-notes/upcoming-work.md` 的"调研 Top5"段（覆盖周期 4 Top5）。

---

## 1. SSRF 防御运维 / metadata IP 维护

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 1.1 | cloud-metadata.com 社区维护 | <https://cloud-metadata.com> | "AWS/GCP/Azure/Oracle/Aliyun 全部 metadata IP 段，含 IPv6" | 周期 5 P0-1 已建 docs/security/metadata-ips.md；周期 6 写 cron 自动同步 |
| 1.2 | AWS Nitro Enclaves IPv6 IMDS | <https://docs.aws.amazon.com/enclaves/latest/user/nitro-enclave-concepts.html> | "fd00:ec2::254（IPv4）+ fd00:ec2::253（IPv6 ECS task）" | 周期 5 P0-1 已加 fd00:ec2::253 |
| 1.3 | AWS ECS task metadata v2 | <https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-metadata-endpoint-v2.html> | "169.254.170.2（IPv4）+ fd00:ec2::253（IPv6）" | 周期 5 P0-1 已加 |
| 1.4 | GCP metadata server | <https://cloud.google.com/compute/docs/metadata/overview> | "metadata.google.internal（hostname）+ 169.254.169.254（IP）" | 周期 5 P0-1 已加 metadata.google.internal 到 isMetadataHost |
| 1.5 | Azure Instance Metadata Service | <https://learn.microsoft.com/en-us/azure/virtual-machines/instance-metadata-service> | "169.254.169.254（IPv4）IMDSv1/v2 with header" | 周期 5 P0-1 已加 IMDSv2 token 头校验 TODO |

**本主题落点**：本周期 P0-1 完成 ECS IPv6 metadata + 维护文档 + cron spec；周期 6+ 实施"季度自动同步 IANA + cloud-metadata.com 列表"。

---

## 2. Redis Lua 脚本 atomic 操作

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 2.1 | Redis EVAL / EVALSHA 文档 | <https://redis.io/docs/latest/commands/eval/> | "EVAL 一段 Lua 脚本 atomic 执行；EVALSHA 通过 SHA1 缓存" | 周期 5 P0-2 已实现 EVAL；周期 6 评估 SCRIPT LOAD + EVALSHA 缓存 |
| 2.2 | Redis Sliding Window 实战 | <https://redis.io/learn/howtos/solutions/microservices/api-gateway-rate-limiting> | "EVAL 内 ZREMRANGEBYSCORE + ZADD + ZCARD 一气呵成" | 周期 5 P0-2 已实现 LUA_SLIDING_WINDOW |
| 2.3 | Redis 多级限流 | <https://blog.cloudflare.com/counting-things-a-lot-of-different-things/> | "IP / user / API key 多维度独立计 limit" | 周期 5 P0-2 已实现 multiLevelLimiter |
| 2.4 | Redis pipelining 性能 | <https://redis.io/docs/latest/develop/use/pipelining/> | "多命令 batch 1 RTT；吞吐 5x" | 周期 6 评估（Lua 已 atomic 1 RTT，pipelining 收益小） |
| 2.5 | Redis Cluster 与 Lua | <https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/> | "Lua 在 cluster 模式下必须所有 keys 在同一 slot；用 {tag}" | 周期 6+ 若上 cluster 才需要 |

**本主题落点**：本周期 P0-2 完成 Lua atomic + multi-level 限流；周期 6 评估 SCRIPT LOAD 缓存 + 限流维度扩展（按 endpoint 类别）。

---

## 3. OpenTelemetry Node SDK 实战

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 3.1 | Otel Node SDK Getting Started | <https://opentelemetry.io/docs/languages/js/getting-started/nodejs/> | "@opentelemetry/sdk-node + auto-instrumentations-node 一键启动" | 周期 6 评估"自研 W3C traceparent → 升级 Otel SDK" |
| 3.2 | Otel Logs Bridge | <https://opentelemetry.io/docs/concepts/signals/logs/> | "把应用日志桥接到 Otel：自动注入 traceId" | 周期 6 评估"logger 输出 → Otel log exporter" |
| 3.3 | Otel Metrics | <https://opentelemetry.io/docs/concepts/signals/metrics/> | "Counter / Gauge / Histogram；3 类 signal 之一" | 周期 6 评估"加 metrics（请求数 / 延迟 / 错误率）" |
| 3.4 | Otel Collector + Jaeger | <https://opentelemetry.io/docs/collector/> | "OTLP 协议 → collector → 后端（Jaeger / Tempo）" | 周期 7+ 部署 |
| 3.5 | Pino + Otel 集成 | <https://github.com/pinojs/pino/blob/main/docs/api.md#logger-chindings-function> | "pino 性能 + Otel 自动 trace 关联" | 周期 6 评估"pino 真正集成" |

**本主题落点**：本周期未实施 Otel SDK（依赖太重，零依赖 W3C traceparent 够用）；周期 6+ 评估。

---

## 4. worker_threads CPU/mem 监控深入

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 4.1 | process.cpuUsage() 文档 | <https://nodejs.org/api/process.html#processcpuusagepreviousvalue> | "返回 {user, system} 累积微秒；与 previousValue 求 delta" | 周期 5 P1-2 已用 |
| 4.2 | Node.js Event Loop 调度 | <https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick> | "timers / pending / poll / check / close 五阶段；microtask 在 phase 之间全部 drain" | 周期 5 P1-2 关键洞察：microtask 持续跑会饿死 setInterval |
| 4.3 | worker_threads resourceLimits | <https://nodejs.org/api/worker_threads.html#new-workerfilename-options> | "maxOldGenerationSizeMb / maxYoungGenerationSizeMb / codeRangeSizeMb" | 周期 4 P1-2 已用；周期 6 评估 + CPU time limit |
| 4.4 | v8 writeHeapSnapshot 监控 | <https://nodejs.org/api/heapdump.html> | "捕获 V8 heap snapshot 到磁盘；事后分析" | 周期 6+ 评估"可疑代码自动 dump" |
| 4.5 | Resource Limits 实战 | <https://kinsta.com/blog/node-js-worker-threads/> | "real-world 经验：CPU 监控 + 自杀机制" | 周期 6 评估"watchdog 误杀场景" |

**本主题落点**：本周期 P1-2 完成 CPU watchdog（microtask 饿死 + setTimeout(exit) 解决）；周期 6 评估 v8 heapSnapshot + worker.terminate 后清理。

---

## 5. Helmet 8.x 与 Permissions-Policy 迁移

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 5.1 | helmet 8.0.0 升级指南 | <https://github.com/helmetjs/helmet/blob/main/CHANGELOG.md> | "HSTS 默认 max-age 改为 1 年；COEP require-corp 默认开" | 周期 5 P0-3 修复 COEP=false（Cesium 瓦片兼容） |
| 5.2 | helmet 8 Permissions-Policy 官方支持 | <https://helmetjs.github.io/> | "8.x 原生支持 Permissions-Policy middleware" | 周期 6 评估"用 helmet 8 内置替代手写 20 项" |
| 5.3 | MDN Permissions-Policy | <https://developer.mozilla.org/en-US-US/docs/Web/HTTP/Headers/Permissions-Policy> | "浏览器实现：'()' / '(self)' / '(src)' 三种 allowlist 形式" | 周期 5 P1-1 20 项已按此规范 |
| 5.4 | helmet 8 breaking changes 详细 | <https://github.com/helmetjs/helmet/releases/tag/v8.0.0> | "drop Node 16/17；HSTS includeSubDomains 拼错由 warn 变 throw" | 周期 5 P0-3 已避开（没显式 includeSubDomains） |
| 5.5 | Permissions-Policy 浏览器实现进度 | <https://github.com/w3c/webappsec-permissions-policy/blob/main/features.md> | "各浏览器对各种 API 的支持矩阵" | 周期 6 评估"减少未实现的 policy" |

**本主题落点**：本周期 P0-3 修复 helmet 8.x 升级后的安全头部回归；周期 6 评估"用 helmet 8 内置 Permissions-Policy 替代手写"。

---

## 6. Redis 集群 / Sentinel / Cluster 模式

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 6.1 | Redis Sentinel 文档 | <https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/> | "哨兵自动故障转移；适合中小流量" | 周期 6 评估 |
| 6.2 | Redis Cluster 文档 | <https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/> | "16384 slot；6+ 节点起步；适合 > 10K QPS" | 周期 7+ |
| 6.3 | ioredis vs node-redis | <https://github.com/redis/ioredis#introduction> | "ioredis 支持 cluster / sentinel / pipelining" | 周期 6 评估"用 ioredis 替代自研 RESP 客户端" |
| 6.4 | docker-compose 起 Redis | <https://docs.docker.com/compose/compose-file/compose-file-v3/> | "本地 dev 起 redis:7-alpine" | 周期 6 写 docker-compose.yml + spec 跑真实 ZADD |
| 6.5 | Redis 内存优化 | <https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/memory-optimization/> | "压缩 list / ziplist 节省内存" | 周期 7+ |

**本主题落点**：本周期 P0-2 完成单节点 Redis 真实实现；周期 6 评估 docker-compose + ioredis 替代。

---

## 7. Sliding Window / Token Bucket / Leaky Bucket 算法

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 7.1 | Cloudflare Rate Limiting 工业实现 | <https://blog.cloudflare.com/counting-things-a-lot-of-different-things/> | "Sliding Window Counter：O(1) per request、近似 Sliding Window Log" | 周期 5 P0-2 仍用 Sliding Window Log；周期 6 评估 Counter 版 |
| 7.2 | OWASP API Security — Resource Consumption | <https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/> | "对每个 API / user / API key 独立限流" | 周期 5 P0-2 multiLevelLimiter 已实施 |
| 7.3 | Token Bucket 实战 | <https://en.wikipedia.org/wiki/Token_bucket> | "burst-friendly；适合 AI 端点（偶发长 prompt）" | 周期 6 评估"AI 端点换 Token Bucket" |
| 7.4 | Sliding Window vs Leaky Bucket 对比 | <https://www.anubhavmishra.com/rate-limiting-algorithms> | "4 种算法对比：内存 / 突发 / 平滑 / 实现" | 周期 6 按 endpoint 选不同算法 |
| 7.5 | IETF draft-ietf-httpapi-ratelimit-headers | <https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers> | "无 X 前缀的 RateLimit-Limit/Remaining/Reset 标准" | 周期 6 评估"改无 X 前缀" |

**本主题落点**：本周期 P0-2 完成 Lua atomic Sliding Window + multi-level；周期 6 评估 Token Bucket + 标准 header。

---

## 8. 沙箱深度隔离（VM / Worker / Isolate / microVM）

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 8.1 | node:vm vs isolated-vm vs VM2 | <https://github.com/nodejs/node/issues/40538> | "VM2 escape 多次；周期 3 废弃" | 周期 5 P1-2 仍用 worker；周期 6 评估 isolated-vm |
| 8.2 | isolated-vm（V8 isolate） | <https://github.com/laverdet/isolated-vm> | "真 V8 isolate + 显式 host call；性能高但 API 复杂" | 周期 6 评估"高安全要求场景" |
| 8.3 | gVisor（用户态内核） | <https://gvisor.dev/> | "Google 出品；拦截 syscall；适合容器内" | 周期 7+ |
| 8.4 | Firecracker microVM | <https://firecracker-microvm.github.io/> | "AWS Lambda 底层；< 5ms 启动；强隔离" | 周期 7+ 评估"AI 代码跑在 microVM" |
| 8.5 | OWASP Sandbox Escape 案例 | <https://cheatsheetseries.owasp.org/cheatsheets/Sandbox_Escape.html> | "防御 = minimize API surface + Resource limits + Whitelist require" | 周期 5 P1-2 仍按此原则 |

**本主题落点**：本周期 P1-2 完成 worker CPU watchdog；周期 6 评估 isolated-vm 备选 + worker.terminate 后清理。

---

## 9. Pino 性能 vs 自研 logger

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 9.1 | Pino 官方 | <https://getpino.io/> | "5x faster than Winston；pino-http middleware" | 周期 6 评估"是否值得为性能换 pino" |
| 9.2 | Pino vs Bunyan vs Winston benchmark | <https://github.com/pinojs/pino/blob/main/docs/benchmarks.md> | "Pino 6x Winston / 3x Bunyan" | 周期 6 评估 |
| 9.3 | pino-http middleware | <https://github.com/pinojs/pino-http> | "自动注入 reqId + http_start/http_end 事件" | 周期 6 评估"替换 httpLoggerMiddleware" |
| 9.4 | Node.js process.stdout.write 性能 | <https://nodejs.org/api/process.html#processstdout> | "process.stdout 写 buffer；高 QPS 需 pino-fastredaction" | 周期 6 评估 |
| 9.5 | console.log vs JSON.stringify 性能 | <https://web.dev/articles/optimize-long-tasks> | "console.log 解析 + 格式化慢；JSON.stringify 直接" | 周期 4 P1-1 emit 性能优化已采纳；周期 6 持续 benchmark |

**本主题落点**：本周期未升级 pino（自研够用）；周期 6 评估。

---

## 10. 响应压缩（gzip / deflate / br）客户端

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 10.1 | MDN: CompressionStream | <https://developer.mozilla.org/en-US-US/docs/Web/API/CompressionStream> | "浏览器原生 streaming API；deflate / deflate-raw / gzip" | 周期 6 评估"客户端 DecompressionStream" |
| 10.2 | lz-string 客户端压缩 | <https://pieroxy.net/blog/pages/lz-string/index.html> | "30-50% 节省；compressToEncodedURIComponent" | 周期 6 评估 |
| 10.3 | brotli (Br 压缩) | <https://github.com/google/brotli> | "文本压缩比 zlib 高 20%；但 Node 内置无 brotli" | 周期 7+ |
| 10.4 | HTTP 头 Accept-Encoding 协商 | <https://developer.mozilla.org/en-US-US/docs/Web/HTTP/Headers/Accept-Encoding> | "gzip / br / deflate 客户端声明" | 周期 4 P1-3 仅 URL 端；周期 6 评估"API response 也开 gzip" |
| 10.5 | Wikipedia: DEFLATE | <https://en.wikipedia.org/wiki/Deflate> | "zlib / gzip / zip 底层算法；LZ77 + Huffman" | 通用背景 |

**本主题落点**：本周期未做客户端解压 polyfill（周期 4 P1-3 仅 Node 端 zlib）；周期 6 评估。

---

## 11. Rate Limit Headers 标准化

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 11.1 | IETF draft-ietf-httpapi-ratelimit-headers | <https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers> | "无 X 前缀：RateLimit-Limit / Remaining / Reset" | 周期 6 评估"改无 X 前缀" |
| 11.2 | RFC 6585 429 + Retry-After | <https://datatracker.ietf.org/doc/html/rfc6585#section-4> | "429 状态码 + Retry-After（秒）" | 周期 4 P1-9 已设 |
| 11.3 | MDN 429 Too Many Requests | <https://developer.mozilla.org/en-US-US/docs/Web/HTTP/Status/429> | "客户端实现：尊重 Retry-After 头" | 周期 4 P1-9 已设 |
| 11.4 | RFC 7231 § 7.1.3 Retry-After | <https://datatracker.ietf.org/doc/html/rfc7231#section-7.1.3> | "HTTP-date 或秒数；统一标准" | 周期 4 P1-9 用了秒数 |
| 11.5 | Stripe API Rate Limiting 设计 | <https://stripe.com/blog/rate-limiters> | "每 API key 40 req/s；返回 X-RateLimit-Reset" | 周期 6 参考 |

**本主题落点**：本周期未做 header 标准化；周期 6 评估。

---

## 12. 限流策略与商业化（per-tier / per-endpoint）

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 12.1 | GitHub API Rate Limiting | <https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting> | "5000 req/h（认证）+ 60 req/h（未认证）" | 周期 6 评估 |
| 12.2 | Twitter API Rate Limiting | <https://developer.twitter.com/en/docs/twitter-api/rate-limits> | "per-endpoint + per-user + per-app 三维" | 周期 6 评估 |
| 12.3 | OpenAI API Rate Limiting | <https://platform.openai.com/docs/guides/rate-limits> | "RPM + TPM + 队列；429 + Retry-After" | 周期 6 评估 |
| 12.4 | Stripe Rate Limiting 实战 | <https://stripe.com/blog/rate-limiters> | "10 行 Go 代码实现 token bucket" | 通用 |
| 12.5 | Per-endpoint Rate Limiting（OWASP） | <https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/> | "每个 endpoint 独立限流；防止雪崩" | 周期 6 评估"apiLimiter / aiLimiter / recommendLimiter / spatialLimiter 已存在" |

**本主题落点**：本周期 P0-2 multiLevelLimiter 已支持 userId / apikey；周期 6 评估"per-endpoint + 商业 tier"。

---

## Top5 优先级（追加进 upcoming-work.md，覆盖周期 4 Top5）

| 排名 | 主题 | 行动 | 落到哪个 ID |
| --- | ---- | ---- | ----------- |
| 1 | **SSRF metadata IP 同步 + IANA 季度维护** | 周期 5 P0-1 已建维护文档 + cron spec；周期 6 写"自动从 cloud-metadata.com 拉取新 IP"脚本 | 周期 6 P0-1 |
| 2 | **限流算法 + 标准 header** | 周期 5 P0-2 完成 Lua atomic + multi-level；周期 6 评估 Token Bucket（AI 端点）+ IETF draft 标准 header（去 X 前缀）+ SCRIPT LOAD EVALSHA 缓存 | 周期 6 P0-2 |
| 3 | **可观察性升级（Otel SDK + Metrics）** | 周期 4 P1-1 实施自研 W3C traceparent；周期 6 评估全 Otel SDK（auto-instrumentation）+ Metrics（Prometheus）+ Logs Bridge | 周期 6 P1-1 |
| 4 | **沙箱深度隔离（CPU watchdog + isolated-vm）** | 周期 5 P1-2 完成 worker CPU watchdog；周期 6 评估 isolated-vm（高安全要求）+ v8 heapSnapshot | 周期 6 P1-2 |
| 5 | **CompressionStream 客户端 polyfill** | 周期 4 P1-3 实施 zlib Node 端压缩；周期 6 浏览器侧引入 pako / fflate 做 DecompressionStream polyfill | 周期 6 P1-3 |
