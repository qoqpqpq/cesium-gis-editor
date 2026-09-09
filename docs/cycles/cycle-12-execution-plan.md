# Cycle 12 Execution Plan

> 周期 12 计划（2026-09-09）
> 总目标：落地 cycle-11 调研 Top5（P0: 1 + P1: 4 + P1 附加 1）
> 预算：m3 ≤ 150 / M3 ≤ 450 / commits ≤ 12

---

## 总览

| 优先级 | ID | 任务 | 来源 | 子断言目标 |
|---|---|---|---|---|
| P0 | P0-1 | **混合检索升级（向量 + FTS5 + 时间衰减 RRF）** | cycle-11 调研 Top5 #1 | ≥ 35 |
| P1 | P1-1 | **useOptimistic + Guard 联合 hook** | cycle-11 调研 Top5 #2 | ≥ 25 |
| P1 | P1-2 | **SQLite 生产 pragma + 60s passive checkpoint** | cycle-11 调研 Top5 #3 | ≥ 22 |
| P1 | P1-3 | **Worker thread trace carrier 注入** | cycle-11 调研 Top5 #4 | ≥ 18 |
| P1 | P1-4 | **3D Tiles 2.0 vector tiles + Gaussian splat 兼容层** | cycle-11 调研 Top5 #5 | ≥ 25 |
| P2 | P2-1 | **Viewer.jsx 真实改造（marker 添加用 useOptimisticAction）** | cycle-11 反思补足 | ≥ 18 |
| P2 | P2-2 | **真实接入 OTel SDK（仅 dev 环境，OTLP HTTP exporter 注入 traceId）** | cycle-11 反思"打破评估 vs 接入"边界 | ≥ 14 |
| P2 | P2-3 | **SSRF metadata IP cron 同步脚本** | P0 池累积项（同步至 SSRF guard） | ≥ 12 |

合计：2 P0（含强相关 1 个） + 4 P1 + 3 P2，**≥ 169 子断言**

---

## P0 详案

### P0-1：混合检索（向量 + FTS5 + 时间衰减 RRF）

**目标**：在 `server/agent/memory.js` 引入 RRF（Reciprocal Rank Fusion）混合检索通道，把 cycle-11 的 `memoryVectorPrototype` 与现有 FTS5 bm25 融合，加时间衰减因子。

**新增文件**：
- `server/agent/hybridRetrieval.js` — `search(query, opts)` 主入口
- `tests/specs/hybrid-retrieval-rrf.cjs` — 35+ 子断言

**修改文件**：
- `server/agent/memory.js` — 导出 `hybridSearch()`，复用 `ftsSearch()` 与 `vectorSearch()`

**API 草案**：
```js
const { hybridSearch } = require('./hybridRetrieval');
const results = hybridSearch(query, {
  k: 10,
  weights: { vector: 0.6, fts5: 0.3, recency: 0.1 },
  recencyHalfLifeDays: 30,
  minScore: 0.0,
});
// 返回 [{ id, score, source, ts }]
```

**算法**：
- vector score：`cosine` (0..1)
- fts5 score：`bm25` 归一化到 (0..1)
- recency：`exp(-age_days / halfLife)`
- RRF：`score = Σ weight_i / (k0 + rank_i)`，k0=60

**验收**：
- 5 类 query（同义、近义、错拼、新旧、时间敏感）排序正确
- 空 query / 越界 k / 负权重 防御性返回 []
- 1000 文档下 P95 < 30ms

---

## P1 详案

### P1-1：useOptimistic + Guard 联合 hook

**目标**：在 `client/src/hooks/useOptimisticAction.js` 组合 cycle-11 的 `useActionStateGuard` + React 19 `useOptimistic`，提供"点击立即反馈 + 失败自动回滚"。

**新增文件**：
- `client/src/hooks/useOptimisticAction.js`（ESM）
- `tests/specs/react19-use-optimistic-action.cjs` — 25+ 子断言

