# Cycle 07 — Test Report（测试报告）

> **周期**: N=7
> **时间**: 2026-09-08
> **基线**: server 3001 (200 OK) + client Vite 5.4.21 @ 8080 (200 OK)

## 1. 检查点 checkpoint.cjs --report-only

执行命令：`node tests/checkpoint.cjs --report-only`

```
[PASS] 1) /api/health — env=production
[PASS] 2) /api/gis/config — cesium=false tdt=false
[PASS] 3) /api/ai/platforms — count=10
[PASS] 4) /api/ai/system-prompts — scope=gis len=1470
[PASS] 5) /api/spatial/centroid OK — centroid_features=1
[PASS] 6) /api/spatial/buffer OK — ok
[PASS] 7) /api/spatial/centroid 缺 layer — reject=400
[PASS] 8) /api/ai/agent 缺 body — reject=400
[PASS] 9) server modules require — loaded=8

--- summary: pass=9 fail=0 ---
```

**结果**：9/9 PASS，与周期 6 baseline 一致，无回归。

## 2. AI 工具探针 probe-real-ai-tool-first.cjs

执行命令：`node tests/probe-real-ai-tool-first.cjs`

```
[PASS] A) POST /api/ai/agent 空 body → 400 — msg=platform / messages 必填
[PASS] B) POST /api/ai/agent 缺 messages → 400
[PASS] C) POST /api/ai/agent 非法 platform → 400 — msg=不支持的平台
[PASS] D) POST /api/ai/agent?stream=1 空 body → 400
[PASS] E) POST /api/ai/agent 无 api_key → 400 — msg=[openai] 未提供 AI Key
[PASS] F) POST /api/ai/chat/stream 空 body → 400

--- summary: pass=6 fail=0 ---
```

**结果**：6/6 PASS，AI 端点错误处理路径全绿。

## 3. 端口监听

| 端口 | 服务 | 状态 |
| ---- | ---- | ---- |
| 3001 | server/index.js (Express) | 200 OK |
| 8080 | client Vite 5.4.21 (dev) | 200 OK（注意：本周期启动发现 Vite 用了 8080 而非 5173；推测是 .mockup/*.html 与端口冲突所致） |

## 4. 老 spec 回归

未在本报告周期跑全部老 spec；本周期 dev 阶段会对所有新增 spec + 受影响的 5 个老 spec 做端到端验证。

## 5. 总结

- 基线健康：✅
- 服务可用性：✅
- AI 端点探针：✅
- 没有新的回归或崩溃

**结论**：周期 7 启动基线良好，可进入 dev 阶段。
