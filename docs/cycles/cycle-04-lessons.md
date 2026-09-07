# Cycle 04 — Lessons（经验沉淀）

> **周期**: N=4（继承期）
> **目的**: 把本周期踩过的坑、做对的事、可复用的模式写成结构化笔记，供周期 5 直接复用。

## 1. 继承期的"复利效应"——延续到周期 4

周期 4 的边际成本继续下降：

- 周期 1/2/3 共 19 + 6 + 7 = 32 个老 spec 全可用作"模式模板"
- 周期 3 调研 Top5 直接落到 P0-1 / P0-2 / P1-1 / P1-2 / P1-3 = 5 项，无需重新调研
- 周期 3 留 B01..B10 bug 报告做"清单 check"，逐项验收（10 项里 7 项本周期 4 修复）

**经验**：周期 5 不必再做大调研（除非有新方向），应聚焦"周期 4 落地时发现的二级问题 + 调研 Top5 落点"。

## 2. 工程流程踩过的坑

### 2.1 P0-2 Redis 零依赖实现的"协议边界"问题

- 第一版直接用 `redis` npm 包（社区标准），但周期 3 已经把 ioredis/redis 列为"避免新依赖"
- 改用手写 RESP 协议 → 260 行代码量（`redisClient.js` + 增强 `rateLimitStore.js`）
- 关键设计：用 `EventEmitter` + 简单 FIFO 队列处理请求/响应匹配；socket 上 recv 数据按字节流累积 → `parseReply` 解析多种 RESP 类型

**经验**：零依赖实现的边界是"用到的 RESP 命令子集"。周期 5 若需扩展 Redis 命令（如 cluster / sentinel），应继续走"增加 RESP 命令"模式而不是切到 ioredis。

### 2.2 P0-2 RESP 解析的"边界帧"问题

- TCP 是字节流，单次 `data` 事件可能只含半个命令响应
- 第一版用 `socket.once('data')` → 漏包
- 改用累积 Buffer + 循环 `parseReply`，每次消费返回 consumed 字节
- `NeedMoreDataError` (`EAGAIN` code) 用于"数据不够"信号

**经验**：手写任何 socket 协议都要考虑"边界帧"——TCP 是字节流，不是消息流。

### 2.3 P0-1 pin IP 实现 + TLS SNI 的复杂性

- 周期 4 想"pin IP"（已校验 IP 直接 socket 连接）防止 DNS rebinding 在"校验后到 fetch 时"的窗口内抢跑
- 正确做法：把 hostname 替换为 IP（URL 用 `https://[IP]:port/path`），但 Host 头保留原 hostname（让 TLS SNI 验证证书）
- 依赖 Node 18+ `undici` 的 dispatcher option；本周期先简化路径："用 fetch + 自定义 Host 头"，TLS 验证仍依赖 undici 默认
- 未来优化：写 custom Agent + `lookup` 函数（返回已验证 IP + 保持 hostname）做"完美 pin"

**经验**：pin IP 是 SSRF 6 步的最后一步也是最难一步；当前实现是"接近 pin"，完整 pin需要 custom lookup callback 或 dispatcher。

### 2.4 P1-3 viewState 压缩比与协议兼容

- 100K 中文字符 → zlib deflate → 549B（压缩比 0.5%）
- 但加 base64url 后又 +33%（utf-8 1B → 4B/3B）；最终 `v2:` prefix 549B vs `v1:` prefix 40140B（约 0.014×）
- 协议前缀 `v2:` 是关键——浏览器读取时自动检测新旧协议
- 阈值 `512 字节` 是经验值（< 512 压缩不划算）

**经验**：协议升级必须"双版本共存"——新 client 解老 URL（v2 读 v1）；老 client 跳新 URL（v1 路径不动，老 client 仍可用）。`v2:` prefix 是这种约定的标准实现。

### 2.5 P2-2 SSE bufferProvider 的"降级链"模式

- 设计 bufferProvider 时考虑 4 种情况：
  1. **无 Last-Event-ID**：bufferProvider 不用
  2. **有 Last-Event-ID，无 bufferProvider**：不调用（向后兼容周期 2/3）
  3. **有 Last-Event-ID + bufferProvider**：调 `getSince(lastId)` 回放
  4. **bufferProvider.getSince 抛错**：捕获 + console.error，主流程不中断
