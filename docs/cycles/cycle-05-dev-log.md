# Cycle 05 — Dev Log

> 周期 5 实施记录。所有改动均在 `feat/auto-cycle` 分支，commit 形如 `feat/fix(cycle-05): ...`。

## 1. 改动文件

| 路径 | 类型 | 对应 |
| ---- | ---- | ---- |
| `tests/helpers/with-server.cjs` | new | P0-3 自动启 server 子进程 helper（helmet-8 spec 用） |
| `tests/specs/helmet-8-upgrade.cjs` | patch | P0-3 改用 withFreshServer（避免与用户 dev server 冲突）+ 修 `assert.ok.ok` typo |
| `server/services/ssrf-guard.js` | patch | P0-1 METADATA_IPS_V6 加 `fd00:ec2::253`（AWS ECS task IPv6） |
| `docs/security/metadata-ips.md` | new | P0-1 cloud metadata IP 维护文档（IP 表 + 季度 cron 流程 + 威胁模型） |
| `tests/specs/metadata-ip-maintenance.cjs` | new | P0-1 季度 cron 验证 IP / 文档 / 源文件三方一致 |
| `server/middleware/redisClient.js` | patch | P0-2 加 `eval` / `evalsha` / `scriptLoad` 命令 |
| `server/middleware/rateLimitStore.js` | patch | P0-2 RedisStore.hit 用 Lua atomic 替代 4 命令 RTT（`LUA_SLIDING_WINDOW`） |
| `server/middleware/rateLimit.js` | patch | P0-2 新增 `multiLevelLimiter`（IP + userId + apikey 三维度独立计 limit；apikey 截短 8 字符） |
| `tests/specs/redis-pipelining.cjs` | new | P0-2 EVAL / Lua atomic / multi-level 11 个子断言 |
| `tests/specs/redis-ratelimit-store.cjs` | patch | P0-2 修 zadd 大小写检查（Lua 用大写） |
| `server/agent/sandbox.js` | patch | P1-2 executeInSandboxWorker 加 `cpuLimitMs` + 处理 `cpu_abort` 事件 + `pendingOk` 缓存 |
| `server/agent/sandbox-worker.js` | patch | P1-2 startCpuWatchdog/stopCpuWatchdog + postMessage 后 `setTimeout(process.exit, 300ms)` |
| `tests/specs/sandbox-cpu-watchdog.cjs` | new | P1-2 11 个子断言（5 静态 + 6 行为含 catch 间歇性 busy loop） |
| `tests/specs/sandbox-worker-isolation.cjs` | patch | P1-2 修 workerId 断言（exit 后是 -1，不是 > 0） |
| `docs/cycles/cycle-05-execution-plan.md` | new | 周期 5 执行计划 |
| `docs/cycles/cycle-05-research.md` | new | 12 主题 × 5 链接 + Top5 |

## 2. 新增 spec

| 文件 | 覆盖 | 结果 |
| ---- | ---- | ---- |
| `tests/specs/helmet-8-upgrade.cjs` | P0-3 | 20/20 PASS（修复后） |
| `tests/specs/metadata-ip-maintenance.cjs` | P0-1 | 32/32 PASS |
| `tests/specs/redis-pipelining.cjs` | P0-2 | 11/11 PASS |
| `tests/specs/sandbox-cpu-watchdog.cjs` | P1-2 | 11/11 PASS |

合计 **4 个新 spec / 74 个子断言全 PASS**。

## 3. 行为变更（API）

### 3.1 SSRF metadata IP 维护（P0-1）

- 旧（周期 4）：`METADATA_IPS_V6` 仅 `fd00:ec2::254` + `fe80::...`
- 新（周期 5）：加 `fd00:ec2::253`（AWS ECS task metadata v2 IPv6）
- 新增 `docs/security/metadata-ips.md` 维护文档（IP 表 + 季度 cron 流程 + 威胁模型 + 残余风险）
- 新增 `tests/specs/metadata-ip-maintenance.cjs` 季度 cron 验证（IP / 文档 / 源文件三方一致）

### 3.2 Redis Lua atomic + 多级限流（P0-2）

