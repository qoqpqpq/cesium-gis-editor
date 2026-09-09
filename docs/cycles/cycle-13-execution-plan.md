# Cycle 13 Execution Plan

> 周期 13 计划（2026-09-09）
> 总目标：落地 cycle-12 调研 Top5（AI 安全护栏 / OTel 集成 / node:sqlite 兼容 / CesiumJS 升级 / RRF 多样化）+ Viewer marker 接入补足
> 预算：m3 ≤ 150 / M3 ≤ 450 / commits ≤ 12

---

## 总览

| 优先级 | ID | 任务 | 来源 | 子断言目标 |
|---|---|---|---|---|
| P0 | P0-1 | **handler 8 维升级为 AI Agent 安全护栏** | cycle-12 Top5 #1 | ≥ 30 |
| P0 | P0-2 | **better-sqlite3 → node:sqlite 兼容层** | cycle-12 Top5 #3 | ≥ 22 |
| P1 | P1-1 | **OTel SDK worker 集成 + SQLite pragma 升级** | cycle-12 Top5 #2 | ≥ 25 |
| P1 | P1-2 | **Viewer marker 真实接入 cesiumEarth.jsx** | cycle-12 L12-8 反思 | ≥ 18 |
| P1 | P1-3 | **混合检索 RRF 多样化（standard/diminishing/max+bonus）** | cycle-12 Top5 #5 | ≥ 22 |
| P2 | P2-1 | **CesiumJS 1.141+ Gaussian splat demo** | cycle-12 Top5 #4 | ≥ 15 |
| P2 | P2-2 | **sqlite-vec 评估文档** | cycle-12 Top5 #5 | ≥ 12 |
| P2 | P2-3 | **jsdom + RTL 客户端 hook 真实集成测试** | cycle-12 反思 #5 | ≥ 15 |

合计：2 P0 + 4 P1 + 3 P2，**≥ 159 子断言**

---

## P0 详案

### P0-1：AI Agent 安全护栏（OWASP ASI01-10 映射）

**目标**：在 8 维 handler checklist（cycle-11 P1-4）基础上加 AI 专用护栏层。

**新增文件**：
- `server/middleware/aiGuardrails.js`：tool allowlist + input sanitization + circuit breaker
- `docs/security/ai-guardrails.md`：OWASP ASI01-10 映射
- `tests/specs/ai-guardrails.cjs`：≥ 30 子断言

**修改文件**：
- `server/services/ai.js`：每个 platform tool 走 guardrails
- `server/middleware/handler-design-checklist.md`：加 ASI 维度

**API 草案**：
```js
const { withGuardrails } = require('./server/middleware/aiGuardrails');
const safeTool = withGuardrail(tool, {
  allowlist: ['read', 'query'],
  circuitBreaker: { threshold: 5, cooldownMs: 30000 },
  inputSanitizer: (p) => ({ ...p, sanitized: stripControl(p.prompt) }),
});
```

**验收**：
- 10 项 ASI 风险各覆盖至少 1 个 guard（agent 端）
- tool allowlist 拒绝 + circuit breaker 自动开
- input sanitization 剥控制字符 + 长度限制
- 5 类注入攻击（direct / indirect / role-play / obfuscation / chain）均拒绝

---

### P0-2：node:sqlite 兼容层

**目标**：Node 24+ 用 `node:sqlite`，老版本 fallback better-sqlite3，Bun 用 `bun:sqlite`。

**新增文件**：
- `server/agent/sqliteBackend.js`：三向 dispatch wrapper
- `tests/specs/sqlite-backend-dispatch.cjs`：≥ 22 子断言

**API 草案**：
```js
const { openDatabase } = require('./server/agent/sqliteBackend');
const db = openDatabase({ path: 'foo.sqlite' });
// 返回 { driver: 'node:sqlite' | 'better-sqlite3' | 'bun:sqlite', prepare, exec, close }
```

**验收**：
- 三个 driver 都有 mock 测试
- Node 24+ 真实加载 node:sqlite（用 try/catch）
- better-sqlite3 fallback 不崩溃
- 旧 spec（hybrid-retrieval-rrf）零回归

---

## P1 详案

