# Cycle 01 — 调研报告（Research Notes）

> **周期**: N=1（启动期）
> **范围**: 与本周期 P0/P1/P2 强相关的 12 个技术主题；每个主题 5 条链接 + 一句话摘要 + 行动建议。
> **本文件作用**: 留下可被后续周期复用的"权威资料库"；Top5 摘要同时落入 `docs/release-notes/upcoming-work.md` 的"调研 Top5"段。

---

## 1. CesiumJS 大场景 / 大数据量性能优化

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 1.1 | Cesium 加载大规模点云全链路优化 | <https://wenku.csdn.net/answer/78tsm56rpdja> | 数据预处理（LAS→3D Tiles + Draco + LOD）+ 加载参数（`maximumScreenSpaceError` / `skipLevelOfDetail`）+ 渲染参数（`pointCloudShading` / 点大小衰减）三层优化 | P2 阶段引入 3D Tiles 上传流水线时参考其参数清单 |
| 1.2 | Rendering huge point clouds (10s millions of points) | <https://community.cesium.com/t/rendering-huge-point-clouds-10s-millions-of-points/38692> | Cesium 官方建议：先转 3D Tiles，再用 `Cesium3DTileset` 流式渲染 | P2 阶段评估"自有 vs Cesium ion"成本，作为 P2-1 决策依据 |
| 1.3 | Cesium3DTileset API 文档（1.48） | <https://cesium.com/downloads/cesiumjs/releases/1.48/Build/Documentation/Cesium3DTileset.html> | 完整参数表：`maximumScreenSpaceError=16`、`skipLevelOfDetail=true`、`dynamicScreenSpaceError=false` 等 | 周期 2 引入自定义 tileset 时直接照抄这套参数 |
| 1.4 | Performance Tips for Visualizing Lots of Points | <https://cesium.com/blog/2016/03/02/performance-tips-for-points> | `PointPrimitive` 比 `Billboard` 快 ~2×；`scaleByDistance` 与 `translucencyByDistance` 让远点变不可见，FPS 从 33→60 | P2-2 主题切换的"渲染热路径"重渲染排查用得上 |
| 1.5 | FPS drop while rendering sparse point cloud data as 3D tiles | <https://community.cesium.com/t/fps-drop-while-rendering-sparse-point-cloud-data-as-3d-tiles/28657> | 小瓦片（4750 个）反而比大瓦片更慢，因为 tile hierarchy 遍历开销；调高 `maximumScreenSpaceError` 可缓解 | 周期 2 引入 3D Tiles 之前先 review `py3dtiles` 配置 |

**本主题落点**：P2-1 平台定价表、周期 2 tileset 流水线（与本周期 P0/P1 暂无强耦合）。

---

## 2. Turf.js 空间运算（polygon clipping / 性能）

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 2.1 | 开源前端 GIS 空间分析库 jsts vs Turf | <https://blog.csdn.net/u012413551/article/details/116233450> | 100w 次相交 Turf 137ms / jsts 447ms，Turf 全面领先；Turf 包大小远小于 jsts | 维持 `turf` 栈；周期 2 若遇 OOM 再评估 WASM 方案 |
| 2.2 | Performance Analysis of WebAssembly and JavaScript Engines for Common Geospatial Algorithms（Penn State 论文） | <https://bullington.xyz/GeospatialWASM.pdf> | Safari 上 WASM 显著快于 Turf；Chromium/Firefox 上 Turf 反而更快（V8/JIT 优化） | 选型不焦虑：Turf 在主流桌面端已足够 |
| 2.3 | Пересечение полигонов（turf.intersect 实战） | <https://javascript42.ru/tutorials/turf-js/peresechenie-poligonov/> | 实操要点：先做 bounding-box 预检再 intersect，对万级 feature 性能可省 30%+ | P2-3 计划为 coords/measure 等工具加 turf 单测时可参考 |
| 2.4 | GeoSketch OSM（React + Turf 完整应用） | <https://github.com/atayashraf/GeoSketch-OSM> | 用 `turf.difference` 做"自动裁剪 + 防重叠"是真实场景的成熟范式 | 周期 2 切到 4.x 之前先盘点 `turf.difference` 的边界 case |
| 2.5 | clipper-lib / d3-polygon / earcut / polygon-clipping / turf 横评 | <https://npm-compare.com/clipper-lib,d3-polygon,earcut,polygon-clipping,turf> | turf 强在 GeoJSON 兼容 + 全套空间分析；bundle 较大；polygon-clipping 专注布尔运算更小 | 维持当前 `turf` 栈，不需要为体积迁库 |