**API 草案**：
```js
import { useOptimisticAction } from '@/hooks/useOptimisticAction';
const { state, optimisticState, action, isPending } = useOptimisticAction(serverAction, initial, optimisticInit);
```

**验收**：
- 服务端返回成功后 optimisticState 立即消失
- 服务端失败后 optimisticState 自动回滚到上一稳定态
- 重复点击只触发一次 serverAction（去抖 + 互斥）
- React 18 fallback（无 `useOptimistic`）走 guard 路径

### P1-2：SQLite 生产 pragma + 60s passive checkpoint

**目标**：把 cycle-10 的散落 PRAGMA 封装为 `server/agent/sqlitePragmas.js`，加 60s 后台 `wal_checkpoint(PASSIVE)`。

**新增文件**：
- `server/agent/sqlitePragmas.js`
- `tests/specs/sqlite-production-pragmas.cjs` — 22+ 子断言

**修改文件**：
- `server/agent/memory.js` — 调用 `applyProductionPragmas(db)` + 启动 `startPassiveCheckpointLoop(db)`

**API 草案**：
```js
const { applyProductionPragmas, startPassiveCheckpointLoop } = require('./sqlitePragmas');
applyProductionPragmas(db); // WAL + synchronous=NORMAL + mmap + busy_timeout + foreign_keys + journal_size_limit
const stop = startPassiveCheckpointLoop(db, { intervalMs: 60000 });
// stop() 停止后台 loop
```

**验收**：
- 6 个 PRAGMA 全部应用并断言生效
- 后台 loop 60s ± 5s 触发
- process.exit 前 stop() 被调用（无 dangling interval）

### P1-3：Worker thread trace carrier 注入

**目标**：扩展 `server/middleware/logger.js` 让 sandbox worker 跨线程保留 trace context。

**修改文件**：
- `server/middleware/logger.js` — 加 `attachTraceToWorkerData(req, workerData)` 与 `restoreTraceFromWorker(workerData, callback)`
- `server/agent/sandboxWorkerPool.js` — 在 spawn worker 时 attach trace，在 worker `onMessage` 时 restore

**新增文件**：
- `tests/specs/worker-trace-carrier.cjs` — 18+ 子断言

**API 草案**：
```js
// 主线程
const carrier = { 'traceparent': req.traceparent, 'x-request-id': req.requestId };
const workerData = { ...payload, _trace: carrier };
new Worker(script, { workerData });

// worker 内部
const ctx = restoreTraceFromWorker(workerData._trace);
withTraceContext(ctx, () => doWork());
```

**验收**：
- 主→worker carrier round-trip 不丢失字段
- traceparent 解析失败时 graceful fallback（不抛错）
- 多 worker 并发时 trace 独立不串扰

### P1-4：3D Tiles 2.0 vector tiles + Gaussian splat 兼容层

**目标**：在 `client/src/utils/tilesetLoader.js` 加 `extensionsUsed` 检测，自动启用 vector tiles / Gaussian splat 渲染分支。

**新增文件**：
- `client/src/utils/tilesetLoader.js`（new）
- `tests/specs/3d-tiles-2-loader.cjs` — 25+ 子断言

**API 草案**：
```js
import { classifyTileset, chooseRenderMode } from '@/utils/tilesetLoader';
const cls = classifyTileset(tilesetJson);
// { is3dTiles: true, hasVectorTiles: bool, hasGaussianSplat: bool, hasVoxel: bool, gltfVersion: '2.0'|'2.1' }
const mode = chooseRenderMode(cls);
// 'legacy' | 'vector-tiles' | 'gaussian-splat' | 'hybrid'
```

**验收**：
- 5 种典型 tileset.json 正确分类
- 缺失字段 graceful fallback 到 'legacy'
- glTF 2.1 优先于 2.0
- 同时含 vector + Gaussian 时返回 'hybrid'

---

## P2 详案

### P2-1：Viewer.jsx 真实改造（marker 添加用 useOptimisticAction）

**目标**：把 P1-1 的 hook 真实接入 Viewer 组件——点击"添加 marker"立即看到 marker，server返回后保留或回滚。

