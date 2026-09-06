# Cycle 02 — Test Report

> **周期**: N=2（继承期）
> **范围**: 沿用周期 1 跑过的 checkpoint.cjs + probe-real-ai-tool-first.cjs，验证 baseline 与任何 regression。

## 1. Checkpoint（`tests/checkpoint.cjs --report-only`）

```
=== checkpoint @ http://localhost:3001 (report-only=true, strict=false) ===
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

**结论**: baseline 9/9 PASS，周期 1 的所有改动无 regression。**生产态启动**（env=production）比周期 1 报告的 dev 态更紧，需要注意 CSP 现在已生效。

## 2. Probe（`tests/probe-real-ai-tool-first.cjs`）

```
=== probe-real-ai-tool-first @ http://localhost:3001 (strict=false) ===
  [PASS] A) POST /api/ai/agent 空 body → 400
  [PASS] B) POST /api/ai/agent 缺 messages → 400
  [FAIL] C) POST /api/ai/agent 非法 platform → 非 5xx — status=500 msg=不支持的平台: __not_a_real_platform__
  [PASS] D) POST /api/ai/agent?stream=1 空 body → 400
  [PASS] E) POST /api/ai/agent 无 api_key → 非 200 — status=500
  [PASS] F) POST /api/ai/chat/stream 空 body → 400

--- summary: pass=5 fail=1 ---
```

**结论**: B01（agent 端点非法 platform 返回 500）**在周期 2 仍然复现**。已记录到 `cycle-02-bugs.md`，本周期 P0-5 修复。

## 3. 与周期 1 对比

| 项 | 周期 1 报告 | 周期 2 复跑 | 变化 |
| -- | ---------- | ----------- | ---- |
| checkpoint 9 项 | 9/9 PASS | 9/9 PASS | 无 |
| probe 6 项 | 6/6 PASS（误报 PASS，因为 A-E 全部 5xx 也算"非 200"） | 5/6 PASS（**修正逻辑后 C 显式 500**） | **新发现 B01** |
| 新增 bug 数 | 1（B01） | 0 新增 + 1 沿用 | 0 |
| 后台 server | dev 态 | production 态 | 切换（由 server 启动参数决定） |

**观察**: 周期 1 的 probe 脚本把"非 200"判作 PASS，遗漏了"应当是 400 但返回 500"的情况。本周期已修正 probe 的判断逻辑（参考 `cycle-01-test-report.md` 中"root cause for C"段）。

## 4. 根因分析

### 4.1 B01：agent 端点非法 platform → 500

**文件**: `server/routes/ai.js:170-186`（非流式分支）

```javascript
if (!stream) {
  try {
    const result = await aiService.chat(
      platform, enhanced, options || {}, visionAttachments,
      ...
    );
    ...
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
    //  ↑↑↑ 这里统一 500，但 platform 不存在其实是 4xx
  }
  return;
}
```

`aiService.chat` 内部对未知 platform 抛 `Error('不支持的平台: ' + platform)`，但 **没有带 `e.status`**。其它分支（缺 platform 校验）在路由层已经 `e.status = 400` 抛出来了。

**根因**:
- `aiService.chat` / `aiService.chatStream` 抛错时**没有**附 status 字段
- agent 路由层用 `catch (e) { res.status(500) }` 兜底，没识别"客户端错误 vs 服务端错误"

**修复策略**（P0-5）:
1. `aiService.chat` 抛错时按业务规则带 status（400 平台 / 400 缺 key / 502/504 上游 / 500 兜底）
2. 路由层 `catch (e) { res.status(e.status || 500) }` 用 status 字段路由

### 4.2 其它未发现新问题

- 后台 server 仍跑在周期 1 启动的进程上（端口 3001）
- 周期 1 的 8 个 commit + 本周期 1 个 commit（共 9 个）已 push 成功
- 没有任何 P0-1/2/3 / P1-2/3/4/5 的 regression

## 5. 周期 2 行动计划

- **P0-5**: 修 B01（agent 端点 status 字段）
- **P0-4**: Vite 升级 + 生产态 CSP 补 localhost
- **P1-x / P2-x**: 按 `cycle-02-execution-plan.md` 顺序实施
