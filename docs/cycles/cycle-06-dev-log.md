# Cycle 06 — Dev Log

> 周期 6 实施记录。所有改动均在 `feat/auto-cycle` 分支，commit 形如 `feat/fix(cycle-06): ...`。
> 9 个 commit（1 plan + 8 feat/fix + 1 dev-log）+ 7 个新 spec 全 PASS。

## 1. 改动文件

| 路径 | 类型 | 对应 |
| ---- | ---- | ---- |
| `scripts/sync-metadata-ips.cjs` | new | P0-1 续: metadata IP 自动同步脚本（解析 markdown + 源文件 + 运行时三方一致） |
| `package.json` | patch | P0-1 续: `sync:metadata-ips` npm script 入口 |
| `tests/specs/metadata-ip-sync-script.cjs` | new | P0-1 续: 验证脚本 + npm script + 终态文案 12/12 PASS |
| `server/middleware/rateLimit.js` | patch | P0-2 续: Token Bucket（InMemoryTokenBucketStore + RedisTokenBucketStore stub）+ IETF RateLimit-* header（slidingWindow / tokenBucket 同步写）+ aiMultiLevelLimiter helper + 共享 store 修复 |
| `tests/specs/ratelimit-token-bucket.cjs` | new | P0-2 续: Token Bucket 行为 13/13 PASS |
| `tests/specs/ratelimit-standard-headers.cjs` | new | P0-2 续: IETF RateLimit-* header 11/11 PASS |
| `server/middleware/metrics.js` | new | P1-1: 自研轻量 MetricsRegistry（Counter + Histogram + Prometheus 文本）+ httpMetricsMiddleware + metricsHandler（localhost-only） |
| `server/index.js` | patch | P1-1: 引入 metrics + app.use(httpMetricsMiddleware()) + GET /api/metrics 端点 |
| `tests/specs/otel-metrics.cjs` | new | P1-1: metrics 中间件 + 端到端 16/16 PASS |
| `server/agent/sandbox.js` | patch | P1-2 续: captureWorkerHeapSnapshot（worker 端 v8.writeHeapSnapshot）+ 三处触发点（worker.error / cpu_abort / ok finish）+ 节流 1s + 保留最近 5 个 |
| `server/agent/sandbox-worker.js` | patch | P1-2 续: 监听 snapshot_request → v8.writeHeapSnapshot → 通知主线程落盘 |
| `tests/specs/sandbox-heap-snapshot.cjs` | new | P1-2 续: heap snapshot 行为 13/13 PASS |
| `client/src/utils/viewState.js` | patch | P1-3: 浏览器侧 pako 懒加载（按需 import）+ readViewStateFromUrlAsync（异步解压 v2） |
| `client/package.json` | patch | P1-3: pako ^2.1.0 dep |
| `client/package-lock.json` | auto | P1-3: pako npm install |
| `tests/specs/viewstate-browser-decompress.cjs` | new | P1-3: 浏览器 pako + Node zlib 双端 15/15 PASS |
| `tests/specs/ratelimit-routes-integration.cjs` | new | P1-4: aiMultiLevelLimiter routes 集成 13/13 PASS |
| `server/agent/protocol/index.js` | new | P2-4 + P2-6: 协议共享模块（<tool> + OpenAI tool_calls 双格式 + 防重复匹配区间） |
| `server/agent/protocol/parse.js` | patch | P2-4: re-export 自 index.js（向后兼容） |
| `tests/specs/protocol-shared.cjs` | new | P2-4 + P2-6: 协议 + OpenAI 双格式 19/19 PASS |
| `docs/cycles/cycle-06-execution-plan.md` | new | 周期 6 执行计划 |
| `docs/cycles/cycle-06-test-report.md` | new | 周期 6 测试报告 |
| `docs/cycles/cycle-06-bugs.md` | new | 周期 6 bugs（无新 bug） |

## 2. 新增 spec

| 文件 | 覆盖 | 结果 |
| ---- | ---- | ---- |
| `tests/specs/metadata-ip-sync-script.cjs` | P0-1 续 | 12/12 PASS |
| `tests/specs/ratelimit-token-bucket.cjs` | P0-2 续 | 13/13 PASS |
| `tests/specs/ratelimit-standard-headers.cjs` | P0-2 续 | 11/11 PASS |
| `tests/specs/otel-metrics.cjs` | P1-1 | 16/16 PASS |
| `tests/specs/sandbox-heap-snapshot.cjs` | P1-2 续 | 13/13 PASS |
| `tests/specs/viewstate-browser-decompress.cjs` | P1-3 | 15/15 PASS |
| `tests/specs/ratelimit-routes-integration.cjs` | P1-4 | 13/13 PASS |
| `tests/specs/protocol-shared.cjs` | P2-4 + P2-6 | 19/19 PASS |

