# Cycle 04 — Test Report

> **周期**: N=4（继承期）
> **目的**: 把周期 3 调研 Top5 落为代码、补 OWASP SSRF 6/6 步、Redis 分布式限流、可观察性升级、沙箱 Resource limits、viewState 压缩。
> **测试入口**: `tests/checkpoint.cjs --report-only` + `tests/probe-real-ai-tool-first.cjs` + 24 个独立 spec 文件。

## 1. Checkpoint 报告（report-only）

```
=== checkpoint @ http://localhost:3001 (report-only=true, strict=false) ===
  [PASS] 1) /api/health — env=production
  [PASS] 2) /api/gis/config — cesium=false tdt=false
  [PASS] 3) /api/ai/platforms — count=10
  [PASS] 4) /api/ai/system-prompts — scope=gis len=1470
  [PASS] 5) /api/spatial/centroid OK — centroid_features=1
  [PASS] 6) /api/spatial/buffer OK — ok
  [PASS] 7) /api/spatial/centroid 缺 layer — reject=400
  [PASS] 8) /api/ai/agent 缺 body — reject=400
  [PASS] 9) server modules require — loaded=8
--- summary: pass=9 fail=0 ---
```

**结论**: 9/9 PASS。说明周期 4 改动未破坏核心契约：health / GIS 配置 / AI 平台表 / 系统 prompt / 空间运算（centroid + buffer）/ 缺 body 4xx / server 模块 require。

## 2. Probe AI 报告（strict）

```
=== probe-real-ai-tool-first @ http://localhost:3001 (strict=true) ===
  [PASS] A) POST /api/ai/agent 空 body → 400 — msg=platform / messages  必填
  [PASS] B) POST /api/ai/agent 缺 messages → 400
  [PASS] C) POST /api/ai/agent 非法 platform → 非 5xx — msg=不支持的平台: __not_a_real_platform__
  [PASS] D) POST /api/ai/agent?stream=1 空 body → 400
  [PASS] E) POST /api/ai/agent 无 api_key → 非 200 — msg=[openai] 未提供 AI Key...
  [PASS] F) POST /api/ai/chat/stream 空 body → 400
--- summary: pass=6 fail=0 ---
```

**结论**: 6/6 PASS。AI 路由的契约（缺字段 4xx、非法 platform 4xx、缺 api_key 4xx）全部按预期。

## 3. 周期 4 新增 / 修改的 5 个 spec

| Spec | 内容 | 结果 |
| ---- | ---- | ---- |
| `tests/specs/ssrf-host-allowlist.cjs` | P0-1: Host header allowlist middleware（16 子断言） | 16/16 PASS |
| `tests/specs/ssrf-metadata-ipv6.cjs` | P0-1: 全云厂商 metadata IP 黑名单 + host 黑名单 + 集成 validateBaseUrlWithDns（27 子断言） | 27/27 PASS |
| `tests/specs/redis-ratelimit-store.cjs` | P0-2: 手写 RESP 协议 + RedisStore 真实实现 + 失败兜底（23 子断言） | 23/23 PASS |
| `tests/specs/otel-traceid.cjs` | P1-1: W3C traceparent 解析 / 生成 / 注入 ctx + ALS traceId 串联 + 性能 benchmark 10000 emit < 200ms（20 子断言） | 20/20 PASS |
| `tests/specs/sandbox-worker-isolation.cjs` | P1-2: worker_threads 隔离 + 死循环不卡主线程 + Resource limits（12 子断言） | 12/12 PASS |
| `tests/specs/viewstate-lzstring.cjs` | P1-3: zlib deflate 压缩 + v2 协议前缀 + 100K 中文字符压到 549B + 解压 round-trip（13 子断言） | 13/13 PASS |
| `tests/specs/helmet-8-upgrade.cjs` | P2-1: helmet 8.x 升级（静态扫描 + 运行时头部）20 子断言 | 20/20 PASS |
| `tests/specs/sse-last-event-id-buffer.cjs` | P2-2: SSE bufferProvider + Last-Event-ID 续传（14 子断言） | 14/14 PASS |

