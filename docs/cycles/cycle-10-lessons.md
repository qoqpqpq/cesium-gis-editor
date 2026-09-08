# Cycle 10 — Lessons（教训）

> **周期**: N=10（2026-09-08）
> **目标**: 沉淀可复用的设计模式与决策路径

## L10-1: Spec-first 设计 checklist 生效

**问题**: 周期 9 扣分点 —— "handler 调用语义需先用 spec 探明"软肋（C9-B01 / C9-B02 都属此）。

**方案**: 周期 10 P1-2 asyncGuard 上报 /api/telemetry 实施时严格执行：
1. 先写 spec（success path + failure path + edge cases）
2. 再写代码（按 spec 行为实现）
3. spec 验证通过即认为 design 正确

**结果**:
- asyncGuard telemetry 一遍过
- spec 30 子断言 + telemetry-route 19 子断言全 PASS
- 零回归、零返工

**沉淀**: handler 设计 checklist（asyncGuard / mcpManifest / sandbox executeSandbox 三处验证有效）
- 返回值语义：handler 抛错 vs 返回 `{ok, value}` 谁负责？
- 调用方期望：handler 总是同步 / 异步？
- 错误传递：handle 抛错 → caller 怎么 catch？

**下次必用**: 任何 handler / middleware / route 实施前，先 spec 再代码。

---

## L10-2: PR review 多 specialist 控 token 模式

**问题**: 周期 9 P1-4 baseline（`--max-turns 5`）单 specialist，review 维度单一（仅 code quality）。

**方案**: 周期 10 P1-1 升级：
1. 拆 3 specialist job（baseline + security + design）—— 各专注一个维度
2. 每个 `--max-turns 3`（控 token 用量）
3. `--allowedTools "Bash,Read,Grep,Glob"` 限制越权
4. concurrency cancel-in-progress 防 PR 重 push

**结果**:
- spec 18 → 24 子断言（+6 multi-specialist）
- token 用量：baseline 5 turn → 3 specialist × 3 turn = 9 turn，但每 turn 平均 token 更少（focus）
- 实际成本增加 30%（3 specialist 并行），review 质量显著提升（security / design 维度覆盖）

**沉淀**: 多 specialist fan-out 模式 = 增加 review 维度 + 控制 token（max-turns 调低）。

**下次必用**: 任何 GH Actions AI workflow（PR review / issue triage / release notes）拆 specialist。

---

## L10-3: Worker pool LRU + reuse vs cold-start 性能差异

**问题**: 周期 9 P1-2 baseline —— worker-seq p50=628ms（cold-start 主导）。

**方案**: 周期 10 P1-3 自研 LRU pool：
1. worker 复用 > spawn（warm 复用）
2. LRU 驱逐（shift/push）
3. idle timer 60s 自动 drain（WeakMap 持有 timer ref）
4. 默认 size=4（与 CPU 数对齐）

**结果**:
- warm 复用 p50 < 100ms（6x 提升）
- LRU 驱逐防止无限累积
- idle timeout 防止内存泄漏

**沉淀**: 自研 pool 设计模板（`server/agent/sandboxWorkerPool.js`）
- LRU + reuse + idle timeout 三件套是必备
- 周期 11+ 评估 Piscina（独立 package 多一个依赖）vs 自研（可控但维护负担）

**下次必用**: 任何 CPU 密集任务（sandbox / parsing / encryption / model inference）使用 pool。

---

## L10-4: Telemetry localhost-only + sliding buffer 模式

**问题**: 周期 9 P1-3 asyncGuard 仅 console.error —— "无声失败"不可观测。

**方案**: 周期 10 P1-2 + P1-4 联合：
1. client asyncGuard 升级 `opts.telemetryUrl` + sendBeacon + keepalive 兜底
2. server `routes/telemetry.js` POST /api/telemetry/client-error
3. server `middleware/telemetryCollector.js` sliding buffer（1000 items / 1h TTL）
4. localhost-only IP allowlist（127.0.0.1 / ::1 / ::ffff:127.0.0.1）

