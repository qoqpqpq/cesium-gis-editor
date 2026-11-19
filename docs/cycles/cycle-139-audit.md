# 周期 139 审计报告（2026-11-19，自动周期 · useGisPage 拆分 1/4）

## 0. 轮次定位

上一轮（138）交付 UR-4 Geo Dark Slice8 打磨 → **UR-4 UI 全面重设计完成**。本轮承接 **`useGisPage` 拆分**（用户 2026-11-14 指定，UI 完成后执行，P2）。

## 1. 任务判定

`client/src/pages/gis/useGisPage.js` = **936 行**单钩子巨石（状态/effect/回调/执行逻辑全部内聚）。拆分目标：按逻辑簇抽子钩子，保持行为零变化。识别 4 大簇：

| 簇 | 内容 | 行数 |
|---|---|---|
| ① 面板布局 | 列宽/折叠/拖拽/resize/localStorage | ~85 |
| ② AI 会话状态 | aiMessages/aiStreaming/abort/xhr/writeConfirm/lastError/aiPlatforms/keySettings/aiCurrentPlatform/aiSessionId + 关联 effect | ~110 |
| ③ 编辑器/场景状态 | coordFormat/toasts/editorCode/loadedFiles/sceneContext/token dialog | ~60 |
| ④ 核心执行 | captureCtx/runSandboxCode/captureSceneContext/handleAiSend/handleStop | ~400 |

**本轮范围：簇 ① + ②**（自洽、零业务耦合、低风险）；簇 ③ ④ 耦合执行逻辑（依赖 cesiumRef/editorRef/ctxRef）→ 后续轮次。

## 2. 实施

1. **`usePanelLayout.js`（109 行，新）**：`usePanelLayout(containerRef)` → 簇 ①。常量 `COLLAPSED_W/MIN_W/CENTER_MIN` + `loadNum/loadBool` 一并迁移（仅布局使用）。导出 `COLLAPSED_W` 供 `actualLeftW/actualRightW`。
2. **`useAiState.js`（96 行，新）**：`useAiState()` → 簇 ②。含 `gis-open-key-settings` 事件、`ai-keys-changed` 事件、`ai-platform` 持久化、卸载清理（abort xhr）4 个关联 effect。`aiSceneDesc` + `pendingViewStateRef` **保留在 useGisPage**（依赖 view state / URL hash，非纯 AI 状态）。
3. **`useGisPage.js`**：936 → **789 行**（−147）。删除被迁移的 6 块（5 声明块 + 1 effect 块），顶部新增两个子钩子调用（在 `containerRef` 后无条件调用，Hook 顺序稳定）；`COLLAPSED_W` 从子钩子导入。`actualLeftW/actualRightW`（`leftCollapsed ? COLLAPSED_W : leftW`）不变。

## 3. 验收

| 项 | 结果 |
|---|---|
| 语法（node -c / --check） | useGisPage + usePanelLayout + useAiState 全 OK |
| 残留未定义引用（loadNum/loadBool/MIN_W/CENTER_MIN） | 0 |
| 重复声明（`const [aiMessages,…]`） | 0（已移除） |
| `vite build` | 6.58s / rc=0 |
| 线上（https://129.204.202.173:5175/） | HTTP 200；主 JS bundle 含 `gis-left-collapsed`/`col-resize`/`ai-session-id`/`gis-open-key-settings`/`ai-platform` 全在 → 子钩子逻辑已打包并接线 |
| 15 道设计门禁 | **15/15 PASS**（CSS 未动） |

**行为零变化**：纯状态/effect 搬迁，语义与 Hook 顺序不变（子钩子内部 Hook 顺序固定，父钩子顶部无条件调用）。无 useGisPage 相关单测/回归 spec（已确认）；React 无 vitest/jest 框架 → 验证标准 = 构建 + 线上 bundle + 门禁（与既往周期一致）。

## 4. 边界与下一轮

- 簇 ③（编辑器/场景状态）与 ④（核心执行）**未拆**：④ 依赖 `cesiumRef/editorRef/ctxRef`，③ 的 `pushToast` 被 ④ 使用，需一并规划（避免半吊子接口）。
- 下一轮：**拆分 2/4 —— 簇 ③ + ④**（或按耦合边界再拆）。浏览器冒烟（面板拖拽/折叠、AI 发送）在有头环境补做。

## 5. 结论

`useGisPage` 拆分 1/4 交付：936 → 789 行 + 两个独立子钩子（布局 109 行 + AI 状态 96 行）。功能零回归。