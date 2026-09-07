# Cycle 04 — Bugs

> **周期**: N=4
> **结论**: 仅 1 个老 spec 测试断言需要修复（与 ssrf-guard 新文案不一致），**非代码 Bug**。

## B01 — 老 spec `ai-baseurl-dns-ip.cjs` 错误信息正则未覆盖周期 4 新文案

| 字段 | 值 |
| | |
| **ID** | C4-B01 |
| **严重度** | 低（测试断言不匹配，非代码缺陷） |
| **复现** | `node tests/specs/ai-baseurl-dns-ip.cjs` 报错 1/23 |
| **期望** | 错误信息 `baseUrl 主机解析到云元数据 IP（api.openai.com → 169.254.169.254），拒绝请求` 匹配断言正则 `/内网\|保留 IP\|SSRF/` |
| **实际** | 新 ssrf-guard 显式区分 metadata IP / 非公网 IP，错误信息改用"云元数据 IP" / "非公网 IP"，老断言不再匹配 |
| **根因** | 周期 4 P0-1 把 ssrf-guard 错误信息分两类：① metadata IP（"云元数据 IP"）；②非公网 IP（"非公网 IP" / "保留 IP"）。老 spec 的正则没覆盖新文案。 |
| **修复** | 老 spec 的正则改为 `/内网\|保留 IP\|SSRF\|云元数据\|非公网 IP/`，覆盖新文案。**未动 ssrf-guard 错误信息**（保留更精确的"云元数据"提示） |
| **提交** | `feat(cycle-04): helmet 8.x upgrade + SSE Last-Event-ID buffer provider (P2-1, P2-2)` |

## C3-B01..B10 周期 3 留 bug 关闭情况

| ID | 周期 3 描述 | 周期 4 状态 |
| -- | ----------- | ----------- |
| C3-B01 | SSRF 缺 host allowlist（防 DNS rebinding 通过 host 仍指向内网） | ✅ 修复：P0-1 `validateHostHeader` middleware |
| C3-B02 | SSRF 缺全 metadata IP 黑名单（169.254.170.2 ECS + fd00:ec2::254 IPv6 metadata） | ✅ 修复：P0-1 `isMetadataIp` 4 v4 + 2 v6 |
| C3-B03 | sliding window 仍仅进程内（多实例不共享） | ✅ 修复：P0-2 RedisStore 真实实现 + ZADD Sliding Window |
| C3-B04 | pino 未引入（用 Node 内置 logger 性能可能不够） | 跳过：周期 4 benchmark 自研 logger 10000 emit < 200ms，性能足够；pino 推迟到周期 5+ |
| C3-B05 | OTEL 未接入（无 trace 跨服务） | 部分：P1-1 W3C traceparent 解析/生成 + ALS traceId 注入；完整 Otel SDK 留周期 5+（需 OTLP exporter 上报） |
| C3-B06 | sandbox 仅时间隔离，无 CPU / heap / worker | ✅ 修复：P1-2 worker_threads + `resourceLimits: maxOldGenerationSizeMb=64` + timeoutMs |
| C3-B07 | helmet 仍 7.x（无原生 Permissions-Policy + 强制 COEP） | ✅ 修复：P2-1 升级到 helmet 8.3.0 + 原生 HSTS + 默认头 |
| C3-B08 | viewState 8KB 降级但未压缩（lz-string 可省 30-50%） | ✅ 修复：P1-3 zlib deflate + v2 协议前缀 + 100K 中文字符压到 549B（0.5%）|
| C3-B09 | 无审计日志独立通道（业务日志和审计日志混一起） | 推迟：留周期 5+ |
| C3-B10 | 无客户端 RUM（Faro / Sentry） | 推迟：留周期 5+ |

## C4-B02..B04 新发现留周期 5+ 的次要问题

| ID | 描述 | 严重度 |
| -- | --- | ------ |
| C4-B02 | Pino / OpenTelemetry Node SDK 完整接入（OTLP exporter 上报到 Jaeger/Tempo） | 中 |
| C4-B03 | ioredis + Redis cluster sentinel 配置（当前手写 RESP 仅支持单机） | 中 |
| C4-B04 | sandbox CPU watchdog（`process.cpuUsage()` 采样 + 超阈值 worker.terminate） | 低 |

详见 [cycle-04-self-check.md](./cycle-04-self-check.md) 第 4 节。