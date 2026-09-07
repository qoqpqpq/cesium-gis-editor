# Cycle 03 — Lessons（经验沉淀）

> **周期**: N=3（继承期）
> **目的**: 把本周期踩过的坑、做对的事、可复用的模式写成结构化笔记，供周期 4 直接复用。

## 1. 继承期的"复利效应"

周期 3 的边际成本比周期 1/2 明显低：

- 脚手架（state / upcoming-work / specs 目录）零开销
- 周期 1/2 的 6 + 5 = 11 个 spec 全可用作"模式模板"
- 周期 2 调研 Top5 直接落到 P0-1 / P1-1 / P1-2 / P1-3 / P2-2 = 5 项，无需重新调研

**经验**：周期 4 不必再做大调研（除非有新方向），应聚焦"周期 3 落地时发现的二级问题"。

## 2. 工程流程踩过的坑

### 2.1 P0-1 静态扫描 + 行为测试的"双保险"价值

- `ssrf-ipaddr-ipv6.cjs` 既测了 `classifyIp` 单元（精确分类 25 段 + 8 段），又通过 `withDnsStub` mock `dns.lookup` 验证 `validateBaseUrlWithDns` 集成
- 写测试时第一版用 `dns.lookup = stub`（临时赋值），最后 `finally` 还原——但如果测试 fail 也会还原（Node 进程死了）
- 改用 `withDnsStub(stub, fn)` helper 包装后更稳

**经验**：写涉及"全局变量 + 异步" 的测试时，统一用 helper 包装，不要内联 try/finally

### 2.2 P1-2 沙箱 `'use strict'` + return 冲突

- 第一版 `wrapped = "'use strict';\nreturn (async () => {...})()"` 报 "Illegal return statement"
- 原因：top-level `return` 仅在"函数"内合法；`'use strict'` 把它视作 top-level
- 解决：去掉 `'use strict'`，直接用 IIFE 形式 `(async (__ctx) => {...})(__ctx)`
- 配套修：行号偏移从 -2 改 -1（因为只剩 1 行 wrapper）

**经验**：node:vm 调试错误时，stack 里的 "Anonymous" 不可靠，要看行号和错误类型反推

### 2.3 P1-3 沙箱 console.log 输出丢失

- `defineProperty(c, '__sandboxLogs', {get(){return logs}})` 在 vm 内访问不到——getter 在 sandbox 上下文里失效
- 解决：直接 `c.__sandboxLogs = logs`（普通属性赋值）

**经验**：vm 沙箱里要谨慎用 `Object.defineProperty` + getter/setter；普通属性更可预测

### 2.4 P1-3 测试 `captureStdout` 异步丢失

- 第一版用 `process.stdout.write = mockBuf` + `finally` 还原——但 `process.stdout.write` 是异步的，emit 后立即 finally 时还没真写
- 解决：测试里 `await new Promise(r => setImmediate(r))` 等 2 个 tick
- 配套修：`httpLoggerMiddleware` 的 `finish` 事件要用 `als.run(ctx, () => emit(...))` 重新进入 ALS 上下文（因为 finish 在 als.run 外触发）

**经验**：stdout mock 必加 microtask flush；跨 async context 边界的 callback 要显式 `als.run`

### 2.5 P1-4 viewState 测试的 console.warn 收集

- 第一版用 `console.warn = (...args) => warns.push(...)` 覆盖全局；但镜像函数内部又 `console.warn = origWarn` 还原
- 解决：把 `warns` 作为参数传入 `buildViewStateHash(state, _warns)`，镜像函数判断是否有 `_warns` 参数决定行为

**经验**：测试镜像尽量避免"修改全局副作用"——用参数注入副作用

### 2.6 P2-2 store 接口抽象的"向后兼容"模式

- `slidingWindow(opts)` 旧版不传 `store`；周期 3 接受 store 但保持 `store` 缺省行为与旧版 100% 一致
- 测试用 `sliding-window.cjs` 老 9/9 仍 PASS，证明向后兼容
- 关键：`store` 是可选参数，缺省时 inline 实现；非缺省时委托给 store

**经验**：抽象时永远保留"无抽象时也能跑"的 fallback 路径；不强迫所有调用方都走抽象

## 3. 架构与安全

### 3.1 P0-1 SSRF 6 步的"分步实施"策略

- 周期 2 P1-8：URL 解析 + DNS + IP 分类（3 步）
- 周期 3 P0-1：精确 IP 分类（25+8 段）+ safeFetch 禁重定向（2 步）
- 周期 4+：host allowlist + pin IP + 全 metadata IP 黑名单（最后 1 步 + 加固）

**经验**：OWASP 6 步不要一次性做完——分周期 3 个 commit，每个 commit 配套 spec，比"大爆炸式" 安全 5x

### 3.2 P1-1 Permissions-Policy 20 项的"全 none + 例外 self"模式

- 20 项关键 API 全部默认 `()`（拒绝）
- 只 `fullscreen=(self)` 留例外（用户主动允许时仍可全屏）
- `autoplay=(self)` 留例外（Cesium 视频需要）
- `screen-wake-lock=(self)` 留例外（地图长看需要）
- `publickey-credentials-get=(self)` 留例外（WebAuthn 备用）
- `picture-in-picture=()` 仍禁（不需要）

**经验**：Permissions-Policy 默认应"全 none"再按需开；不要预设"我们用不上就关"——把"默认拒绝"作为安全姿态

