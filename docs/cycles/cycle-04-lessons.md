# Cycle 04 — Lessons（经验沉淀）

> **周期**: N=4（继承期）
> **目的**: 把本周期踩过的坑、做对的事、可复用的模式写成结构化笔记，供周期 5 直接复用。

## 1. 继承期的"调研落地"范式

周期 4 的核心是**把周期 3 调研 Top5 落为代码**，5/5 全落地：

- P0-1 (SSRF 补齐) ← Top5 #1
- P0-2 (Redis 分布式) ← Top5 #2
- P1-1 (可观察性升级) ← Top5 #3
- P1-2 (沙箱 worker) ← Top5 #4
- P1-3 (URL 压缩) ← Top5 #5

**经验**：调研 Top5 是"该周期行动的唯一可信源"——不要在执行时自己加新方向。周期 4 仅"自选 1 个补充（host allowlist middleware 路径限制）"，其他 5 项严格对齐调研。

## 2. 工程流程踩过的坑

### 2.1 P0-2 RESP 协议测试 "consumed=11" bug

- 写 spec 时手算 `$6\r\nfoobar\r\n` consumed：
  - `$` (1) + `6` (1) + `\r\n` (2) + `foobar` (6) + `\r\n` (2) = 12
  - 但 spec 写 `consumed === 11`（漏算了一个 `\r\n`）
- 第一次跑：FAIL（Expected 11, actual 12）
- 修：写 Node 调试脚本 `tests/specs/debug-parse.cjs` 打印实际长度 → 删 debug → 修测试
- **经验**：手算二进制长度容易错，先 `node -e` 验证

### 2.2 P0-2 module.exports.__test vs module.exports = {...}

- 第一版把测试用常量放 `module.exports.__test = {...}`，但 `__test` 字段不在 `module.exports = {...}` 的解构中 → 测试 require 时 `ALLOWED_HOSTS === undefined`
- 修：把 `__test` 加进 `module.exports = {...}` 对象里
- **经验**：export 字段要么在主 export 对象里，要么在 `__test` 子对象里——不能"我以为它在那里"

### 2.3 P1-1 logger 性能优化的"字符串拼接"模式

- 第一版用 `JSON.stringify(out)`：单次 ~10μs；10000 次 = 100ms
- 优化版：直接字符拼接 + 模板字符串，单次 ~3-5μs
- 10000 emit < 200ms（含 IO）
- **经验**：pino 5x 性能的秘密是"预编译 schema + 字符拼接跳过 JSON.stringify"；不引入 pino 也能借鉴

### 2.4 P1-2 setImmediate 嵌套陷阱

- 写 spec 时 `setImmediate(() => setImmediate(resolve(...)))` 在某些 Node 版本报错 "callback undefined"
- 修：每层 `setImmediate` 都显式传箭头函数 `setImmediate(() => setImmediate(() => resolve(...)))`
- **经验**：Node 24+ 的 setImmediate(callback) 如果不传 callback 会抛 TypeError（"callback must be function"）

### 2.5 P1-2 worker 死循环测试的"timeout 消息匹配"

- 第一版 spec 写 `/超时|SANDBOX/`，但 Node vm.runInContext 自身 timeout 抛 `"Script execution timed out after 200ms"`（英文）
- 修：扩正则 `/timed out|SANDBOX|超时/`
- **经验**：跨语言 spec 错误匹配要写"语义等价正则"

### 2.6 P1-3 zlib 中文 73x 压缩比的"反直觉"现象

- 100K 中文字符 base64 = 40140B
- 100K 中文字符 zlib deflate = 549B
- **73x 压缩比**——因为 deflate 是 LZ77 + Huffman，中文重复字符压缩效率极高
- 这意味着：周期 3 P1-4 的"8KB 降级"实际"几乎不会触发"（普通场景 549B 就够了）
- **经验**：选 zlib 而非 lz-string（后者压缩比 < 50%，中文场景）

## 3. 架构与安全

### 3.1 P0-1 SSRF 终极防御的"多角度"叠加

OWASP 6 步 + 周期 4 增量 3 步 = 9 步防御：

1. URL 规范化
2. 协议白名单
3. WHATWG URL 解析
4. DNS + IP 分类
5. 链路重校验（redirect:'manual'）
6. 超时
7. **host allowlist（防 Host 头绕过）** ← 周期 4
8. **全 metadata IP 黑名单（含 IPv6）** ← 周期 4
9. **pin IP（解析后用 IP 直连，TLS SNI 仍用原 host）** ← 周期 4

**经验**：SSRF 防御不是"做一次就好"，是"叠加每一层都堵住一类攻击"。每个周期增加 1-3 层，3 周期就齐活

### 3.2 P0-2 Redis 客户端的"零依赖"哲学

- 不引入 ioredis（虽然它更强大）
- 手写 RESP 协议 ~200 行，仅支持 PING / ZADD / ZREMRANGEBYSCORE / ZCARD / DEL / EXPIRE 6 个命令
- **够用就好**——sliding window 只需这 5 个
- 失败兜底：Redis 挂掉时仍放行（`degraded:true` 标记）
- **经验**：新依赖 = 新部署面 + 新升级风险；先用 200 行自研跑通，等真需要 cluster / sentinel 再引 ioredis

### 3.3 P1-1 W3C traceparent 透传的"无 SDK 也能做"

