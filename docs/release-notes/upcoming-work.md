# Upcoming Work（多周期累积池）

> 所有周期按"清除已完成的条目"的方式收敛。
> 顶部为最高优先级 P0，自上而下递减；周期结束后由对应周期把"已交付"项移到 commits 区。

## 新增需求（用户 2026-11-14 指定，排在原有功能之后）

### UI-REFACTOR：UI 设计重构（更好看 · 更简洁）

> 用户 2026-11-14 新增，优先级 P2（排在原有 P0/P1 功能之后）。
> 现状：已有设计 token 体系雏形（`client/src/theme.css` 248 变量、亮/暗双主题、语义别名），但仍有 **110 个硬编码色值**未迁移；主页面 `client/src/pages/gis/index.jsx` 1100 行；无 UI 框架（纯手写 CSS，6254 行）。
> 目标：换一套**更好看、更简洁**的设计方案，在不破坏既有功能与双主题的前提下提升视觉一致性与简洁度。

分阶段（每阶段可独立交付、可验证）：
- **UR-1 设计审计与 token 收敛**：统计并迁移硬编码色值到语义 token；产出「颜色/间距/圆角/阴影/字号」token 清单。验收：硬编码色值数量显著下降（目标 −50%+），双主题下无视觉断裂。
- **UR-2 布局与密度简化**：精简 `index.jsx`（1100 行）的视觉密度与嵌套，统一间距/圆角/阴影 scale；抽取可复用样式。验收：`index.jsx` 行数下降，样式重复消除；功能零回归。
- **UR-3 组件视觉统一**：统一按钮/输入/卡片/弹窗/面板的视觉语言（一致内边距、边框、hover/active/focus 态）。验收：同类组件视觉参数一致；双主题各核对。
- **UR-4 字体与层次**：统一字号阶梯、字重、行高，强化信息层次。验收：字号使用收敛到 token 阶梯。

约束：不改业务逻辑/协议/接口（纯表现层）；每阶段独立提交在 `feat/auto-cycle`；双主题（light/dark）全程不破。

## 周期 46 已交付（2026-11-15，自动周期第九轮）

- ✅ **转 UR-2 第一步：CSS 重复声明审计工具 + 可量化基线 + 字号阶梯提案** —— 新增 `scripts/css-duplication-audit.cjs`（可复用，`--json`/`--prop`）。**关键发现（纠正预设）**：index.jsx 仅 1 处内联 style（必需的动态 --left-w/--right-w），密度问题在 **CSS 膨胀**（styles.css 5723 行/3522 声明）而非 JSX。基线 **6261 行/3684 声明**；Top 重复 `display:flex`×162/`align-items:center`×90/`font-size:12px`×78；**font-size 极度碎片化**（10px×44/11px×65/12px×78/13px×28 + px 与 rem 混用）→ 收敛为 `--fs-*` 阶梯是「更简洁」核心抓手。spec `css-duplication-audit.cjs` **10 PASS**。基线报告 `docs/guides/ui-refactor-ur2-baseline.md`。**纯审计零视觉风险**

## 周期 45 已交付（2026-11-15，自动周期第八轮）

- ✅ **UR-1 续** `#ef4444`×2→`var(--danger)`（styles.css，无新增 token）—— **componentTotal 252→250（−2）**；L2962 渐变因此变主题自适应（light 起点略深，细微外观变化已记录）；L3136 文本色自适应安全。回归 css-var-reference-guard 9 + design-token-audit 13 全绿
- ⚠️ **UR-1 边际递减评估**：经 5 轮色值迁移 + 1 缺陷修复 + 本轮，**有精确 token 的安全迁移已基本做完**。剩余 250 中绝大多数是单次出现色值（逐个 token 化价值低）/ 需新建 token（设计判断）/ 主题相关 rgba（需视觉核对）。**结论：UR-1 纯自动化迁移已到边际递减点**，继续硬凑要么低价值要么有不可核对的外观风险；建议后续 UR-1 收尾需人工视觉核对配合，或**转向 UR-2**（精简 index.jsx 1100 行）。状态色 rgba 系本轮跳过（主题相关，需视觉核对）

## 周期 44 已交付（2026-11-15，自动周期第七轮）

- ✅ **UR-1 技术债：修复 CSS var 拼写错误缺陷 C44-B01 + 加护栏 spec** —— 诊断上轮记的「10 个未定义 var」：`--left-w`/`--right-w` 是 JS 注入、`--fg`/`--panel*` 是有意 fallback（均正常），而 **`--white-4`/`--white-5`/`--white-6`/`--white-8` 是拼写错误**（缺前导零，引用不存在的 token → 样式静默失效）。修复为 `--white-04`/`--white-06`/`--white-08`（恢复预期淡色背景）；新增护栏 spec `css-var-reference-guard.cjs` **9 PASS**（白名单放行 JS 注入/fallback，断言未定义引用==0 防复发）。回归 13+24+18 全绿；基线仍 252（typo 是 var 引用非硬编码）

