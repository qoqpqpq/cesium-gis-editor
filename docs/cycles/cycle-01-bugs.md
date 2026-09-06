# Cycle 01 — Bugs

> 本周期测试发现的新 Bug。已存在的"可优化项"在 `docs/release-notes/upcoming-work.md`。
> 优先级: P0（阻塞）/ P1（高）/ P2（中低）。
> 状态: open / in_progress / fixed / wontfix。

## B-01 · `/api/ai/agent` 非法 platform 返 500 应为 400

- **优先级**: P2
- **状态**: open
- **影响面**: 监控噪声；不影响真实用户路径
- **复现**:
  ```bash
  curl -X POST http://localhost:3001/api/ai/agent \
    -H 'Content-Type: application/json' \
    -d '{"platform":"__not_a_real_platform__","messages":[{"role":"user","content":"ping"}]}'
  ```
  当前返回 `500 {"success":false,"message":"不支持的平台: __not_a_real_platform__"}`
  预期返回 `400 {"success":false,"message":"不支持的平台: ..."}`
- **根因**: `server/routes/ai.js` 的 `/agent` 非流式分支 `catch (e) { res.status(500).json({ ... e.message }) }` 未读 `e.status`。
- **修复建议**: 抽公共 helper `errStatus(e, fallback=500)`；非流式 catch 改为 `const status = e.status || 500; res.status(status).json({ success: false, message: status >= 500 ? '服务器内部错误' : e.message })`，与 `/api/spatial/*` 错误格式一致。
- **关联文件**:
  - `server/routes/ai.js`（行 226-229 非流式 catch；行 293-296 流式 catch）
  - `server/services/ai.js`（行 414-417 抛 `e.status=400`）
- **与 P1-3 的关系**: 抽公共 `sseStreamHandler` 时一起顺带修。
- **计划**: 周期 2 与 P1-3 合并修复。
