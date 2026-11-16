# cycle-70 审计

## 元信息

- 周期：70（自动周期第二十二轮）
- 分支：`feat/auto-cycle`
- 模型：sensenova-6.8-flash-lite
- 上下文压缩：否
- 变更风险：低（纯表现层等值 token 化 + spec 断言 + 文档）
- 时间窗：00:12 锁定 → 约 00:42 交付（约 30 min，单轮目标 20 min 未达成但远低于 40 min 硬超时）

## 任务目标

**UR-2 步骤7：`box-shadow` 重复值 scale 收敛**（等值零视觉变化）。

延续 UR-2 阴影 scale（UR-2 验收「统一间距/圆角/阴影 scale」）。审计：`box-shadow` 声明 42 处 / 31 个不同值，其中 9 处已 `var(--shadow-sm/md/lg)`。原始值 33 处中，**重复值（≥2 次）仅 2 个**：`0 12px 40px var(--ink-50)`×5、`0 1px 4px var(--ink-30)`×2，共 7 处；其余 28 处为**单次值**（组件专属，如状态环 `0 0 0 3px rgba(...)`、`--primary-*` 光晕等），token 化每个单次值会形成 28 个 token 的低价值扩张，故仅收敛重复值。

## 关键量化指标

| 指标 | 迁移前 | 迁移后 |
|---|---|---|
| `box-shadow` 原始值声明 | 33 | **26** |
| 重复（≥2 次）原始值 | **7**（2 个值） | **0** |
| 新增 token | — | **2** |
| 单次值（组件专属，留 UR-3） | 26 | 26（不动） |
| 已 `var(--shadow-*)` 化 | 9 | **16** |

**迁移明细（7 处）**：

| 原始值 | 次数 | 目标 token |
|---|---|---|
| `0 12px 40px var(--ink-50)` | 5 | `--shadow-12-40-ink50`（新增，浮层面板：file-loader-popup/analysis-panel/print-export-panel 等） |
| `0 1px 4px var(--ink-30)` | 2 | `--shadow-1-4-ink30`（新增） |

**token 命名决策**：×5 值用于多个面板/弹层（共享「浮层」阴影），但语义命名（如 `--shadow-xl`）属设计拍板；沿用既有**值命名**档（`--gap-*px` 先例）→ `--shadow-12-40-ink50`/`--shadow-1-4-ink30`，注释标注「值命名、非语义档」。

## 关键发现（不自动改，已登记）

**`--shadow-sm/md/lg` 在 styles.css 与 theme.css 双文件重复定义且浅色主题下不等价**：

- styles.css `:root`：`--shadow-sm: 0 2px 8px var(--ink-25)`（浅色下 `--ink-25 = rgba(15,23,42,0.25)`）
- theme.css 浅色主题块（行 232-235）：`--shadow-sm: 0 2px 8px rgba(15,23,42,0.06)`

两处 `--shadow-sm` 解析为 **alpha 0.25 vs 0.06** 的不同阴影，属「样式重复」潜在不一致（级联决定何者生效）。**修复需确定预期值（视觉 QA/设计拍板），不自动改**，避免视觉回归。已登记 UR-3 待办 + 风险台账。

## 门禁与验证

| 门禁 | 结果 |
|---|---|
| `css-duplication-audit` | **19/19 PASS**（新增 A19） |
| `css-var-reference-guard` | **9/9 PASS** |
| `design-token-audit` | **13/13 PASS**（颜色基线 202 不变） |
| CSS 括号平衡 | **910 / 910 balanced** |
| `vite build`（硬验证 CSS 可编译） | **✓ built in 6.18s**，503 modules，CSS 124.49 kB |
| 重复 box-shadow 原始值残留 | **0** |
| 裸自定义属性 / `)undefined` | **0 / 0** |

**A19 负向验证**：注入 1 处 `0 12px 40px var(--ink-50)` → 计数 1 < 2 阈值，不触发（预期）；注入 **2 处** → `[FAIL] A19`（报告 `x2`）；还原后 **19/19 PASS**。

## 变更文件

| 文件 | 变更 |
|---|---|
| `client/src/styles.css` | +2 个 `--shadow-*-ink*` token；7 处重复 box-shadow 值 → `var(--shadow-*)`；token 定义处注释记录双文件 `--shadow-sm/md/lg` 不等价发现 |
| `tests/specs/css-duplication-audit.cjs` | 新增 **A19**（重复 ≥2 次 box-shadow 原始值 0 + 无裸自定义属性 + 无 `)undefined`） |
| `docs/cycles/cycle-70-audit.md` / `cycle-70-dev-log.md` | 本文件 + 开发日志 |
| `docs/release-notes/upcoming-work.md` | 周期 70 条目 + 进度池勾选 |
| `state/cycle-state.json` | 周期 70 完成、锁释放 |

## 结论

- **PASS**：验收标准（重复 box-shadow 原始值 7→0、新增 2 token、等值零视觉变化、双主题未破）全部达成。
- 阻塞项：无。
- 遗留风险：中低。①`--shadow-sm/md/lg` 双文件不等价（需视觉 QA，不自动改）；②26 处单次 box-shadow 值（组件专属）需 UR-3 设计拍板。