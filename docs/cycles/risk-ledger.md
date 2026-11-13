# 风险台账（风险 / 技术债 / 已知缺陷 / 外部依赖风险）

> 每轮新增风险及时录入。只记增量，不整段复制历史。

| ID | 类型 | 描述 | 严重级 | 状态 | 录入轮 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| R-1501 | 技术债 | multiAgentPlanner 当前 planner 为确定性规则（capability/phase），尚未接真实 LLM 产出 steps；LLM planner 适配层待落 | 中 | **resolved (cycle 16)** | cycle 15 | 已落 `server/agent/llmPlannerAdapter.js`，复用 execute/verify 门禁；spec 31 PASS |
| R-1502 | 已知缺陷 | checkpoint.cjs / probe-real-ai-tool-first.cjs 需运行中 server；自动周期离线环境无法跑，存在回归盲区 | 中 | open | cycle 15 | 下一轮在有 server 环境时补跑 |
| R-1503 | 外部依赖 | 自动周期多模型故障转移（sensenova/deepseek/kimi）无法在 Agent 运行时自动切换，需 Harness 层配置 | 中 | open | cycle 15 | 降级时仅同模型内应对，已在 runbook 标注边界 |
| R-1601 | 技术债 | llmPlannerAdapter 仅以注入 llmChat + mock 验证；真实平台端到端（真实 LLM 产出 steps）待有 API Key + 网络时验证 | 中 | open | cycle 16 | 离线环境无法跑真实 LLM 路径 |
| R-1701 | 技术债 | workload identity 三函数已落但未接入 withGuardrail 主链；接入需评估对既有调用方/对外接口影响，可能触发变更准入评审 | 中 | **resolved (cycle 18)** | cycle 17 | 已 opt-in 接入主链（默认关闭，签名不变，既有调用方零影响）；spec 19 PASS |
| C21-B01 | 已知缺陷 | `classify.js` `rampColor(i,n)` 当 `i > n-1` 越界 → `palette[lo]` undefined → `lerpHex` 抛 TypeError | 低 | **resolved (cycle 21)** | cycle 21 | clamp `i`/`lo` 到合法区间；唯一内部调用方 `classifyFeatures` 传 `idx` 恒在界内，clamp 纯外部防御，内部路径零影响；spec D3/D4 固化 |
| R-2201 | 外部依赖 | 远端 `feat/auto-cycle` 已分叉：远端独有 58 commit（另一自动化实例推进 cycle 22-28），本地独有 13 commit（本会话 cycle 15-21），merge-base=bf4f13c，非快进冲突 | 高 | **open（阻塞推送，待人工决策）** | cycle 22 | 按 runbook 第四节第2条不强推/不自动合并；需人工选定合并策略（rebase 本地到远端 / merge / 弃本地保远端 / 弃远端保本地） |

## 已知开放缺陷（承继历史）
- 历史周期累计 bugs_open 计数见 `state/cycle-state.json` history；本轮未新增阻断/严重缺陷。