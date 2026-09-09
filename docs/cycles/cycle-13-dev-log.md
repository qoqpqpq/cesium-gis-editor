# Cycle 13 Dev Log

> 周期 13 开发日志（2026-09-09）
> 共交付 8 项：P0 ×2 + P1 ×4 + P2 ×3
> 所有子断言（sub-assertion）全部 PASS，零回归。

---

## 1. P0-1：AI Agent 安全护栏（OWASP ASI01-10 映射）

**文件**：
- [aiGuardrails.js](file:///E:/project/cesium-gis-editor/server/middleware/aiGuardrails.js)
- [ai-guardrails.cjs](file:///E:/project/cesium-gis-editor/tests/specs/ai-guardrails.cjs)（**39 PASS**）

**亮点**：
- `withGuardrail(toolFn, opts)`：5 步检查链（tool allowlist → dangerous HITL → circuit breaker → input sanitization → execute）
- `sanitizeInput(payload)`：剥控制字符 + 长度限制 + 9 种注入模式检测
- `createCircuitBreaker(opts)`：窗口 + threshold + cooldownMs
- `INJECTION_PATTERNS`：direct / role-play / jailbreak / developer mode / 命令注入 等

**ASI 映射（10 项）**：
- ASI01 goal hijack → sanitizeInput
- ASI02 tool misuse → checkToolAllowlist
- ASI03 privilege abuse → dangerousActionsRequireHITL
- ASI04 supply chain → 未来 cycle（registry 校验）
- ASI05 RCE → dangerousActionsRequireHITL
- ASI06 memory poisoning → 未来 cycle（context validation）
- ASI07 inter-agent comm → 未来 cycle（signing）
- ASI08 cascading failure → createCircuitBreaker
- ASI09 human-agent trust → HITL approve path
- ASI10 rogue agents → dangerousActionsRequireHITL + circuit breaker

**commit**：`feat(cycle-13): p0-1 AI agent guardrails (OWASP ASI01-10)`

---

## 2. P0-2：node:sqlite 三向 dispatch

**文件**：
- [sqliteBackend.js](file:///E:/project/cesium-gis-editor/server/agent/sqliteBackend.js)
- [sqlite-backend-dispatch.cjs](file:///E:/project/cesium-gis-editor/tests/specs/sqlite-backend-dispatch.cjs)（**19 PASS**）

**亮点**：
- `_detectRuntime()`：按 bun → node 24+ → better-sqlite3 → memory 顺序检测
- `openDatabase({ path, driver })`：返回统一抽象 { prepare, exec, pragma, close }
- 缺包 graceful fallback 到 memory backend（never throw）
- 真实 Node 24+ `node:sqlite` 直接 require 成功

**commit**：`feat(cycle-13): p0-2 sqlite backend dispatch (node:sqlite / better-sqlite3 / bun:sqlite)`

---

## 3. P1-1：OTel worker 集成 + SQLite pragma 升级

**修改文件**：
- [otelDevHook.js](file:///E:/project/cesium-gis-editor/server/agent/otelDevHook.js)：加 `withWorkerContext(carrier, fn)` + `getCurrentTraceparent()`
- [sqlitePragmas.js](file:///E:/project/cesium-gis-editor/server/agent/sqlitePragmas.js)：加 `mode: 'PASSIVE' | 'TRUNCATE'` + `checkSqliteVersion(driver)`

**新增文件**：
- [otel-worker-integration.cjs](file:///E:/project/cesium-gis-editor/tests/specs/otel-worker-integration.cjs)（**15 PASS**）

**亮点**：
- `withWorkerContext` 自动从 `00-traceId-spanId-flags` 解析 traceId
- 真实 worker_threads round-trip 验证（spec B6）
- `checkSqliteVersion` 检测 ≥ 3.51.3（Tailscale WAL-Reset bug fix）
- TRUNCATE checkpoint 用于 30min 后台合并（cycle-12 Top5 #2）

**commit**：`feat(cycle-13): p1-1 otel worker integration + sqlite pragma upgrade`

---

## 4. P1-2：Viewer marker 真实接入

**新增文件**：
- [useOptimisticMarkerBridge.js](file:///E:/project/cesium-gis-editor/client/src/hooks/useOptimisticMarkerBridge.js)
- [viewer-marker-integration.cjs](file:///E:/project/cesium-gis-editor/tests/specs/viewer-marker-integration.cjs)（**21 PASS**）

**亮点**：
- 包装 useOptimisticMarker + viewer ref 集成
- `addMarker` 内部立即调 `viewerRef.current.addMarker(lat, lon, label, color)`
- server 失败 → `viewerRef.current.removeMarker(viewerEntity)` 回滚
- `onOptimisticCreate` 回调（entity 创建后）
- `_optimisticId` 关联 server response

**补足 cycle-12 L12-8 反思**：客户端真实接入不再是 hook 单独存在。

**commit**：`feat(cycle-13): p1-2 viewer marker optimistic integration (useOptimisticMarkerBridge)`

---

## 5. P1-3：混合检索 RRF 多样化

**修改文件**：
- [hybridRetrieval.js](file:///E:/project/cesium-gis-editor/server/agent/hybridRetrieval.js)：加 `strategy: 'standard' | 'best-rank' | 'max+bonus' | 'diminishing' | 'soft-dedup'`

**新增文件**：
- [hybrid-retrieval-strategies.cjs](file:///E:/project/cesium-gis-editor/tests/specs/hybrid-retrieval-strategies.cjs)（**18 PASS**）

**亮点**：
- 5 种 RRF 变体（参考 juchengquan/RRF Python 库）
- 可配置 alpha / lambda / beta 参数
- 未知 strategy 走 standard（向后兼容）
- cycle-12 hybrid-retrieval-rrf.cjs 零回归（37 PASS）

**commit**：`feat(cycle-13): p1-3 hybrid retrieval RRF strategies`

---

## 6. P2-1：CesiumJS Gaussian splat demo

**新增文件**：
- [splatLoader.js](file:///E:/project/cesium-gis-editor/client/src/utils/splatLoader.js)
- [cesium-splat-demo.cjs](file:///E:/project/cesium-gis-editor/tests/specs/cesium-splat-demo.cjs)（**25 PASS**）

**亮点**：
- `classifySplatQuality(sse)`：5 档（realtime / balanced / quality / high / ultra）
- `loadGaussianSplatTileset(viewer, assetId, opts)`：stub 实现（Cesium ion 4547222 Microsoft Redmond Campus）
- `getRecommendedPreset(fps)`：closest fps 算法
- `getSplatLODConfig(viewer)`：viewer 集成 API

**未做**：未实际升级 client/package.json cesium 至 1.141+（避免 native 依赖重装）；下周期评估。

**commit**：`feat(cycle-13): p2-1 cesiumjs gaussian splat loader`

---

## 7. P2-2：sqlite-vec 决策文档

**新增文件**：
- [vector-extension-decision.md](file:///E:/project/cesium-gis-editor/docs/evaluation/vector-extension-decision.md)
- [sqlite-vec-decision.cjs](file:///E:/project/cesium-gis-editor/tests/specs/sqlite-vec-decision.cjs)（**14 PASS**）

**亮点**：
- 5 候选对比表（brute-force / sqlite-vec / Vec1 / vectorlite / libSQL）
- 7 维度决策矩阵
- 推荐路径：现状 → 3-6 月评估 sqlite-vec → 6-12 月迁移
- 触发条件：50K 向量 / P95 > 100ms / 内存 > 1GB / metadata 过滤 KNN

**commit**：`docs(cycle-13): sqlite-vec evaluation decision document`

---

## 8. P2-3：jsdom + RTL 集成测试脚手架

**新增文件**：
- [useOptimisticMarker.test-instructions.js](file:///E:/project/cesium-gis-editor/client/src/hooks/useOptimisticMarker.test-instructions.js)
- [jsdom-rtl-instructions.cjs](file:///E:/project/cesium-gis-editor/tests/specs/jsdom-rtl-instructions.cjs)（**20 PASS**）

**决策**：不立即引入 jsdom + RTL（避免 client/package.json 重装 native 依赖）；
提供完整脚手架 + INSTALL_INSTRUCTIONS + 示例测试，开发者本地安装后即用。

**commit**：`docs(cycle-13): p2-3 jsdom + RTL test scaffold (not installed)`

---

## 总体统计

| 项 | 子断言 PASS | 文件数 |
|---|---|---|
| P0-1 AI guardrails | 39 | 2 |
| P0-2 sqlite backend | 19 | 2 |
| P1-1 OTel worker + pragma upgrade | 15 | 1（+ 修改 2 文件） |
| P1-2 viewer marker bridge | 21 | 2 |
| P1-3 RRF strategies | 18 | 1（+ 修改 1 文件） |
| P2-1 splat loader | 25 | 2 |
| P2-2 sqlite-vec decision | 14 | 2 |
| P2-3 jsdom scaffold | 20 | 2 |
| **合计** | **171** | **15** |

零回归（checkpoint 9/9 + probe 6/6 + 26 老 spec 全部 PASS）。