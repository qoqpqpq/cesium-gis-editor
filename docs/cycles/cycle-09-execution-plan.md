# Cycle 09 — Execution Plan

> **周期**: N=9（2026-09-08）
> **目标**: 沉淀"周期 7/8 隐藏 bug → 自动化捕获"基础设施；落地 MCP 真实接入 + memory.js 性能基线 + ErrorBoundary 升级；调研 12 主题 60 链接
> **模型**: MiniMax-M3
> **预算**: m3 ≤ 150 调用 / M3 ≤ 450 调用 / commit ≤ 12
> **当前 state**: current_cycle=8, status=completed
> **时间窗**: cycle_started_at 写于周期开始；cycle_completed_at 写于 push 后

## 1. 背景与上下文

### 1.1 周期 8 复利回顾

- ✅ C8-B01 严重 bug 立即发现并修复（server 启动验证硬关）
- ✅ P0(2/2): FTS5、DecompressionStream
- ✅ P1(5/5): MCP manifest / executeSandbox / memory middleware / metrics CIDR / protocol sync
- ✅ P2(2/2): OTLP push 评估、helmet permissionsPolicy 再评估（关键发现）
- ✅ 9 spec / 110 子断言 / 10 commit 全 push

### 1.2 周期 9 输入（research Top5 + lessons 复用清单）

| 来源 | 任务 | 优先级 |
|------|------|--------|
| 周期 8 lessons E-01 | server-import-completeness spec 防止 C8-B01 类 bug | **P0** |
| 周期 8 调研 Top3 | memory.js WAL + pragma optimize | **P0** |
| 周期 8 调研 Top1 | MCP 真接入 cesium-mcp-bridge | **P1** |
| 周期 7 sandbox 3 引擎 | sandbox perf benchmark（vm vs worker vs iv）| **P1** |
| 周期 8 调研 Top4 | react-crash-guard 替换 ErrorBoundary | **P1** |
| 周期 8 调研 Top5 | claude-code-action 接 M3 跑 PR review | **P1** |
| 周期 7 metrics | /api/metrics + /api/otlp/metrics perf benchmark | P2 |
| 周期 8 P2-2 关键发现 | helmet 8 PermissionsPolicy 自研 middleware 补齐缺失 header | P2 |

## 2. 任务清单

### 2.1 P0（必须完成）

| ID | 范围 | 文件 | spec | 验收 |
|----|------|------|------|------|
| **P0-1** | server-import-completeness 静态扫描 spec（防 C8-B01 类 bug）| `tests/specs/server-import-completeness.cjs` (new) | 同左 | 扫 `app.use / app.get / app.post / app.delete` 的 handler 全部在 destructure 中存在 |
| **P0-2** | memory.js WAL + 周期 `pragma optimize` + 写并发 benchmark | `server/agent/memory.js` (+~40 行) | `memory-wal-pragma.cjs` (new, ≥10 子断言) | `_initSqlite` 加 `journal_mode=WAL` + `synchronous=NORMAL` + `_maybeOptimizePragma()`；新增并行 100 写 benchmark |

### 2.2 P1（高优先级，至少完成 4 项）

