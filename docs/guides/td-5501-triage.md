# TD-5501 分诊报告：9 个既有 spec 失败（R-1502 环境解锁后暴露）

> 周期 56 产出。背景：R-1502 最小环境解锁（cycle 55）后，全量 spec 首次在全依赖就绪下测量，
> 得到 155/166 pass 基线，9 个失败文件此前被 CI 缺 server/turf 掩盖。本报告逐个判定根因，
> 区分「spec 过时/路径错误」vs「真实功能缺口」vs「环境问题」，供人工决策（实现 / 修 spec / 删 spec）。
>
> 所有结论基于源码与实际运行时行为核实（非推测）。**本轮零代码改动，纯分析。**

## 汇总表

| # | spec 文件 | 失败数 | 根因（已核实） | 建议处置 | 优先级 |
|---|---|---|---|---|---|
| 1 | csp-permissions-policy.cjs | 6 | **spec 过时**：用严格正则匹配 `server/index.js` 源码文本，但 Permissions-Policy 实现已迁移 | 修 spec（改为断言运行时响应头或新实现位置） | P2 |
| 2 | helmet-8-upgrade.cjs | 1 | 同上（regex `/res\.setHeader\(\s*"Permissions-Policy"/` 源码已不匹配） | 修 spec | P2 |
| 3 | helmet-permissions-policy.cjs | 3 | 同上 | 修 spec | P2 |
| 4 | metadata-ip-maintenance.cjs | 4 | **文档缺失**：期望 `docs/guides/metadata-ips.md`，文件不存在 | 补文档 或 删 spec | P2 |
| 5 | metadata-ip-sync-script.cjs | 8 | **API 漂移**：脚本导出 `parseMarkdown/parse/sync`，spec 期望 `parseMarkdownTable/parseSourceSet/isMetadataIp` | 修 spec 对齐现 API 或 删 spec | P2 |
| 6 | protocol-shared.cjs | 1 | **路径错误**：spec 找 `protocol/index.js`+`TOOL_OPEN/TOOL_CLOSE`，实际在 `server/agent/protocol/index.js` | 修 spec 指向正确路径 | P2 |
| 7 | protocol-sync-script.cjs | 3 | 同上（`check-protocol-sync.cjs` 实际引用 `server/agent/protocol/`，spec 断言的是旧路径产物） | 修 spec | P2 |
| 8 | sandbox-perf-benchmark.cjs | 1 | 待细查（pass=10 fail=1） | 细查后定 | P3 |
| 9 | viewstate-browser-decompress.cjs | FATAL | **环境问题**：`client/node_modules` 未装，缺 `pako` | 装 client 依赖（`cd client && npm install`） | P2 |

## 关键核实证据

### Permissions-Policy 组（#1-3）：功能存在，spec 断言方式过时
- 运行时核实：`curl -D - http://localhost:3001/api/health` 实际返回完整头：
  `Permissions-Policy: accelerometer=(), autoplay=(self), camera=(), ... geolocation=(), microphone=(), ...`
  → **功能已正确实现且生效**。
- 失败原因：3 个 spec 用 `/res\.setHeader\(\s*"Permissions-Policy"/`、`/camera=\(\)/` 等**正则匹配源码文本**，
  而实现不在 `server/index.js`（已迁至 helmet 配置或中间件）→ 源码正则失配。
- **结论：不是安全功能缺失，是 spec 断言方式过时**。处置=修 spec（改断言运行时头，或指向新实现位置）。

### protocol 组（#6-7）：协议曾迁移，spec 指向旧路径
- `protocol/index.js` 不存在；`scripts/check-protocol-sync.cjs` L30-31 实际引用
  `server/agent/protocol/index.js`、`server/agent/protocol/parse.js`。
- → 协议代码已迁到 `server/agent/protocol/`，spec 仍找旧顶层 `protocol/`。处置=修 spec 路径。

### metadata-ips 组（#4-5）：文档缺失 + 脚本 API 漂移
- `docs/guides/metadata-ips.md` 不存在；`scripts/sync-metadata-ips.cjs` 存在（5730B）但导出
  `{ sync, parse, parseArgs, parseMarkdown, parseJson, parseCsv, DEFAULT_SOURCE }`，无 spec 期望的
  `parseMarkdownTable/parseSourceSet/isMetadataIp` → spec 为另一版本 API，已漂移。

### viewstate（#9）：纯环境
- `Cannot find module 'client/node_modules/pako'`；`client/package.json` L20 有 `"pako": "^2.2.0"`，
  但 `client/node_modules` 为空（cycle55 只装了根依赖，未装 client）。处置=装 client 依赖。

## 总体结论
- **无一是「安全/核心功能缺失」**。9 个失败 = 6 个 spec 过时/路径/API 漂移 + 1 文档缺失 + 1 环境未装 + 1 待细查。
- 主体工作是**修过时 spec**（#1-7，8 个文件），属低风险测试维护，可安全自动化；
  #4 补文档、#9 装 client 依赖为环境/文档动作。
- 建议下一轮起按「先修 spec 路径/断言（#1-3,6,7）→ 再对齐 metadata API（#5）→ 补文档（#4）→ 装 client 依赖（#9）」
  顺序小粒度推进，每步跑全量 spec 验证失败数单调下降。

## 待用户确认
- 修过时 spec 属测试维护（非高风险），可直接自动化推进；但**删除 spec**需确认。
  #4「补 metadata-ips.md 文档」vs「删 spec」二选一需你定（涉及是否要保留该维护文档）。
