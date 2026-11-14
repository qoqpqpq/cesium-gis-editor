<!-- ===== 本地实例（本会话 cycle 记录）===== -->
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

<!-- ===== 远端实例（另一自动化实例 cycle 记录）===== -->
# Cycle 17 Development Log

> 周期 17 开发日志（2026-10-16）
> 分支：feat/auto-cycle
> 模型：MiniMax-M3

---

## R1: P1-1 viewState.js URL 序列化/反序列化测试

**来源**：周期 17 新增 P1 任务

**新增文件**：

| 文件 | 改动 | 说明 |
|---|---|---|
| `docs/cycles/cycle-17-execution-plan.md` | 新建 | 周期 17 计划 |
| `tests/specs/viewstate-url-serialization.cjs` | 新建 | 38 PASS spec |

**实现内容**：
- 静态扫描验证（12 项）：常量定义 + 函数导出
- base64UrlEncode 逻辑验证（3 项）：基本编码 / 中文编码 / JSON 编码
- base64UrlDecode 逻辑验证（4 项）：基本解码 / 中文解码 / JSON 解码 / 空字符串
- buildViewStateHash 逻辑验证（5 项）：空 state / 降级逻辑 / URL 长度检查 / 压缩逻辑 / 降级警告
- readViewStateFromUrl 逻辑验证（4 项）：v1 格式 / v2 格式 / camera 验证 / 错误处理
- 压缩/解压函数验证（7 项）：compressToBase64 / decompressFromBase64 / decompressFromBase64Async / DecompressionStream / pako 懒加载 / base64UrlEncodeBytes / base64UrlDecodeBinary
- 实际压缩测试（3 项）：zlib deflate/inflate / 压缩体积验证 / v2 前缀检测

**子断言**：38 PASS / 0 FAIL

**回归验证**：
- ai-guardrails: 39 PASS ✅
- ai-guardrails-deep: 38 PASS ✅
- server-import-completeness: 12 PASS ✅

**零回归确认**：3 个 spec 全部通过。

---

## R2: P1-2 asyncGuard.js 异步错误处理测试

**来源**：周期 17 新增 P1 任务

**新增文件**：

| 文件 | 改动 | 说明 |
|---|---|---|
| `tests/specs/asyncguard-error-handling.cjs` | 新建 | 43 PASS spec |

**实现内容**：
- 静态扫描 - 导出验证（6 项）：installAsyncGuard / uninstallAsyncGuard / isAsyncGuardInstalled / wrapAsyncHandler / 默认导出
- 静态扫描 - 内部状态（3 项）：_installed / _currentListener / _telemetryUrl
- installAsyncGuard 逻辑验证（6 项）：window 环境 / 防止重复安装 / unhandledrejection 监听 / error 监听 / _installed 设置 / 返回卸载函数
- handlerRejection 逻辑验证（6 项）：提取 rejection reason / 转换 Error / console.error / 上报 telemetry / onError 回调 / preventDefault
- handlerError 逻辑验证（4 项）：提取 event.error / 转换 Error / console.error / 上报 telemetry
- wrapAsyncHandler 逻辑验证（7 项）：检查 fn 类型 / 返回包装函数 / try-catch / 转换 Error / 上报 telemetry / onError 回调 / 不 rethrow
- reportTelemetry 逻辑验证（6 项）：检查 _telemetryUrl / 检查 navigator / sendBeacon 优先 / fallback fetch / 错误静默 / console.warn
- uninstallAsyncGuard 逻辑验证（4 项）：调用 _currentListener / 清除 _installed / 清除 _currentListener / 清除 _telemetryUrl
- isAsyncGuardInstalled 逻辑验证（1 项）：返回 _installed 状态

**子断言**：43 PASS / 0 FAIL

**回归验证**：
- ai-guardrails: 39 PASS ✅
- ai-guardrails-deep: 38 PASS ✅
- server-import-completeness: 12 PASS ✅

**零回归确认**：3 个 spec 全部通过。

---

## R3: P1-3 sessionKeys.js 会话密钥管理测试

**来源**：周期 17 新增 P1 任务

**新增文件**：

| 文件 | 改动 | 说明 |
|---|---|---|
| `tests/specs/sessionkeys-management.cjs` | 新建 | 44 PASS spec |

