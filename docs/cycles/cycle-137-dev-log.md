# 周期 137 开发日志（2026-11-19，UR-4 Geo Dark Slice7）

## 输入

`state/cycle-state.json`：`status=in_progress`、`current_item=ui-redesign-slice7-light-theme`。

## 范围

亮主题配套：与 Geo Dark 成对的浅色调，保双主题不破。

## 审计方法

1. 精算「暗 `:root`（styles.css + theme.css）定义 ∩ `var()` 被引用 − 亮覆写 − 主题无关 − 自动适配别名」→ **31 候选**。
2. 筛除：自动适配别名（`--border-default`/`--surface-1`/`--text-primary`，经亮覆写基 token 正确解析）、原始色板（`--indigo-*`）、主题无关（`--theme-transition-*`）、同值 no-op（`--on-accent-fg`/`--on-primary`/`--nav-active-color` 均 `#ffffff`）→ **16 真实覆写（亮≠暗）**。

## 实施

1. theme.css 亮块 `--success-border` 后插入「周期137 Slice7」组（16 项）：
   - 危险软/强 7 项（`--danger-soft-bg/border/fg`、`--danger-strong-bg/border`、`--danger-active-bg`、`--danger-hover-bg`）→ light red 系（`rgba(220,38,38,*)`、`--danger-soft-fg: #b91c1c`）。
   - 成功 `--success-active-bg` → `rgba(22,163,74,.25)`（与亮 `--success-bg` 同源）。
   - 浮层 `--overlay-85/92/95/96` + `--surface-elevated` → 白/浅底（`rgba(255,255,255,*)`/`rgba(250,251,253,*)`）。
   - 前景 `--primary-tint-fg: #2545c0`、`--text-meta: #5d6779`。
   - 品牌 `--grad-brand: linear-gradient(135deg,#4f6cff,#0891b2)`（亮 primary/accent 同源）。
   - 同值三项 `--on-accent-fg`/`--on-primary`/`--nav-active-color`（均 `#ffffff`）显式补齐（可读性/完整性）。
2. 深色 `:root` 零改动（双主题不破）。

## 门禁校准

`tables-tree-audit` S7 原断言 `--success-active-bg` 恰 1 处定义 → 周期 137 成对（暗 1 + 亮 1 = 2）→ 放宽 `=== 2 && 引用`。

## 文件变更

- `client/src/theme.css`（亮块新增 16+3 项成对覆写）
- `tests/specs/light-theme-coverage-audit.cjs`（新增门禁，6 项）
- `tests/specs/tables-tree-audit.cjs`（S7 校准）
- `docs/cycles/cycle-137-audit.md`、`docs/cycles/cycle-137-dev-log.md`（新增）
- `docs/release-notes/upcoming-work.md`（Slice7 结案）
- `state/cycle-state.json`

## 验证

15 道设计门禁全 PASS（14 既有 + 新增 6/6）＋ theme.css 括号配平 0 ＋ `vite build` 6.25s/505 modules ＋
线上核验：`data-theme=light]` 块在服务 CSS、`#4f6cff/#0891b2` grad-brand、`#b91c1c` danger-soft-fg、`rgba(255,255,255,.92)` overlay-92 均在。

## 下一步

Slice8：打磨 + 全量回归（Cesium 控件层适配、`#1f242d` 3 处、约 90 处裸 px、值命名档终审、全量 160 回归）。