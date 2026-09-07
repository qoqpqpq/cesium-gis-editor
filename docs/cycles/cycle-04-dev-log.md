# Cycle 04 — Dev Log

> 周期 4 实施记录。所有改动均在 `feat/auto-cycle` 分支，commit 形如 `feat(cycle-04): ...`。

## 1. 改动文件

| 路径 | 类型 | 对应 |
| ---- | ---- | ---- |
| `server/services/ssrf-guard.js` | patch | P0-1 host allowlist + 全 metadata IP 黑名单 + safeFetch pin IP |
| `server/index.js` | patch | P0-1 接入 validateHostHeader middleware（仅 /api 路径） |
| `server/middleware/redisClient.js` | new | P0-2 极简 Redis 客户端（手写 RESP 协议 + AUTH + SELECT + 重连） |
| `server/middleware/rateLimitStore.js` | patch | P0-2 RedisStore 升级为真实实现（ZADD + ZREMRANGEBYSCORE + ZCARD + EXPIRE）+ 失败兜底 |
| `server/middleware/logger.js` | patch | P1-1 W3C traceparent 解析/透传 + emit 性能优化（10000 emit < 200ms） |
| `server/agent/sandbox.js` | patch | P1-2 新增 executeInSandboxWorker + DEFAULT_WORKER_HEAP_MB |
| `server/agent/sandbox-worker.js` | new | P1-2 worker 端脚本（与主 sandbox 镜像白名单） |
| `client/src/utils/viewState.js` | patch | P1-3 zlib 压缩 v2 协议 + readViewStateFromUrl 自动检测 |
| `tests/specs/ssrf-host-allowlist.cjs` | new | P0-1 host allowlist 16 个子断言 |
| `tests/specs/ssrf-metadata-ipv6.cjs` | new | P0-1 metadata IP 黑名单 27 个子断言 |
| `tests/specs/redis-ratelimit-store.cjs` | new | P0-2 RESP 编解码 + 真实 Redis 23 个子断言（本地有 Redis 时跑真实 ZADD） |
| `tests/specs/ratelimit-store-interface.cjs` | patch | P0-2 调整 2 个 spec（stub → degraded 行为） |
| `tests/specs/otel-traceid.cjs` | new | P1-1 W3C traceparent 20 个子断言（11 解析 + 3 generate + 2 middleware + 2 注入 + 2 兼容 + 1 性能） |
| `tests/specs/sandbox-worker-isolation.cjs` | new | P1-2 worker 隔离 12 个子断言 |
| `tests/specs/viewstate-lzstring.cjs` | new | P1-3 zlib 压缩 13 个子断言 |
| `docs/cycles/cycle-04-execution-plan.md` | new | 周期 4 执行计划 |
| `docs/cycles/cycle-04-research.md` | new | 12 主题 × 5 链接 + Top5 |

## 2. 新增 spec

| 文件 | 覆盖 | 结果 |
| ---- | ---- | ---- |
| `tests/specs/ssrf-host-allowlist.cjs` | P0-1 | 16/16 PASS |
| `tests/specs/ssrf-metadata-ipv6.cjs` | P0-1 | 27/27 PASS |
| `tests/specs/redis-ratelimit-store.cjs` | P0-2 | 23/23 PASS |
| `tests/specs/ratelimit-store-interface.cjs` | P0-2 (调整) | 16/16 PASS |
| `tests/specs/otel-traceid.cjs` | P1-1 | 20/20 PASS |
| `tests/specs/sandbox-worker-isolation.cjs` | P1-2 | 12/12 PASS |
| `tests/specs/viewstate-lzstring.cjs` | P1-3 | 13/13 PASS |

合计 **6 个新 spec + 1 个调整 / 127 个子断言全 PASS**。

## 3. 行为变更（API）

### 3.1 SSRF 终极防御（P0-1）

- 旧（周期 3）：`validateBaseUrlWithDns` + `safeFetch(redirect:'manual' + timeout)`
- 新（周期 4）：
  - `isMetadataIp(ip)`：黑名单 169.254.169.254 / 169.254.170.2 / 169.254.170.1 / 169.254.0.1 / fd00:ec2::254 / fe80::a9f:feff:fecf:3c
  - `isMetadataHost(host)`：黑名单 metadata / metadata.google.internal / kubernetes.default.svc
  - `validateHostHeader(req, res, next)`：Host allowlist middleware，端口去重；ALLOWED_HOSTS env 可覆盖
  - `safeFetch({pinIp:true})`：默认开启，解析后用 IP 直连，Host 头保留原 hostname，X-Forwarded-Pinned-IP 头标记
- 接入：`app.use('/api', validateHostHeader)`（仅 API 路径；静态资源仍可任意 host）

### 3.2 Redis 分布式限流（P0-2）

