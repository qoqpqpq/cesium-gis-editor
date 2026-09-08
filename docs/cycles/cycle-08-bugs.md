# Cycle 08 — Bugs（Bug 报告）

> **周期**: N=8（2026-09-08）
> **结论**: 本周期发现 **1 个严重 bug**（周期 7 引入，周期 8 启动时立刻发现并修复）

## C8-B01 严重：metricsOtlpHandler 在 server/index.js 中未导入（**周期 7 隐藏 bug**）

| 字段 | 值 |
| ---- | ---- |
| **严重度** | 严重（P0） |
| **来源** | 周期 7 commit `6f5c704 feat(cycle-07): OTLP HTTP exporter + /api/otlp/metrics endpoint` |
| **类型** | ReferenceError / 启动崩溃 |
| **影响范围** | 后端无法启动；周期 7 之后所有 server 操作失败 |
| **检测时机** | 周期 8 测试阶段，`Start-Process node server/index.js` 后立即触发 |

### 现象

启动 server：

```
$ node server/index.js
E:\project\cesium-gis-editor\server\index.js:181
app.get("/api/otlp/metrics", metricsOtlpHandler);
                             ^
ReferenceError: metricsOtlpHandler is not defined
    at Object.<anonymous> (E:\project\cesium-gis-editor\server\index.js:181:30)
    ...
Node.js v24.18.0
```

### 根因

周期 7 commit 6f5c704 新增 `/api/otlp/metrics` 路由时，在 `server/index.js:181` 注册了 handler，但 `server/index.js:23` 的 destructure 漏写 `metricsOtlpHandler`：

```js
// 修复前（server/index.js:23）
const { httpMetricsMiddleware, metricsHandler, processMetricsCollector } = require("./middleware/metrics");

// 修复后
const { httpMetricsMiddleware, metricsHandler, metricsOtlpHandler, processMetricsCollector } = require("./middleware/metrics");
```

### 为何周期 7 漏检

1. **自检只跑 unit spec，未跑 server 启动验证**：`tests/specs/otlp-exporter.cjs` 用 `require('../../server/middleware/metrics')` 单独验证模块，未触达 `server/index.js` 的导入路径
2. **周期 7 self-check 9 评分项未含"server 真能启动"**：
   - 现有 checklist: 8 个评分项，但都是 commit 数 / spec 通过率 / 文档完整
   - 没有"启动 server → curl /api/otlp/metrics → 200" 这一硬关
3. **周期 7 lessons 已提到 6 个错误模式**，但未把"模块导入完整性"加入复用清单

### 修复

✅ 本周期已修复 `server/index.js:23` 的 destructure

### 验证

- 重启 server：`[server] listening on http://localhost:3001  (env=production)` ✅
- `tests/checkpoint.cjs --report-only`：9/9 ✅
- `tests/specs/otlp-exporter.cjs`：16/16（含端到端 `/api/otlp/metrics` 200）✅

### 改进（落周期 9+）

1. **加 `tests/specs/server-import-completeness.cjs` 静态扫描所有 `app.use / app.get / app.post` 中的 handler 都在 destructure 中存在**
2. **周期主调度增加"启动 server → 跑 checkpoint → 跑关键 spec"硬关**
3. **PR review workflow baseline job 加入 `node tests/checkpoint.cjs --strict` 校验**

### 落点

- 已修复并在本周期 commit "fix(cycle-08): import metricsOtlpHandler" 中 push
- 周期 9+ P2 增加 server-import-completeness spec
