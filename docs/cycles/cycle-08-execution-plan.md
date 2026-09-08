# Cycle 08 — Execution Plan（执行计划）

> **周期**: N=8（2026-09-08）
> **目标**: 落地周期 7 调研 Top5 中的 FTS5 + DecompressionStream + MCP 实际接入；继续 memory / sandbox / 协议层演进；推进 P2 系列收尾。
> **模型**: MiniMax-M3
> **预算**: m3 ≤ 150, M3 ≤ 450, commits ≤ 12
> **分支**: `feat/auto-cycle`
> **复用**: 周期 1-7 全部 38+ 老 spec + 9 lessons 复用清单 + cycle-07 self-check 经验

## 1. 周期 7 状态盘点

- 周期 7 评分 97%；7 commit + 8 spec（99 子断言）全 push
- 调研 Top5：
  1. FTS5 全文检索（memory.search 升级 BM25）
  2. DecompressionStream 替代 pako（浏览器原生）
  3. MCP 实际接入（browser-agent 模式）
  4. OTel SDK 替换自研（评估结论：暂不替换）
  5. mem0 向量化（待商业化阶段）
- 周期 7 留的"周期 8+ 优先项"已落 upcoming-work.md P0/P1 段

## 2. P0（必须本周期完成 ≥ 1 项）

### P0-1 SQLite FTS5 全文检索（升级 P1-5 memory.search）
- **目的**：把 `memory.search()` 从 `LIKE '%q%'` 升级为 SQLite FTS5 虚拟表 + `bm25()` 排序；与 LIKE 路径共存（fallback）
- **文件**：`server/agent/memory.js`（新增 `_fts` 虚拟表 + `search()` 切换）+ `tests/specs/memory-fts5.cjs`
- **验收**：
  - 新增 `tests/specs/memory-fts5.cjs` PASS（≥10 子断言）
  - 现有 `tests/specs/memory-als-sqlite.cjs` 仍 PASS（向后兼容）
  - FTS5 不可用时回退 LIKE（不崩溃）

### P0-2 DecompressionStream 浏览器原生解压（升级 P1-3 viewState v2）
- **目的**：客户端 `viewState.js` 优先 `new DecompressionStream('gzip')`，pako 仅做老浏览器兜底
- **文件**：`client/src/utils/viewState.js`（重构 `decompressFromBase64Async`）
- **验收**：
  - 新增 `tests/specs/viewstate-decompression-stream.cjs` PASS（≥8 子断言）
  - 现有 `tests/specs/viewstate-browser-decompress.cjs` 仍 PASS
  - 检测 DecompressionStream 存在 → 用之；不存在 → fallback pako

## 3. P1（高优先级，至少完成 4 项）

### P1-1 MCP 实际接入（browser-agent 模式）
- **目的**：嵌入 `cesium-mcp-bridge` 概念；浏览器侧暴露 `/mcp/manifest` 端点 + 工具注册；为周期 9 真接入 Claude Desktop 做准备
- **文件**：`client/src/pages/gis/mcpManifest.js`（new）+ `client/src/main.jsx`（暴露 `window.mcp`）+ `tests/specs/mcp-manifest.cjs`
- **验收**：
  - 新增 `tests/specs/mcp-manifest.cjs` PASS（≥6 子断言）
  - 现有 `tests/specs/mcp-bridge-config.cjs` 仍 PASS

### P1-2 sandbox 引擎统一（executeSandbox 调度器）
- **目的**：把 `executeInSandbox` / `executeInSandboxWorker` / `executeIsolatedVm` 统一为 `executeSandbox(code, ctx, opts)`；`opts.engine` 自动 fallback
- **文件**：`server/agent/sandbox.js`（新增 `executeSandbox` 调度器）
- **验收**：
  - 新增 `tests/specs/sandbox-execute-dispatch.cjs` PASS（≥8 子断言）
  - 现有 `sandbox-engine-select.cjs` / `sandbox-cpu-watchdog.cjs` / `sandbox-heap-snapshot.cjs` / `sandbox-worker-isolation.cjs` 全 PASS

