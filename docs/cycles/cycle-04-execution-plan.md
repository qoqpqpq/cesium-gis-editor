# Cycle 04 — Execution Plan

- **周期编号**: N=4（继承期；周期 1 启动 / 周期 2 继承 / 周期 3 调研落地）
- **模型**: MiniMax-M3（固定）
- **分支**: `feat/auto-cycle`
- **预算**: m3 ≤ 150, M3 ≤ 450, commits ≤ 12
- **目标**: 把周期 3 调研 Top5 落为代码；继续补 OWASP SSRF 6/6 步 / Redis 分布式限流 / 可观察性升级 / 沙箱 Resource limits / lz-string 压缩

## 1. 文档与计划

- 切 `state/cycle-state.json` → N=4，追加 history 项
- 读 `docs/release-notes/upcoming-work.md`（已含周期 3 Top5 → P0-1 / P0-2 / P1-1 / P1-2 / P1-3）
- 读 `docs/cycles/cycle-03-{test-report,bugs,dev-log,research,lessons,self-check}.md`
- 产出本文件 `docs/cycles/cycle-04-execution-plan.md`

## 2. 测试与根因分析

- 跑 `node tests/checkpoint.cjs --report-only` → 复盘周期 3 baseline
- 跑 `node tests/probe-real-ai-tool-first.cjs` → 验证周期 1 P0-5 + 周期 3 P1-1/3 仍生效
- 产出 `docs/cycles/cycle-04-test-report.md` + `docs/cycles/cycle-04-bugs.md`（条件性）

## 3. 开发

### P0（必须全部完成）

| ID | 范围 | 文件 | 验收 |
| -- | ---- | ---- | ---- |
| P0-1 | SSRF 补齐：host header allowlist middleware + 全 metadata IP 黑名单（169.254.169.254/32 + 169.254.170.2 ECS + fd00:ec2::254 IPv6 metadata）+ ssrf-guard 的 pinned IP socket 连接 | `server/index.js`（新增 `validateHostHeader` middleware）, `server/services/ssrf-guard.js`（加 `BLOCKED_HOSTS / BLOCKED_METADATA_IPS` + `safeFetch` 加 pin IP） | 新增 `tests/specs/ssrf-host-allowlist.cjs` + `tests/specs/ssrf-metadata-ipv6.cjs` PASS |

**P0-1 风险**：host allowlist 太严会 break `127.0.0.1` / `localhost` 反向代理场景。**回退**：env `ALLOWED_HOSTS` 可覆盖默认白名单（仅 dev 环境生效）。

### P1（至少完成 3 项，本周期目标 4 项）

| ID | 范围 | 文件 | 验收 |
| -- | ---- | ---- | -------- |
| P1-1 | pino + OpenTelemetry 升级。引入 `pino` + `pino-http` + `@opentelemetry/sdk-node`；logger.js 切 pino（保留 redact + ALS reqId 行为）；Otel SDK 自动 trace fetch / http；W3C `traceparent` 头传递 | `server/middleware/logger.js`（升级）, `server/index.js`（接入 Otel SDK） | 新增 `tests/specs/logger-pino-perf.cjs`（5x 性能 benchmark）+ `tests/specs/otel-traceid.cjs` PASS |

**P1-1 风险**：pino + Otel 是两个新依赖；Otel SDK 需要 OTLP exporter 才能真上报，本周期仅"本地导出到 console"以便验证 traceId 串联。

| ID | 范围 | 文件 | 验收 |
| -- | ---- | ---- | -------- |
| P1-2 | 沙箱升级：worker_threads 隔离 + Resource limits（CPU/mem watchdog）。`server/agent/sandbox.js` 新增 `executeInSandboxWorker(code, ctx, opts)`；主线程通过 `parentPort.postMessage` 异步收发；超时 / CPU 超阈值 → `worker.terminate()` | `server/agent/sandbox.js`（新增 worker 版 API）, `server/agent/sandbox-worker.js`（new, worker 端脚本） | 新增 `tests/specs/sandbox-worker-isolation.cjs` PASS |

**P1-2 风险**：worker_threads 通信有序列化开销；CPU watchdog 精度依赖 `process.cpuUsage()` 采样间隔。**回退**：旧 `executeInSandbox`（vm 版）保留不变；worker 版是可选 API。

