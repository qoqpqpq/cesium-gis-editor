# Cycle 04 — 调研报告（Research Notes）

> **周期**: N=4（继承期）
> **范围**: 与本周期 P0/P1/P2 强相关的 12 个技术主题；每个主题 5 条链接 + 一句话摘要 + 行动建议。
> **本文件作用**: 留下可被后续周期复用的"权威资料库"；Top5 摘要同时落入 `docs/release-notes/upcoming-work.md` 的"调研 Top5"段（覆盖周期 3 Top5）。

---

## 1. SSRF 终极防御：host allowlist + pin IP + metadata 黑名单

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 1.1 | OWASP Host Header Injection Prevention | <https://cheatsheetseries.owasp.org/cheatsheets/Host_Header_Injection_Prevention_Cheat_Sheet.html> | "校验 Host 头只允许预期值；防 cache poisoning + SSRF bypass" | 周期 4 P0-1 已加 validateHostHeader middleware；周期 5+ 评估"按 env 区分 dev/prod allowlist" |
| 1.2 | AWS IMDSv2: token-required metadata | <https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instancedata-data-retrieval.html> | IMDSv2 需 token header（防 SSRF 无 token 取元数据） | 周期 4 P0-1 已黑名单 169.254.169.254；周期 5+ 评估"业务代码也禁用 IMDSv1" |
| 1.3 | AWS Nitro Enclaves IPv6 IMDS | <https://docs.aws.amazon.com/enclaves/latest/user/nitro-enclave-concepts.html> | "fd00:ec2::254 — Nitro instances 的 IPv6 metadata endpoint" | 周期 4 P0-1 已黑名单；周期 5+ 加 ECS task metadata IPv6 段（fd00:ec2::253） |
| 1.4 | Cloud Metadata IP 全集（2026 整理） | <https://cloud-metadata.com>（社区 wiki） | "AWS/GCP/Azure/Oracle/Aliyun 全部 metadata IP 段" | 周期 5+ 维护黑名单表（与 IANA 特殊段同步） |
| 1.5 | node:net socket 直接连接 + TLS SNI | <https://nodejs.org/api/net.html#class-netsocket> | `socket.connect(port, host)` 后手动 `tls.connect({socket, servername: originalHost})` | 周期 4 P0-1 在 safeFetch 实现 pin IP（用 IP 直连 + Host 头保原 host） |

**本主题落点**：本周期 P0-1 完成 host allowlist + metadata 黑名单 + pin IP；OWASP 6 步 + 2 步加固全齐。

---

## 2. Redis 协议与 RESP 客户端实现

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 2.1 | Redis Protocol Specification (RESP) | <https://redis.io/docs/latest/develop/reference/protocol-spec/> | "5 种 RESP 类型：Simple String / Error / Integer / Bulk String / Array" | 周期 4 P0-2 已实现 encode/decode；周期 5+ 评估 "Inline commands" 与 "Pubsub" |
| 2.2 | Redis Sliding Window with Sorted Sets | <https://redis.io/learn/howtos/solutions/microservices/api-gateway-rate-limiting> | "ZADD + ZREMRANGEBYSCORE + ZCARD" 三步 sliding window | 周期 4 P0-2 已实施；周期 5+ 加 Lua 脚本 atomic |
| 2.3 | Redis Lua 脚本 | <https://redis.io/docs/latest/develop/interact/programmability/eval-intro/> | "EVAL/EVALSHA 一段 Lua 实现 atomic check-and-add" | 周期 5+ 评估"用 Lua 替代 ZADD+ZREM 2 步"减少 race |
| 2.4 | ioredis vs node-redis 对比 | <https://github.com/redis/ioredis#introduction> | "ioredis 支持 cluster / sentinel / pipelining；node-redis v4+ 也支持" | 周期 4 P0-2 选自研 RESP 客户端（零依赖）；周期 5+ 评估"用 ioredis 简化代码" |
| 2.5 | docker-compose 起 Redis | <https://docs.docker.com/compose/compose-file/compose-file-v3/> | 本地 dev 起 redis:7-alpine + persistence 配置 | 周期 5+ 写 docker-compose.yml + 一键验证 spec |

