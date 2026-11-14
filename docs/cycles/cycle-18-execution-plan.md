# Cycle 18 Execution Plan

> 周期 18 计划（2026-10-16）
> 总目标：核心工具函数测试覆盖 + 代码质量提升
> 节奏：1h/轮，每轮一个任务

---

## 总览

| 优先级 | ID | 任务 | 来源 | 子断言目标 |
|---|---|---|---|---|
| P1 | P1-1 | sandbox.js 代码沙箱 + 工具解析测试 | 代码质量 | ≥ 30 PASS |
| P1 | P1-2 | aiTools.js AI 工具执行测试 | 代码质量 | ≥ 25 PASS |
| P1 | P1-3 | aiContext.js AI 上下文管理测试 | 代码质量 | ≥ 20 PASS |
| P1 | P1-4 | mcpManifest.js MCP 工具清单测试 | 代码质量 | ≥ 20 PASS |

本轮执行 P1-1。其余任务在后续轮次推进。

---

## P1-1 详案：sandbox.js 代码沙箱 + 工具解析测试

**背景**：
- sandbox.js 是核心工具文件（435 行）
- 负责 Cesium 代码沙箱执行 + AI 工具标签解析 + 代码块解析
- 当前缺乏完整的单元测试覆盖

**目标**：
1. 验证 executeCesiumCode 基本功能（静态扫描）
2. 验证 parseCodeBlocks 代码块解析
3. 验证 parseToolTags 工具标签解析
4. 验证 messageToSegmentsFull 消息分段
5. 验证裸代码启发式识别

**修改文件**：
- `tests/specs/sandbox-code-execution.cjs`（新建）：≥ 30 PASS

**验收**：
- `tests/specs/sandbox-code-execution.cjs` ≥ 30 PASS
- 覆盖 sandbox.js 核心函数

---

## 后续轮次待办

| 轮次 | 优先级 | 任务 |
|---|---|---|
| R2 | P1 | aiTools.js AI 工具执行测试 |
| R3 | P1 | aiContext.js AI 上下文管理测试 |
| R4 | P1 | mcpManifest.js MCP 工具清单测试 |

---

## Commit 计划

本轮 1 个 commit：
1. `test(cycle-18 R1): sandbox.js code execution + tool parsing tests (P1-1)`