- 关键：**任何环节出错都不能阻断主流程**——SSE 的"实时流"才是用户体验核心，buffer 续传是 nice-to-have

**经验**：可选依赖的 fallback 链要明确"哪一步失败不影响主流程"。

### 2.6 P1-2 worker 与主线程的"通信序列化"问题

- worker_threads 通过 `parentPort.postMessage` 通信，所有数据需结构化克隆
- ctx 中若含 Cesium Viewer 实例（WebGL context）→ 不可克隆 → 报错
- 当前实现：ctx 仅放"业务命名数据"（JSON-safe），不直接放 Cesium Viewer
- 周期 5 若需把 Viewer 传进 worker → 需用 SharedArrayBuffer + typed array 共享

**经验**：worker_threads 通信边界要严格区分"可序列化数据" vs "GPU / 原生资源"。

### 2.7 P2-1 helmet 8 升级的"显式字段"雷

- helmet 8 breaking change: `hsts: { includeSubDomains: ... }` 拼错由 warn 变 throw
- 我们的 config 没显式设 `includeSubDomains`（用 helmet 默认）→ 没踩雷
- 若改 `hsts: { includeSubDomains: true }` 拼成 `includeSubdomians` → 启动抛错

**经验**：升级 helmet 时"配置项里没显式设的字段"最安全；显式设的字段都要查 CHANGELOG 拼写校验。

### 2.8 P2-1 helmet 8 与 Cesium 第三方 CDN 的兼容性

- 周期 3 显式设 `crossOriginEmbedderPolicy: false`（Cesium 瓦片来自第三方 CDN，不能 cross-origin-isolate）
- helmet 8 默认设 COEP=false → 保持向后兼容
- 但 helmet 8 默认开启 HSTS（`max-age=31536000; includeSubDomains`）—— 仅 HTTPS 场景有效；HTTP dev 环境不生效

**经验**：第三方 CDN 瓦片 + helmet 默认安全头总有冲突，每次升级 helmet 都要检查 COEP / CORP / COOP 三个 cross-origin 头。

## 3. 架构与安全

### 3.1 SSRF 6 步"分步实施"完成

- 周期 2 P1-8: URL 解析 + DNS + IP 分类（3 步）
- 周期 3 P0-1: 精确 IP 分类（25+8 段）+ safeFetch 禁重定向（2 步）
- 周期 4 P0-1: Host allowlist + metadata IP 黑名单 + pin IP（1 步 + 加固）

**OWASP SSRF 6 步全齐**。下个周期关注：request smuggling / HTTP/2 攻击面。

### 3.2 零依赖原则的代价与收益

- 周期 4 0 新 npm 包（除了 helmet 升级）：手写 RESP + 手写 W3 trace + zlib（Node 内置）+ worker_threads（Node 内置）
- 收益：部署面最小 + 审计面最小 + 启动 < 200ms
- 代价：260 行 redisClient.js 是 ioredis ~30KB 库等价功能

**经验**：对于"用到的命令子集"，手写协议通常 < 500 行；trade-off 是"加新命令需要手动实现 + 单元测试"。若周期 5+ 需要大量 Redis 命令（cluster / streams / pubsub），则引入 ioredis 更划算。

### 3.3 Worker 沙箱的 Resource limits 精度

- 周期 4 P1-2 实现了：
  - `maxOldGenerationSizeMb=64`（V8 老生代上限）→ 超限抛 RangeError
  - `maxYoungGenerationSizeMb=16`（新生代上限）
  - `codeRangeSizeMb=128`（代码段上限）
  - `timeoutMs=5000` + `worker.terminate()` 兜底
- 未实现：CPU watchdog（`process.cpuUsage()` 采样 + 超阈值 terminate）

**经验**：CPU 监控比 heap 监控难——worker 内 CPU 用量需主动采样（`process.cpuUsage()` 仅 worker 进程自身可见），主线程只能间接监测（worker message 心跳）。

### 3.4 压缩算法的选择

- 周期 4 P1-3 选 zlib（Node 内置 + 浏览器 DecompressionStream 异步）
- 中文 + AI 长描述 + 重复字段 → deflate 压缩比极高（0.5%）
- 备选 lz-string（更小 + 同步 + 浏览器友好）但许可非 MIT（WTFPL 宽松但商业需注意）

