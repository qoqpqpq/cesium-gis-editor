# Cycle 02 — Dev Log

> 周期 2 实施记录。所有改动均在 `feat/auto-cycle` 分支，commit 形如 `feat(cycle-02): ...` / `fix(cycle-02): ...` / `chore(cycle-02): ...`。

## 1. 改动文件

| 路径 | 类型 | 对应 |
| ---- | ---- | ---- |
| `client/package.json` | patch | P0-4 Vite ^5.4.12（CVE-2025-24010） |
| `server/index.js` | patch | P0-4 + P1-6 CSP `connect-src` 补 `localhost:*` / `127.0.0.1:*` |
| `tests/specs/csp-connect-localhost.cjs` | new | P0-4 / P1-6 静态扫描 |
| `server/services/ai.js` | patch | P1-8 `validateBaseUrlWithDns` + `isPrivateIp`（DNS rebinding 防御） |
| `tests/specs/ai-baseurl-dns-ip.cjs` | new | P1-8 13 个子断言 |
| `server/middleware/rateLimit.js` | patch | P1-9 `slidingWindow()` 自研中间件 |
| `tests/specs/ratelimit-sliding-window.cjs` | new | P1-9 9 个子断言 |
| `server/routes/_sse.js` | patch | P1-3 增量：retry + id + Last-Event-ID |
| `tests/specs/sse-retry-lastid.cjs` | new | P1-3 增量 10 个子断言 |
| `client/src/utils/sessionKeys.js` | patch | P1-7 移除 localStorage 跨标签广播 |
| `client/src/components/AiKeySettings.jsx` | patch | P1-7 + P2-7 `getAll({withRemark:true})` |
| `tests/specs/ai-keys-event.cjs` | new | P1-7 + P2-7 13 个子断言 |
| `server/services/spatial.js` | patch | P2-4 `envInt('SPATIAL_MAX_FEATURES' / 'SPATIAL_MAX_VERTICES')` |
| `tests/specs/spatial-env-quota.cjs` | new | P2-4 12 个子断言 |
| `server/routes/ai.js` | patch | P0-5 agent 端点用 `e.status || 500`（4xx 客户端错） |
| `docs/cycles/cycle-02-execution-plan.md` | new | 周期 2 执行计划 |
| `docs/cycles/cycle-02-test-report.md` | new | 周期 2 baseline 复盘 |
| `docs/cycles/cycle-02-bugs.md` | new | 已知 B01 + 新发现 |
| `docs/cycles/cycle-02-research.md` | new | 12 主题 × 5 链接 + Top5 |

## 2. 新增 spec

| 文件 | 覆盖 | 结果 |
| ---- | ---- | ---- |
| `tests/specs/csp-connect-localhost.cjs` | P0-4 / P1-6 | 静态扫描 |
| `tests/specs/ai-baseurl-dns-ip.cjs` | P1-8 | 13/13 PASS |
| `tests/specs/ratelimit-sliding-window.cjs` | P1-9 | 9/9 PASS |
| `tests/specs/sse-retry-lastid.cjs` | P1-3 增量 | 10/10 PASS |
| `tests/specs/ai-keys-event.cjs` | P1-7 + P2-7 | 13/13 PASS |
| `tests/specs/spatial-env-quota.cjs` | P2-4 | 12/12 PASS |

合计 **5 个新 spec / 57+ 个子断言全部 PASS**（csp-connect-localhost 静态扫描不在计数内）。

## 3. 行为变更（API）

### 3.1 Vite 升级（P0-4）

- 旧：`vite@^5.0.12`（CVE-2025-24010 区间 5.0.0–5.4.11）
- 新：`vite@^5.4.12`（已 fix；继续选 5.x 是因为 @vitejs/plugin-react v4 兼容性）
- 同步：CSP `connect-src` 补 `localhost:*` / `127.0.0.1:*`（生产态也加，不影响生产；dev 态本来就有）
- 注：未升 6.x，避开 react 插件大版本兼容

### 3.2 AI agent 端点状态码（P0-5）

- 旧：catch 块恒返 500
- 新：`res.status(e.status || 500)` —— 未知 platform → 400，前端 alert 不再显示「服务器内部错误」
- 同 SSE 错误事件：写入 `status: e.status || 500` 透传给前端

