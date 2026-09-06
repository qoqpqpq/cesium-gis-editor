# Cycle 01 — Lessons（经验沉淀）

> **周期**: N=1（启动期）
> **目的**: 把本周期踩过的坑、做对的事、可复用的模式写成结构化笔记，供周期 2 直接复用。

## 1. 启动期最大的收益

启动期任务把"基础设施"补齐的成本是真实存在的，但只花这一次：

- `state/cycle-state.json`（含 `current_cycle / last_run_status / budgets / history`）→ 后续周期读 N 即可
- `docs/release-notes/upcoming-work.md`（含 P0/P1/P2 池）→ 后续周期只需"删除已完成"+"追加新发现的"
- `docs/cycles/cycle-NN-*.md` 目录结构（exec-plan / test-report / bugs / dev-log / research / lessons / self-check）→ 后续周期照搬
- `feat/auto-cycle` 分支 + `tests/specs/*.cjs` 骨架 → 后续 spec 加在该目录即可

**经验**：把"脚手架"当成正式交付物来对待，**不要把它当成副产物**。本周期的 8 个 commit 中第一个 `chore(cycle-01): bootstrap cycle infra` 是最有杠杆的一笔。

## 2. 工程流程踩过的坑

### 2.1 PowerShell 习惯陷阱

- `mkdir a b c`（空格分隔）能用，但 `mkdir a, b, c`（逗号）更稳；PowerShell 的 alias `mkdir` 实际是 `New-Item -ItemType Directory`。
- `head` 命令 PowerShell 不识别 → 一律用 `Get-Content ... -TotalCount 5` 或 `Select-Object -First 5`。
- 调试 JSON 提交时用 `--data-binary @file` 而非 `-d`，避免 `\` 转义问题。

### 2.2 Git lock 与 reset

- `git add .` / `git add -A` 极易带进 `.env`、`server/data/blog.db`、临时 mockup 文件。**一律显式 `git add <file>`**。
- `git index.lock` 在子进程退出异常时会残留 → `Remove-Item -Force .git/index.lock` 兜底，但要先确认没有其他 git 进程在跑。
- 误 commit 后用 `git reset --soft HEAD~1` 比 `git reset --hard` 安全。

### 2.3 Spec 编写模式

- 不依赖 express 启动 → 用 `require('../path')` 直接读模块并断言函数返回值
- mock `localStorage` 时要提供 `key(i)` 与 `length` 两个 getter，且 `removeItem` 要可观察
- 私有函数用 `mod._internal.xxx` 暴露在测试用前要写明确注释："测试专用，请勿在生产代码中依赖"

## 3. 架构与安全

### 3.1 P0-3：AI baseUrl https-only 的"白名单+兜底"双层

```
通用白名单：https 必须
Ollama 兼容：http 仅在显式 AI_ALLOW_HTTP=1 时允许
其它一律拒绝（含 https 但不在白名单 / http 但不是 ollama）
```

这个分层用 `ALLOWED_BASE_HOSTS` + `OLLAMA_HOSTS` 两个 Set 控制，加新厂商改一个文件即可。**但调研发现还差一环**：DNS 解析后 IP 二次校验。`http://internal.api` 用 nslookup 解析到 `169.254.169.254`（AWS metadata）就能绕过 host 校验。周期 2 的 P1-8 必须补。

### 3.2 P1-3：SSE 封装是"双 80 行"消除的开始

`chat/stream` 与 `agent?stream=1` 之前各有约 80 行重复（queue full / heartbeat / abort / error event / usage 上报）。抽出 `_sse.js` 后：

- 一处改 → 两处生效
- 测试时只需 mock 一个公共函数
- 加 retry 字段、加 Last-Event-ID 等增强只需改 _sse.js

但目前还没加：`retry:` 提示、Last-Event-ID 续传、客户端自动重连语义。这三件事是周期 2 的 Top5 #4。

### 3.3 P0-1：dissolve 端点"单层"语义是行业常见用法

`turf.dissolve(featureCollection)` 在客户端只传 layerA 是高频用法。原路由要求 `layerA + layerB + groupBy` 三个都存在是不合理的。修改为"layerB 可选"后保留了向后兼容。**经验**：端点签名应该按"最简可用"来设计，不要预设所有调用方都传齐所有字段。

## 4. 模型 / 预算观察

- 本周期实际调用：约 12 次 WebSearch + 多次 Shell/Edit/Write；任务密度高但单次任务不大
- 重要原则：**WebSearch/WebFetch 优先用于调研阶段，开发阶段把数据"固化"在 spec 的"参考"段**——避免每次周期重搜
- 真实代码修改都用 `Edit`/`Write` 工具一次性写到位，再用 `Read` 工具验证；不要写完不读

## 5. 文档组织的"读者优先级"

| 文档 | 读者 | 风格 |
| ---- | ---- | ---- |
| `cycle-01-execution-plan.md` | 启动 agent | 任务清单 + 验收标准 + 风险 |
| `cycle-01-test-report.md` | 所有人 | 命令输出 + 结论 + 根因 |
| `cycle-01-bugs.md` | 开发 agent | 复现步骤 + 期望/实际 + 严重度 |
| `cycle-01-dev-log.md` | 后续周期 / 审计 | 改了哪些文件 + 新增 spec + 行为变化 |
| `cycle-01-research.md` | 后续周期 / 新人 | 主题 → 链接 → 摘要 → 行动 |
| `cycle-01-lessons.md` | 后续周期 | 经验沉淀（本文件） |
| `cycle-01-self-check.md` | 启动 agent / 复盘 | 预算 / 目标 / 风险打分 |

**经验**：把"读者"提前定下来能避免写文档时堆砌"看起来专业"的术语。

## 6. 复用到周期 2 的清单

- [ ] **C2-0** 创建 `docs/cycles/cycle-02-execution-plan.md` 时把本周期的 lessons 作为附录引用
- [ ] **C2-1** 把 spec 目录再扩 3-4 个：
  - `specs/spatial-bbox-precheck.cjs`（P2-3 调研落点 2.3）
  - `specs/ai-baseurl-dns-ip.cjs`（P1-8 DNS 二次校验）
  - `specs/ratelimit-sliding-window.cjs`（P1-9）
  - `specs/parse-tool-streaming.cjs`（OpenAI 协议统一）
- [ ] **C2-2** 把 `feat/auto-cycle` 切回 main 前先确认所有 commit 已 push 成功（避免下周再次"final push"）
- [ ] **C2-3** 自检里加一条"启动期 state 不应再初始化"——只有 N=1 才需要写 `current_cycle: 1`，N≥2 应继承