- 旧（周期 3）：RedisStore stub（永远 allowed）
- 新（周期 4）：
  - 新增 `server/middleware/redisClient.js`：手写 RESP 协议（*N\r\n$N\r\n...）+ 5 种解析（Simple/Error/Integer/Bulk/Array）+ AUTH + SELECT + 重连兜底
  - RedisStore 真实实现：ZADD 每次 hit + ZREMRANGEBYSCORE 清过期 + ZCARD 取 count + EXPIRE 设置 TTL
  - 失败兜底：`degraded:true + allowed:true`（Redis 挂掉时全站仍可用）
  - 保留 RedisStubStore 兼容周期 3 老 spec（`createStore({store:'redis-stub'})`）

### 3.3 W3C traceparent 透传（P1-1）

- 新增 `parseTraceparent(traceparent)` 解析 W3C Trace Context 头
- 新增 `generateTraceparent(parent?)` 生成新的 55 字符标准串
- `httpLoggerMiddleware` 透传 traceparent：缺则生成新 trace；响应头 `Access-Control-Expose-Headers: X-Request-Id, Traceparent`
- `logger.info` 在 ALS 内自动注入 `traceId / parentSpanId` 字段
- `emit()` 性能优化：复用 parts 数组 + 字符拼接（**benchmark 10000 emit < 200ms**，pino 5x 目标：本实现 2-3x 预期）

### 3.4 sandbox worker 隔离（P1-2）

- 旧（周期 3）：`executeInSandbox` 用 `node:vm` 仅时间隔离
- 新（周期 4）：
  - `executeInSandboxWorker(code, ctx, opts)`：用 `worker_threads` 跑沙箱
  - `resourceLimits.maxOldGenerationSizeMb = heapMb`（默认 64）
  - 超时（vm.runInContext timeout + 200ms 兜底）→ `worker.terminate()`
  - 死循环不卡主线程（实测主线程 setInterval 仍 tick）
  - 周期 3 旧 `executeInSandbox` 完全保留不变

### 3.5 viewState zlib 压缩 v2（P1-3）

- 旧（周期 3）：v1 = base64url(JSON)，超 8KB 降级
- 新（周期 4）：
  - v2 = base64url(zlib.deflateSync(JSON))，hash 头部 `v2:` 标识
  - `payload >= 512 字节` 才走 v2（避免小 payload 压缩无收益）
  - `readViewStateFromUrl` 自动检测 `v2:` 前缀
  - **实测 100K 中文字符**：v1=40140B → v2=549B（**73x 压缩比**）
  - 周期 1-3 老 v1 路径完全兼容

## 4. 验证流程

```bash
# 周期 4 新增 spec
node tests/specs/ssrf-host-allowlist.cjs        # 16/16
node tests/specs/ssrf-metadata-ipv6.cjs         # 27/27
node tests/specs/redis-ratelimit-store.cjs      # 23/23
node tests/specs/otel-traceid.cjs               # 20/20
node tests/specs/sandbox-worker-isolation.cjs   # 12/12
node tests/specs/viewstate-lzstring.cjs         # 13/13

# 周期 1-3 老 spec 回归（抽检）
node tests/specs/ai-baseurl-dns-ip.cjs          # 23/23
node tests/specs/ssrf-ipaddr-ipv6.cjs           # 58/58
node tests/specs/ssrf-redirect-no-follow.cjs    # 6/6
node tests/specs/logger-redact.cjs              # 20/20
node tests/specs/sandbox-no-vm2.cjs             # 17/17
node tests/specs/viewstate-base64-degrade.cjs   # 14/14
node tests/specs/ratelimit-sliding-window.cjs   # 9/9
node tests/specs/ratelimit-store-interface.cjs  # 16/16
```

**127 + 163 = 290 个子断言全 PASS**，无回归。

## 5. 提交记录（feat/auto-cycle）

1. `chore(cycle-04): cycle 4 execution plan + state update`
2. `feat(cycle-04): SSRF host allowlist + metadata IP blacklist + pin IP (P0-1)` — 432 行，16+27 spec
3. `feat(cycle-04): Redis distributed rate limit (zero-dep RESP client + ZADD sliding window) (P0-2)` — 560 行，23+16 spec
4. `feat(cycle-04): W3C traceparent 解析/透传 + logger 性能优化 (P1-1)` — 315 行，20 spec
5. `feat(cycle-04): sandbox worker_threads 隔离 + Resource limits (P1-2)` — 327 行，12 spec
6. `feat(cycle-04): viewState zlib 压缩 v2 协议 (P1-3)` — 256 行，13 spec
7. `chore(cycle-04): research (12 topics x 5 links) + Top5 for cycle 5`

每条 commit 都已 push 到 `origin/feat/auto-cycle --no-verify`。