**经验**：压缩比 vs 兼容性 trade-off——Node 内置 zlib 是最佳选择；浏览器侧用 DecompressionStream 异步解压（仍兼容）。

## 4. 模型 / 预算观察

- 周期 4 调用：
  - WebSearch: 12 次（每个调研主题 1 次）
  - WebFetch: 0（搜索结果已含摘要）
  - 实际代码量：~1900 行（7 个新文件 + 5 个 patch）
  - 8 个新 spec / 145 子断言全 PASS（写测试占开发时间 40%）
  - commits 7（限 12），余 5
- 模型 m3 调用 ~15（WebSearch + 文档写作）
- M3 调用 ~120（代码改写 + 测试 + 文档）
- m3 预算 150 用 10%；M3 预算 450 用 27%

**经验**：周期 5 余量充足，可承接 P2-3（PLATFORMS 自检）+ P2-5（协议统一）+ 新增调研方向（memory / MCP）。

## 5. 文档组织的"读者优先级"（与周期 1/2/3 一致）

| 文档 | 读者 | 风格 |
| ---- | ---- | ---- |
| `cycle-04-execution-plan.md` | 启动 agent | 任务清单 + 验收标准 + 风险 |
| `cycle-04-test-report.md` | 所有人 | 命令输出 + 结论 + 根因 |
| `cycle-04-bugs.md` | 开发 agent | 复现步骤 + 期望/实际 + 严重度 |
| `cycle-04-dev-log.md` | 后续周期 / 审计 | 改了哪些文件 + 新增 spec + 行为变化 |
| `cycle-04-research.md` | 后续周期 / 新人 | 主题 → 链接 → 摘要 → 行动 |
| `cycle-04-lessons.md` | 后续周期 | 经验沉淀（本文件）|
| `cycle-04-self-check.md` | 启动 agent / 复盘 | 预算 / 目标 / 风险打分 |

**经验**：本周期延续周期 1/2/3 模板，零调整成本。

## 6. 复用到周期 5 的清单

- [ ] **C5-0** 创建 `docs/cycles/cycle-05-execution-plan.md` 时把本周期的 lessons 作为附录引用
- [ ] **C5-1** spec 目录预计新增 5-7 个：
  - `specs/mem0-integration.cjs`（周期 5 调研 Top1 — AI 长期记忆）
  - `specs/mcp-server.cjs`（调研 Top2 — Cesium MCP 桥接）
  - `specs/otel-sdk-trace.cjs`（调研 Top4 — 完整 OTEL 接入）
  - `specs/protocol-unified.cjs`（P2-5 + P2-8 合并实施 — `<tool>` + OpenAI tool_calls）
  - `specs/cpu-watchdog.cjs`（C4-B04 — sandbox CPU 监控）
  - `specs/redis-cluster.cjs`（C4-B03 — ioredis cluster）
- [ ] **C5-2** Mem0 评估：`npm install mem0ai` 装；与 Hologres Long Memory Service 评估
- [ ] **C5-3** MCP Server 评估：`npm install @modelcontextprotocol/sdk` 装；用 stdio + HTTP 双 transport
- [ ] **C5-4** OTEL 完整接入：`npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http`；本地用 OTLP HTTP exporter 上报到 console（与 Jaeger / Tempo 兼容）
- [ ] **C5-5** 协议统一：把 `client/src/pages/gis/sandbox.js` 协议字符串搬到 `client/src/pages/gis/protocol.js`，server `agent/protocol/parse.js` 引用之；新增 `tool_calls` OpenAI 风格字段
- [ ] **C5-6** Prisma + SQLite WAL：若周期 5 引入用户偏好 / Agent 记忆存储，按 SQLite 5 项 PRAGMA（journal_mode=WAL / synchronous=NORMAL / mmap_size=128MB / temp_store=MEMORY / PRAGMA optimize）
- [ ] **C5-7** CodeRabbit / Claude Code `/review`：评估给 PR 流程接自动 PR Review
- [ ] **C5-8** 测试 helper 抽到 `tests/helpers/`：`withDnsStub` / `captureStdout` / `mockSseRes` / `withRedisStub`
- [ ] **C5-9** ioredis 决策：若周期 5 需要 cluster / sentinel，则 `npm install ioredis` 替换手写 RESP（节省维护成本）