## 周期 43 已交付（2026-11-15，自动周期第六轮）

- ✅ **技术债偿还 + UR-1 度量校准** 审计脚本排除 var() fallback hex —— `scripts/design-token-audit.cjs` 统计前先摘掉 `var(--tok, #fallback)` 整段，只计真硬编码（fallback 是 token 兜底，不应算硬编码）。**基线校准：289（旧虚高）→ 252（真实，styles 123 + theme 129，差值 37 即 fallback）**；spec 13/13 行为契约仍全绿（测结构/自洽非数字）；`--max` 闸门仍有效。后续迁移以 **252** 为准基线

## 周期 42 已交付（2026-11-15，自动周期第五轮）

- ✅ **UI-REFACTOR UR-1 第五步** 灰阶/淡色前景硬编码迁移（styles.css）—— 新增 2 token（`--text-meta: #6b7280` 次要文字 / `--primary-tint-fg: #b6c4ff` primary 淡色前景）；`#6b7280`×6→`var(--text-meta)` + `#b6c4ff`×6→`var(--primary-tint-fg)` = **12 处**；**componentTotal 301→289（−12）**，UR-1 累计 **366→325→319→301→289（−21%）**；双主题未破（2 token 已定义、括号平衡、0 新增未定义 var）；`--max` 闸门 289 PASS。**关键判断**：`#94a3b8`×6 全为 `var(--muted,#94a3b8)` fallback（已在用 token）→跳过；并发现审计脚本把 fallback hex 也计入（脚本局限，记技术债）。回归 13+24+30+18 零失败

## 周期 41 已交付（2026-11-15，自动周期第四轮）

- ✅ **UI-REFACTOR UR-1 第四步** `color:#fff`→`--on-accent-fg` + 品牌渐变去重（styles.css）—— 新增 2 token（`--on-accent-fg: #ffffff` 彩色底前景 / `--grad-brand` 品牌渐变）；`color:#fff`×12→`var(--on-accent-fg)` + `linear-gradient(135deg,#6366f1,#8b5cf6)`×3→`var(--grad-brand)` = **15 处**；**componentTotal 319→301（−18）**，UR-1 累计 **366→325→319→301（−17.8%）**；双主题未破（2 token 已定义、括号平衡、0 新增未定义 var）；`--max` 闸门 302 PASS。**刻意跳过** mask `#fff`×5（非前景文字）与 `var(--panel,#fff)` fallback。回归 13+24+30+18 零失败

## 周期 40 已交付（2026-11-15，自动周期第三轮）

- ✅ **UI-REFACTOR UR-1 第三步** 迁移次高频硬编码到既有语义 token（styles.css，无新增 token）—— `#4f6cff`×2→`var(--primary-strong)` / `#a8b0c6`×1→`var(--text-soft)` / `#fecaca`×3→`var(--level-error-fg)`；**componentTotal 325→319（−6）**，累计 **366→325→319**；等值替换零视觉变化、双主题未破（3 token 全已定义、括号平衡、0 新增未定义 var）；`--max` 闸门 319 PASS。**刻意跳过** `#ffffff`×7（语义歧义，待厘清文字/背景/边框分别映射）与无精确 token 的渐变色。修正 C40-B01（迁移脚本反向扫描误判→改正向扫描）

## 周期 39 已交付（2026-11-15，自动周期第二轮）

- ✅ **UI-REFACTOR UR-1 第二步** 迁移高频硬编码色值到语义 token（styles.css）—— `#f87171`×13→`var(--danger-soft-fg)`(新增 token) / `#4ade80`×10→`var(--success)` / `#fbbf24`×6→`var(--warn)` / `#c8d3ff`×7→`var(--primary-soft-fg)` / `#5ad1ff`×5→`var(--accent-500)`；**componentTotal 366→325（−41，−11%）**，等值替换零视觉变化、双主题未破（5 个 token 全已定义、CSS 括号平衡、未引入新未定义 var）；`--max` 闸门验证 325 PASS/324 FAIL。回归 design-token-audit 13 + coords-classify 24 + attrs-attrtable 30 零失败。发现既存 10 个未定义 var()（技术债，非本轮引入）

## 周期 38 已交付（2026-11-15，自动周期重启首轮）

