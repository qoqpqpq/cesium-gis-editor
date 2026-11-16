# cycle-70 开发日志（2026-11-17，自动周期第二十二轮）

## 任务与验收

**UR-2 步骤7：`box-shadow` 重复值 scale 收敛**（等值零视觉变化）

> 选型理由：UR-2 验收「统一间距/圆角/阴影 scale」，间距（gap/padding/margin 单值）与圆角已收敛，**阴影是最后一个未收敛的 scale**。审计显示 box-shadow 42 处/31 值，原始值中仅 **2 个重复值（≥2 次）共 7 处**，其余 28 处为单次值（组件专属）。只收敛重复值，避免为单次值建 28 个低价值 token。

**验收标准**：
1. 重复（≥2 次）`box-shadow` 原始值声明 **7 → 0**；
2. 新增 token 取组件实际值（等值），双主题不破；
3. 新增 A19 断言，负向注入能拦截；
4. `vite build` 成功（CSS 可编译）。

## 执行

1. **占锁**：state 置 cycle 70 / in_progress / lock.held=true（00:12）。
2. **审计**：box-shadow 42 处/31 值；9 处已 var 化（sm/md/lg）；原始 33 处中重复值仅 2 个（`0 12px 40px var(--ink-50)`×5、`0 1px 4px var(--ink-30)`×2）；28 处单次值。
3. **命名决策**：×5 值用于多个面板/弹层（file-loader-popup、analysis-panel、print-export-panel），语义命名属设计拍板 → 沿用值命名档 `--shadow-12-40-ink50`/`--shadow-1-4-ink30`。
4. **迁移**：精确匹配完整值（防子串误匹配），7 处 → `var(--shadow-*)`。首版脚本 0 迁移（转义/替换逻辑差异），重写为正则预判 + replace 后成功迁移 7 处（5+2，逐项吻合）。
5. **关键发现（不自动改）**：`--shadow-sm/md/lg` 在 styles.css 与 theme.css 双文件定义，浅色主题下不等价（alpha 0.25 vs 0.06），属「样式重复」潜在不一致 → 已登记，需视觉 QA，避免视觉回归。
6. **护栏**：`css-duplication-audit` 新增 **A19**（重复 ≥2 次 box-shadow 原始值 0 + 无裸自定义属性 + 无 `)undefined`）；负向注入验证（1 处不触发 <2 阈值、2 处 FAIL、还原 19/19）。
7. **文档与状态**：audit + dev-log + upcoming-work + state（完成 + 释放锁）。

## 结果

- **迁移 7 处**（5+2），重复 box-shadow 原始值 **7 → 0**；`var(--shadow-*)` 引用 9 → 16。
- 新增 **2 个 token**：`--shadow-12-40-ink50` / `--shadow-1-4-ink30`。
- **门禁全绿**：css-duplication-audit **19/19**（含 A19）、css-var-reference-guard **9/9**、design-token-audit **13/13**、括号 **910/910**、**`vite build` ✓ 6.18s**（503 modules，CSS 124.49 kB）。
- 等值零视觉变化、双主题未破；0 裸自定义属性、0 `)undefined`。

## 遗留与下一轮

- **`--shadow-sm/md/lg` 双文件不等价**（styles.css `var(--ink-*)` vs theme.css 浅色 `rgba(15,23,42,*)`，alpha 0.25 vs 0.06）——需视觉 QA/设计拍板确定预期值，**不自动改**。
- **26 处单次 box-shadow 值**（状态环 `0 0 0 3px rgba(...)`、`--primary-*` 光晕等）——组件专属，需 UR-3 设计拍板（可能归并为语义阴影或状态色）。
- **`index.jsx` 视觉密度精简**（1100 行，UR-2 验收项）仍未开始；**多值简写**（padding 212 + margin 47）需复合 token 设计决策。