**本主题落点**：本周期 P0-2 实施自研 RESP 客户端 + ZADD sliding window；周期 5+ Lua atomic + docker-compose。

---

## 3. OpenTelemetry Node SDK / 分布式追踪

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 3.1 | OpenTelemetry Node.js 官方 | <https://opentelemetry.io/docs/languages/js/getting-started/nodejs/> | "@opentelemetry/sdk-node + auto-instrumentations-node 一键启动" | 周期 4 P1-1 实施自研 traceparent 透传（零依赖）；周期 5+ 评估"全 Otel SDK" |
| 3.2 | W3C Trace Context 规范 | <https://www.w3.org/TR/trace-context/> | "00-<trace-id 32hex>-<span-id 16hex>-<flags 2hex> 55 字符" | 周期 4 P1-1 已实现；周期 5+ 补 tracestate / baggage |
| 3.3 | OpenTelemetry Logs Bridge | <https://opentelemetry.io/docs/specs/otel/logs/> | "把应用日志桥接到 Otel，可集中查 + 关联 trace" | 周期 5+ 评估 |
| 3.4 | OpenTelemetry Collector | <https://opentelemetry.io/docs/collector/> | "OTLP 协议；可导出到 Jaeger / Tempo / Zipkin" | 周期 5+ 起 docker-compose（otel-collector + jaeger） |
| 3.5 | Pino + OpenTelemetry 集成 | <https://github.com/pinojs/pino/blob/main/docs/api.md#logger-chindings-function> | "pino 自身不输出 traceId，需用 Otel context propagation" | 周期 5+ 评估"pino 真正接 Otel" |

**本主题落点**：本周期 P1-1 实施自研 W3C traceparent 透传；周期 5+ 评估全 Otel SDK。

---

## 4. worker_threads / Resource Limits / V8 沙箱

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 4.1 | Node.js worker_threads 官方 | <https://nodejs.org/api/worker_threads.html> | "真线程隔离 + workerData + postMessage 通信" | 周期 4 P1-2 已用；周期 5+ 加 SharedArrayBuffer 共享大对象 |
| 4.2 | Node.js resourceLimits option | <https://nodejs.org/api/worker_threads.html#new-workerfilename-options> | "maxOldGenerationSizeMb / maxYoungGenerationSizeMb / codeRangeSizeMb" | 周期 4 P1-2 已用 heapMb=64；周期 5+ 评估"按 code complexity 动态调" |
| 4.3 | Node.js v8 heap 监控 | <https://nodejs.org/api/v8.html#v8getheapstatistics> | "v8.getHeapStatistics() 采 totalHeapSize / usedHeapSize" | 周期 5+ 加 worker 主动上报 heap 指标 |
| 4.4 | process.cpuUsage() 监控 | <https://nodejs.org/api/process.html#processcpuusagepreviousvalue> | "process.cpuUsage() 返回 user + system CPU time" | 周期 5+ 评估"watchdog 检测 worker CPU 超阈值" |
| 4.5 | isolated-vm（更强隔离） | <https://github.com/laverdet/isolated-vm> | "V8 isolate + 显式 host call + 不可访问 Node 全局" | 周期 5+ 评估"高安全要求场景" |

**本主题落点**：本周期 P1-2 实施 worker_threads 隔离 + heap 限制；周期 5+ 加 CPU 监控 + isolated-vm 备选。

---

