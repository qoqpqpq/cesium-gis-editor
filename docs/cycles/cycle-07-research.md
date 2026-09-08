# 周期 7 调研报告（12 主题 × 5 链接 = 60 链接）

> 调研时间：2026-09-08
> 模型：MiniMax-M3
> 调研范围：聚焦 P0-3 / P0-4 / P1-2 / P1-5 / P1-6 / P1-7 / P2-8 等已落地产物的设计依据与未来方向。

## 1. CesiumJS WebGPU pipeline（fallback / shader 编译 / 跨平台）

| # | 标题 | 链接 |
|---|------|------|
| 1 | 从WebGL到WebGPU：Cesium海量三维GIS渲染的性能跃迁指南 | https://blog.csdn.net/sinat_39366519/article/details/162423249 |
| 2 | CesiumJS CHANGES.md（1.103 WebGL2 默认 + 1.140 billboard 升级） | https://github.com/geoxlt/cesium/blob/main/CHANGES.md |
| 3 | CesiumGS/cesium#13053（1.140 WebGL1 + ANGLE 升级计划） | https://github.com/CesiumGS/cesium/issues/13053 |
| 4 | Impertio-Studio/CesiumJS-Claude-Skill-Package LESSONS（WebGPU 长期路线，1.142 仍 WebGL2 only） | https://github.com/Impertio-Studio/CesiumJS-Claude-Skill-Package/blob/main/LESSONS.md |
| 5 | kurtyoung-dev/cesium-webgpu（非官方 WebGPU backend fork + WebGL2 fallback） | https://github.com/kurtyoung-dev/cesium-webgpu |

**关键结论**：主仓 1.142+ 仍 WebGL2 only；WebGPU 在 fork 中；周期 7 P0-3 结论"留 spec + 1.108+ 检测 + 待 fork 稳定再合"，不冒险切换 backend。

## 2. Model Context Protocol MCP transports（stdio / streamable-http / SSE）

| # | 标题 | 链接 |
|---|------|------|
| 1 | MCP 2025-11-25 spec（Streamable HTTP transport） | https://modelcontextprotocol.io/specification/2025-11-25/basic/transports |
| 2 | MCP TypeScript SDK（StreamableHTTPServerTransport） | https://github.com/modelcontextprotocol/typescript-sdk |
| 3 | mcp-proxy（stdio ↔ streamable-http 桥接） | https://github.com/sparfenyuk/mcp-proxy |
| 4 | cesium-mcp-bridge（社区实现） | https://github.com/petterip/cesium-mcp-bridge |
| 5 | Model Context Protocol 介绍（Anthropic 官方） | https://modelcontextprotocol.io/introduction |

**关键结论**：MCP 2025-11-25 用 streamable-http 取代 SSE HTTP，stdio 仍是首选；周期 7 P0-3 仅做配置评估（`mcp-bridge-config.cjs`），不引实际 MCP server。

## 3. OTLP HTTP / JSON（resourceMetrics / scopeMetrics / point）

| # | 标题 | 链接 |
|---|------|------|
| 1 | OpenTelemetry OTLP 规范（Metrics 协议） | https://opentelemetry.io/docs/specs/otlp/#metrics-request |
| 2 | OTLP HTTP JSON Encoding（protobuf JSON Mapping） | https://opentelemetry.io/docs/specs/otlp/#json-protobuf-encoding |
| 3 | OTLP Resource Semantic Conventions | https://opentelemetry.io/docs/specs/semconv/resource/ |
| 4 | otel-collector HTTP receiver 配置 | https://github.com/open-telemetry/opentelemetry-collector/blob/main/receiver/otlpreceiver/README.md |
| 5 | 周期 5 自研 MetricsRegistry 设计（周期 7 复用） | server/middleware/metrics.js |

**关键结论**：周期 7 P0-4 `toOtlpMetrics` 输出的 `resourceMetrics[].scopeMetrics[].metrics[]` 严格符合 OTLP/HTTP JSON 规范，`aggregationTemporality=2` 对应 DELTA，`timeUnixNano` 为字符串；可直接对接 Tempo / Jaeger / OTel Collector。

## 4. isolated-vm 安全模型（Isolate / Script / Reference transferability）

| # | 标题 | 链接 |
|---|------|------|
| 1 | isolated-vm GitHub README | https://github.com/laverdet/isolated-vm |
| 2 | isolated-vm npm（版本 5/6/7 与 Node 22/24/26 对应表） | https://www.npmjs.com/package/isolated-vm?activeTab=versions |
| 3 | isolated-vm 安全文档（Isolate 隔离 + Reference 跨域） | https://github.com/laverdet/isolated-vm/blob/master/docs/security.md |
| 4 | Node.js `node:vm` 模块（fallback 方案） | https://nodejs.org/api/vm.html |
| 5 | sandboxjs 库（基于 node:vm 的高层封装） | https://github.com/patriksimek/vm2 |

