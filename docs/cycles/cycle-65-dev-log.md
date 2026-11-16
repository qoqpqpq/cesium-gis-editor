# cycle-65 开发日志（2026-11-16，自动周期第十七轮）

## 目标
UR-1 色值收敛第二步：**深色表面（暗色背景/面板/边框）token 化**（等值零视觉变化）。承接 cycle-64 中性色，处理 `docs/guides/ur1-color-convergence-proposal.md` 中标注的「主题深色 22 处」。

## 执行
1. 锁定深色复用值：复用值（≥2 处）共 **9 值 / 24 处**——`#2a3142`×5（边框/面板）、`#0d1117`×3、`#1a1f2b`×3、`#1f2937`×3、`#0f1219`×2、`#0b0d11`×2、`#11141a`×2、`#161a23`×2、`#181c25`×2。
2. 复核已有 token：`--surface-0/1/2` 为派生值（`var(--bg)`/`var(--card)`/`var(--surface-strong)`），与这些深 hex 不同值；`--bg:#0b1020`、`--bg-soft:#121935` 亦不等同。故需**新建** `--surface-dark-*` 阶梯，等值零视觉变化。
3. 新增 9 个 `--surface-dark-0`~`--surface-dark-8`（0=最深 `#0b0d11` → 8=最浅 `#2a3142`，暗→浅单一阶梯）。
4. 迁移 24 处深 hex → `var(--surface-dark-*)`（含 `--surface-0/1/2`、`--card-strong`、`--panel-bg` 的 `var(--token, #hex)` 回退位 → `var(--token, var(--surface-dark-*))`）；跳过 token 定义行；正则前后加 `[0-9a-fA-F]` 负前后向断言避免误伤更长 hex。
5. 新增 css-duplication-audit **A14** 断言：组件规则中无残留深色表面 hex（token 定义行除外）。

## 结果
- 组件硬编码色值：**238 → 221**（hex 106→89；相对 cycle-38 基线 366 → **−40%**）。
- 回归：css-duplication-audit **14/14**（A14 通过）+ css-var-reference-guard 9/9 + design-token-audit 13/13；括号平衡 910/910。
- 等值零视觉变化、双主题（light/dark）未破。

## 下一轮待办
- UR-1 **状态/图表色 token 化**（`--chart-*`/`--status-*`：`#93c5fd`/`#60a5fa`/`#67e8f9`/`#86efac`/`#22c55e`/`#2ecc71`/`#fdba74`/`#fda4af`/`#fca5a5`/`#b91c1c`，~23 处；需设计定色板 → 等值迁移可零风险，但**命名需设计拍板**）。
- UR-3 单次色（68 值）按组件归并（需设计方向）。
- R-1601 待真实 API Key + 可达平台。