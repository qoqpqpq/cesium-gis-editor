# Cycle 21 Execution Plan

> 周期 21 计划（2026-10-16）
> 总目标：Agent 协议测试覆盖 + 代码质量提升
> 节奏：1h/轮，每轮一个任务

---

## 总览

| 优先级 | ID | 任务 | 来源 | 子断言目标 |
|---|---|---|---|---|
| P1 | P1-1 | protocol/format.js 协议格式化测试 | 代码质量 | ≥ 15 PASS |
| P1 | P1-2 | protocol/parse.js 协议解析测试 | 代码质量 | ≥ 15 PASS |
| P1 | P1-3 | protocol/constants.js 协议常量测试 | 代码质量 | ≥ 15 PASS |
| P1 | P1-4 | mcpServers/registry.js MCP 注册表测试 | 代码质量 | ≥ 15 PASS |

本轮执行 P1-1。其余任务在后续轮次推进。

---

## P1-1 详案：protocol/format.js 协议格式化测试

**背景**：
- format.js 是 Agent 协议格式化模块
- 负责将内部数据格式化为协议消息
- 当前缺乏完整的单元测试覆盖

**目标**：
1. 验证格式化函数
2. 验证消息格式
3. 验证错误处理
4. 验证边界情况

**修改文件**：
- `tests/specs/protocol-format.cjs`（新建）：≥ 15 PASS

**验收**：
- `tests/specs/protocol-format.cjs` ≥ 15 PASS
- 覆盖 format.js 核心函数

---

## 后续轮次待办

| 轮次 | 优先级 | 任务 |
|---|---|---|
| R2 | P1 | protocol/parse.js 协议解析测试 |
| R3 | P1 | protocol/constants.js 协议常量测试 |
| R4 | P1 | mcpServers/registry.js MCP 注册表测试 |

---

## Commit 计划

本轮 1 个 commit：
1. `test(cycle-21 R1): protocol/format.js protocol format tests (P1-1)`