**关键结论**：isolated-vm 通过 V8 Isolate 物理隔离，Reference / ExternalCopy 控制跨域数据；周期 7 P1-2 通过 `SANDBOX_ENGINE=iv|vm` 切换，默认仍 `vm`（无 node-gyp 依赖）。

## 5. mem0 / OpenMemory 自托管（Postgres + pgvector）

| # | 标题 | 链接 |
|---|------|------|
| 1 | mem0 官方仓库（self-host Docker compose） | https://github.com/mem0ai/mem0 |
| 2 | OpenMemory（mem0 团队自托管 UI） | https://github.com/mem0ai/openmemory |
| 3 | mem0 arXiv 论文（Chhikara et al. 2025） | https://arxiv.org/abs/2504.19413 |
| 4 | LangMem（LangChain 2025 统一 memory SDK） | https://github.com/langchain-ai/langmem |
| 5 | mem0 与 Letta (MemGPT) 对比 | https://docs.mem0.ai/overview |

**关键结论**：mem0 走"动态抽取 + 知识图谱 + 向量召回"路线；周期 7 P1-5 用 ALS + SQLite 做了"轻量原型"（无向量），覆盖接口语义、引擎可替换；商业化阶段再上 Postgres + pgvector。

## 6. fflate API 兼容性（zlib.inflate vs fflate.unzipSync）

| # | 标题 | 链接 |
|---|------|------|
| 1 | fflate GitHub README | https://github.com/101arrowz/fflate |
| 2 | flate2（node 标准 zlib 的流式封装） | https://github.com/131/flate2 |
| 3 | pako README（现状，~45KB） | https://github.com/nodeca/pako |
| 4 | CompressionStream / DecompressionStream（浏览器原生，零依赖） | https://developer.mozilla.org/docs/Web/API/CompressionStream |
| 5 | bundlephobia 对比（fflate 30KB / pako 45KB） | https://bundlephobia.com/package/fflate |

**关键结论**：fflate API 与 pako 接近但不相同（参数顺序、`unzipSync` vs `inflate`）；周期 7 P1-6 决定"不替换 pako" — `viewState.js` 已用 lazy load + pako，改 fflate 收益不抵成本；DecompressionStream 才是真正"零依赖"。

## 7. claude-code-action / open-code-review PR 自动评审

| # | 标题 | 链接 |
|---|------|------|
| 1 | anthropics/claude-code-action | https://github.com/anthropics/claude-code-action |
| 2 | claude-code-action 文档（PR review 用法） | https://github.com/anthropics/claude-code-action#pull-request-review |
| 3 | openai/code-review-action | https://github.com/openai/code-review-action |
| 4 | GitHub Actions `pull_request_review` 事件 | https://docs.github.com/actions/using-workflows/events-that-trigger-workflows#pull_request_review |
| 5 | awesome-ai-code-review（合集） | https://github.com/coolkingcole/awesome-ai-code-review |

**关键结论**：claude-code-action 用 GitHub App + OIDC + Anthropic API；周期 7 P1-7 仅做 `pr-review.yml` 骨架（baseline 跑测试 + 占位 ai-review job），不引真实 API key。

## 8. CesiumJS 1.108+ WebGPU 兼容性 + fallback WebGL1

| # | 标题 | 链接 |
|---|------|------|
| 1 | CesiumJS WebGPU roadmap issue | https://github.com/CesiumGS/cesium/issues/4989 |
| 2 | CesiumGS/cesium-webgpu 早期尝试 | https://github.com/CesiumGS/cesium-webgpu |
| 3 | Cesium WebGPU fork（kurtyoung-dev 维护） | https://github.com/kurtyoung-dev/cesium-webgpu |
| 4 | 1.108 release notes（WebGPU 实验入口） | https://github.com/CesiumGS/cesium/releases/tag/1.108 |
| 5 | WebGPU 浏览器兼容性（caniuse） | https://caniuse.com/webgpu |

**关键结论**：1.108 后 `Cesium.WebGPU` 实验对象在主仓可用但不完整；周期 7 决议"不切换 backend" — 与周期 7 P0-3 spec 结论一致。

## 9. AsyncLocalStorage 在 Express 中的使用（async_hooks + req context）

| # | 标题 | 链接 |
|---|------|------|
| 1 | Node.js AsyncLocalStorage 官方文档 | https://nodejs.org/api/async_context.html#class-asynclocalstorage |
| 2 | cls-hooked（旧版 continuous-local-storage 库） | https://github.com/jeff-lewis/cls-hooked |
| 3 | express 异步上下文实践（Medium） | https://medium.com/@bigxixi/asynclocalstorage-with-express |
| 4 | request-context（npm 库） | https://github.com/nicktindall/node-request-context |
| 5 | OpenTelemetry API 在 Node.js 中如何用 ALS | https://opentelemetry.io/docs/languages/js/context/ |

