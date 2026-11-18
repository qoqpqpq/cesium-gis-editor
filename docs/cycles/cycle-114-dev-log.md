# Cycle-114 开发日志

## 上下文
3b（间距 `--space-*`）已于周期 113 落位。本轮执行 3b-2（字距），与周期 113 同法：推荐命名族为规范定义 + `--ls-*` 纯别名层。

## 关键决策
- 命名 `--tracking-*` 而非 `--font-*`：letter-spacing 在排版术语为 tracking；`--font-*` 保留给字号/字重/行高族（避免 `--font-*` 被 letter-spacing 误用）。与 cycle-71 记录的「tracking-tight/normal/wide」推荐一致。
- 诚实边界：现有字距值（0.2/0.3/0.4/0.5/1/2px、0.02/0.05em、-0.4px）无干净语义 tier；归并=视觉变化 → 不强行语义化，以值命名档保留，语义 tier 后续可在 `--tracking-*` 命名空间叠加。

## 实现
1. 审计：`--ls-*` 9 个定义、24 处引用、无 theme.css 覆写。
2. 建 `--tracking-*` 9 个规范定义（值逐一相等）。
3. `--ls-*` → `var(--tracking-*)` 纯别名。
4. 门禁 tracking-token-namespace（5 条）全绿；既有 CSS 门禁回归全绿；构建 ✓。

## 风险与边界
- 纯别名层零视觉变化；`--tracking-*` 名无下划线，与 css-var-reference-guard 兼容。
