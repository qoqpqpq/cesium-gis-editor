# 周期 132 开发日志（2026-11-19，UR-4 Geo Dark Slice2）

## 输入

`state/cycle-state.json`：`status=in_progress`、`current_item=ui-redesign-slice2-editor-panels`。
Slice1（主题基底）已交付，本轮承接 Slice2：editor 面板族视觉重构。

## 范围裁剪

editor 面板族共 281 个选择器（`editor-*` / `et-tab-*` / `attr-*` / `op-*` / `qb-*` /
`print-export-*` / `three-check-*` / `query-builder-*` / `analysis-*`）。
单轮全量统一不现实也不可控，故**只取一致性缺陷最明确的子集：3 套 tab 族 + 高亮块**（16 个选择器）。
面板 header 族（padding 差异大但语义不同：popup / modal / section）留待 Slice3 之后单独处理，避免本轮把不同语义的 header 强行拉平。

## 实施

1. 审计 3 套 tab 族的现状，确认 4 类不一致（active hue 分裂 / 死回退 / 缺 hover / 裸值）。
2. 写 `/tmp/slice2-editor-tabs.py`（精确字符串替换 + count==1 断言 + 末尾统一写盘）。
   首次运行 `style-panel-tabs` count=0 —— 原因是我的 old_string 里多写了块间空行；
   **失败即整体不写盘（原子性保住），未污染文件**；修正空行后一次通过。
3. 新增门禁 `tests/specs/editor-tab-family-audit.cjs`：
   - 用**大括号配对扫描**解析 CSS（正确处理 `.editor-layer-tab:hover { ... }` 这类单行规则）。
   - T3 先剥离 `var(...)` 再找裸 px —— 否则 `--gap-4px` 这类「值命名档」token 名会被误判成裸字面量。
   - T3 只约束 spacing/radius 类属性，边框粗细（2px 指示线）允许 px。

## 文件变更

- `client/src/styles.css`（16 个选择器：`.et-tabs` `.et-tab(:hover/.active)` `.et-highlight-section`
  `.et-highlight-section .editor-section-title` `.editor-layer-tab(s)` `.style-panel-tabs/.style-panel-tab(:hover/:last-child/.active)`）
- `tests/specs/editor-tab-family-audit.cjs`（新增门禁，7 项）
- `docs/cycles/cycle-132-audit.md`、`docs/cycles/cycle-132-dev-log.md`（新增）
- `docs/release-notes/upcoming-work.md`（Slice2 结案）
- `state/cycle-state.json`

## 验证

10 道设计门禁全 PASS（9 既有 + 1 新增 7/7）＋括号配平 0＋`vite build` 6.45s/505 modules＋
线上核验：4 个 tab 规则各 1 处、死回退 0、裸 `padding:5px 0` 0。

## 已知边界

- 只统一了 tab 簇；header / 表格 / 按钮 / 表单未动（Slice3+）。
- `.editor-loading-hint` 仍用 `--radius-6`（簇外）。
- `--color-blue-400` token 仍定义（图表/信息用途在用），仅本簇不再引用。
- 亮主题未动（Slice7）。