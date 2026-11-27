# Cycle 332 审计（2026-11-27 20:10）

## 触发与状态机
- 触发：整点 cron。读 `state/cycle-state.json`：cycle=331 / `completed` / `lock.held=false` → 开启 cycle=**332**。
- 获取锁：`cycle 332 / held=true / acquired_at 2026-11-27T20:10:00+08:00`。

## 任务选取（单粒度，OBS-3301 修复）
- 背景：cycle 330 全量跑 172 spec 时 `css-duplication-audit` 被 `timeout 90` 误杀上报为 FAIL（复跑 3/3 PASS、0.54s、输入确定）→ 判定瞬时抖动并记 OBS-3301（低）。
- 本周期实现 **`tests/run-suite.cjs`**：批量回归 runner，**分级超时 + 失败自动重试一次**，只有重试仍失败才报 FAIL。
- 可量化验收标准：① 存在 `tests/run-suite.cjs` 并跑全量 `tests/specs/*.cjs`；② 每 spec 默认 150s 超时（可按秒调 `--timeout=`），失败重试一次；③ 输出 `TOTAL/PASS/FAIL` + `FAILED:` 列表，仅 0 失败才 exit 0；④ **运行得 TOTAL=172 PASS=172 FAIL=0**；⑤ 零产品源码改动（仅 tests/ + 状态）。

## 实现与调试（诚实记录踩坑）
- 初版把 `--timeout=30` 当 **30 毫秒**（`parseInt` 后直接当 ms）→ 子进程被瞬时 kill，pattern 自检报 FAIL。
- 修正：`--timeout=` **按秒解释**（`* 1000`），默认 150s；并加注释说明曾把秒误当毫秒的坑。
- 修正后 pattern 自检 `--pattern=css-duplication-audit --timeout=30` → **PASS=1 FAIL=0**。

## 结果
| 检查 | 结果 |
| --- | --- |
| `tests/run-suite.cjs` 全量运行 | **TOTAL=172 PASS=172 FAIL=0**（exit 0） |
| 语法/自检 | `node -c` 通过；pattern 验证 PASS |
| 变更面 | 仅 `tests/run-suite.cjs`（+42 行）+ `state/cycle-state.json` |
| 产品源码 | **零改动**（无 UI / 无 server / 无 CSS） |

## 风险
- 纯测试基建，非高风险（不改接口/DB/依赖/部署）→ 无需 await_confirm。
- 超时与重试只会**减少**假失败，不会掩盖真实失败（真实失败重试两次都失败仍上报）。

## 提交与推送
- 仅 `feat/auto-cycle`，不直推 main，不自动合并；推送失败按手册退避重试，远端分叉即暂停上报。
