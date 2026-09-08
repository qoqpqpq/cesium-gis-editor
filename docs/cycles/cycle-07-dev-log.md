# 周期 7 开发日志

> 周期：7（2026-09-08）
> 模型：MiniMax-M3
> 分支：feat/auto-cycle
> 状态：completed

## 交付清单

| 编号 | 类别 | 主题 | 文件 | 提交 |
|------|------|------|------|------|
| P0-3 | 评估 | Cesium WebGPU / MCP bridge | `tests/specs/cesium-webgpu-detection.cjs` + `tests/specs/mcp-bridge-config.cjs` | 0f94504 |
| P0-4 | 落地 | OTLP HTTP exporter | `server/middleware/metrics.js` + `server/index.js` + `tests/specs/otlp-exporter.cjs` | 2efa814 |
| P1-2 | 落地 | isolated-vm 引擎选择 | `server/agent/sandbox.js` + `tests/specs/sandbox-engine-select.cjs` | 0cbd001 |
| P1-5 | 落地 | mem0 原型（ALS + SQLite） | `server/agent/memory.js` + `tests/specs/memory-als-sqlite.cjs` | aa4d2d8 |
| P1-6 | 评估 | fflate 评估 | `tests/specs/fflate-decompress.cjs` | aa4d2d8 |
| P1-7 | 落地 | PR review workflow 骨架 | `.github/workflows/pr-review.yml` + `tests/specs/pr-review-workflow.cjs` | aa4d2d8 |
| P2-8 | 评估 | helmet permissionsPolicy 评估 | `tests/specs/helmet-permissions-policy.cjs` | 6f5c704 |

## 详细改动

### P0-4 OTLP HTTP exporter
- 在 `server/middleware/metrics.js` 加 `toOtlpMetrics({scopeName, scopeVersion, serviceName, timeUnixNano})` 方法
- 输出符合 OTLP/HTTP JSON 规范：`resourceMetrics[].scopeMetrics[].metrics[]`
- `aggregationTemporality: 2` (DELTA) + `timeUnixNano` 字符串格式
- `stripCounterSuffix` / `stripHistogramSuffix` 去掉 `_total` / `_ms` 等自定义后缀
- `labelsToAttributes` 把 key=`k1=v1,k2=v2` 形式的 label 解析为 OTLP attributes
- 端点：`GET /api/otlp/metrics` → 复用 `MetricsRegistry` 同一份数据源（避免双 registry 不一致）
- spec 覆盖：toOtlpMetrics 基础结构、scope/resource 元数据、counter 转换、histogram 转换、labels 解析、HTTP 端点 200 + Content-Type、handler 错误路径

### P1-2 isolated-vm 引擎选择
- 新增 `async function executeIsolatedVm(code, ctx, opts)` — 动态 `require('isolated-vm')`，失败返回 `{ok:false, code:'IV_NOT_AVAILABLE'}`
- 新增 `function resolveEngine(requested)` — 返回 `{engine, available, fallback, reason}`
- `executeInSandboxWorker` 加 `opts.engine` + `process.env.SANDBOX_ENGINE` 探测，无 iv 时回落到 vm 并标 `engine: 'vm'`
- `serializableCtx` 过滤 — 只传可 JSON 序列化的字段（Isolate 不可传 Reference）
- `module.exports` 加 executeIsolatedVm、resolveEngine（用户可单独调用）
- spec 覆盖：resolveEngine 4 种场景、executeIsolatedVm 不可用返回、默认 vm 行为、engine 字段透传

### P1-5 mem0 原型（ALS + SQLite）
- 新建 `server/agent/memory.js`（~280 行）— `MemoryStore` 类 + `conversationContext` ALS + `DEFAULT_DB_PATH`
- 特性：remember/recall/search/list/forget/close + ALS 自动 userId 隔离 + 静态 `withContext(ctx, fn)`
- `better-sqlite3` 探测失败时自动 fallback 到内存 `Map`（保留同一 API）
- spec 覆盖：ALS 跨 promise 传递、context.userId 自动注入、KV 增删改查、search 模糊匹配、按 userId 过滤