| ID | 范围 | 文件 | spec | 验收 |
|----|------|------|------|------|
| **P1-1** | MCP 真接入 cesium-mcp-bridge 评估（包大小 + 5 工具集成） | `client/src/pages/gis/mcpBridge.js` (new) + `mcpManifest.js` (改) | `mcp-bridge-integration.cjs` (new, ≥12 子断言) | 评估报告 + 集成 init；Window.mcp.__bridge 标记；5 个核心工具注册 |
| **P1-2** | sandbox perf benchmark spec（vm / worker / iv 三引擎） | `tests/specs/sandbox-perf-benchmark.cjs` (new) | 同左 | 三引擎分别跑 1000 次 hello world，记录 p50/p95/p99、最大并发数；不实施优化仅评估 |
| **P1-3** | ErrorBoundary 升级（async error + unhandledrejection 监听） | `client/src/pages/gis/ErrorBoundary.jsx` (改) + `client/src/utils/asyncGuard.js` (new) | `client-error-boundary-async.cjs` (new, ≥10 子断言) | window.addEventListener('unhandledrejection') 上报；ErrorBoundary 集成；fallback UI |
| **P1-4** | PR review workflow 升级（接 M3 跑 PR review） | `.github/workflows/pr-review.yml` (改) | `pr-review-workflow-m3.cjs` (new, ≥8 子断言) | workflow 加 anthropic-base-url / model 配置；local test 用 github actions runner dry-run；spec 验证 yaml 解析 + step 数 ≥ 4 |

### 2.3 P2（评估类 / 中低优先级）

| ID | 范围 | 文件 | spec | 验收 |
|----|------|------|------|------|
| **P2-1** | metrics endpoint perf benchmark（/api/metrics + /api/otlp/metrics）| `tests/specs/metrics-endpoint-perf.cjs` (new) | 同左 | 1000 次请求本地端点，p50/p95/p99、字节大小；不实施优化 |
| **P2-2** | 自研 helmet 8 PermissionsPolicy middleware（补齐缺失 header）| `server/middleware/permissionsPolicy.js` (new) | `permissions-policy-middleware.cjs` (new, ≥8 子断言) | middleware 输出 Permissions-Policy header（含周期 7 评估 20 项）；server/index.js 集成；spec runtime 验证 |

### 2.4 bug 修复

- 无预期新 bug；如发现按 C9-Bxx 编号入 `docs/cycles/cycle-09-bugs.md`

## 3. 预算分配

| 项 | 预算 | 说明 |
|----|------|------|
| m3 calls | ≤ 150 | spec 设计 + lessons 反思 + state update |
| M3 calls | ≤ 450 | 真功能落地（mcpBridge / WAL / ErrorBoundary / permissionsPolicy） |
| commits | ≤ 12 | 1 chore(plan) + 1 fix(可选) + 8 feat(p0/p1) + 1 docs(dev-log) + 1 docs(research) + 1 docs(lessons) + 1 docs(state) ≈ 11-12 |

**策略**：
- P0 优先；P1 完成 ≥ 4 项；P2 ≥ 1 项
- P1-2 评估 spec 直接合并入 dev-log commit（P2-1 同样）
- 周期 9 不涉及 Prisma / Redis / OTLP push 实施（保持当前状态）

## 4. 风险与依赖

- **MCP 真接入** 包大小需评估；client bundle 当前 ~800KB，cesium-mcp-bridge ~50KB 可接受
- **memory.js WAL** better-sqlite3 WAL 模式需 journaling 已开启；现有 _initSqlite 流程兼容
- **ErrorBoundary async** 需 React 19 `use()` hook 兼容（确认 client/react 版本）
- **PR review workflow** 需要 secrets.M3_API_KEY；仅 yaml + spec 验证，不实际触发

## 5. 完成条件

- ✅ 9 个新 spec 全 PASS
- ✅ 0 个旧 spec FAIL（无回归）
- ✅ server 启动硬关（避免 C8-B01 类 bug）
- ✅ 周期 9 docs（plan/test-report/bugs/dev-log/research/lessons/self-check）齐全
- ✅ state.json / upcoming-work 更新
- ✅ 11-12 commit 全 push 到 `origin/feat/auto-cycle`

## 6. 时间分配（4h 总预算）

| 阶段 | 时间 |
|------|------|
| 1. 文档/计划 | 20 分钟 |
| 2. 测试+根因 | 25 分钟 |
| 3. 开发（含调试+review） | 150 分钟 |
| 4. 调研 | 50 分钟 |
| 5. 总结+push | 25 分钟 |
| **合计** | **270 分钟 ≈ 4.5h** |