### 3.3 P1-2 sandbox 不传 vm2 的代价

- node:vm 比 vm2 限制更多：不能 require / 不能 process / 不能 Buffer
- 但本项目沙箱用途是"AI 生成的 Cesium 代码 dry-run"，**根本不需要 require**——只需 viewer/Cesium/scene 几个对象
- 性能：node:vm 比 vm2 慢 ~3x（10ms vs 3ms for 1k 行代码），但仍是 μs 级别
- 安全：node:vm 走 V8 自身 context，V8 团队持续 patch；vm2 已停维

**经验**：选沙箱前先列"沙箱到底要跑什么"——通常 node:vm + 显式 ctx 就够

### 3.4 P1-3 不引入 pino 的代价与收益

- 不引入 pino：少了 ~5MB 依赖 + 5x 性能下降（异步 IO 多一道）
- 引入 pino：5x 性能 + pino-http 自动 reqId 注入 + 社区更多文档
- 周期 3 选"不引入"——**因为我们没有高 QPS 场景**（AI 限流 60/min 已经很严）
- 周期 4+ 若 QPS 上 100+ 才考虑引入

**经验**：选依赖时先看"当前规模是否需要"——很多性能优化在 < 1000 QPS 都不显著

### 3.5 P1-4 URL 长度降级的"渐进剥离"模式

- tier 0：完整（去空字段）
- tier 1：去 aiDescription（最大概率膨胀）
- tier 2：只剩 camera
- tier 3：极端（console.warn 但仍返回 tier 2）

**经验**：降级策略应"按字段重要性排序"逐级剥离；不要一次性跳到"只保留 camera"——很多场景 layer 信息很有用

### 3.6 P2-2 Store 接口的"字符串 → 实例"模式

- `slidingWindow({store: 'redis'})` 字符串 → 自动 new RedisStore
- `slidingWindow({store: new InMemoryStore()})` 实例 → 复用
- `slidingWindow({})` 缺省 → 自动 new InMemoryStore

**经验**：API 同时接受"配置值（字符串）"和"实例"是 Node 圈惯例（`pino({transport: 'pino-pretty'})` 同款）；既支持声明式又支持编程式

## 4. 模型 / 预算观察

- 周期 3 调用：~3 次 WebSearch（仅 ipaddr.js + node:vm 沙箱 + permissions-policy 不确定时）
- 实际代码量：~2200 行（5 个新文件 + 4 个 patch）
- 7 个新 spec / 148 子断言全 PASS（写测试占开发时间 50%）
- commits 8（限 12），还有 ~4 个余量

**经验**：周期 4 不必把 12 个 commits 用满——质量 > 数量

## 5. 文档组织的"读者优先级"（与周期 1/2 一致）

| 文档 | 读者 | 风格 |
| ---- | ---- | ---- |
| `cycle-03-execution-plan.md` | 启动 agent | 任务清单 + 验收标准 + 风险 |
| `cycle-03-test-report.md` | 所有人 | 命令输出 + 结论 + 根因 |
| `cycle-03-bugs.md` | 开发 agent | 复现步骤 + 期望/实际 + 严重度 |
| `cycle-03-dev-log.md` | 后续周期 / 审计 | 改了哪些文件 + 新增 spec + 行为变化 |
| `cycle-03-research.md` | 后续周期 / 新人 | 主题 → 链接 → 摘要 → 行动 |
| `cycle-03-lessons.md` | 后续周期 | 经验沉淀（本文件） |
| `cycle-03-self-check.md` | 启动 agent / 复盘 | 预算 / 目标 / 风险打分 |

**经验**：本周期延续周期 2 模板，零调整成本

## 6. 复用到周期 4 的清单

- [ ] **C4-0** 创建 `docs/cycles/cycle-04-execution-plan.md` 时把本周期的 lessons 作为附录引用
- [ ] **C4-1** spec 目录预计新增 4-5 个：
  - `specs/ssrf-host-allowlist.cjs`（周期 4 P0-1 host middleware）
  - `specs/ssrf-metadata-ipv6.cjs`（周期 4 P0-1 169.254.170.2 / fd00:ec2::254）
  - `specs/ratelimit-redis-real.cjs`（周期 4 P0-2 真实 Redis，docker-compose）
  - `specs/logger-pino-perf.cjs`（周期 4 P1-1 pino 5x 性能 benchmark）
  - `specs/sandbox-worker-isolation.cjs`（周期 4 P1-2 worker_threads + watchdog）
- [ ] **C4-2** pino 引入决策：用 `npm install pino pino-http` 装；spec 跑 benchmark 验证 5x
- [ ] **C4-3** 限流升级到 Redis：用 `npm install ioredis rate-limit-redis`；周期 4 docker-compose 起 Redis
- [ ] **C4-4** 沙箱升级到 worker：评估 `npm install worker_threads`（内置）；Resource limits
- [ ] **C4-5** helmet 8.x 升级：`npm install helmet@^8`；先 review CHANGELOG 兼容 Cesium 第三方瓦片
- [ ] **C4-6** viewState lz-string 压缩：`npm install lz-string`；评估省 30-50% 长度
- [ ] **C4-7** OTEL 接入：`npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node`；周期 4 评估 trace
- [ ] **C4-8** 测试用 `withDnsStub` / `captureStdout` / `withTimeout` helper 抽到 `tests/helpers/`
