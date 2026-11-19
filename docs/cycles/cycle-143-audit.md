# 周期 143 审计报告（2026-11-19，自动周期 · Slice8 收尾 + 全量回归）

## 0. 轮次定位

周期 138 已交付 Slice8 主体（123 裸 px→token + `#1f242d` 清零 + `margin: -var(--space-3px) 0`）。但进度池 `- [ ] Slice8 打磨 + 全量回归` 未勾选，其「全量 160/172 回归」部分存在已知超时假失败（`helmet-8-permissionspolicy-recheck.cjs` rc=124，内部断言 4/4 通过）。本轮 = **Slice8 收尾 + 全量回归转绿**。

## 1. 根因定位（helmet-8-permissionspolicy-recheck 假失败）

读 `tests/specs/helmet-8-permissionspolicy-recheck.cjs`：测试 3 内 `app.listen(0,...)` 返回的 server 句柄 `s` **从未关闭**（`finally` 里关的是未定义的 `app._server`）→ Node 事件循环被监听 socket 保活 → 进程永不退出 → `timeout` 杀进程 rc=124。**断言本身 4/4 全过**（`ppHeader===undefined` 与 cycle-07 结论一致），仅进程泄漏。

**修复**：`let srv;` 持有句柄，`finally { try { srv.close(); } catch(_){} }`。改后 `timeout 60 node ...` → **RC=0，pass=4 fail=0，立即退出**（原 RC=124）。

## 2. 全量回归（172 specs）

逐 spec `execFileSync`（每 spec 120s 上限）跑全部 172 个：

- **pass=172 / fail=0**（初跑 171 PASS + 1 skip；补跑 `sandbox-perf-benchmark` 后 **172/172 全绿**）。
- 原 170 PASS + 1 超时假失败 → 修复后 **172 PASS + 0 FAIL**，**全量回归全绿**。
- 期间发现一次 runner 误判：初版 runner 用 `execFileSync(...).length`（stdout 字节数）当退出码，导致通过 spec 被报 rc=2492 → 修正为 `e.status` 语义（成功 rc=0，失败 `e.status`）。与业务代码无关，纯测试跑批脚本。

## 3. sandbox-perf-benchmark 定性（补跑）

单独跑 `sandbox-perf-benchmark.cjs`（timeout 240s）：**RC=0，pass=11 fail=0**（两轮 vm 总耗时 ratio=0.75 在期望 0.5-2.0 内）—— 非缺陷，仅运行较慢（>默认预算），故历次被记为 flaky。本次给足时间即通过 → **172/172 全绿成立**。

## 4. 验收（Slice8 收尾）

| 项 | 结果 |
|---|---|
| `#1f242d` 残留 | **0**（Slice8 已清零） |
| 15 道设计门禁 | **15/15 PASS**（CSS 未动） |
| 全量回归（172 specs） | **172 PASS / 0 FAIL** |
| 线上 | HTTP 200（`https://129.204.202.173:5175/`） |

## 5. 结论

**Slice8 收尾完成 → UR-4 全部结案**：`helmet-8-permissionspolicy-recheck` 假失败根因（server 句柄泄漏）已修；全量回归 **172/172 转绿**；进度池 Slice8 项勾选。零业务代码改动（仅测试 spec 一行级修复）。