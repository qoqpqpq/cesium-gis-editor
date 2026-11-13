// docs/cycles/cycle-21-dev-log.md
// 周期 21 开发日志（增量）

## 周期 21（2026-11-13，自动周期第七轮）

- 触发：整点 10 分 cron（`10 * * * *`，Asia/Hong_Kong）。
- 模型：sensenova-6.8-flash（降级原因：无；上下文压缩：未触发）。
- 状态机：cycle 20 = skipped → 开启 cycle 21；锁持有→释放。
- 分支：`feat/auto-cycle`。

### 本轮任务选取
- cycle 20 评估的是进度池 **Top5（P0/P1 研究项）**，均离线阻塞。
- 本轮深挖 **P2 积压**（P0>P1>P2 仍属正当层级）：P2-3「editor/utils 9 个工具文件缺 turf 互操作单测」。
- 单一合适粒度：先为**零 import 纯函数**的 `coords.js` + `classify.js` 补单测（`attrs.js`/`attrTableUtils.js` 含 localStorage/DOM 需 mock、`analysis.js` 依赖 turf+api，留后续批次）。

### 本轮任务（P2-3 首批）
**editor/utils 纯函数补单测（coords + classify）**
- 落点：`tests/specs/editor-utils-coords-classify.mjs`（新增）。
- 验收：≥18 子断言全 PASS → 实测 **24/24 PASS**。

### 开发中发现并修复的缺陷
- **C21-B01（边界崩溃，已修）**：`classify.js` 的 `rampColor(i, n)` 当 `i > n-1` 时 `t = i/(n-1) > 1` → `idx` 越界 → `palette[lo]` 为 `undefined` → `lerpHex` 抛 `TypeError: Cannot read properties of undefined`。
  - 修复：clamp `i` 到 `[0, n-1]`，并 clamp `lo` 到 `[0, palette.length-1]`。
  - 影响面：`rampColor` 唯一内部调用方 `classifyFeatures`（unique 模式）传入的 `idx` 恒在 `[0, n-1]`（来自 `classifyUniqueIndex`），故 clamp 纯属**外部防御**，对既有内部路径**零影响**。
  - 内部纯函数、不改对外接口/签名 → 低风险，通过变更准入。

### 实现（spec 覆盖）
- coords：decToDMS 半球（E/W/N/S）、decToUTM/MGRS 字符串形态、formatCoord dec/dms/未知格式回落。
- classify：equal/quantile 断点数（n+1）、unique 去重保序、classifyValue 分箱、classifyUniqueIndex 未命中防御、rampColor（含 C21-B01 clamp + n<=1 不除零 + 未知色板回落 Blues）、RAMPS、classifyFeatures 空入参/正常路径。

### 门禁
- 本轮 spec：24 PASS / 0 FAIL（目标 ≥18）。
- 回归（离线）：editor-fallback-clear 9/9 零失败；`rampColor` 内部路径零影响（已论证）。
- 静态扫描：无密钥/本地路径/.env/调试语句。

### 变更准入
- 新增 spec + 内部纯函数 clamp 修复，未触碰数据库 Schema / 对外接口 / 核心依赖大版本 / 部署脚本 / 权限 / CI-CD → **通过，无需人工审批阻塞**。

### 提交
- 仅在 `feat/auto-cycle`，小粒度：①C21-B01 修复+spec ②文档台账。未推 main、未合并 PR。

### 下一轮待办
- P2-3 后续批次：`attrs.js`/`attrTableUtils.js`（需 mock localStorage）、`analysis.js`（依赖 turf，需确认 client/node_modules 可解析）。
- 有 server 补 R-1502；有 API Key/网络验 R-1601。