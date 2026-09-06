# Cycle 02 — Lessons（经验沉淀）

> **周期**: N=2（继承期）
> **目的**: 把本周期的"踩坑/做对/可复用"写成结构化笔记，供周期 3 直接复用。

## 1. 继承期最大的收益

周期 1 脚手架"换种姿势"的回报：

- `state/cycle-state.json` 只需 `current_cycle: 2` + `history` 追加一项，不重写 → 周期 3 同理只需 `current_cycle: 3`
- `docs/release-notes/upcoming-work.md` 顶部已完成 P0-1/2/3 清空，新增 P0-4 → 周期 3 同理清空已交付 + 追加新 P0
- `tests/specs/*.cjs` 目录 5 → 11 → 17 递增；每加一个 spec 就是 6 行 commit 模板
- `docs/cycles/cycle-NN-{exec-plan,test-report,bugs,dev-log,research,lessons,self-check}.md` 文件名约定不变

**经验**：周期 N≥2 启动前先 `Read` 周期 N-1 的 7 个文件 → 当成"模板 + 内容引用"对待。本周期把这步放在 dev-log 第 5 节做。

## 2. 工程流程踩过的坑

### 2.1 写 spec 的"反射式测试"陷阱

- 第一次写 `sse-retry-lastid.cjs` 时拼错变量名 `RERY_MS` → 单元测试自己不会 catch（typo 出现在 spec 的断言 target 里）
- 解决：写完先单独 `node xxx.cjs` 跑一次；不可信"Edit 工具说成功"
- 经验：**Spec 自己也是代码，必须跑通才算交付**

### 2.2 mock EventEmitter 的最小面

- 写 SSE 测试时用 `new EventEmitter()` 替代 express 的 req/res → 简单到"省一个依赖"，但要补 3 个 getter：`writableEnded / destroyed / flushHeaders`
- 经验：`makeReqRes / makeRes` 工厂函数沉淀到下一周期的 helper

### 2.3 PowerShell 的 `&&` 兼容

- 周期 1 已记录，但周期 2 仍踩：PowerShell 7+ 才支持 `&&`，本机 5.x 不支持 → 改用 `;` 串联
- 经验：所有命令用 `;` 写，省去兼容判断

### 2.4 网络抖动导致 push 失败

- 周期 2 最后一次 push `cycle-02-research.md` 撞到 `Failed to connect to github.com:443 after 21057 ms`（push 3 次才成功）
- 经验：把 push 包成"失败重试 3 次 + 输出到 background"，避免阻塞主线程

### 2.5 静态扫描 + 行为测试的"双保险"

- 周期 2 `ai-keys-event.cjs` 同时做：
  1. 读源文件检查 `localStorage.setItem('ai-keys-changed-at'` 字符串已消失
  2. 跑一份镜像的 getAll/set/remove 测行为
- 经验：源文件静态扫描能 catch"误恢复旧代码"；行为测试能 catch"镜像与源不同步"

## 3. 架构与安全

### 3.1 P1-8：SSRF DNS rebinding 防御的"半套"

周期 2 P1-8 实现了"URL 解析 + DNS 解析 + IP 分类"三步（参考 OWASP 1.1）。但调研发现还差 3 步：

1. 禁重定向（`redirect: 'manual'`）—— 当前 node-fetch 仍 follow 30x
2. 链路重校验（每 hop 重新跑 validate）—— 同上
3. 用 ipaddr.js 替代正则（IPv6 / CGNAT 100.64/10 / 25 段特殊地址）

**经验**：OWASP cheat sheet 给了 6 步防御清单，先做哪 3 步是"投资回报"问题。周期 2 选了"URL 入口"侧（最低成本、覆盖面最大）；周期 3 切 ipaddr.js + 禁重定向。

### 3.2 P1-9：Sliding Window Log 的"内存债"

