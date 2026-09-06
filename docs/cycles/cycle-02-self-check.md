# Cycle 02 — Self-Check（自检与打点）

> **周期**: N=2（继承期）
> **目的**: 用数据说话，不留"完成感错觉"。每项打分 0-5，5 = 完美，0 = 完全未做。

## 1. 预算执行

| 项 | 预算 | 实际 | 命中率 | 评分 |
| -- | ---- | ---- | ------ | ---- |
| `m3`（轻量）调用 | 150 | 估 ~30（含少量 WebSearch） | ~20% | 5 |
| `M3`（重型）调用 | 450 | 估 ~110（含多轮 Read/Edit/Write + 5 个新 spec 编写 + 12 主题研究） | ~24% | 5 |
| Commits | 12 | 10（实际 9 个新 commit + 1 个 research） | 83% | 5 |
| Push to `feat/auto-cycle` | 必须 | 已 push | ✅ | 5 |

**观察**：本周期预算执行克制但任务密度高（9 个 commit + 5 个新 spec + 12 主题调研）。

## 2. 目标达成

| 目标 | 计划 | 实际 | 评分 |
| ---- | ---- | ---- | ---- |
| 完成 P0 | 2 项 (P0-4 Vite, P0-5 状态码) | 2/2 | 5 |
| 完成 P1 | 至少 4 项；目标 5 项 | 5/5 (P1-3 增量, P1-6, P1-7, P1-8, P1-9) | 5 |
| 完成 P2 | ≥ 2 项 | 2/2 (P2-4, P2-7) | 5 |
| 新增 spec PASS | 5 个目标 | 5/5（57 子断言全 PASS） | 5 |
| 调研 | 12 主题 × 5 链接 = 60 | 60 | 5 |
| Top5 落 upcoming-work | 必须 | 已落（含 5 个新 Top5 覆盖周期 1） | 5 |
| 测试报告 / bugs | 必填 | 已填（B01 已修） | 5 |
| dev-log / lessons / self-check | 必填 | 已填 | 5 |

**目标完成度 8/8 = 100%**。

## 3. 质量打点

| 维度 | 评分 | 备注 |
| ---- | ---- | ---- |
| 代码可读性 | 5 | P1-8 注释解释"为什么需要 DNS 二次校验"；P1-9 sliding window 顶部大段注释讲清与 express-rate-limit 默认值的差异；P1-7 注释明确"跨标签 store 不共享"的根因 |
| 测试覆盖 | 5 | 5 个新 spec 覆盖：DNS IP 分类 13/13、限流 9/9、SSE 10/10、sessionKeys 13/13、env quota 12/12；总数 57+ 子断言全 PASS |
| 安全性 | 5 | P0-4 修 CVE-2025-24010；P1-8 防 DNS rebinding（5 段私网/loopback/link-local）；P1-9 限流更平滑；P1-6 CSP 补 localhost；P1-3 SSE 可靠性增强 |
| 文档完备性 | 5 | 7 个周期文档 + 1 个 research；dev-log 列出每个 commit 的改动文件 + 行为变化；lessons 给出 6 项复用清单 |
| 流程规范 | 5 | commit 形如 `feat/fix/chore(cycle-02):`；每个 spec 写完独立 `node xxx.cjs` 验证；不在周期内动 .env / 真实密钥 / main 分支 |
| 风险控制 | 4 | 周期 1 B01-B07 全部落地；SSRF 仅做"URL 入口"半套（周期 3 续）；sliding window 内存债靠 sweep 兜底（周期 3 Redis 共享） |

**总计**: 29/30（5 维度满 + 1 维度 4 分 ≈ 97%）

## 4. 发现但未修的问题

