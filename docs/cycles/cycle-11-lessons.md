# Cycle 11 Lessons（经验沉淀）

> 周期 11 的踩坑、反思、可复用经验。
> L11-1 ~ L11-7 共 7 条。

---

## L11-1：ESM 客户端模块 + CommonJS 测试的"双语言"组合拳

**问题**：`client/src/utils/useActionStateGuard.js` 初版用 `module.exports`，但 `client/package.json` 已声明 `"type": "module"`，导致客户端构建失败；测试用 `require()` 又因 ESM 文件不能 CommonJS 加载失败。

**解决**：
1. 用 `Write` 工具把模块改为 `export function serializeError() {...}`、`export function useActionStateGuard() {...}`；
2. 测试文件改用动态 `await import(url.pathToFileURL(filePath).href)`；
3. 顶层加 `await` async wrapper。

**可复用**：
- 写客户端模块前**先 `Read` `client/package.json` 看 `type` 字段**；
- 测试异步 import 用 `pathToFileURL` 而非裸 `path`（Windows 路径含 `\` 必须转 `file://`）。

---

## L11-2：ESM 的"看似箭头函数的陷阱"——单行 `.test()/.match()` 容易丢 `=>`

**问题**：`tests/specs/handler-design-checklist.cjs` 写
```js
const isUnchecked = (l) =/^- \[ \]/.test(l)
```
少了 `>`，导致 `l) =/...` 被解析为赋值 + 正则字面量语法错误。

**解决**：搜索整个文件后定位、修改为 `(l) => /^- \[ \]/.test(l)`。

**可复用**：
- 单行 lambda + 正则时**务必双检查箭头**；
- 写完后立即跑测试（小文件 < 1s 即反馈），不要等整周期结尾。

---

## L11-3：parseTraceparent 期望值分支要严格三态

**问题**：初版用同一段逻辑同时处理 `expect===true` 与 `expect===false`，逻辑交织；测试 `expect=false` case 失败。

**解决**：
```js
if (expect === null) { /* 跳过 */ }
else if (expect === true) { assert.equal(parsed !== null, true); }
else { assert.equal(parsed === null, true); }
```

**可复用**：
- "允许三种结果（true/false/null=未定义）" 的函数，spec 必须三态分支断言；
- 不要用 `if (!expect) ...` 这种把 `null` 和 `false` 混为一谈。

---

## L11-4：正则 `setHeader\(['"]x-request-id['"]` 比 `x-request-id.*setHeader` 更稳

**问题**：
- 初版正则：`x-request-id.*setHeader` —— 要求源码里字符串"x-request-id"在前、`setHeader` 在后；
- 但某些实现先用变量、再调 `setHeader(var)`，正则失败。

**解决**：改为 `setHeader\(['"]x-request-id['"]` —— 直接找 `setHeader('x-request-id', ...)` 字面。

**可复用**：
- 静态扫描断言**优先匹配关键字 + 字面引号**，不要假设代码风格；
- 若必须多 token 顺序，用 `\s*[\s\S]*?\s*` 替代 `.*`。

---

## L11-5：WebSearch 一次性并发 12 个可显著提速

**行动**：在同一条 message 内发 12 个 `WebSearch` 工具调用，全部并行；总耗时从顺序 ~60s 缩到 ~20s。

**可复用**：
- 调研阶段**优先批量并行**所有 WebSearch；
- 不要逐条 await。

---

## L11-6：60 条链接的"一句话摘要 + 落地行动"模板显著降低后续读成本

**行动**：每条链接都按 `<链接> | <一句话摘要> | <可落地行动>` 三列表格写入 `cycle-11-research.md`。

**效果**：
- 后续 cycle 直接读"行动"列就能复用，不必 60 条都点开；
- Top5 选定变得明确（从 12 主题 × N 行动聚合，按"投入产出比"排序）。

**可复用**：
- 任何多链接调研都强制三列表格；
- 不要写"标题党"摘要，要让"落地行动"具体到文件名/接口名。

---

## L11-7：handler 设计 8 维 checklist 是 PR review 自审的有效脚手架

**行动**：把"rate-limit / trace / auth / validation / idempotency / backpressure / observability / recovery"作为新 handler 的 8 维必检项，写入 `docs/architecture/handler-design-checklist.md`。

**效果**：
- 周期 12+ 的 PR review 自审可直接对照该 checklist；
- cycle-11 期间所有新加的 worker pool / telemetry persist / requestId link 都可逐项打勾。

**可复用**：
- 在 `.github/PULL_REQUEST_TEMPLATE.md` 加 "Handler Checklist" 部分，要求 PR 作者逐项勾选；
- 让 Claude Code Action 在 PR 自审时把 checklist 作为 prompt 模板。