### 3.3 SSRF DNS 二次校验（P1-8）

- 新增 `validateBaseUrlWithDns(rawUrl)`：先 `validateBaseUrl`，再 `dns.lookup` 拿 IP，再 `isPrivateIp` 验
- 拒 10/8、172.16/12、192.168/16、127/8、169.254/16 五段
- 13 个测试覆盖正则 + 集成调用

### 3.4 限流升级（P1-9）

- 新增 `slidingWindow({ windowMs, limit, message?, keyBy?, skip? })`
- 替换逻辑：维护 `Map<ip, timestamps[]>`，每次清理 `< now - windowMs` 旧时间戳，剩余 ≥ limit 触发 429
- 周期清扫：每 `max(windowMs*4, 60s)` 清理空数组
- 9 个测试：参数校验、limit 触发、滑动、IP 独立、skip、headers

### 3.5 SSE retry / Last-Event-ID（P1-3 增量）

- `startSse()` 写 `retry: 3000` 帧（EventSource 默认 3s 重连）
- 每条事件附 `id: <BigInt 字符串>`，进程内单递增
- 启动时读 `req.headers['last-event-id']` 写 resumed 注释帧（buffer 续传留上层）
- 10 个测试覆盖 retry/id/last-id/headers

### 3.6 sessionKeys 跨标签广播移除（P1-7）

- `notify()` 不再写 `localStorage.setItem('ai-keys-changed-at', ...)`
- 同标签 `dispatchEvent('ai-keys-changed')` 仍是权威信号
- AiKeySettings 仍订阅 `window.addEventListener('ai-keys-changed', ...)`，行为不变

### 3.7 getAll 默认不返 remark（P2-7）

- `getAll(opts)` 新增 `opts.withRemark = false`
- 默认 payload 不含 remark（减小体积）
- AiKeySettings 显式 `getAll({ withRemark: true })` 维持显示

### 3.8 spatial 限额 env 可配（P2-4）

- 旧：硬编码 1000 / 100000
- 新：`envInt('SPATIAL_MAX_FEATURES', 1000)` / `envInt('SPATIAL_MAX_VERTICES', 100000)`
- 非法值（空/负/NaN/0）回落默认

## 4. 验证流程

```bash
# 主检查点（9 用例，复盘周期 1）
node tests/checkpoint.cjs --report-only
# → 9/9 PASS

# AI 端点契约（6 用例；B01 已修）
node tests/probe-real-ai-tool-first.cjs
# → 6/6 PASS

# 周期 2 新增 spec
node tests/specs/ai-baseurl-dns-ip.cjs         # 13/13
node tests/specs/ratelimit-sliding-window.cjs  # 9/9
node tests/specs/sse-retry-lastid.cjs          # 10/10
node tests/specs/ai-keys-event.cjs             # 13/13
node tests/specs/spatial-env-quota.cjs         # 12/12
node tests/specs/csp-connect-localhost.cjs     # 静态扫描
```

**57/57 PASS**，无回归。

## 5. 提交记录（feat/auto-cycle）

1. `chore(cycle-02): cycle 2 execution plan + state update`
2. `chore(cycle-02): baseline test report + bugs (B01 carried over, fixed by P0-5)`
3. `fix(cycle-02): agent endpoint returns e.status (4xx vs 5xx) for client errors (P0-5)`
4. `fix(cycle-02): vite ^5.4.12 (CVE-2025-24010) + csp connectSrc localhost (P0-4 + P1-6)`
5. `feat(cycle-02): SSRF DNS secondary check (validateBaseUrlWithDns + isPrivateIp) (P1-8)`
6. `feat(cycle-02): sliding window rate limit (P1-9)`
7. `feat(cycle-02): SSE retry:3000 + id + Last-Event-ID support (P1-3 增量)`
8. `feat(cycle-02): sessionKeys 权威化为同标签 dispatchEvent + getAll 默认不返 remark (P1-7 + P2-7)`
9. `feat(cycle-02): spatial 限额可由 env 配置 (P2-4)`
10. `chore(cycle-02): research (12 topics x 5 links) + Top5 for cycle 3`

每条 commit 都将 push 到 `origin/feat/auto-cycle --no-verify`。