**本主题落点**：本周期 P0-1（dissolve 单层）与 P1-2（spatial 短超时）已落地；P2-3 单元测试可参考 2.3 / 2.4。

---

## 3. WGS84 / WebMercator / GCJ02 / BD09 坐标系

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 3.1 | 网络地图坐标系完全指南：WGS84 / GCJ02 / BD09 / CGCS2000 | <https://juejin.cn/post/7662339239138295849> | 厘清"GPS 原始 WGS84 → 国测局 GCJ02 → 百度 BD09"三层加密链 + Web Mercator (EPSG:3857) 投影 | 周期 2 引入天地图 / 高德瓦片时直接对照 |
| 3.2 | Map Coordinate Converter（devkitlab） | <https://www.devkitlab.com/en/tools/coordinate-converter/> | 一站式 WGS84 / GCJ-02 / BD-09 / BD-09MC / CGCS2000 互转，支持自定义 EPSG | 周期 2 验证坐标转换算法时的对照工具 |
| 3.3 | gcoord（hujiulong/huozhiying） | <https://github.com/huozhiying/gcoord> | 经典 JS 坐标转换库；WGS84 ↔ GCJ-02 ↔ BD-09 三角互转 | 周期 2 引入 gcoord 作为依赖（~5KB） |
| 3.4 | transform（eviltransform 多语言端口） | <https://github.com/qhjqhj/transform> | WGS-84 ↔ GCJ-02 转换；提供 Go / JS / Python / C# / Haskell 多语言实现 | 周期 2 后端做"高德 POI → Cesium"回写时用 JS 端口 |
| 3.5 | CoordinateTransformationUtil（C# 参考实现） | <https://github.com/WongSpark/CoordinateTransformationUtil> | 解释 WGS84 / GCJ02 / BD09 偏移的根源是"国家测绘局强制加密" | 用作周期 2 文档/注释的事实参考 |

**本主题落点**：周期 2 调研将落为新 P0/P1（"瓦片适配 GCJ02"、"POI 坐标转换"）；本周期只记参考，不实施。

---

## 4. GeoJSON Schema 校验（Ajv 实践）

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 4.1 | AJV 最佳实践：生产环境部署的 10 个关键配置 | <https://blog.csdn.net/gitblog_02120/article/details/144501927> | `strict: true` + `allErrors: true` + `useDefaults: true` + 异步 `loadSchema` 是生产标配 | 周期 2 引入 ajv 校验 spatial 输入时直接套用 |
| 4.2 | Ajv Getting Started 官方 | <https://ajv.js.org/guide/getting-started> | 编译期慢 / 运行期快；`compile` 一次缓存复用；`errors` 引用每次被覆盖 | P2-3 计划为 spatial 工具类加 ajv 校验时的入门 |
| 4.3 | ajv 仓库 README | <https://github.com/nswbmw/ajv> | `uniqueItems` / `patternProperties` 在大数组上慢，要用 `maxItems` / `propertyNames` 兜底 | 周期 2 写 schema 时注意"防 ReDoS / 防 O(n²)" |
| 4.4 | ajv-cli | <https://ajv.js.org/packages/ajv-cli.html> | CLI 校验 JSON / JSON5 / YAML；支持 draft7/2019/2020 | 周期 2 写 spec 时可用 CLI 离线校验 |
| 4.5 | JSON Schema Validator Online（Ajv 内嵌） | <https://www.handytool.io/en/articles/json-schema-validator-online> | 浏览器本地跑 Ajv，`allErrors: true` + JSON Pointer 路径 | 周期 2 写 GeoJSON schema 时可直接用 |

