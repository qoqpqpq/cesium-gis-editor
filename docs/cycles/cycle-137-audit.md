# 周期 137 审计报告（2026-11-19，自动周期 · UR-4 Geo Dark Slice7）

## 0. 轮次定位

- 上一轮（136）交付 Slice6 面板头部与节，状态 `in_progress`、当前项 `ui-redesign-slice7-light-theme` → 本轮承接。
- 任务：**亮主题配套**（与 Geo Dark 成对的浅色调，保双主题不破）。

## 1. 改前审计（亮主题成对缺口）

亮主题块（theme.css `:root[data-theme="light"]`）已存在且相当完整（暗值在 `:root`、亮覆写 116 项），但**暗定义·亮未覆盖·被使用**的主题相关 token 存在缺口 —— 亮主题会**借用暗值**（浅底不可读/深色浮层泄漏）。

精算（暗 `:root`（styles.css + theme.css）∩ 被 `var()` 引用 − 亮覆写 − 主题无关（spacing/radius/fs/color-*/surface-dark-*/indigo-* 等）− 自动适配别名）：**31 个候选** → 筛掉自动适配别名（`--border-default`/`--surface-1`/`--text-primary`，值引用 `--border`/`--card`/`--text` 经亮覆写正确解析）、原始色板（`--indigo-*`）、主题无关（`--theme-transition-*`）、同值 no-op（`--on-accent-fg`/`--on-primary`/`--nav-active-color` 均 `#ffffff`，两主题同值）后，**16 个真实覆写（亮≠暗）**。

## 2. 统一规范（亮主题成对，16 项）

| 类别 | token | 暗（借用） | 亮覆写 |
|---|---|---|---|
| 危险软/强 | `--danger-soft-bg` | rgba(248,81,73,.14) | rgba(220,38,38,.10) |
| | `--danger-soft-border` | rgba(248,81,73,.40) | rgba(220,38,38,.28) |
| | `--danger-soft-fg` | `#ff9492`（浅红，浅底不可读） | `#b91c1c`（red-700） |
| | `--danger-strong-bg` | rgba(248,81,73,.18) | rgba(220,38,38,.14) |
| | `--danger-strong-border` | rgba(248,81,73,.50) | rgba(220,38,38,.36) |
| | `--danger-active-bg` | rgba(248,81,73,.32) | rgba(220,38,38,.22) |
| | `--danger-hover-bg` | rgba(248,81,73,.45) | rgba(220,38,38,.28) |
| 成功 | `--success-active-bg` | rgba(63,185,80,.32) | rgba(22,163,74,.25)（与亮 `--success-bg` .08/.25 同源） |
| 浮层 | `--overlay-85` | rgba(13,17,23,.85)（深） | rgba(255,255,255,.85)（白） |
| | `--overlay-92` | rgba(13,17,23,.92) | rgba(255,255,255,.92) |
| | `--overlay-95` | rgba(13,17,23,.95) | rgba(250,251,253,.95) |
| | `--overlay-96` | rgba(13,17,23,.96) | rgba(250,251,253,.96) |
| | `--surface-elevated` | rgba(26,32,41,.94)（深） | rgba(255,255,255,.95) |
| 前景 | `--primary-tint-fg` | `#9ecbff`（浅蓝，浅底不可读） | `#2545c0`（深靛蓝） |
| | `--text-meta` | `#6e7683` | `#5d6779`（与亮 `--muted` 同级可读灰） |
| 品牌 | `--grad-brand` | linear-gradient(135deg,#2f81f7,#22d3ee) | linear-gradient(135deg,#4f6cff,#0891b2)（亮 primary/accent 同源） |

**原则**：只补**亮≠暗**的真实覆写；同值（`--on-*`/`--nav-active-color`）与自动适配别名不新增（避免冗余）。深色主题（`:root`）零改动 —— 双主题不破。

## 3. 验收

| 门禁 | 结果 |
|---|---|
| light-theme-coverage-audit（本轮新增，6 项） | **6/6 PASS** |
| 14 道既有设计门禁 | **14/14 PASS**（含 tables-tree-audit S7 校准） |
| theme.css 括号配平 | 0 OK |
| `vite build` | 6.25s / 505 modules / rc=0 |
| 线上核验（`https://129.204.202.173:5175/`） | `data-theme=light]` 块在服务 CSS；`#4f6cff/#0891b2` grad-brand、`#b91c1c` danger-soft-fg、`rgba(255,255,255,.92)` overlay-92 均在 |

**门禁校准记录**：`tables-tree-audit` S7 原断言 `--success-active-bg` 恰 1 处定义，周期 137 后成对（暗 `:root` 1 + 亮块 1 = 2）→ S7 放宽为 `=== 2 && 引用`。

## 4. 下一轮

Slice8：打磨 + 全量回归（Cesium infobox/toolbar/credits 控件层适配、`#1f242d` 残留 3 处、AI/聊天/sandcastle/col-picker 约 90 处裸 px、值命名档终审、全量 160 回归）。