**实现内容**：
- 静态扫描 - 导出验证（7 项）：getAll / get / set / remove / clearAll / hasAny / maskKey
- 静态扫描 - 内部结构（4 项）：store 对象 / notify 函数 / dispatchEvent / CustomEvent
- getAll 逻辑验证（9 项）：opts 参数 / withRemark 选项 / Object.entries / platform 字段 / apiKey 字段 / baseUrl 字段 / modelName 字段 / savedAt 字段 / 条件返回 remark
- get 逻辑验证（3 项）：检查 store[platform] / 返回 null 当不存在 / 返回包含 platform 的对象
- set 逻辑验证（6 项）：存储 apiKey / baseUrl（默认空字符串）/ modelName（默认空字符串）/ remark（默认空字符串）/ savedAt（默认当前时间）/ 调用 notify
- remove 逻辑验证（3 项）：检查 store[platform] / 删除 store[platform] / 调用 notify
- clearAll 逻辑验证（3 项）：遍历 store 键 / 删除每个键 / 调用 notify
- hasAny 逻辑验证（1 项）：检查 store 键数量
- maskKey 逻辑验证（3 项）：空值返回空字符串 / 短字符串返回 **** / 长字符串返回前4后4
- maskKey 实际测试（5 项）：空字符串 / null / 短字符串 / 长字符串 / 边界值（9字符）

**子断言**：44 PASS / 0 FAIL

**回归验证**：
- ai-guardrails: 39 PASS ✅
- ai-guardrails-deep: 38 PASS ✅
- server-import-completeness: 12 PASS ✅

**零回归确认**：3 个 spec 全部通过。

---

## R4: P1-4 splatLoader.js + tilesetLoader.js 加载器测试

**来源**：周期 17 新增 P1 任务

**新增文件**：

| 文件 | 改动 | 说明 |
|---|---|---|
| `tests/specs/tileset-loaders.cjs` | 新建 | 47 PASS spec |

**实现内容**：
- splatLoader.js 静态扫描（7 项）：SPLAT_QUALITY_PRESETS / classifySplatQuality / loadGaussianSplatTileset / getSplatLODConfig / getRecommendedPreset / 常量导出 / 默认导出
- splatLoader.js 逻辑验证（7 项）：5 个预设 / classifySplatQuality 类型检查 / 返回 unknown / loadGaussianSplatTileset 检查 viewer / 检查 assetId / getSplatLODConfig 检查 / getRecommendedPreset 默认
- tilesetLoader.js 静态扫描（9 项）：KNOWN_GAUSSIAN_EXTS / KNOWN_VECTOR_EXTS / KNOWN_VOXEL_EXTS / classifyTileset / chooseRenderMode / isFeatureSupported / isTileset2x / 常量导出 / 默认导出
- tilesetLoader.js 逻辑验证（13 项）：classifyTileset 输入检查 / root 或 asset 检查 / gltfUpAxis 检测 / version 2.1 检测 / Gaussian splat 检测 / vector tiles 检测 / voxel 检测 / chooseRenderMode 优先级 / isFeatureSupported 类型检查 / gaussian-splat / vector-tiles / voxel / isTileset2x
- classifyTileset 实际测试（6 项）：1.x tileset / 2.0 tileset / 2.1 tileset / Gaussian splat / Vector tiles / 无效输入
- chooseRenderMode 实际测试（5 项）：无 cls / 1.x / Gaussian splat / Vector tiles / Hybrid

**子断言**：47 PASS / 0 FAIL

**回归验证**：
- ai-guardrails: 39 PASS ✅
- ai-guardrails-deep: 38 PASS ✅
- server-import-completeness: 12 PASS ✅

**零回归确认**：3 个 spec 全部通过。

---

## 总计

- **R1**：38 PASS / 0 FAIL（P1-1）
- **R2**：43 PASS / 0 FAIL（P1-2）
- **R3**：44 PASS / 0 FAIL（P1-3）
- **R4**：47 PASS / 0 FAIL（P1-4）
- **Commits**：4 个
- **新增 spec**：4 个（viewstate-url-serialization + asyncguard-error-handling + sessionkeys-management + tileset-loaders）
- **新增文档**：4 个（cycle-17-execution-plan + cycle-17-dev-log + cycle-17-test-report + cycle-17-self-check）

**Cycle 17 完成**：4 轮全部完成，P1 4/4，共 172 PASS / 0 FAIL
