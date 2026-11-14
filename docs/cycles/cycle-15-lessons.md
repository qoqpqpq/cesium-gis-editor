# Cycle 15 Lessons（经验沉淀）

> 周期 15 的踩坑、反思、可复用经验。
> L15-1 ~ L15-3 共 3 条。

---

## L15-1：FTS5 unicode61 分词器不支持 CJK 中文

**问题**：node:sqlite 的 FTS5 `unicode61` 分词器对中文文本无法正确分词。`MATCH '北京'` 返回 0 行，即使 FTS5 表中有包含"北京"的数据。

**根因分析**：
- `unicode61` 分词器基于 Unicode 6.1 标准，将 CJK 字符视为"其他"字符类别
- CJK 字符不被拆分为有意义的 token，导致 MATCH 查询无法匹配
- SQLite 的 `trigram` 分词器（3.34+）可处理 CJK，但需要重建 FTS5 表
- 本项目 FTS5 表使用外部内容模式（`content='memories'`），切换分词器需重建整个表

**解决**：
- memory.js：FTS5 返回空但 `ftsCount() > 0` 时，自动回退 LIKE 路径
- hybridRetrieval.js：fetchChannel 中 FTS5→LIKE 回退
- LIKE 路径：支持多词 AND 查询 + CJK 逐字拆分（2 字一组）

**可复用**：
- 跨平台 SQLite FTS5 必须验证分词器对目标语言的支持
- FTS5 不可用时必须有 graceful fallback（LIKE 或全文扫描）
- 多通道检索架构（hybridRetrieval）天然适合做通道级 fallback
- CJK 文本 LIKE 搜索：2 字一组拆分比逐字拆分更精确（避免过度匹配）

---

## L15-2：LIKE 搜索不支持多词查询

**问题**：`LIKE '%北京首都%'` 返回 0 行，因为文档中没有"北京首都"这个连续子串（文档是"北京位于中国北方，是首都"）。

**根因分析**：
- LIKE '%query%' 将 query 视为连续子串
- FTS5 MATCH 会分词后独立匹配每个 token，但 LIKE 不会
- 对于 CJK 查询（无空格分隔的多词），LIKE 需要特殊处理

**解决**：
- LIKE 路径按空格分词，每词生成 `value LIKE '%word%'` 条件
- CJK 单词（无空格、含 CJK 字符、长度 > 1）按 2 字一组拆分
- 所有条件用 AND 组合

**可复用**：
- 混合搜索架构（FTS5 + LIKE fallback）是处理 CJK 的最实用方案
- LIKE 多词查询：SQL `WHERE value LIKE '%w1%' AND value LIKE '%w2%'`
- CJK 2 字拆分策略比逐字拆分更精确（避免"首"匹配到无关文档）
- 注意：拆分策略应可配置，不同场景可能需要不同粒度

---

## L15-3：halfLifeMs 除零守卫

**问题**：`computeRecencyScores` 中 `halfLifeMs = 0` 时，`Math.exp(-ageMs / 0)` 返回 NaN，导致后续排序和比较出错。

**根因分析**：
- `opts.recencyHalfLifeDays || DEFAULT_HALF_LIFE_DAYS` 在值为 0 时不会回退（0 是 falsy）
- 但 0 不会走到 `||` 分支（0 是 falsy 但 `0 || DEFAULT` = DEFAULT），实际上 0 会正确回退
- 负值情况：`-1 || DEFAULT` = -1（truthy），导致 `halfLifeMs = -1 * DAY_MS < 0`
- 修复后加 `if (halfLifeMs <= 0) return new Map()` 双重保险

**可复用**：
- 时间衰减计算必须守卫 `halfLifeMs <= 0`
- `||` 对 0 的处理是 JS 陷阱：`0 || x` = x，但 `-1 || x` = -1
- 任何除法运算的分母必须非零检查
- 数学函数（exp/log/sin）的输入必须检查边界

---

## L15 周期总结

- 3 条 lessons：L15-1（FTS5 CJK 限制）/ L15-2（LIKE 多词）/ L15-3（halfLifeMs 守卫）
- 修复 6 项预存回归（L14-1）
- 37 PASS / 0 FAIL
- 11 个 spec 零回归
- 清理 11 项过期 upcoming-work 条目
- 启动周期 15 任务规划（1 P0 + 5 P1 + 4 P2）
- 下周期反思：FTS5 CJK 彻底修复（trigram 分词器）/ FTS5→LIKE fallback 的性能影响评估