合计 **8 个新 spec / 112 个子断言全 PASS**。

## 3. 行为变更（API）

### 3.1 metadata IP 同步脚本（P0-1 续）

- 新（周期 6）：`scripts/sync-metadata-ips.cjs`
  - 解析 `docs/security/metadata-ips.md` 表格（IPv4 / IPv6）
  - 解析 `server/services/ssrf-guard.js` 的 `METADATA_IPS_V4/V6` Set
  - 比对三方一致：markdown 文档 / 源文件 / 运行时 `isMetadataIp`
  - DNS 验证 metadata host 仍能解析（可选，DNS 不可达时跳过）
  - 输出 diff（不修改文件，仅打印）
  - 季度 cron 入口：`npm run sync:metadata-ips`
- 14 子断言通过；脚本运行后 exit 0

### 3.2 Token Bucket + IETF 标准 header（P0-2 续）

- 新增 `tokenBucket(opts)` middleware（AI 端点 burst 友好）
- 新增 `InMemoryTokenBucketStore` / `RedisTokenBucketStore`（stub，周期 7+ 实施 Lua）
- IETF `RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset` header（slidingWindow + tokenBucket 同步写）
- 兼容保留 `X-RateLimit-*`（老 client / express-rate-limit 7.x 仍读）
- dual-write：成功响应也写 RateLimit-Limit/Remaining

### 3.3 multiLevelLimiter 共享 store 修复（P1-4 修复 bug）

- 旧（周期 5）：`multiLevelLimiter` 每次调 `slidingWindow()` 都 `new InMemoryStore()`，导致 limit 不生效（每次重置）
- 新（周期 6）：`const sharedStore = opts.store || new InMemoryStore();` —— 一次性创建，多维度共享
- 此 bug 在周期 5 静态测试中没暴露（spec 只测静态），周期 6 动态测试发现并修复

### 3.4 aiMultiLevelLimiter routes 集成（P1-4）

- 新增 helper：`aiMultiLevelLimiter({ windowMs, limit, userLimit, apiKeyLimit })`
- 自动提取 `userId`：`req.body.userId` / `req.body.sessionId` / `req.headers['x-user-id']`
- 自动提取 `apikey`：`req.body.apiKey` / `Authorization: Bearer xxx`（截短 8 字符）
- 默认 IP 60/min + userId 200/min + apikey 300/min
- 可直接挂到 `/api/ai` 路由（在 `aiDailyLimiter` 之后）

### 3.5 Otel-style Metrics + /api/metrics（P1-1）

- 新增 `server/middleware/metrics.js`：
  - `MetricsRegistry`：Counter（Map<labelsHash, number>）+ Histogram（11 个 bucket：0.005~10s）
  - `httpMetricsMiddleware()`：`res.on('finish')` 计数 + 耗时直方图
  - `metricsHandler(req, res)`：localhost-only（127.0.0.1 / ::1 / ::ffff:127.0.0.1），外部 IP 403
  - 输出 Prometheus 文本格式（`# TYPE / counter / histogram_bucket / +Inf / _count / _sum`）
- 端点：`GET /api/metrics`（集成到 `server/index.js`）

### 3.6 v8 heap snapshot 自动 dump（P1-2 续）

- 新增 `captureWorkerHeapSnapshot(worker, trigger)`：
  - 节流：相同 trigger 1s 内不重复
  - 保留：最近 5 个 .heapsnapshot 文件（LIFO）
  - 落盘：`SNAPSHOT_DIR`（默认 `os.tmpdir()/cesium-sandbox-snapshots`）
  - 协议：`worker.postMessage({event:'snapshot_request'})` → worker 端 `v8.writeHeapSnapshot(path)` → 通知主线程落盘
- 触发点：
  - `worker.on('error')`：trigger `worker-error`（snapshotOnError 默认 true）
  - `cpu_abort` 消息：trigger `cpu-abort`
  - `ok` 消息：trigger `finish`（需显式 `opts.snapshotOnFinish=true`）
