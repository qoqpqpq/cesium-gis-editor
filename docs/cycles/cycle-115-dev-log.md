# Cycle-115 开发日志

## 上下文
3b/3b-2 已完成（`--space-*`/`--tracking-*` 落位）。本轮处理 3d（多值简写复合）与遗留的同类值级重复 fallback。

## 过程
1. **3d 可行性审计**：254 处多值简写、102 个唯一组合、90% 需 77 组合 → 判定无等值机械语义化入口（按组合建复合 token 会产出 100+ 值命名 token，纯 churn；语义命名需按角色设计 QA）。**不强行 token 化**，诚实记录，转角色化设计拍板。
2. **收口**：`--radius-base: var(--radius-md, 12px)`（theme.css:25）——`--radius-md` 在 `:root` 恒定义，fallback 永不可达 → `var(--radius-md)`（严格等值，同周期 112 shadow-elevated 处置）。
3. **门禁**：新增 stale-fallback-audit（3 条）；全套 CSS 门禁 + 构建回归全绿。

## 边界
- `--radius-base` 0 引用（定义-only 语义别名），保留不删（删除另立任务）。
- 未触碰任何简写声明；无行为改动。
