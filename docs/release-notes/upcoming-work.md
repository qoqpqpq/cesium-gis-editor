# Upcoming Work（多周期累积池）

> 所有周期按"清除已完成的条目"的方式收敛。
> 顶部为最高优先级 P0，自上而下递减；周期结束后由对应周期把"已交付"项移到 commits 区。

## 新增需求（用户 2026-11-14 指定，排在原有功能之后）

### UI-REFACTOR：UI 设计重构（更好看 · 更简洁）

> 用户 2026-11-14 新增，优先级 P2（排在原有 P0/P1 功能之后）。
> 现状：已有设计 token 体系雏形（`client/src/theme.css` 248 变量、亮/暗双主题、语义别名），但仍有 **110 个硬编码色值**未迁移；主页面 `client/src/pages/gis/index.jsx` 1100 行；无 UI 框架（纯手写 CSS，6254 行）。
> 目标：换一套**更好看、更简洁**的设计方案，在不破坏既有功能与双主题的前提下提升视觉一致性与简洁度。

分阶段（每阶段可独立交付、可验证）：
- **UR-1 设计审计与 token 收敛**：统计并迁移硬编码色值到语义 token；产出「颜色/间距/圆角/阴影/字号」token 清单。验收：硬编码色值数量显著下降（目标 −50%+），双主题下无视觉断裂。
- **UR-2 布局与密度简化**：精简 `index.jsx`（1100 行）的视觉密度与嵌套，统一间距/圆角/阴影 scale；抽取可复用样式。验收：`index.jsx` 行数下降，样式重复消除；功能零回归。
- **UR-3 组件视觉统一**：统一按钮/输入/卡片/弹窗/面板的视觉语言（一致内边距、边框、hover/active/focus 态）。验收：同类组件视觉参数一致；双主题各核对。
- **UR-4 字体与层次**：统一字号阶梯、字重、行高，强化信息层次。验收：字号使用收敛到 token 阶梯。

约束：不改业务逻辑/协议/接口（纯表现层）；每阶段独立提交在 `feat/auto-cycle`；双主题（light/dark）全程不破。

## 周期 117 / 118 / 119（2026-11-18，自动周期）：**skipped（无可执行自动任务，未造需求）**

- 判定依据：UR-3 六项已全部按用户 2026-11-18 拍板处置完毕（3a/3b/3b-2/3f 交付；3c/3e 无操作；3d 无等值机械入口→转角色化设计拍板）。进度池中**无 P0/P1/P2 可自动执行的候选项**：项1 cycle-77 人工冒烟**需用户在浏览器执行**（公网 URL 健康：首页 200/2231B、`/api/health` 200）；项2 `useGisPage` 拆分**按用户拍板暂缓**；3d 需用户提供角色化命名方向。
- 处置：本轮**不改代码**，仅落记录（符合运行手册「无验证项不启动；无可执行任务标记 skipped，禁止凭空造需求」）。同步状态复核：工作区 0 脏、分支 feat/auto-cycle、**IN_SYNC=YES（761c365）**、预览首页 200。
- **周期 118 复核（21:10）**：仍为 await_confirm、无可执行自动任务 → 再次 skipped（工作区 0 脏；预览首页 200）。`git ls-remote` 首轮连续 5 次抖动返回空（网络抖动，非分叉信号：周期 117 push 已 RC=0，远端分叉会使 push 被 reject），push 后复核 **IN_SYNC=YES（5b1ad64）**。
- **周期 119 复核（22:10）**：同 117/118，仍无可执行自动任务 → skipped（工作区 0 脏；预览首页 200；push RC=0）。
- ⚠️ **待用户输入**（不回复则后续周期继续 skipped）：① 冒烟回报 `通过` / `失败：<现象>`；② 3d 是否给出角色化命名方向（或确认维持现状）；③ 是否解除 `useGisPage` 暂缓。

## 周期 116 已交付（2026-11-18，自动周期 · UR-3 3f editor 面板密度 token 化）

- ✅ **UR-3 3f：editor 面板规则视觉密度收敛到 token 一致值（用户 2026-11-18 拍板：按常规密度精简）**——审计 editor 子组件相关规则（`editor-*`/`analysis-*`/`attr-*`/`op-*`/`qb-*`/`print-export-*`/`three-check-*`/`query-builder-*`/`et-tab-*`/`style-panel-tabs`/`thematic-info`，260 块）：UR-2 已 token 化全部**单值**，但**多值简写**遗留 86 处裸 px。本轮将 86 处多值简写裸 px 逐值收敛为 `--space-*` token：**83 处严格等值**（值→同值 token，零视觉变化），**3 处 ±1px 视觉规范化**（`7px`→`8px`、`9px`→`8px`、`7px`→`8px`，收敛到常规档 `--space-2`；按拍板"常规密度"，已如实记录）。editor 规则 spacing/radius **0 处离档裸 px**，230 处全 token 化（19 种 token）。新增门禁 `tests/specs/editor-density-tokenized.cjs`（3 条：0 离档裸 px / token 种类≥10 / var() 使用≥40）。回归 css-duplication-audit **20/20** + css-var-reference-guard **9/9** + design-token-audit **13/13** + tracking/spacing/shadow/stale 门禁 5/5+5/5+6/6+3/3 + 括号净深度 0；**`vite build` ✓ 6.36s**（505 modules）。双主题未破。
- 📌 **说明**：`EditorPanel.jsx` 本身为逻辑容器（1305 行、约 9 个 JSX 标签、无 className、1 处 `display:none`），**无密度样式**；本轮 3f 的密度收敛作用于其子组件（StylePanel/AnalysisPanel/PrintExportPanel/QueryBuilder/ThreeCheckPanel/LayersTree/AttributeTablePanel/EditorToolbar 等）在 `styles.css` 的规则。

## 周期 115 已交付（2026-11-18，自动周期 · UR-3 3d 可行性判定 + 陈旧 fallback 收口）

- ✅ **UR-3 3d 收口（同类值级重复 fallback）**——`theme.css:25 --radius-base: var(--radius-md, 12px)`：`--radius-md:12px` 在 `:root` 恒定义（styles.css:100，无亮/暗覆写），fallback **永不可达** → 收口为 `var(--radius-md)`（严格等值；`--radius-base` 无使用点，作语义别名保留，同周期 112 对 `--shadow-elevated` 处置）。新增门禁 `tests/specs/stale-fallback-audit.cjs`（3 条：`--radius-base` 无字面 fallback / `--shadow-elevated` 周期112 回归保护 / 全 CSS radius 族零 `var(--radius-*, <字面量>)`）。回归 css-duplication-audit **20/20** + css-var-reference-guard **9/9** + design-token-audit **13/13** + tracking/spacing/shadow 门禁 5/5+5/5+6/6 + 括号净深度 0；**`vite build` ✓ 6.41s**（505 modules）。双主题未破、无行为改动。
- 📊 **UR-3 3d 可行性判定（诚实结论）**——审计 `padding`/`margin` 多值简写：**254 处声明、102 个唯一组合**；覆盖 50% 需前 16 组合、70% 需前 32、90% 需前 77。**结论：无等值机械语义化入口**——按组合建复合 token 会产出 100+ 个**值命名**复合 token（纯 churn，无语义增益），且各使用点需按语义角色（cell/toolbar/panel…）命名方有设计意义，属**角色化设计 QA** 而非机械迁移。**建议**：3d 转由设计角色化拍板（给出每组合的语义名 + 视觉 QA），或维持现状（简写组合本身可读、不阻塞功能）；本轮不强行 token 化。**不造需求、不伪造语义。**

## 周期 114 已交付（2026-11-18，自动周期 · UR-3 3b-2 字距 tracking 命名空间）

- ✅ **UR-3 3b-2：字距 tracking 命名空间落位（用户 2026-11-18 拍板：推荐命名族，等值映射，零视觉变化）**——`styles.css` 以 `--tracking-*` 为规范定义（9 个，值与原 `--ls-*` 逐一相等：`0.5px/0.05em/1px/0.3px/0.4px/0.02em/-0.4px/2px/0.2px`），全部 `--ls-*`（9 个）改为 `--tracking-*` 纯别名，**24 处既有引用零改动**、计算值不变。命名采用 `--tracking-*` 而非 `--font-*`：字距在排版术语为 **tracking**（非 font-size；`--font-*` 保留给字号/字重/行高族），与 cycle-71 记录的「tracking-tight/normal/wide」推荐一致。当前为值命名档（诚实边界：现有值混合 em/px 且为微调值，无干净语义 tier 可等值映射，归并会改变观感 → 不强行语义化）；语义 tier 可在此命名空间后续叠加。新增门禁 `tests/specs/tracking-token-namespace.cjs`（5 条：定义值逐一相等且唯一 / `--ls-*` 纯别名无字面值 / 无下划线 / 非僵尸 / 别名数=9）。回归 css-duplication-audit **20/20** + css-var-reference-guard **9/9** + design-token-audit **13/13** + spacing/shadow 门禁 5/5+6/6 + 括号净深度 0；**`vite build` ✓ 6.32s**（505 modules）。双主题未破、无行为改动。

## 周期 113 已交付（2026-11-18，自动周期 · UR-3 3b 间距语义阶梯）

- ✅ **UR-3 3b：间距语义阶梯 `--space-*` 落位（用户 2026-11-18 拍板：推荐命名，等值映射，零视觉变化）**——`styles.css` 建立规范定义：语义档 `--space-1..6`（对齐 4px 网格：4/8/12/16/20/24px）+ 值命名档 `--space-1px/2px/3px/5px/6px/10px/14px/18px/28px/30px`（非网格值，如实标注非语义档，诚实边界，不冒充语义）；全部 16 个 `--gap-*` 改为 `--space-*` 的**纯别名**（`var()` 间接），**264 处既有引用零改动**、计算值不变。新增门禁 `tests/specs/spacing-token-semantic-ladder.cjs`（5 条：语义档值唯一 / `--gap-*` 纯别名无字面 px / 非网格值命名档存在 / 无下划线（guard 兼容）/ 语义档非僵尸）。回归 css-duplication-audit **20/20** + css-var-reference-guard **9/9** + design-token-audit **13/13** + shadow 门禁 6/6 + 括号净深度 0；**`vite build` ✓ 6.32s**（505 modules）。双主题未破、无行为改动。3d 多值简写的语义档前置依赖就此就绪。

