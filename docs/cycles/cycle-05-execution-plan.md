# Cycle 05 — Execution Plan

- **周期编号**: N=5（继承期；周期 1 启动 / 周期 2 继承 / 周期 3 调研落地 / 周期 4 调研落地 Top5）
- **模型**: MiniMax-M3（固定）
- **分支**: `feat/auto-cycle`
- **预算**: m3 ≤ 150, M3 ≤ 450, commits ≤ 12
- **目标**: 把周期 4 调研 Top5 落为代码 + 修复 94c3622 引入的 helmet 8.x 安全头部回归

## 1. 文档与计划

- 切 `state/cycle-state.json` → N=5，追加 history 项
- 读 `docs/release-notes/upcoming-work.md`（已含周期 4 Top5 → P0-1 / P0-2 / P1-1 / P1-2 / P1-3）
- 读 `docs/cycles/cycle-04-{test-report,bugs,dev-log,research,lessons,self-check}.md`
- 产出本文件 `docs/cycles/cycle-05-execution-plan.md`

## 2. 起点发现

> 上一轮后续推进中合并了 `94c3622 feat(cycle-04): helmet 8.x upgrade + SSE Last-Event-ID buffer provider (P2-1, P2-2)`。
>
> 影响：
> - P2-1 helmet 8.x 升级已实施，但**安全头部回归**：周期 3 P1-1 设定的 X-Frame-Options DENY / Referrer-Policy / 手写 Permissions-Policy 在 helmet 8.x 默认行为下被覆写
> - P2-2 SSE Last-Event-ID buffer 续传已实施
>
> 本周期必做修复（相当于 P0 类的安全合规）：
> - 修复 helmet 8.x 与周期 3 P1-1 的兼容（保留 COOP / X-Frame-Options DENY / Referrer-Policy / Permissions-Policy 20 项）
> - 修测试 `tests/specs/helmet-8-upgrade.cjs` 16/20 的 4 个失败用例

## 3. 测试与根因分析

- 跑 `node tests/checkpoint.cjs --report-only` → 复盘周期 4 baseline
- 跑 `node tests/probe-real-ai-tool-first.cjs` → 验证周期 1 P0-5 + 周期 3 P1-1/3 仍生效
- 产出 `docs/cycles/cycle-05-test-report.md` + `docs/cycles/cycle-05-bugs.md`（条件性）

## 4. 开发

### P0（必须全部完成）

| ID | 范围 | 文件 | 验收 |
| -- | ---- | ---- | ---- |
| P0-1 | SSRF 终态：维护 metadata IP 黑名单表（与 IANA 同步），加 ECS task metadata IPv6（`fd00:ec2::253`）；写 `docs/security/metadata-ips.md` 维护文档 | `server/services/ssrf-guard.js` + `docs/security/metadata-ips.md` (new) | 新增 `tests/specs/metadata-ip-maintenance.cjs` PASS |
| P0-2 | 限流分布式 + 多级：Redis Lua atomic（EVAL/EVALSHA 替代 ZADD+ZREM 2 步）+ IP/userId/API key 三级限流 | `server/middleware/redisClient.js`（加 EVAL）+ `server/middleware/rateLimit.js`（加多级）+ `server/middleware/rateLimitStore.js`（Lua 脚本） | 新增 `tests/specs/redis-pipelining.cjs` + `tests/specs/ratelimit-multilevel.cjs` PASS |
| **P0-3** | **修复 helmet 8.x 升级后安全头部回归**：保留 X-Frame-Options DENY / Referrer-Policy / Permissions-Policy 20 项 / COOP same-origin | `server/index.js` | 修复 `tests/specs/helmet-8-upgrade.cjs` 4 个失败用例 + 周期 3 P1-1 `csp-permissions-policy.cjs` 16/16 仍 PASS |

### P1（至少完成 1 项）

| ID | 范围 | 文件 | 验收 |
| -- | ---- | ---- | ---- |
| P1-2 | 沙箱深度隔离：CPU watchdog（worker 端 50ms 采样 process.cpuUsage()，超阈值 → `parentPort.postMessage({event:'cpu_abort'})` → 主线程 worker.terminate） | `server/agent/sandbox.js` + `server/agent/sandbox-worker.js` | 新增 `tests/specs/sandbox-cpu-watchdog.cjs` PASS |

### P2（中低优先级，按预算允许）

| ID | 范围 | 文件 | 验收 |
| -- | ---- | ---- | ---- |
| P2-1 | helmet 8.x 兼容性扩展：HSTS（生产 HTTPS 强制）+ COEP `credentialless`（CDN 兼容） | `server/index.js` | 静态扫描源文件含 hsts 配置 + COEP |

### 工程流程

- `git checkout feat/auto-cycle`
- 每个修复一个 commit，commit message 形如 `feat/fix(cycle-05): [type] [desc]`
- **每个 commit 后立即 push**
- 产出 `docs/cycles/cycle-05-dev-log.md`

## 5. 调研

12 个主题各 5 条链接 → `docs/cycles/cycle-05-research.md`，合计 60 链接。
Top5 追加到 `docs/release-notes/upcoming-work.md` 调研 Top5 段（覆盖周期 4 Top5）。

## 6. 总结

- 产出 `docs/cycles/cycle-05-lessons.md`、`docs/cycles/cycle-05-self-check.md`
- 更新 `state/cycle-state.json` 的 `cycle_completed_at` 与 `last_run_status=completed`，并 `current_cycle: 6`
- 最终 `git push origin feat/auto-cycle --no-verify`

## 风险与回退

- helmet 8.x 安全头部修复：若 helmet 8.x 内置 Permissions-Policy 行为改变，需降级用周期 3 手写方案
- Redis Lua 脚本：EVALSHA 必须保留脚本以缓存 SHA1；调试期先 EVAL 不缓存
- CPU watchdog：进程级 cpuUsage 在多核下不准；先用累计 user+system 时长阈值

## 任务清单

- [x] 切 `state/cycle-state.json` 到 N=5
- [ ] 跑 tests/checkpoint.cjs + probe-real-ai
- [ ] 产出 cycle-05-test-report.md
- [ ] 产出 cycle-05-bugs.md（条件性）
- [ ] 实施 P0-1 (SSRF 终态 + ECS IPv6)
- [ ] 实施 P0-2 (Redis Lua + 多级限流)
- [ ] 实施 P0-3 (helmet 8.x 安全头部修复)
- [ ] 实施 P1-2 (sandbox CPU watchdog)
- [ ] 实施 P2-1 (helmet HSTS + COEP credentialless)
- [ ] 写新 spec (3-4 个)
- [ ] 每个 commit 立即 push
- [ ] 产出 cycle-05-dev-log.md
- [ ] 调研 12 主题 × 5 链接
- [ ] 产出 cycle-05-research.md
- [ ] Top5 写回 upcoming-work.md
- [ ] 产出 cycle-05-lessons.md / cycle-05-self-check.md
- [ ] 更新 cycle-state.json (N=6, completed)
- [ ] 最终 push
