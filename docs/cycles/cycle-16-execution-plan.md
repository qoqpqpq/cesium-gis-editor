# Cycle 16 Execution Plan

> 周期 16 计划（2026-10-15）
> 总目标：清理周期 15 遗留 P2 项 + 技术债务偿还
> 节奏：1h/轮，每轮一个任务

---

## 总览

| 优先级 | ID | 任务 | 来源 | 子断言目标 |
|---|---|---|---|---|
| P2 | P2-1 | `client/src/pages/gis/editor/utils/*.js` 中 9 个工具类文件与 turf 互操作缺乏单元测试 | 周期 15 遗留 | ≥ 25 PASS |
| P2 | P2-2 | `client/src/pages/gis/sandbox.js` 与 `server/agent/protocol/parse.js` 协议字符串重复实现 → 统一从 protocol.js 导出 + npm script 同步检查 | 周期 15 遗留 | ≥ 20 PASS |
| P2 | P2-3 | `client/src/pages/gis/aiAgent.js` 体积大且无注释（待通读），P2 阶段拆分候选 | 周期 15 遗留 | 分析 + 拆分方案 |
| P2 | P2-4 | 限流算法无回归验证（周期 6 已落 Token Bucket；确认 checkpoint 零回归） | 周期 15 遗留 | ≥ 15 PASS |

本轮执行 P2-1。其余 P2 任务在后续轮次推进。

---

## P2-1 详案：editor/utils 工具类文件与 turf 互操作单元测试

**背景**：
- `client/src/pages/gis/editor/utils/` 目录下有 9 个工具类文件
- 这些文件与 @turf/turf 有互操作（转换/验证/计算）
- 当前缺乏单元测试覆盖

**目标**：
1. 分析 9 个工具类文件的导出函数
2. 编写单元测试覆盖核心功能
3. 验证与 turf 的互操作正确性

**修改文件**：
- `tests/specs/editor-utils-turf.cjs`（新建）：≥ 25 PASS

**验收**：
- `tests/specs/editor-utils-turf.cjs` ≥ 25 PASS
- 覆盖 9 个工具类文件的核心功能
- 验证与 turf 的互操作正确性

---

## 后续轮次待办

| 轮次 | 优先级 | 任务 |
|---|---|---|
| R2 | P2 | sandbox.js 与 protocol/parse.js 协议字符串统一 |
| R3 | P2 | aiAgent.js 通读 + 拆分方案 |
| R4 | P2 | 限流算法回归验证 |

---

## Commit 计划

本轮 1 个 commit：
1. `test(cycle-16 R1): editor/utils turf integration tests (P2-1)`
