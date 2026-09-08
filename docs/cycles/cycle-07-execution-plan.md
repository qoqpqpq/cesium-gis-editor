# Cycle 07 — Execution Plan（执行计划）

> **周期**: N=7
> **目标**: 落地周期 6 调研 Top5 中"周期 7+ 评估"的 4 项（mem0 长期记忆 / CesiumJS WebGPU + MCP / OTLP 接入 / isolated-vm 评估）+ 流程 PR review automation 接入。
> **模型**: MiniMax-M3
> **预算**: m3 ≤ 150, M3 ≤ 450, commits ≤ 12
> **复用**: 周期 6 的 32 老 spec + 8 新 spec + 8 helpers + lessons 9 项复用清单

## 1. 周期 6 状态盘点

- 周期 6 评分 97%；9 commit + 8 spec（112 子断言）全 push
- 调研 Top5：
  1. Cesium MCP / WebMCP（browser-agent 模式优先）
  2. OTel 完整接入（OTLP HTTP exporter）
  3. isolated-vm（node-gyp 编译 + fallback）
  4. fflate 替代 pako（5KB vs 45KB）
  5. mem0 长期记忆（自托管 OpenMemory）
- Lessons 9 项复用清单全部纳入本周期设计

## 2. P0（必须本周期完成 1-2 项）

### P0-3 续 CesiumJS WebGPU pipeline 评估 + MCP 集成
- **目的**：评估 CesiumJS 1.123+ WebGPU pipeline（3-6x 帧率提升）；评估 cesium-mcp-bridge 嵌入 Viewer（browser-agent 模式零后端）
- **文件**：`docs/research/cesium-webgpu-mcp.md`（调研结论）
- **验收**：
  - 新增 `tests/specs/cesium-webgpu-detection.cjs`（静态检测代码是否启用 WebGPU 标志）
  - 新增 `tests/specs/mcp-bridge-config.cjs`（检查 .env.example 有无 MCP 配置项）

### P0-4 续 OTLP HTTP exporter（自研 → 接 Jaeger / Tempo）
- **目的**：把周期 6 P1-1 的 `/api/metrics`（Prometheus text）扩展为同时输出 OTLP HTTP JSON；保留 prom 端点（向后兼容）
- **文件**：`server/middleware/metrics.js`（新增 `toOtlpMetrics()`）+ `server/index.js`（新增 `GET /api/otlp/metrics`）
- **验收**：
  - 新增 `tests/specs/otlp-exporter.cjs`（验证 OTLP 格式 + 与 /api/metrics 数据一致性）
  - 现有 `tests/specs/otel-metrics.cjs` 仍 PASS（向后兼容）

## 3. P1（高优先级，至少完成 3 项）

### P1-2 续 isolated-vm 评估 + fallback 设计
- **目的**：评估 isolated-vm（更高安全沙箱）；node-gyp 编译失败时回落到 node:vm + v8 heap snapshot（已有）
- **文件**：`docs/research/isolated-vm-feasibility.md` + `server/agent/sandbox.js`（添加 `engine` 参数）
- **验收**：
  - 新增 `tests/specs/sandbox-engine-select.cjs`（默认 vm + 环境变量切换 iv）
  - 现有 `tests/specs/sandbox-heap-snapshot.cjs` 仍 PASS

### P1-5 mem0 长期记忆（先做 ALS + SQLite prototype）
- **目的**：周期 7+ 自研 prototype；用 AsyncLocalStorage 维护 conversation context；SQLite 存储跨会话 memory
- **文件**：`server/agent/memory.js`（new）+ `server/agent/agent.js`（接入）
- **验收**：
  - 新增 `tests/specs/memory-als-sqlite.cjs`（验证 ALS 隔离 + 跨请求记忆持久化）
  - 新增 `tests/specs/memory-recall.cjs`（验证 recall 检索）

### P1-6 fflate 评估（5KB vs pako 45KB）
- **目的**：评估 fflate 替代 pako（浏览器 bundle 体积优化 40KB）
- **文件**：`docs/research/fflate-feasibility.md`
- **验收**：
  - 新增 `tests/specs/fflate-decompress.cjs`（jsdom + pako/fflate 等价性测试）
  - 现有 `tests/specs/viewstate-browser-decompress.cjs` 仍 PASS

### P1-7 PR review automation 接入
- **目的**：接入 claude-code-action / open-code-review；配置 GitHub Actions 工作流
- **文件**：`.github/workflows/pr-review.yml`（new）
- **验收**：
  - 新增 `tests/specs/pr-review-workflow.cjs`（静态扫描 yml 必备字段）

## 4. P2（中低优先级，按预算允许）