**本主题落点**：周期 2 引入 spatial 输入 ajv 校验（与 P1-1 短路 + 强错误回执配对）。

---

## 5. Server-Sent Events 流式响应（Node.js 生产实践）

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 5.1 | Express SSE 流式输出实战：入门到 AI 生产 | <https://blog.csdn.net/liangshanbo1215/article/details/163529029> | 心跳防代理断流；`req.on('close')` 清理定时器；`data: ...\n\n` 双换行规范 | 本周期 P1-3 的 `_sse.js` 已封装心跳/abort，可对照升级 |
| 5.2 | Streaming LLM Output to React (SSE Practical Guide) | <https://anyapi.ai/blog/streaming-llm-output-to-react-a-practical-guide-to-server-sent-events> | 关键 4 件：检测断开 + 心跳 + 错误回执 + `retry` 提示 | 周期 2 重构 `_sse.js` 时引入 `retry` 字段 |
| 5.3 | The Complete Guide to Server-Sent Events | <https://singhajit.com/server-sent-events-explained/> | SSE vs WebSocket vs Long Polling 选型；EventSource 自动重连 + Last-Event-ID | 用作"为什么选 SSE 而非 WebSocket"的文档依据 |
| 5.4 | Technologies Protocols: SSE | <https://github.com/jahrulnr/dev-docs/wiki/Technologies-Protocols---Sse/585522929b570689bd58fe63c97e13fb28c680b0> | SSE 适用场景清单 + 完整前后端 demo | P1-3 文档化时直接引用 |
| 5.5 | SSE in Node.js: From Monoliths to Distributed Systems | <https://www.chanalston.com/blog/nodejs-sse-monolith-to-distributed-system/> | 单体 SSE → BullMQ 分布式扩展；30s 心跳 + 集中客户端注册表 | 周期 3+ 多实例时引入 BullMQ 形态 |

**本主题落点**：本周期 P1-3 已落地（抽公共封装）；周期 2 计划补 `retry` 字段 + 断连重试语义。

---

## 6. AI Agent 工具调用协议与流式解析

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 6.1 | 从 while 循环到可视化智能体：Agent Loop / Codex / OpenClaw / Hermes | <https://blog.csdn.net/m0_73370855/article/details/161348977> | Agent Loop 抽象：模型决策 → 程序执行 → 结果回填；SSE 推送 `assistant_start` / `tool_call_start` / `tool_call_result` | 周期 2 增强 UI 折叠工具过程时可参考事件类型 |
| 6.2 | swagent-spec（OpenAI Responses API 工作流） | <https://gist.github.com/steipete/c5afc8fedbd742210f4f05e540448fee> | `tools[]` 顶层 + `previous_response_id` 串接 + 流式事件 `response.output_text.delta` | P2-5 协议抽象时参考 OpenAI 字段命名 |
| 6.3 | LLM Tool Calling API Comparison（OpenAI / Claude / Ollama） | <https://github.com/srujan375/vishwa-agent/blob/main/docs/LLM_API_COMPARISON.md> | OpenAI `tool_calls[]` / Claude `content[type=tool_use]` / Ollama 兼容 OpenAI；推荐统一用 OpenAI 格式 | 周期 2 协议统一时直接以 OpenAI 为基准 |
| 6.4 | IETF draft: LLM Inference Streaming Wire Format | <https://datatracker.ietf.org/doc/html/draft-spk-agentproto-llm-stream> | 标准化 LLM 流式 envelope 与事件类型；2026-07 draft | 远期参考，本周期不影响 |
| 6.5 | Harness-Model Protocol Analysis（skill） | <https://www.skillmd.ai/how-to-build/harness-model-protocol/> | 三大维度：消息协议 / 工具调用编码 / 流式机制；OpenAI/Claude/Gemini 横比 | 周期 2 重构 `agent/protocol/parse.js` 时使用 |

**本主题落点**：本周期 P1-4（UUID）已部分处理；周期 2 计划做"工具调用协议统一 + 流式事件对齐"。

---

