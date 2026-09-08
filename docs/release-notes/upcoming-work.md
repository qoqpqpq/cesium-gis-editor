# Upcoming Work（多周期累积池）

> 所有周期按"清除已完成的条目"的方式收敛。
> 顶部为最高优先级 P0，自上而下递减；周期结束后由对应周期把"已交付"项移到 commits 区。

## 周期 7 已交付（2026-09-08）

- ✅ **P0-3** Cesium WebGPU / MCP 评估（不切换 backend，留 spec 待 fork 稳定再合）
- ✅ **P0-4** OTLP HTTP exporter + `/api/otlp/metrics` 端点（接 OTel Collector / Tempo）
- ✅ **P1-2** isolated-vm 引擎选择（`SANDBOX_ENGINE=iv|vm` + `resolveEngine()` + 自动降级）
- ✅ **P1-5** mem0 原型（`server/agent/memory.js` — ALS + better-sqlite3，内存后端 fallback）
- ✅ **P1-6** fflate 评估（结论：不替换 pako，viewState 懒加载成本不抵收益）
- ✅ **P1-7** PR review workflow 骨架（`.github/workflows/pr-review.yml` — baseline + ai-review 占位）
- ✅ **P2-8** helmet 8.x permissionsPolicy 评估 spec

## 调研 Top5（由周期 7 调研产出，落周期 8+；覆盖周期 6 Top5）

> 调研全文见 `docs/cycles/cycle-07-research.md`（12 主题 × 5 链接 = 60 链接）。

| 排名 | 主题 | 行动 | 落点 |
| --- | ---- | ---- | ---- |
| 1 | **FTS5 全文检索**（SQLite 自带 + BM25，~10 行代码替换 LIKE 模糊） | 周期 8 P1：在 `memory.js` 加 `_fts` 虚拟表 + `bm25()` 排序；替代当前 `search()` 的 `LIKE '%q%'` | 升级 P1-5 |
| 2 | **DecompressionStream 替代 pako**（浏览器原生，~45KB → 0KB） | 周期 8 P2：客户端 `viewState.js` 优先 `DecompressionStream`，pako 仅做兜底 | 升级 P1-3 |
| 3 | **MCP 实际接入**（browser-agent 模式，3 分钟跑起来） | 周期 8 P1：嵌入 `cesium-mcp-bridge` + Claude Desktop 配置 | 升级 P0-3 |
| 4 | **OTel SDK 替换自研**（自研 MetricsRegistry 已稳定，OTLP exporter 已加） | 周期 8 P2：评估 `@opentelemetry/sdk-node` + `@opentelemetry/exporter-trace-otlp-http`，与 P0-4 metrics 共存 | 升级 P0-4 |
| 5 | **mem0 向量化（pgvector）**（等商业化阶段） | 周期 9+ 评估：把 SQLite 升级到 Postgres + pgvector，引入 mem0 客户端 | 升级 P1-5 |

## P0（必须下周期完成）

- [ ] **P0-1** SSRF metadata IP 同步：写"从 cloud-metadata.com 自动同步新 IP"脚本 + 季度 cron + spec。文件：`server/services/ssrf-guard.js` + `scripts/sync-metadata-ips.cjs`（new）+ `docs/security/metadata-ips.md` 维护。验收：新增 `tests/specs/metadata-ip-sync.cjs` PASS。
- [ ] **P0-2** 限流算法升级（周期 6 已落 Token Bucket + IETF header + 路由集成；本周期确认无回归即可）

## P1（高优先级，至少完成 3 项）

- [ ] **P1-1** SQLite FTS5 memory 检索：在 `server/agent/memory.js` 加 `_fts` 虚拟表 + `bm25()` 排序。验收：`tests/specs/memory-fts5.cjs` PASS。
- [ ] **P1-2** MCP 实际接入（browser-agent 模式）：嵌入 `cesium-mcp-bridge` 到 Viewer，零后端。验收：浏览器内 `/mcp/manifest` 端点 + 截图验证。
- [ ] **P1-3** DecompressionStream 替代 pako：客户端 `viewState.js` 优先 `new DecompressionStream('gzip')`，pako 仅做老浏览器兜底。验收：`tests/specs/viewstate-decompression-stream.cjs` PASS。
- [ ] **P1-4** 沙箱 heap-snapshot 自动 dump（周期 6 已做 worker.error / cpu_abort / ok finish 三处触发 + 节流 1s + 保留 5 个 LIFO）。验收：现有 `tests/specs/sandbox-heap-snapshot.cjs` PASS。

## P2（中低优先级，按预算与时间允许）

- [ ] **P2-1** helmet 8.x 内置 Permissions-Policy 替代手写 20 项。文件：`server/index.js`。验收：与 `tests/specs/csp-permissions-policy.cjs` 行为一致 + 静态扫描源文件移除手写 middleware。
- [ ] **P2-2** `_sse.js` Last-Event-ID buffer 续传（已完成 by 94c3622）。验收：现有 `tests/specs/sse-last-event-id-buffer.cjs` PASS（不再 0/0）。
- [ ] **P2-3** `client/src/pages/gis/editor/utils/*.js` 中 9 个工具类文件（`coords / measure / picking / snap / analysis / ...`）有 3-4 处与 turf 互操作缺乏单元测试。
- [ ] **P2-4** `client/src/pages/gis/sandbox.js` 与 `server/agent/protocol/parse.js` 协议字符串 `<tool>name(args)</tool>` 重复实现，注释里也提示"修改时务必同步"。需求：把"协议字面 + 解析"统一从 `client/src/pages/gis/protocol.js` 导出，server 用 ESM 风格 require 该模块（或保留双份但加 npm script 同步检查）。
- [ ] **P2-5** `client/src/pages/gis/aiAgent.js` 体积大且无注释（待通读），P2 阶段拆分候选。
- [ ] **P2-6** OTel SDK 评估（接 MetricsRegistry / OTLP exporter）。需求：spike `@opentelemetry/sdk-node` + 自动注入 traceId，文档化决策。
- [ ] **P2-7** mem0 self-host 评估（Postgres + pgvector）。需求：写 `docs/evaluation/mem0-postgres.md`，含 docker-compose 草稿。
- [ ] **P2-8** AI Agent 长期记忆三层架构评估（episodic + semantic + procedural）。需求：写 `docs/evaluation/agent-memory-3layer.md`，对应 `memory.js` 升级路径。
