# UI 重构 UR-1：设计审计基线报告

> **周期**: 38（2026-11-15，自动周期重启首轮）
> **需求**: UI-REFACTOR（用户 2026-11-14 新增，P2）
> **阶段**: UR-1 设计审计与 token 收敛 —— 第一步「建立可量化基线」
> **审计工具**: `scripts/design-token-audit.cjs`（可复用，支持 `--json` / `--max` 阈值）

---

## 1. 目的

为 UI 重构「换一套更好看更简洁的设计方案」提供**可量化、可复现的基线与验收口径**。UI 重构跨度大（UR-1~UR-4），必须先有客观度量，否则「更好看更简洁」无法验收。

## 2. 审计口径（关键）

审计脚本区分两类颜色出现位置，避免把 token 定义误判为硬编码：

| 类别 | 定义 | 是否计入硬编码 |
|---|---|---|
| **token 定义** | 在 `:root` / `[data-theme]` 块内声明 `--var: <value>` | ❌ 否（这是 token 源，合法） |
| **组件硬编码用法** | 在组件规则（token 块之外）直接写 `#hex` / `rgb()` / `rgba()` | ✅ 是（应迁移为 `var(--token)`） |

> 这个区分很重要：`theme.css` 里的 hex 大多是 token 定义本身（合法），真正的迁移目标是散落在组件规则里的硬编码。

## 3. 基线数据（2026-11-15，cycle 38）

| 指标 | 数值 |
|---|---|
| 扫描 CSS 文件 | 2（`styles.css` + `theme.css`）|
| **token 定义条目** | **165**（styles 33 + theme 132）|
| **组件硬编码颜色（迁移目标）** | **366**（hex 233 / rgb 133）|
| — `styles.css` | 237 |
| — `theme.css` | 129 |

> 注：本轮基线仅扫描 `.css`；JS/JSX 内联样式留待后续阶段评估。

## 4. Top 硬编码热点（组件规则，迁移优先级参考）

| 位置 | 次数 | 形态 |
|---|---|---|
| `styles.css:732` | 2 | `linear-gradient(90deg, #f1f4ff 30%, #a8b0c6)` |
| `styles.css:884/885` | 2 | `mask: linear-gradient(#fff 0 0) ...` |
| `styles.css:901` | 2 | `linear-gradient(135deg, #1a2645, #243060)` |
| `styles.css:2434/2575` | 2 | `linear-gradient(135deg, #6366f1, #8b5cf6)` |
| `styles.css:2776` | 2 | `linear-gradient(135deg, #f59e0b, #ea580c)` |
| `styles.css:2957` | 2 | `linear-gradient(135deg, #ef4444, #b91c1c)` |
| `styles.css:1883` | 2 | `.nl-result-error { border-color:#ff7875; background:rgba(255,77,79,.05) }` |

> 规律：**渐变（linear/conic-gradient）与状态色（error/warn/success）**是硬编码重灾区，且很多成对出现（同一渐变在多处重复）。这些是 UR-1 后续迁移与 UR-3 组件视觉统一的高价值目标。

## 5. 验收口径（UR-1 后续迁移用）

审计脚本支持 `--max N` 阈值模式，可作为迁移进度的**客观验收闸门**：

```
node scripts/design-token-audit.cjs --max <阈值>
```

- 迁移前基线：**366**
- UR-1 迁移目标：硬编码色值显著下降（**目标 −50%+，即降到 ≤ ~180**）
- spec `tests/specs/design-token-audit.cjs`（13 PASS）固化脚本行为，防回归

## 6. 下一步（UR-1 后续 / UR-2）

1. **迁移高频渐变与状态色**到语义 token（优先 Top 热点，成对渐变抽成 token）
2. 迁移后用 `--max` 阈值锁定，防新增硬编码回潮
3. UR-2：精简 `index.jsx`（1100 行）视觉密度，统一间距/圆角/阴影 scale

## 7. 约束遵守

- 本轮**纯审计 + 度量工具**，未改动任何业务 CSS/JSX（零视觉风险）
- 未触碰业务逻辑/协议/接口 → 非高风险，通过变更准入