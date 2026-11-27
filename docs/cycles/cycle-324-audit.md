# 周期 324 审计（2026-11-27 11:05–11:30 HKT）

## 1. 触发与决策

| 项 | 值 |
|---|---|
| 触发 | 用户 11:05 直接回答三项提问（非定时空转） |
| 拍板 1 | 公网入站 **全网放行 5175+80**（用户本人在阿里云控制台操作，我方不代操作） |
| 拍板 2 | **`useAiOrchestration` 纳入，按 4 步拆分** ← 本轮唯一可执行任务，进度池解锁 |
| 拍板 3 | 自动周期 **保持每小时** |
| 前 23 轮 | 周期 144–323 连续 skipped（进度池空） |

## 2. 交付：`useAiOrchestration` 4 步拆分（TD-5201 结案）

**改动面**：`client/src/pages/gis/` 下 1 改 4 增。

| 文件 | 行数 | 内容（原行区间） |
|---|---|---|
| `useAiSceneContext.js` | 86 | 场景上下文簇（21–67）：`sceneContext` + `sceneContextRefreshRef` + 2s `setInterval` 轮询 + e2e window 钩子 `__refreshSceneContext`/`__runSandbox`/`__layers`(listAllLayers 三数据桶)/`__layerVisible`/`__flyToLayer` |
| `useAiShareEvents.js` | 169 | 分享簇（92–237）：`?code=` hash 自动执行、`gis-share-code`、`gis-share-view`（阶段 2C+3B，`aiApi.sceneDescription` + `buildShareUrl`）、`gis-run-code` |
| `useAiScreenshot.js` | 105 | 截图簇（238–334）：`gis-screenshot`（toBlob→下载→FileReader base64→`ai-set-input`）+ `nl-request-capture`（阶段 3D） |
| `useAiAgentSend.js` | 134 | Agent 簇（338–454）：`handleAiSend(text, systemPrompt, attachments)`（runAgentLoop/toolDocsForPrompt/PRESETS/sessionKeys/aiAbortRef/aiXhrRef）+ `handleStop` |
| `useAiOrchestration.js` | **462 → 52** | 薄组合根：接收与今日完全相同的对象参数 → 分发 4 子钩子 → 返回 `{ sceneContext, setSceneContext, sceneContextRefreshRef, handleAiSend, handleStop }` |

`useGisPage.js` **零改动**（`git status --porcelain` 对其为 0），第 73 行调用点原样可用。

## 3. verbatim 零行为改动对账（脚本，非人眼）

- 归一化「非空、非注释、非 import」代码行后多重集比对：**原文 392 行 100% 命中**。
- 11 行 missing = 原函数签名 + 原 return 块（已移入薄组合根）。
- 14 行 extra = 新增结构骨架（各子钩子签名 / `useEffect(() => {` / `return () => {` / `}, []);` / 各 return）。
- 事件监听注册顺序 = 场景 → 分享 → 截图，与原单 effect 内顺序一致；清理函数按簇切分（`clearInterval(t)` / 3× share 移除 / 2× screenshot 移除），**5 个 `removeEventListener` 一行未少**。

## 4. 门禁（Lead 独立复跑，非采信实施方自述）

| 门禁 | 结果 |
|---|---|
| 构建 `npm run client:build` | **rc=0**，6.28s，514 modules |
| 15 道设计门禁（逐个 `node tests/specs/<name>.cjs`） | **15/15 PASS** |
| gis 相关 spec（aiagent-structure / aitools-execution / gis-routes / sessionkeys-management / viewstate-url-serialization / viewstate-browser-decompress / viewstate-base64-degrade / viewstate-lzstring / viewstate-decompression-stream） | **9/9 EXIT=0** |
| 全量回归 `tests/specs/*.cjs`（120s/spec） | **172 TOTAL / 172 PASS / 0 FAIL**，无 rc=124 超时（优于基线：helmet-8 与 sandbox-perf-benchmark 本轮均正常通过） |
| bundle 字符串核对（`client/dist`） | `__refreshSceneContext`✅ `__runSandbox`✅ `scene-description`✅ `gis-screenshot`✅ `ai-set-input`(7)✅ `gis-share-view`✅ `gis-run-code`✅ `nl-request-capture`✅ `__layerVisible`✅ `__layers`/`__flyToLayer`✅ |
| lint | 仓库**无 lint 脚本、无 eslint 依赖**（client/package.json 仅 dev/build/preview/clean）。外置装 eslint 9 于 `/tmp`（不进仓库、不污染 node_modules），recommended 等价规则：**新代码 1 项 = 原文 1 项**，0 新增 |

**独立复核另验**：5 个文件行数一致、`useGisPage.js` 脏项数 0、组合根仍返回全 5 个 key、8 个关键字符串均落在正确子钩子。

## 5. 如实边界（两点）

1. **`__listAllLayers` 非丢失**：该字面量在拆分前源码里就是 0 处（实为本地 const `listAllLayers`，构建即压缩改名）。
2. **`toastId` assigned-never-used**：`useAiShareEvents.js:82` 对应原文 L158 同一条既存发现。按「一字不改 / 禁止顺手优化」原样保留；若要清零需删 `const toastId = ` 前缀，属行为无关微改，**留待后续单独处理或用户拍板**。

## 6. 遗留 / 开放项

- **R-3002（open）**：公网入站仍阻断。外部 `https://129.204.202.173:5175/` = **HTTP 000**（第 38 轮观测）；内部全绿（3001=200、5175 `--resolve` 环回=200/2231B、`gis-node`/`gis-caddy` 均 active）。等用户在云控制台放行 5175+80 后自动复测关闭。
- **TD-5201（resolved）**：本周期结案，见上。
- 自动周期频率维持每小时（用户决定，未降频）。