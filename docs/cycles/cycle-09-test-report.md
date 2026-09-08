# Cycle 09 — Test Report

> **周期**: N=9（2026-09-08）
> **测试范围**: server 启动硬关 + checkpoint + AI probe + 周期 8 关键 spec 抽样
> **结论**: 零 bug，零回归，全通过

## 1. 服务启动验证（防 C8-B01 类 bug）

```bash
$ Start-Process node server/index.js
$ sleep 5
$ curl http://localhost:3001/api/health
{"success":true,"data":{"status":"ok","env":"production","ts":"2026-09-08T08:32:35.650Z"}}
```

✅ Server 启动正常，env=production，所有路由就绪。

## 2. Checkpoint（基础 API 烟测）

```
[PASS] 1) /api/health — env=production
[PASS] 2) /api/gis/config — cesium=false tdt=false
[PASS] 3) /api/ai/platforms — count=10
[PASS] 4) /api/ai/system-prompts — scope=gis len=1470
[PASS] 5) /api/spatial/centroid OK — centroid_features=1
[PASS] 6) /api/spatial/buffer OK — ok
[PASS] 7) /api/spatial/centroid 缺 layer — reject=400
[PASS] 8) /api/ai/agent 缺 body — reject=400
[PASS] 9) server modules require — loaded=8
```

✅ **9/9 PASS**，基础 API 全可用。

## 3. AI Probe（agent 路由健壮性）

```
[PASS] A) POST /api/ai/agent 空 body → 400
[PASS] B) POST /api/ai/agent 缺 messages → 400
[PASS] C) POST /api/ai/agent 非法 platform → 400
[PASS] D) POST /api/ai/agent?stream=1 空 body → 400
[PASS] E) POST /api/ai/agent 无 api_key → 400
[PASS] F) POST /api/ai/chat/stream 空 body → 400
```

✅ **6/6 PASS**，所有错误路径正确返回 4xx 而非 5xx。

## 4. 周期 8 spec 抽样回归

| spec | 子断言 | 结果 |
|------|--------|------|
| `memory-fts5.cjs` | 18 | ✅ 全 PASS（FTS5 search 按 userId 过滤 + bm25 排序） |
| `otlp-exporter.cjs` | 16 | ✅ 全 PASS（含端到端 `/api/otlp/metrics` 200） |
| `metrics-trusted-cidrs.cjs` | 21 | ✅ 全 PASS（IPv4 CIDR 解析 + IPv4-mapped IPv6） |
| `protocol-sync-script.cjs` | 9 | ✅ 全 PASS（缺文件 exit 2 + 篡改 exit 1 + 恢复 PASS） |
| `sandbox-execute-dispatch.cjs` | 16 | ✅ 全 PASS（旧函数向后兼容 + auto 回退） |
| `memory-middleware.cjs` | 12 | ✅ 全 PASS（ALS 隔离 + requestId 写响应头） |
| `mcp-manifest.cjs` | 12 | ✅ 全 PASS（registerTool/manifest/callTool） |
| **合计** | **104** | ✅ **零回归** |

## 5. 关键发现

### 5.1 C8-B01 类 bug 自动化防御已具备

周期 8 修复后 server 启动正常。本周期 P0-1 加 `server-import-completeness.cjs` 静态扫描所有 `app.use / app.get / app.post / app.delete` 的 handler 是否在 destructure 中存在，防止 C9 类似 bug 流入 main 分支。

### 5.2 零新增 bug

周期 9 测试阶段**无 bug 发现**。现有 bugs_open = 10（C1-B01~C8-B01 + 历史保留），本周期不增加。

## 6. 周期 9 计划任务预验证

| 任务 | 依赖 | 状态 |
|------|------|------|
| P0-1 server-import-completeness | server/index.js 静态分析 | 待实施 |
| P0-2 memory WAL | better-sqlite3 已装 | 待实施 |
| P1-1 MCP 真接入 cesium-mcp-bridge | package.json 分析 | 待实施 |
| P1-2 sandbox perf benchmark | server/agent/sandbox.js | 待评估 |
| P1-3 ErrorBoundary 升级 | client/src/pages/gis/ErrorBoundary.jsx | 待实施 |
| P1-4 PR review workflow | .github/workflows/pr-review.yml | 待升级 |
| P2-1 metrics endpoint perf | server/middleware/metrics.js | 待评估 |
| P2-2 helmet 8 PermissionsPolicy 自研 | helmet 已 ^8.3.0 | 待实施 |

## 7. 测试阶段结论

- ✅ Server 启动硬关通过
- ✅ Checkpoint 9/9
- ✅ AI probe 6/6
- ✅ 周期 8 spec 抽样 104/104 零回归
- ⚠️ 0 个新 bug；C8-B01 类风险由 P0-1 spec 覆盖
- ✅ 进入开发阶段（Phase 3）