## 7. React Error Boundary + localStorage 状态恢复

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 7.1 | How to Use React for State Persistence | <https://www.uxpin.com/studio/blog/how-to-use-react-for-state-persistence/> | localStorage/sessionStorage/IndexedDB 三选一；推荐结合 ErrorBoundary 做"加载失败 → 默认值" | P1-5 已落"清空兜底"，周期 2 可补"加载失败也兜底" |
| 7.2 | React Error Boundaries 官方（旧文档） | <https://legacy.reactjs.org/docs/error-boundaries.html> | class 组件 + `getDerivedStateFromError` / `componentDidCatch`；不捕获事件/异步/SSR | P1-5 已用 class 形式，行为符合官方规范 |
| 7.3 | Guide to Error & Exception Handling in React（Sentry） | <https://blog.sentry.io/guide-to-error-and-exception-handling-in-react/> | ErrorBoundary 限 render 树下方；用 `react-error-boundary` 库 + Suspense 组合 | 周期 2 评估是否引入 `react-error-boundary` 替代 class |
| 7.4 | React 17.x Error Boundaries | <https://17.reactjs.org/docs/error-boundaries.html> | 同一规范 + componentStack 用法 | 用作 17→18 兼容期参考 |
| 7.5 | Error Handling in React with react-error-boundary | <https://certificates.dev/blog/error-handling-in-react-with-react-error-boundary> | `fallback` 三种写法（element / FallbackComponent / fallbackRender）；React 19 `useTransition` 自动 ErrorBoundary | 周期 2 升级 React 19 时一并考虑切换 |

**本主题落点**：本周期 P1-5 已落"前缀清空 localStorage"；周期 2 计划把 class ErrorBoundary 升级到 `react-error-boundary`。

---

## 8. 速率限制策略（IP / Token / 多维度）

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 8.1 | API Rate Limiting 101（teachmeidea） | <https://teachmeidea.com/api-rate-limiting-101/> | Fixed Window / Sliding Window Log / Sliding Window Counter 三种算法对比与代码 | 周期 2 评估 "Sliding Window Counter" 替换当前 Fixed |
| 8.2 | Rate Limiting in Node.js: Complete 2026 Guide | <https://techpulsesite.com/how-to-implement-rate-limiting-in-a-node-js-api-complete-2026-guide/> | 优先用 `express-rate-limit` + Redis；token bucket 适合突发 + Redis Lua 保证原子 | 周期 2 接入 Redis 时的入门 |
| 8.3 | Rate-Limiter（deepak21-k） | <https://github.com/deepak21-k/Rate-Limiter> | Node 18+ / Express 4 / Redis 7；三种算法 + 可视化 dashboard | 用作"完整参考实现" |
| 8.4 | Build 5 Rate Limiters with Redis（redis 官方） | <https://redis.io/tutorials/howtos/ratelimiting/> | Sliding Window / Token Bucket / Leaky Bucket + Lua 原子性说明；推荐 Sliding Window Counter | 周期 2 落地算法选择依据 |
| 8.5 | Rate Limiting Sliding Window Lua（stacklesson） | <https://www.stacklesson.com/mean-stack-tutorial/nodejs-in-production/nodejs-production-rate-limiting-sliding-window-lua/> | 三维度限流：global / route-specific / user-specific | 周期 2 引入 "user id 优先" 二级限流 |

**本主题落点**：本周期 P0-2 仅把白名单收紧到 loopback；周期 2 计划做 "Sliding Window + Redis"。

---

