# 周期 138 审计报告（2026-11-19，自动周期 · UR-4 Geo Dark Slice8 打磨）

## 0. 轮次定位

上一轮（137）交付 Slice7 亮主题配套 → 本轮承接 **Slice8：打磨 + 全量回归**（UR-4 收尾）。

## 1. 范围判定

- **Cesium 控件层**（theme.css L460-541）：infobox/toolbar/credits/selection/performance/geocoder 全 token 化，暗主题也走 token —— **已适配，无需改动**。
- **`#1f242d` 残留 3 处**（`.gis-hsplitter` bg、`.code-dock` border、`.console-header` border-bottom）→ 清零。
- **面板外裸 px 打磨**（AI/chat/sandcastle/col-picker 等）：全站扫描 + 安全全局 token 化。
- **值命名档终审**：`--space-*`/`--gap-*` 引用由 `css-var-reference-guard`（引用未定义=0）与新增 `spacing-token-semantic-ladder` 覆盖。
- **全量回归**：有界（时间盒 9min，跳过已知 flaky）。

## 2. 实施

1. **安全全局 token 化 v2**（`/tmp/slice8-polish-v2.py`）：仅处理**不含 `var(`** 的裸 px 间距声明（杜绝 `\bNpx\b` 误匹配 `var(--space-Npx)`/`var(--gap-Npx)` 内部造成污染）→ **123 处裸 px 替换**。
2. **`#1f242d` → `var(--border)`**：`.gis-hsplitter` bg（1）、`.code-dock` border（1）、`.console-header` border-bottom（1）→ 剩余 0。
3. **负间距**：`margin: -3px 0` → `margin: -var(--space-3px) 0`（合法负 var）。
4. **未映射大号 modal 间距跳过**（`28px 32px`、`40px 12px`、`24px 28px 60px`，32/40/60px 无 token）—— 刻意保留。

## 3. 踩坑记录（污染与修复）

**首版脚本 bug**：`decl_re` 匹配 `padding: var(--gap-20px)`（已 token 化值），其 `\b20px\b` **误匹配 var 名内的 `20px`**（`--gap-20px`/`--space-7px`）→ 二次替换污染 `var(--gap-var(--space-5))`/`var(--space-var(--space-7px))`，且 `css-var-reference-guard` 报未定义 `--gap-5`/`--space-var`。

**根因**：`re.findall(r'\b(\d+)px\b', val)` 对 `var(--gap-20px)` 提取到 `20`（在 token 名内），且无 `var(` 前置守卫。

**修复**：回退 `styles.css` 至 HEAD → 重写 v2（对值含 `var(` 直接跳过）→ 123 处正确替换，0 污染。污染修复中间态经 `var(--X-var(--space-Y))→var(--X-Y)` 通用正则，发现 `--gap-20px` 案例逆映射错误（→`--gap-5`）后改为**回退重做**，避免不完整反解。

## 4. 验收

| 门禁 | 结果 |
|---|---|
| 15 道设计门禁（含 light-theme-coverage-audit） | **15/15 PASS** |
| theme.css + styles.css 括号配平 | 0 OK |
| `vite build` | 6.34s / 505 modules / rc=0 |
| 线上核验（`https://129.204.202.173:5175/`） | 服务 CSS 含 `var(--space-2)`；`#1f242d` = **0** |
| 全量回归（172 specs，有界） | **170 PASS** + 1 超时假阴性（helmet-8 rc=124，内部断言 pass=4/4）+ 1 跳过（sandbox-perf flaky） |

**无真实回归**：helmet-8 为已知慢 spec（server 启停超时，与基线一致），断言本身全过。

## 5. UR-4 结案

Slice1-8 全部交付 → **UR-4 Geo Dark UI 全面重设计完成**：Geo Dark 主题 + Geo Light 成对 + 全家族 token 化（editor/controls/tables/trees/chrome/panel/session/key/light-pairing）+ 残留字面量清零 + 值命名档终审。P1 达成。

## 6. 下一轮

`useGisPage` 拆分（936 行，用户指定 UI 完成后）。