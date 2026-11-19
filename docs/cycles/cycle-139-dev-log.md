# 周期 139 开发日志（2026-11-19，useGisPage 拆分 1/4）

## 输入

`state/cycle-state.json`：`current_cycle=138`、`status=in_progress`、`current_item=use-gis-page-split`。

## 范围

`useGisPage.js` 936 行单钩子巨石按逻辑簇拆分（行为零变化）。识别 4 簇：① 面板布局、② AI 会话状态、③ 编辑器/场景状态、④ 核心执行。**本轮：簇 ① + ②**（自洽、零耦合、低风险）。

## 实施

1. 新 `usePanelLayout.js`（109 行）：`usePanelLayout(containerRef)` → 簇 ①（列宽/折叠/拖拽/resize/localStorage）+ 常量 `COLLAPSED_W/MIN_W/CENTER_MIN` + `loadNum/loadBool`。
2. 新 `useAiState.js`（96 行）：`useAiState()` → 簇 ②（aiMessages/aiStreaming/abort/xhr/writeConfirm/lastError/aiPlatforms/keySettings/aiCurrentPlatform/aiSessionId + 4 关联 effect）。`aiSceneDesc`+`pendingViewStateRef` 保留（依赖 view state）。
3. `useGisPage.js`：936 → 789 行。删 6 块迁移声明/effect，顶部调用两子钩子（Hook 顺序稳定），`COLLAPSED_W` 导入。

## 文件变更

- `client/src/pages/gis/usePanelLayout.js`（新增）
- `client/src/pages/gis/useAiState.js`（新增）
- `client/src/pages/gis/useGisPage.js`（−147 行）
- `docs/cycles/cycle-139-audit.md`、`-dev-log.md`（新增）
- `docs/release-notes/upcoming-work.md`、`state/cycle-state.json`

## 验证

语法全 OK（3 文件）；残留未定义引用 0；重复声明 0；`vite build` 6.58s；线上 HTTP 200 + 主 JS bundle 含 `gis-left-collapsed`/`col-resize`/`ai-session-id`/`gis-open-key-settings`/`ai-platform`（子钩子已打包接线）；15 门禁 15/15 PASS（CSS 未动）。

## 下一步

拆分 2/4：簇 ③（编辑器/场景状态）+ ④（核心执行），注意 ④ 依赖 cesiumRef/editorRef/ctxRef、③ 的 pushToast 被 ④ 使用，需整体规划。