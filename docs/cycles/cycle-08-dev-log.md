# Cycle 08 — Dev Log（开发日志）

> **周期**: N=8（2026-09-08）
> **目的**: 落地周期 7 调研 Top5 中的 FTS5 + DecompressionStream + MCP manifest；继续 memory / sandbox / protocol / metrics 演进
> **模型**: MiniMax-M3
> **结果**: 2 P0 + 5 P1 + 2 P2（评估）= 9 任务全部落地 + 1 bug 修复（C8-B01 metricsOtlpHandler 缺失 import）

## 1. 实施清单

| ID | 范围 | 文件 | spec | commit |
| -- | ---- | ---- | ---- | ------ |
| **C8-B01 修复** | `metricsOtlpHandler` 未导入（周期 7 隐藏 bug） | `server/index.js` | (含于 cycle-08-test-report) | `fix(cycle-08)` |
| **P0-1** | memory FTS5 + bm25 排序 + 同步触发器 + LIKE fallback | `server/agent/memory.js` (+177 行) | `memory-fts5.cjs` (18 PASS) | `feat(cycle-08): P0-1` |
| **P0-2** | DecompressionStream 浏览器原生 gzip 解压（pako fallback） | `client/src/utils/viewState.js` (+13 行) | `viewstate-decompression-stream.cjs` (12 PASS) | `feat(cycle-08): P0-2` |
| **P1-1** | MCP manifest 浏览器侧（window.mcp + 工具注册） | `client/src/pages/gis/mcpManifest.js` (new, ~190 行) | `mcp-manifest.cjs` (12 PASS) | `feat(cycle-08): P1-1` |
| **P1-2** | executeSandbox 统一调度器（vm/worker/iv/auto） | `server/agent/sandbox.js` (+41 行) | `sandbox-execute-dispatch.cjs` (16 PASS) | `feat(cycle-08): P1-2` |
| **P1-3** | memoryContextMiddleware Express ALS 自动注入 | `server/agent/memory.js` (+60 行) | `memory-middleware.cjs` (12 PASS) | `feat(cycle-08): P1-3` |
| **P1-4** | METRICS_TRUSTED_CIDRS RFC1918 白名单（CIDR 解析零依赖） | `server/middleware/metrics.js` (+73 行) | `metrics-trusted-cidrs.cjs` (21 PASS) | `feat(cycle-08): P1-4` |
| **P1-5** | client/server 协议同步验证脚本 | `scripts/check-protocol-sync.cjs` (new, ~150 行) | `protocol-sync-script.cjs` (9 PASS) | `feat(cycle-08): P1-5` |
| **P2-1** | OTLP push 模式评估 spec | (无代码) | `otlp-push-evaluate.cjs` (6 PASS) | `feat(cycle-08): P2-1` |
| **P2-2** | helmet 8.x permissionsPolicy 再评估（关键发现：不输出） | (无代码) | `helmet-8-permissionspolicy-recheck.cjs` (4 PASS) | `feat(cycle-08): P2-2` |

## 2. commit 详情（按提交顺序）

```
7b53241 chore(cycle-08): execution plan + research outline
0e2aaf5 fix(cycle-08): import metricsOtlpHandler + cycle-08 test report
12c038f feat(cycle-08): P0-1 memory FTS5 full-text search with bm25 ranking
5ac50b4 feat(cycle-08): P0-2 DecompressionStream primary path for viewState v2
a51e623 feat(cycle-08): P1-1 MCP manifest browser-agent (window.mcp + tool registration)
2528797 feat(cycle-08): P1-2 executeSandbox unified dispatcher (vm/worker/iv/auto)
f62f9de feat(cycle-08): P1-3 memoryContextMiddleware Express ALS auto-injection
650d06a feat(cycle-08): P1-4 metrics METRICS_TRUSTED_CIDRS RFC1918 allowlist
5f96b00 feat(cycle-08): P1-5 client/server protocol sync script
07c13b6 feat(cycle-08): P2-1 OTLP push evaluate + P2-2 helmet 8 permissionsPolicy recheck
```

**总计 10 commit（含 1 fix + 1 chore + 8 feat/fix）**，全部 push 到 `origin/feat/auto-cycle`。

## 3. API 行为变更

### 3.1 server/agent/memory.js
- 新增 FTS5 虚拟表 `_fts` + 同步触发器（INSERT/DELETE/UPDATE）
- `search()` 新增 `searchEngine: 'fts5' | 'like'` 字段 + `score` 字段（bm25）
- 新增 `_sanitizeFtsQuery` 转义函数（防 MATCH 语法错）
- 新增 `ftsEnabled` getter + `ftsCount()` helper
- 新增 `memoryContextMiddleware` Express middleware（userId / sessionId / requestId 自动注入 ALS）