| ID | 范围 | 文件 | 验收 |
| -- | ---- | ---- | -------- |
| P1-3 | viewState lz-string 压缩。`lz-string` 是浏览器 + Node 双端库，可在 client/src/utils/viewState.js 加 `compressToEncodedURIComponent` 压缩 payload 再 base64url，省 30-50% 长度 | `client/src/utils/viewState.js`（加 lz-string 压缩）, `client/package.json`（加 lz-string 依赖） | 新增 `tests/specs/viewstate-lzstring.cjs`（mock lz-string 验证压缩 + 解压 round-trip + URL 长度对比）PASS |

**P1-3 风险**：lz-string 不是 MIT 许可（是 WTFPL，宽松但商业需注意）；压缩比例取决于 payload 内容（中文更省，ASCII 较少）。**回退**：缺 lz-string 仍走原 base64 路径。

### P2（中低优先级，按预算允许）

| ID | 范围 | 文件 | 验收 |
| -- | ---- | ---- | ---- |
| P2-1 | helmet 8.x 升级。先 review CHANGELOG + 兼容性测试（Cesium 第三方瓦片 CDN）；原生 Permissions-Policy / COEP | `package.json`, `server/index.js` | 静态扫描 helmet 版本 ≥ 8 + 启动 server 不抛错 |
| P2-2 | `_sse.js` Last-Event-ID buffer 续传（之前 P2-9 提到"周期 4+ 实施"）。`sseStreamHandler` 接受可选 `bufferProvider`；断线时按 Last-Event-ID 续传最近 N 条事件 | `server/routes/_sse.js` | 新增 `tests/specs/sse-last-event-id-buffer.cjs` PASS（mock bufferProvider） |

### 工程流程

- `git checkout feat/auto-cycle`
- 每个修复一个 commit，commit message 形如 `feat(cycle-04): [type] [desc]`
- 提交身份：`user.name=cesium-gis-editor-ai-agent`, `user.email=ai@cesium-gis-editor.local`
- **每个 commit 后立即 push**
- 产出 `docs/cycles/cycle-04-dev-log.md`

## 4. 调研

12 个主题各 5 条链接 → `docs/cycles/cycle-04-research.md`，合计 60 链接。
Top5 追加到 `docs/release-notes/upcoming-work.md` 调研 Top5 段（覆盖周期 3 Top5）。

## 5. 总结

- 产出 `docs/cycles/cycle-04-lessons.md`、`docs/cycles/cycle-04-self-check.md`
- 更新 `state/cycle-state.json` 的 `cycle_completed_at` 与 `last_run_status=completed`，并 `current_cycle: 5`
- 最终 `git push origin feat/auto-cycle --no-verify`

## 风险与回退

- pino / Otel 是两个新依赖 + Otel SDK 需要 OTLP exporter；先"console 导出"验证 traceId 串联
- worker_threads 通信开销：API 调用频率 < 100/min 几乎不可察觉
- lz-string 缺省 fallback 到 base64
- helmet 8.x 升级可能 break Cesium 瓦片 CDN：先 review CHANGELOG，spec 启动 server 后跑一次完整 fetch 验证

## 任务清单

- [ ] 切 `state/cycle-state.json` 到 N=4
- [ ] 跑 tests/checkpoint.cjs + probe-real-ai
- [ ] 产出 cycle-04-test-report.md
- [ ] 产出 cycle-04-bugs.md（条件性）
- [ ] 实施 P0-1 (SSRF host allowlist + 全 metadata IP 黑名单)
- [ ] 实施 P0-2 (Redis 分布式限流 — 升级 stub 为真实 Redis)
- [ ] 实施 P1-1 (pino + Otel)
- [ ] 实施 P1-2 (sandbox worker)
- [ ] 实施 P1-3 (lz-string 压缩)
- [ ] 实施 P2-1 (helmet 8.x 升级)
- [ ] 实施 P2-2 (SSE buffer 续传)
- [ ] 写新 spec (5-6 个)
- [ ] 每个 commit 立即 push
- [ ] 产出 cycle-04-dev-log.md
- [ ] 调研 12 主题 × 5 链接
- [ ] 产出 cycle-04-research.md
- [ ] Top5 写回 upcoming-work.md
- [ ] 产出 cycle-04-lessons.md / cycle-04-self-check.md
- [ ] 更新 cycle-state.json (N=5, completed)
- [ ] 最终 push
