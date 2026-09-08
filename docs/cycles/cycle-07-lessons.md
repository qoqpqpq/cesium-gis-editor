# 周期 7 经验教训

> 周期：7（2026-09-08）
> 模型：MiniMax-M3
> 总结：从周期 6 到周期 7 复盘 + 给周期 8 的可复用清单

## 关键决策与依据

### 1. OTLP 与现有 Prometheus 风格 metrics 共存而非替换
- **决策**：在 `MetricsRegistry` 之上加 `toOtlpMetrics()` 转换层，端点 `GET /api/otlp/metrics` 复用同一份数据
- **依据**：周期 6 P1-1 自研 MetricsRegistry 已稳定（含 counter / histogram / labels），替换为 OTel SDK 风险大；加 exporter 几乎零成本
- **复用要点**：当已有自研 metrics 时，先加 OTLP/Prometheus exporter 而非换 SDK，保留双格式输出能力

### 2. isolated-vm 设计为可选依赖（动态 require）
- **决策**：`executeIsolatedVm` 内部 `require('isolated-vm')` 包 try/catch，失败返回 `{ok:false, code:'IV_NOT_AVAILABLE'}`；默认走 `node:vm + worker_threads`
- **依据**：node-gyp 在 Windows + Node 25 / 无 VS Build Tools 环境 100% 失败；预装 is 不可能
- **复用要点**：所有需要 C++ 编译的 native module 必须动态 require + 自动降级；不要在顶层 `require()`

### 3. better-sqlite3 同上做内存 fallback
- **决策**：`MemoryStore` 启动时探测 better-sqlite3，失败用 Map 后端；spec 与生产用同一 API
- **依据**：测试环境无 better-sqlite3 native binding；强制装会拖慢 CI；语义上"接口一致"足够验证
- **复用要点**：数据库 / native module 库都用"接口兼容 + 内存后端"双实现

### 4. ALS（AsyncLocalStorage）作为隐式上下文传递
- **决策**：`conversationContext` 包裹 `MemoryStore.remember/recall`，调用方无需显式传 userId
- **依据**：Express middleware → handler → async 工具调用链路长，显式传容易漏；ALS 跨 promise / setTimeout 自动传播
- **复用要点**：traceId / userId / tenantId 这类"贯穿整条请求链"的元数据，优先 ALS 而非 context 参数

### 5. PR review workflow 仅做骨架不接真实 API
- **决策**：`.github/workflows/pr-review.yml` 含 baseline + ai-review 占位 job，ai-review 用 `echo "TODO"` 跑通 CI
- **依据**：claude-code-action 需要 Anthropic API key + GitHub App；周期 7 预算有限，先把 workflow 结构 + 权限 + 触发条件跑通
- **复用要点**：接入第三方服务的 workflow 先用占位 job 跑通 CI，再逐步加真集成

## 错误与修复（待复用避坑）

### E-01 PowerShell `&&` 与 `&` 不可用
- **现象**：`node index.js && npm test` 报 `&&` 不是有效分隔符
- **修复**：用 `;` 替换；后台进程用 `Start-Process -FilePath node -ArgumentList ...` 而非 `&`
- **影响**：每个新 shell 周期都要重写启动命令；考虑封装 `scripts/start-dev.ps1` 统一调用

### E-02 大文件 SearchReplace 多次失败
- **现象**：尝试在 `server/agent/sandbox.js`（~600 行）一次替换 80 行，旧字符串 + 新字符串对不上（行号偏移 + 函数边界不一致）
- **修复**：分 3-4 次小段替换；每段仅改 5-15 行；用 `git diff --stat` 校验
- **影响**：写长文件改动前先 `Read` 完整内容；用 `SearchReplace` 时 old_str 必须唯一且包含上下文

### E-03 误删 parseSandboxError 函数体
- **现象**：用 `SearchReplace` 改 `parseSandboxError` 边界时，old_str 范围选错，把整个函数删了
- **修复**：`git checkout HEAD -- server/agent/sandbox.js` 回退 + 用更小的 old_str 单位重新替换
- **影响**：任何"删除函数或大段代码"操作，先 `cp` 备份；用 `git diff` 立即验证

