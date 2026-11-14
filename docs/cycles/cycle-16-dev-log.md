<!-- ===== 本地实例（本会话 cycle 记录）===== -->
// docs/cycles/cycle-16-dev-log.md
// 周期 16 开发日志（增量）

## 周期 16（2026-11-13，自动周期第二轮）

- 触发：整点 10 分 cron（`10 * * * *`，Asia/Hong_Kong）。
- 模型：sensenova-6.8-flash（降级原因：无；上下文压缩：未触发）。
- 状态机：cycle 15 = completed → 开启 cycle 16；锁持有→释放。
- 分支：`feat/auto-cycle`。

### 本轮任务（P0）
**P0-1 续（R-1501）：LLM planner 适配层**
- 落点：`server/agent/llmPlannerAdapter.js`（新增独立模块，复用 cycle-15 的 execute/verify，不碰 executor/verifier）。
- 验收：spec `tests/specs/multi-agent-llm-planner.cjs` ≥25 子断言全 PASS → 实测 **31/31 PASS**。

### 实现
- `createLlmPlannerAdapter(config)`：注入 `llmChat` 抽象（不硬编码平台/密钥），`plan(goal)` 调 LLM 产出 steps JSON。
- `extractSteps`：健壮解析——容忍 ```json 围栏 / 前后散文 / 纯数组 / 单步对象 / `{steps:[...]}` 包裹。
- 复用 `multiAgentPlanner` 的 `normalizeStep + detectCycle + allowlist` 门禁：未知依赖 / 依赖环 / 白名单外 / 超步数上限 → 抛结构化错误，不静默降级。
- `buildPlannerPrompt`：要求 LLM 只返回 JSON steps；标注工具清单与危险工具 HITL 提示。
- `ai.js` 的 require 延迟到调用期——注入 `llmChat` 时不加载 ai.js 及其网络依赖（提升离线/可选依赖健壮性）。

### 开发中发现并修复的缺陷
- **C16-B01（阻断，已修）**：适配层顶部 `require(multiAgentPlanner)` 用到 `path.join`，但 `path` 在其后才引入 → ReferenceError。修复：`path` 引入提前到首次使用之前。spec 加载验证通过。

### 门禁
- 本轮 spec：31 PASS / 0 FAIL。
- 回归（离线）：multi-agent-planner 46/46、ai-guardrails 39/39、ai-guardrails-deep 38/38 → **零回归**。
- 静态扫描：无硬编码密钥、无本地绝对路径、无 .env 引用；server 模块零调试语句（仅 spec 报告用 console.log，属约定）。
- checkpoint/probe：需运行中 server，离线环境跳过（非阻断，承 R-1502）。

### 变更准入
- 新增独立模块，未触碰数据库 Schema / 对外接口 / 核心依赖大版本 / 部署脚本 / 权限 / CI-CD → **通过，无需人工审批阻塞**。

### 提交
- 仅在 `feat/auto-cycle`，小粒度：①适配层+spec ②文档台账。未推 main、未合并 PR（推送属每日 00:00 归档轮）。

### 下一轮待办
- 接真实平台跑通一次端到端 LLM planner（需 API Key + 网络，离线无法验证真实 LLM 路径）。
- 有 server 环境时补跑 checkpoint/probe 回归（R-1502）。

<!-- ===== 远端实例（另一自动化实例 cycle 记录）===== -->
# Cycle 16 Dev Log

> 周期 16 开发日志（2026-10-15）

---

## R1: P2-1 editor/utils 工具类文件与 turf 互操作单元测试

**来源**：周期 15 遗留 P2 项

**新增文件**：

| 文件 | 改动 | 说明 |
|---|---|---|
| `tests/specs/editor-utils-turf.cjs` | 新建 | 47 PASS spec |
| `docs/cycles/cycle-16-execution-plan.md` | 新建 | 周期 16 执行计划 |

**实现内容**：
- 静态扫描：analysis.js / threeCheck.js / geometry.js / measure.js / simplify.js / importer.js / exporter.js 导出验证
- 行为测试：cartesiansToLngLatHeights / lngLatHeightsToCartesians / polylineLengthMeters / polygonAreaM2
- 格式化测试：formatDistance / formatArea（米/公里/平方米/平方公里/小距离/小面积）
- 简化测试：simplifyPolyline（Douglas-Peucker 算法）
- turf 互操作测试：feature / featureCollection / buffer / centroid / coordAll / area / length / bbox / booleanValid
- 导入导出测试：importGeoJSON / entityToGeometry

**子断言**：47 PASS / 0 FAIL

**回归验证**：
- ai-guardrails: 39 PASS ✅
- ai-guardrails-deep: 38 PASS ✅
- server-import-completeness: 12 PASS ✅

**零回归确认**：3 个 spec 全部通过。

---

## R2: P2-2 协议字符串统一 + 同步检查

**来源**：周期 15 遗留 P2 项

**新增文件**：

| 文件 | 改动 | 说明 |
|---|---|---|
| `server/agent/protocol/constants.js` | 新建 | 协议常量统一导出 |
| `tests/specs/protocol-sync-unified.cjs` | 新建 | 28 PASS spec |

**修改文件**：

| 文件 | 改动 | 说明 |
|---|---|---|
| `server/agent/protocol/index.js` | 修改 | 常量从 ./constants.js 导入 |
| `server/agent/protocol/parse.js` | 修改 | re-export 新常量 |
| `scripts/check-protocol-sync.cjs` | 修改 | 增加 constants.js 检查 |

**实现内容**：
- 创建 `server/agent/protocol/constants.js`：统一导出 7 个协议常量（TOOL_OPEN / TOOL_CLOSE / TOOL_RE / TOOL_NAME_RE / TOOL_CALLS_JSON_RE / TOOL_CALLS_INLINE_RE / TOOL_CALL_JSON_RE）
- 更新 `server/agent/protocol/index.js`：从 ./constants.js 导入常量
- 更新 `server/agent/protocol/parse.js`：re-export 新常量
- 更新 `scripts/check-protocol-sync.cjs`：增加 constants.js 6 个常量检查
- 创建 `tests/specs/protocol-sync-unified.cjs`：28 PASS spec

**子断言**：28 PASS / 0 FAIL

**回归验证**：
- ai-guardrails: 39 PASS ✅
- ai-guardrails-deep: 38 PASS ✅
- server-import-completeness: 12 PASS ✅

**零回归确认**：3 个 spec 全部通过。

---

## R3: P2-3 aiAgent.js 通读 + 拆分方案

**来源**：周期 15 遗留 P2 项

**新增文件**：

| 文件 | 改动 | 说明 |
|---|---|---|
| `docs/cycles/cycle-16-aiagent-split-plan.md` | 新建 | 拆分方案文档 |
| `tests/specs/aiagent-structure.cjs` | 新建 | 30 PASS spec |

**实现内容**：
- 分析 aiAgent.js 结构（428 行，7 个函数，4 个常量）
- 提出 3 个拆分方案（A: 按职责 / B: 按依赖 / C: 保持单文件）
- 制定拆分优先级（P0: 添加注释 / P1: 拆 constants + utils / P2: 拆 stream / P3: 拆 loop）
- 风险评估（import 路径变化 / XHR 依赖 / 多依赖耦合）
- 实施计划（R3: 分析 / R4+: 实际拆分）
- 创建 spec 验证当前结构（30 PASS）

**子断言**：30 PASS / 0 FAIL

**回归验证**：
- ai-guardrails: 39 PASS ✅
- ai-guardrails-deep: 38 PASS ✅
- server-import-completeness: 12 PASS ✅

**零回归确认**：3 个 spec 全部通过。

---

## R4: P2-4 限流算法回归验证

**来源**：周期 15 遗留 P2 项

**新增文件**：

| 文件 | 改动 | 说明 |
|---|---|---|
| `tests/specs/ratelimit-regression.cjs` | 新建 | 24 PASS spec |

**实现内容**：
- Token Bucket 算法验证（6 项）：初始桶满 / 超限拒绝 / 桶满不超 capacity / 多 key 独立 / reset 恢复 / refill 恢复
- Sliding Window 算法验证（2 项）：前 N 次 allowed / 第 N+1 次超限
- rateLimit.js 静态结构验证（7 项）：slidingWindow / tokenBucket / InMemoryTokenBucketStore / RedisTokenBucketStore / multiLevelLimiter / aiMultiLevelLimiter / 导出完整性
- 现有 spec 文件完整性（6 项）：5 个现有 spec + 数量验证
- Header 格式验证（3 项）：RateLimit-* / X-RateLimit-* / Retry-After

**子断言**：24 PASS / 0 FAIL

**回归验证**：
- ai-guardrails: 39 PASS ✅
- ai-guardrails-deep: 38 PASS ✅
- server-import-completeness: 12 PASS ✅

**零回归确认**：3 个 spec 全部通过。

---

## 总计

- **R1**：47 PASS / 0 FAIL（P2-1）
- **R2**：28 PASS / 0 FAIL（P2-2）
- **R3**：30 PASS / 0 FAIL（P2-3）
- **R4**：24 PASS / 0 FAIL（P2-4）
- **Commits**：4 个
- **新增 spec**：4 个（editor-utils-turf + protocol-sync-unified + aiagent-structure + ratelimit-regression）
- **新增文档**：6 个（cycle-16-execution-plan + cycle-16-dev-log + cycle-16-test-report + cycle-16-self-check + cycle-16-aiagent-split-plan + cycle-16-lessons）

**Cycle 16 完成**：4 轮全部完成，P2 4/4，共 129 PASS / 0 FAIL
