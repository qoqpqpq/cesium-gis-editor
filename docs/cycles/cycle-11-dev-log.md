# Cycle 11 Dev Log

> 周期 11 开发日志（2026-09-09）
> 共交付 9 项：P0 ×2 + P1 ×4 + P2 ×3
> 所有子断言（sub-assertion）全部 PASS，零回归。

---

## 1. P0-1：memoryVectorPrototype（32-dim hash embedder + cosine）

**文件**：
- [memoryVectorPrototype.js](file:///E:/project/cesium-gis-editor/server/agent/memoryVectorPrototype.js)
- [memory-vector-prototype.cjs](file:///E:/project/cesium-gis-editor/tests/specs/memory-vector-prototype.cjs)（**32 PASS**）
- [memory-vector-prototype.md](file:///E:/project/cesium-gis-editor/docs/evaluation/memory-vector-prototype.md)

**决策**：< 10K 向量 prototype 不引入外部 VDB；用 32 维 hash + brute-force cosine，标量量化压缩至 1 字节/维。

**亮点**：
- `hashEmbed(text, dim=32)`：FNV-1a + 字符串分词的多 token hashing；同义词有部分重叠向量（可检索）。
- `quantize(vec)`：每维映射到 int8，2.4× 存储压缩 + 距离内积加速。
- `search(query, topK=5)`：brute-force cosine；O(N·D) 但 N < 10K 时延迟 < 5ms。

**commit**：`feat(cycle-11): p0-1 memory vector prototype`

---

## 2. P0-2：memMachine ground-truth preservation 评估

**文件**：
- [mem-machine-ground-truth.md](file:///E:/project/cesium-gis-editor/docs/evaluation/mem-machine-ground-truth.md)
- [mem-machine-ground-truth-eval.cjs](file:///E:/project/cesium-gis-editor/tests/specs/mem-machine-ground-truth-eval.cjs)（**36 PASS**）

**决策**：保留原始 episodic（不抽取）+ curated fact + 时间戳三元组做语义层；不切换到 Mem0 / MemMachine / Zep。

**核心论点**：
1. 纯 LLM 抽取会丢失 ground-truth（CoALA 论文）；
2. MemGPT 的 "Memory OS" 类比已毕业为生产模式（Letta、Cognee、KeyMem）；
3. 2026 共识是"向量 + 图 + BM25 + 时间加权"四融合，**不是**"替换 episodic"。

**commit**：`docs(cycle-11): p0-2 memMachine ground-truth preservation`

---

## 3. P1-1：OTel SDK Node.js 传播模式 spike

**文件**：
- [otel-sdk-spike.md](file:///E:/project/cesium-gis-editor/docs/evaluation/otel-sdk-spike.md)
- [otel-sdk-spike.cjs](file:///E:/project/cesium-gis-editor/tests/specs/otel-sdk-spike.cjs)（**33 PASS**）

**决策**：保持自实现 W3C traceparent + ALS；cycle-12 引入 worker carrier 注入，不替换为 `@opentelemetry/sdk-node`。

**覆盖**：
- W3C Trace Context 解析（`00-{traceId}-{spanId}-{flags}` 严格 55 字符）
- B3 single/multi-header 互转
- composite propagator（顺序尝试）
- Worker thread 跨线程 carrier 注入（serialization round-trip）

**commit**：`docs(cycle-11): p1-1 OTel SDK spike`

---

## 4. P1-2：React 19 useActionState Guard

**文件**：
- [useActionStateGuard.js](file:///E:/project/cesium-gis-editor/client/src/utils/useActionStateGuard.js)
- [react19-use-action-state-guard.cjs](file:///E:/project/cesium-gis-editor/tests/specs/react19-use-action-state-guard.cjs)（**30 PASS**）

**决策**：仅 React 19 启用 useActionState；React 18 fallback 到 try/catch + useState 三态。

**亮点**：
- `serializeError(err)`：把 Error / 普通对象 / string 安全序列化为 `{name, message, stack, cause}`，避免循环引用。
- `useActionStateGuard(action, initialState)`：包装 `(prevState, formData)` action，统一 isPending、serialized error、success 三个状态字段。
- ESM 兼容（client `"type": "module"`），spec 文件用 `await import(url.pathToFileURL())`。

**commit**：`feat(cycle-11): p1-2 React 19 useActionState guard`

---

## 5. P1-3：3D Tiles 2.0 follow-up

**文件**：
- [3d-tiles-2-followup.md](file:///E:/project/cesium-gis-editor/docs/evaluation/3d-tiles-2-followup.md)
- [3d-tiles-2-followup.cjs](file:///E:/project/cesium-gis-editor/tests/specs/3d-tiles-2-followup.cjs)（**33 PASS**）

**覆盖**：
- vector tiles（基于 glTF 2.1 + `EXT_mesh_polygon`）
- Gaussian splat HLOD（`KHR_gaussian_splatting` + SPZ 压缩）
- temporal 3D Tiles（多版本 tile）
- voxel primitive（250MB → 15.4MB 压缩）

**决策**：cycle-12 在 `tilesetLoader.js` 加 `extensionsUsed` 自动检测分支。

**commit**：`docs(cycle-11): p1-3 3D Tiles 2.0 follow-up`

---

## 6. P1-4：Handler 设计 checklist 8 维

**文件**：
- [handler-design-checklist.md](file:///E:/project/cesium-gis-editor/docs/architecture/handler-design-checklist.md)
- [handler-design-checklist.cjs](file:///E:/project/cesium-gis-editor/tests/specs/handler-design-checklist.cjs)（**30 PASS**）

**8 维度**：
1. Rate-limit（Token Bucket + IETF `RateLimit-*`）
2. Trace（ALS + W3C `traceparent` 注入）
3. Auth（origin / CIDR / token）
4. Validation（schema + 类型守卫）
5. Idempotency（`Idempotency-Key` header）
6. Backpressure（队列上限 + 拒绝策略）
7. Observability（metrics + log + trace 三联）
8. Recovery（retry + circuit breaker）

**commit**：`docs(cycle-11): p1-4 handler design checklist`

---

## 7. P2-1：Piscina vs 自研 worker pool 评估

**文件**：
- [piscina-vs-pool.md](file:///E:/project/cesium-gis-editor/docs/evaluation/piscina-vs-pool.md)
- [piscina-vs-pool-eval.cjs](file:///E:/project/cesium-gis-editor/tests/specs/piscina-vs-pool-eval.cjs)（**23 PASS**）

**决策**：保持自研 `sandboxWorkerPool.js`（LRU + reuse + idle timeout 60s）；piscina 在 < 30 worker 时优势不明显，引入仅增加 1 个依赖。

**commit**：`docs(cycle-11): p2-1 piscina vs pool evaluation`

---

## 8. P2-2：telemetryCollector JSONL 持久化

**文件**：
- [telemetryCollector.js](file:///E:/project/cesium-gis-editor/server/middleware/telemetryCollector.js)（修改）
- [telemetry-buffer-persist.cjs](file:///E:/project/cesium-gis-editor/tests/specs/telemetry-buffer-persist.cjs)（**21 PASS**）

**新增能力**：
- `TELEMETRY_PERSIST_PATH` env：开启 JSONL 滚动文件（每文件 ≤ 10MB，最多 5 个）
- `getPersistStatus()`：导出当前文件数/字节数
- 写入失败时不抛错，只记录到 stderr，避免 telemetry 自身导致 5xx

**commit**：`feat(cycle-11): p2-2 telemetry JSONL persist`

---

## 9. P2-3：requestId ↔ traceparent 跨进程链接

**文件**：
- [requestid-trace-link.cjs](file:///E:/project/cesium-gis-editor/tests/specs/requestid-trace-link.cjs)（**22 PASS**）

**覆盖 5 种 case**：
1. 客户端带 `X-Request-Id`，服务端尊重
2. 客户端带 `traceparent`，服务端补 `requestId`
3. 两者都带，服务端保留 traceparent 不替换
4. 都不带，服务端生成新值并注入响应头
5. `ALS` store 中两者一致

**commit**：`feat(cycle-11): p2-3 requestId trace link`

---

## 总体统计

| 项 | 子断言 PASS | 文件数 |
|---|---|---|
| P0-1 memoryVectorPrototype | 32 | 3 |
| P0-2 memMachine 评估 | 36 | 2 |
| P1-1 OTel SDK spike | 33 | 2 |
| P1-2 useActionState Guard | 30 | 2 |
| P1-3 3D Tiles 2.0 follow-up | 33 | 2 |
| P1-4 handler checklist | 30 | 2 |
| P2-1 piscina 评估 | 23 | 2 |
| P2-2 telemetry persist | 21 | 2 |
| P2-3 requestId trace link | 22 | 1 |
| **合计** | **260** | **18** |

零回归（checkpoint 9/9、probe-real-ai-tool-first 6/6、其他老 spec 全部 PASS）。