- 不引入 @opentelemetry/sdk-node（巨大依赖）
- 自研 50 行实现：parse + generate + httpLoggerMiddleware 集成
- 跨服务传递：客户端发 `traceparent` 头 → 服务端透传 → 子调用栈用 `generateTraceparent`
- **经验**：W3C Trace Context 是"标准字符串协议"，不需要 SDK 也能用

### 3.4 P1-2 worker 死循环"不卡主线程"的实测价值

- 周期 3 `executeInSandbox` 死循环：vm.runInContext timeout = 200ms，主线程被卡 200ms（其他请求被阻塞）
- 周期 4 `executeInSandboxWorker` 死循环：worker 卡，主线程 setInterval(50ms) 仍正常 tick
- **关键差异**：用户体验从"沙箱期间整个 server 卡顿"变成"沙箱期间 server 正常服务"
- **经验**：涉及"用户输入代码"的功能（sandbox），一定要上 worker 隔离

### 3.5 P1-3 压缩的"何时用 v1 / v2"边界

- v1 走 base64url（明文 JSON）—— 适用于小 payload（< 512 字节）
- v2 走 zlib 压缩 —— 适用于大 payload（>= 512 字节）
- 阈值 512 是经验值：zlib 头开销 ~10 字节，512 字节 payload 压缩收益才显著
- **经验**：v1/v2 协议并存时写 spec 必测"边界场景"（刚好 511/512 字节）

## 4. 模型 / 预算观察

- 周期 4 调用：~3 次 WebSearch（仅 Otel SDK / worker resourceLimits / Redis Cluster 不确定时）
- 实际代码量：~3000 行（5 个新文件 + 5 个 patch + 6 个新 spec）
- 7 个新 spec / 127 个子断言全 PASS（写测试占开发时间 50%）
- commits 7（限 12），还有 ~5 个余量

**经验**：周期 4 没把 commits 用满（仅 7/12）。说明"调研 Top5"足够"密"，不必硬塞 P2

## 5. 文档组织的"读者优先级"（与周期 1-3 一致）

| 文档 | 读者 | 风格 |
| ---- | ---- | ---- |
| `cycle-04-execution-plan.md` | 启动 agent | 任务清单 + 验收标准 + 风险 |
| `cycle-04-test-report.md` | 所有人 | 命令输出 + 结论 + 根因（简化为"7 个新 spec 全 PASS"） |
| `cycle-04-bugs.md` | 开发 agent | 复现步骤 + 期望/实际 + 严重度（未发现新 BUG） |
| `cycle-04-dev-log.md` | 后续周期 / 审计 | 改了哪些文件 + 新增 spec + 行为变化 |
| `cycle-04-research.md` | 后续周期 / 新人 | 主题 → 链接 → 摘要 → 行动 |
| `cycle-04-lessons.md` | 后续周期 | 经验沉淀（本文件） |
| `cycle-04-self-check.md` | 启动 agent / 复盘 | 预算 / 目标 / 风险打分 |

**经验**：本周期延续周期 1-3 模板；测试报告/合 bugs 简化为"7 个新 spec 全 PASS"（dev-log 覆盖）

## 6. 复用到周期 5 的清单

- [ ] **C5-0** 创建 `docs/cycles/cycle-05-execution-plan.md` 时把本周期的 lessons 作为附录引用
- [ ] **C5-1** spec 目录预计新增 4-5 个：
  - `specs/metadata-ip-maintenance.cjs`（周期 5 P0-1 黑名单同步 IANA 流程）
  - `specs/redis-pipelining.cjs`（周期 5 P0-2 pipelined ZADD）
  - `specs/otel-logs-bridge.cjs`（周期 5 P1-1 logs bridge 到 Otel）
  - `specs/sandbox-cpu-watchdog.cjs`（周期 5 P1-2 worker CPU 监控）
  - `specs/viewstate-browser-polyfill.cjs`（周期 5 P1-3 浏览器端用 CompressionStream 解压）
- [ ] **C5-2** Redis Lua atomic：用 EVAL/EVALSHA 替代 ZADD+ZREM 2 步
- [ ] **C5-3** helmet 8.x 升级：`npm install helmet@^8`；先 review CHANGELOG 兼容 Cesium 第三方瓦片
- [ ] **C5-4** Otel SDK 评估：`npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node`；spec 跑 `console 导出 traceId` 验证
- [ ] **C5-5** 多级限流：IP（60/min）+ userId（200/min）+ AI key（300/min）
- [ ] **C5-6** CompressionStream polyfill：浏览器侧用 `new DecompressionStream('deflate')` 解压 v2 hash
- [ ] **C5-7** 测试用 `withDnsStub` / `captureStdout` / `withTimeout` helper 抽到 `tests/helpers/`（本周期再次重复）
- [ ] **C5-8** pino 真正引入：自研 2-3x 性能 vs pino 5x——若 QPS 上 100+ 再考虑

## 7. 周期 5 优先级（基于调研 Top5 + lessons 复用）

1. **P0-1** SSRF 终态：维护 metadata IP 黑名单表（与 IANA 同步），加 ECS task metadata IPv6
2. **P0-2** 限流分布式 + 多级：Redis Lua atomic + IP/userId/API key 三级限流
3. **P1-1** 可观察性升级：全 Otel SDK（auto-instrumentation）+ Metrics（Prometheus）+ Logs Bridge
4. **P1-2** 沙箱深度隔离：CPU watchdog + isolated-vm 备选
5. **P1-3** 压缩统一：浏览器侧 CompressionStream polyfill
