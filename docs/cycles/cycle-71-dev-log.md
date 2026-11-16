# cycle-71 开发日志（2026-11-17，自动周期第二十三轮）

## 任务与验收

**UR-2 步骤8：`letter-spacing` 字距 scale 收敛**（等值零视觉变化）

> 选型理由：字体系列 scale（字号 `--fs-*`/字重 `--fw-*`/行高 `--lh-*`）已收敛，**字距（letter-spacing）是最后一个未收敛的字体 scale**。审计：24 处声明 / 9 值，全部为原始值（0 var()），重复值 6 个（≥2 次）共 21 处 + 单次值 3 处。

**验收标准**：
1. `letter-spacing` 原始值声明 **24 → 0**；
2. 新增 token 取组件实际值（等值），双主题不破；
3. 新增 A20 断言，负向注入能拦截（原始值 + 下划线名两种）；
4. `vite build` 成功（CSS 可编译）。

## 执行

1. **占锁**：state 置 cycle 71 / in_progress / lock.held=true（01:12）。
2. **审计**：letter-spacing 24 处 / 9 值（0.5px×7、0.05em×3、1px×3、0.3px×3、0.4px×3、0.02em×2、-0.4px×1、2px×1、0.2px×1），全原始。
3. **token 决策**：值命名档（沿用 `--gap-*px`/`--shadow-*` 先例），9 个 token。
4. **迁移**：沿用 cycle-70 的「逐行 + 转义精确值 + 正则预判 + replace」模式，24 处一次迁移成功。
5. **门禁拦截 → 修复**：`css-var-reference-guard` B1/B5 FAIL（`--ls-0`/`--ls-neg-0` 未定义）——首版 token 名用下划线 `--ls-0_5px`，而 guard 的 var 名正则 `/var\(\s*(--[a-zA-Z0-9-]+)/g` 不含下划线，把 `--ls-0_5px` 截断为 `--ls-0` 判未定义。重命名 27 处（7 定义 + 20 引用）为纯连字符名 `--ls-0-5px` 等，guard 恢复 9/9。**A20 固化「token 名无下划线」负向断言**（与 guard 兼容性硬约束）。
6. **护栏**：`css-duplication-audit` 新增 **A20**（原始值 0 + 无裸自定义属性 + 无下划线名 + 无 `)undefined`）；负向注入验证（原始值 FAIL / 下划线名 FAIL / 还原 20/20）。
7. **文档与状态**：audit + dev-log + upcoming-work + state（完成 + 释放锁）。

## 结果

- **迁移 24 处**，letter-spacing 原始值 **24 → 0**（100% var 化）。
- 新增 **9 个 token**：`--ls-0-5px`/`--ls-0-05em`/`--ls-1px`/`--ls-0-3px`/`--ls-0-4px`/`--ls-0-02em`/`--ls-neg-0-4px`/`--ls-2px`/`--ls-0-2px`。
- **门禁全绿**：css-duplication-audit **20/20**（含 A20）、css-var-reference-guard **9/9**（重命名后）、design-token-audit **13/13**、括号 **910/910**、**`vite build` ✓ 6.23s**（503 modules，CSS 124.91 kB）。
- 等值零视觉变化、双主题未破；0 裸自定义属性、0 `)undefined`。

## 遗留与下一轮

- **字距语义阶梯**（`--ls-*` 值档 → tracking-tight/normal/wide 语义档）需设计拍板（UR-3 待办）。
- **`--shadow-sm/md/lg` 双文件不等价**（cycle-70 发现，需视觉 QA）。
- **26 处单次 box-shadow** + **单次色/alpha 变体**（UR-1 余量）需 UR-3 设计拍板。
- **`index.jsx` 视觉密度精简**（1100 行，UR-2 验收项）仍未开始；**多值简写**（padding 212 + margin 47）需复合 token 设计决策。

> 注：UR-2 的纯自动化可收敛 scale（字号/字重/行高/圆角/gap/padding-margin 单值/阴影重复值/字距）已全部完成。**剩余项均需设计拍板或视觉 QA**（语义阶梯、单次值归并、`index.jsx` 视觉密度、多值简写复合 token、双文件阴影不等价），不再有「无验证项」的纯迁移任务。