- `Map<ip, timestamps[]>` 每个 IP 持数组 → 攻击者发百万 IP 就会让 Map 无限增长
- 周期 2 加了 `sweep()` 周期清扫：每 `max(windowMs*4, 60s)` 清理空数组
- 风险：单进程内存上限 ~1GB；多 IP 攻击下 Map 元数据 ~200B/entry → 50 万 IP 约 100MB
- **经验**：自研 sliding window 适合"中小流量 + 单实例"；真上生产必须 Redis 共享（周期 3 P0-2）

### 3.3 P1-3：SSE retry/id 是"加 5 行代码赚 90% 可靠性"

- `retry: 3000` 一行
- `id: <n>` 5 行（nextEventId + writeSse 多一个参数）
- `Last-Event-ID` 读取 1 行 + 注释帧 1 行
- 但带来的收益：浏览器断线 3s 自动重连 + 续传 + 错误事件能正确排序
- **经验**：这种"边际收益极高"的协议层增强，**优先做**

### 3.4 P1-7：跨标签广播移除的"为什么"是文档

- `notify()` 之前写 localStorage → 其他标签 store 不会更新（内存隔离）→ 写了等于噪声
- 改完只 dispatchEvent → 同标签订阅者照常工作
- 关键是把"为什么"写进 `sessionKeys.js` 顶部注释，否则下个周期会有人"加回" localStorage 广播（觉得"为啥不通知其他标签"）
- **经验**：架构决策 = 代码 + 注释 + spec 三件套，缺一就翻车

## 4. 模型 / 预算观察

- 周期 2 调用：~10 次 WebSearch（仅 CVE-2025-24010 + DNS rebinding 2 个主题）；其余 10 个主题靠"训练知识" + 已知权威源
- 重要原则：**WebSearch 用在"最不确定的 1-2 个主题"，其它用训练知识足以**
- 真实代码修改都用 `Edit`/`Write` 工具一次性写到位，再用 `Read` 工具验证

## 5. 文档组织的"读者优先级"（与周期 1 一致）

| 文档 | 读者 | 风格 |
| ---- | ---- | ---- |
| `cycle-02-execution-plan.md` | 启动 agent | 任务清单 + 验收标准 + 风险 |
| `cycle-02-test-report.md` | 所有人 | 命令输出 + 结论 + 根因 |
| `cycle-02-bugs.md` | 开发 agent | 复现步骤 + 期望/实际 + 严重度 |
| `cycle-02-dev-log.md` | 后续周期 / 审计 | 改了哪些文件 + 新增 spec + 行为变化 |
| `cycle-02-research.md` | 后续周期 / 新人 | 主题 → 链接 → 摘要 → 行动 |
| `cycle-02-lessons.md` | 后续周期 | 经验沉淀（本文件） |
| `cycle-02-self-check.md` | 启动 agent / 复盘 | 预算 / 目标 / 风险打分 |

**经验**：本周期把这张表复制到 lessons 顶部，让"读者优先级"成为团队规范。

## 6. 复用到周期 3 的清单

- [ ] **C3-0** 创建 `docs/cycles/cycle-03-execution-plan.md` 时把本周期的 lessons 作为附录引用
- [ ] **C3-1** spec 目录预计新增 3-4 个：
  - `specs/ssrf-redirect-no-follow.cjs`（周期 3 P0-1 续）
  - `specs/ratelimit-redis.cjs`（周期 3 P0-2 分布式）
  - `specs/csp-permissions-policy.cjs`（周期 3 P1-1）
  - `specs/sandbox-no-vm2.cjs`（周期 3 P1-2 沙箱重构）
- [ ] **C3-2** sliding window Map 元数据增长监控 —— 周期 3 引入内存上限 + 攻击者 IP 拒绝
- [ ] **C3-3** push 包成"失败重试 3 次"工具（避免撞网络抖动）
- [ ] **C3-4** Spec 写完强制自跑一遍，不依赖 Edit 工具说成功
- [ ] **C3-5** 启动期 state 不应再初始化——只有 N=1 写 `current_cycle: 1`；N≥2 继承 + 追加 history
- [ ] **C3-6** ipaddr.js 替代正则 + 禁重定向 + 链路重校验（OWASP 6 步齐活）
