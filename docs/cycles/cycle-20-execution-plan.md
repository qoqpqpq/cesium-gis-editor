# Cycle 20 Execution Plan

> 周期 20 计划（2026-10-16）
> 总目标：服务端路由测试覆盖 + 代码质量提升
> 节奏：1h/轮，每轮一个任务

---

## 总览

| 优先级 | ID | 任务 | 来源 | 子断言目标 |
|---|---|---|---|---|
| P1 | P1-1 | gis.js GIS 路由测试 | 代码质量 | ≥ 15 PASS |
| P1 | P1-2 | telemetry.js 遥测路由测试 | 代码质量 | ≥ 15 PASS |
| P1 | P1-3 | rateLimit.js 速率限制测试 | 代码质量 | ≥ 20 PASS |
| P1 | P1-4 | redisClient.js Redis 客户端测试 | 代码质量 | ≥ 15 PASS |

本轮执行 P1-1。其余任务在后续轮次推进。

---

## P1-1 详案：gis.js GIS 路由测试

**背景**：
- gis.js 是 GIS 相关 API 路由
- 负责处理 GIS 数据导入、查询等操作
- 当前缺乏完整的单元测试覆盖

**目标**：
1. 验证路由注册
2. 验证请求处理
3. 验证错误处理
4. 验证参数解析

**修改文件**：
- `tests/specs/gis-routes.cjs`（新建）：≥ 15 PASS

**验收**：
- `tests/specs/gis-routes.cjs` ≥ 15 PASS
- 覆盖 gis.js 核心函数

---

## 后续轮次待办

| 轮次 | 优先级 | 任务 |
|---|---|---|
| R2 | P1 | telemetry.js 遥测路由测试 |
| R3 | P1 | rateLimit.js 速率限制测试 |
| R4 | P1 | redisClient.js Redis 客户端测试 |

---

## Commit 计划

本轮 1 个 commit：
1. `test(cycle-20 R1): gis.js GIS routes tests (P1-1)`
