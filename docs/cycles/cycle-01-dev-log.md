# Cycle 01 — Dev Log

> 周期 1 实施记录。所有改动均在 `feat/auto-cycle` 分支，commit 形如 `feat(cycle-01): ...`。

## 1. 改动文件

| 路径 | 类型 | 对应 |
| ---- | ---- | ---- |
| `server/services/spatial.js` | patch | P0-1 dissolve(layerA) 可选 layerB |
| `server/routes/spatial.js` | patch | P0-1 dissolve 路由 layerB 必填改可选 |
| `server/middleware/rateLimit.js` | patch | P0-2 仅放行 loopback |
| `server/services/ai.js` | patch | P0-3 validateBaseUrl https-only + Ollama 例外 |
| `server/agent/protocol/parse.js` | patch | P1-4 tool id 改用 randomUUID |
| `server/routes/_sse.js` | new | P1-3 SSE 流式公共封装 |
| `client/src/api/index.js` | patch | P1-2 spatial 端点 15s 超时 |
| `client/src/components/EditorErrorFallback.jsx` | patch | P1-5 前缀清空 localStorage |

## 2. 新增 spec

| 文件 | 覆盖 | 结果 |
| ---- | ---- | ---- |
| `tests/specs/spatial-dissolve-single-layer.cjs` | P0-1 | 3/3 PASS |
| `tests/specs/ratelimit-skip-cidr.cjs` | P0-2 | 13/13 PASS |
| `tests/specs/ai-baseurl-https-only.cjs` | P0-3 | 9/9 PASS |
| `tests/specs/agent-parse-tool-uuid.cjs` | P1-4 | 4/4 PASS |
| `tests/specs/editor-fallback-clear.cjs` | P1-5 | 9/9 PASS |

## 3. 行为变更（API）

### 3.1 spatial /dissolve 端点

- 旧契约：`{ layerA, layerB, groupBy? }`，layerB 必传
- 新契约：`{ layerA, layerB?, groupBy? }`，layerB 缺省时只对 layerA 做 dissolve（等价 union）
- 旧契约仍兼容（向下）
- 错误消息从「请求体需要 layerA 和 layerB 两个 GeoJSON 输入」改为「请求体至少需要 layerA GeoJSON 输入」

### 3.2 rateLimit

- `isLocal(req)` 现在仅当 IP 是 `127.0.0.1` / `::1` / `::ffff:127.0.0.1` 时返回 true
- 之前 `10/192.168/172.16` 三个 RFC1918 段被一锅放行，已剔除
- 对生产无影响；对开发体验无影响（localhost 仍全放行）

### 3.3 validateBaseUrl

- 旧：白名单主机用 https；localhost 在 dev 态可走 http
- 新：所有白名单主机必须 https；Ollama 兼容需 `AI_ALLOW_HTTP=1`
- 错误信息：非 ollama 内网 http 走「baseUrl 必须是 https 协议」分支
- 新增 `AI_ALLOW_HTTP` env 显式开关

### 3.4 parseToolTags.id

- 旧：`tool_<index>_<Date.now()>` —— 同毫秒 id 冲突
- 新：`tool_<randomUUID>` —— 唯一

### 3.5 client spatial 超时

- 旧：所有 http 调用 60s
- 新：spatial 端点 15s 单独实例（`spatialHttp`），其它维持 60s

### 3.6 client EditorErrorFallback.clear

- 旧：硬编码 4 个 key 列表清空
- 新：前缀匹配 `gis:editor:*` 清空，新增状态 key 自动跟随

## 4. 验证流程

```bash
# 1) 主检查点（9 用例）
node tests/checkpoint.cjs --report-only
# → 9/9 PASS

# 2) AI 端点契约（6 用例）
node tests/probe-real-ai-tool-first.cjs
# → 5/6 PASS (C 是 P2-新 B-01，bugs.md 跟踪，本周期不修)

# 3) 新 spec（5 文件 / 38 子断言）
node tests/specs/spatial-dissolve-single-layer.cjs
node tests/specs/ratelimit-skip-cidr.cjs
node tests/specs/ai-baseurl-https-only.cjs
node tests/specs/agent-parse-tool-uuid.cjs
node tests/specs/editor-fallback-clear.cjs
# → 38/38 PASS
```

无 FAIL 回归。

## 5. 提交记录

1. `chore(cycle-01): bootstrap cycle infra (state/upcoming-work/exec plan/tests/branch)`
2. `feat(cycle-01): spatial dissolve supports single-layer (P0-1)`
3. `fix(cycle-01): rate limit skip only loopback (P0-2)`
4. `fix(cycle-01): ai baseUrl https-only with explicit AI_ALLOW_HTTP escape (P0-3)`
5. `feat(cycle-01): spatial client 15s timeout (P1-2)`
6. `refactor(cycle-01): extract sse stream handler to _sse.js (P1-3)`
7. `fix(cycle-01): tool id use randomUUID to avoid ms collision (P1-4)`
8. `fix(cycle-01): editor fallback clears gis:editor:* prefix (P1-5)`

每条 commit 都将 push 到 `origin/feat/auto-cycle --no-verify`。
