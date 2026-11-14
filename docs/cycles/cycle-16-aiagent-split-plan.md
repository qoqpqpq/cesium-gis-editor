# aiAgent.js 拆分方案（周期 16 R3）

> 分析时间：2026-10-16
> 文件：client/src/pages/gis/aiAgent.js
> 大小：428 行

---

## 当前结构分析

| 模块 | 行范围 | 功能 | 耦合度 |
|---|---|---|---|
| 常量配置 | 1-24 | MAX_TURNS / MAX_TRANSCRIPT_CHARS / CONFIRM_TIMEOUT_MS / THINK_TAG_RE | 低 |
| formatToolResult | 29-36 | 格式化工具结果（<<<TOOL_RESULT>>> 哨兵） | 低 |
| completedTools | 39-42 | 从文本解析工具调用 | 低 |
| streamOnceWithEndpoint | 58-177 | SSE 流处理（XHR + event parsing） | 中 |
| streamOnce | 188-206 | 端点 fallback 包装 | 中 |
| trimTranscript | 209-221 | 超长 transcript 裁剪 | 低 |
| runAgentLoop | 232-428 | 主循环（agentic loop） | 高 |

---

## 拆分建议

### 方案 A：按职责拆分（推荐）

| 新文件 | 内容 | 说明 |
|---|---|---|
| `aiAgent/constants.js` | MAX_TURNS / MAX_TRANSCRIPT_CHARS / CONFIRM_TIMEOUT_MS / THINK_TAG_RE | 纯常量，零依赖 |
| `aiAgent/utils.js` | formatToolResult / completedTools / trimTranscript | 纯函数，无副作用 |
| `aiAgent/stream.js` | streamOnceWithEndpoint / streamOnce | SSE 流处理，依赖 XHR + aiApi |
| `aiAgent/loop.js` | runAgentLoop | 主循环，依赖 stream.js + aiTools.js |
| `aiAgent/index.js` | re-export 所有公共 API | 向后兼容入口 |

### 方案 B：按依赖拆分

| 新文件 | 内容 | 说明 |
|---|---|---|
| `aiAgentCore.js` | 常量 + utils（无外部依赖） | 可独立测试 |
| `aiAgentStream.js` | streamOnceWithEndpoint / streamOnce | 依赖 aiApi |
| `aiAgentLoop.js` | runAgentLoop | 依赖 stream + tools |

### 方案 C：保持单文件 + 注释分区

当前 428 行在可接受范围内，可考虑：
- 添加详细分区注释
- 每个函数添加 JSDoc
- 保持单文件但结构清晰

---

## 拆分优先级

| 优先级 | 动作 | 理由 |
|---|---|---|
| P0 | 添加详细注释 + JSDoc | 当前已有部分注释，但不够详细 |
| P1 | 拆出 constants.js | 纯常量，零风险 |
| P1 | 拆出 utils.js | 纯函数，零副作用，易测试 |
| P2 | 拆出 stream.js | 依赖 XHR，需 mock 测试 |
| P3 | 拆出 loop.js | 核心逻辑，依赖多，风险高 |

---

## 测试覆盖建议

| 文件 | 可测试内容 | 测试策略 |
|---|---|---|
| constants.js | 常量值验证 | 直接 require |
| utils.js | formatToolResult / completedTools / trimTranscript | 纯函数测试 |
| stream.js | SSE event parsing | mock XHR |
| loop.js | agentic loop 流程 | mock stream + tools |

---

## 当前导出

```js
export async function runAgentLoop(...) { ... }
```

只有一个导出函数，拆分后可保持相同导出接口。

---

## 风险评估

| 风险 | 等级 | 缓解措施 |
|---|---|---|
| 拆分后 import 路径变化 | 中 | 保持 index.js re-export |
| stream.js 依赖 XHR | 高 | 需 mock XHR 测试 |
| loop.js 依赖多 | 高 | 先拆 constants + utils，loop 保持不动 |

---

## 实施计划

| 轮次 | 动作 | 风险 |
|---|---|---|
| R3（本轮） | 分析 + 方案文档 + spec | 低 |
| R4+ | 实际拆分（constants + utils） | 中 |
| R5+ | 拆分 stream + loop | 高 |