## 周期 111-112 已交付（2026-11-18，自动周期 · 公网预览 + UR-3 3a 结项）

- 🔌 **周期 111：公网预览通道打通（用户 2026-11-18「开放外网访问」拍板）**——新增独立 Caddy 实例 `/etc/caddy/Caddyfile.gis`（`https://129.204.202.173:5175` → `reverse_proxy 127.0.0.1:3001`，复用现成 LE 证书，与 dsh 主 Caddy 完全隔离）。**公网实测**：首页 200/2231B、`/api/health` 200 `{"status":"ok"}`、主 JS 包 200/172775B。两个真实故障已定位修复：① 自动 HTTPS 重定向需绑 `:80`（无权限）→ `auto_https disable_redirects`；② `ssrf-guard` Host 白名单（`server/routes/gis.js` 仅 `localhost/127.0.0.1/::1`）对带端口公网 Host 返 403 → 反代注入 `Host: 127.0.0.1`。⚠️ 安全取舍已记录：长期方案应设 `ALLOWED_HOSTS=129.204.202.173` 并透传真实 Host。
- 📋 **周期 111：用户 8 项决策队列已获全部回复**（记录于 `state/auto-cycle-decisions.md`）：项1 冒烟=先开公网（已开通，待用户回报）；项2 `useGisPage` 拆分=**暂缓**；3a shadow=**保持主题各自值，仅消除重复定义**；3b/3d=**按推荐语义命名推进**；3f=**按常规密度精简**。
- ✅ **周期 112：UR-3 3a 结项（`--shadow-*` 重复定义消除，等值零视觉变化）**——按拍板执行：跨文件同名 `--shadow-sm/md/lg`（styles.css `:root` 暗 vs theme.css 亮主题块）判定为**主题覆写而非重复定义，原样保留**；真正值级重复 1 处 = `theme.css:27 --shadow-elevated: var(--shadow-lg, 0 14px 40px rgba(0,0,0,0.45))` 的硬编码 fallback 与 `--shadow-lg` 重复且永不可达 → 删除为 `var(--shadow-lg)`（暗/亮两主题均已定义 `--shadow-lg`，严格等值）。新增**回归门禁 `tests/specs/shadow-token-duplicate-definition.cjs`（6 条）**：G1 禁 `var(--shadow-*, <字面量>)` 值级重复 / G2 禁同作用域同名 `--shadow*` 重复定义 / G3+G3b 正向锁定双主题覆写形态（防误删）/ G3c 锁定亮主题 alpha 0.06 刻意不等价（防"统一"）/ G4 锁定 `--shadow-elevated` 仅引用 token。**变异测试**：还原 fallback → G1+G4 FAIL（EXIT=1），还原 → 6/6。回归 css-duplication-audit **20/20** + css-var-reference-guard **9/9** + design-token-audit **13/13** + 括号净深度 0；**`vite build` ✓ 6.44s**（505 modules，主 JS 172.56 kB）。双主题未破。

## 周期 97-99 已交付（2026-11-18，自动周期 · UR-3 结构清理子阶段）

- ✅ **UR-3 结构清理：清除 `client/src` 全部未用导入（共 18 处）**—— cycle-97 `EditorPanel.jsx` 2 处（`StyleCommand`/`snapshotEntity`）；cycle-98 `gis/` 10 文件 14 处（`useState`/`useEffect`/`useMemo`/`useRef`、`StyleCommand`、`gisApi`、`describeSuggestion`、`measureOp`、`LARGE_DATASET_VERTEX_THRESHOLD`、`LARGE_BOOLEAN_POLYGON_THRESHOLD`、`cartesiansToLngLatHeights`、`Cesium`）；cycle-99 `App.jsx`/`ThemeToggle.jsx`/`useOptimisticAction.js` 4 处（`useEffect`/`useState`/`React`/`initUseActionStateGuard`）。各期构建 ✓、括号平衡 0、剩余未用导入归零、CSS 门禁 20/20+9/9+13/13、零行为改动。
- 📌 **cycle-94 可行性分析（供拍板）**：UR-3 各设计项经实测多数**非纯机械可自动**——3c 色+alpha 归并：16 hex 重复对**全是 token 定义别名**（使用处已 var()）、单次色无可去重、6/8 token 被主题覆盖（替换会翻转主题）；3e 26 单次 box-shadow：重复对全为 var() 引用、单次值唯一 → **无操作**；3a/3b/3d/3f 需设计/视觉 QA（定 alpha/语义名/密度目标）。
- ⏭️ **遗留**：cycle-77 迁移建议人工浏览器冒烟测试（项 1，:3001 在线）；`useGisPage` 拆分（项 2）建议暂缓（共享状态耦合/事件绑定跨层）；UR-3 设计拍板项需用户方向（3a 定 alpha、3b 定语义名、3f 定密度目标）。

## 周期 84 已交付（2026-11-17，自动周期第二十八轮 · UR-2 接口收尾）

- ✅ **UR-2 接口收尾：裁剪 `index.jsx` 的 `useGisPage()` 解构 68→45**（仅保留渲染实际引用的绑定，23 个多余绑定移除）—— `index.jsx` **271→248**；渲染段逐字节不变；构建 ✓ 6.43s（503 modules）；零行为改动（仅解构块替换）
- ⏭️ **遗留**：cycle-77 迁移建议人工浏览器冒烟测试；`useGisPage` 按职责拆 `useGisScene`/`useGisAi`/`useGisEvents` 需评审（共享状态耦合）；UR-3 设计拍板项不变（语义阶梯/单次色与 alpha 归并/`--shadow-sm/md/lg` 双文件不等价/多值简写复合 token/26 处单次 box-shadow）

## 周期 83 已交付（2026-11-17，自动周期第二十七轮 · UR-2 结构清理）

- ✅ **UR-2 结构清理：清除 `useGisPage.js` 未用组件 import**（cycle-77 搬迁遗留，5 个纯表现层组件 import 因注释/字符串内组件名被误判带入，实际零代码引用）—— `useGisPage.js` **942→936**；构建 ✓ 6.45s（503 modules）；CSS 门禁 20/20+9/9+13/13；零行为改动（仅删未用符号）
- ⏭️ **遗留**：cycle-77 迁移建议人工浏览器冒烟测试；`useGisPage` 按职责拆 `useGisScene`/`useGisAi`/`useGisEvents` 需评审（共享状态耦合）；UR-3 设计拍板项不变（语义阶梯/单次色与 alpha 归并/`--shadow-sm/md/lg` 双文件不等价/多值简写复合 token/26 处单次 box-shadow）

## 周期 77 已交付（2026-11-17，自动周期第二十六轮 · 用户指令「做 UR-2 逻辑层 hook 抽取」）

- ✅ **UI-REFACTOR UR-2 逻辑层结构重构：`index.jsx` 逻辑层整体搬迁到自定义 hook `useGisPage`**（功能零回归·纯搬迁保行为）—— `index.jsx` **1058→271（−787，−74.5%）**；新增 `useGisPage.js`（**942 行**逻辑层 hook，含全部 useState/useEffect/useRef/useCallback/事件绑定/处理器，返回 **68 个绑定**）；index.jsx 仅留 import + `useGisPage()` + 解构 + **渲染段（逐字节不变）**。验证：**逐字节校验 render/hook 逻辑体均与原文一致**（纯搬迁保行为）、括号平衡 0/0、解构 68 条含全部渲染关键引用（含 `async function` 的 `handleAiSend`/`runSandboxCode`）、`vite build` ✓ 6.29s（503 modules）、CSS 门禁 20/20+9/9+13/13、无其他文件导入 index.jsx 内部
- ⏭️ **遗留**：`useGisPage.js` 可继续按职责拆 `useGisScene`/`useGisAi`/`useGisEvents`（低风险进一步结构优化）；**建议人工浏览器冒烟测试**（三列拖拽/折叠、代码执行、AI 助手、截图、分享链接——`vite build` 不验运行时渲染）；UR-3 设计拍板项不变（语义阶梯/单次色与 alpha 归并/`--shadow-sm/md/lg` 双文件不等价/多值简写复合 token/26 处单次 box-shadow）

## 周期 75 已交付（2026-11-17，自动周期第二十五轮 · 用户指令「做 index.jsx 视觉密度精简」）

- ✅ **UI-REFACTOR UR-2 验收项：`index.jsx` 视觉密度与嵌套精简、抽取可复用样式**（功能零回归）—— 审计：index.jsx 1100 行 = 逻辑 ~860（78%）+ JSX ~240（22%）。JSX 内样式重复：折叠条 2 处 / 分隔条 2 处 / 列类名拼接 3 处。**抽取 5 个纯展示可复用位到新文件 `GisLayoutBits.jsx`**（`colClass`/`CollapseBar`/`HSplitter`/`ToastStack`/`AiSceneDescBanner`），index.jsx 改用之，**业务逻辑/状态/事件绑定 0 改动**。**index.jsx 1100→1058（−42 行，−3.8%）**；样式重复消除（`col-collapse-bar` 2→1、`gis-hsplitter` 2→1、列类名拼接 3→0）；主 return 22→16 JSX 块（视觉密度降）。`vite build` ✓ 6.31s（503 modules）；CSS 门禁 20/20+9/9+13/13 无回归；5 个新导入全部使用。功能零回归（纯展示移动，类名/props 原样）
- ⏭️ **遗留**：业务逻辑层结构重构（~860 行：`handleAiSend`/事件绑定 `useEffect`/`captureSceneContext` 抽 hook）属结构重构、回归风险较高，留 UR-3 或独立任务（需评审）；`GisLayoutBits` 组件可被其他页面复用；UR-3 设计待拍板项不变（语义阶梯/单次 box-shadow/单次色与 alpha 归并/`--shadow-sm/md/lg` 双文件不等价/多值简写复合 token）