## 9. SSRF 防护 / URL 白名单设计

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 9.1 | OWASP Top 10:2025（sujeet-pro） | <https://github.com/sujeet-pro/sujeet.pro/blob/main/content/articles/owasp-top-10-guide/README.md> | 2025 版新增 A03 供应链 / A10 异常处理；SSRF 并入 A01 Access Control | 周期 2 报告"威胁模型"时引用 |
| 9.2 | SSRF Prevention Cheat Sheet（OWASP 官方） | <https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.md> | 拒绝黑名单 / 用 allowlist + DNS 解析后再次校验 IP；防 DNS pinning | 周期 2 加固 `validateBaseUrl` 用作参考 |
| 9.3 | C10: Stop Server Side Request Forgery（OWASP） | <https://owasp.org/www-project-proactive-controls/archive/2024/the-top-10/c10-stop-server-side-request-forgery/> | 输入校验 + allowlist + XML 解析器安全 + Unicode 转换注意 | 周期 2 SSRF 防护策略卡 |
| 9.4 | SSRF Explained: OWASP API Security Principle 7 | <https://www.apisec.ai/blog/server-side-request-forgery-ssrf-owasp-api-security-principle-seven-explained> | Capital One 2019 事件：169.254.169.254 metadata 端点被利用 | 警示文档用 |
| 9.5 | OWASP Top 10 대응 체크리스트（jyukki） | <https://jyukki.com/learning/deep-dive/deep-dive-owasp-top10-checklist/> | Spring/后端视角的 OWASP Top 10 + CI/CD 集成；`SafeUrlValidator` 示例代码 | 周期 2 写 `validateBaseUrl` 单元测试可参考 |

**本主题落点**：本周期 P0-3 已落"https-only + Ollama 例外"；周期 2 计划加 "DNS 解析后 IP 二次校验"。

---

## 10. Content Security Policy（CSP）+ Vite 开发态

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 10.1 | Vite dev server CORS / Host header CVE-2025-24010 | <https://github.com/advisories/GHSA-VG6X-RCGG-RJX6> | Vite 6.0.0–6.0.8 / 5.0.0–5.4.11 / ≤4.5.5 任意网站可读 dev server；要求 ≥6.0.9 / 5.4.12 / 4.5.6 | 紧急：检查项目 vite 版本，必要时升级 |
| 10.2 | The `connect-src` Directive | <https://content-security-policy.com/connect-src/> | `connect-src` 控 fetch / XHR / WebSocket / EventSource；与 CORS 互不替代 | 周期 2 调 CSP `connect-src` 用 |
| 10.3 | CSP: connect-src 'self' 拒绝 localhost:3000 | <https://wenku.csdn.net/answer/nuuwehreqd> | 默认 `default-src 'none'` 时需要显式加 `connect-src http://localhost:3000` | 周期 2 P1-6 实施用 |
| 10.4 | CSP for Laravel + Vite（laracasts） | <https://laracasts.com/discuss/channels/laravel/what-best-config-content-security-policy-for-laravel> | dev / prod 拆分 CSP；dev 加 `ws://localhost:5173`、prod 收紧 `'self'` | 周期 2 P1-6 实施模板 |
| 10.5 | Content Security Policy for Vue Apps（DevExpress） | <https://docs.devexpress.com/Dashboard/404193/web-dashboard/integrate-dashboard-component/dashboard-component-for-vue/content-security-policy?v=24.2> | `connect-src 'self' http:my_backend_url` + nonce-based style-src | 周期 2 引入 nonce 时参考 |

**本主题落点**：本周期未做；周期 2 计划落 P1-6（生产态 CSP 补 localhost + Vite 升级到 6.0.9+）。

---

## 11. Web Crypto API / `randomUUID` 前后端统一

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 11.1 | 浏览器内置 API 实现生成 UUID | <https://juejin.cn/post/7585121055037505586> | `crypto.randomUUID()` Chrome 92+/Firefox 95+/Safari 15.4+；需 HTTPS 或 localhost | 周期 2 补前端 randomUUID fallback 链 |
| 11.2 | Generate UUID in TypeScript | <https://uuid.codexneo.com/dev-lab/typescript> | `crypto.randomUUID()` 返回 RFC 4122 v4；branded type 防 ID 串号；Zod 校验外部输入 | 周期 2 补前端 branded type |
| 11.3 | MDN: Web Crypto API | <https://developer.mozilla.org/en-US/docs/Web/API/Crypto> | `crypto.randomUUID()` 必须 secure context；Node 19+ 全局 | 浏览器兼容矩阵依据 |
| 11.4 | JavaScriptでGUIDを生成する方法 | <https://www.digibeatrix.com/js/utility-methods/javascript-guid-generation/> | 用途分类：v4 通用 / v7 时序 / v5 命名空间；UUID 不能用于鉴权 | 用作"什么场景用什么 UUID"的决策表 |
| 11.5 | Generate UUID in JavaScript | <https://uuid.codexneo.com/dev-lab/javascript> | v4 / v7 / v5 决策；v7 是数据库主键首选；v5 是确定性 ID | 周期 2 评估是否把 tool id 切 v7 利于排序 |

