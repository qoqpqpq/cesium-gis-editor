# 周期 134 审计报告（2026-11-19，自动周期 · UR-4 Geo Dark Slice4）

## 0. 轮次定位

- 上一轮（133）交付 Slice3 基础控件族，状态 `in_progress`、当前项 `ui-redesign-slice4-tables-trees` → 本轮承接。
- 任务：**表格与树簇 token 化 + 陈旧字面量清除 + 半径收敛**。范围 = `.attr-table*` / `.editor-layer*` / `.query-builder*` / `.qb-*` / `.usage-table*`（100 个选择器）。

## 1. 改前审计（3 类残留）

| # | 缺陷 | 证据 |
|---|---|---|
| 1 | **陈旧字面量（非 token）**：`.attr-table thead th` bg `rgba(15,18,25,0.96)`；`.attr-add-field-bar` 色 `#e2e8f0`（旧 slate-200）；`.attr-table-btn.primary:hover` bg `rgba(34,197,94,0.35)`（旧 green-500）；`.btn-link.active/.small.active` 色 `var(--accent, var(--accent-500))` 死回退 | L5191 / L5163 / L4952 / L2085 |
| 2 | **值命名半径 `--radius-6`（6px）与语义 `--radius-sm`（6px）等值并存**（28 处引用） | L96 定义 |
| 3 | **裸 px**：`.usage-table th/td` 6/10、`.usage-table--compact` 4/8、`.btn-link.active` 2/6 | 多处 |

## 2. 统一规范（Geo Dark，该簇）

- **陈旧字面量 → token**：thead bg → `var(--overlay-95)`（0.96→0.95，alpha 归入 token）；字段色 `#e2e8f0` → `var(--text)`；green-500 hover → **新增 `--success-active-bg: rgba(63,185,80,0.32)`**（对称既有 `--danger-active-bg` 0.32，补齐 success 系缺失的 active/hover 档）；`.btn-link.active` 死回退 → `var(--link)`（Slice3 后续）。
- **半径收敛**：`var(--radius-6)` → `var(--radius-sm)` **全局 28 处**（等值 6px，零视觉变化），并**删除 `--radius-6` 定义**（已无引用）。`--radius-3/4/5/9/10` 无等值语义档，保留（不强行改变视觉）。
- **裸 px → token（零视觉变化）**：usage-table 6/10 → `--space-6px/--space-10px`；compact 4/8 → `--space-1/--space-2`（4px 为语义档 `--space-1`，非 `--space-4px`）；`.btn-link.active` 2/6 → `--space-2px/--space-6px`。
- **死回退全局清零（顺带）**：另 5 处 `var(--accent, var(--accent-500))`（`.nl-*` ×2、`.analysis-*`/`.style-panel-*` 背景 ×3）→ `var(--accent)`（`--accent` 恒定义，回退不可达，纯死代码删除，零视觉变化）。

## 3. 验收

| 门禁 | 结果 |
|---|---|
| tables-tree-audit（本轮新增，7 项） | **7/7 PASS** |
| 11 道既有设计门禁 | **11/11 PASS** |
| 括号配平（styles.css / theme.css 净深度） | 0 / 0 OK |
| `vite build` | 6.33s / 505 modules / rc=0 |
| 线上核验（`https://129.204.202.173:5175/`） | `var(--radius-6)` 0、`var(--accent,var(--accent-500))` 0、`rgba(15,18,25` 0、thead `--overlay-95` 1 处 |

**门禁拦截记录（重要）**：初版把 `.usage-table--compact` 写成 `var(--space-4px)` —— **`css-var-reference-guard` B1 立即拦截**（`--space-4px` 未定义）。修正为语义档 `--space-1`（4px 等值）。这正是「未定义 var 引用防复发」门禁的价值。
**S3 修正**：`top/right/bottom/left` 属定位坐标（`.attr-table-panel { top: 120px }`），非间距 token，从裸 px 扫描中排除（间距/圆角类才要求 token 化）。

## 4. 边界与诚实声明

- 本轮含 2 处跨簇顺带清理（`.nl-*`、`.analysis-*`/`.style-panel-*` 死回退）——均为**零视觉变化**死代码删除，不改变任何可见样式。
- `--radius-3/4/5/9/10`、`--overlay-85/92`、`--ink-35` 仍为值命名档（无等值语义档，强行收敛会改变视觉）→ 归入 Slice8 终审。
- 亮主题未动（Slice7）。

## 5. 下一轮

Slice5：全局 chrome + 二级控件（`.tabs/.tab` 主导航、`.sandcastle-*`、`.file-loader-btn`、`.editor-toolbar-btn`、`.editor-tool-btn`、`.ai-chip`、`.toast`、`.nav-item`）过渡/裸 px/死回退清理。