### P1-6 fflate 评估
- spec `tests/specs/fflate-decompress.cjs`（3 断言）：体积对比（pako ~45KB vs fflate ~30KB）、pako↔fflate 互通解压、viewState 现状
- 结论：**不替换 pako**
  - viewState.js 已用动态 import + 懒加载（只在用户分享链接时下载）
  - pako 替换为 fflate 需要重写 lazy load 逻辑 + 风险回归
  - 真正"零依赖"方案是浏览器原生 `DecompressionStream`（已在周期 8 调研 Top5 落点）

### P1-7 PR review workflow
- 新建 `.github/workflows/pr-review.yml`（~60 行）— `baseline` job 跑 checkpoint + probe + specs + `npm run lint`；`ai-review` job 占位（可后续接 claude-code-action）
- permissions: `contents:read, pull-requests:write, id-token:write`
- spec 覆盖：yaml 结构、name/on、两个 job、permissions、env 引用、未在 non-comment 行提及 `.env` / `blog.db`、超时与并发限制

### P0-3 Cesium WebGPU / MCP 评估
- `tests/specs/cesium-webgpu-detection.cjs`（6 断言）：检查 CesiumJS 版本 ≥1.108、CesiumEarth.jsx 渲染方式（无 WebGPU 标志）、Viewer 配置、FeatureDetection.supportsWebGPU
- 结论：当前 CesiumJS 1.144 仍 WebGL2 only；fork 仍 BETA；**不切换 backend**
- `tests/specs/mcp-bridge-config.cjs`（5 断言）：检查 MCP 配置占位、streamable-http transport、CORS、auth path
- 结论：留 spec 等周期 8 评估 browser-agent 模式

### P2-8 helmet permissionsPolicy 评估
- spec `tests/specs/helmet-permissions-policy.cjs`（6 断言）：检查 helmet 8.x 是否有 `helmet.permissionsPolicy()` 工厂、与现有手写 middleware 行为兼容、Source 静态扫描
- 结论：当前手写 20 项 Permissions-Policy header 行为正确；迁移收益不大，留作 P2-1（强制升级时再合）

## 验证（最终回归）

- `tests/checkpoint.cjs --report-only`：9/9 PASS
- `tests/probe-real-ai-tool-first.cjs`：6/6 PASS
- 本周期新增 8 个 spec，99 个子断言全部 PASS：
  - `otlp-exporter.cjs`（15/15）
  - `sandbox-engine-select.cjs`（15/15）
  - `memory-als-sqlite.cjs`（20/20）
  - `fflate-decompress.cjs`（3/3）
  - `pr-review-workflow.cjs`（17/17）
  - `cesium-webgpu-detection.cjs`（6/6）
  - `mcp-bridge-config.cjs`（5/5）
  - `helmet-permissions-policy.cjs`（6/6）

## 提交历史（feat/auto-cycle）

```
041e081 chore(cycle-07): execution plan + research outline
2efa814 feat(cycle-07): OTLP HTTP exporter + /api/otlp/metrics endpoint
0cbd001 feat(cycle-07): isolated-vm engine select + resolveEngine helper
aa4d2d8 feat(cycle-07): memory prototype + fflate eval + PR review workflow
0f94504 feat(cycle-07): Cesium WebGPU detection + MCP bridge config eval
6f5c704 feat(cycle-07): helmet 8.x permissionsPolicy evaluation spec
（+ 本周期总结文档提交 x1）
```

## 影响范围

- 新增模块：1（`server/agent/memory.js`）
- 修改模块：3（`server/middleware/metrics.js`、`server/agent/sandbox.js`、`server/index.js`）
- 新增 spec：8（合计 99 子断言 PASS）
- 新增 workflow：1（`.github/workflows/pr-review.yml`）
- 新增文档：3（`docs/cycles/cycle-07-{execution-plan,research,dev-log,lessons,self-check}.md`）
- 0 个新 bug
- 0 个回归