- ✅ **UI-REFACTOR UR-1 第一步** 设计 token 审计工具 + 可量化基线 —— 新增 `scripts/design-token-audit.cjs`（可复用，支持 `--json`/`--max` 阈值；关键口径：区分「token 定义」vs「组件硬编码用法」，避免误判 theme.css 的 token 源）；基线 **token 定义 165 / 组件硬编码 366（hex 233+rgb 133）**，Top 热点=渐变与状态色；迁移验收闸门 `--max`（目标降到 ≤~180，−50%+）。spec `design-token-audit.cjs` **13 PASS**。基线报告 `docs/guides/ui-refactor-ur1-baseline.md`。**纯审计+度量，未改业务 CSS/JSX（零视觉风险）**

## 周期 24 已交付（2026-11-14，自动周期第十轮）

- ✅ **P2-3 第三批** checkpoint + 列显隐纯逻辑补单测 —— 新增 `tests/specs/editor-utils-checkpoint-colvis.mjs` **18 PASS**（注入全局 localStorage mock 离线可测：saveCheckpoint 返回/持久化/layerId 默认/attrs 深拷贝防御、loadCheckpoint 容错非法 JSON/无 items/items 非数组、clearCheckpoint、save→load→clear 往返、resolveVisibleColumns 全可见/过滤保序/忽略失效列/返回新数组）；**仅新增 spec 无源码改动**。回归 coords-classify 24 + attrs-attrtable 30 + fallback-clear 9 零失败。**P2-3 三批累计 72 子断言覆盖 editor/utils 纯函数**

## 周期 23 已交付（2026-11-14，自动周期第九轮）

- ✅ **P2-3 第二批** editor/utils 纯函数补单测（attrs + attrTableUtils）—— 新增 `tests/specs/editor-utils-attrs-attrtable.mjs` **30 PASS**（readAttrs PropertyBag 契约/数组防御、writeAttrs/updateAttr 不可变+置空删除、coerce number/boolean/null、pickAttrs 过滤保留字段、collectFields 类型推断升序、compareValues null 恒最后/类型序、sortFeatures asc/desc/不改原数组、matchesFilter 大小写不敏感、featuresToCsv BOM+CRLF+RFC4180 转义）；**仅新增 spec 无源码改动**。回归 coords-classify 24/24 + fallback-clear 9/9 零失败。`analysis.js` 因 `@turf/turf` 未安装离线跳过

## 周期 21 已交付（2026-11-13，自动周期第七轮）

- ✅ **P2-3 首批** editor/utils 纯函数补单测（coords + classify）—— 新增 `tests/specs/editor-utils-coords-classify.mjs` **24 PASS**（decToDMS 半球/UTM/MGRS/formatCoord 回落、equal/quantile 断点、unique 去重、classifyValue/UniqueIndex、rampColor/RAMPS/classifyFeatures）；**顺带修复 C21-B01**：`classify.js` `rampColor(i,n)` 当 `i>n-1` 越界致 `lerpHex` TypeError → clamp `i`/`lo`，内部路径零影响（spec D3/D4 固化）。回归 editor-fallback-clear 9/9 零失败

## 周期 19 已交付（2026-11-13，自动周期第五轮）

- ✅ **P1（进度池 Top4）** MCP 工具分类元数据层（camera/entity/animation/imagery）—— `client/src/pages/gis/mcpManifest.js`：冻结常量 `TOOL_CATEGORIES`（camera/entity/animation/imagery/general 兜底）+ `registerTool` 可选第 5 参 category（`_normalizeCategory` 非法回落 general）+ `listToolsByCategory(category?)` 全量分组/单组查询 + `manifestByCategory(category)` 按类子 manifest（serverInfo.name 带 `-<category>` 后缀）；默认 5 工具打标（getCameraState/flyTo→camera、addMarker/spatialQuery→entity、screenshot→imagery；animation 暂空，不凭空造）；unregister/_resetAll 同步清理。**纯增量**：manifest()/listTools()/registerTool 前参语义与既有导出全不变。spec `mcp-tool-categories.mjs` **22 PASS**；server 侧回归 46+29+19 零失败

## 周期 18 已交付（2026-11-13，自动周期第四轮）

- ✅ **P0-1 续（R-1701）** ASI03 workload identity 接入 `withGuardrail` 主链（**opt-in 默认关闭**）—— `server/middleware/aiGuardrails.js`：`DEFAULT_OPTIONS.workloadIdentity={enabled:false,...}` + `withGuardrail` 第 5 步（sanitize 后、execute 前）从 `ctx.workloadAttestation` 经 `verifyWorkloadAttestation` 强制校验（secret/seenNonces/maxAgeMs/expectedIdentity 透传），失败 `onRejected` + 抛 `workload_identity_rejected:<reason>`，缺失抛 `workload_identity_attestation_missing`。**签名不变 + 默认关闭 → 既有调用方行为零变化，判定非高风险通过准入**；与 allowlist/HITL/CB/sanitize 共存不抢优先级。spec `workload-guardrail-integration.cjs` **19 PASS**；回归 guardrails 39 + deep 38 + asi03 29 零失败

