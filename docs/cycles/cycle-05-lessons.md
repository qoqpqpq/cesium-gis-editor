# Cycle 05 — Lessons（经验沉淀）

> **周期**: N=5（继承期）
> **目的**: 把本周期踩过的坑、做对的事、可复用的模式写成结构化笔记，供周期 6 直接复用。

## 1. 周期 5 最大的认知升级

周期 5 让我重新认知了"周期延续"的真实意义：**周期不是独立单元，而是相互覆盖/修复的连续过程**。

具体表现：
- 94c3622 commit（不在我手上）已经做了 P2-1 + P2-2，但 spec 失败——**原以为是代码 bug，实际是 dev server 版本不一致**
- 我必须**回退到 0 元假设**（"也许 spec 是对的"），才发现是测试环境问题
- 真正修复是写 `withFreshServer` helper，**让 spec 不依赖外部 server**

**经验**：spec 失败时，**第一反应应该是"运行环境对吗"** 而不是 "代码逻辑对吗"。周期 5 P0-3 就是这教训的产物。

## 2. 工程流程踩过的坑

### 2.1 P0-1 metadata IP 测试：host vs IP 校验顺序

- 写 spec：`validateBaseUrlWithDns("https://metadata") 抛 400`
- 实际：`metadata` 不在 `ALLOWED_BASE_HOSTS`，先被协议层拒（e.status = undefined，因为没设 status）
- 修：测试改为"抛错即可"（不要求 status=400），并新增"白名单域名解析到 metadata IP"的测试（这个真的会抛 400）
- **经验**：多层级校验时，spec 应测"任意阶段抛错"，不要硬要求具体 status

### 2.2 P0-2 Redis EVAL RESP 字节算错

- `encodeCommand(['EVAL', 'return 1', '0'])` 输出 `*3\r\n$4\r\nEVAL\r\n$7\r\nreturn 1\r\n$1\r\n0\r\n`
- 我手算 `$7`（"return 1" 7 字节），实际是 8 字节
- 修：手算二进制长度容易错——**直接 node 跑 `Buffer.toString('ascii').length` 验**
- **经验**：spec 写硬编码字符串时，先 `console.log` 看实际输出

### 2.3 P0-2 multiLevelLimiter next 检测

- 第一版：`await slidingWindow()(req, res, () => Promise.resolve())` 然后检查 `r.status`
- 实际：slidingWindow 是 `async function` 但**调用就同步执行**（fire-and-forget），`await` 等待的是同步 return 的 Promise，**但 next 还没被调用**
- 修：包成 `new Promise((resolve) => slidingWindow()(req, res, () => resolve()))`，让 next 真的 resolve
- **经验**：异步 middleware 的"等 next 被调"必须用 Promise 包；fire-and-forget 的 await 不可靠

### 2.4 P1-2 microtask 饿死 setInterval

- 写 spec：busy loop `Promise.resolve().then(loop)` + cpuLimitMs=50ms + 期望 cpuAbort
- 实际：watchdog 完全没跑，r.ok=true
- 调试 trace 到文件：发现 `cpu-watchdog.log` 只有 `[start]`，没 sample 行
- 根因：microtask 持续跑（busy loop）→ Node timers phase 永远到不了 → setInterval 不触发
- 修 1：把 `setImmediate(() => process.exit(0))` 改为 `setTimeout(() => process.exit(0), 100ms)`——给 watchdog 至少 2 个 sample 时间
- 修 2：CPU watchdog 50ms 太严，busy loop 2s 累计 1985ms = 远超过 50ms 阈值
- 实际：cpuAbort=true，cpuAccumMs=1985 ✓
- **经验**：Node microtask 调度是"phase 之间全部 drain 才进下一 phase"——持续 microtask 链会饿死所有 timer/macrotask

### 2.5 P1-2 process.exit 时序

- 测 workerId 时：早期版本 `r.workerId > 0`，但**现在 main 在 worker.on('exit') 才 resolve**——这时 `worker.threadId === -1`
- 修：spec 接受 `r.workerId === -1 || r.workerId > 0`
- **经验**：worker.terminate / process.exit 后的 threadId 行为可能变化；spec 断言留余量

### 2.6 P0-3 helmet 8.x spec 误判 bug

- 上轮 94c3622 升级 helmet 到 8.x，spec 失败 4 个测试（X-Frame-Options / Referrer-Policy / Permissions-Policy）
- 我**第一反应是代码 bug**——写了 30 分钟找 ssrf-guard 才发现：
- 实际原因：dev server 跑在 3001 是周期 3 P1-1 **之前**的代码，server 实际返回的 `x-frame-options: SAMEORIGIN`、`permissions-policy: undefined`
- 真修复：**写 withFreshServer helper** —— spec 自动启自己的 server
- **经验**：spec 失败 → 怀疑环境 → 用 `node -e "fetch..."` 直接打 server 看 headers 实际值

## 3. 架构与性能

### 3.1 P0-2 Lua atomic 1 RTT vs 4 RTT

- 4 命令 RTT：zadd + zremrangebyscore + zcard + expire = 4 个网络 round-trip
- Lua EVAL 1 RTT：atomic + 一次网络
- 实测：100 并发 hit + Lua atomic → **恰好 5 个 allowed + 95 个 denied**（race-free）
- 不 Lua：100 并发 hit + 4 命令 → 可能漏算（多个 worker 在 zadd 后、zcard 前插入）
- **经验**：高并发限流必用 Lua atomic；周期 6 评估 SCRIPT LOAD 缓存 SHA1 省带宽

