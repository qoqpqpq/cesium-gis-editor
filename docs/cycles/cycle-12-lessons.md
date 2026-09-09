# Cycle 12 Lessons（经验沉淀）

> 周期 12 的踩坑、反思、可复用经验。
> L12-1 ~ L12-8 共 8 条。

---

## L12-1：spec test 中"模块级缓存"陷阱——React 缺失检测失效

**问题**：测试 useOptimisticAction.js 时，模块顶层 `_React = globalThis.require('react')` 缓存了真实 React，导致后续 `globalThis.require = null` 后 hook 仍走 React fallback 路径而非抛错。

**解决**：
- 测试时不能用 `globalThis.require = null` 验证 React 缺失（C1 测试已覆盖一次）；
- 改为**接受模块级缓存不可重置的现实**，跳过重复测试（E1 SKIP）。

**可复用**：
- 模块级单例（logger / state / cache）只测一次"缺失"场景；
- 不要在 spec 内反复 mock 全局状态。

---

## L12-2：IPv6 :: 压缩零串正则不能硬连

**问题**：初版 IPv6 正则 `/\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}/` 不匹配 `fd00:ec2::254`（`::` 是双冒号压缩）。

**解决**：改为 `/\b(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{0,4}){1,7}|::1?)/`，并在解析后过滤 `ip.includes(':')` 排除误匹配。

**可复用**：
- IPv6/邮箱/MAC 等 RFC 严格格式应优先用现成 parser（如 `node:net.isIP` + `url.parse`）；
- 写正则时考虑所有 RFC 变体（`::`, `0:0:0:0:0:0:0:1`, `::1`）。

---

## L12-3：parseArgs 切片错位——`argv.slice(2)` 必须配 node + script 双 prefix

**问题**：parseArgs 用 `argv.slice(2)`，假设 argv = `[node, script, ...args]`。spec 直接传 `['--write']` 会切空 args 列表。

**解决**：spec 一律传 `['node', 'sync', '--write']`，与 CLI 一致。

**可复用**：
- 工具库函数 vs CLI 入口分离（spec 测工具库函数，绕开 CLI wrapper）；
- 或 CLI wrapper 不做 slice，调用方传 `[...args]`。

---

## L12-4：W3C traceparent 长度严格 32+16+2 hex，spec 别再走捷径

**问题**：D3/G1 spec 用 `00-aaaa-bbbb-01`（短 traceId）测 attachTraceToWorkerData 失败——parseTraceparent 正则要求严格 32hex traceId。

**解决**：用合规 32a + 16a 的 traceparent：`00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01`。

**可复用**：
- 任何 W3C / RFC 严格协议测试都用合规字符串；
- 写"边界测试"时区分"缺字段" vs "非法字段" vs "长度不对"。

---

## L12-5：ESM 命名导出 vs default 导出混用——const 不在 default 里

**问题**：tilesetLoader.js 用 `export const KNOWN_GAUSSIAN_EXTS` + `export default { ... }`，spec 通过 `loader.KNOWN_GAUSSIAN_EXTS` 访问时返回 undefined（只暴露在 default 里）。

**解决**：加 `export { KNOWN_GAUSSIAN_EXTS, ... }` named export。

**可复用**：
- const / function 一律 named export；
- default export 只放聚合对象（与 named export 互补）；
- spec 测试用 `loader.X` 不容忍 fallback 到 default。

---

## L12-6：mock 对象的 `lastExec` 闭包陷阱——需要在构造时定义自身引用

**问题**：F2 测试 `assert.match(drv.lastExec, ...)` 失败——`exec()` 闭包内 `state.lastExec = sql`，但 spec 读 `drv.lastExec`。`state` 是构造时局部变量，外部读不到。

**解决**：让 mock driver 持有自身引用 `const driver = { ... }; driver.lastExec = null; return driver;`。

**可复用**：
- mock 对象 state 写到对象自身（`this.lastExec`）；
- 不要 mock 用 closure 隐藏 state（spec 看不见）。

---

## L12-7：周期 11 的"打破评估 vs 接入边界"反思 → 周期 12 真实接 OTel

**行动**：cycle-11 P2-2 自评提出"打破评估 vs 接入边界"。周期 12 P2-2 otelDevHook.js 真实尝试 `require('@opentelemetry/sdk-node')`，缺包 graceful fallback；这是从"评估文档"到"代码尝试"的实质性进步。

**可复用**：
- 评估类 P2 在周期 N 完成 spec + 文档；
- 周期 N+1 把"评估"中的 1-2 项升级为"真实接入尝试"；
- 即便失败（缺包），也写了"尝试性"代码与 spec。

---

## L12-8：cycle-11 P1-3 反思"客户端动手少" → cycle-12 P2-1 落地 useOptimisticMarker

**行动**：cycle-11 self-check 反思"客户端 viewer 改动偏保守"。周期 12 P2-1 用 `useOptimisticMarker.js` hook 把乐观逻辑应用到 marker 添加场景——虽然 hook 是新文件而非修改 CesiumEarth.jsx，但提供了可直接复用的 hook。

**不足**：
- 仍未直接修改 CesiumEarth.jsx 的 addMarker 方法；
- 下周期应真正接入 Viewer.jsx 的 marker 添加逻辑。

**可复用**：
- P2 "客户端体验改善"任务应有"实际改 viewer"门槛；
- hook + spec 是 50%，接入到真实组件是 100%。

---

## L12 周期总结

- 8 条 lessons 中 L12-1/L12-3/L12-6 是测试工程；L12-2/L12-4/L12-5 是代码严谨性；L12-7/L12-8 是周期反思驱动；
- 周期 12 8 个 spec 全过、213 子断言 = 历史最高；
- 客户端动手仍偏少（cycle-12 P2-1 hook 未真正接入 CesiumEarth.jsx），下周期补足。