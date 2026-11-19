# 周期 142 审计报告（2026-11-19，自动周期 · useGisPage 拆分 4/4 —— 收尾）

## 0. 轮次定位

承接 141（`useGisCore`）。本轮 **拆分 4/4 —— AI 编排胶水**，收尾整个 useGisPage 拆分。

## 1. 任务判定

141 留下的 433 行胶水（`useGisPage` L104-536）：`sceneContext` 状态 + 2s 轮询 + `window.__*` e2e 钩子 + 分享代码自动运行 + `gis-share-code`/`gis-share-view`（含 AI 说明生成）+ `gis-run-code` + `gis-screenshot` + `nl-request-capture` + `handleAiSend`（Agent 工具循环）+ `handleStop`。

**依赖扫描**（逐标识符计数，区内共 17 项外部绑定）：`cesiumRef/editorRef/ctxRef`、`pushToast/editorCode`、`aiMessages/setAiMessages/aiStreaming/setAiStreaming/aiAbortRef/aiXhrRef/aiCurrentPlatform/aiPlatforms/aiSessionId/lastError/confirmWrite`、`runSandboxCode/captureSceneContext`。`Cesium` 与 `captureCtx` 在区内**仅出现于注释/字符串**，不构成依赖。

## 2. 实施

- 新 **`useAiOrchestration.js`（462 行）**：上述 433 行 **verbatim 搬迁**（脚本抽取，无手改），依赖经对象注入（17 项），导入 `aiApi/PRESETS/runAgentLoop/toolDocsForPrompt/buildShareUrl/sessionKeys` 随之迁走。返回 `sceneContext/setSceneContext/sceneContextRefreshRef/handleAiSend/handleStop`。
- `useGisPage.js`：**751 → 183 行**（本轮 −428）。删 433 行迁移块；顶部无条件调用 `useAiOrchestration(deps)`（Hook 顺序稳定）；清理 7 行未使用导入（`Cesium`/`aiApi`/`PRESETS`/`runAgentLoop`/`toolDocsForPrompt`/`sessionKeys` + `buildShareUrl`）。保留 `readViewStateFromUrl`（3 处实际使用）。

## 3. 验收

| 项 | 结果 |
|---|---|
| 语法（node -c / --check） | useGisPage + useAiOrchestration 全 OK |
| 未使用导入 | 7 行已清理 |
| `vite build` | **6.26s** / rc=0 |
| 线上（https://129.204.202.173:5175/） | HTTP 200；主 chunk 含 `正在让 AI 生成场景说明`/`nl-request-capture`/`gis-share-view`/`gis-screenshot`/`ai-set-input`/`gis-run-code`/`__layerVisible` 全在 → 子钩子已打包接线 |
| 15 道设计门禁 | **15/15 PASS**（CSS 未动） |

**行为零变化**：verbatim 搬迁 + 依赖注入，语义与 Hook 顺序不变。

## 4. 拆分任务结论（4/4 完成）

| 子钩子 | 行数 | 职责 |
|---|---|---|
| `usePanelLayout` | 109 | 三列布局/折叠/拖拽/localStorage |
| `useAiState` | 96 | AI 会话/平台/确认弹窗/Key 事件 |
| `useEditorState` | 66 | 坐标格式/Toast/编辑器/Token 弹窗 |
| `useGisCore` | 174 | 沙箱执行/场景快照/重置清空 |
| `useAiOrchestration` | 462 | 场景摘要轮询/e2e 钩子/分享+AI 说明/截图联动/Agent 发送 |

**`useGisPage.js`：936 → 183 行（−80.4%）**，现为纯组合根（refs + 5 子钩子调用 + `pendingViewStateRef`/`aiSceneDesc` 视图态 + 事件绑定 + return 对象）。**useGisPage 拆分任务结案。**

## 5. 边界与风险

- 拆分过程零行为改动；每轮均以「语法 + 构建 + 线上 bundle 字符串 + 15 门禁」四重验证。
- 全量 172 规格套件存在 1 个既有超时假失败（`helmet-8-permissionspolicy-recheck.cjs`，内部断言 4/4 通过，rc=124）+ 1 个 flaky skip（`sandbox-perf-benchmark`），与本轮无关（138 周期已记录）。
- 剩余技术债：`useAiOrchestration` 462 行仍偏大，可再拆（截图联动 / 分享流程），属 P3 优化，非本任务范围。