**本主题落点**：本周期 P1-4 已落"用 `crypto.randomUUID()`"（Node `node:crypto.randomUUID()`）。

---

## 12. Git 分支管理 + 自动化 CI

| # | 标题 | 链接 | 摘要 | 行动建议 |
| - | ---- | ---- | ---- | -------- |
| 12.1 | 代码提交+分支管理+版本管理最佳实践 | <https://blog.heylinux.com/2025/07/commit-branching-versioning-best-practices/> | Conventional Commits 完整 type 清单；Gitflow / GitHub Flow / Trunk-based 对比 | 周期 2 写 commit 规范文档直接用 |
| 12.2 | Three Branching Strategies（raichev-dima） | <https://gist.github.com/raichev-dima/ca05a8bbf6a6f6ffb1e519638e7f53bb> | GitLab Flow / GitHub Flow / Trunk-based 三套流程图与 hotfix 策略 | 周期 2 决定"自动化周期分支策略"时引用 |
| 12.3 | GitFlow vs GitHub Flow vs Trunk-Based 2026 | <https://inventivehq.com/blog/git-branching-strategies-guide> | GitHub Flow 中等复杂度、持续部署友好；Trunk-based 高门槛但 elite 团队首选 | 评估"项目级 vs AI agent 级"分支策略 |
| 12.4 | Version Control Strategy Comparison | <https://github.com/prismaymedia/architecture-base/blob/main/docs/guides/version-control-comparison.md> | 推荐 Trunk-based 用于持续部署 + 微服务；Git Flow 适合有发布周期 | 决策表 |
| 12.5 | Trunk-Based vs GitFlow: AI Rules for Each | <https://www.rulesync.dev/blog/ai-rules-trunk-vs-gitflow> | AI agent 必读：分支从哪拉、PR 提给谁、长/短命分支；本项目 `feat/auto-cycle` 即"短命分支 + PR 提给 main" | 直接用作本项目周期流程规则 |

**本主题落点**：本周期 `feat/auto-cycle` 即"trunk-based 衍生"；周期 2 写 `docs/cycles/cycle-02-execution-plan.md` 时把"AI agent 分支规则"固化为文件。

---

## Top5 优先级（追加进 upcoming-work.md）

| 排名 | 主题 | 行动 | 落到哪个 ID |
| --- | ---- | ---- | ----------- |
| 1 | **SSRF 防护 / URL 白名单** | `validateBaseUrl` 加"DNS 解析后 IP 二次校验"，防 DNS rebinding；引入 `ipaddr.js` | 新增 P1-8 |
| 2 | **CSP + Vite 升级** | 升级 Vite ≥ 6.0.9 / 5.4.12 / 4.5.6（修 CVE-2025-24010）；生产态 CSP `connect-src` 补 `localhost:*` / `127.0.0.1:*`；dev 加 `ws://localhost:8080` | 新增 P1-6（已有雏形）→ 周期 2 升级为 P0 |
| 3 | **速率限制升级** | 把当前 Fixed Window 升级为 "Sliding Window Counter" + Redis（多实例共享计数）；加 user-id 优先的二级限流 | 替换 P0-2 思路；新增 P1-9 |
| 4 | **SSE 协议补 retry / 重试** | `_sse.js` 输出 `retry: 3000` 字段；客户端 EventSource 收到 error 后 3s 自动重连 | 增量 P1-3 |
| 5 | **AI Agent 工具协议统一** | 引入 OpenAI 风格 `tool_calls[]`（与本地 `<tool>` 协议共存），便于 Claude / Ollama 接入；前端 ui 折叠工具过程 | 新增 P2-5（与原 P2-5 合并） |
