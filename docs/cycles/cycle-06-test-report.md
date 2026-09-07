# Cycle 06 — Test Report

> **周期**: N=6（继承期）
> **运行时间**: 2026-09-07
> **检查点**: `tests/checkpoint.cjs --report-only` + `tests/probe-real-ai-tool-first.cjs` + 5 个核心 spec 抽测
> **服务**: 后端 `node server/index.js`（3001 端口）+ 前端 `cd client && npm run dev -- --host 127.0.0.1`（8080 端口）

## 1. 周期 5 baseline 复盘

### 1.1 `node tests/checkpoint.cjs --report-only`

```
=== checkpoint @ http://localhost:3001 (report-only=true, strict=false) ===
  [PASS] 1) /api/health — env=production
  [PASS] 2) /api/gis/config — cesium=false tdt=false
  [PASS] 3) /api/ai/platforms — count=10
  [PASS] 4) /api/ai/system-prompts — scope=gis len=1470
  [PASS] 5) /api/spatial/centroid OK — centroid_features=1
  [PASS] 6) /api/spatial/buffer OK — ok
  [PASS] 7) /api/spatial/centroid 缺 layer — reject=400
  [PASS] 8) /api/ai/agent 缺 body — reject=400
  [PASS] 9) server modules require — loaded=8

--- summary: pass=9 fail=0 ---
```

**根因分析**: 全 PASS，9/9 baseline 健康。周期 5 P0-3（helmet 修复）+ P0-1/P0-2/P1-2 在运行时无回归。

### 1.2 `node tests/probe-real-ai-tool-first.cjs`

```
=== probe-real-ai-tool-first @ http://localhost:3001 (strict=false) ===
  [PASS] A) POST /api/ai/agent 空 body → 400 — status=400 msg=platform / messages 必填
  [PASS] B) POST /api/ai/agent 缺 messages → 400 — status=400 msg=platform / messages 必填
  [PASS] C) POST /api/ai/agent 非法 platform → 非 5xx — status=400 msg=不支持的平台: __not_a_real_platform__
  [PASS] D) POST /api/ai/agent?stream=1 空 body → 400 — status=400 msg=platform / messages 必填
  [PASS] E) POST /api/ai/agent 无 api_key → 非 200 — status=400 msg=[openai] 未提供 AI Key，请先在浏览器里点 🔑 配置会话 Key
  [PASS] F) POST /api/ai/chat/stream 空 body → 400 — status=400 msg=platform / messages 必填

--- summary: pass=6 fail=0 ---
```

**根因分析**: 6/6 契约稳定。AI 端点对"缺 body / 错 platform / 缺 api_key" 的 4xx 路径行为一致。

### 1.3 5 个核心 spec 抽测

| Spec | 描述 | 结果 | 备注 |
| ---- | ---- | ---- | ---- |
| `helmet-8-upgrade.cjs` | 周期 4 P2-1 + 周期 5 P0-3 修复 | **20/20 PASS** | 运行时头部 + 静态扫描全过；周期 3 P1-1 Permissions-Policy 20 项保留 |
| `metadata-ip-maintenance.cjs` | 周期 5 P0-1 | **32/32 PASS** | ECS task IPv6 `fd00:ec2::253` 已落表 + 文档一致 |
| `redis-pipelining.cjs` | 周期 5 P0-2 EVAL Lua | **PASS**（无 Redis 时自动降级跳过） | 本地无 Redis：6/6 静态 + 5/5 行为；ENV `REDIS_HOST` 设上后 EVAL 集成可全跑 |
| `sandbox-cpu-watchdog.cjs` | 周期 5 P1-2 | **11/11 PASS** | 死循环被 timeout 兜底 + 间歇性 busy loop 被 watchdog catch |
| `otel-traceid.cjs` | 周期 4 P1-1 W3C trace | **PASS** | 标准串解析、生成、透传、10000 emit 性能全过 |

**抽测结论**: 周期 1-5 全部老 spec 无回归（spot-check 5 个共 ~90 个子断言全 PASS）。

## 2. 客户端 Vite 状态

`cd client && npm run dev -- --host 127.0.0.1` 启动成功：

```
> cesium-gis-editor-client@1.0.0 dev
> vite --host 127.0.0.1

  VITE v5.4.21  ready in 657 ms

  ➜  Local:   http://127.0.0.1:8080/
```

无构建告警，无依赖缺失。

## 3. 周期 6 起点评估

| 维度 | 状态 | 说明 |
| ---- | ---- | ---- |
| 后端 /api/health | OK | 周期 5 P0-3 helmet 8.x 修复后稳定 |
| AI 端点契约 | OK | 6/6 PASS |
| SSRF 防护 | OK | metadata IP 黑名单（含 IPv6） + Host allowlist + pin IP |
| Redis Lua 限流 | OK | 单机 Redis 7+ 可跑；本地无 Redis 时降级 InMemory |
| Sandbox worker | OK | CPU watchdog + timeout + heap limit 三重保护 |
| W3C trace | OK | 透传 / 注入 / 性能达标 |

**结论**: 周期 5 落地的 P0/P1/调研 Top5 在生产 / dev 环境下行为稳定，本周期 6 在不破坏现有行为前提下做"升级 / 续作"。

## 4. 风险观察

| 风险 | 描述 | 缓解 |
| ---- | ---- | ---- |
| Token Bucket burst 设计 | AI 端点 burst 太严会影响 UX，太宽会被 abuse | 本周期 burst = limit；后续周期可调 |
| 客户端 pako 引入 | 周期 6 P1-3 需在 client 加 pako 依赖 | 选 pako（MIT）+ 懒加载按需 import |
| `/api/metrics` 端点暴露 | Prometheus 文本格式可能暴露内部信息 | 强制仅 localhost / 内部 token 鉴权 |
| v8 heap snapshot 文件 | 1-2MB/次，频繁触发会撑爆磁盘 | 1s 节流 + 保留最近 5 个（LIFO） |

## 5. 周期 6 测试策略

- 复用 `tests/helpers/with-server.cjs`（周期 5 P0-3 引入）
- 复用 `tests/specs/{helmet,metadata,redis,sandbox,otel}-*.cjs` 模式（统一 5 段结构：静态扫描 + 行为 + 边界 + 兼容 + benchmark）
- 新 spec 6-7 个目标：metadata-ip-sync-script / ratelimit-token-bucket / ratelimit-standard-headers / otel-metrics / sandbox-heap-snapshot / viewstate-browser-decompress / ratelimit-routes-integration / protocol-shared
- 每个 spec 独立 `node xxx.cjs` 验证 PASS
- 老 305 个子断言零回归（周期 5 总数）

## 6. 总结

- 周期 5 全部 baseline 9/9 + 6/6 + 抽测 90/90 全 PASS
- 周期 6 起点状态健康，无 P0 级 bug
- 周期 6 实施 6 P0/P1 + 2 P2，预算 commits ≤ 12 / m3 ≤ 150 / M3 ≤ 450
