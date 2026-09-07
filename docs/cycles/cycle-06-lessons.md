# Cycle 06 — Lessons（经验沉淀）

> **周期**: N=6
> **目的**: 把本周期踩过的坑、做对的事、可复用的模式写成结构化笔记，供周期 7 直接复用。

## 1. 周期 5 → 6 的"复利效应"

周期 6 的边际成本继续下降：

- 周期 1-5 共 32 个老 spec 全可用作"模式模板"，5 段结构（静态扫描 / 行为 / 边界 / 兼容 / benchmark）复用
- 周期 5 调研 Top5 直接落到 P0-1（续） / P0-2（续） / P1-1 / P1-2（续） / P1-3 = 5 项，无需重新调研
- 周期 5 留的 10 个 bug（B01..B10）已 100% 关闭或转下个周期

**经验**：周期 7 不必再做大调研（除非新方向），应聚焦"周期 6 落地时发现的二级问题 + 调研 Top5 落点"。

## 2. 工程流程踩过的坑

### 2.1 P0-2 续：Token Bucket middleware 添加位置错误

- 第一版把 `tokenBucket` 函数体放在了 `slidingWindow` 函数内（不是导出，而是在中间件 return 之前）
- `module.exports` 时 `tokenBucket` 仍是 undefined
- **经验**：跨大函数插入时 `SearchReplace` 的 `old_str` 范围要严格匹配（只覆盖到原函数结束括号），不能在中间插入新函数定义
- **修复**：撤销后用两个独立 SearchReplace：① 在 slidingWindow 末尾之前插入 tokenBucket；② 在 module.exports 添加导出

### 2.2 P1-1：MetricsRegistry.toPrometheus 计数 Map 反解错误

- 第一版用 `for (const h of m.values())` 迭代 Map 的 value，但 value 是 number 不是 struct
- 实际 Map 存的是 `<labelsHash, number>`，hash 是 JSON 字符串
- **错误**：`h.labels` 是 undefined → `Object.keys(undefined)` 抛 TypeError
- **修复**：改用 `for (const [k, v] of m.entries())` + `labelsFromKey(k)` 反解
- **经验**：自研 Map-based registry 时，区分"value 是 struct"vs"value 是 scalar"两种模式
- **测试发现**：客户端 fetch `/api/metrics` 200 但响应体只有 `\n`（1 字节）—— 这种"返回成功但内容空"的 bug 静态扫描抓不到，**必须端到端测试**

### 2.3 P1-2 续：v8 heap snapshot 触发时被 worker.terminate 抢断

- 旧设计：`captureWorkerHeapSnapshot` 调 `worker.postMessage({event:'snapshot_request'})` → 主线程立刻 `safeResolve(pendingOk)` + `worker.terminate()`
- worker 被 terminate 后无法完成 v8.writeHeapSnapshot → snapshot_done 永远不来
- **修复**：snapshot 是 fire-and-forget，不阻塞 safeResolve；worker 端 `setTimeout(process.exit, 300)` 给 snapshot 至少 6 个 sample 时间
- **次要 bug**：主线程 `worker.on('message')` 收到 `{event: 'snapshot_done'}` 时被当作 result 解析（没有字段保护）
- **修复**：在主 `worker.on('message')` 顶部加 `if (msg.event in {snapshot_done, snapshot_error}) return;` 跳过 control message
- **经验**：双向 postMessage 协议必须用 `event` 字段前缀；control message 不应触发业务 result 路径

### 2.4 P1-4：multiLevelLimiter 共享 store 修复（周期 5 隐藏 bug）

- 旧设计：`multiLevelLimiter` 每次循环调 `slidingWindow({...})(req, res, next)` —— `slidingWindow` 内部 `new InMemoryStore()` 每次都新建
- 后果：每个维度的 limit 不生效（每次重置，count 永远 ≤ 1）
- **暴露**：周期 6 P1-4 动态测试时才发现（周期 5 静态扫描 + 行为测试都没覆盖）
- **修复**：`const sharedStore = opts.store || new InMemoryStore();` —— 一次性创建
- **经验**：测试 helper 必须做"limit 真生效"的动态验证（耗光 limit → 期望 429），而不是只测"limit 头返回"或"成功调用"

### 2.5 P1-3：客户端 viewState pako 引入位置

- 周期 4 P1-3 zlib 压缩是 Node 端专用；浏览器侧 DecompressionStream 不存在（需 polyfill）
- 第一版用 `require('node:zlib')` —— 浏览器 bundle 报 `module is not defined`
- **修复**：
  - 拆 `compressToBase64`（Node sync）/ `decompressFromBase64Async`（浏览器 async pako）
  - 浏览器侧 `let _pakoInflate = null` + `await import('pako')` 懒加载
  - 同步 `readViewStateFromUrl` 保留 v1 路径
  - 新增 `readViewStateFromUrlAsync` 异步双协议
- **经验**：跨平台工具（Node + 浏览器）用"显式平台分支 + 同步/异步双 API"，**不要依赖运行时** try-catch 切换

### 2.6 P2-4 + P2-6：协议 OpenAI tool_calls 重复匹配

- 第一版两个正则独立匹配，`<json>{"tool_calls":...}</json>` 同时被 `TOOL_CALLS_JSON_RE` 和 `TOOL_CALLS_INLINE_RE` 匹配 → 重复插入
- **修复**：`matchedRanges = []` 跟踪 fenced 区间；inline 阶段跳过 `inFenced` 的区间
- **经验**：多个正则共享目标时（如 fenced + inline JSON），用区间去重；不要相信正则的 `g` 标志会自动去重

