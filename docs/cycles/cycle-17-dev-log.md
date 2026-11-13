// docs/cycles/cycle-17-dev-log.md
// 周期 17 开发日志（增量）

## 周期 17（2026-11-13，自动周期第三轮）

- 触发：整点 10 分 cron（`10 * * * *`，Asia/Hong_Kong）。
- 模型：sensenova-6.8-flash（降级原因：无；上下文压缩：未触发）。
- 状态机：cycle 16 = completed → 开启 cycle 17；锁持有→释放。
- 分支：`feat/auto-cycle`。

### 本轮任务选取
- cycle 16 两条待办（真实 LLM 端到端 R-1601、checkpoint/probe R-1502）均需 API Key/网络/运行 server，**离线不可执行**。
- 按进度池 Top5 优先级选取 **Top3：ASI03 SPIFFE-lite workload identity 实质化**（承接周期 13–14 AI 护栏主线，纯代码离线可测）。

### 本轮任务（P0）
**ASI03 SPIFFE-lite workload identity**
- 落点：`server/middleware/aiGuardrails.js`（增量新增三函数，复用既有 `_hmacSha256Hex`/`_stableStringify`/`_generateNonce`/`_timingSafeEqualHex`；不改既有导出/中间件签名）。
- 验收：spec `tests/specs/workload-identity-asi03.cjs` ≥18 子断言全 PASS → 实测 **29/29 PASS**。

### 实现
- `deriveWorkloadId(toolName, userId, sessionId)`：三元组 → SPIFFE-lite ID（`spiffe-lite://gis-agent/workload/{tool}/{user}/{session}`，字段 `encodeURIComponent` 防分隔符注入）。
- `signWorkloadAttestation(identity, secret, opts)`：HMAC-SHA256 签发证明，载荷 = `stableStringify({workloadId, toolName, userId, sessionId, ts, nonce})`。
- `verifyWorkloadAttestation(attestation, secret, opts)`：校验顺序 = 缺字段 → secret → expectedIdentity 绑定 → **workloadId 重派生一致性**（防 ID 被篡改）→ 签名 → nonce 防重放 → ts 过期。

### 开发中发现并修复的缺陷
- **C17-B01（阻断，已修，自引入）**：插入新函数时截断了 circuit breaker 的 JSDoc 注释开头 `/**`，导致 `SyntaxError: Unexpected token '*'`。修复：恢复注释块。`node --check` 通过。

### spec 修正（非实现缺陷）
- C4/C11 初版期望与 verify 的**校验顺序**不符：篡改 `userId` 先命中 `workload_id_mismatch`（优于原期望的 signature_mismatch，更早拦截）、篡改 `ts` 先命中 `signature_mismatch`（ts 进入签名载荷）。修正断言以匹配实际（且更优）行为。

### 门禁
- 本轮 spec：29 PASS / 0 FAIL（目标 ≥18）。
- 回归（离线）：ai-guardrails 39/39、ai-guardrails-deep 38/38 → **零回归**。
- 静态扫描：无硬编码密钥、无本地绝对路径、无 .env 引用、无调试语句（spec 中 SECRET 为测试固定值）。
- checkpoint/probe：离线跳过（承 R-1502）。

### 变更准入
- 增量新增函数，未触碰数据库 Schema / 对外接口（既有导出签名不变）/ 核心依赖大版本 / 部署脚本 / 权限 / CI-CD → **通过，无需人工审批阻塞**。

### 提交
- 仅在 `feat/auto-cycle`，小粒度：①护栏函数+spec ②文档台账。未推 main、未合并 PR。

### 下一轮待办
- 将 workload identity 接入 `withGuardrail` 主链（可选，作为 ASI03 强制门）——需评估对既有调用方影响，可能命中「对外接口」→ 届时走变更准入评审。
- 有 API Key/网络时验证 R-1601；有 server 时补 R-1502。