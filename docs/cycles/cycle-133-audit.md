# 周期 133 审计报告（2026-11-19，自动周期 · UR-4 Geo Dark Slice3）

## 0. 轮次定位

- 上一轮（132）交付 Slice2 editor tab 族统一，状态 `in_progress`、当前项 `ui-redesign-slice3-buttons-forms` → 本轮承接。
- 任务：**Slice3 按钮/表单/输入控件族统一**。粒度控制：只统一**基础控件词汇**（`.btn*` / `.btn-primary` / `.input` / `.tag` / `.badge` / `.chip` / `.row` / `.divider` / `.error`，24 个选择器），不动二级按钮族（sandcastle / file-loader / editor-toolbar 等，归入 Slice5）。

## 1. 改前审计（5 类不一致）

| # | 缺陷 | 证据 |
|---|---|---|
| 1 | **双基座按钮规格分裂**：`.btn`（padding 8/14、fs 14、hover 实心 azure 填充）vs `.btn-primary`（padding 6/14、fs 12、`--radius-6`、bg `var(--accent, var(--primary-500))`） | L672 / L4279 |
| 2 | **死回退** `var(--accent, var(--primary-500))`（`--accent` 恒定义，回退不可达） | L4280 |
| 3 | **裸 px**：`.btn` 8/14、`.btn-primary` 6/14、`.input` 8/12、`.tag` 2/10、`.tag.small` 1/8、`.badge` 1/8、`.chip` 3/10、`.chip.small` 2/8、`.row`/`.row-between` margin 8、`.divider` margin 14、`.error` padding 8/12 | 多处 |
| 4 | **半径命名混用**：`--radius-6`（`.btn-primary` / `.badge`）与 `--radius-sm` 并存；`.chip` 裸 `14px` | L1948 / L4283 |
| 5 | **过渡硬编码**：`.btn` `all .2s ease`、`.chip` `all .15s`（未走 `--duration`/`--ease`） | L679 / L1955 |

## 2. 统一规范（Geo Dark，写入该簇）

- 间距全走 `--space-*`（等值 token 化，零视觉变化）；半径统一 `--radius-sm`；过渡统一 `var(--duration) var(--ease)`。
- **`.btn:hover` 由「实心 azure 填充」改为「azure 微光 + 边框」**（`--primary-18` / `--primary` 边框 / `--text`）——专业克制，不再整块高亮。
- `.btn.primary` / `.btn-primary` 补 `:hover { filter: brightness(1.08) }`。
- `.btn-link` 颜色 `--accent`(cyan) → `--link`(azure)：与站点链接一致，`--accent` cyan 保留给数据/量测高亮。
- `.btn-primary` **归一到 `.btn` 基座**：padding `--space-2 / --space-14px`、bg `var(--primary)`、radius `--radius-sm`、去死回退。

## 3. 验收

| 门禁 | 结果 |
|---|---|
| controls-family-audit（本轮新增，7 项） | **7/7 PASS** |
| 10 道既有设计门禁 | **10/10 PASS** |
| 括号配平（styles.css 净深度） | 0 OK |
| `vite build` | 6.33s / 505 modules / rc=0 |
| 线上核验（`https://129.204.202.173:5175/`） | `.btn:hover` 微光 1 处、`.btn-primary` bg azure 1 处；`var(--accent,var(--primary-500))` 0、`border-radius:14px` 0、`padding:6px 14px` 0 |

新门禁 `tests/specs/controls-family-audit.cjs` 锁定该簇 24 个选择器：
C0 齐备；C1 间距/圆角零裸 px（剥 `var()` 判定）；C2 `.btn-primary` 无死回退且 bg=azurE；C3 零 `--radius-6` 且零裸 radius px；
C4 transition 零硬编码秒；C5 `.btn:hover` = azure 微光（非实心）；C6 `.btn-link` color=--link。

## 4. 边界与诚实声明

- 本轮只动**基础控件词汇**。簇外仍有 ~14 条**二级按钮/切换**规则带硬编码过渡（`.sandcastle-ai-btn`、`.file-loader-btn`、`.editor-toolbar-btn`、`.editor-tool-btn`、`.output-send-ai`、`.ai-auto-toggle`、`.ai-chip`、`.file-drop-zone` 等）与裸 px（`.toast` 8/14、`.nav-item` 8/14、`.tab` 7/18）——**属独立家族**，归入 Slice5（全局 chrome + 二级控件）。
- **全局 `.tabs`/`.tab`**（L988-1002）为站点主导航，active 态为 `linear-gradient(135deg, var(--primary), var(--accent))`（azure→cyan，已与 `--grad-brand` 同源，视觉一致）＋ `box-shadow: 0 2px 12px var(--primary-35)`（硬编码阴影 px）＋ `padding: 7px 18px` / `--radius-9`——**未纳入 Slice2/3 簇**，列入 Slice5。
- 亮主题未动（Slice7）。

## 5. 下一轮

Slice4：表格与树（属性表 / QueryBuilder / 图层树 / AnalysisPanel 数据表）行高·斑马纹·表头统一。