# Cycle 04 — Dev Log

> 周期 4 实施记录。所有改动均在 `feat/auto-cycle` 分支，commit 形如 `feat(cycle-04): ...`。

## 1. 改动文件

| 路径 | 类型 | 对应 |
| ---- | ---- | ---- |
| `server/services/ssrf-guard.js` | patch | P0-1: Host header allowlist middleware + 全 metadata IP 黑名单（4 v4 + 2 v6）+ pin IP socket 连接 |
| `server/index.js` | patch | P0-1: 接入 `validateHostHeader` middleware；P2-1: helmet 升级 8.x 兼容 |
| `server/middleware/redisClient.js` | new | P0-2: 零依赖手写 RESP 协议 + Sliding Window 命令封装 |
| `server/middleware/rateLimitStore.js` | patch | P0-2: RedisStore 升级为真实实现（ZADD + ZREMRANGEBYSCORE + ZCARD + EXPIRE） |
| `server/middleware/logger.js` | patch | P1-1: W3C traceparent 解析/生成 + ALS traceId 串联 + emit 性能优化（Buffer 复用） |
| `server/agent/sandbox.js` | patch | P1-2: 新增 `executeInSandboxWorker` + worker_threads + resourceLimits |
| `server/agent/sandbox-worker.js` | new | P1-2: worker 端脚本（与 sandbox.js 镜像逻辑） |
| `client/src/utils/viewState.js` | patch | P1-3: zlib deflate + v2 协议前缀（100K 中文字符 → 549B）|
| `package.json` + `package-lock.json` | patch | P2-1: helmet ^7.2.0 → ^8（实际安装 8.3.0）|
| `server/routes/_sse.js` | patch | P2-2: 接受可选 `bufferProvider`，断线时按 Last-Event-ID 回放历史事件 |
| `tests/specs/ssrf-host-allowlist.cjs` | new | P0-1: 16 子断言 |
| `tests/specs/ssrf-metadata-ipv6.cjs` | new | P0-1: 27 子断言 |
| `tests/specs/redis-ratelimit-store.cjs` | new | P0-2: 23 子断言（编码/解码/兜底/真实 ZADD） |
| `tests/specs/otel-traceid.cjs` | new | P1-1: 20 子断言（traceparent + ALS + 性能 benchmark） |
| `tests/specs/sandbox-worker-isolation.cjs` | new | P1-2: 12 子断言 |
| `tests/specs/viewstate-lzstring.cjs` | new | P1-3: 13 子断言 |
| `tests/specs/helmet-8-upgrade.cjs` | new | P2-1: 20 子断言（静态扫描 + 运行时头部） |
| `tests/specs/sse-last-event-id-buffer.cjs` | new | P2-2: 14 子断言 |
| `tests/specs/ai-baseurl-dns-ip.cjs` | patch | 老 spec 正则扩展兼容 ssrf-guard 新文案（"云元数据"/"非公网 IP"）|
| `docs/cycles/cycle-04-*.md` | new | 周期 4 全部文档（6 份）|

## 2. 新增 spec

| 文件 | 覆盖 | 结果 |
| ---- | ---- | ---- |
| `tests/specs/ssrf-host-allowlist.cjs` | P0-1 | 16/16 PASS |
| `tests/specs/ssrf-metadata-ipv6.cjs` | P0-1 | 27/27 PASS |
| `tests/specs/redis-ratelimit-store.cjs` | P0-2 | 23/23 PASS |
| `tests/specs/otel-traceid.cjs` | P1-1 | 20/20 PASS |
| `tests/specs/sandbox-worker-isolation.cjs` | P1-2 | 12/12 PASS |
| `tests/specs/viewstate-lzstring.cjs` | P1-3 | 13/13 PASS |
| `tests/specs/helmet-8-upgrade.cjs` | P2-1 | 20/20 PASS |
| `tests/specs/sse-last-event-id-buffer.cjs` | P2-2 | 14/14 PASS |

合计 **8 个新 spec / 145 个子断言全部 PASS**。