**新增 8 个 spec / 共 145 个子断言**，全部 PASS。

## 4. 周期 1/2/3 老 spec 回归

| Spec | 周期 | 结果 |
| ---- | ---- | ---- |
| `tests/specs/agent-parse-tool-uuid.cjs` | 1 | 4/4 PASS |
| `tests/specs/agent-platform-400.cjs` | 1 | 5/5 PASS |
| `tests/specs/ai-baseurl-dns-ip.cjs` | 1（修复 cycle-4 错误信息改动）| 23/23 PASS（修复后）|
| `tests/specs/ai-baseurl-https-only.cjs` | 2 | 9/9 PASS |
| `tests/specs/ai-keys-event.cjs` | 2 | 13/13 PASS |
| `tests/specs/csp-connect-localhost.cjs` | 2 | 7/7 PASS |
| `tests/specs/csp-permissions-policy.cjs` | 3 | 16/16 PASS |
| `tests/specs/editor-fallback-clear.cjs` | 1 | 9/9 PASS |
| `tests/specs/logger-redact.cjs` | 3 | 20/20 PASS |
| `tests/specs/ratelimit-skip-cidr.cjs` | 1 | 13/13 PASS |
| `tests/specs/ratelimit-sliding-window.cjs` | 2 | 9/9 PASS |
| `tests/specs/ratelimit-store-interface.cjs` | 3 | 16/16 PASS |
| `tests/specs/sandbox-no-vm2.cjs` | 3 | 17/17 PASS |
| `tests/specs/spatial-dissolve-single-layer.cjs` | 1 | 3/3 PASS |
| `tests/specs/spatial-env-quota.cjs` | 2 | 12/12 PASS |
| `tests/specs/sse-retry-lastid.cjs` | 2 | 10/10 PASS |
| `tests/specs/ssrf-ipaddr-ipv6.cjs` | 3 | 58/58 PASS |
| `tests/specs/ssrf-redirect-no-follow.cjs` | 3 | 6/6 PASS |
| `tests/specs/viewstate-base64-degrade.cjs` | 3 | 14/14 PASS |

**老 19 个 spec / 264 个子断言 PASS**，无回归。

**注**：`tests/specs/ai-baseurl-dns-ip.cjs` 周期 1 写时假设 SSRF 错误信息含 `内网|保留 IP|SSRF`；周期 4 把 metadata IP 显式区分，throw 文案改为 `云元数据 IP` / `非公网 IP`。老 spec 失败 1 项，本周期已扩展正则兼容新文案。

## 5. 总结

- **新增 8 个 spec / 145 子断言** 全 PASS
- **老 19 个 spec / 264 子断言** 全 PASS（其中 1 个修复）
- **checkpoint 9/9 + probe 6/6** 全 PASS
- **总计 26 个 spec / 424 子断言** 全部 PASS
- **根因分析**:
  1. `ai-baseurl-dns-ip.cjs` 老 spec 的正则不含新错误关键词 — 修在老 spec 而不是改 ssrf-guard 错误信息（更稳定）
  2. 无其他根因 — 周期 4 增量都"叠加在前一周期之上"，新 spec 单独验证新功能，不动旧契约

## 6. Helmet 8 升级兼容性验证

- 旧 CSP / COOP / X-Frame-Options DENY / Referrer-Policy / COEP=false 全部仍生效
- Helmet 8 默认开启 HSTS（`max-age=31536000; includeSubDomains`） — 新增头
- Permissions-Policy 仍手写 20 项（helmet 8.x 仍未原生支持）
- X-Content-Type-Options: nosniff（helmet 8 默认） — 新增头
- X-DNS-Prefetch-Control / X-Download-Options / X-XSS-Protection 等 helmet 8 默认头 — 新增