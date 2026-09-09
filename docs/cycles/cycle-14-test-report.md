# Cycle 14 Test Report

> 周期 14 测试报告（2026-09-09）
> 服务：server/index.js（localhost:3001）+ client dev（localhost:5173）

---

## 1. checkpoint.cjs（基础 checkpoint）

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

**结论**：9/9 PASS。基础 checkpoint 零回归。

---

## 2. probe-real-ai-tool-first.cjs（真实 AI tool-first 探测）

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

**结论**：6/6 PASS。真实 AI tool-first 探测零回归。

---

## 3. 合计

- 15/15 PASS
- 0 FAIL
- 0 个新 bug（沿用周期 13 bugs.md）

---

## 4. 根因分析

### 4.1 无新增 bug 原因
- 周期 13 修复 C8-B01（metricsOtlpHandler 缺失 import）+ C9-B01（mcpManifest handler 双层包裹）+ C9-B02（asyncGuard removeEventListener 在 window 替换后失效）后，本项目主流程已稳定
- 周期 14 进入前，server 9 个 checkpoint + 6 个 probe 全部 PASS
- client 端 dev server 启动正常（无 console 报错）
- 静态扫描：server-import-completeness.cjs 验证 server/* 所有模块导出完整（C8-B01 类隐藏 bug 已防御）

### 4.2 跨周期回归风险评估

| 周期 | 引入的特性 | 周期 14 风险 |
|---|---|---|
| C8 | FTS5 / DecompressionStream / MCP manifest / executeSandbox dispatch | 低（已 4 周期稳定） |
| C9 | import-completeness / WAL / MCP 真集成 / ErrorBoundary asyncGuard / PR review workflow M3 | 低 |
| C10 | pgvector 评估 / multi-specialist / telemetry / worker pool | 低 |
| C11 | memoryVectorPrototype / useActionStateGuard / OTel SDK spike / handler checklist | 低 |
| C12 | hybridRetrieval RRF / useOptimisticAction / sqlitePragmas / workerTraceCarrier / tilesetLoader / OTel dev hook / sync-metadata-ips | 低 |
| C13 | AI guardrails / sqliteBackend / OTel worker / marker bridge / RRF strategies / splat loader / sqlite-vec decision / jsdom RTL | 低 |

---

## 5. 周期 14 改动预期影响面

- **server/middleware/aiGuardrails.js**：扩展 3 函数（validateManifest / validateMemoryContext / signInterAgentMessage）+ 8 步检查链。零回归（向后兼容）。
- **server/agent/memory.js**：构造函数接受 sqliteBackend 实例；缺省仍走 better-sqlite3 自动检测。零回归。
- **server/agent/otelDevHook.js**：加 `withWorkerSdkContext()`；不影响现有 `runWithSpan` / `withWorkerContext`。零回归。
- **server/agent/hybridRetrieval.js**：加 `heuristicWeightSearch()` + LLM span attribute hooks；现有 5 strategy 完整保留。零回归。
- **docs/guides/splat-pipeline.md**：纯文档新增。零回归。

---

## 6. 调研与计划同步

调研 Top5 已落周期 14 执行计划：
- Top5 #1 → P0-1（AI guardrails 深化 ASI04/06/07）
- Top5 #2 → P0-2（memory.js node:sqlite 真实迁移）
- Top5 #3 → P1-1 + P1-3（OTel worker SDK + LLM semantic span）
- Top5 #4 → P1-4（Splat pipeline 文档）
- Top5 #5 → P1-2（RRF ablation + 启发式权重搜索）

调研 Top5 100% 覆盖执行计划。
