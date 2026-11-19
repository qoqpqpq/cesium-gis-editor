# 周期 135 审计报告（2026-11-19，自动周期 · UR-4 Geo Dark Slice5）

## 0. 轮次定位

- 上一轮（134）交付 Slice4 表格与树簇，状态 `in_progress`、当前项 `ui-redesign-slice5-chrome-secondary` → 本轮承接。
- 任务：**全局 chrome + 二级控件收敛**。范围 = `.nav-item` / `.tabs+.tab` / `.toast` / `.sandcastle-ai-btn` / `.output-send-ai` / `.ai-auto-toggle` / `.ai-chip` / `.sandcastle-run-btn` / `.sandcastle-icon-btn` / `.file-loader-btn` / `.file-drop-zone` / `.editor-toolbar-btn` / `.editor-tool-btn` / `.editor-action-row .btn-link` / `.model-chip` / `.key-item`（16 选择器，含顺带全站过渡统一）。

## 1. 改前审计（3 类残留）

| # | 缺陷 | 证据 |
|---|---|---|
| 1 | **硬编码过渡秒**：簇内 15 处 `transition: all 0.2s ease / 0.2s / 0.15s ease / 0.15s`；全站另有 **14 处属性型** `transition: background/transform/margin/border-color 0.1–0.2s`（含 1 处多行 `background 0.15s, width 0.15s`） | 全站合计 29 处非 token 过渡 |
| 2 | **裸 px**：`.nav-item` 8/14、`.tab` 7/18、`.toast` 8/14、`.sandcastle-ai-btn` 4/12、`.output-send-ai` 1/6、`.ai-auto-toggle` 3/8、`.ai-chip` 4/10、`.sandcastle-run-btn` 5/12、`.sandcastle-icon-btn` 5/8、`.file-drop-zone` 10/12、`.key-item` 8/10、`.model-chip` 6/10 | 多处 |
| 3 | **未收敛 azure→cyan 渐变**：`.nav-item.active` / `.hero-cta a:hover` / `.opacity-slider` 滑块 ×2（另 `.tab.active` 已由本簇覆盖）共 **5 处** `linear-gradient(135deg, var(--primary), var(--accent))`；`.toast` 背景 `rgba(20,24,32,0.92)` | 多处 |

## 2. 统一规范（Geo Dark，该簇）

- **过渡全站收敛**：29 处硬编码 → `var(--duration) var(--ease)`（`--ease=cubic-bezier(0.16,1,0.3,1)`，快起缓收，统一曲线；设计系统单一时长）。
- **裸 px → token（零视觉变化）**：8→`--space-2`、14→`--space-14px`、7→**新增 `--space-7px: 7px`**（无等值档，零视觉变化）、18→`--space-18px`、4→`--space-1`、12→`--space-3`、1→`--space-1px`、6→`--space-6px`、3→`--space-3px`、10→`--space-10px`、5→`--space-5px`、6/10→`--space-6px/--space-10px`。
- **渐变统一**：5 处 azure→cyan + `.tab.active` → `var(--grad-brand)`（品牌渐变去重，UR-1 意图）。
- **`.toast` 背景** `rgba(20,24,32,0.92)` → `var(--overlay-92)`（等值）。
- **边界（不改）**：`.sandcastle-run-btn` 硬编码绿 `#27ae60/#229954/rgba(46,204,113,0.3)` 保留 —— sandcastle 演示页为独立品牌区，且 `geo-dark-palette-audit` 不拦绿色（仅旧 indigo/violet 字面量）；如需改需新增 `--success-strong`，归 Slice8 终审。

## 3. 验收

| 门禁 | 结果 |
|---|---|
| chrome-secondary-audit（本轮新增，7 项） | **7/7 PASS** |
| 12 道既有设计门禁 | **12/12 PASS** |
| 括号配平（styles.css 净深度） | 0 OK |
| `vite build` | 6.27s / 505 modules / rc=0 |
| 线上核验（`https://129.204.202.173:5175/`） | 硬编码过渡 0、`--space-7px: 7px` 已定义且 `.tab` 使用、`rgba(20,24,32` 0、`--grad-brand` 8 处使用 |

**门禁校准记录**：K1 初版「全站零硬编码过渡秒」被 **14 处属性型过渡**（非簇内 `all` 型）命中 → 判定同属「全站过渡统一」，一并收敛（含 1 处多行）后 K1 归零。K2 初版 `.model-chip` `padding: 6px 10px` 裸 px（块内，非全局唯一）→ 块内作用域替换。

## 4. 下一轮

Slice6：编辑器面板头部（`.editor-panel` / `.panel-header` / `.section-title` / `.panel-collapse` / `.drag-handle` 等）过渡/裸 px/死回退清理。