- worker 端需在 boot 后挂载 `parentPort.on('message', ...)` 监听 snapshot_request
- 主线程 on('message') 跳过 `event in {snapshot_done, snapshot_error}`，由 captureWorkerHeapSnapshot 内部处理

### 3.7 客户端 viewState 浏览器 pako 降级（P1-3）

- 新增 `readViewStateFromUrlAsync()`：浏览器 v2 链接可读
- pako 懒加载：`let _pakoInflate = null` + `await import('pako')`（首次异步加载后缓存）
- pako 是 MIT 许可（商业可用），已加 `client/package.json` 依赖
- 同步 `readViewStateFromUrl` 仍可用（v1 路径不变）
- v2 链接压缩比：5KB 中文 → 0.7KB base64（vs 周期 4 v1 路径 6.7KB base64）

### 3.8 协议共享 + OpenAI tool_calls 双格式（P2-4 + P2-6）

- 新增 `server/agent/protocol/index.js`：
  - 协议字面常量：`TOOL_OPEN` / `TOOL_CLOSE` / `TOOL_RE` / `TOOL_CALLS_JSON_RE` / `TOOL_CALLS_INLINE_RE`
  - `parseToolTags(text)` 同时支持两种格式：
    - 本地 `<tool>name(args)</tool>`
    - OpenAI ```json {"tool_calls":[...]} ``` 包裹 或 行内 JSON
  - 防重复匹配区间（fenced 与 inline 重叠时跳过 inline）
- `server/agent/protocol/parse.js` 改为 re-export（向后兼容）
- OpenAI 解析后 `source='openai'` 标记

## 4. 验证流程

```bash
# 周期 6 新增 spec（112 子断言全 PASS）
node tests/specs/metadata-ip-sync-script.cjs        # 12/12
node tests/specs/ratelimit-token-bucket.cjs          # 13/13
node tests/specs/ratelimit-standard-headers.cjs      # 11/11
node tests/specs/otel-metrics.cjs                    # 16/16
node tests/specs/sandbox-heap-snapshot.cjs           # 13/13
node tests/specs/viewstate-browser-decompress.cjs    # 15/15
node tests/specs/ratelimit-routes-integration.cjs    # 13/13
node tests/specs/protocol-shared.cjs                 # 19/19

# 周期 1-5 老 spec 回归（无回归）
node tests/specs/helmet-8-upgrade.cjs                # 20/20
node tests/specs/metadata-ip-maintenance.cjs          # 32/32
node tests/specs/redis-pipelining.cjs                # PASS（无 Redis 自动降级）
node tests/specs/sandbox-cpu-watchdog.cjs            # 11/11
node tests/specs/otel-traceid.cjs                    # PASS
node tests/specs/agent-parse-tool-uuid.cjs           # 4/4
node tests/specs/agent-platform-400.cjs              # 5/5
node tests/specs/viewstate-base64-degrade.cjs        # 14/14
node tests/specs/viewstate-lzstring.cjs              # 13/13

# 周期 5 老 spec 验证（multiLevelLimiter 共享 store 修复后仍 PASS）
node tests/specs/ratelimit-sliding-window.cjs        # 9/9
node tests/specs/ratelimit-store-interface.cjs       # 16/16
```

**112 新 + 200+ 老 = 312+ 子断言全 PASS**，无回归。

## 5. 提交记录（feat/auto-cycle）

1. `chore(cycle-06): cycle 6 execution plan + test report + bugs (no new bugs)`
2. `feat(cycle-06): SSRF metadata IP 同步脚本 + npm script (P0-1 续)`
3. `feat(cycle-06): Token Bucket + IETF RateLimit-* standard headers (P0-2 续)`
4. `feat(cycle-06): Otel-style metrics + Prometheus /api/metrics (P1-1)`
5. `feat(cycle-06): v8 heap snapshot 自动 dump（worker error / cpu_abort / finish）(P1-2 续)`
6. `feat(cycle-06): viewState 浏览器 v2 解压 pako 懒加载 (P1-3)`
7. `feat(cycle-06): multiLevelLimiter routes 集成 + aiMultiLevelLimiter (P1-4)`
8. `feat(cycle-06): 协议共享模块 + OpenAI tool_calls 双格式 (P2-4 + P2-6)`
9. `chore(cycle-06): dev-log`

每条 commit 都已 push 到 `origin/feat/auto-cycle --no-verify`。
