# Upcoming Work（多周期累积池）

> 所有周期按"清除已完成的条目"的方式收敛。
> 顶部为最高优先级 P0，自上而下递减；周期结束后由对应周期把"已交付"项移到 commits 区。

## P0（必须本周期完成）

- [ ] **P0-1** `server/routes/spatial.js` `dissolve` 端点签名不一致：当前要求 `{layerA, layerB, groupBy}`，但 client 端 `spatialApi.dissolve(layerA, layerB, groupBy)` 实际语义是"把 A+B 合到一个 fc 后按 groupBy 字段做 dissolve"，且 single-layer `dissolve` 是常见用法。需求：允许只传 `layerA`（或加 `groupBy`）即可，layerB 可选。
- [ ] **P0-2** `server/middleware/rateLimit.js` 把 `172.16.0.0/12` 全部识别为 local，整个 172 网段常用于云上内网（AWS VPC 等），任何非 loopback 的内网请求都跳过限流。需求：把 RFC1918 三个网段从 skip 列表剔除，仅保留 `127.0.0.1` / `::1`。
- [ ] **P0-3** `server/services/ai.js` `validateBaseUrl` 白名单在开发态下放行 `localhost/127.0.0.1/::1`，但用户可借此把请求指向本地任意端口（含 :3001 / :8080 自家服务）做内网探测/SSRF；生产态虽收紧但 `http:` 协议仍然允许。需求：开发态也走 https-only（仅 Ollama 例外，需显式声明 `AI_ALLOW_HTTP=1`）。

## P1（高优先级，至少完成 4 项）

- [ ] **P1-1** `client/src/utils/viewState.js` `base64UrlEncode` 在中文长字符串（>100KB 场景 AI 描述）下会因 `btoa(unescape(encodeURIComponent(str)))` 双倍膨胀，URL 长度超限。前端 `buildShareUrl` 失败时只回退到 `null`，无 UI 提示。需求：超出 ~8KB 时降级为只保留 camera 字段，并补一行 console.warn。
- [ ] **P1-2** `client/src/api/index.js` `http` 实例无请求重试、无超时分级（AI 60s 适合 stream，但 spatial 30s 内短查询被 60s 拖死）。需求：spatial 端点单独走 15s 超时。
- [ ] **P1-3** `server/routes/ai.js` `/api/ai/chat/stream` 与 `/api/ai/agent?stream=1` 都有相同的"queue full"处理、心跳、abort 逻辑，存在 ~80 行重复代码；任一处修改容易漏改另一处。需求：抽出 `sseStreamHandler(platform, runFn)` 公共封装。
- [ ] **P1-4** `server/agent/protocol/parse.js` `parseToolTags` 输出的 `id` 形如 `tool_42_1762435200000`（用 `Date.now()` 拼），并发场景下两个 tool 同毫秒会 id 冲突。需求：换成 `crypto.randomUUID()`（Node 18+）。
- [ ] **P1-5** `client/src/components/EditorErrorFallback.jsx` 的 `defaultClearEditorState` 用硬编码 key 列表，与新加的视图状态 key（如 `gis:editor:theme`、`gis:editor:ai-side-width`）会失同步。需求：改成 `localStorage` 前缀匹配（`gis:editor:`）一次清空。
- [ ] **P1-6** `server/index.js` CSP 的 `connectSrc` 缺少对本地开发服务器（vite :8080）→ 上游 AI 域名的允许规则，开发态 CSP 被设为 `false` 关闭，安全收益打折。需求：把生产态 CSP 也补上 `localhost:*` / `127.0.0.1:*` 显式条目（不影响生产）。
- [ ] **P1-7** `client/src/utils/sessionKeys.js` `notify()` 写 `localStorage` 跨标签广播，但同标签的 listener 不会收到"已写"事件（自己 dispatchEvent 之前 setItem 会触发 storage 事件——只在其他标签触发）。需求：把 `ai-keys-changed` 自定义事件作为权威信号，跨标签不强行同步（独立标签独立会话是设计预期）。

## P2（中低优先级，按预算与时间允许）

- [ ] **P2-1** `server/services/ai.js` `PLATFORMS` 表内 10 个平台的 `defaultModel` 与定价表 `PRICING` 手工对齐，新增模型易漂移。需求：改为 `PLATFORMS[].pricing` 字段内联，或写个启动时自检脚本。
- [ ] **P2-2** `client/src/components/ThemeProvider.jsx` 与 `ThemeToggle.jsx` 未读（待 P1 阶段通读）；若主题切换触发整页重渲染，会丢 editor 内部状态。
- [ ] **P2-3** `client/src/pages/gis/editor/utils/*.js` 中 9 个工具类文件（`coords / measure / picking / snap / analysis / ...`）有 3-4 处与 turf 互操作缺乏单元测试。
- [ ] **P2-4** `server/services/spatial.js` 的 `MAX_FEATURES_PER_LAYER=1000` 与 `MAX_TOTAL_VERTICES=100000` 是硬编码，外部无法调节。需求：读 env `SPATIAL_MAX_FEATURES` / `SPATIAL_MAX_VERTICES`。
- [ ] **P2-5** `client/src/pages/gis/sandbox.js` 与 `server/agent/protocol/parse.js` 协议字符串 `<tool>name(args)</tool>` 重复实现，注释里也提示"修改时务必同步"。需求：把"协议字面 + 解析"统一从 `client/src/pages/gis/protocol.js` 导出，server 用 ESM 风格 require 该模块（或保留双份但加 npm script 同步检查）。
- [ ] **P2-6** `client/src/pages/gis/aiAgent.js` 体积大且无注释（待通读），P2 阶段拆分候选。
- [ ] **P2-7** `client/src/components/AiKeySettings.jsx` 列表项 `k.remark` 显示在浮层，但 export 旧 key 列表（`getAll()`）会顺带返出 remark——可后续做"导出清理"。

## 调研 Top5（由周期 1 调研产出，落到 P1/P2）

> 调研全文见 `docs/cycles/cycle-01-research.md`。
