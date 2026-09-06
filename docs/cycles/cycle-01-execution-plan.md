# Cycle 01 — Execution Plan

- **周期编号**: N=1（启动期）
- **模型**: MiniMax-M3（固定，禁止 Auto/其他）
- **分支**: `feat/auto-cycle`
- **预算**: m3 ≤ 150, M3 ≤ 450, commits ≤ 12
- **目标**: 把缺失的"自动化周期基础设施"补齐，跑通 P0 + 至少 4 个 P1，并为 P2 做预算留白

## 1. 文档与计划（已完成）

- 读取 `state/cycle-state.json`（本周期由我们初始化为 `current_cycle: 1`）
- 读取 `docs/release-notes/upcoming-work.md`（初始化）
- 读取上周期 `cycle-{N-1}-self-check.md` / `cycle-{N-1}-lessons.md`：不存在，作为启动期标记
- 产出本文件 `docs/cycles/cycle-01-execution-plan.md`

## 2. 测试与根因分析

- 启动 `server/index.js`（后台）→ 端口 3001
- 启动 `client npm run dev`（后台）→ 端口 8080
- 跑 `node tests/checkpoint.cjs --report-only` → 仅打印报告，不失败中断
- 跑 `node tests/probe-real-ai-tool-first.cjs` → 验证 `/api/ai/agent` 端点对非法 body 的行为
- 产出 `docs/cycles/cycle-01-test-report.md`（含根因）
- 仅当发现新 Bug 时产出 `docs/cycles/cycle-01-bugs.md`

## 3. 开发（最重要）

按本周期 P0/P1 预算，本周期锁定完成：

### P0（必须全部完成）

| ID | 范围 | 文件 | 验收 |
| -- | ---- | ---- | ---- |
| P0-1 | spatial `dissolve` 端点允许只传 `layerA` | `server/routes/spatial.js`, `server/services/spatial.js` | 新增 `tests/specs/spatial-dissolve-single-layer.cjs` PASS |
| P0-2 | 限流仅放行 loopback | `server/middleware/rateLimit.js` | 新增 `tests/specs/ratelimit-skip-cidr.cjs` PASS |
| P0-3 | AI baseUrl https-only（Ollama 例外） | `server/services/ai.js` | 新增 `tests/specs/ai-baseurl-https-only.cjs` PASS |

### P1（至少完成 4 项，本周期目标 4 项）

| ID | 范围 | 文件 | 验收 |
| -- | ---- | ---- | ---- |
| P1-2 | spatial 端点 15s 超时 | `client/src/api/index.js` | 单元自检文档 + smoke test |
| P1-3 | SSE 流式公共封装 | `server/routes/ai.js`, 新增 `server/routes/_sse.js` | 已有 chat/stream 与 agent 行为不变 |
| P1-4 | `parseToolTags` id 用 UUID | `server/agent/protocol/parse.js` | 新增 `tests/specs/agent-parse-tool-uuid.cjs` PASS |
| P1-5 | `EditorErrorFallback` 用前缀清空 | `client/src/components/EditorErrorFallback.jsx` | 新增 `tests/specs/editor-fallback-clear.cjs` PASS |

P1-1 / P1-6 / P1-7 留到周期 2。

### 工程流程

- `git checkout feat/auto-cycle`
- 每个修复一个 commit，commit message 形如 `feat(cycle-01): [type] [desc]`
- 提交身份：`user.name=cesium-gis-editor-ai-agent`, `user.email=ai@cesium-gis-editor.local`
- 提交后 `git push origin feat/auto-cycle --no-verify`
- 产出 `docs/cycles/cycle-01-dev-log.md`

## 4. 调研

12 个主题各 5 条链接 + 一句话摘要 + 行动建议 → `docs/cycles/cycle-01-research.md`，合计 60 链接。
Top5 追加到 `docs/release-notes/upcoming-work.md` 调研 Top5 段。

## 5. 总结

- 产出 `docs/cycles/cycle-01-lessons.md`、`docs/cycles/cycle-01-self-check.md`
- 更新 `state/cycle-state.json` 的 `cycle_completed_at` 与 `last_run_status=completed`
- 若遗漏推送，最终 `git push origin feat/auto-cycle --no-verify`

## 风险与回退

- 远端 push 受网络/凭据限制时，本地分支与 commit 仍保留，下个周期重试推送
- 任何写文件校验失败（Read 工具重读内容与写入内容不一致）→ 立即停止后续 commit 并在 lessons 记录
- 测试若发现关键路径（health / spatial 简单 op）失败 → 优先修复 P0 → P1

## 任务清单

- [x] 初始化 state/cycle-state.json
- [x] 初始化 docs/release-notes/upcoming-work.md
- [x] 产出 cycle-01-execution-plan.md
- [ ] 跑 tests/checkpoint.cjs --report-only
- [ ] 跑 tests/probe-real-ai-tool-first.cjs
- [ ] 产出 cycle-01-test-report.md
- [ ] 产出 cycle-01-bugs.md（条件性）
- [ ] 实施 P0-1 / P0-2 / P0-3
- [ ] 实施 P1-2 / P1-3 / P1-4 / P1-5
- [ ] 写新 spec
- [ ] git commit & push
- [ ] 产出 cycle-01-dev-log.md
- [ ] 调研 12 主题 × 5 链接
- [ ] 产出 cycle-01-research.md
- [ ] Top5 写回 upcoming-work.md
- [ ] 产出 cycle-01-lessons.md / cycle-01-self-check.md
- [ ] 更新 cycle-state.json
- [ ] 最终 push