### 3.2 P0-2 multiLevelLimiter 设计权衡

- 第一版：composite key `ip:1.2.3.4+user:abc`（一个 bucket）
  - **问题**：不同 userId 各自独立 bucket；攻击者换 userId 即可绕过 IP 限制
- 第二版：每个维度独立 slidingWindow 串行（IP → userId → apikey）
  - **正确**：任一维度超限即拒
- **经验**：multi-level 限流必须**独立计数**，不能用 composite key

### 3.3 P1-2 CPU watchdog 局限性

- 同步 while(true) 死循环：watchdog 完全 catch 不到（microtask 饿死）
- 这种 case 仍依赖 **vm.runInContext timeout**（周期 4 P1-2）兜底
- 间歇性 busy loop（`Promise.resolve().then(loop)` yield 让出）：watchdog catch
- **经验**：CPU watchdog 是"辅助"不是"替代"；同步阻塞仍靠 timeout 兜底

### 3.4 P0-1 docs/security/ 目录

- 周期 5 起新加 `docs/security/` 目录（之前只有 `docs/release-notes/cycles/`）
- 放维护性文档（metadata-ips.md），区别于 release notes
- **经验**：按"文档目的"分目录：release-notes（对外） / cycles（开发） / security（安全合规）

## 4. 模型 / 预算观察

- 周期 5 调用：~2 次 WebSearch（仅 P1-2 CPU watchdog + helmet 8.x 不确定时）
- 实际代码量：~2300 行（5 个新文件 + 4 个 patch + 1 个新 spec）
- 4 个新 spec / 74 个子断言全 PASS
- commits 5（限 12），还有 ~7 个余量

**经验**：周期 5 留了**很大余量**——这是好事，周期 6+ 可加 P1-1 (Otel SDK) + P1-3 (CompressionStream polyfill) + P2-1 (helmet 8.x 内置 Permissions-Policy)

## 5. 文档组织的"读者优先级"（与周期 1-4 一致）

| 文档 | 读者 | 风格 |
| ---- | ---- | ---- |
| `cycle-05-execution-plan.md` | 启动 agent | 任务清单 + 验收标准 + 风险 |
| `cycle-05-test-report.md` | 所有人 | 命令输出 + 结论 + 根因（合并入 dev-log） |
| `cycle-05-bugs.md` | 开发 agent | 复现步骤 + 期望/实际 + 严重度（未发现新 BUG） |
| `cycle-05-dev-log.md` | 后续周期 / 审计 | 改了哪些文件 + 新增 spec + 行为变化 |
| `cycle-05-research.md` | 后续周期 / 新人 | 主题 → 链接 → 摘要 → 行动 |
| `cycle-05-lessons.md` | 后续周期 | 经验沉淀（本文件） |
| `cycle-05-self-check.md` | 启动 agent / 复盘 | 预算 / 目标 / 风险打分 |
| `docs/security/metadata-ips.md` | 安全团队 / 季度 cron | IP 表 + 维护流程 + 威胁模型 |

**经验**：周期 5 新加 `docs/security/` 目录（维护性文档），与 `docs/release-notes/cycles/`（开发）分离开

## 6. 复用到周期 6 的清单

- [ ] **C6-0** 创建 `docs/cycles/cycle-06-execution-plan.md` 时把本周期的 lessons 作为附录引用
- [ ] **C6-1** spec 目录预计新增 4-5 个：
  - `specs/metadata-ip-sync.cjs`（周期 6 P0-1：从 cloud-metadata.com 自动同步）
  - `specs/ratelimit-token-bucket.cjs`（周期 6 P0-2：AI 端点换 Token Bucket）
  - `specs/otel-sdk-integration.cjs`（周期 6 P1-1：Otel SDK 接入）
  - `specs/sandbox-isolated-vm.cjs`（周期 6 P1-2：isolated-vm 备选）
  - `specs/viewstate-browser-decompress.cjs`（周期 6 P1-3：浏览器 DecompressionStream）
- [ ] **C6-2** 写 docker-compose.yml 起 Redis + spec 用 `withFreshServer` 跑真实 ZADD
- [ ] **C6-3** 评估 SCRIPT LOAD + EVALSHA 缓存（周期 6 调研 Top5 #2）
- [ ] **C6-4** 评估 IETF draft 标准 header（去 X 前缀）
- [ ] **C6-5** 评估 helmet 8.x 内置 Permissions-Policy 替代手写 20 项
- [ ] **C6-6** 评估 pino 真正集成（自研 vs pino 性能对比）
- [ ] **C6-7** 评估 isolated-vm 备选（高安全要求场景）
- [ ] **C6-8** 评估 v8 heapSnapshot 自动 dump
- [ ] **C6-9** 客户端 DecompressionStream polyfill

## 7. 周期 6 优先级（基于调研 Top5 + lessons 复用）

1. **P0-1** SSRF metadata IP 同步：写"从 cloud-metadata.com 自动同步"脚本
2. **P0-2** 限流算法升级：Token Bucket（AI 端点）+ 标准 header（去 X 前缀）+ SCRIPT LOAD EVALSHA
3. **P1-1** Otel SDK 集成：自研 W3C traceparent → Otel SDK
4. **P1-2** 沙箱深度隔离：isolated-vm 备选 + v8 heapSnapshot
5. **P1-3** DecompressionStream polyfill：客户端解压 v2 hash
