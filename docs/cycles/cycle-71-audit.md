# cycle-71 审计

## 元信息

- 周期：71（自动周期第二十三轮）
- 分支：`feat/auto-cycle`
- 模型：sensenova-6.8-flash-lite
- 上下文压缩：否
- 变更风险：低（纯表现层等值 token 化 + spec 断言 + 文档）
- 时间窗：01:12 锁定 → 约 01:42 交付（约 30 min，单轮目标 20 min 未达成但远低于 40 min 硬超时）

## 任务目标

**UR-2 步骤8：`letter-spacing` 字距 scale 收敛**（等值零视觉变化）。

UR-2 验收「统一字号/字重/行高/字距…scale」；前几轮已收敛字号（`--fs-*`）、字重（`--fw-*`）、行高（`--lh-*`），**字距（letter-spacing）** 是字体系列未收敛的 scale。审计：`letter-spacing` 声明 24 处 / 9 个值，**全部为原始值**（0 处 `var()`），重复值 6 个（≥2 次）共 21 处 + 单次值 3 处。

## 关键量化指标

| 指标 | 迁移前 | 迁移后 |
|---|---|---|
| `letter-spacing` 原始值声明 | 24 | **0** |
| 新增 token | — | **9** |
| 已 `var(--ls-*)` 化 | 0 | **24（100%）** |

**迁移明细（24 处，全部等值）**：

| 原始值 | 次数 | 目标 token |
|---|---|---|
| `0.5px` | 7 | `--ls-0-5px` |
| `0.05em` | 3 | `--ls-0-05em` |
| `1px` | 3 | `--ls-1px` |
| `0.3px` | 3 | `--ls-0-3px` |
| `0.4px` | 3 | `--ls-0-4px` |
| `0.02em` | 2 | `--ls-0-02em` |
| `-0.4px` | 1 | `--ls-neg-0-4px` |
| `2px` | 1 | `--ls-2px` |
| `0.2px` | 1 | `--ls-0-2px` |

**token 命名决策**：沿用**值命名**档（`--gap-*px`/`--shadow-*` 先例），取组件实际值。**关键约束**：token 名必须兼容 `css-var-reference-guard` 的 var 名正则 `/var\(\s*(--[a-zA-Z0-9-]+)/g`（**不含下划线**）——首版用 `--ls-0_5px` 下划线名，被 guard 截断为 `--ls-0` 判为「引用未定义」（B1/B5 FAIL）；重命名为纯连字符名（`--ls-0-5px` 等，27 处 = 7 定义 + 20 引用）后 guard 恢复 9/9。字距语义阶梯（tracking-tight/normal/wide）待设计拍板（UR-3 待办）。

## 门禁与验证

| 门禁 | 结果 |
|---|---|
| `css-duplication-audit` | **20/20 PASS**（新增 A20） |
| `css-var-reference-guard` | **9/9 PASS**（B1 曾 FAIL：`--ls-0`/`--ls-neg-0` 未定义，重命名后恢复） |
| `design-token-audit` | **13/13 PASS**（颜色基线 202 不变） |
| CSS 括号平衡 | **910 / 910 balanced** |
| `vite build`（硬验证 CSS 可编译） | **✓ built in 6.23s**，503 modules，CSS 124.91 kB |
| letter-spacing 原始值残留 | **0** |
| 裸自定义属性 / `)undefined` | **0 / 0** |

**A20 负向验证**：注入 `letter-spacing: 0.3px`（原始值）→ `[FAIL]`（报告 `0.3px x1`）；注入下划线名 `var(--ls-0_5px)` → `[FAIL]`（「token 名含下划线」）；还原后 **20/20 PASS**。

## 变更文件

| 文件 | 变更 |
|---|---|
| `client/src/styles.css` | +9 个 `--ls-*` token（纯连字符名）；24 处 letter-spacing 原始值 → `var(--ls-*)` |
| `tests/specs/css-duplication-audit.cjs` | 新增 **A20**（letter-spacing 原始值 0 + 无裸自定义属性 + token 名无下划线 + 无 `)undefined`） |
| `docs/cycles/cycle-71-audit.md` / `cycle-71-dev-log.md` | 本文件 + 开发日志 |
| `docs/release-notes/upcoming-work.md` | 周期 71 条目 + 进度池勾选 |
| `state/cycle-state.json` | 周期 71 完成、锁释放 |

## 本轮缺陷

- **C71-B01（已修复）**：token 名用下划线 `--ls-0_5px`，与 `css-var-reference-guard` 的 var 名正则 `[a-zA-Z0-9-]+` 不兼容 → guard 截断名判「未定义引用」（B1/B5 FAIL）。重命名 27 处（7 定义 + 20 引用）为纯连字符名，guard 恢复 9/9。**A20 固化「token 名无下划线」负向断言**，A17-A20 持续拦截该类回归。
- **C71-B02（已规避）**：首版迁移脚本无缺陷，24 处一次迁移成功（沿用 cycle-70 的逐行 + 转义精确值 + 正则预判模式）。

## 结论

- **PASS**：验收标准（letter-spacing 原始值 24→0、新增 9 token、等值零视觉变化、双主题未破）全部达成。
- 阻塞项：无。
- 遗留风险：低。字距语义阶梯（`--ls-*` 值档 → tracking 语义档）需设计拍板（UR-3 待办）。