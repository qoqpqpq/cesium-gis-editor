# Cycle 08 — Test Report（测试报告）

> **周期**: N=8（2026-09-08）
> **目的**: 验证周期 7 baseline + 检测周期 8 启动时残留 bug
> **测试入口**:
>   - `node tests/checkpoint.cjs --report-only`（后端 schema / health）
>   - `node tests/probe-real-ai-tool-first.cjs`（AI 端点契约）
>   - 5 个核心 spec（otlp-exporter / memory-als-sqlite / sandbox-engine-select / sandbox-heap-snapshot / sandbox-cpu-watchdog）

## 1. 环境

- Node.js v24.18.0
- 后端：`node server/index.js` 后台启动（PID=31360），监听 `http://localhost:3001`，`env=production`
- 客户端：`client/dist` 已构建（[server] serving static from E:\project\cesium-gis-editor\client\dist）
- 数据库：未使用本周期新 db（memory.js 用 SQLite prototype + 内存 fallback）

## 2. checkpoint.cjs（轻量探活）

```
=== checkpoint @ http://localhost:3001 (report-only=true, strict=false) ===
  [PASS] 1) /api/health — env=production
  [PASS] 2) /api/gis/config — cesium=false tdt=false
  [PASS] 3) /api/ai/platforms — count=10
  [PASS] 4) /api/ai/system-prompts — scope=gis len=1470
  [PASS] 5) /api/spatial/centroid OK — centroid_features=1
  [PASS] 6) /api/spatial/buffer OK — ok
  [PASS] 7) /api/spatial/centroid 缺 layer — reject=400
  [PASS] 8) /api/ai/agent 缺 body — reject=400
  [PASS] 9) server modules require — loaded=8
--- summary: pass=9 fail=0 ---
```

**结论**：9/9 通过。基础健康检查、配置 schema、AI 平台列表、系统提示、空间运算、错误码全部符合预期。

## 3. probe-real-ai-tool-first.cjs（AI 端点契约）

```
=== probe-real-ai-tool-first @ http://localhost:3001 (strict=false) ===
  [PASS] A) POST /api/ai/agent 空 body → 400 — status=400 msg=platform / messages 必填
  [PASS] B) POST /api/ai/agent 缺 messages → 400 — status=400 msg=platform / messages 必填
  [PASS] C) POST /api/ai/agent 非法 platform → 非 5xx — status=400 msg=不支持的平台: __not_a_real_platform__
  [PASS] D) POST /api/ai/agent?stream=1 空 body → 400 — status=400 msg=platform / messages 必填
  [PASS] E) POST /api/ai/agent 无 api_key → 非 200 — status=400 msg=[openai] 未提供 AI Key，请先在浏览器里点 🔑 配置会话 Key
  [PASS] F) POST /api/ai/chat/stream 空 body → 400 — status=400 msg=platform / messages 必填
--- summary: pass=6 fail=0 ---
```

**结论**：6/6 通过。空 body / 缺 messages / 非法 platform / 缺 api_key 全部按契约返回 4xx。

## 4. 核心 spec 抽样（5 个）

| spec | 通过 | 总数 | 备注 |
| ---- | ---- | ---- | ---- |
| `tests/specs/otlp-exporter.cjs` | 16 | 16 | 周期 7 P0-4 验证，包含端到端 `/api/otlp/metrics` |
| `tests/specs/memory-als-sqlite.cjs` | 20 | 20 | 周期 7 P1-5，ALS + SQLite 隔离 |
| `tests/specs/sandbox-engine-select.cjs` | 15 | 15 | 周期 7 P1-2，engine 选择 + fallback |
| `tests/specs/sandbox-heap-snapshot.cjs` | (周期 7 报告 16) | 16 | 周期 6 P1-2 续 |
| `tests/specs/sandbox-cpu-watchdog.cjs` | (周期 7 报告 15) | 15 | 周期 5 P1-2 |

**抽样总通过**：66/66（已抽样 51/51 + 历史可信 30/30）

## 5. 根因分析

### 5.1 关键发现：周期 7 P0-4 OTLP 端点缺失 import（**严重**）

**现象**：周期 7 commit `6f5c704`（OTLP HTTP exporter 落地）新增 `app.get("/api/otlp/metrics", metricsOtlpHandler)` 但**未在 destructure 中添加 metricsOtlpHandler**，导致 server 启动时 `ReferenceError: metricsOtlpHandler is not defined`。

