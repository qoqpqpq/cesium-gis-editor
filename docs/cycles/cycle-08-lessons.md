# Cycle 08 — Lessons（经验沉淀）

> **周期**: N=8（2026-09-08）
> **总结**: 从周期 7 复盘到给周期 9 的可复用清单 + 关键踩坑
> **基调**: "流程侧成熟"——bug 修复显式化 + 评估 spec 驱动决策

## 1. 周期 7 → 8 的复利效应

- 周期 7 P0-4 OTLP 落周期 8 P0-1 FTS5 评估时已可参考 toOtlpMetrics 的"双格式输出"模式
- 周期 7 P1-2 isolated-vm resolveEngine 帮助周期 8 P1-2 executeSandbox 统一调度器设计（4 小时落地）
- 周期 7 P1-7 pr-review.yml baseline 占位 → 周期 8 P1-5 protocol-sync-script 是同样"硬约束 > LLM 自由发挥"的工程思想
- 周期 7 调研 Top5（FTS5 / DecompressionStream / MCP / OTel SDK / mem0）→ 周期 8 直接落 Top1+Top2（P0-1 FTS5 + P0-2 DecompressionStream）+ Top3（MCP manifest）

**经验**：周期 8 边际成本继续下降；调研 → 落地的"复利"路径已稳定。

## 2. 工程流程关键踩坑（11 项）

### E-01 C8-B01 周期 7 隐藏 bug（严重）

**现象**：周期 7 commit `6f5c704` 新增 `/api/otlp/metrics` 端点，但 `metricsOtlpHandler` 未加入 `server/index.js` 的 destructure。server 启动崩溃 → 周期 7 之后所有 server 操作失败。

**触发**：周期 8 测试阶段 `Start-Process node server/index.js` 立即触发 ReferenceError。

**根因**：
1. 周期 7 自检只跑 unit spec，未跑 server 启动验证
2. `tests/specs/otlp-exporter.cjs` 用 `require('../../server/middleware/metrics')` 单测 metrics 模块，未触达 `server/index.js` 导入路径
3. 周期 7 self-check 9 项评分缺"启动 server → 跑 checkpoint → 跑关键 spec"硬关

**修复**：1 行添加（commit `0e2aaf5`）。

**复用经验**：
1. **每个 PR 必跑 `node server/index.js & sleep 3 && curl localhost:3001/api/health`**（周期性 commit 也跑）
2. **静态扫描所有 `app.use / app.get / app.post` 的 handler 都在 destructure** —— 写 `tests/specs/server-import-completeness.cjs`（周期 9 P2）
3. **每个新端点引入 3 件套测试**：(1) 模块导出；(2) server destructure；(3) route 注册

### E-02 P0-1 FTS5 触发器动态需求

**现象**：FTS5 virtual table 用 `content='memories'` contentless 模式，需 INSERT/DELETE/UPDATE 三个触发器同步原表。

**踩坑**：第一版用 `IF NOT EXISTS` 但 better-sqlite3 触发器语法 `BEGIN ... END;` 容易少分号。

**修复**：用 `this.driver.exec()` 执行多语句；trigger name 加 `${this.table}` 前缀避免冲突。

**复用经验**：FTS5 contentless 模式必带 3 触发器；否则虚拟表与原表数据漂移。

### E-03 P1-2 executeSandbox engine 选择 bug

**现象**：第一版用 `resolveEngine(requested)` 间接判断。但 `resolveEngine('worker')` 返回 `{engine: 'vm', available: true}`（resolveEngine 把 'worker' 当 fallback）。

**后果**：默认走 vm 路径，破坏 worker 隔离（worker 是相对新加的；resolveEngine 没识别）。

**修复**：直接用 `requestedEngine === 'vm'/'worker'/'iv'/'auto'` 字符串判断；不要依赖 `resolveEngine` 间接判断。

**复用经验**：`resolveEngine()` 只用来检测 'auto'（是否装 iv）；其余按字符串分发。

### E-04 P1-4 CIDR 解析零依赖

**现象**：评估是否引 ipaddr.js（~50KB + 解析 IPv6）。

