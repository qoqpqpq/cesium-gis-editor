# 周期 141 审计报告（2026-11-19，自动周期 · useGisPage 拆分 3/4）

## 0. 轮次定位

上一轮（140）拆分 2/4（`useEditorState`）。本轮 **拆分 3/4 —— 簇 ④ 核心执行子簇**（场景快照/沙箱执行/重置清空/应用代码）。

## 1. 任务判定与边界设计

通读 `useGisPage.js` 核心区（L95-677）后**精确定界**：簇 ④ 内部存在两类耦合度不同的代码——

- **纯执行子簇**（自洽，仅 9 个依赖）：`captureCtx`（沙箱 viewer 代理）/ `runSandboxCode` / `captureSceneContext` / `clearLastError` / `handleResetScene` / `handleClearScene` / `handleConsoleLog` / `handleApplyCode` + `gis-reset-scene`/`gis-clear-scene` 事件监听。
- **AI 编排胶水**（耦合度极高，约 300 行）：L100-407 的大 effect（2s 场景轮询 + `window.__*` e2e 钩子 + 分享代码自动运行 + 分享视图 AI 说明生成，依赖 aiCurrentPlatform/aiPlatforms/aiSessionId/editorCode/sceneContext/aiApi/sessionKeys）+ `handleAiSend`（104 行）+ `handleStop`。**本轮留用**，下轮拆。

**边界选择**：抽「纯执行子簇」，依赖经对象注入（`{cesiumRef, editorRef, ctxRef, pendingViewStateRef, sandboxToastShownRef, pushToast, setLastError, setLoadedFiles, setEditorCode}`，共 9 项）→ 无 AI 状态耦合，风险可控。

## 2. 实施

- 新 **`useGisCore.js`（174 行）**：上述 8 函数 + 事件 effect，verbatim 搬迁；导入 `executeCesiumCode`/`buildSceneContext/formatSceneContext/headlineOf` 随之迁走。
- `useGisPage.js`：751 → **610 行**（−141）。移除 150 行迁移块；顶部调用 `useGisCore(deps)`（无条件调用，Hook 顺序稳定）；清理 2 行未使用导入（`./sandbox.js`、`./aiContext.js`）。`Cesium` 导入保留（4 处实际使用）。
- `sceneContext` 状态 + 轮询 effect **留用**（其 effect 引用 AI 编排胶水，属下轮）。

## 3. 验收

| 项 | 结果 |
|---|---|
| 语法（node -c / --check） | useGisPage + useGisCore 全 OK |
| 残留未定义引用（8 个迁移函数 + `gis-reset-scene`） | 0 |
| 未使用导入 | 已清理（`executeCesiumCode`/`aiContext` 三函数） |
| `vite build` | **6.21s** / rc=0 |
| 线上（https://129.204.202.173:5175/） | HTTP 200；主 chunk 含 `沙箱已就绪`/`Viewer 尚未就绪`/`场景已重置`/`gis-reset-scene`/`已应用到编辑器`/`gis-apply-code` 全在 → 子钩子已打包接线 |
| 15 道设计门禁 | **15/15 PASS**（CSS 未动） |

**行为零变化**：纯搬迁 + 依赖注入，语义与 Hook 顺序不变。

## 4. 边界与下一轮

- **AI 编排胶水未拆**（约 300 行）：L100-407 大 effect（2s 轮询/`window.__*` 钩子/分享自动运行/分享视图 AI 说明）+ `handleAiSend` + `handleStop` —— 依赖 aiCurrentPlatform/aiPlatforms/aiSessionId/editorCode/sceneContext/aiApi/sessionKeys，需与 AI 状态整体规划。
- 下一轮：**拆分 4/4 —— AI 编排胶水**（`useAiOrchestration`，接收共享 deps）→ `useGisPage` 收敛为纯组合根（refs + 4 子钩子 + 事件绑定 + return 对象）。

## 5. 结论

`useGisPage` 拆分 3/4 交付：751 → **610 行** + `useGisCore.js`（174 行）。累计：936 → 610 行（−34.6%）+ 4 子钩子（布局 109 + AI 状态 96 + editor 66 + core 174）。功能零回归。