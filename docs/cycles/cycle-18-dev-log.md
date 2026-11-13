// docs/cycles/cycle-18-dev-log.md
// 周期 18 开发日志（增量）

## 周期 18（2026-11-13，自动周期第四轮）

- 触发：整点 10 分 cron（`10 * * * *`，Asia/Hong_Kong）。
- 模型：sensenova-6.8-flash（降级原因：无；上下文压缩：未触发）。
- 状态机：cycle 17 = completed → 开启 cycle 18；锁持有→释放。
- 分支：`feat/auto-cycle`。

### 本轮任务（P0，续 R-1701）
**ASI03 workload identity 接入 `withGuardrail` 主链（opt-in）**
- 落点：`server/middleware/aiGuardrails.js`（在 `withGuardrail` 的 input sanitization 后、execute 前插入 opt-in 校验 + `DEFAULT_OPTIONS.workloadIdentity` 默认关闭）。
- 验收：spec `tests/specs/workload-guardrail-integration.cjs` ≥18 子断言全 PASS → 实测 **19/19 PASS**。

### 变更准入判定（关键）
- cycle 17 已预警接入主链可能命中「对外接口」。本轮勘察确认：`withGuardrail(toolFn, opts)` **签名不变**，`wrapped(payload, ctx)` 已通过 `ctx` 传运行时上下文（既有 `hitlApproved` 同模式）。
- 据此做成 **opt-in**：新增 `o.workloadIdentity.enabled`（**默认 `false`**），仅显式启用时才从 `ctx.workloadAttestation` 强制校验。**默认行为零变化、既有调用方不受影响、签名未改** → 判定**非高风险**，通过准入，无需阻塞 `await_confirm`。

### 实现
- `DEFAULT_OPTIONS.workloadIdentity = { enabled:false, secret:null, seenNonces:null, maxAgeMs:300000, expectedIdentity:null }`。
- `withGuardrail` 新增第 5 步（ASI03）：`enabled` 时要求 `ctx.workloadAttestation` 通过 `verifyWorkloadAttestation`（secret / seenNonces / maxAgeMs / expectedIdentity 透传）；失败走 `onRejected` + 抛 `workload_identity_rejected:<reason>`；缺失抛 `workload_identity_attestation_missing`。
- 校验顺序仍在 allowlist / HITL / circuit breaker / sanitize 之后、execute 之前 → 与既有门**共存且不抢优先级**（allowlist/HITL 仍先拦截）。

### 门禁
- 本轮 spec：19 PASS / 0 FAIL（目标 ≥18）。
- 回归（离线）：ai-guardrails 39/39、ai-guardrails-deep 38/38、workload-identity-asi03 29/29 → **零回归**（默认关闭保证既有路径不变）。
- 静态扫描：无密钥/本地路径/.env/调试语句。
- checkpoint/probe：离线跳过（承 R-1502）。

### 提交
- 仅在 `feat/auto-cycle`，小粒度：①护栏集成+spec ②文档台账。未推 main、未合并 PR。

### 下一轮待办
- 有 server 环境时补跑 checkpoint/probe（R-1502）。
- 有 API Key/网络时验证真实 LLM 端到端（R-1601）。
- 可选：在真实调用方（如 GIS 工具注册处）按需启用 `workloadIdentity.enabled`，并注入签名密钥管理（密钥不得硬编码，走凭证服务）。