**决策**：自研 `ipv4ToInt` + `matchIpv4Cidr`（~30 行），处理 IPv4-mapped IPv6。

**复用经验**：CIDR 解析逻辑很简单（32-bit number + mask）；避免新依赖管理成本。

### E-05 P1-5 正则字面匹配 Windows 转义陷阱

**现象**：客户端 `const TOOL_RE = /<tool>...<\/tool>/gi` 在源码中显示为 `\u003c`、`\/`。第一版用 `[^/]*` 匹配不过（`\/` 在 regex 字符类里不被识别）。

**修复**：用更宽松 pattern `const\s+TOOL_RE\s*=\s*(\/[^/\n]+?(?:\\\/[^/\n]*?)*?\/[gimy]*)`。

**复用经验**：Node 源码读 regex 字面要处理 `\/`（转义 slash）；spec regex 写时显式 `\/` 或用 `[^/]*?(?:\\\/[^/]*?)*`。

### E-06 P2-1 helmet 8.x 关键发现（**反直觉**）

**现象**：本项目 helmet ^8.3.0 即便配置 `permissionsPolicy: {...}` 也**不输出** Permissions-Policy header。

**踩坑**：spec 写"应输出" → 运行失败 → 实际验证发现 helmet 8.3 未实现 PermissionsPolicy middleware。

**修复**：spec 改成"不输出（与周期 7 评估结论一致）"。

**复用经验**：helmet 8.x 升级前先 runtime 实测（不是看 CHANGELOG）；spec 应断言"实际行为"而非"期望行为"。

### E-07 动态 ESM import 在 Windows 用 file:// URL

**现象**：`import('E:\\path\\to\\file.mjs')` Node ESM 报 "Only URLs with a scheme in: file, data, and node are supported"。

**修复**：用 `require('node:url').pathToFileURL(filePath).href` 转 file:// URL。

**复用经验**：Node dynamic import 必须用 URL 形式；Windows 路径要 pathToFileURL 转换。

### E-08 ESM spec 跑通 child_process（临时 .mjs 文件）

**现象**：直接 `node -e "import('...')"` 在 PowerShell 转义陷阱多（`"`、`\n`、`$()`）。

**修复**：写临时 `.mjs` 文件到 os.tmpdir()，execSync `node "${tmpFile}"`；spec 结束清理。

**复用经验**：跨平台 ESM 测试用临时 .mjs 文件最稳。

### E-09 P0-2 DecompressionStream 与 pako 边界

**现象**：pako 用 raw deflate（zlib level=9）；DecompressionStream API 用 'gzip' 模式。两者**不兼容**。

**踩坑**：如果 buildViewStateHash 用 `zlib.deflateSync`，decompressFromBase64Async 用 `DecompressionStream('gzip')` 会失败。

**修复**：buildViewStateHash 改用 `zlib.gzipSync`（deflate + gzip header）；decompressFromBase64Async 用 `DecompressionStream('gzip')`。

**复用经验**：浏览器 gzip 解压必须用 gzip header；不要混 deflate 格式。

### E-10 P1-1 mcpManifest 防止覆盖 window.mcp

**现象**：可能已有第三方 MCP SDK 在 window.mcp 注册。

**修复**：检查 `window.mcp && window.mcp.__cesiumInstalled` 才覆盖；否则不操作。

**复用经验**：所有"挂全局对象"的代码都加 `__<project>Installed` 标记 + 不覆盖检查。

### E-11 周期主调度 PowerShell 限制

**现象**：PowerShell 不支持 `&&` `&`；`tail` 不存在；动态 ESM import 需 file:// URL。

**复用经验**（周期 6 E-01 起就已知）：
- 多个命令用 `;` 分隔
- 后台进程用 `Start-Process -FilePath ... -RedirectStandardOutput ... -RedirectStandardError ...`
- 输出用 `Select-Object -Last N` 或 `Get-Content -Tail N`
- 长字符串避免 `--input-type=module -e`（转义陷阱）；用临时 .mjs 文件

## 3. 架构与可观察性

### 3.1 FTS5 bm25 排序 vs LIKE 模糊匹配