## 5. URL 压缩（zlib / lz-string / brotli）

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 5.1 | MDN: CompressionStream (浏览器原生) | <https://developer.mozilla.org/en-US-US/docs/Web/API/CompressionStream> | "浏览器原生 streaming API；deflate / deflate-raw / gzip" | 周期 4 P1-3 Node 端用 zlib；周期 5+ 浏览器侧用 CompressionStream |
| 5.2 | lz-string (WTFPL) | <https://pieroxy.net/blog/pages/lz-string/index.html> | "客户端压缩；compressToEncodedURIComponent 30-50% 节省" | 周期 4 P1-3 选 zlib（零依赖 + 更强压缩比）；周期 5+ 评估 lz-string（更小 bundle） |
| 5.3 | brotli (Br 压缩) | <https://github.com/google/brotli> | "Google 出品，文本压缩比 zlib 高 20%；但 Node 内置"（需 npm 装） | 周期 5+ 评估（需安装 brotli 包） |
| 5.4 | HTTP 头 Accept-Encoding 协商 | <https://developer.mozilla.org/en-US-US/docs/Web/HTTP/Headers/Accept-Encoding> | "gzip / br / deflate 客户端声明" | 周期 4 P1-3 仅 URL 端；周期 5+ 评估 "API response 也开 gzip" |
| 5.5 | Wikipedia: DEFLATE | <https://en.wikipedia.org/wiki/Deflate> | "zlib / gzip / zip 底层算法；LZ77 + Huffman" | 通用背景 |

**本主题落点**：本周期 P1-3 实施 zlib deflateSync 压缩（Node 内置）；中文 73x 压缩比惊艳。

---

## 6. helmet 8.x 升级与 COEP / Permissions-Policy

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 6.1 | helmet 8.0 升级指南 | <https://github.com/helmetjs/helmet/blob/main/CHANGELOG.md> | "v8.0.0 (2024-09) 默认 COOP/COEP/CORP" | 周期 5+ 评估升级（先 review CHANGELOG） |
| 6.2 | helmet 8 Permissions-Policy | <https://helmetjs.github.io/> | "8.x 原生支持 Permissions-Policy middleware" | 周期 5+ 升级时移除手写 middleware |
| 6.3 | MDN: Cross-Origin-Embedder-Policy | <https://developer.mozilla.org/en-US-US/docs/Web/HTTP/Headers/Cross-Origin-Embedder-Policy> | "require-corp / credentialless / unsafe-none" | 周期 3 P1-1 选 false（Cesium 瓦片 CDN 兼容）；周期 5+ 评估 `credentialless` |
| 6.4 | Cross-Origin-Opener-Policy 实战 | <https://web.dev/articles/coop-coep> | "same-origin / same-origin-allow-popups / unsafe-none" | 周期 3 P1-1 选 same-origin；周期 5+ 评估 popup 场景 |
| 6.5 | Permissions-Policy 浏览器支持 | <https://github.com/w3c/webappsec-permissions-policy/blob/main/features.md> | "各浏览器对各种 API 的支持矩阵" | 周期 5+ 评估"我们限制的 API 实际有多少浏览器支持" |

**本主题落点**：本周期 P1-1 已加 Permissions-Policy；周期 5+ 评估 helmet 8.x 升级 + COEP credentialless。

---

## 7. Sliding Window / Token Bucket 限流算法实战

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 7.1 | Cloudflare Rate Limiting 实现 | <https://blog.cloudflare.com/counting-things-a-lot-of-different-things/> | "Sliding Window Counter：工业级折中（O(1) + 近 Sliding Window Log）" | 周期 4 P0-2 仍 Sliding Window Log；周期 5+ 评估 Counter 版（更省内存） |
| 7.2 | OWASP API Security — Resource Consumption | <https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/> | "对每个 API / user 独立限流" | 周期 5+ 评估"AI key 二级限流" |
| 7.3 | Token Bucket 实战 | <https://en.wikipedia.org/wiki/Token_bucket> | "burst-friendly；适合 AI 端点（偶发长 prompt）" | 周期 5+ 评估"AI 端点换 Token Bucket" |
| 7.4 | Sliding Window vs Leaky Bucket 对比 | <https://www.anubhavmishra.com/rate-limiting-algorithms> | "4 种算法对比：内存 / 突发 / 平滑 / 实现" | 周期 5+ 按 endpoint 类型选不同算法 |
| 7.5 | IETF draft-ietf-httpapi-ratelimit-headers | <https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers> | "无 X 前缀的 RateLimit-Limit/Remaining/Reset 标准" | 周期 5+ 评估"改无 X 前缀" |