## 周期 72 已跳过（2026-11-17，自动周期第二十四轮）

- ⏭️ **skipped**：无可执行任务。UR-2 纯自动化 scale（字号/字重/行高/圆角/gap/padding-margin 单值/阴影重复值/字距）已全部完成；UR-3/UR-4 剩余项（字距/间距语义阶梯、26 处单次 box-shadow、单次色与 alpha 变体归并、`--shadow-sm/md/lg` 双文件不等价、多值简写复合 token、`index.jsx` 视觉密度精简）均需**设计拍板或视觉 QA**，无量化可验证的纯迁移入口。**不启动、不造需求**。待人工给出设计方向或指定任务后，下一轮再续。

## 周期 71 已交付（2026-11-17，自动周期第二十三轮）

- ✅ **UI-REFACTOR UR-2 步骤8：`letter-spacing` 字距 scale 收敛**（等值零视觉变化）—— 审计：24 处 / 9 值（`0.5px`×7、`0.05em`×3、`1px`×3、`0.3px`×3、`0.4px`×3、`0.02em`×2、`-0.4px`×1、`2px`×1、`0.2px`×1），全原始 → 新增 **9 个值命名 token** `--ls-0-5px`/`--ls-0-05em`/`--ls-1px`/`--ls-0-3px`/`--ls-0-4px`/`--ls-0-02em`/`--ls-neg-0-4px`/`--ls-2px`/`--ls-0-2px`，24 处 → `var(--ls-*)`，原始值 **24→0**（100%）。回归 css-duplication-audit **20/20**（新增 **A20**：原始值 0 + 无裸自定义属性 + **token 名无下划线**（与 css-var-reference-guard 兼容性硬约束）+ 无 `)undefined`；负向验证：原始值注入 FAIL / 下划线名注入 FAIL / 还原 20/20）+ css-var-reference-guard 9/9 + design-token-audit 13/13；括号平衡 910/910；**`vite build` ✓ 6.23s**（503 modules，CSS 124.91 kB）。等值零视觉变化、双主题未破
- ⚠️ **C71-B01（已修复）**：首版 token 名用下划线 `--ls-0_5px`，与 guard 的 var 名正则 `[a-zA-Z0-9-]+` 不兼容 → B1/B5 FAIL（`--ls-0` 未定义）；重命名 27 处（7 定义 + 20 引用）为纯连字符名，guard 恢复 9/9。**教训**：token 名必须与 css-var-reference-guard 的 var 名正则一致（纯 `[a-zA-Z0-9-]`、无下划线）；A20 已固化该断言
- 📌 **UR-2 纯自动化 scale 已全部完成**（字号/字重/行高/圆角/gap/padding-margin 单值/阴影重复值/字距）。**剩余项均需设计拍板或视觉 QA**：字距/间距语义阶梯、26 处单次 box-shadow、单次色与 alpha 变体归并（UR-1 余量）、`--shadow-sm/md/lg` 双文件不等价、多值简写复合 token（padding 212+margin 47）、`index.jsx` 视觉密度精简（1100 行）—— 归 UR-3
- ⏭️ **下一轮建议**：UR-2 无纯迁移任务 → 待人工设计拍板后再推进 UR-3；或由人工指定新任务（如 `index.jsx` 视觉密度精简需评审）

## 周期 70 已交付（2026-11-17，自动周期第二十二轮）

- ✅ **UI-REFACTOR UR-2 步骤7：`box-shadow` 重复值 scale 收敛**（等值零视觉变化）—— 审计：box-shadow 42 处/31 值（9 处已 `var(--shadow-sm/md/lg)`）。重复值（≥2 次）仅 2 个共 **7 处**：`0 12px 40px var(--ink-50)`×5（浮层面板：file-loader-popup/analysis-panel/print-export-panel 等）、`0 1px 4px var(--ink-30)`×2 → 新增 **2 个值命名 token** `--shadow-12-40-ink50`/`--shadow-1-4-ink30`；重复原始值 **7→0**，`var(--shadow-*)` 引用 9→16。**26 处单次 box-shadow 值**（状态环/`--primary-*` 光晕等，组件专属）留 UR-3 设计拍板。回归 css-duplication-audit **19/19**（新增 **A19**：重复 ≥2 次 box-shadow 原始值 0 + 无裸自定义属性 + 无 `)undefined`；负向验证：注入 1 处不触发 <2 阈值、注入 2 处 FAIL、还原 19/19）+ css-var-reference-guard 9/9 + design-token-audit 13/13；括号平衡 910/910；**`vite build` ✓ 6.18s**（503 modules，CSS 124.49 kB）。等值零视觉变化、双主题未破
- ⚠️ **关键发现（不自动改，已登记）**：`--shadow-sm/md/lg` 在 styles.css（`var(--ink-*)`，浅色下 alpha 0.25）与 theme.css 浅色主题（`rgba(15,23,42,*)`，alpha 0.06）**双文件定义且不等价**——属「样式重复」潜在不一致，级联决定何者生效；**修复需视觉 QA/设计拍板**，避免视觉回归
- ⏭️ **遗留**：`--shadow-sm/md/lg` 双文件不等价（视觉 QA）；26 处单次 box-shadow（UR-3）；`index.jsx` 视觉密度精简（1100 行）；多值简写（padding 212 + margin 47，需复合 token 决策）；间距语义阶梯 `--gap-*px`→语义档；UR-1 alpha 变体归一/单次色归并

## 周期 69 已交付（2026-11-16，自动周期第二十一轮）

- ✅ **UI-REFACTOR UR-2 步骤6：`padding`/`margin` 族单值 scale 收敛**（等值零视觉变化）—— 审计：padding 单值 49（含 `0`×16 清零）+ margin 单值 88（含 `0`×18、`auto`×3）；排除清零/auto/var 后**可迁移 102 处**（padding 32 + margin 70）。迁移 **102 处**→ `var(--gap-*)`（等值复用既有档：`6px`×26/`4px`×23/`8px`×16/`12px`×12/`10px`×7/`14px`×4/`16px`×4/`2px`×3/`1px`×2/`18px`×1/`24px`×1 + 新增 3 档 `--gap-20px`/`--gap-28px`/`--gap-30px`×各1）。padding/margin 单值原始值 **102→0**。**多值简写 259 处（padding 212/75 组合 + margin 47/35 组合）无法用单 token 表达**，需复合/方向性 token 设计决策（UR-3 待办）。回归 css-duplication-audit **18/18**（新增 **A18**：padding/margin 单值 0 + 无裸自定义属性 + 无 `)undefined`，负向注入验证 FAIL 后还原）+ css-var-reference-guard 9/9 + design-token-audit 13/13；括号平衡 910/910；**`vite build` ✓ 6.46s**（503 modules，CSS 124.40 kB）。等值零视觉变化、双主题未破
- ⚠️ **C69-B01（已规避）**：首版迁移脚本 `[^;}]*?` 惰性量词先匹配空值、回调返回原串后正则不再重试 → 0 迁移；改贪婪 `[^;}]*` + 回调内 `/\s/` 判别单值/多值（多值不动）后成功迁移 102 处。教训与 C68-B02/03 同源：**脚本化迁移必须以 `vite build` 为最终闸门**，A17/A18 已固化「无裸自定义属性」「无 `)undefined`」两项负向断言
- ⏭️ **遗留**：多值简写收敛（259 处，需复合 token 设计拍板）；间距语义阶梯 `--gap-*px`→语义档；阴影 scale 审计；`index.jsx` 视觉密度精简（1100 行）—— 均归 UR-2 收尾 / UR-3 待办

## 周期 68 已交付（2026-11-16，自动周期第二十轮）

- ✅ **UI-REFACTOR UR-2 步骤5：`gap` 间距 scale 收敛**（等值零视觉变化）—— `gap`/`row-gap`/`column-gap` 审计：声明 153 处，其中 140 处 `gap` + 1 处 `row-gap` 为原始 px 值（仅 12 处已 `var` 化）。新增 **9 个 token** `--gap-1px:1px`/`--gap-2px:2px`/`--gap-3px:3px`/`--gap-4px:4px`/`--gap-5px:5px`/`--gap-6px:6px`/`--gap-10px:10px`/`--gap-14px:14px`/`--gap-16px:16px`（取组件实际值）+ 复用既有 `--gap-1`(8px)×30/`--gap-2`(12px)×4/`--gap-3`(18px)×1；迁移 **141 处**。`gap` 族原始值 **141→0**，153/153 **100% var 化**。**命名决策**：既有 `--gap-1..4` 已占用纯数字后缀（8/12/18/24px 语义档），新增档一律用 `px` 后缀值命名以避命名冲突，并注释「值命名、非语义档」。回归 css-duplication-audit **17/17**（新增 **A17**：gap 原始值 0 + 无裸自定义属性 + 无 `)undefined`，已做双向负向注入验证）+ css-var-reference-guard 9/9 + design-token-audit 13/13；括号平衡 910/910；**`vite build` ✓ 6.25s**（503 modules，CSS 123.30 kB）。等值零视觉变化、双主题未破
- ⚠️ **本轮自纠 2 处脚本缺陷（已修复 + 加护栏）** —— **C68-B01** token 定义行守卫写成 `m.slice(0,0)` 恒为空（死代码）→ 定义行**行尾注释**里的 `gap:4px ×24` 文本被误迁 10 处，回滚重做为逐行跳过定义行/块注释行；**C68-B02/B03** 替换漏 `var()` 包裹 → 141 处裸自定义属性使 postcss 报 `Missed semicolon`，补修时 `px?`（=「`p`+可选`x`」）漏匹配 35 处、内层分组 `(px)?` 又使回调参数位错位拼出 `var(--gap-1)undefined` 并吞掉分号。教训：三门 spec 只看「var 是否已定义」，看不出「值是否被 var() 包裹」，**生产构建才是脚本化迁移的最终闸门**（A17 已固化两项负向断言）
- ⏭️ **遗留**：padding/margin/margin-top/margin-bottom 收敛（padding 原始 246 / margin 67 / margin-top 29 / margin-bottom 28）多值简写占比高需逐值核对；间距**语义阶梯**（`--gap-*px` 数值档 → 语义档）与 UR-1 的 alpha 变体归一、单次色归并同为需设计拍板的 **UR-3** 待办；阴影 scale 尚未审计