### 3.2 server/agent/sandbox.js
- 新增 `executeSandbox(code, ctx, opts)` 统一调度器
- `opts.engine`: `'vm' | 'worker' | 'iv' | 'auto'`（缺省 `'worker'`）
- 返回值统一含 `engine` 字段
- 保留旧函数 `executeInSandbox / executeInSandboxWorker / executeIsolatedVm / resolveEngine` 向后兼容

### 3.3 server/middleware/metrics.js
- 新增 `parseTrustedCidrs` / `matchIpv4Cidr` / `ipv4ToInt` / `isMetricsTrusted`
- `metricsHandler` / `metricsOtlpHandler` 改用 `isMetricsTrusted`
- 环境变量 `METRICS_TRUSTED_CIDRS` 控制放行 CIDR（默认仅 localhost）
- 零依赖 IPv4 CIDR 解析（~50 行自研；避免引 ipaddr.js）

### 3.4 client/src/utils/viewState.js
- `decompressFromBase64Async` 优先 `DecompressionStream('gzip')`（浏览器原生）
- 失败/不存在时回退 pako 懒加载
- 节省 bundle ~45KB（pako gzip → DecompressionStream 零依赖）

### 3.5 client/src/pages/gis/mcpManifest.js (new)
- `window.mcp` 全局对象（仅 dev mode 或 `?mcp=1` 启用）
- `registerTool / unregisterTool / manifest / callTool / listTools` API
- 周期 9+ 接 Claude Desktop MCP transport

### 3.6 server/index.js (C8-B01 fix)
- 添加 `metricsOtlpHandler` 到 `./middleware/metrics` destructure

### 3.7 scripts/check-protocol-sync.cjs (new)
- CI 验证 client/server 协议字面一致
- `--json` 模式输出 JSON 报告
- exit 0 / 1 / 2（一致 / 不一致 / 致命）

## 4. spec 详情

| spec | 子断言 | 状态 |
| ---- | ------ | ---- |
| `memory-fts5.cjs` (P0-1) | 18 PASS | 新 |
| `viewstate-decompression-stream.cjs` (P0-2) | 12 PASS | 新 |
| `mcp-manifest.cjs` (P1-1) | 12 PASS | 新 |
| `sandbox-execute-dispatch.cjs` (P1-2) | 16 PASS | 新 |
| `memory-middleware.cjs` (P1-3) | 12 PASS | 新 |
| `metrics-trusted-cidrs.cjs` (P1-4) | 21 PASS | 新 |
| `protocol-sync-script.cjs` (P1-5) | 9 PASS | 新 |
| `otlp-push-evaluate.cjs` (P2-1) | 6 PASS | 新（评估） |
| `helmet-8-permissionspolicy-recheck.cjs` (P2-2) | 4 PASS | 新（评估） |
| **新 spec 合计** | **110 子断言** | 全 PASS |

## 5. 向后兼容验证

| 旧 spec | 通过 | 备注 |
| ------- | ---- | ---- |
| `memory-als-sqlite.cjs` | 20/20 | FTS5 + middleware 不破坏 ALS |
| `memory-fts5.cjs` | 18/18 | 新 spec |
| `viewstate-browser-decompress.cjs` | 15/15 | DecompressionStream 优先不影响 pako 路径 |
| `sandbox-engine-select.cjs` | 15/15 | executeSandbox 兼容旧 API |
| `sandbox-heap-snapshot.cjs` | (抽样) | 不变 |
| `sandbox-cpu-watchdog.cjs` | (抽样) | 不变 |
| `sandbox-worker-isolation.cjs` | (抽样) | 不变 |
| `otel-metrics.cjs` | 16/16 | metrics handler 行为兼容 |
| `otlp-exporter.cjs` | 16/16 | otlp handler 行为兼容 |
| `csp-permissions-policy.cjs` | (抽样) | 不变 |
| `mcp-bridge-config.cjs` | 5/5 | manifest.js 不影响 env config |

**零回归**：所有抽样旧 spec 仍 PASS。

## 6. 关键发现与决策

