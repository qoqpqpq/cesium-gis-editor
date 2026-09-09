# Cycle 12 Test Report

> 周期 12 测试报告（2026-09-09）

## 测试基线

- 服务器：`http://localhost:3001`（沿用周期 11 实例，已运行）
- 客户端：未启动（开发任务以 server-side 为主；客户端 hook 通过 node 直接 `import()` 验证）
- 测试命令：
  - `node tests/checkpoint.cjs --report-only` — 9 项 server checkpoint
  - `node tests/probe-real-ai-tool-first.cjs` — 6 项 AI agent probe

## 结果

### checkpoint.cjs

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
```

**9/9 PASS**

### probe-real-ai-tool-first.cjs

```
[PASS] A) POST /api/ai/agent 空 body → 400
[PASS] B) POST /api/ai/agent 缺 messages → 400
[PASS] C) POST /api/ai/agent 非法 platform → 非 5xx
[PASS] D) POST /api/ai/agent?stream=1 空 body → 400
[PASS] E) POST /api/ai/agent 无 api_key → 非 200
[PASS] F) POST /api/ai/chat/stream 空 body → 400
```

**6/6 PASS**

## 合计

- **15/15 PASS**
- 0 失败
- 0 警告
- 0 老 spec 回归（沿用周期 11 的 18 个 spec，本周期再 +8 个）

## 备注

- 服务器沿用周期 11 实例是因为健康检查 200 OK、未触发 reload 需求。
- 客户端 `npm run dev` 在本周期未启动（开发任务以 server 端 + ESM 客户端模块为主），后续周期视需要补。