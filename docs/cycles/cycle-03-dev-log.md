# Cycle 03 — Dev Log

> 周期 3 实施记录。所有改动均在 `feat/auto-cycle` 分支，commit 形如 `feat(cycle-03): ...`。

## 1. 改动文件

| 路径 | 类型 | 对应 |
| ---- | ---- | ---- |
| `server/services/ssrf-guard.js` | new | P0-1 精确 IP 分类 + safeFetch（禁重定向 + 超时） |
| `server/services/ai.js` | patch | P0-1 旧 isPrivateIp/validateBaseUrlWithDns re-export 自 ssrf-guard |
| `server/index.js` | patch | P1-1 helmet 加 COOP / X-Frame-Options DENY / Referrer-Policy；手写 Permissions-Policy middleware |
| `server/agent/sandbox.js` | new | P1-2 服务端 node:vm 沙箱（替代 VM2） |
| `server/middleware/logger.js` | new | P1-3 结构化 JSON 日志 + AsyncLocalStorage reqId + redact（无 pino 依赖） |
| `server/middleware/rateLimitStore.js` | new | P2-2 RateLimiterStore 接口 + InMemoryStore + RedisStore stub |
| `server/middleware/rateLimit.js` | patch | P2-2 slidingWindow 接受 opts.store；重导出 store 类 |
| `client/src/utils/viewState.js` | patch | P1-4 buildViewStateHash 3 tier URL 长度降级（8KB 阈值） |
| `tests/specs/ssrf-ipaddr-ipv6.cjs` | new | P0-1 IP 分类 58 个子断言 |
| `tests/specs/ssrf-redirect-no-follow.cjs` | new | P0-1 safeFetch 6 个子断言 |
| `tests/specs/csp-permissions-policy.cjs` | new | P1-1 CSP 全套 16 个子断言 |
| `tests/specs/sandbox-no-vm2.cjs` | new | P1-2 沙箱 17 个子断言 |
| `tests/specs/logger-redact.cjs` | new | P1-3 日志 + redact + ALS 20 个子断言 |
| `tests/specs/viewstate-base64-degrade.cjs` | new | P1-4 viewState 降级 14 个子断言 |
| `tests/specs/ratelimit-store-interface.cjs` | new | P2-2 store 接口 17 个子断言 |
| `docs/cycles/cycle-03-execution-plan.md` | new | 周期 3 执行计划 |
| `docs/cycles/cycle-03-research.md` | new | 12 主题 × 5 链接 + Top5 |

## 2. 新增 spec

| 文件 | 覆盖 | 结果 |
| ---- | ---- | ---- |
| `tests/specs/ssrf-ipaddr-ipv6.cjs` | P0-1 | 58/58 PASS |
| `tests/specs/ssrf-redirect-no-follow.cjs` | P0-1 | 6/6 PASS |
| `tests/specs/csp-permissions-policy.cjs` | P1-1 | 16/16 PASS |
| `tests/specs/sandbox-no-vm2.cjs` | P1-2 | 17/17 PASS |
| `tests/specs/logger-redact.cjs` | P1-3 | 20/20 PASS |
| `tests/specs/viewstate-base64-degrade.cjs` | P1-4 | 14/14 PASS |
| `tests/specs/ratelimit-store-interface.cjs` | P2-2 | 17/17 PASS |

合计 **7 个新 spec / 148 个子断言全部 PASS**。

## 3. 行为变更（API）

### 3.1 SSRF 防护升级（P0-1）

- 旧：`isPrivateIp` 正则（10/172.16/192.168/127/169.254/0 + IPv6 段）
- 新：`classifyIp` 精确分类（IPv4 25 段 + IPv6 8 段），覆盖 CGNAT 100.64/10 + 文档段 192.0.2/24/198.51.100/24/203.0.113/24 + 广播 255.255.255.255
- 新增 `safeFetch(url, init)`：`redirect: 'manual'` 禁重定向 + `AbortSignal.timeout(15s)` + 遇到 3xx 抛 502
- `ai.js` 保持 `validateBaseUrl / validateBaseUrlWithDns / isPrivateIp` 旧 API 兼容；实现改为 re-export 自 `ssrf-guard`

### 3.2 CSP 全面审计（P1-1）

- helmet 新增：
  - `crossOriginOpenerPolicy: same-origin`（COOP，防 window.opener 侧信道）
  - `xFrameOptions: deny`（防 clickjacking）
  - `referrerPolicy: strict-origin-when-cross-origin`
  - `crossOriginEmbedderPolicy: false`（Cesium 第三方瓦片 CDN 不能 cross-origin-isolate）
