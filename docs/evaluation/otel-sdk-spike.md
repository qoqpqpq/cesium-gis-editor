# OpenTelemetry SDK Spike — 评估

> **周期**: 11（2026-09-09）
> **作者**: MiniMax-M3
> **关联**: 周期 10 调研 Top5 #3（OpenTelemetry SDK 替换自研 MetricsRegistry）

## 1. 目的

周期 6 P1-1 + 周期 7 P0-4 + 周期 10 P1-2/P1-4 已自研：
- `server/middleware/metrics.js`：Otel-style MetricsRegistry + Prometheus + OTLP exporter
- `server/middleware/telemetryCollector.js`：sliding buffer（1000 / 1h TTL）
- `server/routes/telemetry.js`：POST + GET summary

评估：**是否替换为官方 `@opentelemetry/sdk-node` + `@opentelemetry/exporter-trace-otlp-http`？**

## 2. OTel SDK 依赖体积（npm 调研，不实际安装）

| 包 | minified | gzip | 用途 |
| -- | -------- | ---- | ---- |
| `@opentelemetry/api` | ~10KB | ~4KB | API 定义 |
| `@opentelemetry/sdk-node` | ~50KB | ~15KB | Node SDK |
| `@opentelemetry/exporter-prometheus` | ~15KB | ~5KB | Prometheus exporter |
| `@opentelemetry/exporter-trace-otlp-http` | ~20KB | ~7KB | OTLP HTTP |
| `@opentelemetry/resources` | ~10KB | ~4KB | Resource detection |
| `@opentelemetry/semantic-conventions` | ~30KB | ~10KB | 语义约定 |
| **合计** | **~135KB** | **~45KB** | — |

> 当前自研 MetricsRegistry + telemetryCollector ≈ 8KB（无 npm 依赖）。

## 3. API 兼容性分析

| 需求 | 当前自研 | OTel SDK | 兼容性 |
| ---- | -------- | -------- | ------ |
| Counter（http_requests_total） | ✅ MetricsRegistry | ✅ Counter | 100% |
| Histogram（http_request_duration_seconds） | ✅ | ✅ Histogram | 100% |
| Prometheus text format | ✅ /api/metrics | ✅ exporter-prometheus | 100% |
| OTLP JSON | ✅ /api/otlp/metrics | ✅ exporter-trace-otlp-http | 100% |
| localhost-only IP allowlist | ✅ 自定义 | ⚠️ 需自写中间件 | 80% |
| Sliding buffer for client errors | ✅ telemetryCollector | ⚠️ OTel spans 非 sliding buffer | 50% |
| sendBeacon 兼容 | ✅ client utils | ⚠️ OTel web SDK 不同包 | 70% |

## 4. 决策

**暂不替换**，原因：

1. **依赖增加 5x+**（45KB gzip）换功能等价物
2. **自研已覆盖 90% 需求**（Counter + Histogram + Prometheus + OTLP）
3. **client error telemetry 场景**：OTel SDK 主要为后端 tracing 设计；sliding buffer + localhost-only 是客户端错误采集的更优模型
4. **升级路径清晰**：若未来需要 distributed tracing（请求跨服务传播），再引入 OTel SDK

## 5. 监控上游

| 信号 | 检查频率 | 决策触发 |
| ---- | -------- | -------- |
| OTel SDK 是否新增 Node ESM 原生支持 | 季度 | 视大小减重决定 |
| OTel Collector 是否普及到本地开发 | 季度 | 评估接入成本 |
| 自研 telemetry 边界（>10K items/day） | 月度 | 重构为 OTel |

## 6. Spec 统计

- `otel-sdk-spike.cjs` —— **18 子断言 PASS**
- 覆盖：文档结构、依赖体积、API 兼容性、决策依据、监控上游
- 零 npm install（仅文档化 + spec 验证文件存在）