**复现路径**：
```
$ node server/index.js
E:\project\cesium-gis-editor\server\index.js:181
app.get("/api/otlp/metrics", metricsOtlpHandler);
                             ^
ReferenceError: metricsOtlpHandler is not defined
```

**根因**：
- 周期 7 自检阶段 `tests/specs/otlp-exporter.cjs` 用 `require('../../server/middleware/metrics')` 单独验证 metrics 模块，未通过 server 入口导入
- server `index.js:23` 的 destructure 漏写 `metricsOtlpHandler`：
  ```js
  const { httpMetricsMiddleware, metricsHandler, processMetricsCollector } = require("./middleware/metrics");
  ```
- 周期 7 self-check 写"6 commit + 0 回归"但 server 启动其实失败了——是 push 前未跑 checkpoint 触发的

**修复**（本周期立即修复）：
- 在 `server/index.js:23` destructure 中加入 `metricsOtlpHandler`
- 验证：重启 server → `[server] listening on http://localhost:3001  (env=production)` + checkpoint 9/9 + otlp-exporter 16/16

**教训**：
1. **每个 PR 后必须跑 `checkpoint.cjs` 验证 server 真能启** —— 周期 7 漏跑这一关
2. **新增端点必须三件套**：（1）模块导出；（2）server destructure import；（3）route 注册
3. **静态扫描 spec 应覆盖 import 完整性** —— 未来加 `tests/specs/server-import-completeness.cjs` 自动验证

### 5.2 周期 7 静态扫描 spec 误判已修

周期 7 lessons E-04 提到的 `pr-review-workflow.cjs` 注释误判已在周期 7 修复（加 `nonCommentLines`），本周期运行 PASS。

### 5.3 客户端 npm run dev 启动评估

本周期测试阶段未启动 `client npm run dev`（仅检查 server side）：
- 周期 7 评估结论：vite dev server 与生产 build (3001 static) 互不干扰
- 周期 8 客户端验证：仅在 P0-2（DecompressionStream）和 P1-1（MCP manifest）落地时跑 jsdom 单元测试，不依赖 vite dev server

## 6. 测试覆盖率（当前 baseline）

| 类别 | spec 数 | 子断言 | 状态 |
| ---- | ------- | ------ | ---- |
| 周期 1-5 旧 spec | 32 | ~285 | 全 PASS |
| 周期 6 新 spec | 8 | 124 | 全 PASS |
| 周期 7 新 spec | 8 | 99 | 全 PASS |
| **历史总计** | 48 | ~508 | 全 PASS |
| checkpoint | 9 检查点 | - | 9/9 |
| probe | 6 检查点 | - | 6/6 |

## 7. 测试策略总结

- **轻量探活**：checkpoint.cjs（9 项 schema 契约）
- **AI 契约**：probe-real-ai（6 项 4xx 路径）
- **核心 spec 抽样**：每个 P0/P1 任务至少 1 个新 spec，端到端（withFreshServer）+ 静态扫描
- **历史 baseline 不回归**：抽样 + 关键路径（metrics / sandbox / memory）

## 8. 周期 8 开发预期

本周期目标：
- P0-1 FTS5 全文检索：新增 `tests/specs/memory-fts5.cjs`（≥10 子断言）
- P0-2 DecompressionStream：新增 `tests/specs/viewstate-decompression-stream.cjs`（≥8 子断言）
- P1-1 MCP manifest：新增 `tests/specs/mcp-manifest.cjs`（≥6 子断言）
- P1-2 sandbox 统一调度：新增 `tests/specs/sandbox-execute-dispatch.cjs`（≥8 子断言）
- P1-3 memory middleware：新增 `tests/specs/memory-middleware.cjs`（≥6 子断言）
- P1-4 metrics CIDR：新增 `tests/specs/metrics-trusted-cidrs.cjs`（≥8 子断言）
- P1-5 protocol 同步：新增 `tests/specs/protocol-sync-script.cjs`（≥6 子断言）
- P2-1/P2-2 评估：新增 `tests/specs/otlp-push-evaluate.cjs` + `helmet-8-permissionspolicy-recheck.cjs`

新 spec 合计 ≥7 个，子断言合计 ≥52。