## 周期 17 已交付（2026-11-13，自动周期第三轮）

- ✅ **P0-1（进度池 Top3）** ASI03 SPIFFE-lite workload identity 实质化 —— `server/middleware/aiGuardrails.js` 增量新增 `deriveWorkloadId`（toolName+userId+sessionId 三元组 → SPIFFE-lite ID，字段编码防分隔符注入）+ `signWorkloadAttestation`（HMAC-SHA256 + nonce + ts）+ `verifyWorkloadAttestation`（缺字段→secret→expectedIdentity 绑定→workloadId 重派生一致性→签名→nonce 防重放→ts 过期）；复用既有 `_hmac*`/`_stableStringify`/`_generateNonce` 助手，不改既有导出/中间件签名。spec `workload-identity-asi03.cjs` **29 PASS**（目标≥18）；回归 guardrails 39 + deep 38 零失败。修复 C17-B01（自引入：插入截断 JSDoc → SyntaxError）

## 周期 16 已交付（2026-11-13，自动周期第二轮）

- ✅ **P0-1 续（R-1501）** LLM planner 适配层 —— `server/agent/llmPlannerAdapter.js`：注入 `llmChat` 抽象（不硬编码平台/密钥）+ `extractSteps` 健壮解析（围栏/散文/纯数组/单步对象/{steps} 包裹）+ 复用 multiAgentPlanner 的 `normalizeStep + detectCycle + allowlist` 门禁；危险操作仍由 executor HITL 拦截；`ai.js` require 延迟加载提升可选依赖健壮性。spec `multi-agent-llm-planner.cjs` **31 PASS**；回归 multi-agent-planner 46 + guardrails 39 + deep 38 零失败。修复 C16-B01（require 顺序 ReferenceError）

## 周期 15 已交付（2026-11-13，自动周期首轮）

- ✅ **P0-1** Multi-agent GIS Agent 骨架（planner + executor + verifier）—— `server/agent/multiAgentPlanner.js`：planner 按 capability/phase 编排 DAG（环检测 + 白名单 fail-fast）+ executor 依赖感知并行 + 危险操作 HITL 门（复用 aiGuardrails ASI09）+ verifier 契约校验（type/required/equals）；spec `multi-agent-planner.cjs` **46 PASS**（目标 ≥25）；回归 guardrails 39 + deep 38 + strategies 18 + fts5 18 零失败。集成路径见 `docs/cycles/cycle-15-multiagent-integration.md`

## 周期 8 已交付（2026-09-08）

- ✅ **P0-1** memory.js FTS5 全文检索（SQLite `_fts` 虚拟表 + bm25() 排序 + 同步触发器 + LIKE fallback）
- ✅ **P0-2** viewState DecompressionStream 浏览器原生解压（pako 仅做兜底）
- ✅ **P1-1** MCP manifest 浏览器侧暴露（`client/src/pages/gis/mcpManifest.js` + `window.mcp`）
- ✅ **P1-2** executeSandbox 统一调度器（vm / worker / iv / auto 四种 engine）
- ✅ **P1-3** memoryContextMiddleware Express ALS 自动注入
- ✅ **P1-4** METRICS_TRUSTED_CIDRS RFC1918 白名单（零依赖 IPv4 CIDR 解析）
- ✅ **P1-5** client/server 协议同步验证脚本（`scripts/check-protocol-sync.cjs`）
- ✅ **P2-1** OTLP push 评估 spec（结论：pull 已足够，push 暂不实施）
- ✅ **P2-2** helmet 8.x permissionsPolicy 再评估（关键发现：本项目 ^8.3.0 不输出 header）
- ✅ **Bug 修复** C8-B01 metricsOtlpHandler 缺失 import（周期 7 隐藏 bug）

## 周期 9 已交付（2026-09-08）

