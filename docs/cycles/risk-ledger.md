# 风险台账（风险 / 技术债 / 已知缺陷 / 外部依赖风险）

> 每轮新增风险及时录入。只记增量，不整段复制历史。

| ID | 类型 | 描述 | 严重级 | 状态 | 录入轮 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| R-1501 | 技术债 | multiAgentPlanner 当前 planner 为确定性规则（capability/phase），尚未接真实 LLM 产出 steps；LLM planner 适配层待落 | 中 | open | cycle 15 | 复用 execute/verify，见 cycle-15-multiagent-integration.md |
| R-1502 | 已知缺陷 | checkpoint.cjs / probe-real-ai-tool-first.cjs 需运行中 server；自动周期离线环境无法跑，存在回归盲区 | 中 | open | cycle 15 | 下一轮在有 server 环境时补跑 |
| R-1503 | 外部依赖 | 自动周期多模型故障转移（sensenova/deepseek/kimi）无法在 Agent 运行时自动切换，需 Harness 层配置 | 中 | open | cycle 15 | 降级时仅同模型内应对，已在 runbook 标注边界 |

## 已知开放缺陷（承继历史）
- 历史周期累计 bugs_open 计数见 `state/cycle-state.json` history；本轮未新增阻断/严重缺陷。