**本主题落点**：本周期 P0-2 实施 Redis Sliding Window Log；周期 5+ 评估 Token Bucket + 标准 header。

---

## 8. Pino vs 自研 logger 性能

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 8.1 | Pino 官方 | <https://getpino.io/> | "5x faster than Winston；pino-http middleware" | 周期 4 P1-1 实施自研性能优化（10000 emit < 200ms）；周期 5+ 评估真引入 pino |
| 8.2 | Pino vs Bunyan vs Winston benchmark | <https://github.com/pinojs/pino/blob/main/docs/benchmarks.md> | "Pino 6x Winston / 3x Bunyan" | 周期 5+ 评估 |
| 8.3 | pino-http middleware | <https://github.com/pinojs/pino-http> | "自动注入 reqId + http_start/http_end 事件" | 周期 5+ 评估"替换 httpLoggerMiddleware" |
| 8.4 | Node.js process.stdout.write 性能 | <https://nodejs.org/api/process.html#processstdout> | "process.stdout 写 buffer；高 QPS 需 pino-fastredaction" | 周期 5+ 评估 |
| 8.5 | console.log vs JSON.stringify 性能 | <https://web.dev/articles/optimize-long-tasks> | "console.log 解析 + 格式化慢；JSON.stringify 直接" | 周期 4 P1-1 emit 性能优化已采纳；周期 5+ 持续 benchmark |

**本主题落点**：本周期 P1-1 实施自研 logger 性能优化；周期 5+ 评估真正引入 pino。

---

## 9. 安全沙箱深度对比（vm / worker / isolate / gVisor）

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 9.1 | node:vm vs isolated-vm vs VM2 | <https://github.com/nodejs/node/issues/40538> | "VM2 escape 多次；周期 4 周期 3 已废弃" | 周期 4 P1-2 worker 隔离；周期 5+ 评估 isolated-vm |
| 9.2 | gVisor（用户态内核） | <https://gvisor.dev/> | "Google 出品；拦截 syscall；适合容器内" | 周期 5+ 评估"沙箱外加层 syscall 隔离" |
| 9.3 | Firecracker microVM | <https://firecracker-microvm.github.io/> | "AWS Lambda 底层；< 5ms 启动；强隔离" | 周期 5+ 评估"AI 代码跑在 microVM" |
| 9.4 | Deno Sandbox 实战 | <https://docs.deno.com/runtime/manual/runtime/permissions/> | "Deno 用 V8 isolate + 权限系统做沙箱" | 通用背景 |
| 9.5 | Sandstorm.io 沙箱 | <https://sandstorm.io/> | "用户跑应用代码的开源沙箱" | 通用背景 |

**本主题落点**：本周期 P1-2 实施 worker_threads；周期 5+ 评估 isolated-vm / microVM。

---

## 10. RESP 协议客户端 edge case

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 10.1 | Redis NULL bulk string | <https://redis.io/docs/latest/develop/reference/protocol-spec/#null-bulk-strings> | "$-1\\r\\n 表示 null" | 周期 4 P0-2 已处理 |
| 10.2 | Redis pipelining | <https://redis.io/docs/latest/develop/use/pipelining/> | "批量命令 1 次 RTT；吞吐提升 5x" | 周期 5+ 评估"批量 hit() 调用 pipelined" |
| 10.3 | Redis Cluster 协议 | <https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/> | "MOVED 301 错误重定向到正确节点" | 周期 5+ 评估"cluster 模式" |
| 10.4 | Redis Sentinel HA | <https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/> | "哨兵自动故障转移" | 周期 5+ 评估 |
| 10.5 | Redis pub/sub | <https://redis.io/docs/latest/develop/pubsub/> | "SUBSCRIBE / PUBLISH" | 周期 5+ 评估"实时告警 → 业务订阅" |

**本主题落点**：本周期 P0-2 实现 RESP 协议核心；周期 5+ 评估 pipelining / cluster。

---