- LIKE `%q%` 全表扫描；FTS5 bm25 排序倒排索引（O(log n)）
- FTS5 触发器保证原表 + 虚拟表一致性；LIKE 路径作 fallback（不抛错）
- spec 验证 `searchEngine: 'fts5' | 'like'` 字段 + `score` 字段（bm25）
- FTS5 不可用时（SQLite < 3.9 或编译选项关闭）自动回退 LIKE

### 3.2 executeSandbox 统一调度器设计

- 不依赖 `resolveEngine` 间接判断；按 requestedEngine 字符串分发
- 缺省 `'worker'`（与既有 ai.js 调用方一致）
- 返回值统一含 `engine` 字段；保留旧 3 函数向后兼容
- engine 优先级：`'vm'` < `'worker'` < `'iv'` < `'auto'`

### 3.3 memoryContextMiddleware ALS 自动注入

- middleware 包裹 next() 在 ALS context 内执行；handler 内 `MemoryStore.getContext()` 自动拿到 userId
- 默认提取：`x-user-id` header → `req.user.id` → `req.ip` → null
- 自动生成 `x-request-id` + 写响应头（便于客户端日志关联）
- 并发请求 ALS 隔离（AsyncLocalStorage 特性）

### 3.4 METRICS_TRUSTED_CIDRS 零依赖实现

- 默认仅 localhost 放行（最严）
- `METRICS_TRUSTED_CIDRS=10.0.0.0/8,172.16.0.0/12,...` 显式配置后放行 RFC1918
- 自研 `ipv4ToInt` + `matchIpv4Cidr`（处理 IPv4-mapped IPv6）
- 边界检查（/24 /16 /0 /32）+ 非法 CIDR 不报错（fallback false）

### 3.5 client/server 协议同步 CI 模式

- `scripts/check-protocol-sync.cjs` 每次 commit 前 CI 验证
- 检测 4 项：open/close 标签、工具名正则、parse.js 一致性
- `--json` 模式输出 JSON 报告；exit 0/1/2 区分状态
- Windows regex 字面处理 `\/` 转义

## 4. 文档与协作

### 4.1 周期 8 文档产出盘点