### 2.7 SearchReplace 在多文件大量 edit 时的不可靠性

- 本周期用 SearchReplace 编辑 `rateLimit.js` 4 次、编辑 `sandbox.js` 3 次、编辑 `viewState.js` 2 次，每次都需要精确 `old_str` 匹配
- 失败 2 次（tokenBucket 函数体被吞 / sandbox 末尾 worker.on('error') 被截）
- **经验**：长文件（>200 行）改 3+ 处时优先用 `Write` 重写整个文件，或先 Read 完整内容确认结构
- **fallback**：若 SearchReplace 失败，**立即 Revert + Write 整文件** 比多次修补快

## 3. 架构与可观察性

### 3.1 自研 MetricsRegistry 的轻量取舍

- 周期 6 P1-1 选择**自研 MetricsRegistry** 而不是引 prom-client（避免新依赖）
- 零依赖 / 200 行代码 / Counter + Histogram / 11 个固定桶
- 与 prom-client 对比：
  - 自研：无 label 拼接性能（HashMap + JSON.stringify）
  - prom-client：~30KB，完整 label set 优化
- **结论**：本项目单实例 / localhost-only metrics，自研足够；多实例 / 跨服务聚合时再换 prom-client
- **经验**：周期 7 接入 OTLP exporter 时，registry 暴露 `toJSON()` / `toPrometheus()` 双格式即可

### 3.2 heap snapshot 触发与节流的协调

- 触发条件多：`cpu_abort` / `worker error` / `ok finish` / `exit code != 0`
- 节流：相同 trigger 1s 内不重复（`Map<trigger, lastMs>`）
- 保留：最近 5 个 LIFO（`readdirSync` + `sort mtime` + `unlinkSync` 旧文件）
- **经验**：dump 1-2MB 文件高频触发会撑爆磁盘；节流 + LIFO 是最小可用组合
- **未来**：周期 7+ 评估 OSS snapshot 服务（如 Sentry / Highlight.io）

### 3.3 v8.writeHeapSnapshot 只在 worker 线程内可调

- 这是 v8 API 限制：主线程不能调 `v8.writeHeapSnapshot`
- **解决**：worker 端 `parentPort.on('message')` 监听 `snapshot_request` → `v8.writeHeapSnapshot(path)` → postMessage path → 主线程读盘 → 写到 SNAPSHOT_DIR
- **兜底**：worker 可能被 terminate，路径放在 `os.tmpdir()` 临时目录（避免污染 SNAPSHOT_DIR）
- **经验**：API 限制驱动架构——"哪个线程能做什么"必须在设计阶段明确

## 4. 文档与协作

### 4.1 周期 6 文档产出盘点

- 7 个文档：`execution-plan` / `test-report` / `bugs`（无新 bug）/ `dev-log` / `research` / `lessons` / `self-check`
- 1 个 `state/cycle-state.json` 更新（current_cycle: 6 → 7）
- 1 个 `docs/release-notes/upcoming-work.md` Top5 替换
- 8 个新 spec（112 子断言）+ 1 个新 helper spec（12 子断言）= 124 子断言
- **9 个 commit** 全部 pushed（1 chore + 8 feat/fix + 1 docs = 9 commit）

### 4.2 文档写作经验

- **dev-log 不再重复代码**：只列"改了哪些文件 / 新增 spec / 行为变更（API）/ 提交记录"
- **lessons 写"踩过的坑"**：SearchReplace 失败 / Map 反解 / worker 抢断 / 共享 store bug —— 这些是周期 7 必看的"防陷阱清单"
- **self-check 用数据说话**：每项打 0-5 分（5 维度 × 5 分 = 25 分 = 满分）
- **research 强结构**：每条链接只一句话摘要 + 一行行动 + 落点；避免长段落

## 5. 复用到周期 7 的清单

- [ ] **C7-0** 写 `cycle-07-execution-plan.md` 时把本周期的 lessons 作为附录引用
- [ ] **C7-1** 评估 mem0 接入（self-host OpenMemory）；先用 ALS + SQLite 自研 prototype
- [ ] **C7-2** 评估 CesiumJS WebGPU pipeline 升级（帧率 3-6x）；评估 cesium-mcp-bridge 嵌入
- [ ] **C7-3** 评估 OTLP HTTP exporter（接 Jaeger / Tempo）；`/api/metrics` 已有，export 容易
- [ ] **C7-4** 评估 fflate 替代 pako（~5KB vs ~45KB）
- [ ] **C7-5** 评估 `isolated-vm`（高安全要求，node-gyp 编译；先做 fallback）
- [ ] **C7-6** 周期 6 隐藏 bug：multiLevelLimiter 共享 store 修复已在周期 6 落地；继续观察其它 store 抽象
- [ ] **C7-7** 每周 commit 后立即验证 PR 自动跑（接 PR review automation AI）
- [ ] **C7-8** 测试 helper 抽到 `tests/helpers/`（withDnsStub / captureStdout / mockSseRes / withRedisStub / 计数器 Map 反解 helper）
- [ ] **C7-9** 老 spec 改文案同步（不修源代码时不需要；动源代码时静态扫描 + spec 文案同时改）
