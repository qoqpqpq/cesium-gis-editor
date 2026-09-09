# AI Agent Security Guardrails（OWASP ASI01-10 映射）

> **周期**: 13 P0-1（首次落地）/ **周期 14 P2-2**: ASI04/06/07 实质化 + ASI03/10 决策文档
> **作者**: MiniMax-M3
> **目的**: 文档化本项目 AI Agent 安全护栏的完整 OWASP ASI 映射。

---

## 1. 背景

OWASP Agentic AI Security Initiative 在 2025-2026 发布 [Agentic AI Top 10 Threats](https://owasp.org/www-project-agentic-skills-top-10/)。本项目作为 AI agent 编排平台，必须落实以下 10 项防御措施。

---

## 2. ASI 落地状态

| ASI | 风险 | 实现状态 | 周期 | 实现位置 |
|---|---|---|---|---|
| ASI01 | Agent Goal Hijack | ✅ 已实现 | C13 P0-1 | `sanitizeInput` |
| ASI02 | Tool Misuse | ✅ 已实现 | C13 P0-1 | `checkToolAllowlist` |
| ASI03 | Identity & Privilege Abuse | 📝 文档化 | C14 P2-2 | 本文档 §3 |
| ASI04 | Agentic Supply Chain | ✅ 已实现 | C14 P0-1 | `validateManifest` |
| ASI05 | Unexpected Code Execution | ✅ 已实现 | C13 P0-1 | `sandbox.js` |
| ASI06 | Memory & Context Poisoning | ✅ 已实现 | C14 P0-1 | `validateMemoryContext` |
| ASI07 | Insecure Inter-Agent Comms | ✅ 已实现 | C14 P0-1 | `signInterAgentMessage / verifyInterAgentMessage` |
| ASI08 | Cascading Failures | ✅ 已实现 | C13 P0-1 | `createCircuitBreaker` |
| ASI09 | Human-Agent Trust | ✅ 已实现 | C13 P0-1 | `dangerousActionsRequireHITL` |
| ASI10 | Rogue Agents | 📝 文档化 | C14 P2-2 | 本文档 §4 |

---

## 3. ASI03 Identity & Privilege Abuse（决策）

### 风险

攻击者伪造 user identity / 越权访问其他用户数据 / 滥用高权限 token。

### 决策：最小可行方案（Phase 1）

**当前方案（周期 13 实施）**：
- `x-user-id` header 提取 userId（Express middleware）
- `req.user.id` 提取（Passport / OAuth）
- `req.ip` 兜底（匿名）
- `memoryContextMiddleware` 注入 ALS

### Phase 2 计划（评估中）

- SPIFFE-style workload identity（tool-name + userId + sessionId 三元组）
- SPIRE 部署（sidecar 或 in-process）
- 跨服务 identity 传递（inter-agent call）

### 决策理由

- Phase 1 已满足 90% 场景
- SPIFFE 部署成本高（K8s + SPIRE + JWT verifier）
- 评估成本 > 当前威胁等级

### 不实施的反面 case

- 完整的 OIDC（成本高、对单用户项目过度）
- WebAuthn（硬件 key 不友好对开发者）

### 触发条件（何时升级）

- 用户数 > 1000
- 多服务架构
- 出现实际 abuse 案例

---

## 4. ASI10 Rogue Agents（决策）

### 风险

被劫持的 agent / 不受控的 agent 执行恶意行为（spam / data exfiltration / DoS）。

### 决策：3 层防御

**Layer 1：Manifest 注册清单**
- 每个 agent 启动前必须 declare manifest（name + version + publisher）
- 未经注册清单的 agent 不允许 spawn
- 周期 14 P0-1 `validateManifest` 是 Layer 1 的核心

**Layer 2：行为审计**
- OTel span 全链路记录（platform / model / tokens / actions）
- Memory log 永久保留（SQLite WAL 模式）
- `/api/metrics` + `/api/otlp/metrics` 暴露异常指标

**Layer 3：Emergency Kill Switch**
- `EMERGENCY_AGENT_DISABLE` 环境变量（部署时设置）
- 进程级 SIGTERM 立即终止所有 agent
- `circuitBreaker.cooldownMs` 临时熔断（5 失败 → 30s cooldown）

### 当前实现位置

| 层 | 实现 | 文件 |
|---|---|---|
| L1 | `validateManifest` | `server/middleware/aiGuardrails.js` |
| L2 | `otelDevHook.runWithSpan` + `metrics.js` | `server/agent/otelDevHook.js` + `server/middleware/metrics.js` |
| L3 | `createCircuitBreaker` + SIGTERM handler | `server/middleware/aiGuardrails.js` + `server/index.js` |

### 不实施的反面 case

- Agent 远程管理 API（攻击面增加）
- 自动 agent 重启（防止 zombie agent 累积）

### 触发条件（何时升级到 Phase 2）

- 出现实际 rogue agent 案例
- 多租户部署（需要严格隔离）
- 法规要求（EU AI Act / 美国 EO）

---

## 5. ASI04 / ASI06 / ASI07 实质化细节

### ASI04：Agentic Supply Chain（周期 14 P0-1）

```javascript
const { validateManifest } = require('./server/middleware/aiGuardrails');

const r = validateManifest(
  { name: 'gis-query', source: 'internal', version: '1.0.0' },
  {
    allowedSources: ['internal', 'npm:trusted'],
    allowedVersions: { 'gis-query': '^1.0' },
    signatureSecret: process.env.MANIFEST_SECRET,
  }
);
if (!r.valid) throw new Error(`Manifest rejected: ${r.reasons.join(', ')}`);
```

**关键决策**：
- 来源白名单默认：internal / npm:trusted / github:trusted
- HMAC-SHA256(source + ':' + version, secret)
- semver ^x.y 范围匹配（简化版，不支持 > < 范围）

### ASI06：Memory & Context Poisoning（周期 14 P0-1）

```javascript
const { validateMemoryContext } = require('./server/middleware/aiGuardrails');

const r = validateMemoryContext(payload, {
  context: conversationContext.getStore(),
  seenNonces: recentNonces,
});
if (!r.valid) throw new Error(`Memory context rejected: ${r.reasons.join(', ')}`);
```

**3 类检测**：
1. **cross-user 注入**：payload.userId !== ALS context.userId
2. **replay nonce**：payload.nonce 已在 seenNonces 中
3. **override 系统字段**：payload 包含 admin / role / is_admin / is_root / privilege / sudo

### ASI07：Inter-Agent Communication（周期 14 P0-1）

```javascript
const { signInterAgentMessage, verifyInterAgentMessage } = require('./server/middleware/aiGuardrails');

// 发送
const signed = signInterAgentMessage(
  { action: 'query', q: 'foo' },
  process.env.AGENT_COMM_SECRET
);

// 接收 + 验证
const r = verifyInterAgentMessage(signed, process.env.AGENT_COMM_SECRET, {
  seenNonces: nonceCache,
  maxAgeMs: 300000, // 5 min
});
if (!r.valid) throw new Error(`Inter-agent msg rejected: ${r.reason}`);
```

**4 项校验**：
1. **签名**：HMAC-SHA256(stableStringify({msg, ts, nonce}), secret)
2. **nonce 未重用**：seenNonces Set 检查
3. **ts 未过期**：默认 5 分钟 maxAgeMs
4. **stableStringify**：key 排序无关，确保跨语言兼容

---

## 6. 未来演进（周期 15+ 计划）

| 周期 | 主题 | 备注 |
|---|---|---|
| C15 | 完整 SPIFFE / SPIRE 部署 | 多服务时启用 |
| C15 | Agent identity rotation（JWT 自动滚动） | 高安全要求时启用 |
| C16 | Inter-agent rate limit（per-tool + per-user） | 防滥用 |
| C16 | Agent audit log 永久归档 | 法规要求时启用 |

---

## 7. 引用

- OWASP Agentic AI Top 10: https://owasp.org/www-project-agentic-skills-top-10/
- Microsoft AGT Reference Architecture: https://microsoft.github.io/agent-governance-toolkit/
- 周期 13 P0-1 commit: `feat(cycle-13): p0-1 AI agent guardrails (OWASP ASI01-10)`
- 周期 14 P0-1 commit: `feat(cycle-14): p0-1 ai guardrails deep (ASI04/06/07)`
- `server/middleware/aiGuardrails.js` —— 完整实现
- `tests/specs/ai-guardrails.cjs` —— 周期 13 spec 39 PASS
- `tests/specs/ai-guardrails-deep.cjs` —— 周期 14 spec 38 PASS