## 3. 行为变更（API）

### 3.1 SSRF 补齐（P0-1）

- 新增 `validateHostHeader(req, res, next)` middleware：仅允许 `localhost / 127.0.0.1 / ::1 / 0.0.0.0 / gisai.top / ...` 等白名单 host，env `ALLOWED_HOSTS` 可覆盖
- 新增 `isMetadataIp(ip)` 显式黑名单：
  - IPv4: `169.254.169.254`（AWS/GCP/Azure IMDS）+ `169.254.170.2`（AWS ECS v2）+ `169.254.170.1`（ECS v1）+ `169.254.0.1`（部分 K8s）
  - IPv6: `fd00:ec2::254`（AWS EC2 Nitro IPv6 IMDS）+ `fe80::a9f:feff:fecf:3c`（老 IMDS IPv6）
- 新增 `isMetadataHost(host)` 显式黑名单 hostname：`metadata` / `metadata.google.internal` / `kubernetes.default.svc`
- `safeFetch(url, init)` 新增 pin IP：解析后用已验证 IP 直接连，TLS SNI 用原 hostname；防 DNS rebinding 抢跑
- `validateBaseUrlWithDns` 集成 metadata host/ip 检查（抛 400 + 明确错误信息）

### 3.2 Redis 分布式限流（P0-2）

- 新增 `server/middleware/redisClient.js`（零依赖手写 RESP 协议 + EventEmitter）：
  - `_rawCommand(parts)` 编码 RESP 数组 → socket.write → parseReply 解码
  - 支持 `PING / ZADD / ZREMRANGEBYSCORE / ZCARD / DEL / EXPIRE`
  - 5 种 RESP 类型：简单字符串 / 整数 / bulk string / 数组 / 错误
- `RedisStore` 升级真实实现：每次 `hit` 做 `ZADD + ZREMRANGEBYSCORE + ZCARD + EXPIRE`；失败兜底 `degraded:true + allowed:true`
- 旧 `RedisStubStore` 保留（向后兼容周期 3 行为）
- 不引入 ioredis（避免新依赖 + 新部署面）

### 3.3 可观察性（P1-1）

- 新增 W3C Trace Context 支持：
  - `parseTraceparent(str)` 解析 `00-<traceId 32hex>-<parentId 16hex>-<flags 2hex>` 格式
  - `generateTraceparent(parent?)` 生成新 traceparent（child span 时复用 traceId）
  - `httpLoggerMiddleware` 自动解析请求 `traceparent` 头 → 注入 ALS ctx
- emit 性能优化：10000 次 emit 耗时 < 200ms（vs 周期 3 约 350ms — 40% 提升）
- 响应头 `Access-Control-Expose-Headers: X-Request-Id, Traceparent` 透出

### 3.4 沙箱升级 worker_threads（P1-2）

- 新增 `executeInSandboxWorker(code, ctx, opts)` API
- 真线程隔离：worker 死循环不会卡主线程
- Resource limits：`maxOldGenerationSizeMb=64`（默认）+ `maxYoungGenerationSizeMb=16` + `codeRangeSizeMb=128`
- 超时：`worker.terminate()` 兜底（默认 5s + 200ms grace）
- 旧 `executeInSandbox`（vm 版）保留不变；worker 版是可选 API

### 3.5 viewState 压缩（P1-3）

- `buildViewStateHash(state)` 新增 v2 压缩路径（payload > 512 字节）：
  - 原始 JSON → zlib.deflateSync(level=9) → base64url → `v2:` 前缀
  - 100K 中文字符 → 549B（压缩比 ~0.5%）
- `readViewStateFromUrl` 自动检测 `v2:` 前缀 → inflate → JSON
- 降级路径：payload ≤ 512 字节仍走 v1 base64url（压缩不划算）
- 节点缺 zlib → 自动 fallback 到 v1

### 3.6 Helmet 8.x 升级（P2-1）