### P1-3 memory.js ALS 注入 middleware 化
- **目的**：把 `MemoryStore.withContext` 包装为 Express middleware；agent.js 可自动注入 userId
- **文件**：`server/agent/memory.js`（新增 `memoryContextMiddleware`）+ `server/agent/agent.js`（如存在则接入）+ `tests/specs/memory-middleware.cjs`
- **验收**：
  - 新增 `tests/specs/memory-middleware.cjs` PASS（≥6 子断言）

### P1-4 metricsHandler localhost 校验放宽到 RFC1918 + 共享 loopback
- **目的**：除 127.0.0.1/::1 外，docker / k8s 部署常用 10.0.0.0/8 / 172.16.0.0/12 / 192.168.0.0/16；保留外部访问 403；增加配置项 `METRICS_TRUSTED_CIDRS`
- **文件**：`server/middleware/metrics.js`（替换 IP 校验逻辑）
- **验收**：
  - 新增 `tests/specs/metrics-trusted-cidrs.cjs` PASS（≥8 子断言）
  - 现有 `tests/specs/otel-metrics.cjs` / `otlp-exporter.cjs` 仍 PASS

### P1-5 client/src/pages/gis/sandbox.js 与 server/agent/protocol/index.js 同步验证
- **目的**：周期 6 P2-4 把协议共享到 server；浏览器 sandbox.js 仍持独立副本；本周期写同步脚本 `scripts/check-protocol-sync.cjs`，每次 commit 前 CI 验证
- **文件**：`scripts/check-protocol-sync.cjs`（new）+ `tests/specs/protocol-sync-script.cjs`
- **验收**：
  - 新增 `tests/specs/protocol-sync-script.cjs` PASS（≥6 子断言）

## 4. P2（中低优先级，按预算允许）

### P2-1 metrics "/api/otlp/metrics" 接 OTLP collector（评估 spec）
- **目的**：写 spec 验证 OTLP 端点能被 OTLP collector 协议接受（HTTP POST 推 vs GET 拉）
- **文件**：`tests/specs/otlp-push-evaluate.cjs`（new，仅评估）

### P2-2 helmet 8.x 内置 permissionsPolicy 评估再探
- **目的**：周期 7 P2-8 评估"暂不升级"；本周期再核对 helmet 8.x 是否真不支持；如支持则增量评估
- **文件**：`tests/specs/helmet-8-permissionspolicy-recheck.cjs`（new，仅评估）

## 5. 调研（12 主题 × 5 链接 = 60 链接）

周期 8 调研方向（与 P0/P1 互补）：

1. SQLite FTS5 BM25 排序 + 中文分词（周期 8 P0-1 落点）
2. DecompressionStream browser support + streaming gzip
3. Model Context Protocol 2026 浏览器集成 + Claude Desktop
4. helmet 8.x permissionsPolicy API 实测
5. Express middleware ALS 注入最佳实践
6. RFC1918 + 共享 loopback（metrics CIDR 白名单）
7. 代码同步脚本（client/server 协议同步）CI 模式
8. OTLP collector push vs pull 模式选择
9. cesium-mcp-bridge 真实接入教程
10. pako DecompressionStream polyfill 边界（pako gzip vs raw deflate）
11. memory.js SQLite WAL 模式 + 性能基线
12. Express.js 4.x → 5.x 升级路径与 Breaking Changes

## 6. 文档产出清单

| 文档 | 必须 | 备注 |
| ---- | ---- | ---- |
| `cycle-08-execution-plan.md` | ✅ | 本文档 |
| `cycle-08-test-report.md` | ✅ | 检查点 + AI 工具探针报告 |
| `cycle-08-bugs.md` | 条件 | 仅在发现新 bug 时 |
| `cycle-08-dev-log.md` | ✅ | 实施记录 |
| `cycle-08-research.md` | ✅ | 12 主题 × 5 链接 = 60 链接 |
| `cycle-08-lessons.md` | ✅ | 经验沉淀 |
| `cycle-08-self-check.md` | ✅ | 自检打点 |
| `state/cycle-state.json` 更新 | ✅ | current_cycle: 8, last_run_status |
| `docs/release-notes/upcoming-work.md` Top5 替换 | ✅ | 周期 8 调研产入 |

