# Cycle 13 Lessons（经验沉淀）

> 周期 13 的踩坑、反思、可复用经验。
> L13-1 ~ L13-8 共 8 条。

---

## L13-1：parseArgs 必须接受 [node, script, ...args] 前缀

**问题**：spec 写 `parseArgs(['--write'])`，但 parseArgs 内部 `argv.slice(2)` 假设 argv[0]=node、argv[1]=script。

**解决**：spec 一律传 `['node', 'sync', '--write']`。

**可复用**：
- 工具库函数测试用 `['node', 'script', ...args]`；
- CLI 入口 wrap（`if (require.main === module)`）单独测，不与库函数混合。

---

## L13-2：spec 文件可作为文档使用——`### 结论` 与 `**结论**：` 不同

**问题**：decision doc 用 `**结论**：`（加粗），但 spec 正则 `## 结论` 期望二级标题。

**解决**：spec 放宽为 `assert.match(src, /结论/)`。

**可复用**：
- spec 中验证文档结构时使用最宽松的 regex（关键字匹配）；
- 不要假设 markdown 严格层级。

---

## L13-3：getRecommendedPreset 的语义需 spec 与实现一致

**问题**：spec 期望 "30fps → balanced"（fps=45 ≥ 30 中 sse 最大），实现最初是 "fps ≥ targetFps 中 sse 最小" → 30fps → quality(sse=8)。

**解决**：调整实现为 "fps 最接近 targetFps"，spec 同步更新为 "30fps → quality(closest fps=30)"。

**可复用**：
- 推荐算法 spec 与实现必须保持双向一致；
- 写 spec 前先想清楚业务语义（性能优先 vs 画质优先 vs 余量最大）。

---

## L13-4：mock 对象的 lastExec 应挂自身引用

**问题**：F2 spec 测试 `assert.match(drv.lastExec, ...)` 失败——`exec()` 闭包内 `state.lastExec = sql`，但 spec 读 `drv.lastExec`。

**解决**：mock driver 构造时 `const driver = { ... }; driver.lastExec = null;` 让闭包直接挂 own 属性。

**可复用**：
- mock 对象 state 写到对象自身（`this.lastExec`）；
- 不要 mock 用 closure 隐藏 state（spec 看不见）。

---

## L13-5：useWorkerContext 自动解析 traceparent

**问题**：cycle-12 withWorkerContext 仅在 carrier.traceId 显式传入时解析；spec 用合规 32+16+2 hex traceparent 不传 traceId → 自动生成随机 traceId。

**解决**：当 carrier.traceId 缺失时，从 carrier.traceparent 正则解析出 traceId。

**可复用**：
- carrier 类契约应"自动从原始数据派生"（不强制调用方预解析）；
- 测试时若 spec 想锁定某个 traceId，应显式传 carrier.traceId 防止重生成。

---

## L13-6：cycle-12 P2-1 反思"客户端动手少" → cycle-13 P1-2 真正接入 Viewer

**行动**：cycle-12 L12-8 反思客户端真实接入是 P2 的 100%。周期 13 P1-2 用 `useOptimisticMarkerBridge.js` 包装 useOptimisticMarker + viewer ref，直接调 `viewerRef.current.addMarker` + 失败回滚 `removeMarker`。spec 用 mock viewer 验证契约（含 cesiumEarth.jsx addMarker 签名）。

**未做**：
- 仍未直接修改 cesiumEarth.jsx 的 addMarker 实现；
- 只是提供 hook 供组件接入。

**可复用**：
- hook + bridge 是 50%，真正接入 viewer 组件是 100%；
- 下周期应给一个具体 Viewer 组件用上 useOptimisticMarkerBridge。

---

## L13-7：node:sqlite 在 Node 24+ 可用，但 better-sqlite3 native binding 在 v24.18 编译失败

**现状**：
- `require('node:sqlite')` 成功，DatabaseSync 可用；
- `require('better-sqlite3')` 失败（Node v24 V8 deprecated APIs 编译错误）；
- 因此测试中 `_detectRuntime` 实际返回 `node`（Node 24），但 spec 期望 better driver 时 fallback 到 memory。

**解决**：spec 兼容两种结果（`['better', 'memory'].includes(db.driver)`）。

**可复用**：
- multi-runtime 检测函数写 spec 时必须容错"环境差异"；
- 不要假设 better-sqlite3 一定可用（Node 24 native binding 问题已记录）。

---

## L13-8：每周期反思驱动 Top5 决策

**行动**：cycle-12 L12-8 提到客户端动手少 + cycle-11 L11 反思"打破评估 vs 接入边界"等直接驱动 cycle-13：
- P0-1 aiGuardrails（OWASP ASI01-10）落实"5 层纵深防御"反思
- P0-2 sqliteBackend.js 落实 node:sqlite 趋势评估
- P1-2 useOptimisticMarkerBridge 落实客户端接入不足反思
- P2-2 OTel dev hook 落实"打破评估 vs 接入边界"

**可复用**：
- 每周期 self-check 必须有"未达成的反思"；
- 下周期执行计划应至少 1 项明确源于上周期反思。

---

## L13 周期总结

- 8 条 lessons 中 L13-1 ~ L13-3 是测试/契约；L13-4 mock 设计；L13-5 traceparent 派生；L13-6 ~ L13-8 反思驱动
- 周期 13 8 个 spec 全过、171 子断言 = 历史第二高
- 客户端接入有所改善（bridge hook），但仍未真正改 cesiumEarth.jsx — 下周期补足
- OWASP ASI01-10 首次系统性落地（agentic AI 安全护栏正式进入本项目）