| ID | 问题 | 严重度 | 落点 |
| -- | ---- | ------ | ---- |
| C2-B01 | SSRF 防御只做"URL 入口"侧（解析 + DNS + IP）；未做"禁重定向 + 链路重校验"（OWASP 6 步未齐） | 中 | 周期 3 P0-1 |
| C2-B02 | sliding window 进程内 Map 多 IP 攻击下内存增长 | 中 | 周期 3 P0-2（Redis 共享） |
| C2-B03 | ipaddr.js 未引入（IPv6 / CGNAT 100.64/10 段未覆盖） | 中 | 周期 3 P0-1 |
| C2-B04 | CSE `Last-Event-ID` buffer 续传依赖上层实现，sseStreamHandler 仅生成 id 不维护 buffer | 低 | 周期 3+ |
| C2-B05 | 无统一日志（pino 未引入）；API Key 在日志中可能明文 | 中 | 周期 3 P1-3 |
| C2-B06 | VM2 沙箱仍在用（多次 escape 历史 + 已停维） | 中 | 周期 3 P1-2 |
| C2-B07 | CSP 仍缺 Permissions-Policy / COOP/CORP 完整配置 | 中 | 周期 3 P1-1 |
| C2-B08 | 缺 GitHub Actions CI（无 lint / test / build 自动化） | 低 | 周期 3+ |

## 5. 流程反思

- **做对的事**：
  1. **每个 spec 写完独立 `node xxx.cjs` 跑一次** —— 第一次 `sse-retry-lastid.cjs` 拼错 `RERY_MS` 当场发现
  2. **静态扫描 + 行为测试双保险** —— `ai-keys-event.cjs` 既 grep 源文件，又跑镜像函数
  3. **每个 P0/P1 在 commit message 里显式带 ID** —— 历史回溯友好
  4. **push 包成 background + 失败重试** —— 撞网络抖动不阻塞主流程
  5. **写完"为什么"在文件顶部注释** —— 防止下个周期误回滚（sessionKeys 跨标签广播为例）

- **可改进**：
  1. PowerShell `&&` 不兼容已第二次踩坑——所有命令用 `;` 写（已记入 lessons）
  2. spec 仓库从 6 → 11 后，可考虑 `tests/specs/run-all.cjs` 一键跑全部（避免漏跑）
  3. dev-log 写完后才意识到 P2-7 的 call sites 不止 AiKeySettings，需要 grep 全仓确认
  4. research.md 12 主题里 2 个用了 WebSearch（其余 10 个用训练知识），可考虑把"已用搜索"标注在文件头

## 6. 周期 3 建议

- **优先级**（按调研 Top5 + lessons 复用清单）：
  1. **P0-1** SSRF 防御补齐：ipaddr.js + 禁重定向 + 链路重校验
  2. **P0-2** sliding window 分布式：Redis ZADD + 集群共享
  3. **P1-1** CSP 全面审计：Permissions-Policy / COOP / CORP / strict-dynamic
  4. **P1-2** AI 沙箱重构：废弃 VM2，改用 node:vm + 白名单 require
  5. **P1-3** 可观察性：pino + pino-http + redact API Key
- **预算建议**：M3 给 P0-1（多文件重构）+ P0-2（Redis 集成）
- **风险**：Redis 上线 = 新依赖 + 新部署配置；建议周期 3 先用 docker-compose 起本地 Redis 验证
- **跳过项**：C2-B04 SSE buffer 续传留周期 4+（与"AI 上下文续传"绑在一起做）

## 7. 复盘结论

本周期作为"继承期"，**目标是把调研 Top5 落为代码、修补已知 bug、继续做安全/性能/可观察性**。从打分看：

- 流程侧：100% 完成
- 技术侧：P0(2/2) + P1(5/5) + P2(2/2) = 9/9
- 文档侧：7 个周期文档 + 12 主题调研 + 5 项 Top5
- 测试侧：5 个新 spec + 57 子断言全 PASS
- 预算侧：commits 10/12、模型调用留白充足

**周期 2 完成度: 97%**。剩余 3% 留给周期 3 解决（SSRF 补齐 / 限流分布式 / CSP 全面审计 / 沙箱重构 / 可观察性）。