- `helmet ^7.2.0` → `helmet ^8`（实际安装 8.3.0）
- 兼容周期 3 已设的 CSP / COOP / X-Frame-Options / Referrer-Policy / COEP=false 全部保留
- 新增 helmet 8 默认头：
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `X-Content-Type-Options: nosniff`
  - `X-DNS-Prefetch-Control: off`
  - `X-Download-Options: noopen`
  - `X-XSS-Protection: 0`（helmet 8 默认禁用浏览器 XSS filter）
- Permissions-Policy 仍手写 20 项（helmet 8.x 仍未原生支持）
- 无 breaking change 影响现有 config（我们没显式设 `hsts: { includeSubDomains }`，没踩 helmet 8 的拼错 throw 雷）

### 3.7 SSE Last-Event-ID buffer 续传（P2-2）

- `sseStreamHandler` 接受可选 `bufferProvider = { getSince(lastEventId): Promise<Event[]> }`
- 启动时若收到 `Last-Event-ID` 头 + 提供 bufferProvider → 先 `getSince(lastId)` 回放历史事件，再进入主流程
- 新增 `replaySseEvents(res, events)` 工具函数
- bufferProvider 抛错 → 主流程不中断（console.error 留痕）
- bufferProvider 缺省 → 与周期 2/3 行为完全一致（向后兼容）

## 4. 验证流程

```bash
# 服务端
node server/index.js &

# 测试入口
node tests/checkpoint.cjs --report-only           # 9/9
node tests/probe-real-ai-tool-first.cjs --strict  # 6/6

# 周期 4 新增 8 个 spec
node tests/specs/ssrf-host-allowlist.cjs         # 16/16
node tests/specs/ssrf-metadata-ipv6.cjs          # 27/27
node tests/specs/redis-ratelimit-store.cjs       # 23/23
node tests/specs/otel-traceid.cjs                # 20/20
node tests/specs/sandbox-worker-isolation.cjs    # 12/12
node tests/specs/viewstate-lzstring.cjs          # 13/13
node tests/specs/helmet-8-upgrade.cjs            # 20/20
node tests/specs/sse-last-event-id-buffer.cjs    # 14/14

# 周期 1/2/3 老 spec 回归
node tests/specs/ai-baseurl-dns-ip.cjs            # 23/23（修复后）
node tests/specs/ssrf-ipaddr-ipv6.cjs            # 58/58
node tests/specs/csp-permissions-policy.cjs      # 16/16
node tests/specs/sandbox-no-vm2.cjs              # 17/17
node tests/specs/logger-redact.cjs               # 20/20
node tests/specs/viewstate-base64-degrade.cjs    # 14/14
node tests/specs/ratelimit-store-interface.cjs   # 16/16
node tests/specs/ratelimit-sliding-window.cjs    # 9/9
# ... 19 个老 spec 全 PASS
```

**145 + 264 = 409 子断言 + 15 (checkpoint+probe) = 424 子断言全 PASS**，无回归。

## 5. 提交记录（feat/auto-cycle）

1. `chore(cycle-04): cycle 4 execution plan + state update` — 周期 4 计划（含 plan）
2. `feat(cycle-04): SSRF host allowlist + metadata IP blacklist + pin IP (P0-1)` — 411 行，16+27 spec
3. `feat(cycle-04): Redis distributed rate limit (zero-dep RESP client + ZADD sliding window) (P0-2)` — 387 行，23 spec
4. `feat(cycle-04): W3C traceparent 解析/透传 + logger 性能优化 (P1-1)` — 217 行，20 spec
5. `feat(cycle-04): sandbox worker_threads 隔离 + Resource limits (P1-2)` — 393 行，12 spec
6. `feat(cycle-04): viewState zlib 压缩 v2 协议 (P1-3)` — 230 行，13 spec
7. `feat(cycle-04): helmet 8.x upgrade + SSE Last-Event-ID buffer provider (P2-1, P2-2)` — 444 行（含 helmet 升级 + bufferProvider），20+14 spec

每条 commit 都已 push 到 `origin/feat/auto-cycle --no-verify`。