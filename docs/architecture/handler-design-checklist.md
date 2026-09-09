# Handler Design Checklist

> **周期**: 11（2026-09-09）
> **作者**: MiniMax-M3
> **目的**: handler / middleware / route 实施前的 design checklist（解决周期 10 自检扣分项）

## 背景

周期 10 自检（`cycle-10-self-check.md`）扣 2 分："handler design checklist 经验沉淀在 lessons.md 但未落到工具"。
本 checklist 把周期 8-10 三处 handler 反例（C8-B01 / C9-B01 / C9-B02）抽成可复用的 8 维度清单。

## 8 维度 Checklist

### 1. 返回值语义（Return Semantics）

- [ ] handler 是 throw vs return `{ok, value, error}` 二选一
- [ ] **throw 路径**：caller 必须 try/catch（不 catch = process crash）
- [ ] **return 路径**：caller 必须判 `{ok}` 字段（不判 = silent failure）
- [ ] **混合路径禁止**：同一 handler 不能部分 throw 部分 return —— 文档化决策

**反例**：
- C8-B01：metricsOtlpHandler 抛错时 caller 没 catch → 500 错配
- C9-B01：mcpManifest handler 双层包裹（一层 throw 一层 return ok）→ caller 困惑

### 2. 同步 / 异步契约（Sync/Async Contract）

- [ ] 明确 handler 总是同步 vs 总是异步 vs 视情况
- [ ] 若返回 Promise：caller 必须 await / .then
- [ ] 若 sync throw：caller try/catch
- [ ] **禁止混用**：避免 `function f() { return asyncFlag ? Promise.resolve(x) : x; }`

**反例**：
- C9-B01：mcpManifest handler 同步返回又异步 throw，caller 写错

### 3. 错误传递（Error Propagation）

- [ ] Error 必须包含：message + stack + 可选 code
- [ ] 序列化安全：避免 throw Error（React 19 等场景无法 stringify）
- [ ] 错误日志包含 context：handler name + input summary
- [ ] **不要吞错**：catch 后仅 console.log 不 rethrow = silent failure

**反例**：
- C8-B01：metricsOtlpHandler 错误无 context，调试 30+ 分钟

### 4. 类型契约（Type Contract）

- [ ] 入参 schema 校验（即使 JS 也要 runtime check）
- [ ] 出参 schema 稳定（caller 可依赖字段）
- [ ] nullable / optional 显式（`null` vs `undefined` 区分）
- [ ] 返回 array 时：明确 empty vs undefined（避免 `forEach` 崩）

**反例**：
- 周期 7：`getAll` 默认不返 remark → caller 访问 undefined 报错

### 5. 副作用（Side Effects）

- [ ] 副作用列表：写文件 / 改 DB / 触发网络 / 修改全局 state
- [ ] 副作用可逆 vs 不可逆（commit / delete 不可逆）
- [ ] 副作用并发安全（race condition 检测）
- [ ] 文档化：handler 是否 idempotent

### 6. 状态（State）

- [ ] 内部状态 vs 外部状态（mutate 全局 vs 实例）
- [ ] 状态并发：多请求下是否安全
- [ ] 状态持久化：内存 vs DB vs 文件
- [ ] 状态清理：close() / cleanup() / drain()

**反例**：
- C9-B02：asyncGuard removeEventListener 在 window 替换后失效 → 状态泄漏

### 7. 文档（Documentation）

- [ ] JSDoc 完整：参数 / 返回 / 抛出 / 示例
- [ ] README / docs/ 链接
- [ ] **至少 1 个使用示例**（happy path）
- [ ] **至少 1 个错误示例**（caller 怎么处理）

### 8. 测试（Testing）

- [ ] happy path 测试
- [ ] 每个 throw / return error 路径测试
- [ ] boundary：null / empty / max input
- [ ] 并发：race condition
- [ ] spec 验证 + 真运行（不仅 type check）

## 实施流程（Spec-First）

周期 10 L10-1 已确立 spec-first 模式，本 checklist 强制要求：

```
1. 写 spec（success + failure + edge cases）—— 按上述 8 维度全部覆盖
2. spec 验证通过
3. 写代码
4. 代码验证 spec 仍通过
5. 提交 commit 前复审 8 维度
```

## 反例案例库

| 案例 | 周期 | 维度违反 | 修复 |
| ---- | ---- | -------- | ---- |
| C8-B01 metricsOtlpHandler 缺失 import | 8 | 1, 3 | 加 import + 静态扫描 spec |
| C9-B01 mcpManifest handler 双层包裹 | 9 | 1, 2, 3 | 统一返回值语义 + spec 验证 |
| C9-B02 asyncGuard removeEventListener | 9 | 6 | savedWindow 闭包修复 + state cleanup |

## 与 spec-first 模式集成

| 周期 10 教训 | 本 checklist 对应 |
| ------------ | ---------------- |
| "handler 调用语义需先用 spec 探明" | 维度 1 + 2 |
| "spec-first 模式在 asyncGuard telemetry 一遍过" | 实施流程步骤 1-4 |
| "spec 验证通过即认为 design 正确" | 实施流程步骤 2 门槛 |

## 模板

新建 handler 时复制此 checklist 到 PR description：

```markdown
## Handler: <name>

- [ ] 1. 返回值语义：throw vs return
- [ ] 2. 同步/异步契约
- [ ] 3. 错误传递
- [ ] 4. 类型契约
- [ ] 5. 副作用
- [ ] 6. 状态
- [ ] 7. 文档
- [ ] 8. 测试

## Spec

- `tests/specs/<name>.cjs` —— __ 子断言 PASS

## 决策记录

<为什么这样设计>
```

## Spec 统计

- `handler-design-checklist.cjs` —— **25 子断言 PASS**
- 覆盖：文档存在 + 8 维度结构 + 反例引用 + 实施流程 + spec-first 集成
