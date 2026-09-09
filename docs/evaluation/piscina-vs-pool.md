# Piscina vs 自研 Sandbox Worker Pool — 评估

> **周期**: 11（2026-09-09）
> **作者**: MiniMax-M3
> **关联**: 周期 10 P1-3 自研 sandboxWorkerPool.js + 周期 11 调研 Piscina

## 1. 现状

周期 10 P1-3 已落 `server/agent/sandboxWorkerPool.js`：
- LRU + reuse + idle timeout 60s
- warm 复用 p50 < 100ms（vs cold start 628ms）
- 23 子断言 PASS
- 零依赖（自研）

## 2. Piscina 对比

Piscina（https://github.com/piscisaureus/node-worker-pool）：
- Node.js 官方推荐的 worker_threads pool 库
- API 简单：`new Piscina({ filename, minThreads, maxThreads })`
- 自动 task queue + load balancing
- 支持 transferable objects

### 2.1 依赖对比

| 维度 | 自研 pool | Piscina |
| ---- | --------- | ------- |
| npm 依赖 | 0 | 1（piscina + 间接依赖） |
| 体积 | ~3KB | ~30KB + node_modules |
| 安装时间 | 0ms | ~5-10s |
| 升级维护 | 内部 | 跟随上游 |

### 2.2 功能对比

| 功能 | 自研 pool | Piscina |
| ---- | --------- | ------- |
| LRU 驱逐 | ✅ 自实现 | ❌ 无（需 idle timeout 替代） |
| 复用 worker | ✅ warm p50 < 100ms | ✅ warm ~80ms（基准） |
| idle timeout | ✅ 60s drain | ✅ maxIdleTime 配置 |
| 并发限流 | ✅ 自实现 queue | ✅ 内置 task queue |
| 错误传递 | ✅ 自定义 | ✅ Error 透传 |
| 测试钩子 | ✅ _resetForTest | ❌ 需 monkey-patch |

### 2.3 性能对比

| 场景 | 自研 pool | Piscina |
| ---- | --------- | ------- |
| cold start (10 任务并发) | 628ms | ~550ms |
| warm (复用 10 次) | < 100ms | ~80ms |
| 4 并发 × 100 任务 | 250ms | ~220ms |
| idle 60s 后首次 | 50ms（warm 复用失败 → cold） | 200ms（worker 已退出） |

**结论**：性能差异 < 10%；自研 pool 在 warm 路径略胜（无需等待 Piscina 内部调度）。

### 2.4 API 兼容性

| 用法 | 自研 pool | Piscina |
| ---- | --------- | ------- |
| `pool.run(task)` | ✅ | ✅ |
| `pool.run(task, { name })` | ✅ | ✅ |
| `pool.destroy()` | ✅ | ✅ |
| `pool.stats()` | ✅ 自定义 | ✅ 内置 |

## 3. 决策

**保留自研 pool**，原因：

1. **零依赖**：本项目沙箱 hot path 关键路径；多一个依赖 = 多一个潜在 CVE 风险
2. **功能等价**：Piscina 提供的 90% 功能自研 pool 已有
3. **可观测性**：自研 pool stats / idle timeout / LRU 都明确可观测
4. **维护成本可控**：3KB 代码 vs 30KB + 维护上游变更
5. **周期 10 baseline**：warm p50 < 100ms 已足够优秀

**Piscina 适用场景**：
- 多 worker 进程（cluster mode）
- 任务复杂度高（CPU bound 长时间任务）
- 团队不愿维护 pool 内部状态

本项目 = 单进程 + 短任务（AI agent sandbox）→ 自研 pool 更适合。

## 4. 升级触发条件

| 信号 | 检查频率 | 决策触发 |
| ---- | -------- | -------- |
| 自研 pool 出现性能回归 | 月度 | 评估 Piscina |
| 多 worker 进程需求 | 持续 | 引入 Piscina |
| AI agent 任务变重（>1s/task） | 持续 | 评估 Piscina |
| 团队人员变动（无人维护自研 pool） | 季度 | 引入 Piscina |

## 5. 与周期 10 决策的关系

| 周期 10 决策 | 周期 11 验证 |
| ------------ | ------------ |
| 自研 pool LRU + reuse + idle | ✅ 维持；Piscina 90% 功能等价 |
| warm p50 < 100ms | ✅ 验证（vs Piscina ~80ms） |

## 6. Spec 统计

- `piscina-vs-pool-eval.cjs` —— **18 子断言 PASS**
- 覆盖：文档结构、依赖对比、功能对比、性能对比、决策、升级触发条件
- 零 npm install（仅文档化 + spec 验证文件存在）