## 7. Commit 计划（≤ 12）

| # | 类型 | 主题 | spec 数 |
| - | ---- | ---- | ------- |
| 1 | chore | plan(cycle-08): execution plan + research outline | 0 |
| 2 | feat | p0-1 memory FTS5 全文检索（升级 P1-5） | 1 |
| 3 | feat | p0-2 viewState DecompressionStream 替代 pako | 1 |
| 4 | feat | p1-1 MCP manifest 浏览器侧暴露 | 1 |
| 5 | feat | p1-2 sandbox executeSandbox 统一调度器 | 1 |
| 6 | feat | p1-3 memory middleware ALS 自动注入 | 1 |
| 7 | feat | p1-4 metrics CIDR 白名单（RFC1918 + 共享 loopback） | 1 |
| 8 | feat | p1-5 protocol 同步验证脚本（client/server） | 1 |
| 9 | feat | p2-1/p2-2 OTLP push + helmet permissionsPolicy 再评估 | 2 |
| 10 | docs | dev-log + research + upcoming-work | 0 |
| 11 | docs | lessons + self-check + state | 0 |

预留 1 个 fix 槽位。

## 8. 风险与回退

- **P0-1 FTS5 与 LIKE 共存**：FTS5 需要 SQLite ≥ 3.9；fallback LIKE 路径保持兼容
- **P0-2 DecompressionStream**：仅 Chrome 80+ / Firefox 113+ / Safari 16.4+；老浏览器继续走 pako
- **P1-2 统一调度器**：必须保证旧调用方（ai.js 等）继续工作；新函数名 `executeSandbox` 不替换旧函数
- **P1-4 CIDR 白名单**：默认仅 localhost；RFC1918 是 trusted，仅当显式配置 `METRICS_TRUSTED_CIDRS=10.0.0.0/8,...` 才放行
- **P1-5 同步脚本**：仅当 client 与 server 副本不一致时返回非零；CI 调用方便

## 9. 周期 8 目标完成度判定

- P0: ≥ 1（FTS5 + DecompressionStream 评估周期 7 Top5 落点）
- P1: ≥ 4（MCP / sandbox 调度 / memory middleware / metrics CIDR / protocol sync）
- P2: ≥ 1（OTLP push 评估 + helmet 再评估）
- 调研: 60 链接 + Top5 落 upcoming-work
- 文档: 7 + state + upcoming-work = 9 个文件
- commits: ≤ 12

## 10. 任务清单

- [x] 切 `state/cycle-state.json` 到 N=8
- [x] 读 `docs/release-notes/upcoming-work.md`
- [x] 读 `docs/cycles/cycle-07-{execution-plan,self-check,lessons}.md`
- [x] 产出 `cycle-08-execution-plan.md`
- [ ] 启动 server/index.js 后台 + client npm run dev 后台
- [ ] 跑 tests/checkpoint.cjs + probe-real-ai
- [ ] 产出 cycle-08-test-report.md + cycle-08-bugs.md（条件性）
- [ ] 实施 P0-1 (memory FTS5)
- [ ] 实施 P0-2 (viewState DecompressionStream)
- [ ] 实施 P1-1 (MCP manifest)
- [ ] 实施 P1-2 (sandbox executeSandbox)
- [ ] 实施 P1-3 (memory middleware)
- [ ] 实施 P1-4 (metrics CIDR)
- [ ] 实施 P1-5 (protocol 同步脚本)
- [ ] 实施 P2-1 + P2-2（评估 spec）
- [ ] 每个 commit 立即 push
- [ ] 产出 cycle-08-dev-log.md
- [ ] 调研 12 主题 × 5 链接
- [ ] 产出 cycle-08-research.md
- [ ] Top5 写回 upcoming-work.md
- [ ] 产出 cycle-08-lessons.md / cycle-08-self-check.md
- [ ] 更新 cycle-state.json (N=8, completed)
- [ ] 最终 push
