# Cycle 02 — Bugs

> **周期**: N=2（继承期）
> **范围**: 本周期新发现或沿用的 bug。每条带复现步骤、期望/实际、严重度、根因与修复指向。

## B01（沿用周期 1）— `/api/ai/agent` 非法 platform 返回 500 而非 400

| 字段 | 值 |
| ---- | -- |
| 严重度 | **低**（仅错误码分类问题，行为可接受） |
| 出现位置 | `server/routes/ai.js:182-184` |
| 影响 | 非流式 agent 端点对客户端错误（未知 platform）误归 5xx，前端 alert 会显示"服务器内部错误" |
| 首次发现 | 周期 1 probe-real-ai-tool-first.cjs |
| 本周期复跑 | 复现（5xx） |

### 复现步骤

```bash
curl -s -X POST http://localhost:3001/api/ai/agent \
  -H 'content-type: application/json' \
  -d '{"platform":"__not_a_real_platform__","messages":[{"role":"user","content":"hi"}]}'
```

### 期望 / 实际

| 项 | 内容 |
| ---- | ---- |
| 期望 | `HTTP 400 + {"success":false,"message":"不支持的平台: __not_a_real_platform__"}` |
| 实际 | `HTTP 500 + {"success":false,"message":"不支持的平台: __not_a_real_platform__"}` |

### 根因

- `server/services/ai.js:438-441` `chat()` 抛错未带 `status`：

  ```javascript
  if (!cfg) {
    const e = new Error("不支持的平台: " + platform);
    // 周期 1 没有 e.status = 400
    throw e;
  }
  ```

- `server/routes/ai.js:182-184` agent 路由 catch 后统一 500：

  ```javascript
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
  ```

### 修复计划

- **P0-5（周期 2）**：
  1. `chat()` / `chatStream()` 抛错时按业务规则带 `e.status`
     - 未知 platform → `e.status = 400`
     - 缺 api_key → `e.status = 400`（已经）
  2. agent 路由层 `catch (e) { res.status(e.status || 500) }`

### 验证

- 修复后跑 `node tests/probe-real-ai-tool-first.cjs` → C 应 PASS（status=400）
- 新增 `tests/specs/agent-platform-400.cjs` 覆盖更细粒度的 status 分类
