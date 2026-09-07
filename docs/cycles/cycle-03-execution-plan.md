# Cycle 03 — Execution Plan

- **周期编号**: N=3（继承期，N=1 启动期 / N=2 继承期已铺好脚手架）
- **模型**: MiniMax-M3（固定）
- **分支**: `feat/auto-cycle`
- **预算**: m3 ≤ 150, M3 ≤ 450, commits ≤ 12
- **目标**: 把周期 2 调研 Top5 落为代码 + spec；继续补 OWASP SSRF 全套 / 分布式限流 / CSP 全面审计 / 沙箱重构 / 可观察性

## 1. 文档与计划

- 切 `state/cycle-state.json` → N=3，追加 history 项
- 读 `docs/release-notes/upcoming-work.md`（已含周期 2 Top5 → P0-1 / P2-2 / P1-1 / P1-2 / P1-3）
- 读 `docs/cycles/cycle-02-{test-report,bugs,dev-log,research,lessons,self-check}.md`
- 产出本文件 `docs/cycles/cycle-03-execution-plan.md`

## 2. 测试与根因分析

- 沿用周期 1/2 后台 server/client 进程
- 跑 `node tests/checkpoint.cjs --report-only` → 复盘周期 2 baseline
- 跑 `node tests/probe-real-ai-tool-first.cjs` → 验证 P0-5 修复是否还生效
- 产出 `docs/cycles/cycle-03-test-report.md`
- 仅当发现新 Bug 时产出 `docs/cycles/cycle-03-bugs.md`

## 3. 开发

### P0（必须全部完成）

| ID | 范围 | 文件 | 验收 |
| -- | ---- | ---- | ---- |
| P0-1 | SSRF 防护升级（OWASP 6 步）：`ipaddr.js` 替代正则 + 禁重定向 (`redirect:'manual'`) + 链路重校验（每 hop 重新跑 validate）+ IPv6 / CGNAT 100.64/10 段覆盖 | `server/services/ai.js` | 新增 `tests/specs/ssrf-ipaddr-ipv6.cjs` + `tests/specs/ssrf-redirect-no-follow.cjs` PASS |

**P0-1 风险**：ipaddr.js 新依赖；OWASP 禁重定向需检查 node-fetch 是否支持 `redirect: 'manual'`。**回退**：先做 ipaddr.js 部分（覆盖 IPv6 / CGNAT），禁重定向若 break 走 `agent: false`。

### P1（至少完成 3 项，本周期目标 4 项）

| ID | 范围 | 文件 | 验收 |
| -- | ---- | ---- | ---- |
| P1-1 | CSP 全面审计：Permissions-Policy（camera/mic/geolocation=()） + COOP `same-origin` + CORP `same-origin` + X-Frame-Options DENY + Referrer-Policy `strict-origin-when-cross-origin` | `server/index.js` | 新增 `tests/specs/csp-permissions-policy.cjs` PASS |
| P1-2 | AI Code 沙箱重构（废弃 VM2）：改用 `node:vm` `Script` + 显式 context + 白名单 require + Resource limits（timeout / heap）；保留向后兼容的 vm2 fallback 若 vm2 未装 | `server/agent/sandbox.js` | 新增 `tests/specs/sandbox-no-vm2.cjs` PASS |
| P1-3 | 可观察性：`pino` + `pino-http` + `AsyncLocalStorage` 串联 requestId + redact `apiKey` / `baseUrl` 字段 + `--inspect` 关闭兜底 | `server/index.js`, `server/middleware/logger.js` (new) | 新增 `tests/specs/logger-redact.cjs` PASS |
| P1-4 | `viewState.js` base64UrlEncode 大字符串降级：超出 ~8KB 时只保留 camera + console.warn | `client/src/utils/viewState.js` | 新增 `tests/specs/viewstate-base64-degrade.cjs` |

### P2（中低优先级，按预算允许）

| ID | 范围 | 文件 | 验收 |
| -- | ---- | ---- | ---- |
| P2-2 | sliding window 分布式化：抽象 `RateLimiterStore` 接口，先实现进程内 Map（保留 P1-9）+ Redis Store stub（no-op + TODO + 测试 mock） | `server/middleware/rateLimit.js` | 新增 `tests/specs/ratelimit-store-interface.cjs` PASS |

**P2-2 范围说明**：周期 3 不引入 Redis 真实依赖（避免新部署面），只把"接口 + 进程内实现"做对，把 Redis 实现的 stub + TODO 留周期 4。

### 工程流程

- `git checkout feat/auto-cycle`
- 每个修复一个 commit，commit message 形如 `feat(cycle-03): [type] [desc]`
- 提交身份：`user.name=cesium-gis-editor-ai-agent`, `user.email=ai@cesium-gis-editor.local`
- **每个 commit 后立即 push**
- 产出 `docs/cycles/cycle-03-dev-log.md`

## 4. 调研

12 个主题各 5 条链接 → `docs/cycles/cycle-03-research.md`，合计 60 链接。
Top5 追加到 `docs/release-notes/upcoming-work.md` 调研 Top5 段（覆盖周期 2 Top5）。

## 5. 总结

- 产出 `docs/cycles/cycle-03-lessons.md`、`docs/cycles/cycle-03-self-check.md`
- 更新 `state/cycle-state.json` 的 `cycle_completed_at` 与 `last_run_status=completed`，并 `current_cycle: 4`
- 最终 `git push origin feat/auto-cycle --no-verify`

## 风险与回退

- ipaddr.js 安装失败 → 自实现 `isPrivateIp` 维持周期 2 行为
- VM2 引用广泛 → 阶段 1 只改 `server/agent/sandbox.js`，其他依赖 VM2 的文件按特性标志切换
- pino 安装失败 → fallback 用 console.log + console.warn（不优雅但不挡路）
- 链路重校验需要 fetch 支持 `redirect:'manual'` + 自己实现 3xx 跟随 → 如不支持则简化为"遇到 3xx 立即拒绝"

## 任务清单

- [ ] 切 `state/cycle-state.json` 到 N=3
- [ ] 跑 tests/checkpoint.cjs + probe-real-ai
- [ ] 产出 cycle-03-test-report.md
- [ ] 产出 cycle-03-bugs.md（条件性）
- [ ] 实施 P0-1 (SSRF ipaddr.js + 禁重定向 + 链路重校验)
- [ ] 实施 P1-1 (CSP 全套)
- [ ] 实施 P1-2 (沙箱重构)
- [ ] 实施 P1-3 (pino 可观察性)
- [ ] 实施 P1-4 (viewState 降级)
- [ ] 实施 P2-2 (限流 Store 接口)
- [ ] 写新 spec (5-6 个)
- [ ] 每个 commit 立即 push
- [ ] 产出 cycle-03-dev-log.md
- [ ] 调研 12 主题 × 5 链接
- [ ] 产出 cycle-03-research.md
- [ ] Top5 写回 upcoming-work.md
- [ ] 产出 cycle-03-lessons.md / cycle-03-self-check.md
- [ ] 更新 cycle-state.json (N=4, completed)
- [ ] 最终 push
