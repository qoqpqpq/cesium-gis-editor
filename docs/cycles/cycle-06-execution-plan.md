# Cycle 06 — Execution Plan

- **周期编号**: N=6（继承期；周期 5 完成 P0(3) + P1(1) + 调研 Top5 → 本周期升级）
- **模型**: MiniMax-M3（固定）
- **分支**: `feat/auto-cycle`
- **预算**: m3 ≤ 150, M3 ≤ 450, commits ≤ 12
- **目标**: 落周期 5 调研 Top5 续作 + 工具协议统一 + P2 系列收尾

## 1. 文档与计划

- 切 `state/cycle-state.json` → N=6，追加 history 项
- 读 `docs/release-notes/upcoming-work.md`（已含周期 5 P0-1/P0-2 续 + P1-1/P1-2/P1-3 升级 + P2-3/4/5）
- 读 `docs/cycles/cycle-05-{test-report,bugs,dev-log,research,lessons,self-check}.md`
- 产出本文件 `docs/cycles/cycle-06-execution-plan.md`

## 2. 起点发现

> 周期 5 完成 P0-1（SSRF 终态 + ECS IPv6）/ P0-2（Redis Lua atomic + multi-level）/ P0-3（helmet 8.x 修复） + P1-2（CPU watchdog）。
>
> 周期 5 调研 Top5 落 upcoming-work 后，本周期 5 项全部需要"升级 / 续作"：
>
> | Top | 周期 5 已做 | 本周期要做 |
> | --- | --- | --- |
> | 1. SSRF metadata IP 同步 | 写 `docs/security/metadata-ips.md` 维护文档 + spec | **P0-1 续**：写 `scripts/sync-metadata-ips.cjs` 自动同步脚本（解析 cloud metadata docs 与 IANA 段） + 接 npm script |
> | 2. 限流 Token Bucket + 标准 header | Lua atomic + multi-level（IP/userId/apikey） | **P0-2 续**：Token Bucket 算法（AI 端点 burst 友好）+ IETF `RateLimit-*` 标准 header（去 `X-` 前缀） |
> | 3. Otel SDK | 仅 W3C trace（手写） | **P1-1**：Metrics 暴露（http_requests_total / http_request_duration_seconds）+ 兼容已有 traceparent |
> | 4. 沙箱 isolated-vm / heap snapshot | CPU watchdog | **P1-2 续**：v8 heap snapshot 自动 dump（worker 异常退出 / CPU 超限 / heap 超限时） |
> | 5. DecompressionStream polyfill | 未做 | **P1-3**：客户端 `viewState.js` v2 解压加 pako / fflate 降级（Node 端 zlib 同源，浏览器端 pako 解压 v2 字段） |
>
> 周期 5 调研 Top5 之外，本周期合并 P2-4（protocol.js 共享模块）与 P2-6（OpenAI tool_calls 双格式）。

## 3. 测试与根因分析

- 跑 `node tests/checkpoint.cjs --report-only` → 复盘周期 5 baseline
- 跑 `node tests/probe-real-ai-tool-first.cjs` → 验证 /api/ai/agent 契约
- 抽 5 个核心 spec：helmet-8-upgrade / metadata-ip-maintenance / redis-pipelining / sandbox-cpu-watchdog / otel-traceid
- 产出 `docs/cycles/cycle-06-test-report.md` + `docs/cycles/cycle-06-bugs.md`（条件性）

## 4. 开发

### P0（必须全部完成）

| ID | 范围 | 文件 | 验收 |
| -- | ---- | ---- | ---- |
| **P0-1 续** | `scripts/sync-metadata-ips.cjs` 自动同步脚本：从 `docs/security/metadata-ips.md` 解析 + 校验 + 输出 diff（不修改文件仅打印） | `scripts/sync-metadata-ips.cjs` (new) | 新增 `tests/specs/metadata-ip-sync-script.cjs` PASS |
| **P0-2 续** | Token Bucket 算法（AI 端点）+ IETF `RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset` 标准 header（替换 `X-` 前缀） | `server/middleware/rateLimit.js` + `server/middleware/rateLimitStore.js` | 新增 `tests/specs/ratelimit-token-bucket.cjs` + `tests/specs/ratelimit-standard-headers.cjs` PASS |

### P1（至少完成 4 项）

