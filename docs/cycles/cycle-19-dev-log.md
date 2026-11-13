// docs/cycles/cycle-19-dev-log.md
// 周期 19 开发日志（增量）

## 周期 19（2026-11-13，自动周期第五轮）

- 触发：整点 10 分 cron（`10 * * * *`，Asia/Hong_Kong）。
- 模型：sensenova-6.8-flash（降级原因：无；上下文压缩：未触发）。
- 状态机：cycle 18 = completed → 开启 cycle 19；锁持有→释放。
- 分支：`feat/auto-cycle`。

### 本轮任务选取
- cycle 18 待办：R-1502（需 server）、R-1601（需 API Key/网络）**离线不可执行**；第三条（真实调用方启用 workloadIdentity）需密钥管理决策。
- 转进度池 Top5 剩余项，按优先级取 **Top4：cesium-mcp 集成升级（按 camera/entity/animation/imagery 拆分工具组）**，纯客户端 JS，离线可测。

### 本轮任务（P0/P1）
**MCP 工具分类元数据层（camera / entity / animation / imagery）**
- 落点：`client/src/pages/gis/mcpManifest.js`（增量：`registerTool` 加可选第 5 参 category + 分类存储 + 分组查询 API）。
- 验收：spec `tests/specs/mcp-tool-categories.mjs` ≥18 子断言全 PASS → 实测 **22/22 PASS**。

### 实现
- `TOOL_CATEGORIES`（冻结常量）：`camera / entity / animation / imagery / general`（兜底）。
- `registerTool(name, desc, schema, handler, category?)`：可选第 5 参，`_normalizeCategory` 非法值回落 `general`；`_toolCategories` Map 存分类。
- `unregisterTool` / `_resetAll` 同步清理分类。
- 默认 5 工具标注：`getCameraState/flyTo → camera`、`addMarker/spatialQuery → entity`、`screenshot → imagery`；`animation` 组暂空（**当前无动画工具，不凭空造**）。
- `listToolsByCategory(category?)`：省略返回全量分组（含空组）；传类名返回该组工具名。
- `manifestByCategory(category)`：按类生成子 manifest，`serverInfo.name` 带 `-<category>` 后缀，保留 protocolVersion/inputSchema。
- **纯增量**：`manifest()` / `listTools()` 语义与全部既有导出不变；`registerTool` 既有 4 参调用方不受影响。

### spec 形态说明
- 被测模块为 ESM 客户端模块，但顶层仅 Map + 函数声明（`window`/`import.meta` 仅函数内引用），可在 Node ESM 导入 → spec 用 `.mjs`。
- client `package.json` 已 `"type": "module"`，与 `.mjs` spec 兼容。

### 门禁
- 本轮 spec：22 PASS / 0 FAIL（目标 ≥18）。
- 回归（离线，server 侧未触碰）：multi-agent-planner 46/46、workload-identity-asi03 29/29、workload-guardrail-integration 19/19 → **零回归**。
- 静态扫描：无密钥/本地路径/.env/调试语句（D5 的 `[mcp] ... 已存在，覆盖` warn 为既有行为，非本轮引入）。

### 变更准入
- 纯客户端增量，未触碰数据库 Schema / 对外接口（既有导出与 registerTool 前参语义不变）/ 核心依赖大版本 / 部署脚本 / 权限 / CI-CD → **通过，无需人工审批阻塞**。

### 提交
- 仅在 `feat/auto-cycle`，小粒度：①分类层+spec ②文档台账。未推 main、未合并 PR。

### 下一轮待办
- 有 server 补 R-1502；有 API Key/网络验 R-1601。
- 可选：基于分类层实际拆出多个 MCP server 端点（当前仅提供分组 API，未改 bridge transport 路由）——若改动 bridge 对外协议需走变更准入评审。
- 可选：补 animation 类工具（时间轴/路径动画）需真实 viewer 能力支撑，待有运行环境。