- 5 个新 spec 设计文档（tests/specs/*.cjs）
- 7 个 cycle-08 文档（plan / test-report / bugs / dev-log / research / lessons / self-check）
- 1 个 state.json 更新（current_cycle: 7 → 8）
- 1 个 upcoming-work.md 替换 Top5

### 4.2 文档写作经验

- **dev-log 列出"新增 spec + 子断言数 + commit 数"**——本周期 9 spec / 110 子断言 / 10 commit
- **lessons 写"踩过的坑"清单**——E-01 ~ E-11 共 11 项
- **self-check 用数据说话**——9 个评分维度 × 10 分 = 90 分（满分）
- **research 强结构**：每条链接一句话摘要 + 一行行动 + Top5 表

## 5. 复用清单（给周期 9+）

| # | 任务 | 模板 | 位置 |
|---|------|------|------|
| 1 | **任何新 server 端点** | "模块导出 + destructure import + route 注册"三件套 + 静态扫描 spec | server/index.js + tests/specs/server-import-completeness.cjs (P2) |
| 2 | **FTS5 全文检索** | contentless virtual table + 3 触发器 + LIKE fallback + bm25 排序 + `_sanitizeFtsQuery` | server/agent/memory.js:_initSqlite |
| 3 | **浏览器原生解压** | `new DecompressionStream('gzip')` 优先 + pako fallback + Blob + Response.text 链 | client/src/utils/viewState.js:decompressFromBase64Async |
| 4 | **MCP manifest 浏览器侧** | registerTool / manifest / callTool API + window.mcp 全局 + __cesiumInstalled 标记 | client/src/pages/gis/mcpManifest.js |
| 5 | **沙箱多引擎统一调度器** | 按 requestedEngine 字符串分发 + resolveEngine 只用于 'auto' 检测 + 保留旧函数向后兼容 | server/agent/sandbox.js:executeSandbox |
| 6 | **ALS Express middleware** | conversationContext.run 包裹 next() + 默认提取链（header → user → ip）+ 自动生成 requestId 写响应头 | server/agent/memory.js:memoryContextMiddleware |
| 7 | **CIDR 白名单零依赖** | ipv4ToInt + matchIpv4Cidr + 处理 IPv4-mapped + _trustedCidrsCache 缓存 + 边界检查 | server/middleware/metrics.js:isMetricsTrusted |
| 8 | **client/server 协议同步** | scripts/check-protocol-sync.cjs + Windows regex 转义处理 + --json 模式 + 模拟篡改测试 | scripts/check-protocol-sync.cjs |
| 9 | **跨平台 ESM 测试** | 写临时 .mjs 文件到 tmpdir + pathToFileURL 转 file:// + execSync node "${tmpFile}" + finally 清理 | tests/specs/mcp-manifest.cjs |
| 10 | **周期主调度"启动 server → checkpoint"硬关** | Start-Process node + sleep 4 + curl /api/health + node tests/checkpoint.cjs --report-only | 流程复用 |
| 11 | **helm 配置实测而非查 CHANGELOG** | spec 断言"实际行为"（runtime 启 express + helmet + 测响应头）；不依赖文档 | tests/specs/helmet-8-permissionspolicy-recheck.cjs |

## 6. 流程反思

### 6.1 做对的事

1. **C8-B01 立刻发现 + 修复** —— 周期 8 测试阶段第一行就跑 server 启动验证
2. **评估 spec 验证决策而非实施** —— P2-1 OTLP push + P2-2 helmet recheck 都用 spec 落地"评估结论"，避免无效代码
3. **FTS5 触发器动态需求** —— 用 contentless virtual table + 3 触发器保持同步，避免后期数据漂移
4. **MVP 模式** —— mcpManifest.js 不接真 MCP SDK，先实现 window.mcp + registerTool API
5. **零依赖决策** —— CIDR 解析自研（~30 行）vs 引 ipaddr.js（~50KB）
6. **错误处理 helper 复用** —— search() `_sanitizeFtsQuery` 转义；callTool `e.message ? e.message : String(e)` 兜底

### 6.2 可改进

1. **每个 PR 后跑 server 启动验证** —— 周期 7 漏跑导致 C8-B01；周期 9+ 加到 CI
2. **mcpManifest 完整集成测试** —— 当前 spec 仅测 window.mcp API；周期 9+ 测真 Claude Desktop 调用
3. **spec 模式字符串长度** —— `'const TOOL_RE = /.../gi'` 在 source code 里是 `\/`；写 spec regex 时要处理
4. **metrics CIDR cache 失效** —— `_trustedCidrsCache` 改 env 后需清缓存；spec 已验证 _resetTrustedCidrsCache，但生产 reload 时仍要监听 SIGUSR2
5. **ESM dynamic import 测试** —— PowerShell 转义陷阱多；spec 已用临时 .mjs 文件解决，但写作效率低；周期 9+ 评估 jsdom + ESM loader

## 7. 周期 9+ 建议

- **优先级**（按调研 Top5 + lessons 复用清单）：
  1. **server-import-completeness spec** —— 防止 C8-B01 类 bug 再发（spec 评估 spec）
  2. **MCP 真接入 cesium-mcp-bridge**（调研 Top1）—— 评估包大小 + 5 工具集成
  3. **memory.js WAL + 调优**（调研 Top3）—— `PRAGMA journal_mode=WAL` + 周期 `pragma optimize`
  4. **react-crash-guard 替换 ErrorBoundary**（调研 Top4）—— async error 捕获 + unhandledrejection 监听
  5. **claude-code-action 接 M3 跑 PR review**（调研 Top5）—— 周期主调度自动化升级
- **预算建议**：m3 给 spec 设计 + lessons 反思；M3 给真功能落地（mcp-bridge / WAL / ErrorBoundary 替换）
- **风险**：M3 在 M2.7-highspeed 与 coding 之间权衡；周期 9 评估是否需要切
- **跳过项**：CESIUM WebGPU 真切换（周期 7 P0-3 评估已 skip，本周期继续 skip）；mem0 真接 pgvector（商业化前不急）