**结果**:
- 客户端错误冒泡到服务端可观测
- 不影响生产 CSP（text/plain 不 preflight）
- 不滥用：localhost-only + 32KB body 限制

**沉淀**: 自研 telemetry 三件套（client opt-in + server route + collector middleware）
- 周期 11+ 评估 OpenTelemetry SDK 替换（更标准化但多依赖）

**下次必用**: 任何客户端错误采集需求（client error boundary / sandbox unhandledrejection）。

---

## L10-5: CoALA 三层记忆与现有 SQLite FTS5 兼容

**问题**: 周期 9 P0-2 落 SQLite + FTS5 + WAL —— 是否要重新设计 memory.js？

**方案**: 周期 10 P0-2 评估：
1. CoALA 三层（episodic + semantic + procedural）
2. 当前 SQLite FTS5 已是 episodic layer 雏形（按时间存储 queryable）
3. semantic layer 未来可加（向量 + 实体抽取）
4. procedural layer 未来可加（路由规则 + 工具偏好）

**结果**:
- 当前架构 = episodic-only
- 升级路径清晰：episodic 已 OK → 加 semantic（向量层）→ 加 procedural（代码层）
- 不破坏现有 WAL + FTS5

**沉淀**: 渐进式 memory 升级路径（不破坏 + 不重写）。

**下次必用**: 任何"复杂持久化需求"评估先识别当前架构属于哪一层 + 缺哪几层 + 升级路径。

---

## L10-6: WebGPU / 3D Tiles 2.0 覆盖率门槛

**问题**: cesiumJS v2 WebGPU backend + 3D Tiles 2.0 是否立即切？

**方案**: 周期 10 P2-1 评估：
1. caniuse WebGPU 覆盖率 ~73%（Chrome / Edge 113+, Safari 18+, Firefox 130+）
2. 3D Tiles 2.0 KHR_gaussian_splatting OGC 2026-Q3 candidate
3. CesiumJS v2 WebGPU backend experimental
4. 决策门槛：浏览器覆盖率 ≥80% + 生态成熟

**结果**:
- 决定暂不切换（覆盖率 73% < 80%）
- 周期 11+ 跟踪 Khronos 标准化 + Cesium ion 适配
- 周期 12+ 评估 WebGPU backend 切换

**沉淀**: 新前端技术采纳门槛 = 覆盖率 ≥80% + 生态成熟 + ROI 评估。

**下次必用**: 任何新浏览器 API / 标准（WASM 4 / WebNN / WebTransport）评估用相同门槛。

---

## L10-7: Helm 8.x Permissions-Policy 缺口（持续）

**问题**: 周期 8 P2-2 + 周期 9 P2-2 已发现 helmet 8.x 不输出 `permissions-policy` header。

**方案**: 周期 9 P2-2 自研 `server/middleware/permissionsPolicy.js` 20 默认策略。

**新发现**（周期 10 调研）：
- helmet issue #557 明确 helmet team 未把 Permissions-Policy 列入 roadmap
- W3C 2026-08 候选推荐
- 监控 helmet 9.x 是否实现

**结果**:
- 自研 middleware 持续生效（周期 9 P2-2 落 13 子断言 + 周期 10 仍 PASS）
- 周期 11+ 评估 helmet 9.x 是否实现（若实现可移除自研）

**沉淀**: helmet 不覆盖的能力 = 自研 middleware + 监控上游进度。

**下次必用**: 任何"框架不覆盖"的安全 header（CSP frame-ancestors / COOP / COEP）同样模式。

---

## 总体教训

1. **Spec-first** (L10-1)：handler 设计 checklist 必走
2. **多 specialist fan-out** (L10-2)：GH Actions AI workflow 拆 specialist
3. **Worker pool 三件套** (L10-3)：LRU + reuse + idle timeout
4. **Telemetry 三件套** (L10-4)：client opt-in + server route + collector middleware
5. **渐进式架构升级** (L10-5)：识别当前层 + 缺哪层 + 升级路径
6. **新技术采纳门槛** (L10-6)：覆盖率 ≥80% + 生态成熟
7. **框架缺口自研** (L10-7)：监控上游 + 暂时自研 + 评估移除时机