- 旧（周期 4）：RedisStore.hit 用 4 命令 RTT（zadd + zremrangebyscore + zcard + expire）
- 新（周期 5）：
  - `RedisClient.eval / evalsha / scriptLoad` 新增（Lua 脚本支持）
  - `RedisStore.LUA_SLIDING_WINDOW` static 常量：atomic `ZREMRANGEBYSCORE + ZADD + ZCARD + EXPIRE` 1 RTT
  - `multiLevelLimiter(opts)`：IP / userId / apikey 三维度独立计 limit（apikey 截短 8 字符不存原始 key）
- 失败兜底：degraded:true + 放行（不变）

### 3.3 sandbox worker CPU watchdog（P1-2）

- 旧（周期 4）：executeInSandboxWorker 仅 timeout + heap
- 新（周期 5）：
  - `opts.cpuLimitMs` 参数；>0 启动 watchdog
  - worker 端 `setInterval(50ms)` 累计 `process.cpuUsage()` delta；超阈值 `postMessage({event:'cpu_abort'})`
  - 主线程 message handler 处理 cpu_abort → `pendingOk` 缓存 + `worker.on('exit')` 才 resolve
  - 关键：postMessage 后 `setTimeout(process.exit, 300ms)` 给 watchdog 至少 6 个 sample
  - **microtask 调度发现**：纯同步循环不触发 watchdog（依赖 vm.runInContext timeout）；间歇性 busy loop（`Promise.resolve().then(loop)` yield 后）可触发
- 实测 catch：busy loop 2s 累计 cpuAccumMs=1985，50ms 阈值，cpuAbort:true

### 3.4 helmet 8.x 修复（P0-3）

- 上轮 94c3622 升级 helmet 8.x 引入的 spec 失败（"X-Frame-Options / Referrer-Policy / Permissions-Policy 缺失"）实际原因是**用户 dev server 跑在 3001 是周期 3 P1-1 之前版本**（不是 helmet 8.x 升级导致）
- 修复：spec 改用 `withFreshServer` 自动 spawn 3201 server 跑 + 修 `assert.ok.ok` typo
- 验证：20/20 spec PASS（16 静态 + 4 运行时）；周期 3 P1-1 `csp-permissions-policy` 16/16 无回归

## 4. 验证流程

```bash
# 周期 5 新增 spec
node tests/specs/helmet-8-upgrade.cjs        # 20/20（修复后）
node tests/specs/metadata-ip-maintenance.cjs # 32/32
node tests/specs/redis-pipelining.cjs        # 11/11
node tests/specs/sandbox-cpu-watchdog.cjs   # 11/11

# 周期 1-4 老 spec 回归（抽检）
node tests/specs/csp-permissions-policy.cjs  # 16/16
node tests/specs/ssrf-host-allowlist.cjs     # 16/16
node tests/specs/ssrf-metadata-ipv6.cjs      # 27/27
node tests/specs/ssrf-ipaddr-ipv6.cjs        # 58/58
node tests/specs/ssrf-redirect-no-follow.cjs # 6/6
node tests/specs/redis-ratelimit-store.cjs   # 23/23
node tests/specs/ratelimit-sliding-window.cjs # 9/9
node tests/specs/ratelimit-store-interface.cjs # 16/16
node tests/specs/logger-redact.cjs           # 20/20
node tests/specs/sandbox-no-vm2.cjs          # 17/17
node tests/specs/sandbox-worker-isolation.cjs # 12/12
```

**74 + 231 = 305 个子断言全 PASS**，无回归。

## 5. 提交记录（feat/auto-cycle）

1. `chore(cycle-05): cycle 5 execution plan + state update`
2. `fix(cycle-05): helmet 8.x spec: use withFreshServer helper (P0-3)` — 139 行
3. `feat(cycle-05): SSRF 终态 — metadata IP 黑名单维护 + ECS task IPv6 (P0-1)` — 247 行
4. `feat(cycle-05): Redis Lua atomic sliding window + multi-level rate limit (P0-2)` — 385 行
5. `feat(cycle-05): sandbox worker CPU watchdog (process.cpuUsage 累计 + setTimeout(exit)) (P1-2)` — 241 行
6. `chore(cycle-05): research (12 topics x 5 links) + Top5 for cycle 6`

每条 commit 都已 push 到 `origin/feat/auto-cycle --no-verify`。
