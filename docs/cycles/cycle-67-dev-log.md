# cycle-67 开发日志（2026-11-16，自动周期第十九轮）

## 任务与验收
**UR-2 步骤4：圆角 scale 收敛**（等值零视觉变化）。
验收（可量化）：
1. `border-radius` 单值原始 px/% 声明数显著下降；
2. 0 未定义 var、CSS 括号平衡；
3. 新增护栏断言防回归；
4. 生产构建通过（证明 CSS 可编译）。

## 执行
1. 审计现状：`border-radius` 共 **183** 条声明、20 个不同值；其中 182 条为单值、1 条多值简写（`0 6px 6px 0`）；已 token 化仅 22 处（`--radius-md`×9/`--radius-lg`×6/`--radius-sm`×6/`--radius-xl`×1），**154 条原始 px + 6 条 `50%` 未收敛**。
2. 对照既有阶梯 `--radius-sm:8px / --radius-md:12px / --radius-lg:16px / --radius-xl:20px`：`8px`×26、`12px`×10 可**直接映射既有 token（零新增）**。
3. 新增 9 个 token（取组件规则实际值，等值）：`--radius-1:1px` / `--radius-3:3px` / `--radius-4:4px` / `--radius-5:5px` / `--radius-6:6px` / `--radius-9:9px` / `--radius-10:10px` / `--radius-full:50%` / `--radius-pill:999px`。
4. 脚本化迁移：**仅处理单值、非 `var()`、非多值简写**的声明；跳过 token 定义行；多值简写（`0 6px 6px 0`）与单次档（`2px`/`14px`/`22px`/`28px`）保持原样。共迁移 **156 处**。
5. 新增 css-duplication-audit **A16** 断言：单值原始 `border-radius` 只能落在白名单 `{2px,14px,22px,28px}`（已记录的单次档，待设计拍板半径语义）。

## 结果
| 指标 | 迁移前 | 迁移后 |
|------|--------|--------|
| `border-radius` 总声明 | 183 | 183（不变）|
| 单值原始 px/% 声明 | **156** | **4**（2px/14px/22px/28px 各 ×1）|
| 已 token 化引用 | 22 | **178** |

- 迁移明细：`6px`×32→`--radius-6`、`4px`×27→`--radius-4`、`8px`×26→`--radius-sm`（既有）、`10px`×22→`--radius-10`、`3px`×17→`--radius-3`、`999px`×10→`--radius-pill`、`12px`×10→`--radius-md`（既有）、`50%`×6→`--radius-full`、`9px`×2→`--radius-9`、`5px`×2→`--radius-5`、`1px`×2→`--radius-1`。
- 回归：css-duplication-audit **16/16**（新增 A16 通过）、css-var-reference-guard **9/9**、design-token-audit **13/13**；括号平衡 **910/910**；`vite build` **✓ 6.42s**（503 modules，CSS 产物 121.68 kB）——证明 CSS 可编译、无语法破坏。
- 等值零视觉变化（每个值原样搬入 token），双主题未破。

## 遗留与下一轮
- 4 个单次档（`2px`/`14px`/`22px`/`28px`）+ 1 条多值简写（`0 6px 6px 0`）未迁移：属一次性/边角语义，收敛价值低。
- **半径语义阶梯待设计拍板**：数值命名档（`--radius-1/3/4/5/6/9/10`）如实标注、非语义档；待设计定「小/中/大/胶囊」档位后可归并为语义阶梯（属**视觉变化**，需视觉 QA）。
- 下一轮候选：UR-2 阴影/间距 scale 审计（`box-shadow` 已基本 token 化）、UR-3 组件视觉统一、或 UR-1 的 alpha 变体阶梯语义。