- ✅ **P0-1** server-import-completeness spec（静态扫描 server/* 模块导出完整性，防御 C8-B01 类隐藏 bug）
- ✅ **P0-2** memory.js WAL + journalMode/optimizePragma helpers（`PRAGMA journal_mode=WAL` + `synchronous=NORMAL` + `optimize` 触发；graceful fallback 无 better-sqlite3）
- ✅ **P1-1** MCP 真集成（`client/src/pages/gis/mcpManifest.js` 5 个核心 GIS 工具 + `installBridgeTransport` 修复 handler 返回值；19/19 sub-assertion PASS）
- ✅ **P1-2** sandbox perf benchmark spec（vm / worker / iv / auto 四 engine × 100/30 次；vm warm p50=0ms / worker-seq p50=628ms / worker-conc-5 p50=397ms）
- ✅ **P1-3** ErrorBoundary asyncGuard（`client/src/utils/asyncGuard.js` window.unhandledrejection + window.error 全局捕获；14/14 sub-assertion PASS）
- ✅ **P1-4** PR review workflow 接 MiniMax-M3（`anthropics/claude-code-action@v1` + `anthropic_base_url` + `--model MiniMax-M3 --max-turns 5`；18/18 sub-assertion PASS）
- ✅ **P2-1** metrics endpoint perf benchmark（`/api/metrics` p50=3ms p95=4ms；`/api/otlp/metrics` p50=2ms p95=3ms；20 并发 56ms）
- ✅ **P2-2** Permissions-Policy middleware 自研（`server/middleware/permissionsPolicy.js` 20 默认策略；helmet 8.x 验证不输出，替代实现；13/13 sub-assertion PASS）

## 周期 10 已交付（2026-09-08）

- ✅ **P0-1** mem0 pgvector self-host 评估（`docs/evaluation/mem0-postgres.md` + docker-compose 草稿；spec `mem0-postgres-eval.cjs` 22 PASS）—— 决策：< 10K 向量 prototype 不切换
- ✅ **P0-2** Agent memory 3 层架构评估（`docs/evaluation/agent-memory-3layer.md` CoALA + MemMachine + zylos；spec 15 PASS）—— 决策：渐进实施，当前 FTS5 = episodic 雏形
- ✅ **P1-1** PR review multi-specialist（`.github/workflows/pr-review.yml` 拆 baseline + security + design 三 specialist + concurrency cancel-in-progress；spec `pr-review-workflow-m3.cjs` 18 → 24 PASS）
- ✅ **P1-2** asyncGuard 上报 /api/telemetry（`client/src/utils/asyncGuard.js` opts.telemetryUrl + sendBeacon + keepalive；`server/routes/telemetry.js` POST localhost-only；`server/middleware/telemetryCollector.js` sliding buffer 1000 items / 1h TTL；spec 30 + 19 PASS）
- ✅ **P1-3** Sandbox worker pool（`server/agent/sandboxWorkerPool.js` LRU + reuse + idle timeout 60s + drain；warm p50 < 100ms vs 周期 9 baseline 628ms；spec 23 PASS）
- ✅ **P2-1** WebGPU + 3D Tiles 2.0 评估（`docs/evaluation/webgpu-3d-tiles.md`：覆盖率 73% < 80% 门槛 + 3D Tiles 2.0 KHR_gaussian_splatting OGC 2026-Q3 candidate；spec 11 PASS）—— 决策：暂不切换 backend

## 周期 12 已交付（2026-09-09）

- ✅ **P0-1** 混合检索 RRF（`server/agent/hybridRetrieval.js`：vector + FTS5 + recency 三通道 RRF 融合 + k0=60；spec `hybrid-retrieval-rrf.cjs` 37 PASS）
- ✅ **P1-1** useOptimistic + Guard 联合 hook（`client/src/hooks/useOptimisticAction.js` ESM；React 19 全路径 + React 18 fallback + shouldOptimistic；spec 28 PASS）
- ✅ **P1-2** SQLite 生产 pragma + 60s passive checkpoint（`server/agent/sqlitePragmas.js`：8 个 PRAGMA 配方 + 60s 后台 loop + stop()；spec 26 PASS）
- ✅ **P1-3** Worker thread trace carrier 注入（`server/agent/workerTraceCarrier.js`：attach/restore/childTraceparent/runInTraceContext；spec `worker-trace-carrier.cjs` 31 PASS 含真实 worker_threads round-trip）
- ✅ **P1-4** 3D Tiles 2.0 vector tiles + Gaussian splat 兼容层（`client/src/utils/tilesetLoader.js`：classifyTileset + chooseRenderMode + isFeatureSupported；spec 31 PASS）
- ⚠️ **P2-1** Viewer 真实改造（`client/src/hooks/useOptimisticMarker.js` 乐观 marker hook；spec 18 PASS；但**未真正接入 cesiumEarth.jsx addMarker**——下周期补足）
- ✅ **P2-2** OTel dev hook（`server/agent/otelDevHook.js` 真实 require OTel SDK + NODE_ENV=production 不安装 + runWithSpan ALS；spec 19 PASS）
- ✅ **P2-3** SSRF metadata IP cron 同步（`scripts/sync-metadata-ips.cjs` dry-run 默认 + markdown/json/csv 三格式解析；spec 23 PASS）
- ✅ **P2-3 docs** `docs/security/metadata-ips.md` 维护 AWS/GCP/Azure/IPv6 段

## 周期 13 已交付（2026-09-09）

- ✅ **P0-1** AI Agent 安全护栏 OWASP ASI01-10（`server/middleware/aiGuardrails.js`：5 步检查链 tool allowlist / dangerous HITL / circuit breaker / input sanitization / execute + 9 种注入模式；spec `ai-guardrails.cjs` 39 PASS）
- ✅ **P0-2** SQLite backend dispatch（`server/agent/sqliteBackend.js`：自动检测 bun → node 24+ → better-sqlite3 → memory fallback + 缺包 graceful fallback；spec 19 PASS）
- ✅ **P1-1** OTel worker 集成 + SQLite pragma 升级（otelDevHook.js 加 `withWorkerContext(carrier, fn)` + `getCurrentTraceparent()`；sqlitePragmas.js 加 `mode: 'PASSIVE' \| 'TRUNCATE'` + `checkSqliteVersion(driver) ≥ 3.51.3`；spec `otel-worker-integration.cjs` 15 PASS 含真实 worker_threads round-trip）
- ✅ **P1-2** Viewer marker 真实接入（`client/src/hooks/useOptimisticMarkerBridge.js`：包装 useOptimisticMarker + viewer ref + addMarker + removeMarker 回滚；spec `viewer-marker-integration.cjs` 21 PASS 含 cesiumEarth.jsx addMarker 契约）
- ✅ **P1-3** 混合检索 RRF 多样化（hybridRetrieval.js 加 `strategy: 'standard' \| 'best-rank' \| 'max+bonus' \| 'diminishing' \| 'soft-dedup'` + α/λ/β 参数；spec `hybrid-retrieval-strategies.cjs` 18 PASS + cycle-12 RRF spec 零回归）
- ✅ **P2-1** CesiumJS Gaussian splat loader（`client/src/utils/splatLoader.js`：classifySplatQuality 5 档 + loadGaussianSplatTileset stub + getRecommendedPreset fps 算法；spec 25 PASS）
- ✅ **P2-2** sqlite-vec 决策文档（`docs/evaluation/vector-extension-decision.md`：5 候选对比表 + 7 维度决策矩阵 + 触发条件 50K/100ms/1GB/metadata 过滤；spec 14 PASS）
- ✅ **P2-3** jsdom + RTL 集成测试脚手架（`client/src/hooks/useOptimisticMarker.test-instructions.js`：INSTALL_INSTRUCTIONS + 示例测试 renderHook + act；spec `jsdom-rtl-instructions.cjs` 20 PASS）

## 周期 14 已交付（2026-09-09）

- ✅ **P0-1** AI 安全护栏深化（OWASP ASI04/06/07 实质化）—— `aiGuardrails.js` 加 `validateManifest`（ASI04 供应链：source 白名单 / version semver 匹配 / HMAC 签名）+ `validateMemoryContext`（ASI06 记忆投毒：cross-user / replay nonce / override 系统字段）+ `signInterAgentMessage / verifyInterAgentMessage`（ASI07 通信签名：HMAC-SHA256 + nonce 防重放 + ts 过期）；spec `ai-guardrails-deep.cjs` 38 PASS
- ✅ **P0-2** memory.js 真实迁移 node:sqlite backend —— `MemoryStore` 构造函数走 `sqliteBackend.js` dispatch（自动检测 bun / node:sqlite / better-sqlite3 / 内存 fallback）；node:sqlite 适配（无 .pragma() 方法，用 exec('PRAGMA ...')）；close 后调用 silent 不抛错；spec `memory-node-sqlite-migration.cjs` 20 PASS（memory-fts5 / memory-wal-pragma / memory-vector-prototype / memory-als-sqlite 零回归）
- ✅ **P1-1** OTel worker SDK 集成 + LLM semantic span —— `otelDevHook.js` 加 `installWorkerSdk(carrier)` + `buildLlmSpanAttributes(opts)`（OpenTelemetry GenAI semantic conventions：gen_ai.system / gen_ai.request.model / gen_ai.usage.input_tokens / gen_ai.usage.output_tokens）+ `runWithLlmSpan(name, fn, llmAttrs)` + `getCurrentLlmAttributes()`；`server/services/ai.js` 加 `wrapWithLlmSpan(result, opts)`；spec `otel-worker-sdk-integration.cjs` 19 PASS
- ✅ **P1-2** RRF ablation spec + 启发式权重搜索 —— `hybridRetrieval.js` 加 `heuristicWeightSearch(store, evalSet, opts)`（5x5x5=125 组合 MRR 评估）+ `RRF_STRATEGIES` 导出；spec `hybrid-retrieval-ablation.cjs` 16 PASS + cycle-12/13 RRF spec 零回归
- ✅ **P1-3** hybridRetrieval OTel semantic span attributes —— `hybridRetrieval.js` 加 `buildRetrievalSpanAttributes(strategy, query, results)`（retrieval.strategy / query_length / result_count / top_score / gen_ai.operation）+ `search()` ALS 内触发；spec `hybrid-retrieval-otel-attributes.cjs` 13 PASS
- ✅ **P1-4** CesiumJS Splat pipeline 文档 —— `docs/guides/splat-pipeline.md`：从 GPS EXIF → COLMAP → SuGaR → Cesium ion 完整 6 阶段 pipeline + Microsoft campus asset 4547222 接入；spec `splat-pipeline-doc.cjs` 20 PASS
- ✅ **P2-1** handler-design checklist OWASP ASI 维度扩展 —— `docs/architecture/handler-design-checklist.md` 加 ASI01-10 全部 10 项检查清单 + spec-first 模式记录；spec `handler-checklist-asi.cjs` 15 PASS
- ✅ **P2-2** AI 风险映射文档扩展 —— `docs/security/ai-guardrails.md`：ASI03 SPIFFE-lite 决策 + ASI10 3 层防御决策 + ASI04/06/07 实质化细节 + 未来演进计划；spec `handler-checklist-asi.cjs` 同测 5 PASS

## 调研 Top5（由周期 14 调研产出，落周期 15+；覆盖周期 13 Top5）

> 调研全文见 `docs/cycles/cycle-14-research.md`（12 主题 × 5 链接 = 60 链接）。

| 排名 | 主题 | 行动 | 落点 |
| --- | ---- | ---- | ---- |
| 1 | **Multi-agent GIS Agent 升级**（GIS Copilot + GISclaw + LangGraph 模式） | 周期 15 落地：把单 agent + tool 升级为 planner + executor + verifier multi-agent；Python sandbox 集成；spec ≥25 PASS | 升级 ai.js |
| 2 | **node:sqlite + sqlite-vec 真实生产接入**（周期 14 已落 dispatch；周期 15 真实跑通 + sqlite-vec 评估触发） | 周期 15 落地：Node 24+ node:sqlite 真实生产；sqlite-vec 50K+ 向量时触发；spec ≥20 PASS | 升级 memory.js |
| 3 | **AI 安全护栏 ASI03 实质化（SPIFFE-lite）**（workload identity：tool-name + userId + sessionId 三元组签名） | 周期 15 落地：aiGuardrails.js 加 workloadIdentity()；spec ≥18 PASS | 升级 aiGuardrails |
| 4 | **cesium-mcp 集成升级**（cesiumjs-ai-starter-app 架构：camera / entity / animation / imagery 拆分） | 周期 15 落地：拆分 mcp server 4 个；spec ≥20 PASS | 升级 mcpManifest |
| 5 | **React 19 Compiler 启用 + useActionState 真实集成**（自动 memoization 删 2300 行 + Actions 集成） | 周期 15 落地：启用 React Compiler；useActionState 联合 hook；spec ≥15 PASS | 升级 client |

> 调研全文见 `docs/cycles/cycle-13-research.md`（12 主题 × 5 链接 = 60 链接）。

| 排名 | 主题 | 行动 | 落点 |
| --- | ---- | ---- | ---- |
| 1 | **AI 安全护栏深化**（OWASP ASI04/06/07 覆盖；OWASP AGT Reference Architecture + Microsoft AgentCore HITL） | 周期 14 落地：扩展 aiGuardrails.js 加 validateManifest / validateMemoryContext / signInterAgentMessage；spec ≥25 PASS | 升级 aiTools |
| 2 | **node:sqlite 真实迁移 memory.js**（webjsdev/webjs #668 + photostructure/node-sqlite + daftari #72） | 周期 14 落地：把 memory.js 从 better-sqlite3 切到 sqliteBackend.js dispatch；真实跑通 Node 24+ node:sqlite；spec ≥20 PASS | 升级 memory.js |
| 3 | **OTel worker SDK 真正集成 + LLM 语义化 span**（oneuptime 2026-02 worker threads + CSDN LLM semantic span） | 周期 14 落地：worker 内部 install() OTel SDK + ai.js 加 LLM semantic attributes（platform/model/tokens）；spec ≥18 PASS | 升级 telemetry |
| 4 | **CesiumJS 1.144+ 升级 + Splat pipeline 文档**（CesiumJS 1.145 vector drape + Microsoft campus 110M splats） | 周期 14 落地：升级 client Cesium 1.113 → 1.144+ + Microsoft Redmond campus Gaussian splat demo + docs/guides/splat-pipeline.md；spec ≥15 PASS | 升级 viewer |
| 5 | **RRF ablation + 自动权重调优**（AILS-NTUA nested RRF + Dell RAG Fusion Industry + Google RRF Tuning） | 周期 14 落地：ablation spec 对比 standard / best-rank / linear / diminishing + heuristic weight search；spec ≥20 PASS | 升级 hybridRetrieval |

## 周期 15 待办（2026-10-15 起，1h/轮）

> 周期 15 按"每轮一个任务"节奏推进；P0 优先，其次 P1。
> 来源：周期 14 调研 Top5 + L14-1 回归修复 + 反思驱动。

### P0（必须本轮完成）

- [x] **P0-1** 修复 hybrid-retrieval-rrf.cjs 6 FAIL 回归（L14-1）—— FTS5 node:sqlite 兼容 + halfLifeDays 边界。文件：`server/agent/hybridRetrieval.js` + `tests/specs/hybrid-retrieval-rrf.cjs`。验收：`tests/specs/hybrid-retrieval-rrf.cjs` 37 PASS（原 6 FAIL → 0 FAIL）。✅ 2026-10-15 R1

### P1（高优先级，至少完成 3 项）

- [x] **P1-1** node:sqlite + sqlite-vec 真实生产验证（周期 14 已落 dispatch；本轮验证 Node 24+ 真实运行 + sqlite-vec 评估触发）。验收：spec ≥ 20 PASS。✅ 2026-10-15 R2
- [x] **P1-2** ASI03 SPIFFE-lite workloadIdentity（workload identity：tool-name + userId + sessionId 三元组签名）。文件：`server/middleware/aiGuardrails.js`。验收：spec ≥ 18 PASS。✅ 2026-10-15 R3
- [x] **P1-3** Multi-agent GIS Agent 升级（planner + executor + verifier 架构）。文件：`server/services/ai.js`。验收：spec ≥ 25 PASS。✅ 2026-10-15 R4
- [x] **P1-4** cesium-mcp 拆分 4 个 server（camera / entity / animation / imagery）。文件：`client/src/pages/gis/mcpManifest.js`。验收：spec ≥ 20 PASS。✅ 2026-10-15 R5
- [x] **P1-5** React 19 Compiler 启用 + useActionState 真实集成。文件：`client/package.json` + `client/vite.config.js`。验收：spec ≥ 15 PASS。✅ 2026-10-15 R6

### P2（中低优先级，按预算与时间允许）

- [x] **P2-1** `client/src/pages/gis/editor/utils/*.js` 中 9 个工具类文件与 turf 互操作缺乏单元测试。✅ 2026-10-15 R1
- [x] **P2-2** `client/src/pages/gis/sandbox.js` 与 `server/agent/protocol/parse.js` 协议字符串重复实现 → 统一从 protocol.js 导出 + npm script 同步检查。✅ 2026-10-15 R2
- [x] **P2-3** `client/src/pages/gis/aiAgent.js` 体积大且无注释（待通读），P2 阶段拆分候选。✅ 2026-10-15 R3
- [x] **P2-4** 限流算法无回归验证（周期 6 已落 Token Bucket；确认 checkpoint 零回归）。✅ 2026-10-15 R4

### 已交付但仍在 upcoming 中（清理项）

- ✅ P0 SSRF metadata IP 同步（周期 6 P0-1 续）→ 移至周期 6 已交付
- ✅ P0 限流算法（周期 6）→ 移至周期 6 已交付
- ✅ P1 SQLite FTS5（周期 8）→ 移至周期 8 已交付
- ✅ P1 MCP 实际接入（周期 9）→ 移至周期 9 已交付
- ✅ P1 DecompressionStream（周期 8）→ 移至周期 8 已交付
- ✅ P1 Sandbox heap-snapshot（周期 6）→ 移至周期 6 已交付
- ✅ P2 helmet 8.x Permissions-Policy（周期 9）→ 移至周期 9 已交付
- ✅ P2 SSE Last-Event-ID buffer（周期 9 by 94c3622）→ 移至周期 9 已交付
- ✅ P2 OTel SDK 评估（周期 14）→ 移至周期 14 已交付
- ✅ P2 mem0 self-host 评估（周期 10）→ 移至周期 10 已交付
- ✅ P2 AI Agent 3-layer memory（周期 10）→ 移至周期 10 已交付