### P2-7 client/src/pages/gis/editor/utils 单元测试（周期 3 P2-3 续）
- **目的**：补 turf 互操作测试（coords / measure / picking / snap / analysis）
- **文件**：`tests/specs/gis-editor-utils.cjs`（合并 9 文件行为测试）
- **验收**：12-15 子断言 PASS

### P2-8 Helmet 8.x 内置 Permissions-Policy 替代手写（周期 6 P2-1 续）
- **目的**：用 `helmet({ permissionsPolicy: {...} })` 替代 `server/index.js` 中手写 20 项
- **文件**：`server/index.js`
- **验收**：现有 `tests/specs/csp-permissions-policy.cjs` 仍 PASS + 新增 `tests/specs/helmet-permissions-policy.cjs`（静态扫描无手写 middleware）

## 5. 调研（12 主题 × 5 链接 = 60 链接）

周期 7 调研方向（与 P0/P1 互补）：

1. CesiumJS WebGPU pipeline 落地细节（fallback、shader 编译、跨平台）
2. Model Context Protocol 2026 spec（MCP transports / stdio / SSE）
3. OTLP 协议规范（resource metrics / scope metrics / point）
4. isolated-vm 安全模型（Isolate / Script / Reference transferability）
5. mem0 自托管（OpenMemory / Postgres + pgvector）
6. fflate API 兼容性（zlib.inflate vs fflate.unzipSync）
7. claude-code-action / open-code-review PR 自动评审
8. CesiumJS 1.123+ WebGPU 兼容性 + fallback WebGL1
9. AsyncLocalStorage 在 Express 中的使用（async_hooks + req context）
10. SQLite FTS5 全文检索（memory recall）
11. node-gyp Windows 编译 isolated-vm 失败兜底
12. AI Agent 长期记忆设计模式（episodic / semantic / procedural）

## 6. 文档产出清单

| 文档 | 必须 | 备注 |
| ---- | ---- | ---- |
| `cycle-07-execution-plan.md` | ✅ | 本文档 |
| `cycle-07-test-report.md` | ✅ | 检查点 + AI 工具探针报告 |
| `cycle-07-bugs.md` | 条件 | 仅在发现新 bug 时 |
| `cycle-07-dev-log.md` | ✅ | 实施记录 |
| `cycle-07-research.md` | ✅ | 12 主题 × 5 链接 = 60 链接 |
| `cycle-07-lessons.md` | ✅ | 经验沉淀（含 9 项复用清单更新） |
| `cycle-07-self-check.md` | ✅ | 自检打点 |
| `state/cycle-state.json` 更新 | ✅ | current_cycle: 7, last_run_status |
| `docs/release-notes/upcoming-work.md` Top5 替换 | ✅ | 周期 7 调研产入 |

## 7. Commit 计划（≤ 12）

| # | 类型 | 主题 | spec 数 |
| - | ---- | ---- | ------- |
| 1 | chore | plan(cycle-07): execution plan + research outline | 0 |
| 2 | feat | p0-3 Cesium WebGPU 检测 + MCP 配置 | 2 |
| 3 | feat | p0-4 OTLP HTTP exporter | 1 |
| 4 | feat | p1-2 isolated-vm 评估 + engine 选择 | 1 |
| 5 | feat | p1-5 mem0 prototype（ALS + SQLite） | 2 |
| 6 | feat | p1-6 fflate 评估（decompress 等价性） | 1 |
| 7 | feat | p1-7 PR review workflow | 1 |
| 8 | feat | p2-7/p2-8 utils 测试 + helmet permissions | 2 |
| 9 | docs | dev-log + research + upcoming-work | 0 |
| 10 | docs | lessons + self-check + state | 0 |

预留 2 个 fix 槽位。

## 8. 风险与回退

- **P0-4 OTLP 协议复杂度**：仅实施 metrics 路径（不做 traces/logs）；如 OTLP 格式不合规，回退到只保留 Prometheus
- **P1-5 mem0 prototype 不完整**：仅 ALS + SQLite 写读，不做 embedding 检索（周期 8+ 评估）
- **P1-2 isolated-vm node-gyp 编译失败**：默认 engine=vm，环境变量切换；不阻塞周期完成
- **P1-7 PR workflow 不实跑**：仅静态扫描 + yml 验证；不真正推到 GitHub

## 9. 周期 7 目标完成度判定

- P0: ≥ 1（P0-4 必做；P0-3 评估文档必出）
- P1: ≥ 4（P1-2 / P1-5 / P1-6 / P1-7 四个评估）
- P2: ≥ 1（P2-7 或 P2-8）
- 调研: 60 链接 + Top5 落 upcoming-work
- 文档: 7 + state + upcoming-work = 9 个文件
- commits: ≤ 12