## 周期 67 已交付（2026-11-16，自动周期第十九轮）

- ✅ **UI-REFACTOR UR-2 步骤4：圆角 scale 收敛**（等值零视觉变化）—— `border-radius` 审计：183 条声明 / 20 个不同值，其中单值原始 px/% **156 处未收敛**（既有阶梯 `--radius-sm/md/lg/xl` 仅覆盖 22 处）。新增 **9 个 token**（`--radius-1:1px`/`--radius-3:3px`/`--radius-4:4px`/`--radius-5:5px`/`--radius-6:6px`/`--radius-9:9px`/`--radius-10:10px`/`--radius-full:50%`/`--radius-pill:999px`，取组件规则实际值）+ 复用既有 `--radius-sm`（`8px`×26）/`--radius-md`（`12px`×10，零新增 token）；迁移 **156 处**（`6px`×32/`4px`×27/`8px`×26/`10px`×22/`3px`×17/`999px`×10/`12px`×10/`50%`×6/`9px`×2/`5px`×2/`1px`×2）。单值原始 px/% 声明 **156→4**，已 token 化引用 22→**178**。仅处理「单值 + 非 var() + 非多值简写」声明，`0 6px 6px 0` 多值简写与 4 个单次档（`2px`/`14px`/`22px`/`28px`）刻意保持原样。回归：css-duplication-audit **16/16**（新增 **A16**「border-radius 单值已 token 化」）+ css-var-reference-guard **9/9** + design-token-audit **13/13**；括号平衡 **910/910**；**`vite build` ✓ 6.42s**（503 modules，CSS 121.68 kB）证明 CSS 可编译。等值零视觉变化、双主题未破
- ⏭️ **遗留**：半径**语义**阶梯归并（`--radius-1/3/4/5/6/9/10` 数值命名档 → 语义档）需设计拍板 + 视觉 QA，不属等值迁移；与 UR-1 的 alpha 变体归一、单次色归并同为 **UR-3** 待办

## 周期 66 已交付（2026-11-16，自动周期第十八轮）

- ✅ **UI-REFACTOR UR-1 色值收敛：状态/图表色 token 化（复用色全部收口）** —— 新增 10 个状态/图表色 token `--color-blue-300:#93c5fd`/`--color-blue-400:#60a5fa`/`--color-cyan-300:#67e8f9`/`--color-green-300:#86efac`/`--color-green-500:#22c55e`/`--color-green-flat:#2ecc71`/`--color-orange-300:#fdba74`/`--color-rose-300:#fda4af`/`--color-red-300:#fca5a5`/`--color-red-700:#b91c1c`（沿用 cycle-64 确立的 `--color-<hue>-<shade>` 命名约定与 Tailwind 色板档位，等值零视觉变化；`#2ecc71` 为 Flat UI Emerald 非 Tailwind 档，单列 `--color-green-flat`）；迁移 **23 处**状态/图表色（含 `--accent`、`--danger-border` 的回退位）；组件硬编码色值 **221→202**（hex 89→70；相对 cycle-38 基线 366 → **−45%**）。**UR-1 复用色（≥2 次）至此全部 token 化收口**：中性色 7 + 深色表面 9 + 状态色 10 = 26 个新 token / 迁移 72 处。余量 202 中 rgb 占 132（alpha 变体 183 值中 29 个 ≥2 次，多为单次用途的覆盖层/边框/阴影），归一需先定「alpha 阶梯语义」并配视觉 QA（会改变半透明观感，属视觉变化），与单次色（68 hex 值）归并同列 **UR-3** 待办。等值零视觉变化、双主题未破（0 未定义 var、括号平衡 910/910）。回归 css-duplication-audit **15/15**（新增 A15「状态/图表色已 token 化」）+ css-var-reference-guard 9 + design-token-audit 13 零失败

## 周期 65 已交付（2026-11-16，自动周期第十七轮）

- ✅ **UI-REFACTOR UR-1 色值收敛：深色表面 token 化** —— 新增 9 个深色表面 token `--surface-dark-0:#0b0d11`~`--surface-dark-8:#2a3142`（0=最深→8=最浅，取当前实际值等值零视觉变化）；迁移 **24 处**深色表面/边框色（`#0d1117`×3 + `#1a1f2b`×3 + `#1f2937`×3 + `#2a3142`×5 + `#0f1219`×2 + `#0b0d11`×2 + `#11141a`×2 + `#161a23`×2 + `#181c25`×2，含 `--surface-0/1/2`、`--card-strong`、`--panel-bg` 的回退位→`var(--token, var(--surface-dark-*))`）；组件硬编码色值 **238→221**（hex 106→89；相对 cycle-38 基线 366 → **−40%**）。`docs/guides/ur1-color-convergence-proposal.md` 已更新：剩余复用色仅剩**状态/图表色**（Tailwind 系 ~23 处，需设计定 `--chart-*`/`--status-*` 色板）与单次色（68 值，建议 UR-3 归并）。等值零视觉变化、双主题未破（0 未定义 var、括号平衡 910/910）。回归 css-duplication-audit **14/14**（新增 A14「深色表面已 token 化」）+ css-var-reference-guard 9 + design-token-audit 13 零失败

## 周期 64 已交付（2026-11-16，自动周期第十六轮）

- ✅ **UI-REFACTOR UR-1 色值收敛：中性色 token 化** —— 新增 7 个中性色 token `--color-white:#fff`/`--color-black:#000`/`--color-gray-300:#d1d5db`/`--color-gray-500:#888`/`--color-gray-600:#4b5563`/`--color-slate-100:#f1f5f9`/`--color-slate-400:#94a3b8`（等值零视觉变化）；迁移 **25 处**同值中性色（`#888`×8 + `#94a3b8`×6 + `#fff/#ffffff` + `#4b5563` + `#000` + `#d1d5db` + `#f1f5f9`，含 `var(--token, #hex)` 回退位→`var(--token, var(--color-*))`）；组件硬编码色值 **250→238**（相对 cycle-38 基线 366 → **−35%**）。新增 `docs/guides/ur1-color-convergence-proposal.md`：剩余复用色（主题深色 `#0d1117` 等 22 处 + 状态/图表 Tailwind 系 ~23 处）需**设计定语义命名**（`--surface-dark-*`/`--bg-*`/`--chart-*`/`--status-*`），单次色（68 值）建议 UR-3 归并——均非纯自动化，待拍板。等值零视觉变化、双主题未破（0 未定义 var、括号平衡 910/910）。回归 css-duplication-audit **13/13**（新增 A13「中性色已 token 化」）+ css-var-reference-guard 9 + design-token-audit 13 零失败

## 周期 63 已交付（2026-11-16，自动周期第十五轮）

- ✅ **UI-REFACTOR UR-4 行高方案 A：line-height 等值 token 化** —— 新增 8 个行高 token `--lh-none:1`/`--lh-tight:1.1`/`--lh-snug:1.4`/`--lh-normal:1.5`/`--lh-relaxed:1.6`/`--lh-loose:1.7`/`--lh-155:1.55`/`--lh-185:1.85`（等值零视觉变化）；迁移 **37 处** line-height（1×7 + 1.1×1 + 1.4×6 + 1.5×6 + 1.55×7 + 1.6×6 + 1.7×3 + 1.85×1）→`var(--lh-*)`；styles.css 真实 line-height 声明 **0 处原始值**。方案 B（归一化 `1.55→1.5/1.6`、`1.1→1`、`1.85→1.7`）留待视觉 QA。等值零视觉变化、双主题未破（0 未定义 var、括号平衡 910/910）。回归 css-duplication-audit **12/12**（新增 A12「line-height 已 token 化」）+ css-var-reference-guard 9 + design-token-audit 13 零失败

## 周期 62 已交付（2026-11-16，自动周期第十四轮）

- ✅ **UI-REFACTOR UR-4 字重 token 化（font-weight 阶梯）+ 行高审计基线** —— 新增 5 个字重 token `--fw-normal:400`/`--fw-medium:500`/`--fw-semibold:600`/`--fw-bold:700`/`--fw-extrabold:800`（等值零视觉变化）；迁移 **76 处** font-weight（600×50 + 500×13 + 700×6 + normal×4 + bold×2 + 800×1）→`var(--fw-*)`；styles.css 真实 font-weight 声明 **0 处原始值**。行高（line-height 37 处，8 个无单位比值 1/1.1/1.4/1.5/1.55/1.6/1.7/1.85）**只审计不改码**，基线+提案见 `docs/guides/ur4-line-height-baseline.md`（方案 A 等值 token 化待拍板，方案 B 归一化需视觉 QA）。等值零视觉变化、双主题未破（0 未定义 var、括号平衡 910/910）。回归 css-duplication-audit **11/11**（新增 A11「font-weight 已 token 化」）+ css-var-reference-guard 9 + design-token-audit 13 零失败

## 周期 61 已交付（2026-11-16，自动周期第十三轮）

