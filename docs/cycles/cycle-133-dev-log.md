# 周期 133 开发日志（2026-11-19，UR-4 Geo Dark Slice3）

## 输入

`state/cycle-state.json`：`status=in_progress`、`current_item=ui-redesign-slice3-buttons-forms`。

## 范围裁剪

按钮族表面庞大（`.ai-key-btn` / `.usage-panel-btn` / `.sandcastle-*` / `.editor-toolbar-btn` / `.file-loader-btn` / `.preset-btn` / `.collapse-btn` / `.gis-share-view-btn` / `.attr-table-btn` 等 20+ 个选择器）。
单轮全量统一会引入大量视觉变更。故取**共享基础控件词汇**（`.btn*` / `.btn-primary` / `.input` / `.tag` / `.badge` / `.chip` / `.row` / `.row-between` / `.divider` / `.error`，24 选择器）——
这些是多个组件复用的**底座**，统一它们收益最大、风险最小；二级按钮族各自独立，留待 Slice5。

## 实施

1. 审计 5 类不一致（双基座分裂 / 死回退 / 裸 px / 半径混用 / 硬编码过渡）。
2. 写 `/tmp/slice3-controls.py`（精确替换 + count==1 断言 + 末尾写盘，失败即不写）。
3. 新增门禁 `tests/specs/controls-family-audit.cjs`（7 项），复用大括号配对解析 + 剥 `var()` 再查裸 px。

## 文件变更

- `client/src/styles.css`（24 个选择器）
- `tests/specs/controls-family-audit.cjs`（新增门禁，7 项）
- `docs/cycles/cycle-133-audit.md`、`docs/cycles/cycle-133-dev-log.md`（新增）
- `docs/release-notes/upcoming-work.md`（Slice3 结案）
- `state/cycle-state.json`

## 验证

11 道设计门禁全 PASS（10 既有 + 1 新增 7/7）＋括号配平 0＋`vite build` 6.33s/505 modules＋
线上核验：微光 hover / azure btn-primary 各 1 处、死回退 0、裸 14px radius 0、`padding:6px 14px` 0。

## 已知边界

- 簇外 ~14 条二级按钮/切换规则仍带硬编码过渡与裸 px（sandcastle / file-loader / editor-toolbar / ai-chip 等）→ Slice5。
- 全局 `.tabs`/`.tab` 主导航 active 为 azure→cyan 渐变（已与 `--grad-brand` 同源，视觉一致），但 `padding: 7px 18px` / `--radius-9` / `box-shadow 0 2px 12px var(--primary-35)` 未 token 化 → Slice5。
- 亮主题未动（Slice7）。

## 下一步

Slice4：表格与树（属性表 / QueryBuilder / 图层树 / AnalysisPanel 数据表）行高·斑马纹·表头统一。