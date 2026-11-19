# 周期 131 审计报告（2026-11-19，自动周期 · UR-4 Geo Dark Slice1）

## 0. 轮次定位

- 触发：用户 2026-11-19 09:25 直接回复（非自动 skipped），给出 5 项拍板。
- 关键拍板：**主题/界面/UI 需完全重新设计**（"当前这一套我不满意"），可用插件/skill 找一套或自行设计。
- 视觉方向：经 `ask_user_question` 由用户选定 **深色专业 GIS 仪表盘**（备选：浅色现代 SaaS / 地图优先玻璃拟态 / 由 AI 定）。
- 排序拍板：**UI 全面重设计 → 全部完成后再做 `useGisPage` 拆分**；UR-3 3d 由重设计吸收结案。
- 结论：进度池从「无自动任务 → 连续 14 次 skipped」**转为有明确 P1 可执行任务**，本轮启动 UR-4 Slice1。

## 1. 本轮范围（Slice1：主题基底替换）

**设计原则：只改 design token 的「值」，不改任何组件规则。**
项目经 UR-1/2/3 已建成 token 体系（`styles.css` :root 暗基底 + `theme.css` 语义别名/亮主题覆写 + `--gap-*`/`--ls-*` 兼容别名层），
组件规则全部通过 `var(--*)` 引用。因此**重设计 = 重定义 token 值**，即可让全应用（含 5861 行 `styles.css`）自动换装，
且零组件规则改动、零功能回归、双主题机制不受影响。这也是「完全重新设计」唯一能低风险的落地路径。

### 1.1 配色：indigo-violet → graphite 中性 + azure/cyan 强调

| token | 旧值 | 新值 | 依据 |
|---|---|---|---|
| `--bg` | `#0b1020` | `#0d1117` | 专业深灰石墨底（去紫） |
| `--bg-soft` | `#121935` | `#141b24` | 去 indigo 味 |
| `--text` / `--text-soft` / `--muted` | `#f1f4ff` / `#a8b0c6` / `#7c87a8` | `#e6edf3` / `#9aa7b8` / `#6e7d91` | 中性冷灰，长时作业低刺激 |
| `--primary-500` / `--primary-strong` | `#6c8cff` / `#4f6cff` | `#3b9eff` / `#2f81f7` | azure 品牌蓝 |
| `--accent-500` | `#5ad1ff` | `#22d3ee` | cyan，数据/量测高亮 |
| `--accent-warm-500` | `#c4a3ff` | `#f5a623` | amber，去 violet |
| `--success` / `--warn` / `--danger` | `#4ade80` / `#fbbf24` / `#ef4444` | `#3fb950` / `#d29922` / `#f85149` | 专业深底可读语义三色 |
| alpha 系列（primary/danger/warn/success/warm/overlay/elevated/header/soft/selection） | 各色 | 同步换色 | 与 concrete 值同源 |

### 1.2 密度：圆角收敛

`--radius-sm/md/lg/xl = 8/12/16/20px → 6/8/12/16px`。专业仪表盘半径更小、更克制；字号阶梯不动（`--fs-base` 已是 13px，本身高密度）。

### 1.3 背景光晕去紫

body 三束 radial-gradient：`rgba(40,60,160,.25) / rgba(20,90,130,.2) / rgba(60,30,120,.18)` →
`rgba(31,111,235,.12) / rgba(34,211,238,.08) / rgba(47,129,247,.08)`。亮度整体下调，避免抢地图视觉。

### 1.4 地图与 UI 同源

GIS 要素默认描边/填充色由 `#6c8cff` → `#3b9eff`（`useDrawing.js` / `useSelection.js` / `featureFactory.js` / `StylePanel.jsx` / `CesiumEarth.jsx` / `examples.js`），
使地图向量色与 UI 品牌色同源；`--link` / `--link-hover`、`meta[name=theme-color]` 同步。

### 1.5 旧色系清零

`#6c8cff` / `#c4a3ff` / `#0b1020` 在 `client/src` 下（含注释）残留 **0 处**。

## 2. 验收与门禁（全绿）

| 门禁 | 结果 |
|---|---|
| css-duplication-audit | PASS |
| css-var-reference-guard | PASS |
| design-token-audit | PASS |
| shadow-token-duplicate-definition | PASS |
| spacing-token-semantic-ladder | PASS |
| tracking-token-namespace | PASS |
| stale-fallback-audit | PASS |
| editor-density-tokenized | PASS |
| **geo-dark-palette-audit（本轮新增，6 项）** | **6/6 PASS** |
| 括号配平（styles.css / theme.css 净深度） | 0 / 0 OK |
| `vite build` | 6.33s，505 modules，rc=0 |
| 线上核验（`https://129.204.202.173:5175/`） | 首页 200；`#0d1117` / `#3b9eff` / `#22d3ee` 已进入服务 CSS |

新门禁 `tests/specs/geo-dark-palette-audit.cjs` 锁死 Geo Dark 基线，防后续组件级重构把配色/密度改回旧体系：
D1 暗底 `--bg==#0d1117`；D2 `--primary-500==#3b9eff`；D3 旧 indigo/violet 字面量 0；D4 `--radius-md ≤ 8px`；
D5 语义三色齐备；D6 地图要素默认描边与 UI 品牌色同源 azure。

## 3. 边界与诚实声明

- **本轮未改任何组件规则**。视觉差异全部来自 token 值变化，属「换装」而非「改结构」。
- 亮主题块（`[data-theme="light"]`）**本轮刻意不动**：geo-dark-palette-audit 的 D3 只扫描 `client/src`，
  但脚本替换的 rgba 三色组出现位置经核验全部落在暗主题 `:root`（51–193 行），亮主题块（207+ 行）零命中，
  故双主题机制未受污染。亮主题配套调整列入 **Slice7**。
- `--link` / `--link-hover` 在亮主题有独立覆写（`#2563eb` / `#1d4ed8`），保留。
- 地图要素色目前是**字面量默认值**，而非读取 CSS token（`getComputedStyle`）；列为技术债，
  若后续要把地图色也纳入 token 治理需一次跨模块重构，本轮不做。
- 预览若显示浅色：`ThemeProvider` 默认已为 `dark`，但用户浏览器若曾切到 `system` 会跟随系统；
  右上角主题切换按钮可切回深色。是否将「深色」设为硬默认，留给用户拍板（本轮未擅自改交互行为）。

## 4. 下一轮

Slice2：editor 面板族视觉重构（header/tab/行高/hover·active 态）——首个**改组件规则**的切片，
需在小范围（1 个面板）验证密度与层次后再推广。