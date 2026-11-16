# UI 重构 UR-2：CSS 重复声明审计基线报告

> **周期**: 46（2026-11-15，自动周期第九轮）
> **需求**: UI-REFACTOR（用户 2026-11-14 新增，P2）
> **阶段**: UR-2 布局与密度简化 —— 第一步「建立可量化基线」
> **审计工具**: `scripts/css-duplication-audit.cjs`（可复用，支持 `--json` / `--prop <属性>`）

---

## 1. 目的

为 UI 重构「更简洁」目标提供**可量化基线**。UR-1（色值 token 化）已收敛，UR-2 转向**布局与密度**——核心抓手是 CSS 声明重复度（重复越多越不简洁）。

## 2. 关键发现：密度问题不在 JSX 内联，而在 CSS 膨胀

- `client/src/pages/gis/index.jsx` **仅 1 处内联 `style={{}}`**（且是必需的动态 `--left-w`/`--right-w`），样式主要走 `className` + CSS。
- 真正的「不简洁」在 **CSS 本身**：`styles.css` **5723 行 / 3522 声明**，重复度极高。

> 这个发现纠正了「index.jsx 1100 行 = 内联样式多」的预设——密度问题在 CSS，不在 JSX。

## 3. 基线数据（2026-11-15，cycle 46）

| 指标 | 数值 |
|---|---|
| 扫描 CSS 文件 | 2（styles.css + theme.css）|
| 总行数 | **6261**（styles 5723 + theme 538）|
| **声明总数** | **3684**（styles 3522 + theme 162）|

## 4. Top 重复声明（去重后按频次）

| 次数 | 声明 |
|---|---|
| 162 | `display: flex` |
| 90 | `align-items: center` |
| 78 | `font-size: 12px` |
| 71 | `cursor: pointer` |
| 65 | `font-size: 11px` |
| 63 | `color: var(--text)` |
| 62 | `color: var(--text-soft)` |
| 55 | `flex-direction: column` |
| 48 | `border: 1px solid var(--border)` |
| 47 | `gap: 6px` |
| 47 | `font-weight: 600` |
| 44 | `font-size: 10px` |

> 规律：**flex 布局三件套**（`display:flex` + `align-items:center` + `flex-direction:column`）和**字号/字重**是最大重复源。前者可抽成工具类（utility class），后者收敛为字号阶梯 token。

## 5. font-size 阶梯（碎片化严重，收敛为 token 的核心依据）

当前 font-size **极度碎片化**，px 与 rem/em 混用、含大量小数：

| 字号 | 次数 | | 字号 | 次数 |
|---|---|---|---|---|
| 9px | 3 | | 12px | **78** |
| 10px | **44** | | 12.5px | 1 |
| 10.5px | 2 | | 13px | 28 |
| 11px | **65** | | 13.5px | 1 |
| 11.5px | 1 | | 14px | 18 |
| 0.72rem~1.5rem | 多种 | | ... | |

> **问题**：同一视觉层级用了 10/10.5/11/11.5/12 等多个相近字号，且 px/rem 混用 → 视觉不一致 + 难维护。
> **提案**：收敛为语义字号阶梯 token（如 `--fs-xs`/`--fs-sm`/`--fs-base`/`--fs-md`/`--fs-lg`），把 10~14px 的 6-7 档合并为 3-4 档。

## 6. 验收口径（UR-2 后续）

- 字号阶梯 token 化后，`font-size:` 硬编码 px 数量应显著下降（当前 10-14px 段合计约 235 个）。
- 审计脚本 `--prop font-size` 可持续追踪 font-size 收敛进度。

## 7. 下一步（UR-2 后续）

1. **建立字号阶梯 token**（`--fs-*`），优先迁移最高频的 12px/11px/10px。
2. **抽 flex 布局工具类**（`.flex`/`.flex-col`/`.items-center`），收敛 `display:flex`×162 + `align-items:center`×90 + `flex-direction:column`×55。
3. 迁移需逐个核对（同字号在不同上下文可能需归入不同阶梯档），建议配合视觉核对。

## 8. 约束遵守

- 本轮**纯审计 + 度量工具**，未改动任何业务 CSS/JSX（零视觉风险）。
- 未触碰业务逻辑/协议/接口 → 非高风险，通过变更准入。

## 9. UR-2 进展与圆角 scale（cycle 47/48/67 更新）

| 步骤 | 周期 | 内容 | 量化 |
|------|------|------|------|
| 第一步 | 47 | 审计工具 + 基线（本报告） | 6261 行 / 3684 声明 |
| 第二步 | 48 | 字号阶梯 `--fs-xs/sm/md` + Top3 迁移 | 191 处 |
| 第三步 | — | `13px`/`14px`→`--fs-base`/`--fs-lg`（复用既有 token） | 47 处；font-size 累计 238/285 |
| **第四步** | **67** | **圆角 scale 收敛**（等值零视觉变化） | 单值原始 px/% **156→4**；已 token 化引用 22→**178** |

### 9.1 圆角阶梯现状（cycle 67 后）

| token | 值 | 用途 | 引用 |
|-------|-----|------|------|
| `--radius-1` | 1px | 细档（数值命名，非语义档） | 2 |
| `--radius-3` | 3px | 细档 | 17 |
| `--radius-4` | 4px | 细档 | 27 |
| `--radius-5` | 5px | 细档 | 2 |
| `--radius-6` | 6px | 细档 | 32 |
| `--radius-9` | 9px | 细档 | 2 |
| `--radius-10` | 10px | 细档 | 22 |
| `--radius-sm` | 8px | 既有语义档 | 32 |
| `--radius-md` | 12px | 既有语义档 | 19 |
| `--radius-lg` | 16px | 既有语义档 | 6 |
| `--radius-xl` | 20px | 既有语义档 | 1 |
| `--radius-full` | 50% | 圆形语义 | 6 |
| `--radius-pill` | 999px | 胶囊语义 | 10 |

> **诚实边界**：`--radius-1/3/4/5/6/9/10` 为**数值命名档**（如实标注，不冒充语义档），存在原因是历史 CSS 中确有 1/3/4/5/6/9/10px 七档细粒度取值；将其归并为语义阶梯会**改变观感**（属视觉变化，非等值迁移），需设计拍板 + 视觉 QA。
> **刻意未迁移**：4 个单次档（`2px`/`14px`/`22px`/`28px`）与 1 条多值简写（`0 6px 6px 0`）——收敛价值低/易误改简写。
> 护栏：`css-duplication-audit.cjs` **A16** 断言单值原始 `border-radius` 只允许落在白名单 `{2px,14px,22px,28px}`。