- ✅ **UI-REFACTOR UR-4 字高收敛第二步：font-size 亚像素 10.5/11.5px token 化 + 修复 cycle-60 注释自引用缺陷** —— 新增 2 个亚像素 token `--fs-xs-half:10.5px`/`--fs-sm-half:11.5px`（等值保留零视觉变化）；迁移 3 处 `font-size:10.5/11.5px`→`var(--fs-xs-half/sm-half)`；**styles.css 真实 `font-size` 声明 268 处 var(--fs-*) + 25 处 rem/em/inherit（相对单位保留）+ 0 处原始 px**（绝对 px 100% token 化）。顺带还原 cycle-60 sed 污染的 13 条字号阶梯注释（`/* 原 font-size: var(--fs-*) ×M */`→`/* 原 font-size:Npx ×M */`，仅注释文本，token 值未受影响）。等值零视觉变化、双主题未破（0 未定义 var、括号平衡 910/910）。回归 css-duplication-audit 10 + css-var-reference-guard 9 + design-token-audit 13 零失败。会计更正：cycle-60「278 处」含 13 条污染注释误匹配，真实为 265 处 → 本轮 268 处

## 周期 60 已交付（2026-11-16，自动周期第十二轮）

- ✅ **UI-REFACTOR UR-4 字高收敛第一步：font-size 少频档全部 token 化**（styles.css，新增 8 个 token）—— 新增 `--fs-2xs:9px`/`--fs-xl:15px`/`--fs-2xl:16px`/`--fs-3xl:18px`/`--fs-4xl:20px`/`--fs-5xl:28px`/`--fs-6xl:30px`/`--fs-7xl:40px`（取实际值等值零视觉变化）；迁移 **38 处** 少频档 `font-size:9/15/16/18/20/28/30/40px`→`var(--fs-*)`；font-size 绝对档位 **281 处中 278 已 token 化（98.9%）**，剩 3 亚像素（`10.5px`×2/`11.5px`×1）暂留待人工视觉归一化；相对单位 `rem/em/inherit` 25 处保留（非绝对档位）。等值零视觉变化、双主题未破（0 新增未定义 var、括号平衡 910/910）。回归 css-duplication-audit 10 + css-var-reference-guard 9 + design-token-audit 13 零失败。说明：JS 导出模板（aiDocumentExporter/exporter）内联 24/18/15/13/12/11px 属独立 HTML 文档模板、不加载 styles.css，不纳入 `--fs-*` 收敛。

## 周期 48 已交付（2026-11-15，自动周期第十一轮）

- ✅ **UI-REFACTOR UR-2 第三步：迁移 13px/14px 到已建 `--fs-base`/`--fs-lg`**（styles.css，无新增 token）—— `13px`×29→`var(--fs-base)` + `14px`×18→`var(--fs-lg)` = **47 处**；font-size token 化累计 **238/285**（cycle47 191 + cycle48 47；剩余 47 为少频档 9~40px 各 1-7 次，收敛价值递减）。等值零视觉变化、双主题未破（0 新增未定义 var、括号平衡）。回归 css-duplication-audit 10 + css-var-reference-guard 9 + design-token-audit 13 + coords-classify 24 零失败。颜色基线不变

## 周期 47 已交付（2026-11-15，自动周期第十轮）

- ✅ **UI-REFACTOR UR-2 第二步：建立字号阶梯 token `--fs-*` + 迁移 Top3 高频字号** —— 新增 5 个 token（`--fs-xs:10px`/`--fs-sm:11px`/`--fs-md:12px`/`--fs-base:13px`/`--fs-lg:14px`，取当前最高频实际值等值零视觉变化）；迁移 **191 处** `font-size:10/11/12px`→`var(--fs-xs/sm/md)`（Top3 全收敛）。颜色基线不变（250，本轮只动 font-size）；CSS 括号平衡、0 新增未定义 var。更新 `css-duplication-audit.cjs` A9（原断言迁移前碎片化基线，改为断言迁移生效，legitimate 非弱化）。spec 10/10 全绿

## 周期 46 已交付（2026-11-15，自动周期第九轮）

- ✅ **转 UR-2 第一步：CSS 重复声明审计工具 + 可量化基线 + 字号阶梯提案** —— 新增 `scripts/css-duplication-audit.cjs`（可复用，`--json`/`--prop`）。**关键发现（纠正预设）**：index.jsx 仅 1 处内联 style（必需的动态 --left-w/--right-w），密度问题在 **CSS 膨胀**（styles.css 5723 行/3522 声明）而非 JSX。基线 **6261 行/3684 声明**；Top 重复 `display:flex`×162/`align-items:center`×90/`font-size:12px`×78；**font-size 极度碎片化**（10px×44/11px×65/12px×78/13px×28 + px 与 rem 混用）→ 收敛为 `--fs-*` 阶梯是「更简洁」核心抓手。spec `css-duplication-audit.cjs` **10 PASS**。基线报告 `docs/guides/ui-refactor-ur2-baseline.md`。**纯审计零视觉风险**

## 周期 45 已交付（2026-11-15，自动周期第八轮）

- ✅ **UR-1 续** `#ef4444`×2→`var(--danger)`（styles.css，无新增 token）—— **componentTotal 252→250（−2）**；L2962 渐变因此变主题自适应（light 起点略深，细微外观变化已记录）；L3136 文本色自适应安全。回归 css-var-reference-guard 9 + design-token-audit 13 全绿
- ⚠️ **UR-1 边际递减评估**：经 5 轮色值迁移 + 1 缺陷修复 + 本轮，**有精确 token 的安全迁移已基本做完**。剩余 250 中绝大多数是单次出现色值（逐个 token 化价值低）/ 需新建 token（设计判断）/ 主题相关 rgba（需视觉核对）。**结论：UR-1 纯自动化迁移已到边际递减点**，继续硬凑要么低价值要么有不可核对的外观风险；建议后续 UR-1 收尾需人工视觉核对配合，或**转向 UR-2**（精简 index.jsx 1100 行）。状态色 rgba 系本轮跳过（主题相关，需视觉核对）

## 周期 44 已交付（2026-11-15，自动周期第七轮）

- ✅ **UR-1 技术债：修复 CSS var 拼写错误缺陷 C44-B01 + 加护栏 spec** —— 诊断上轮记的「10 个未定义 var」：`--left-w`/`--right-w` 是 JS 注入、`--fg`/`--panel*` 是有意 fallback（均正常），而 **`--white-4`/`--white-5`/`--white-6`/`--white-8` 是拼写错误**（缺前导零，引用不存在的 token → 样式静默失效）。修复为 `--white-04`/`--white-06`/`--white-08`（恢复预期淡色背景）；新增护栏 spec `css-var-reference-guard.cjs` **9 PASS**（白名单放行 JS 注入/fallback，断言未定义引用==0 防复发）。回归 13+24+18 全绿；基线仍 252（typo 是 var 引用非硬编码）

## 周期 43 已交付（2026-11-15，自动周期第六轮）

- ✅ **技术债偿还 + UR-1 度量校准** 审计脚本排除 var() fallback hex —— `scripts/design-token-audit.cjs` 统计前先摘掉 `var(--tok, #fallback)` 整段，只计真硬编码（fallback 是 token 兜底，不应算硬编码）。**基线校准：289（旧虚高）→ 252（真实，styles 123 + theme 129，差值 37 即 fallback）**；spec 13/13 行为契约仍全绿（测结构/自洽非数字）；`--max` 闸门仍有效。后续迁移以 **252** 为准基线

## 周期 42 已交付（2026-11-15，自动周期第五轮）

- ✅ **UI-REFACTOR UR-1 第五步** 灰阶/淡色前景硬编码迁移（styles.css）—— 新增 2 token（`--text-meta: #6b7280` 次要文字 / `--primary-tint-fg: #b6c4ff` primary 淡色前景）；`#6b7280`×6→`var(--text-meta)` + `#b6c4ff`×6→`var(--primary-tint-fg)` = **12 处**；**componentTotal 301→289（−12）**，UR-1 累计 **366→325→319→301→289（−21%）**；双主题未破（2 token 已定义、括号平衡、0 新增未定义 var）；`--max` 闸门 289 PASS。**关键判断**：`#94a3b8`×6 全为 `var(--muted,#94a3b8)` fallback（已在用 token）→跳过；并发现审计脚本把 fallback hex 也计入（脚本局限，记技术债）。回归 13+24+30+18 零失败

## 周期 41 已交付（2026-11-15，自动周期第四轮）

- ✅ **UI-REFACTOR UR-1 第四步** `color:#fff`→`--on-accent-fg` + 品牌渐变去重（styles.css）—— 新增 2 token（`--on-accent-fg: #ffffff` 彩色底前景 / `--grad-brand` 品牌渐变）；`color:#fff`×12→`var(--on-accent-fg)` + `linear-gradient(135deg,#6366f1,#8b5cf6)`×3→`var(--grad-brand)` = **15 处**；**componentTotal 319→301（−18）**，UR-1 累计 **366→325→319→301（−17.8%）**；双主题未破（2 token 已定义、括号平衡、0 新增未定义 var）；`--max` 闸门 302 PASS。**刻意跳过** mask `#fff`×5（非前景文字）与 `var(--panel,#fff)` fallback。回归 13+24+30+18 零失败

## 周期 40 已交付（2026-11-15，自动周期第三轮）

- ✅ **UI-REFACTOR UR-1 第三步** 迁移次高频硬编码到既有语义 token（styles.css，无新增 token）—— `#4f6cff`×2→`var(--primary-strong)` / `#a8b0c6`×1→`var(--text-soft)` / `#fecaca`×3→`var(--level-error-fg)`；**componentTotal 325→319（−6）**，累计 **366→325→319**；等值替换零视觉变化、双主题未破（3 token 全已定义、括号平衡、0 新增未定义 var）；`--max` 闸门 319 PASS。**刻意跳过** `#ffffff`×7（语义歧义，待厘清文字/背景/边框分别映射）与无精确 token 的渐变色。修正 C40-B01（迁移脚本反向扫描误判→改正向扫描）