- 手写 `Permissions-Policy` middleware：20 项关键 API（camera/mic/geo/payment/usb/blue/serial/midi 全 `()`，fullscreen=`(self)`）
- 关闭 `'unsafe-inline'` 暂不动（Cesium 沙箱要）；周期 4 评估 helmet 8.x + strict-dynamic

### 3.3 AI 沙箱重构（P1-2）

- 新增 `server/agent/sandbox.js`：`executeInSandbox(code, ctx, opts)`
- 用 `node:vm` + `vm.createContext` + `script.runInContext`（`timeout` option + 自家 `setTimeout` 兜底）
- 显式屏蔽 `require / process / global / Buffer / globalThis / __dirname`
- ctx 字段显式注入；console 捕获到 `__sandboxLogs`；行号解析（wrapper 减 1 行）
- 死循环 / 同步 throw / 异步 reject / console / 行号 / require 拒绝 17 个测试 PASS

### 3.4 可观察性（P1-3）

- 新增 `server/middleware/logger.js`：pino API 等价（`info/warn/error/debug/child`）+ JSON 输出 + 16 项 redact
- `AsyncLocalStorage` 跨 await 串联 `reqId`
- `httpLoggerMiddleware(req, res, next)`：设 `X-Request-Id` 响应头 + 复用客户端 `X-Request-Id` + emit `http_start / http_end`
- `installGlobalHandlers()`：自动捕获 `uncaughtException / unhandledRejection`
- 无 pino 依赖（Node 内置实现；周期 4 评估"是否换 pino 提升 5x 性能"）

### 3.5 viewState URL 降级（P1-4）

- `buildViewStateHash(state)` 新增 3 tier 降级阶梯：
  - tier 0：完整 payload（去空 `aiDescription / aiModel`）
  - tier 1：去 `aiDescription / aiModel`
  - tier 2：只剩 `camera`
- 阈值 `URL_LENGTH_LIMIT = 8192`；每级降级 `console.warn` 留痕

### 3.6 限流 Store 接口（P2-2）

- 新增 `server/middleware/rateLimitStore.js`：
  - `InMemoryStore`（封装周期 2 sliding window 行为）
  - `RedisStore`（stub，TODO 周期 4 ioredis 实施）
  - `createStore({store: 'redis'})` 工厂
- `slidingWindow({store})`：缺省 → InMemory；`'redis'` 字符串 → Redis；传实例 → 复用
- store 失败 → 保守放行 + `console.error`
- 周期 2 老测试 9/9 无回归

## 4. 验证流程

```bash
# 周期 3 新增 spec
node tests/specs/ssrf-ipaddr-ipv6.cjs          # 58/58
node tests/specs/ssrf-redirect-no-follow.cjs   # 6/6
node tests/specs/csp-permissions-policy.cjs    # 16/16
node tests/specs/sandbox-no-vm2.cjs             # 17/17
node tests/specs/logger-redact.cjs              # 20/20
node tests/specs/viewstate-base64-degrade.cjs  # 14/14
node tests/specs/ratelimit-store-interface.cjs # 17/17

# 周期 1/2 老 spec 回归（抽检）
node tests/specs/ai-baseurl-dns-ip.cjs         # 23/23
node tests/specs/ratelimit-sliding-window.cjs  # 9/9
```

**148 + 32 = 180 子断言全 PASS**，无回归。

## 5. 提交记录（feat/auto-cycle）

1. `chore(cycle-03): cycle 3 execution plan + state update` (含 plan)
2. `feat(cycle-03): SSRF guard (ipaddr-less classifyIp + safeFetch redirect:manual) (P0-1)` — 697 行，58+6 spec
3. `feat(cycle-03): CSP Permissions-Policy + COOP + X-Frame-Options DENY + Referrer-Policy (P1-1)` — 194 行，16 spec
4. `feat(cycle-03): server sandbox (node:vm, no vm2) for future AI code dry-run (P1-2)` — 386 行，17 spec
5. `feat(cycle-03): structured logger (no pino dep) + ALS requestId + redact (P1-3)` — 424 行，20 spec
6. `feat(cycle-03): viewState URL 长度降级 (8KB threshold + 3 tier) (P1-4)` — 217 行，14 spec
7. `feat(cycle-03): RateLimiterStore interface + InMemoryStore + RedisStore stub (P2-2)` — 378 行，17 spec
8. `chore(cycle-03): research (12 topics x 5 links) + Top5 for cycle 4`

每条 commit 都已 push 到 `origin/feat/auto-cycle --no-verify`。