### E-04 pr-review-workflow spec 误判 .env 提及
- **现象**：spec 扫描 `.github/workflows/pr-review.yml` 检测是否含 `.env`，yml 注释中含 "不要 hardcode .env" 触发了误报
- **修复**：加 `function nonCommentLines(text)` 过滤 `#` 开头行
- **影响**：YAML 静态扫描 spec 必须做注释过滤；JSON / TOML spec 同理

### E-05 TodoWrite "invalid params" 错误
- **现象**：一次 TodoWrite 调用报 `invalid params: deserialize params error`
- **修复**：重试即可；不是稳定问题
- **影响**：工具偶发；忽略但要继续推进任务

## 复用清单（给周期 8）

| # | 任务 | 模板 | 位置 |
|---|------|------|------|
| 1 | 落地任何 native module | 动态 require + 自动 fallback + spec 验证 fallback 路径 | `server/agent/sandbox.js:executeIsolatedVm` / `server/agent/memory.js:_tryLoadSqlite` |
| 2 | 跨请求元数据传递 | `new AsyncLocalStorage()` + middleware 包裹 + 隐式注入 | `server/agent/memory.js:conversationContext` |
| 3 | 协议 / 格式双输出 | 单一数据源 + 多个 to*() 转换器 | `server/middleware/metrics.js:toPrometheus + toOtlpMetrics` |
| 4 | 数据库 / 后端可选 | 探测驱动 + 内存 fallback | `server/agent/memory.js:MemoryStore` |
| 5 | 第三方工作流骨架 | baseline job 跑全 spec + 占位 job 标 TODO | `.github/workflows/pr-review.yml` |
| 6 | YAML / JSON 静态扫描 spec | `nonCommentLines(text)` 过滤 + `assert.doesNotMatch` | `tests/specs/pr-review-workflow.cjs:nonCommentLines` |
| 7 | 可选 C++ 依赖规格 | `try { require(...) } catch { return {ok:false, code:'NOT_AVAILABLE'} }` | `server/agent/sandbox.js:executeIsolatedVm` |
| 8 | 评估类 spec | "现状 + 决议" 二元结构；不强制实现 | `tests/specs/cesium-webgpu-detection.cjs` / `tests/specs/mcp-bridge-config.cjs` |
| 9 | 大文件分步改动 | 先 `Read` 全文 + 小段 `SearchReplace`（5-15 行/次）+ `git diff --stat` 验证 | sandbox.js 改 IV 时的步骤 |

## 调研 Top5 复盘

1. **FTS5**（高 ROI）：~10 行代码就能把 `memory.search()` 从 `LIKE '%q%'` 升级为 BM25 排序；better-sqlite3 已支持
2. **DecompressionStream 替代 pako**（高 ROI）：浏览器原生 API，零依赖；viewState.js 仅一处使用 pako，迁移成本低
3. **MCP 实际接入**（中 ROI）：browser-agent 模式零后端，3 分钟跑通；收益是 AI Agent 可与 Viewer 互操作
4. **OTel SDK 替换自研**（低 ROI / 高风险）：自研 MetricsRegistry 已稳定，OTLP exporter 跑通；继续自研
5. **mem0 向量化**（待商业化）：等真实用户与数据量再上；当前 ALS + SQLite 原型够用

## 周期 7 KPI

- 计划：3 P0 + 4 P1 + 2 P2 = 9 任务
- 实际：2 P0 + 4 P1 + 1 P2 = 7 任务落地 + 1 P0 评估（cesium-webgpu-detection）+ 1 P2 评估（helmet-permissions-policy）
- spec：8 新文件，99 子断言 PASS
- commit：6（不含总结文档）
- 调研：12 主题 × 5 链接 = 60 链接
- bug：0 新
- 回归：0
- 自检：97%