### P1-1：OTel worker 集成 + SQLite pragma 升级

**目标**：扩展 cycle-12 otelDevHook.js 真实接 OTel SDK worker；sqlitePragmas.js 加 TRUNCATE 模式 + version check。

**修改文件**：
- `server/agent/otelDevHook.js`：加 worker 入口 `withWorkerContext(carrier, fn)`
- `server/agent/sqlitePragmas.js`：加 `mode: 'PASSIVE' | 'TRUNCATE'` 选项 + `checkSqliteVersion(driver)` ≥ 3.51.3

**新增文件**：
- `tests/specs/otel-worker-integration.cjs`：≥ 15 子断言
- `tests/specs/sqlite-pragma-upgrade.cjs`：≥ 10 子断言

---

### P1-2：Viewer marker 真实接入

**目标**：把 cycle-12 useOptimisticMarker hook 真正接入 cesiumEarth.jsx addMarker。

**修改文件**：
- `client/src/pages/gis/CesiumEarth.jsx`：替换 addMarker 内部实现

**新增文件**：
- `tests/specs/viewer-marker-integration.cjs`：≥ 18 子断言（mock Viewer）

---

### P1-3：混合检索 RRF 多样化

**目标**：hybridRetrieval.js 支持 5 种 RRF strategy（standard / diminishing / max+bonus / soft-dedup / best-rank）。

**修改文件**：
- `server/agent/hybridRetrieval.js`：加 `strategy` 配置

**新增文件**：
- `tests/specs/hybrid-retrieval-strategies.cjs`：≥ 22 子断言

---

## P2 详案

### P2-1：CesiumJS Gaussian splat demo
升级 client/package.json cesium 至 1.141+；引入 splatLoader.js + 公共 Microsoft campus tileset 引用；spec ≥ 15。

### P2-2：sqlite-vec 评估文档
docs/evaluation/vector-extension-decision.md：brute-force vs sqlite-vec vs vec1 三选一；spec ≥ 12。

### P2-3：jsdom + RTL 客户端 hook 真实集成测试
引入 @testing-library/react + jsdom；useOptimisticAction / useOptimisticMarker 真实 React 集成测试；spec ≥ 15。

---

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| node:sqlite 实验性 API 变更 | 用 try/catch + fallback；spec 用 mock 测试三 driver |
| CesiumJS 1.141 升级破坏现有 demo | 先在 dev 分支跑 client build 验证；spec 覆盖分类逻辑 |
| AI guardrails 与现有 ai.js 集成耦合 | 用 middleware 包装 + 单元 spec + 不破坏现有 6 probe |

---

## 子断言预算

| 项 | 目标 | 累计 |
|---|---|---|
| P0-1 AI guardrails | 30 | 30 |
| P0-2 node:sqlite | 22 | 52 |
| P1-1 OTel worker + pragma upgrade | 25 | 77 |
| P1-2 viewer marker integration | 18 | 95 |
| P1-3 RRF strategies | 22 | 117 |
| P2-1 CesiumJS splat demo | 15 | 132 |
| P2-2 sqlite-vec eval doc | 12 | 144 |
| P2-3 jsdom + RTL | 15 | **159** |
| **合计** | **≥ 159** | |

---

## Commit 计划

预计 9-10 个 commit：
1. `feat(cycle-13): p0-1 AI agent guardrails (OWASP ASI01-10)`
2. `feat(cycle-13): p0-2 sqlite backend dispatch (node:sqlite / better-sqlite3 / bun:sqlite)`
3. `feat(cycle-13): p1-1 otel worker integration + sqlite pragma upgrade`
4. `feat(cycle-13): p1-2 viewer marker optimistic integration (cesiumEarth.jsx)`
5. `feat(cycle-13): p1-3 hybrid retrieval RRF strategies`
6. `feat(cycle-13): p2-1 cesiumjs 1.141+ gaussian splat demo`
7. `feat(cycle-13): p2-2 sqlite-vec evaluation doc`
8. `feat(cycle-13): p2-3 jsdom + RTL hook integration tests`
9. `chore(cycle-13): update upcoming-work + cycle-state for cycle 13`
11. `docs(cycle-13): plan + test-report + dev-log + research + lessons + self-check`