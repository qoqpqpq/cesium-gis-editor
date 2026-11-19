# 周期 140 审计报告（2026-11-19，自动周期 · useGisPage 拆分 2/4）

## 0. 轮次定位

上一轮（139）拆分 1/4（布局 `usePanelLayout` + AI 状态 `useAiState`，936→789 行）。本轮 **拆分 2/4 —— 簇 ③ 编辑器/场景状态**。

## 1. 任务判定

`useGisPage.js` 789 行。4 簇：① 布局（已拆）、② AI 状态（已拆）、③ 编辑器/场景状态、④ 核心执行。**本轮：簇 ③**（自洽、零耦合 ④）。簇 ④（captureCtx/runSandboxCode/captureSceneContext/handleAiSend/handleStop，依赖 cesiumRef/editorRef/ctxRef，约 400 行）→ 拆 3/4 下一轮。

**关键判定**：`sceneContext` + 其 2s 轮询 effect（L109-...）**不随 ③ 迁移** —— 该 effect 绑定 `window.__runSandbox`/`__layers`/`__layerVisible`（引用 ④ 的 `runSandboxCode`/`cesiumRef`/`editorRef`），属 ④ 耦合。本轮 ③ = **coordFormat/toasts+pushToast/editorCode/loadedFiles/showTokenDialog/tdtTokenOverride/cesiumTokenOverride**（纯状态）。

## 2. 实施

新 **`useEditorState.js`（66 行）**：`useEditorState()` → coordFormat+持久化 effect、toasts+toastIdRef+pushToast、editorCode、loadedFiles、showTokenDialog/tdtTokenOverride/cesiumTokenOverride、`gis-apply-code` 事件监听。零依赖 ④。

`useGisPage.js`：789 → **751 行**。删 6 块迁移声明/effect，顶部调用 `useEditorState()`（Hook 顺序稳定）；`useCallback` 导入清理（confirmWrite 迁至 useAiState 后无实际使用）。

## 3. 验收

| 项 | 结果 |
|---|---|
| 语法（node -c / --check） | useGisPage + useEditorState 全 OK |
| `useCallback` 未使用导入 | 已清理 |
| 残留未定义引用（cluster③ 全部符号） | 0（均 ≥2：解构 + 使用/return） |
| `vite build` | 6.33s / rc=0 |
| 线上（https://129.204.202.173:5175/） | HTTP 200；主 chunk 含 `editor.coordFormat`/`gis-apply-code`/`cesium_tdt_skipped`/`gis-editor-code` 全在 → 子钩子已打包接线 |
| 15 道设计门禁 | **15/15 PASS**（CSS 未动） |

**行为零变化**：纯状态/effect 搬迁，`pushToast`（被 ④ 调用）经解构供 ④ 使用，语义与 Hook 顺序不变。

## 4. 边界与下一轮

- **簇 ④ 未拆**（核心执行，含 sceneContext 状态+轮询 effect、captureCtx/runSandboxCode/captureSceneContext/handleResetScene/handleClearScene/handleConsoleLog/handleApplyCode/handleAiSend/handleStop/clearLastError）—— 耦合 cesiumRef/editorRef/ctxRef/pendingViewStateRef/pushToast/confirmWrite，需传 context 对象整体规划。
- 下一轮：**拆分 3/4 —— 簇 ④**（核心执行 + sceneContext），并配套 `useGisCore` 子钩子接收共享 refs 与回调。

## 5. 结论

`useGisPage` 拆分 2/4 交付：789 → 751 行 + `useEditorState.js`（66 行）。累计：936 → 751 行 + 3 子钩子（布局 109 + AI 96 + editor 66）。功能零回归。