## 周期 39 已交付（2026-11-15，自动周期第二轮）

- ✅ **UI-REFACTOR UR-1 第二步** 迁移高频硬编码色值到语义 token（styles.css）—— `#f87171`×13→`var(--danger-soft-fg)`(新增 token) / `#4ade80`×10→`var(--success)` / `#fbbf24`×6→`var(--warn)` / `#c8d3ff`×7→`var(--primary-soft-fg)` / `#5ad1ff`×5→`var(--accent-500)`；**componentTotal 366→325（−41，−11%）**，等值替换零视觉变化、双主题未破（5 个 token 全已定义、CSS 括号平衡、未引入新未定义 var）；`--max` 闸门验证 325 PASS/324 FAIL。回归 design-token-audit 13 + coords-classify 24 + attrs-attrtable 30 零失败。发现既存 10 个未定义 var()（技术债，非本轮引入）

## 周期 38 已交付（2026-11-15，自动周期重启首轮）

- ✅ **UI-REFACTOR UR-1 第一步** 设计 token 审计工具 + 可量化基线 —— 新增 `scripts/design-token-audit.cjs`（可复用，支持 `--json`/`--max` 阈值；关键口径：区分「token 定义」vs「组件硬编码用法」，避免误判 theme.css 的 token 源）；基线 **token 定义 165 / 组件硬编码 366（hex 233+rgb 133）**，Top 热点=渐变与状态色；迁移验收闸门 `--max`（目标降到 ≤~180，−50%+）。spec `design-token-audit.cjs` **13 PASS**。基线报告 `docs/guides/ui-refactor-ur1-baseline.md`。**纯审计+度量，未改业务 CSS/JSX（零视觉风险）**

## 周期 24 已交付（2026-11-14，自动周期第十轮）

- ✅ **P2-3 第三批** checkpoint + 列显隐纯逻辑补单测 —— 新增 `tests/specs/editor-utils-checkpoint-colvis.mjs` **18 PASS**（注入全局 localStorage mock 离线可测：saveCheckpoint 返回/持久化/layerId 默认/attrs 深拷贝防御、loadCheckpoint 容错非法 JSON/无 items/items 非数组、clearCheckpoint、save→load→clear 往返、resolveVisibleColumns 全可见/过滤保序/忽略失效列/返回新数组）；**仅新增 spec 无源码改动**。回归 coords-classify 24 + attrs-attrtable 30 + fallback-clear 9 零失败。**P2-3 三批累计 72 子断言覆盖 editor/utils 纯函数**

## 周期 23 已交付（2026-11-14，自动周期第九轮）

- ✅ **P2-3 第二批** editor/utils 纯函数补单测（attrs + attrTableUtils）—— 新增 `tests/specs/editor-utils-attrs-attrtable.mjs` **30 PASS**（readAttrs PropertyBag 契约/数组防御、writeAttrs/updateAttr 不可变+置空删除、coerce number/boolean/null、pickAttrs 过滤保留字段、collectFields 类型推断升序、compareValues null 恒最后/类型序、sortFeatures asc/desc/不改原数组、matchesFilter 大小写不敏感、featuresToCsv BOM+CRLF+RFC4180 转义）；**仅新增 spec 无源码改动**。回归 coords-classify 24/24 + fallback-clear 9/9 零失败。`analysis.js` 因 `@turf/turf` 未安装离线跳过

## 周期 21 已交付（2026-11-13，自动周期第七轮）

- ✅ **P2-3 首批** editor/utils 纯函数补单测（coords + classify）—— 新增 `tests/specs/editor-utils-coords-classify.mjs` **24 PASS**（decToDMS 半球/UTM/MGRS/formatCoord 回落、equal/quantile 断点、unique 去重、classifyValue/UniqueIndex、rampColor/RAMPS/classifyFeatures）；**顺带修复 C21-B01**：`classify.js` `rampColor(i,n)` 当 `i>n-1` 越界致 `lerpHex` TypeError → clamp `i`/`lo`，内部路径零影响（spec D3/D4 固化）。回归 editor-fallback-clear 9/9 零失败

## 周期 19 已交付（2026-11-13，自动周期第五轮）

- ✅ **P1（进度池 Top4）** MCP 工具分类元数据层（camera/entity/animation/imagery）—— `client/src/pages/gis/mcpManifest.js`：冻结常量 `TOOL_CATEGORIES`（camera/entity/animation/imagery/general 兜底）+ `registerTool` 可选第 5 参 category（`_normalizeCategory` 非法回落 general）+ `listToolsByCategory(category?)` 全量分组/单组查询 + `manifestByCategory(category)` 按类子 manifest（serverInfo.name 带 `-<category>` 后缀）；默认 5 工具打标（getCameraState/flyTo→camera、addMarker/spatialQuery→entity、screenshot→imagery；animation 暂空，不凭空造）；unregister/_resetAll 同步清理。**纯增量**：manifest()/listTools()/registerTool 前参语义与既有导出全不变。spec `mcp-tool-categories.mjs` **22 PASS**；server 侧回归 46+29+19 零失败

## 周期 18 已交付（2026-11-13，自动周期第四轮）

- ✅ **P0-1 续（R-1701）** ASI03 workload identity 接入 `withGuardrail` 主链（**opt-in 默认关闭**）—— `server/middleware/aiGuardrails.js`：`DEFAULT_OPTIONS.workloadIdentity={enabled:false,...}` + `withGuardrail` 第 5 步（sanitize 后、execute 前）从 `ctx.workloadAttestation` 经 `verifyWorkloadAttestation` 强制校验（secret/seenNonces/maxAgeMs/expectedIdentity 透传），失败 `onRejected` + 抛 `workload_identity_rejected:<reason>`，缺失抛 `workload_identity_attestation_missing`。**签名不变 + 默认关闭 → 既有调用方行为零变化，判定非高风险通过准入**；与 allowlist/HITL/CB/sanitize 共存不抢优先级。spec `workload-guardrail-integration.cjs` **19 PASS**；回归 guardrails 39 + deep 38 + asi03 29 零失败

## 周期 17 已交付（2026-11-13，自动周期第三轮）

- ✅ **P0-1（进度池 Top3）** ASI03 SPIFFE-lite workload identity 实质化 —— `server/middleware/aiGuardrails.js` 增量新增 `deriveWorkloadId`（toolName+userId+sessionId 三元组 → SPIFFE-lite ID，字段编码防分隔符注入）+ `signWorkloadAttestation`（HMAC-SHA256 + nonce + ts）+ `verifyWorkloadAttestation`（缺字段→secret→expectedIdentity 绑定→workloadId 重派生一致性→签名→nonce 防重放→ts 过期）；复用既有 `_hmac*`/`_stableStringify`/`_generateNonce` 助手，不改既有导出/中间件签名。spec `workload-identity-asi03.cjs` **29 PASS**（目标≥18）；回归 guardrails 39 + deep 38 零失败。修复 C17-B01（自引入：插入截断 JSDoc → SyntaxError）

## 周期 16 已交付（2026-11-13，自动周期第二轮）

- ✅ **P0-1 续（R-1501）** LLM planner 适配层 —— `server/agent/llmPlannerAdapter.js`：注入 `llmChat` 抽象（不硬编码平台/密钥）+ `extractSteps` 健壮解析（围栏/散文/纯数组/单步对象/{steps} 包裹）+ 复用 multiAgentPlanner 的 `normalizeStep + detectCycle + allowlist` 门禁；危险操作仍由 executor HITL 拦截；`ai.js` require 延迟加载提升可选依赖健壮性。spec `multi-agent-llm-planner.cjs` **31 PASS**；回归 multi-agent-planner 46 + guardrails 39 + deep 38 零失败。修复 C16-B01（require 顺序 ReferenceError）

## 周期 15 已交付（2026-11-13，自动周期首轮）

- ✅ **P0-1** Multi-agent GIS Agent 骨架（planner + executor + verifier）—— `server/agent/multiAgentPlanner.js`：planner 按 capability/phase 编排 DAG（环检测 + 白名单 fail-fast）+ executor 依赖感知并行 + 危险操作 HITL 门（复用 aiGuardrails ASI09）+ verifier 契约校验（type/required/equals）；spec `multi-agent-planner.cjs` **46 PASS**（目标 ≥25）；回归 guardrails 39 + deep 38 + strategies 18 + fts5 18 零失败。集成路径见 `docs/cycles/cycle-15-multiagent-integration.md`

## 周期 8 已交付（2026-09-08）

- ✅ **P0-1** memory.js FTS5 全文检索（SQLite `_fts` 虚拟表 + bm25() 排序 + 同步触发器 + LIKE fallback）
- ✅ **P0-2** viewState DecompressionStream 浏览器原生解压（pako 仅做兜底）
- ✅ **P1-1** MCP manifest 浏览器侧暴露（`client/src/pages/gis/mcpManifest.js` + `window.mcp`）
- ✅ **P1-2** executeSandbox 统一调度器（vm / worker / iv / auto 四种 engine）
- ✅ **P1-3** memoryContextMiddleware Express ALS 自动注入
- ✅ **P1-4** METRICS_TRUSTED_CIDRS RFC1918 白名单（零依赖 IPv4 CIDR 解析）
- ✅ **P1-5** client/server 协议同步验证脚本（`scripts/check-protocol-sync.cjs`）
- ✅ **P2-1** OTLP push 评估 spec（结论：pull 已足够，push 暂不实施）
- ✅ **P2-2** helmet 8.x permissionsPolicy 再评估（关键发现：本项目 ^8.3.0 不输出 header）
- ✅ **Bug 修复** C8-B01 metricsOtlpHandler 缺失 import（周期 7 隐藏 bug）

## 周期 9 已交付（2026-09-08）