## 11. zlib 浏览器 / Node 双端压缩

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 11.1 | MDN: CompressionStream | <https://developer.mozilla.org/en-US-US/docs/Web/API/CompressionStream> | "浏览器原生 streaming API" | 周期 4 P1-3 Node 用 zlib；周期 5+ 浏览器侧用 CompressionStream |
| 11.2 | pako (zlib port) | <https://github.com/nodeca/pako> | "100% JS 实现 zlib；客户端可用" | 周期 5+ 评估"客户端引入 pako" |
| 11.3 | fflate (更小更快) | <https://github.com/101arrowz/fflate> | "比 pako 小 30%、快 30%" | 周期 5+ 评估"换 fflate" |
| 11.4 | Node.js zlib sync API | <https://nodejs.org/api/zlib.html#synchronous-api> | "deflateSync / inflateSync / gzipSync" | 周期 4 P1-3 已用；周期 5+ 评估 async stream |
| 11.5 | brotli npm 包 | <https://github.com/foliojs/brotli.js> | "wasm 实现 brotli；浏览器 + Node 通用" | 周期 5+ 评估（更高压缩比） |

**本主题落点**：本周期 P1-3 实施 zlib sync API；周期 5+ 评估 CompressionStream / pako / fflate。

---

## 12. observability 全链路（Log + Trace + Metric）

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 12.1 | "三支柱"：Logs / Metrics / Traces | <https://www.oreilly.com/library/view/distributed-systems-observability/9781492033431/ch04.html> | "三件套缺一不可；metric 用 Prometheus + alertmanager" | 周期 5+ 评估"加 metrics" |
| 12.2 | Grafana Faro / Sentry 前端 RUM | <https://github.com/grafana/faro> | "浏览器侧 error / performance / session replay" | 周期 5+ 评估"前端 RUM" |
| 12.3 | Sentry Node SDK | <https://docs.sentry.io/platforms/node/> | "错误捕获 + trace 关联 + release 跟踪" | 周期 5+ 评估"线上 Sentry" |
| 12.4 | OpenTelemetry Logs vs Structured Logs | <https://opentelemetry.io/docs/concepts/signals/logs/> | "Otel logs = 结构化 + traceId 关联" | 周期 5+ 评估"桥接到 Otel" |
| 12.5 | OWASP Logging Cheat Sheet | <https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html> | "PII redact / 不可篡改 / 90 天保留" | 周期 4 P1-1 已 redact 16 项；周期 5+ 评估"审计通道" |

**本主题落点**：本周期 P1-1 实施 W3C traceparent + logger；周期 5+ 评估 Sentry / Faro / Metrics。

---

## Top5 优先级（追加进 upcoming-work.md，覆盖周期 3 Top5）

| 排名 | 主题 | 行动 | 落到哪个 ID |
| --- | ---- | ---- | ----------- |
| 1 | **SSRF 终态 + 全 metadata IP 维护** | 周期 4 P0-1 已加 host allowlist + 全 metadata IP 黑名单（含 IPv6） + pin IP；周期 5+ 维护 metadata IP 表（与 IANA 同步） | 周期 5 P0-1 |
| 2 | **限流分布式 + 多级限流** | 周期 4 P0-2 实施 Redis ZADD Sliding Window；周期 5+ 加 Token Bucket（AI 端点）+ 多级限流（IP + userId + API key） | 周期 5 P0-2 |
| 3 | **可观察性升级（Otel SDK + 三支柱）** | 周期 4 P1-1 实施自研 W3C traceparent；周期 5+ 评估全 Otel SDK（auto-instrumentation）+ Metrics（Prometheus）+ Logs Bridge + Faro 前端 RUM | 周期 5 P1-1 |
| 4 | **沙箱深度隔离（CPU watchdog + isolated-vm）** | 周期 4 P1-2 实施 worker_threads + heapMb；周期 5+ 加 CPU watchdog + isolated-vm 备选（高安全要求） | 周期 5 P1-2 |
| 5 | **压缩统一（zlib 客户端 polyfill）** | 周期 4 P1-3 实施 zlib 压缩（中文 73x 压缩比）；周期 5+ 浏览器侧引入 pako / fflate 做 DecompressionStream polyfill | 周期 5 P1-3 |