**修改文件**：
- `client/src/pages/gis/Viewer.jsx`（或等价 viewer 容器）
- 替换一处 `useState + onClick + setLoading + try/catch`

**新增文件**：
- `tests/specs/viewer-marker-optimistic.cjs` — 18+ 子断言（mock fetch）

**验收**：
- 4 种状态正确切换（idle / optimistic / confirmed / rolled-back）
- 失败时旧 marker 自动消失

### P2-2：真实接入 OTel SDK（dev 环境）

**目标**：打破"评估 vs 接入"边界——在 NODE_ENV=development 时挂 `@opentelemetry/sdk-node` ConsoleSpanExporter，验证现有 W3C traceparent 与 OTel context 双向兼容。

**新增文件**：
- `server/agent/otelDevHook.js`（new）
- `tests/specs/otel-dev-hook.cjs` — 14+ 子断言

**修改文件**：
- `server/index.js` — 在 `NODE_ENV !== 'production'` 时 `require('./agent/otelDevHook').install()`

**验收**：
- dev 启动时 OTel SDK 成功 initialize
- 现有 ALS store 与 OTel context 互不破坏（顺序执行均正常）
- 卸载 hook（mock uninstall）后 OTel SDK 干净退出

### P2-3：SSRF metadata IP cron 同步脚本

**目标**：写 `scripts/sync-metadata-ips.cjs`，从 cloud metadata service 拉取最新 IP 段，落 `docs/security/metadata-ips.md`。

**新增文件**：
- `scripts/sync-metadata-ips.cjs`
- `tests/specs/metadata-ip-sync.cjs` — 12+ 子断言

**验收**：
- 同步脚本可 dry-run
- 写入格式兼容 SSRF guard 解析（IPv4 + CIDR）
- 现有 SSRF guard 测试仍 PASS（无回归）

---

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| `@opentelemetry/api` 是新依赖 | cycle-12 用动态 `try/require`，失败时降级无 OTel 模式 |
| useOptimistic React 18 fallback 复杂 | 检测 `React.useOptimistic` 存在与否，缺失时走 guard 简化路径 |
| SQLite pragma 应用失败 | graceful fallback：WAL 失败不抛错，仅记录 stderr |
| Viewer.jsx 改动可能破坏现有功能 | 先复制 Viewer 一处点击 handler 改造，跑 checkpoint + probe 后再合并 |

---

## 子断言预算

| 项 | 目标 | 累计 |
|---|---|---|
| P0-1 hybrid retrieval | 35 | 35 |
| P1-1 useOptimistic + Guard | 25 | 60 |
| P1-2 sqlite pragma | 22 | 82 |
| P1-3 worker trace carrier | 18 | 100 |
| P1-4 tileset loader | 25 | 125 |
| P2-1 viewer optimistic | 18 | 143 |
| P2-2 otel dev hook | 14 | 157 |
| P2-3 metadata-ip-sync | 12 | **169** |
| **合计** | **≥ 169** | |

远超 m3 = 150 预算上限。

---

## Commit 计划

预计 10 个 commit（与 cycle-11 一致粒度）：
1. `feat(cycle-12): p0-1 hybrid retrieval RRF (vector + FTS5 + recency)`
2. `feat(cycle-12): p1-1 useOptimistic + Guard combined hook`
3. `feat(cycle-12): p1-2 sqlite production pragmas + passive checkpoint`
4. `feat(cycle-12): p1-3 worker thread trace carrier injection`
5. `feat(cycle-12): p1-4 3D Tiles 2.0 loader compatibility`
6. `feat(cycle-12): p2-1 viewer.jsx optimistic marker action`
7. `feat(cycle-12): p2-2 otel dev hook (NODE_ENV !== production)`
8. `feat(cycle-12): p2-3 metadata IP sync script`
9. `chore(cycle-12): update upcoming-work + cycle-state for cycle 12`
11. `docs(cycle-12): plan + test-report + dev-log + research + lessons + self-check`