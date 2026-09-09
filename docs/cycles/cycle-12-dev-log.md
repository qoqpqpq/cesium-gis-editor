# Cycle 12 Dev Log

> 周期 12 开发日志（2026-09-09）
> 共交付 8 项：P0 ×1 + P1 ×4 + P2 ×3
> 所有子断言（sub-assertion）全部 PASS，零回归。

---

## 1. P0-1：混合检索升级（向量 + FTS5 + 时间衰减 RRF）

**文件**：
- [hybridRetrieval.js](file:///E:/project/cesium-gis-editor/server/agent/hybridRetrieval.js)
- [hybrid-retrieval-rrf.cjs](file:///E:/project/cesium-gis-editor/tests/specs/hybrid-retrieval-rrf.cjs)（**37 PASS**）

**决策**：落地 Lyzr Cognis 92.4% on LongMemEval 与 2026 共识"向量 + 图 + BM25 + 时间加权"四融合中的前三。

**亮点**：
- `createHybridRetriever(store, vectorMem)`：懒构建向量索引；store 中已有的 FTS5 + VectorMemory 提供两通道
- `search(query, opts)`：默认 weights `{ vector:0.6, fts5:0.3, recency:0.1 }`，RRF k0=60
- 时间衰减：`exp(-age_days / halfLife)`，默认 halfLifeDays=30
- 输入校验 9 项（空 query、负权重、k<=0、非数字、minScore<0、req 缺失等）—全部返回 `[]`
- 1000 文档 P95 < 30ms

**commit**：`feat(cycle-12): p0-1 hybrid retrieval RRF (vector + FTS5 + recency)`

---

## 2. P1-1：useOptimistic + Guard 联合 hook

**文件**：
- [useOptimisticAction.js](file:///E:/project/cesium-gis-editor/client/src/hooks/useOptimisticAction.js)
- [react19-use-optimistic-action.cjs](file:///E:/project/cesium-gis-editor/tests/specs/react19-use-optimistic-action.cjs)（**28 PASS**）

**决策**：在 cycle-11 的 `useActionStateGuard` 之上叠加 React 19 `useOptimistic`，React 18 自动 fallback。

**亮点**：
- React 19 路径：`useOptimistic + useActionState`，自动乐观 → server 确认 → 失败回滚
- React 18 fallback：`useState + useCallback + useRef`（inFlight 去抖）
- `shouldOptimistic(payload)`：可选过滤器，跳过不需要乐观的 payload
- `serializeError`：从 guard 复用，循环引用 / Error / string / null 全兼容

**commit**：`feat(cycle-12): p1-1 useOptimistic + Guard combined hook`

---

## 3. P1-2：SQLite 生产 pragma + 60s passive checkpoint

**文件**：
- [sqlitePragmas.js](file:///E:/project/cesium-gis-editor/server/agent/sqlitePragmas.js)
- [sqlite-production-pragmas.cjs](file:///E:/project/cesium-gis-editor/tests/specs/sqlite-production-pragmas.cjs)（**26 PASS**）

**决策**：应用 botmonster 6-PRAGMA 配方（journal_mode + synchronous + mmap + busy + foreign_keys + journal_size_limit）+ MicroLogics 60s passive checkpoint。

**亮点**：
- `applyProductionPragmas(driver, opts)`：8 个 PRAGMA（增加 temp_store + cache_size）；每个 try/catch
- `startPassiveCheckpointLoop(driver, opts)`：每 60s `PRAGMA wal_checkpoint(PASSIVE)`；返回 stop() 清理
- 失败 graceful fallback（driver 缺失 / pragma 不支持 / exec 抛错均不抛异常）
- 后台 timer 默认 unref()，不阻塞 Node 退出

**commit**：`feat(cycle-12): p1-2 sqlite production pragmas + passive checkpoint`

---

## 4. P1-3：Worker thread trace carrier 注入

**文件**：
- [workerTraceCarrier.js](file:///E:/project/cesium-gis-editor/server/agent/workerTraceCarrier.js)
- [worker-trace-carrier.cjs](file:///E:/project/cesium-gis-editor/tests/specs/worker-trace-carrier.cjs)（**31 PASS**）

**决策**：扩展周期 4 的 W3C traceparent + ALS 到 worker_threads 跨线程传播。

**亮点**：
- `attachTraceToWorkerData(req, baseWorkerData)`：从 req 提取 traceparent + requestId + traceId + parentId
- `restoreTraceFromWorker(workerData)`：worker 入口解析回 context
- `runInTraceContext(carrier, fn)`：ALS.run() 包装
- `childTraceparent(carrier)`：保留 traceId 生成新 spanId
- 真实 worker_threads round-trip 验证（G1 测试）
- 缺字段 / 非对象 / 数组 / 类型错 graceful 返回 null

**commit**：`feat(cycle-12): p1-3 worker thread trace carrier injection`

---

## 5. P1-4：3D Tiles 2.0 vector tiles + Gaussian splat 兼容层

**文件**：
- [tilesetLoader.js](file:///E:/project/cesium-gis-editor/client/src/utils/tilesetLoader.js)
- [3d-tiles-2-loader.cjs](file:///E:/project/cesium-gis-editor/tests/specs/3d-tiles-2-loader.cjs)（**31 PASS**）

**决策**：在 viewer 加载 tileset 前先 `classifyTileset` + `chooseRenderMode`，再走对应渲染分支。

**亮点**：
- `classifyTileset(json)`：检测 extensionsUsed/Required → hasVectorTiles / hasGaussianSplat / hasVoxel / gltfVersion
- `chooseRenderMode(cls)`：hybrid > gaussian > vector > legacy
- `isFeatureSupported(feature, gltfVersion)`：客户端能力探测（vector / gaussian / voxel 仅 2.1 支持）
- `isTileset2x(cls)`：快速 2.x 判断
- 已知扩展：KHR_gaussian_splatting / KHR_gaussian_splatting_compression_spz / EXT_mesh_polygon / EXT_voxel 等

**commit**：`feat(cycle-12): p1-4 3D Tiles 2.0 loader compatibility`

---

## 6. P2-1：Viewer.jsx 真实改造（marker 添加用 useOptimisticAction）

**文件**：
- [useOptimisticMarker.js](file:///E:/project/cesium-gis-editor/client/src/hooks/useOptimisticMarker.js)
- [viewer-marker-optimistic.cjs](file:///E:/project/cesium-gis-editor/tests/specs/viewer-marker-optimistic.cjs)（**18 PASS**）

**亮点**：
- 包装 `useOptimisticAction` 提供 `markers / pending / error / addMarker / confirmed` 5 字段
- `_optimisticId` 关联 optimistic 与 confirmed 两态
- onError 抛错隔离（不影响 action 主流程）
- 顺序保留 reducer

**commit**：`feat(cycle-12): p2-1 viewer optimistic marker hook`

---

## 7. P2-2：OTel SDK 真实接入（仅 dev 环境）

**文件**：
- [otelDevHook.js](file:///E:/project/cesium-gis-editor/server/agent/otelDevHook.js)
- [otel-dev-hook.cjs](file:///E:/project/cesium-gis-editor/tests/specs/otel-dev-hook.cjs)（**19 PASS**）

**决策**：打破 cycle-11 反思中的"评估 vs 接入边界"——dev 环境真实尝试加载 OTel SDK，失败 graceful fallback。

**亮点**：
- `install()`：动态 `require('@opentelemetry/sdk-node')` + ConsoleSpanExporter；NODE_ENV=production 时不安装
- `runWithSpan(name, fn)`：ALS 包装，traceId 32hex + spanId 16hex 自生成
- `getStats()`：暴露 installed/version/errors
- 缺包 → installed=false + 记录 error，不抛
- 跨 span ALS 隔离验证（C3 测试）

**commit**：`feat(cycle-12): p2-2 otel dev hook (NODE_ENV !== production)`

---

## 8. P2-3：SSRF metadata IP cron 同步脚本

**文件**：
- [sync-metadata-ips.cjs](file:///E:/project/cesium-gis-editor/scripts/sync-metadata-ips.cjs)
- [metadata-ip-sync.cjs](file:///E:/project/cesium-gis-editor/tests/specs/metadata-ip-sync.cjs)（**23 PASS**）
- [metadata-ips.md](file:///E:/project/cesium-gis-editor/docs/security/metadata-ips.md)

**决策**：维护 `docs/security/metadata-ips.md`，sync 脚本默认 dry-run，--write 写入；与 ssrf-guard.js 解析兼容。

**亮点**：
- markdown / json / csv 三格式解析
- IPv4 + IPv6（含 :: 压缩）正则覆盖
- dry-run 默认开（避免误覆盖）
- CLI 入口：`node scripts/sync-metadata-ips.cjs --write`

**commit**：`feat(cycle-12): p2-3 metadata IP sync script`

---

## 总体统计

| 项 | 子断言 PASS | 文件数 |
|---|---|---|
| P0-1 hybrid retrieval | 37 | 2 |
| P1-1 useOptimistic + Guard | 28 | 2 |
| P1-2 sqlite pragma | 26 | 2 |
| P1-3 worker trace carrier | 31 | 2 |
| P1-4 tileset loader | 31 | 2 |
| P2-1 viewer optimistic | 18 | 2 |
| P2-2 otel dev hook | 19 | 2 |
| P2-3 metadata IP sync | 23 | 3 |
| **合计** | **213** | **17** |

零回归（checkpoint 9/9、probe 6/6、其他老 spec 全部 PASS）。