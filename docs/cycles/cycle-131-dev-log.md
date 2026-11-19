# 周期 131 开发日志（2026-11-19，UR-4 Geo Dark Slice1）

## 输入

用户 2026-11-19 09:25 回复 5 项：① 地球加载正常；② 问 `EditorPanel` 是什么；
③ **主题/界面/UI 需完全重新设计**，当前这套不满意，可用插件/skill 找一套或自行设计；
④ 问 UR-3 3d「多值简写复合」与「角色化命名」是什么；⑤ 这些做完后再做 `useGisPage`。

已答复：
- `EditorPanel` = GIS 页面**右侧**可折叠面板（`index.jsx:181`，父容器 `colClass('right')`），
  含绘制工具/图层树/属性表/样式/量测分析/打印导出，可展开折叠。
- 3d「多值简写」= CSS 一次给两个数（如 `padding: 8px 12px`）；「角色化命名」= 按界面角色而非数值命名
  （`--pad-table-row` 而非 `--pad-8-12`）。**结论：UI 全面重设计将按新语义 token 直接定义间距，3d 被吸收结案。**

## 决策

- 方向经 `ask_user_question` 由用户选定：**深色专业 GIS 仪表盘**（非浅色 SaaS、非玻璃拟态）。
- 落地策略：**只改 token 值，不改组件规则**。项目 token 体系已由 UR-1/2/3 建成，
  组件规则全走 `var(--*)`，故重定义值即可全应用换装，零组件改动、零功能回归。

## 实施

1. 读 `theme.css`（540 行）+ `styles.css` `:root`（4–36、85–200）确认：
   暗基底值在 `styles.css :root`，语义别名/亮主题覆写/alpha 系列在 `theme.css`。
2. 写 `/tmp/restyle-geo-dark.py`（精确字符串替换 + 每处 count 断言，失配即报错退出），
   一次性替换：暗基底配色、半径阶梯、body 光晕、`theme.css` concrete 值、
   6 组 rgba 三色组（`108,140,255` / `239,68,68` / `251,191,36` / `34,197,94` / `196,163,255` / `rgba(11,13,17`）、
   `--neutral-soft-fg` / `--surface-elevated` / `--brand-title-gradient` / `--header-bg`。
3. 替换前核验：上述 rgba 三色组出现行号**全部落在 51–193 行（暗主题 `:root`）**，
   亮主题块从 207 行起、零命中 → 全局替换不会污染亮主题。
4. 补齐残留品牌色：`sed` 将 `#6c8cff` → `#3b9eff`（GIS 要素默认色 7 个文件 + `--link`），
   `ThemeProvider.jsx` `meta theme-color` `#0b1020` → `#0d1117`；`--link-hover` → `#2f81f7`。
5. 新增门禁 `tests/specs/geo-dark-palette-audit.cjs`（6 项）。
6. `vite build` → 线上 `curl` 核验新色已进入服务 CSS。

## 文件变更

- `client/src/styles.css`（暗基底配色 + 半径阶梯 + body 光晕）
- `client/src/theme.css`（concrete 值 + alpha 系列 + 具名暗主题值）
- `client/src/components/ThemeProvider.jsx`（meta theme-color）
- `client/src/pages/gis/CesiumEarth.jsx`、`client/src/pages/gis/examples.js`
- `client/src/pages/gis/editor/hooks/useDrawing.js`、`hooks/useSelection.js`、
  `StylePanel.jsx`、`utils/featureFactory.js`（地图要素默认色）
- `tests/specs/geo-dark-palette-audit.cjs`（新增门禁）
- `docs/cycles/cycle-131-audit.md`、`docs/cycles/cycle-131-dev-log.md`（新增）
- `docs/release-notes/upcoming-work.md`（UR-4 新需求 + Slice1-8 路线图）
- `state/auto-cycle-decisions.md`、`state/cycle-state.json`

## 验证

8 道既有设计门禁全 PASS + 新门禁 6/6 PASS + 括号配平净深度 0 + `vite build` 6.33s/505 modules +
线上核验 `#0d1117` / `#3b9eff` / `#22d3ee` 命中。

## 已知边界

- 亮主题本轮不动（列入 Slice7）。
- 地图要素色仍为字面量默认值，未读 CSS token → 技术债（如需 token 治理要跨模块重构）。
- 未擅自把「深色」设为硬默认（`ThemeProvider` 已默认 dark，但 `system` 模式跟随系统）。

## 下一步

Slice2：editor 面板族视觉重构（首个改组件规则的切片，单面板小范围验证密度与层次）。