- ✅ **P0-1** server-import-completeness spec（静态扫描 server/* 模块导出完整性，防御 C8-B01 类隐藏 bug）
- ✅ **P0-2** memory.js WAL + journalMode/optimizePragma helpers（`PRAGMA journal_mode=WAL` + `synchronous=NORMAL` + `optimize` 触发；graceful fallback 无 better-sqlite3）
- ✅ **P1-1** MCP 真集成（`client/src/pages/gis/mcpManifest.js` 5 个核心 GIS 工具 + `installBridgeTransport` 修复 handler 返回值；19/19 sub-assertion PASS）
- ✅ **P1-2** sandbox perf benchmark spec（vm / worker / iv / auto 四 engine × 100/30 次；vm warm p50=0ms / worker-seq p50=628ms / worker-conc-5 p50=397ms）
- ✅ **P1-3** ErrorBoundary asyncGuard（`client/src/utils/asyncGuard.js` window.unhandledrejection + window.error 全局捕获；14/14 sub-assertion PASS）
- ✅ **P1-4** PR review workflow 接 MiniMax-M3（`anthropics/claude-code-action@v1` + `anthropic_base_url` + `--model MiniMax-M3 --max-turns 5`；18/18 sub-assertion PASS）
- ✅ **P2-1** metrics endpoint perf benchmark（`/api/metrics` p50=3ms p95=4ms；`/api/otlp/metrics` p50=2ms p95=3ms；20 并发 56ms）
- ✅ **P2-2** Permissions-Policy middleware 自研（`server/middleware/permissionsPolicy.js` 20 默认策略；helmet 8.x 验证不输出，替代实现；13/13 sub-assertion PASS）

## 周期 10 已交付（2026-09-08）

- ✅ **P0-1** mem0 pgvector self-host 评估（`docs/evaluation/mem0-postgres.md` + docker-compose 草稿；spec `mem0-postgres-eval.cjs` 22 PASS）—— 决策：< 10K 向量 prototype 不切换
- ✅ **P0-2** Agent memory 3 层架构评估（`docs/evaluation/agent-memory-3layer.md` CoALA + MemMachine + zylos；spec 15 PASS）—— 决策：渐进实施，当前 FTS5 = episodic 雏形
- ✅ **P1-1** PR review multi-specialist（`.github/workflows/pr-review.yml` 拆 baseline + security + design 三 specialist + concurrency cancel-in-progress；spec `pr-review-workflow-m3.cjs` 18 → 24 PASS）
- ✅ **P1-2** asyncGuard 上报 /api/telemetry（`client/src/utils/asyncGuard.js` opts.telemetryUrl + sendBeacon + keepalive；`server/routes/telemetry.js` POST localhost-only；`server/middleware/telemetryCollector.js` sliding buffer 1000 items / 1h TTL；spec 30 + 19 PASS）
- ✅ **P1-3** Sandbox worker pool（`server/agent/sandboxWorkerPool.js` LRU + reuse + idle timeout 60s + drain；warm p50 < 100ms vs 周期 9 baseline 628ms；spec 23 PASS）
- ✅ **P2-1** WebGPU + 3D Tiles 2.0 评估（`docs/evaluation/webgpu-3d-tiles.md`：覆盖率 73% < 80% 门槛 + 3D Tiles 2.0 KHR_gaussian_splatting OGC 2026-Q3 candidate；spec 11 PASS）—— 决策：暂不切换 backend

## 周期 12 已交付（2026-09-09）

- ✅ **P0-1** 混合检索 RRF（`server/agent/hybridRetrieval.js`：vector + FTS5 + recency 三通道 RRF 融合 + k0=60；spec `hybrid-retrieval-rrf.cjs` 37 PASS）
- ✅ **P1-1** useOptimistic + Guard 联合 hook（`client/src/hooks/useOptimisticAction.js` ESM；React 19 全路径 + React 18 fallback + shouldOptimistic；spec 28 PASS）
- ✅ **P1-2** SQLite 生产 pragma + 60s passive checkpoint（`server/agent/sqlitePragmas.js`：8 个 PRAGMA 配方 + 60s 后台 loop + stop()；spec 26 PASS）
- ✅ **P1-3** Worker thread trace carrier 注入（`server/agent/workerTraceCarrier.js`：attach/restore/childTraceparent/runInTraceContext；spec `worker-trace-carrier.cjs` 31 PASS 含真实 worker_threads round-trip）
- ✅ **P1-4** 3D Tiles 2.0 vector tiles + Gaussian splat 兼容层（`client/src/utils/tilesetLoader.js`：classifyTileset + chooseRenderMode + isFeatureSupported；spec 31 PASS）
- ⚠️ **P2-1** Viewer 真实改造（`client/src/hooks/useOptimisticMarker.js` 乐观 marker hook；spec 18 PASS；但**未真正接入 cesiumEarth.jsx addMarker**——下周期补足）
- ✅ **P2-2** OTel dev hook（`server/agent/otelDevHook.js` 真实 require OTel SDK + NODE_ENV=production 不安装 + runWithSpan ALS；spec 19 PASS）
- ✅ **P2-3** SSRF metadata IP cron 同步（`scripts/sync-metadata-ips.cjs` dry-run 默认 + markdown/json/csv 三格式解析；spec 23 PASS）
- ✅ **P2-3 docs** `docs/security/metadata-ips.md` 维护 AWS/GCP/Azure/IPv6 段

## 周期 13 已交付（2026-09-09）

- ✅ **P0-1** AI Agent 安全护栏 OWASP ASI01-10（`server/middleware/aiGuardrails.js`：5 步检查链 tool allowlist / dangerous HITL / circuit breaker / input sanitization / execute + 9 种注入模式；spec `ai-guardrails.cjs` 39 PASS）
- ✅ **P0-2** SQLite backend dispatch（`server/agent/sqliteBackend.js`：自动检测 bun → node 24+ → better-sqlite3 → memory fallback + 缺包 graceful fallback；spec 19 PASS）
- ✅ **P1-1** OTel worker 集成 + SQLite pragma 升级（otelDevHook.js 加 `withWorkerContext(carrier, fn)` + `getCurrentTraceparent()`；sqlitePragmas.js 加 `mode: 'PASSIVE' \| 'TRUNCATE'` + `checkSqliteVersion(driver) ≥ 3.51.3`；spec `otel-worker-integration.cjs` 15 PASS 含真实 worker_threads round-trip）
- ✅ **P1-2** Viewer marker 真实接入（`client/src/hooks/useOptimisticMarkerBridge.js`：包装 useOptimisticMarker + viewer ref + addMarker + removeMarker 回滚；spec `viewer-marker-integration.cjs` 21 PASS 含 cesiumEarth.jsx addMarker 契约）
- ✅ **P1-3** 混合检索 RRF 多样化（hybridRetrieval.js 加 `strategy: 'standard' \| 'best-rank' \| 'max+bonus' \| 'diminishing' \| 'soft-dedup'` + α/λ/β 参数；spec `hybrid-retrieval-strategies.cjs` 18 PASS + cycle-12 RRF spec 零回归）
- ✅ **P2-1** CesiumJS Gaussian splat loader（`client/src/utils/splatLoader.js`：classifySplatQuality 5 档 + loadGaussianSplatTileset stub + getRecommendedPreset fps 算法；spec 25 PASS）
- ✅ **P2-2** sqlite-vec 决策文档（`docs/evaluation/vector-extension-decision.md`：5 候选对比表 + 7 维度决策矩阵 + 触发条件 50K/100ms/1GB/metadata 过滤；spec 14 PASS）
- ✅ **P2-3** jsdom + RTL 集成测试脚手架（`client/src/hooks/useOptimisticMarker.test-instructions.js`：INSTALL_INSTRUCTIONS + 示例测试 renderHook + act；spec `jsdom-rtl-instructions.cjs` 20 PASS）

## 周期 14 已交付（2026-09-09）

- ✅ **P0-1** AI 安全护栏深化（OWASP ASI04/06/07 实质化）—— `aiGuardrails.js` 加 `validateManifest`（ASI04 供应链：source 白名单 / version semver 匹配 / HMAC 签名）+ `validateMemoryContext`（ASI06 记忆投毒：cross-user / replay nonce / override 系统字段）+ `signInterAgentMessage / verifyInterAgentMessage`（ASI07 通信签名：HMAC-SHA256 + nonce 防重放 + ts 过期）；spec `ai-guardrails-deep.cjs` 38 PASS
- ✅ **P0-2** memory.js 真实迁移 node:sqlite backend —— `MemoryStore` 构造函数走 `sqliteBackend.js` dispatch（自动检测 bun / node:sqlite / better-sqlite3 / 内存 fallback）；node:sqlite 适配（无 .pragma() 方法，用 exec('PRAGMA ...')）；close 后调用 silent 不抛错；spec `memory-node-sqlite-migration.cjs` 20 PASS（memory-fts5 / memory-wal-pragma / memory-vector-prototype / memory-als-sqlite 零回归）
- ✅ **P1-1** OTel worker SDK 集成 + LLM semantic span —— `otelDevHook.js` 加 `installWorkerSdk(carrier)` + `buildLlmSpanAttributes(opts)`（OpenTelemetry GenAI semantic conventions：gen_ai.system / gen_ai.request.model / gen_ai.usage.input_tokens / gen_ai.usage.output_tokens）+ `runWithLlmSpan(name, fn, llmAttrs)` + `getCurrentLlmAttributes()`；`server/services/ai.js` 加 `wrapWithLlmSpan(result, opts)`；spec `otel-worker-sdk-integration.cjs` 19 PASS
- ✅ **P1-2** RRF ablation spec + 启发式权重搜索 —— `hybridRetrieval.js` 加 `heuristicWeightSearch(store, evalSet, opts)`（5x5x5=125 组合 MRR 评估）+ `RRF_STRATEGIES` 导出；spec `hybrid-retrieval-ablation.cjs` 16 PASS + cycle-12/13 RRF spec 零回归
- ✅ **P1-3** hybridRetrieval OTel semantic span attributes —— `hybridRetrieval.js` 加 `buildRetrievalSpanAttributes(strategy, query, results)`（retrieval.strategy / query_length / result_count / top_score / gen_ai.operation）+ `search()` ALS 内触发；spec `hybrid-retrieval-otel-attributes.cjs` 13 PASS
- ✅ **P1-4** CesiumJS Splat pipeline 文档 —— `docs/guides/splat-pipeline.md`：从 GPS EXIF → COLMAP → SuGaR → Cesium ion 完整 6 阶段 pipeline + Microsoft campus asset 4547222 接入；spec `splat-pipeline-doc.cjs` 20 PASS
- ✅ **P2-1** handler-design checklist OWASP ASI 维度扩展 —— `docs/architecture/handler-design-checklist.md` 加 ASI01-10 全部 10 项检查清单 + spec-first 模式记录；spec `handler-checklist-asi.cjs` 15 PASS
- ✅ **P2-2** AI 风险映射文档扩展 —— `docs/security/ai-guardrails.md`：ASI03 SPIFFE-lite 决策 + ASI10 3 层防御决策 + ASI04/06/07 实质化细节 + 未来演进计划；spec `handler-checklist-asi.cjs` 同测 5 PASS

## 调研 Top5（由周期 14 调研产出，落周期 15+；覆盖周期 13 Top5）

> 调研全文见 `docs/cycles/cycle-14-research.md`（12 主题 × 5 链接 = 60 链接）。

| 排名 | 主题 | 行动 | 落点 |
| --- | ---- | ---- | ---- |
| 1 | **Multi-agent GIS Agent 升级**（GIS Copilot + GISclaw + LangGraph 模式） | 周期 15 落地：把单 agent + tool 升级为 planner + executor + verifier multi-agent；Python sandbox 集成；spec ≥25 PASS | 升级 ai.js |
| 2 | **node:sqlite + sqlite-vec 真实生产接入**（周期 14 已落 dispatch；周期 15 真实跑通 + sqlite-vec 评估触发） | 周期 15 落地：Node 24+ node:sqlite 真实生产；sqlite-vec 50K+ 向量时触发；spec ≥20 PASS | 升级 memory.js |
| 3 | **AI 安全护栏 ASI03 实质化（SPIFFE-lite）**（workload identity：tool-name + userId + sessionId 三元组签名） | 周期 15 落地：aiGuardrails.js 加 workloadIdentity()；spec ≥18 PASS | 升级 aiGuardrails |
| 4 | **cesium-mcp 集成升级**（cesiumjs-ai-starter-app 架构：camera / entity / animation / imagery 拆分） | 周期 15 落地：拆分 mcp server 4 个；spec ≥20 PASS | 升级 mcpManifest |
| 5 | **React 19 Compiler 启用 + useActionState 真实集成**（自动 memoization 删 2300 行 + Actions 集成） | 周期 15 落地：启用 React Compiler；useActionState 联合 hook；spec ≥15 PASS | 升级 client |

> 调研全文见 `docs/cycles/cycle-13-research.md`（12 主题 × 5 链接 = 60 链接）。

| 排名 | 主题 | 行动 | 落点 |
| --- | ---- | ---- | ---- |
| 1 | **AI 安全护栏深化**（OWASP ASI04/06/07 覆盖；OWASP AGT Reference Architecture + Microsoft AgentCore HITL） | 周期 14 落地：扩展 aiGuardrails.js 加 validateManifest / validateMemoryContext / signInterAgentMessage；spec ≥25 PASS | 升级 aiTools |
| 2 | **node:sqlite 真实迁移 memory.js**（webjsdev/webjs #668 + photostructure/node-sqlite + daftari #72） | 周期 14 落地：把 memory.js 从 better-sqlite3 切到 sqliteBackend.js dispatch；真实跑通 Node 24+ node:sqlite；spec ≥20 PASS | 升级 memory.js |
| 3 | **OTel worker SDK 真正集成 + LLM 语义化 span**（oneuptime 2026-02 worker threads + CSDN LLM semantic span） | 周期 14 落地：worker 内部 install() OTel SDK + ai.js 加 LLM semantic attributes（platform/model/tokens）；spec ≥18 PASS | 升级 telemetry |
| 4 | **CesiumJS 1.144+ 升级 + Splat pipeline 文档**（CesiumJS 1.145 vector drape + Microsoft campus 110M splats） | 周期 14 落地：升级 client Cesium 1.113 → 1.144+ + Microsoft Redmond campus Gaussian splat demo + docs/guides/splat-pipeline.md；spec ≥15 PASS | 升级 viewer |
| 5 | **RRF ablation + 自动权重调优**（AILS-NTUA nested RRF + Dell RAG Fusion Industry + Google RRF Tuning） | 周期 14 落地：ablation spec 对比 standard / best-rank / linear / diminishing + heuristic weight search；spec ≥20 PASS | 升级 hybridRetrieval |

## 周期 15 待办（2026-10-15 起，1h/轮）

> 周期 15 按"每轮一个任务"节奏推进；P0 优先，其次 P1。
> 来源：周期 14 调研 Top5 + L14-1 回归修复 + 反思驱动。

### P0（必须本轮完成）

- [x] **P0-1** 修复 hybrid-retrieval-rrf.cjs 6 FAIL 回归（L14-1）—— FTS5 node:sqlite 兼容 + halfLifeDays 边界。文件：`server/agent/hybridRetrieval.js` + `tests/specs/hybrid-retrieval-rrf.cjs`。验收：`tests/specs/hybrid-retrieval-rrf.cjs` 37 PASS（原 6 FAIL → 0 FAIL）。✅ 2026-10-15 R1

### P1（高优先级，至少完成 3 项）

- [x] **P1-1** node:sqlite + sqlite-vec 真实生产验证（周期 14 已落 dispatch；本轮验证 Node 24+ 真实运行 + sqlite-vec 评估触发）。验收：spec ≥ 20 PASS。✅ 2026-10-15 R2
- [x] **P1-2** ASI03 SPIFFE-lite workloadIdentity（workload identity：tool-name + userId + sessionId 三元组签名）。文件：`server/middleware/aiGuardrails.js`。验收：spec ≥ 18 PASS。✅ 2026-10-15 R3
- [x] **P1-3** Multi-agent GIS Agent 升级（planner + executor + verifier 架构）。文件：`server/services/ai.js`。验收：spec ≥ 25 PASS。✅ 2026-10-15 R4
- [x] **P1-4** cesium-mcp 拆分 4 个 server（camera / entity / animation / imagery）。文件：`client/src/pages/gis/mcpManifest.js`。验收：spec ≥ 20 PASS。✅ 2026-10-15 R5
- [x] **P1-5** React 19 Compiler 启用 + useActionState 真实集成。文件：`client/package.json` + `client/vite.config.js`。验收：spec ≥ 15 PASS。✅ 2026-10-15 R6

### P2（中低优先级，按预算与时间允许）

- [x] **P2-1** `client/src/pages/gis/editor/utils/*.js` 中 9 个工具类文件与 turf 互操作缺乏单元测试。✅ 2026-10-15 R1
- [x] **P2-2** `client/src/pages/gis/sandbox.js` 与 `server/agent/protocol/parse.js` 协议字符串重复实现 → 统一从 protocol.js 导出 + npm script 同步检查。✅ 2026-10-15 R2
- [x] **P2-3** `client/src/pages/gis/aiAgent.js` 体积大且无注释（待通读），P2 阶段拆分候选。✅ 2026-10-15 R3
- [x] **P2-4** 限流算法无回归验证（周期 6 已落 Token Bucket；确认 checkpoint 零回归）。✅ 2026-10-15 R4

### 已交付但仍在 upcoming 中（清理项）

- ✅ P0 SSRF metadata IP 同步（周期 6 P0-1 续）→ 移至周期 6 已交付
- ✅ P0 限流算法（周期 6）→ 移至周期 6 已交付
- ✅ P1 SQLite FTS5（周期 8）→ 移至周期 8 已交付
- ✅ P1 MCP 实际接入（周期 9）→ 移至周期 9 已交付
- ✅ P1 DecompressionStream（周期 8）→ 移至周期 8 已交付
- ✅ P1 Sandbox heap-snapshot（周期 6）→ 移至周期 6 已交付
- ✅ P2 helmet 8.x Permissions-Policy（周期 9）→ 移至周期 9 已交付
- ✅ P2 SSE Last-Event-ID buffer（周期 9 by 94c3622）→ 移至周期 9 已交付
- ✅ P2 OTel SDK 评估（周期 14）→ 移至周期 14 已交付
- ✅ P2 mem0 self-host 评估（周期 10）→ 移至周期 10 已交付
- ✅ P2 AI Agent 3-layer memory（周期 10）→ 移至周期 10 已交付
- 📌 **周期 116 收尾**：UR-3 六项（3a/3b/3b-2/3c/3d/3e/3f）已全部按拍板处置完毕——3a/3b/3b-2/3f 已执行交付，3c/3e 无操作，3d 无等值机械入口（转角色化设计拍板）。**剩余**：项1 cycle-77 人工冒烟（经公网 `https://129.204.202.173:5175/` 执行，待用户回报）；项2 `useGisPage` 拆分按用户拍板**暂缓**；3d 若用户给出角色化命名方向可续；`--space-*` 语义档/`--tracking-*` 命名空间为 3d 后续提供基础。
- ⏭️ **遗留**：cycle-77 人工浏览器冒烟测试 —— 现可经 **https://129.204.202.173:5175/** 执行（9 项：三列布局/拖拽分栏/面板折叠/代码执行沙箱/AI 助手/截图下载/分享链接/重置清空/双主题）；等待用户回报 `通过`/`失败：<现象>`。
