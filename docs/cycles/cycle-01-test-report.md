# Cycle 01 — Test Report

> 周期 1（启动期）后端探活报告
> 模型: MiniMax-M3 · 报告生成时间: 2026-09-06

## 1. 摘要

| 指标 | 值 |
| ---- | -- |
| 服务端基址 | `http://localhost:3001` |
| health | `env=production` |
| AI 平台数 | 10（openai / claude / gemini / deepseek / minimax / minimax-anthropic / moonshot / zhipu / qwen / ollama）|
| system-prompts 范围 | `gis`（1470 字节）/ `chat` |
| Cesium Ion token | 未配置（`enabled=false`，走无 token fallback） |
| 天地图 token | 未配置（`enabled=false`） |

## 2. checkpoint（report-only）9/9 PASS

```
[PASS] 1) /api/health                       env=production
[PASS] 2) /api/gis/config                   cesium=false tdt=false
[PASS] 3) /api/ai/platforms                 count=10
[PASS] 4) /api/ai/system-prompts            scope=gis len=1470
[PASS] 5) /api/spatial/centroid OK          centroid_features=1
[PASS] 6) /api/spatial/buffer OK            ok
[PASS] 7) /api/spatial/centroid 缺 layer    reject=400
[PASS] 8) /api/ai/agent 缺 body             reject=400
[PASS] 9) server modules require            loaded=8
```

- 健康检查 / GIS 配置 / 平台清单 / 系统提示词 / 空间基础运算 / 错误处理 / 模块 require 全部 OK。
- `cesium=false tdt=false` 是预期：本机无 `CESIUM_ION_TOKEN` / `TIANDITU_TOKEN`，前端走无 token 公开底图（OSM/Esri/高德）。

## 3. probe-real-ai-tool-first 5/6 PASS

```
[PASS] A) POST /api/ai/agent 空 body → 400               status=400 msg=platform / messages 必填
[PASS] B) POST /api/ai/agent 缺 messages → 400            status=400 msg=platform / messages 必填
[FAIL] C) POST /api/ai/agent 非法 platform → 非 5xx       status=500 msg=不支持的平台: __not_a_real_platform__
[PASS] D) POST /api/ai/agent?stream=1 空 body → 400       status=400 msg=platform / messages 必填
[PASS] E) POST /api/ai/agent 无 api_key → 非 200          status=500 msg=[openai] 未提供 AI Key ...
[PASS] F) POST /api/ai/chat/stream 空 body → 400          status=400 msg=platform / messages 必填
```

### 根因分析（FAIL C）

- `server/routes/ai.js` 的 `/api/ai/agent` 非流式分支：

  ```js
  try {
    const result = await aiService.chat(platform, ...);
    ...
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
  ```

  而 `aiService.chat` 在 platform 不在白名单时：
  ```js
  const e = new Error("不支持的平台: " + platform);
  e.status = 400;
  throw e;
  ```
  抛出时已经带 `e.status=400`，但路由的 catch 没有读这个字段，无条件写死 500。
- 同结构在 `/api/ai/chat/stream` 流式分支也存在（`sendEvent('error', { message: e.message })` 时丢 status），但因为 SSE 协议错状态码在 header 里写不进去，暴露给客户端的就是"未知错误"。
- 预期契约：非流式路由 catch 应 `const status = e.status || 500; res.status(status).json(...)`，与 `/api/spatial/*` 的模式一致。

### 严重度

- 低。用户路径不会主动发非法 platform（前端 UI 选下拉框），但任何写脚本/Postman 调试都会看到 500，对监控告警有噪声。
- 归类为 P2-新（不在本周期 upcoming-work.md 已列条目中），进入 bugs.md 跟踪。

## 4. 其他观察

- `chat/stream` 与 `agent` 流式分支存在大段重复（心跳 / abort / 错误事件 / 用量上报 ~80 行），对应 `upcoming-work.md` P1-3。
- `aiConcurrency.acquire` 的快速路径里 `if (!signal || !signal.aborted)` 是个非对称判断：当有 signal 但未 aborted 时仍会走 `slot.free > 0` 快路径，OK。排队路径在 `signal.aborted` 检查后 push 但 resolve 路径已被 abort 后不会 resolve——安全。
- `spatial.js` 的 `dissolve(layerA, layerB, groupBy)` 把 layerB 设为必传，对应 P0-1。
- `rateLimit.js` 的 `isLocal` 把 `172.16.0.0/12` 视作内网放行，对应 P0-2。
- `ai.js` 的 `validateBaseUrl` 开发态放行 http 协议（Ollama），对应 P0-3。

## 5. 周期结论

- 后端基础可用 ✅
- 仅 1 个低优 bug（FAIL C），进入 `cycle-01-bugs.md`（P2-新，不阻塞本周期）
- 计划内的 P0-1 / P0-2 / P0-3 与 4 个 P1 进入开发阶段