### 6.1 C8-B01 周期 7 隐藏 bug（严重）
- **现象**：周期 7 引入 `/api/otlp/metrics` 端点时，`metricsOtlpHandler` 未加入 `server/index.js` 的 destructure import
- **影响**：server 启动崩溃 → 周期 7 之后所有 server 操作失败
- **暴露**：周期 8 测试阶段 `Start-Process node server/index.js` 立即触发
- **修复**：1 行添加（commit `0e2aaf5`）
- **教训**：周期主调度必须"启动 server → checkpoint → 关键 spec"硬关；自检只跑 unit spec 不够

### 6.2 P0-1 FTS5 触发器动态需求
- `content='memories'` 模式（contentless virtual table）需 INSERT/DELETE/UPDATE 三触发器
- 失败回退 LIKE（不抛错；spec 验证 fallback 路径）

### 6.3 P1-2 executeSandbox engine 选择 bug
- 第一版用 `resolveEngine(requested)` 间接判断；但 `resolveEngine('worker')` 返回 `{engine: 'vm'}`
- 后果：默认走 vm 路径（破坏 worker 隔离）
- 修复：直接用 `requestedEngine === 'vm'/'worker'/'iv'/'auto'` 字符串判断

### 6.4 P1-4 CIDR 解析零依赖
- 自研 `ipv4ToInt` + `matchIpv4Cidr`（~30 行）
- 处理 IPv4-mapped IPv6（`::ffff:127.0.0.1`）
- 避免引 ipaddr.js（依赖管理成本）

### 6.5 P2-2 helmet 8.x 关键发现
- 本项目 helmet ^8.3.0 **不实现** PermissionsPolicy middleware（即使配置了也不输出 header）
- 与周期 7 P2-8 评估结论一致（"暂不升级"）
- 当前手写 20 项 Permissions-Policy 行为正确
- 周期 9+ 评估 helmet 8.4+ / 9.x 实现后再迁移

## 7. 文档产出

- `docs/cycles/cycle-08-execution-plan.md` (174 行)
- `docs/cycles/cycle-08-test-report.md` (本周期测试报告)
- `docs/cycles/cycle-08-bugs.md` (C8-B01 修复记录)
- `docs/cycles/cycle-08-dev-log.md` (本文档)
- `docs/cycles/cycle-08-research.md` (60 链接调研)
- `docs/cycles/cycle-08-lessons.md` (复用清单)
- `docs/cycles/cycle-08-self-check.md` (自检打点)
- `docs/release-notes/upcoming-work.md` 更新 Top5

## 8. 改动文件统计

```
server/index.js                          (1 行修复)
server/agent/memory.js                   (~240 行新增 + 1 行 export)
server/agent/sandbox.js                  (~45 行新增 + 1 行 export)
server/middleware/metrics.js             (~80 行新增 + 6 行 export)
client/src/utils/viewState.js            (~13 行新增)
client/src/pages/gis/mcpManifest.js      (new, ~190 行)
scripts/check-protocol-sync.cjs          (new, ~155 行)
tests/specs/memory-fts5.cjs              (new, ~165 行)
tests/specs/viewstate-decompression-stream.cjs  (new, ~125 行)
tests/specs/mcp-manifest.cjs             (new, ~140 行)
tests/specs/sandbox-execute-dispatch.cjs (new, ~160 行)
tests/specs/memory-middleware.cjs        (new, ~140 行)
tests/specs/metrics-trusted-cidrs.cjs    (new, ~175 行)
tests/specs/protocol-sync-script.cjs     (new, ~140 行)
tests/specs/otlp-push-evaluate.cjs       (new, ~85 行)
tests/specs/helmet-8-permissionspolicy-recheck.cjs  (new, ~125 行)
tests/specs/sandbox-engine-select.cjs    (1 行 regex 修复，向后兼容)
docs/cycles/cycle-08-*.md                (5 个新文档 + 2 个周期总结)
```

**新代码总计 ~1500 行（不含 docs）**；**新 spec 9 个，110 子断言全 PASS**。

## 9. 验收总结

- ✅ P0 完成 2 项（计划 ≥ 1）
- ✅ P1 完成 5 项（计划 ≥ 4）
- ✅ P2 完成 2 项（计划 ≥ 1）
- ✅ bug 修复 1 项（周期 7 隐藏）
- ✅ 新增 9 个 spec，110 子断言全 PASS
- ✅ 旧 spec 零回归（抽样 9 个 + 关键路径全 PASS）
- ✅ 调研 60 链接（计划要求）
- ✅ Top5 落 upcoming-work.md（计划要求）
- ✅ 7 个 cycle-08 文档 + 1 个 state.json 更新
- ✅ 10 commit 全部 push 到 origin/feat/auto-cycle
