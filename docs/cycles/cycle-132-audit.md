# 周期 132 审计报告（2026-11-19，自动周期 · UR-4 Geo Dark Slice2）

## 0. 轮次定位

- 上一轮（131）交付 Slice1 主题基底，状态 `in_progress`、当前项 `ui-redesign-slice2-editor-panels` → 本轮承接。
- 任务：**Slice2 editor 面板族视觉重构**，聚焦最明确的一致性缺陷 —— **3 套 tab 族的视觉规范分裂**。
- 粒度控制：单轮只统一 tab 簇（16 个选择器），不动其他组件规则。

## 1. 改前审计（4 类不一致）

| # | 缺陷 | 证据 |
|---|---|---|
| 1 | **active 态 hue 分裂**：同一「选中 tab」角色渲出两种颜色 | `.et-tab.active` 用 `--accent`(cyan)，`.editor-layer-tab.active` / `.style-panel-tab.active` 用 `--primary`(azure) |
| 2 | **死回退**：`var(--accent, var(--color-blue-400))` ×3 —— `--accent` 恒定义，回退永不可达 | styles.css L3987-3988、L4006 |
| 3 | **hover 态缺失**：`.style-panel-tab` 无 `:hover`，另两族均有 | L5706-5715 |
| 4 | **裸值 / 半径命名混用**：`padding: 5px 0`、`margin: 2px 8px 4px`、`padding: 10px 12px !important`、`border-radius: 0 6px 6px 0`、裸 `rgba(96,165,250,*)`；半径同时存在 `--radius-6`（值命名档）与 `--radius-sm` | L5709、L3997-4001、L4335/5704 |

## 2. 统一规范（Geo Dark，写入本簇全部规则）

- **inactive**：`color: var(--text-soft)` / `background: var(--white-04)` / `border: 1px solid var(--white-08)`
- **hover**：`background: var(--white-08)`（`.style-panel-tab` 补齐）
- **active**：`background: var(--primary-18)` / `border-color: var(--primary-30)` / `color: var(--text)`
- **底部指示器型**（`.et-tab`）额外：`border-bottom: 2px solid var(--primary)`
- 半径统一 `var(--radius-sm)`；间距全部走 `--space-*`；边框粗细（2px 指示线）保留 px —— 属线条规格，非间距 token
- 高亮块 `.et-highlight-section`：裸 rgba → `var(--primary-30)` / `var(--primary-06)`（±2% alpha 归入 token，视觉近似）
- 过渡统一 `var(--duration)`（0.25s），原 `.et-tab` 为 `0.15s`，微慢一档换取全局一致

## 3. 验收

| 门禁 | 结果 |
|---|---|
| editor-tab-family-audit（本轮新增，7 项） | **7/7 PASS** |
| 9 道既有设计门禁 | **9/9 PASS** |
| 括号配平（styles.css 净深度） | 0 OK |
| `vite build` | 6.45s / 505 modules / rc=0 |
| 线上核验（`https://129.204.202.173:5175/`） | `et-tab:hover` / `style-panel-tab:hover` / `et-tab.active` / `style-panel-tab.active` 各 1 处；`var(--accent,var(--color-blue-400))` 残留 **0**；裸 `padding:5px 0` 残留 **0** |

新门禁 `tests/specs/editor-tab-family-audit.cjs` 锁定该簇 16 个选择器，防后续周期回归：
T0 选择器齐备；T1 零 `--color-blue-400` 死回退；T2 active 统一 `--primary`；
T3 间距/圆角类属性零裸 px（剥离 `var()` 后判定，避免把 `--gap-4px` 值命名档误判为裸值）；
T4 零 `--radius-6`；T5 三族 inactive 前景统一 `--text-soft`；T6 `.style-panel-tab:hover` 存在。

## 4. 边界与诚实声明

- 本轮**只动 1 个簇**（16 个选择器）。editor 其余 265 个选择器的 header/表格/按钮族留待 Slice3-5。
- `.editor-loading-hint` 的 `--radius-6` 仍在（不在本簇），归入后续收敛。
- `--color-blue-400` 这个 token **仍定义着**（styles.css L70，Tailwind blue-400），只是本簇不再引用；
  其余图表/信息用途仍在使用，故未删除。
- 亮主题块未动（Slice7 配套）。

## 5. 下一轮

Slice3：按钮 / 表单 / 输入控件族（button · input · tab · tag · badge）统一视觉语言。