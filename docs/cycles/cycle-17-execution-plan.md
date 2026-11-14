# Cycle 17 Execution Plan

> 周期 17 计划（2026-10-16）
> 总目标：核心工具函数测试覆盖 + 代码质量提升
> 节奏：1h/轮，每轮一个任务

---

## 总览

| 优先级 | ID | 任务 | 来源 | 子断言目标 |
|---|---|---|---|---|
| P1 | P1-1 | viewState.js URL 序列化/反序列化测试 | 代码质量 | ≥ 25 PASS |
| P1 | P1-2 | asyncGuard.js 异步错误处理测试 | 代码质量 | ≥ 20 PASS |
| P1 | P1-3 | sessionKeys.js 会话密钥管理测试 | 代码质量 | ≥ 15 PASS |
| P1 | P1-4 | splatLoader.js + tilesetLoader.js 加载器测试 | 代码质量 | ≥ 20 PASS |

本轮执行 P1-1。其余任务在后续轮次推进。

---

## P1-1 详案：viewState.js URL 序列化/反序列化测试

**背景**：
- viewState.js 是核心工具文件（367 行）
- 负责地图视图状态的 URL 序列化/反序列化
- 支持 v1（base64url）和 v2（压缩 + base64url）两种格式
- 有 URL 长度降级机制（8KB 阈值）
- 当前缺乏完整的单元测试覆盖

**目标**：
1. 验证 base64UrlEncode / base64UrlDecode 基本功能
2. 验证 buildViewStateHash 序列化（含降级逻辑）
3. 验证 readViewStateFromUrl 反序列化
4. 验证 snapshotCamera / applyCameraSnapshot 相机操作
5. 验证压缩/解压逻辑

**修改文件**：
- `tests/specs/viewstate-url-serialization.cjs`（新建）：≥ 25 PASS

**验收**：
- `tests/specs/viewstate-url-serialization.cjs` ≥ 25 PASS
- 覆盖 viewState.js 核心函数

---

## 后续轮次待办

| 轮次 | 优先级 | 任务 |
|---|---|---|
| R2 | P1 | asyncGuard.js 异步错误处理测试 |
| R3 | P1 | sessionKeys.js 会话密钥管理测试 |
| R4 | P1 | splatLoader.js + tilesetLoader.js 加载器测试 |

---

## Commit 计划

本轮 1 个 commit：
1. `test(cycle-17 R1): viewState.js URL serialization tests (P1-1)`