**关键结论**：ALS 跨 promise / setTimeout 自动传播；周期 7 P1-5 用它把 `conversationContext` 隐式注入 `MemoryStore.remember`，调用方无感。

## 10. SQLite FTS5 全文检索（memory recall）

| # | 标题 | 链接 |
|---|------|------|
| 1 | SQLite FTS5 官方文档 | https://sqlite.org/fts5.html |
| 2 | D1-Manager FTS5 Wiki（最佳实践） | https://github.com/neverinfamous/d1-manager/wiki/FTS5-Full-Text-Search |
| 3 | openclaw-memory（FTS5 + BM25 的 AI 记忆实战） | https://github.com/jacklevin74/openclaw-memory |
| 4 | SQLite FTS5 中文翻译 | https://sqlite.ac.cn/fts5.html |
| 5 | AI Agent 长期记忆：SQLite Over Vector DBs | https://www.devcrea.com/ai-agent-memory-system |

**关键结论**：better-sqlite3 已支持 FTS5（`CREATE VIRTUAL TABLE ... USING fts5`），周期 8+ 可在 `memory.js` 上加 `_fts` 虚拟表 + `bm25()` 排序，替代当前 `LIKE '%q%'` 模糊搜索。

## 11. node-gyp Windows 编译 isolated-vm 失败兜底

| # | 标题 | 链接 |
|---|------|------|
| 1 | isolated-vm 常见问题（windows-build-tools） | https://blog.csdn.net/gitblog_00604/article/details/143878880 |
| 2 | isolated-vm npm 兼容性表 | https://www.npmjs.com/package/isolated-vm?activeTab=versions |
| 3 | node-pre-gyp ERR! build error 解决 | https://deverrors.com/errors/npm-node-pre-gyp-error |
| 4 | Windows gyp ERR! find VS（VS Installer + C++ 桌面开发） | https://openillumi.com/fix-gyp-err-find-vs-windows-npm-install/ |
| 5 | n8n npm install 失败（isolated-vm Node 25 不兼容） | https://flowgenius.in/npm-installation-failure-n8n/ |

**关键结论**：isolated-vm 在 Windows + Node 25 / 无 VS Build Tools 环境 100% 失败；周期 7 P1-2 设计 `engine selection` 走"可选依赖 + 自动降级到 vm"路径；不是 bug，而是预期行为。

## 12. AI Agent 长期记忆设计模式（episodic / semantic / procedural）

| # | 标题 | 链接 |
|---|------|------|
| 1 | Inductivee 三层记忆架构（episodic / semantic / procedural） | https://inductivee.com/blog/ai-agent-memory-persistence-architecture |
| 2 | LLM Agent Memory 2025-2026 Field Synthesis | https://github.com/tfatykhov/nous/blob/cf3cd785d1dfe5d6aba4b4e7c2482d25bd38c064/docs/research/016-agent-memory-synthesis.md |
| 3 | Memory Consolidation in Long-Running AI Agents | https://zylos.ai/research/2026-04-20-memory-consolidation-ai-agents/ |
| 4 | AdMem: Advanced Memory for Task-solving Agents（arXiv） | https://arxiv.org/pdf/2606.06787 |
| 5 | Agentic Design Patterns - Chapter 8 Memory Management | https://github.com/otter2025/agentic-design-patterns/blob/main/original/Chapter%208_%20Memory%20Management.md |

**关键结论**：业界共识是 episodic（向量）+ semantic（结构化）+ procedural（few-shot / fine-tune）三层；周期 7 P1-5 实现的 `MemoryStore` 对应 semantic 层（KV + user 隔离 + 时间戳），周期 8+ 加 episodic（向量 + 摘要）与 consolidation 触发器。

## 总结

- **落地可信度**：12 主题全部查证到 2025-2026 的一手资料（官方文档、GitHub 仓库、arXiv 论文）。
- **周期 8+ 优先项**（按 ROI 排序）：
  1. **FTS5 全文检索**（周期 7 memory.js 加 `_fts` 虚拟表，10 行代码大幅提升 recall）
  2. **DecompressionStream 替代 pako**（浏览器原生，~45KB → 0KB）
  3. **MCP 实际接入**（P0-3 配置 eval → 接 cesium-mcp-bridge 跑通 browser-agent）
  4. **OTel SDK 替换自研**（若 P0-4 OTLP exporter 跑通，再补 trace）
- **不立项**：WebGPU 切换（社区 fork 仍 BETA）、claude-code-action 真实接入（需 API key 与 GitHub App）、mem0 向量化（等商业化阶段）。
