# 周期 134 开发日志（2026-11-19，UR-4 Geo Dark Slice4）

## 输入

`state/cycle-state.json`：`status=in_progress`、`current_item=ui-redesign-slice4-tables-trees`。

## 范围裁剪

表格/树簇（`.attr-table*` / `.editor-layer*` / `.query-builder*` / `.qb-*` / `.usage-table*`，100 选择器）。
本轮不做「行高/斑马纹/表头重设计」——那会带来大面积视觉变更；改为**token 化 + 陈旧字面量清除 + 半径收敛**（零视觉变化为主，是 Slice4 最稳妥的一致性修复）。

## 实施

1. 扫描簇内 `#hex` / `rgba(...)` / 裸 px / 值命名半径，定位 3 类残留。
2. `/tmp/slice4-tables.py`（精确替换 + count 断言；theme 补丁幂等化）：
   - thead `rgba(15,18,25,0.96)` → `var(--overlay-95)`；`#e2e8f0` → `var(--text)`；green-500 hover → 新增 `--success-active-bg`（0.32，对称 `--danger-active-bg`）。
   - 全局 `var(--radius-6)` → `var(--radius-sm)`（28 处），删除 `--radius-6` 定义。
   - 裸 px → token（usage-table 6/10、compact 4/8、`.btn-link.active` 2/6）。
3. **门禁拦截**：初版 compact 用 `var(--space-4px)` → `css-var-reference-guard` B1 拦截（未定义）。修正为 `var(--space-1)`（4px）。
4. **死回退顺带清零**：`var(--accent, var(--accent-500))` 共 5 处（`.nl-*` ×2、`.analysis-*`/`.style-panel-*` 背景 ×3）→ `var(--accent)`。
5. 新增门禁 `tests/specs/tables-tree-audit.cjs`（7 项）。S3 的 spacing 正则**排除 top/right/bottom/left**（定位坐标，非间距）。

## 文件变更

- `client/src/styles.css`（100 选择器簇内 token 化 + 全局半径收敛 + 5 处死回退）
- `client/src/theme.css`（新增 `--success-active-bg`）
- `tests/specs/tables-tree-audit.cjs`（新增门禁，7 项）
- `docs/cycles/cycle-134-audit.md`、`docs/cycles/cycle-134-dev-log.md`（新增）
- `docs/release-notes/upcoming-work.md`（Slice4 结案）
- `state/cycle-state.json`

## 验证

12 道设计门禁全 PASS（11 既有 + 1 新增 7/7）＋括号配平 0/0＋`vite build` 6.33s/505 modules＋
线上核验：`--radius-6` 0、accent 死回退 0、`rgba(15,18,25` 0、thead `--overlay-95` 1 处。

## 已知边界

- 值命名半径 `--radius-3/4/5/9/10`、`--overlay-85/92`、`--ink-35` 保留（无等值语义档）→ Slice8 终审。
- 全局 `.tabs/.tab` 主导航、二级按钮族（sandcastle / file-loader / editor-toolbar / ai-chip / toast / nav-item）→ Slice5。
- 亮主题未动（Slice7）。

## 下一步

Slice5：全局 chrome + 二级控件过渡/裸 px/死回退清理。