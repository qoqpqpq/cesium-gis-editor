# Cycle 10 — Bugs（缺陷跟踪）

> **周期**: N=10（2026-09-08）
> **状态**: 本周期 Phase 2 未发现新 bug
> **结论**: 周期 8/9 修复的 C8-B01 / C9-B01 / C9-B02 全部稳定，零回归

## 1. 已知 bug 清单（已修复）

| ID | 标题 | 引入周期 | 修复周期 | 修复 commit |
| --- | ---- | -------- | -------- | ----------- |
| C8-B01 | metricsOtlpHandler 缺失 import | 7 | 8 | `0e2aaf5` |
| C9-B01 | mcpManifest.js handler 双层包裹 | 9 | 8（防御）+ 9（修复） | `0f149e2` |
| C9-B02 | asyncGuard.js removeEventListener 在 window 替换后失效 | 9 | 9 | `cdcb4f2` |

## 2. 周期 10 静态防御

- `tests/specs/server-import-completeness.cjs` (P0-1, 12/12 PASS) —— 持续监控 `app.use / app.get / app.post` 的 handler 都在 destructure，防 C8-B01 复发
- 周期 10 P1-2 asyncGuard 上报 /api/telemetry：新增"异步错误冒泡"通路，让生产环境 unhandledrejection 可观测（不等同于 bug，是把"无声失败"变成"可观测事件"）

## 3. 待观察（未达 bug 阈值）

- sandbox worker 创建开销 628ms（周期 9 P1-2 baseline）—— **周期 10 P1-3 worker pool 优化**
- asyncGuard 捕获后仅 console.error（周期 9 P1-3 baseline）—— **周期 10 P1-2 上报 /api/telemetry**
- helmet 8.x PermissionsPolicy 不输出（周期 8 P2-2 发现 + 周期 9 P2-2 自研 middleware 替代）—— 持续观察 helmet 9.x 是否实现

## 4. 0 个新 bug 解释

- 服务端未重启（延续周期 9 进程）—— 无新启动 bug
- 周期 9 修复的两个 bug（C9-B01 + C9-B02）已落 commit 且 spec PASS —— 无回归
- 周期 9 P0-1 server-import-completeness spec 在 server 启动后能再次验证 destructure 一致性 —— 当前 PASS

**结论**: 周期 10 起步阶段零 bug，可直接进入开发阶段。