| ID | 范围 | 文件 | 验收 |
| -- | ---- | ---- | ---- |
| **P1-1** | Otel-style Metrics：`http_requests_total` + `http_request_duration_seconds` + `/api/metrics` 端点（Prometheus 文本格式） | `server/middleware/metrics.js` (new) + `server/index.js` | 新增 `tests/specs/otel-metrics.cjs` PASS |
| **P1-2 续** | v8 heap snapshot 自动 dump：worker 异常退出 / CPU 超限 / heap 超限时触发 `writeHeapSnapshot()` | `server/agent/sandbox.js` + `server/agent/sandbox-worker.js` | 新增 `tests/specs/sandbox-heap-snapshot.cjs` PASS |
| **P1-3** | 客户端 `viewState.js` v2 解压加 pako 降级（保持 Node zlib 端不变） | `client/src/utils/viewState.js` | 新增 `tests/specs/viewstate-browser-decompress.cjs`（jsdom） PASS |
| **P1-4 续** | `multiLevelLimiter` 接入 `routes/ai.js` 与 `routes/gis.js`（限流维度在路由侧落实） | `server/middleware/rateLimit.js`（expose new helper） + `server/routes/ai.js` + `server/routes/gis.js` | 新增 `tests/specs/ratelimit-routes-integration.cjs` PASS |

### P2（中低优先级，按预算允许）

| ID | 范围 | 文件 | 验收 |
| -- | ---- | ---- | ---- |
| **P2-4** | 把 `<tool>name(args)</tool>` 协议字符串统一到 `server/agent/protocol/index.js`（合并 parse.js + format.js 共享常量） | `server/agent/protocol/parse.js` + `server/agent/protocol/format.js` | 新增 `tests/specs/protocol-shared.cjs` PASS |
| **P2-6** | OpenAI `tool_calls[]` 双格式（与 `<tool>` 协议共存）：解析器同时识别两种输出 | `server/agent/protocol/parse.js` | 合并到 P2-4 spec |

### 工程流程

- `git checkout feat/auto-cycle`
- 每个修复一个 commit，commit message 形如 `feat/fix(cycle-06): [type] [desc]`
- **每个 commit 后立即 push**
- 产出 `docs/cycles/cycle-06-dev-log.md`

## 5. 调研

12 个主题各 5 条链接 → `docs/cycles/cycle-06-research.md`，合计 60 链接。
Top5 追加到 `docs/release-notes/upcoming-work.md` 调研 Top5 段（覆盖周期 5 Top5）。

## 6. 总结

- 产出 `docs/cycles/cycle-06-lessons.md`、`docs/cycles/cycle-06-self-check.md`
- 更新 `state/cycle-state.json` 的 `cycle_completed_at` 与 `last_run_status=completed`，并 `current_cycle: 7`
- 最终 `git push origin feat/auto-cycle --no-verify`

## 风险与回退

- Token Bucket：burst 大小设计需平衡 UX（允许瞬时突发）与安全（防 abuse）；本期先固定 burst = limit
- 标准 header：旧客户端可能依赖 `X-RateLimit-*`，本期 dual-write（同时写新旧两套）保证兼容
- Otel Metrics：纯自研（不用 OTLP exporter），输出 Prometheus 文本 → 后续周期可接 Otel collector
- heap snapshot：dump 1-2MB 文件，频繁触发会撑爆磁盘，加 1s 节流 + 保留最近 5 个

## 任务清单

- [x] 切 `state/cycle-state.json` 到 N=6
- [x] 跑 tests/checkpoint.cjs + probe-real-ai
- [x] 产出 cycle-06-execution-plan.md
- [ ] 产出 cycle-06-test-report.md
- [ ] 产出 cycle-06-bugs.md（条件性）
- [ ] 实施 P0-1 续 (metadata IP sync script)
- [ ] 实施 P0-2 续 (Token Bucket + IETF standard header)
- [ ] 实施 P1-1 (Otel-style Metrics + /api/metrics)
- [ ] 实施 P1-2 续 (v8 heap snapshot 自动 dump)
- [ ] 实施 P1-3 (客户端 viewState pako 降级)
- [ ] 实施 P1-4 续 (multiLevelLimiter routes 接入)
- [ ] 实施 P2-4 + P2-6 (protocol 共享 + OpenAI tool_calls)
- [ ] 写新 spec (6-7 个)
- [ ] 每个 commit 立即 push
- [ ] 产出 cycle-06-dev-log.md
- [ ] 调研 12 主题 × 5 链接
- [ ] 产出 cycle-06-research.md
- [ ] Top5 写回 upcoming-work.md
- [ ] 产出 cycle-06-lessons.md / cycle-06-self-check.md
- [ ] 更新 cycle-state.json (N=7, completed)
- [ ] 最终 push
