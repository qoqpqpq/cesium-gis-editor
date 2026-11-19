# 周期 138 开发日志（2026-11-19，UR-4 Geo Dark Slice8 打磨）

## 输入

`state/cycle-state.json`：`current_cycle=137`、`status=in_progress`、`current_item=ui-redesign-slice8-polish-regression`。

## 范围

Slice8 打磨 + 全量回归（UR-4 收尾）。

## 判定

Cesium 控件层（theme.css L460-541）已适配（暗主题也走 token）→ 不重复改。聚焦：`#1f242d` 3 处清零、面板外裸 px 全局 token 化、值命名档终审、全量回归。

## 实施

1. 安全全局 token 化 v2（仅处理不含 `var(` 的裸 px 声明）→ 123 处。
2. `#1f242d` 3 处（`.gis-hsplitter` bg / `.code-dock` border / `.console-header` border-bottom）→ `var(--border)`，剩余 0。
3. 负间距 `margin: -3px 0` → `-var(--space-3px) 0`（合法）。
4. 未映射大号间距跳过（32/40/60px 无 token，3 处）。

## 踩坑

首版脚本 `\bNpx\b` 误匹配 `var(--gap-20px)`/`var(--space-7px)` token 名内的 `px` → 污染 `var(--X-var(--space-Y))`；`css-var-reference-guard` 报未定义 `--gap-5`/`--space-var`。回退 HEAD → v2 加 `var(` 守卫 → 0 污染。

## 文件变更

- `client/src/styles.css`（123 处裸 px token 化 + `#1f242d` 清零 + 负间距）
- `docs/cycles/cycle-138-audit.md`、`docs/cycles/cycle-138-dev-log.md`（新增）
- `docs/release-notes/upcoming-work.md`（Slice8 结案 / UR-4 完成）
- `state/cycle-state.json`

## 验证

15 道设计门禁全 PASS ＋ 括号配平 0 ＋ `vite build` 6.34s/505 modules ＋ 线上核验（`var(--space-2)` 在服务 CSS、`#1f242d`=0）＋ 有界回归（172 specs：170 PASS + 1 超时假阴性 helmet-8（断言 pass=4/4，与基线一致）+ 1 跳过 sandbox-perf flaky）。

## 下一步

`useGisPage` 拆分（936 行，用户指定 UI 完成后）。