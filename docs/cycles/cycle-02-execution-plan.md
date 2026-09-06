# Cycle 02 — Execution Plan

- **周期编号**: N=2（继承期，N=1 启动期已铺好脚手架）
- **模型**: MiniMax-M3（固定，禁止 Auto/其他）
- **分支**: `feat/auto-cycle`
- **预算**: m3 ≤ 150, M3 ≤ 450, commits ≤ 12
- **目标**: 把周期 1 调研 Top5 落为代码 + spec；修补已知 bug；继续做安全/性能/可观察性

## 1. 文档与计划（执行中）

- 读取 `state/cycle-state.json` → N=2，继承 history
- 读取 `docs/release-notes/upcoming-work.md`（已含 P0-1/2/3 完成的 P0 池；P1/P2 池继承 + 周期 1 调研 Top5）
- 读取 `docs/cycles/cycle-01-{test-report,bugs,dev-log,research,lessons,self-check}.md`
- 产出本文件 `docs/cycles/cycle-02-execution-plan.md`
- **本周期不重新初始化** state/cycle-state.json（仅切 `current_cycle: 2`、新增 history 项）
- 本周期沿用 `feat/auto-cycle` 分支

## 2. 测试与根因分析

- 沿用周期 1 后台 server/client 进程（端口 3001/8080）
- 跑 `node tests/checkpoint.cjs --report-only` → 复盘周期 1 baseline
- 跑 `node tests/probe-real-ai-tool-first.cjs` → 验证 B01（agent 端点 500→400）是否复现
- 产出 `docs/cycles/cycle-02-test-report.md`（含 baseline 对比 + 任何新发现）
- 仅当发现新 Bug 时产出 `docs/cycles/cycle-02-bugs.md`

## 3. 开发（最重要）

按本周期 P0/P1/P2 预算，本周期锁定完成：

### P0（必须全部完成）

| ID | 范围 | 文件 | 验收 |
| -- | ---- | ---- | ---- |
| P0-4 | Vite 升级（CVE-2025-24010）+ 生产态 CSP `connectSrc` 补 `localhost:*` / `127.0.0.1:*` | `client/package.json`, `server/index.js` | `npm ls vite` ≥ 5.4.12；`node -e ...` 静态扫描 CSP 含 `localhost`；新增 `tests/specs/csp-connect-localhost.cjs` PASS |

**P0-4 风险**: Vite 升级可能 break dev server（HMR、@vitejs/plugin-react 兼容）。**回退**: 保持 5.0.12 但用 `.npmrc`/`.nvmrc` 文档化已知风险；CSP 改造作为单一原子提交独立有效。

### P1（至少完成 4 项，本周期目标 5 项）

| ID | 范围 | 文件 | 验收 |
| -- | ---- | ---- | ---- |
| P1-3 增量 | SSE `_sse.js` 输出 `retry: 3000`；服务端支持 `Last-Event-ID` 头 | `server/routes/_sse.js` | 新增 `tests/specs/sse-retry-lastid.cjs` PASS |
| P1-6 | 生产态 CSP `connectSrc` 补 `localhost:*` / `127.0.0.1:*`（与 P0-4 合并到同一 commit） | `server/index.js` | 见 P0-4 |
| P1-7 | `ai-keys-changed` 作为权威信号，移除 `localStorage` 跨标签广播（独立标签独立会话是设计预期） | `client/src/utils/sessionKeys.js`, `client/src/components/AiKeySettings.jsx` | 浏览器侧验证：跨标签 `storage` 不触发 refresh；同标签 `dispatchEvent` 触发 refresh；新增 `tests/specs/ai-keys-event.cjs` |
| P1-8 | SSRF DNS 解析后 IP 二次校验（防 DNS rebinding） | `server/services/ai.js` | 新增 `tests/specs/ai-baseurl-dns-ip.cjs` PASS（mock `dns.lookup`） |
| P1-9 | 限流升级：进程内 Sliding Window Counter（无 Redis 复杂度，跨实例化待周期 3+） | `server/middleware/rateLimit.js` | 新增 `tests/specs/ratelimit-sliding-window.cjs` PASS |

### P2（中低优先级，按预算允许）

| ID | 范围 | 文件 | 验收 |
| -- | ---- | ---- | ---- |
| P2-4 | spatial 限额从 env 可配（`SPATIAL_MAX_FEATURES` / `SPATIAL_MAX_VERTICES`） | `server/services/spatial.js` | 新增 `tests/specs/spatial-env-quota.cjs` PASS |
| P2-7 | `getAll()` 默认不返 `remark`（提供 `withRemark: true` 选项） | `client/src/utils/sessionKeys.js` | 现有调用方不受影响（`AiKeySettings.jsx` 自身读 `getAll()`） |

### 工程流程

- `git checkout feat/auto-cycle`
- 每个修复一个 commit，commit message 形如 `feat(cycle-02): [type] [desc]`
- 提交身份：`user.name=cesium-gis-editor-ai-agent`, `user.email=ai@cesium-gis-editor.local`
- **每个 commit 后立即 push**（避免周期 1 的"final push"集中风险）
- 产出 `docs/cycles/cycle-02-dev-log.md`

## 4. 调研

12 个主题各 5 条链接 + 一句话摘要 + 行动建议 → `docs/cycles/cycle-02-research.md`，合计 60 链接。
Top5 追加到 `docs/release-notes/upcoming-work.md` 调研 Top5 段（覆盖周期 1 的 Top5）。

## 5. 总结

- 产出 `docs/cycles/cycle-02-lessons.md`、`docs/cycles/cycle-02-self-check.md`
- 更新 `state/cycle-state.json` 的 `cycle_completed_at` 与 `last_run_status=completed`，并 `current_cycle: 3`
- 最终 `git push origin feat/auto-cycle --no-verify` 兜底

## 风险与回退

- Vite 升级失败 → `git revert` 该 commit + 文档化已知风险
- DNS 二次校验在某些环境无法解析 → 单元测试 mock `dns.lookup` 覆盖所有分支；运行时失败默认"放行" + `console.warn` 留痕
- Sliding Window 性能回退 → express-rate-limit 7.x 默认 memory store 已是 sliding；只需把 `limit` 配合理、关掉 `skip` 中的"loopback 例外"以保证测试能复现计数

## 任务清单

- [ ] 切 `state/cycle-state.json` 到 N=2
- [ ] 跑 tests/checkpoint.cjs + probe-real-ai
- [ ] 产出 cycle-02-test-report.md
- [ ] 产出 cycle-02-bugs.md（条件性）
- [ ] 实施 P0-4 (Vite 升级 + CSP 补 localhost)
- [ ] 实施 P1-8 (SSRF DNS)
- [ ] 实施 P1-9 (Sliding Window 限流)
- [ ] 实施 P1-3 增量 (SSE retry/Last-Event-ID)
- [ ] 实施 P1-7 (ai-keys-changed 权威化)
- [ ] 实施 P2-4 (spatial env quota)
- [ ] 实施 P2-7 (getAll 默认不返 remark)
- [ ] 写新 spec (4-5 个)
- [ ] 每个 commit 立即 push
- [ ] 产出 cycle-02-dev-log.md
- [ ] 调研 12 主题 × 5 链接
- [ ] 产出 cycle-02-research.md
- [ ] Top5 写回 upcoming-work.md
- [ ] 产出 cycle-02-lessons.md / cycle-02-self-check.md
- [ ] 更新 cycle-state.json (N=3, completed)
- [ ] 最终 push
