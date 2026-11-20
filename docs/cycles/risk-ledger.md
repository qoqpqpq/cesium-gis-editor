# 风险台账（风险 / 技术债 / 已知缺陷 / 外部依赖风险）

> 每轮新增风险及时录入。只记增量，不整段复制历史。

| ID | 类型 | 描述 | 严重级 | 状态 | 录入轮 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| R-1501 | 技术债 | multiAgentPlanner 当前 planner 为确定性规则（capability/phase），尚未接真实 LLM 产出 steps；LLM planner 适配层待落 | 中 | **resolved (cycle 16)** | cycle 15 | 已落 `server/agent/llmPlannerAdapter.js`，复用 execute/verify 门禁；spec 31 PASS |
| R-1502 | 已知缺陷 | checkpoint.cjs / probe-real-ai-tool-first.cjs 需运行中 server；自动周期离线环境无法跑，存在回归盲区 | 中 | **verified (cycle 59)** | cycle 15 | server/index.js 已在 3001 运行；c59 补跑 **checkpoint --strict 9/9 + probe-real-ai-tool-first --strict 6/6 = 15/15 PASS**，端点契约/探活/schema 均绿，回归盲区关闭 |
| R-1503 | 外部依赖 | 自动周期多模型故障转移（sensenova/deepseek/kimi）无法在 Agent 运行时自动切换，需 Harness 层配置 | 中 | open | cycle 15 | 降级时仅同模型内应对，已在 runbook 标注边界 |
| R-1601 | 技术债 | llmPlannerAdapter 仅以注入 llmChat + mock 验证；真实平台端到端（真实 LLM 产出 steps）待有 API Key + 网络时验证 | 中 | open | cycle 16 | 离线环境无法跑真实 LLM 路径 |
| R-1701 | 技术债 | workload identity 三函数已落但未接入 withGuardrail 主链；接入需评估对既有调用方/对外接口影响，可能触发变更准入评审 | 中 | **resolved (cycle 18)** | cycle 17 | 已 opt-in 接入主链（默认关闭，签名不变，既有调用方零影响）；spec 19 PASS |
| C21-B01 | 已知缺陷 | `classify.js` `rampColor(i,n)` 当 `i > n-1` 越界 → `palette[lo]` undefined → `lerpHex` 抛 TypeError | 低 | **resolved (cycle 21)** | cycle 21 | clamp `i`/`lo` 到合法区间；唯一内部调用方 `classifyFeatures` 传 `idx` 恒在界内，clamp 纯外部防御，内部路径零影响；spec D3/D4 固化 |
| R-2201 | 外部依赖 | 远端 `feat/auto-cycle` 已分叉：远端独有 58 commit（另一自动化实例推进 cycle 22-28），本地独有 13 commit（本会话 cycle 15-21），merge-base=bf4f13c，非快进冲突 | 高 | **resolved (cycle 143)** | cycle 22 | 原按 runbook 不强推/不自动合并，待人工选定合并策略；实际经人工协调后远端已与本会话同步（周期 117-143 推送全成功、IN_SYNC=YES），R-2201 关闭 |

## 已知开放缺陷（承继历史）
- 历史周期累计 bugs_open 计数见 `state/cycle-state.json` history；本轮未新增阻断/严重缺陷。
| R-5202 | 外部依赖 | GitHub PAT（~/.dsh/.credentials.yaml → refs.GITHUB_TOKEN，ghp_afu…）已被 GitHub 拒绝（Invalid username or token / 401 Bad credentials），push 全部失败（6 次退避重试 + 脚本同款 x-access-token 亦被拒）；仓库公开故读（ls-remote）正常，仅写阻塞 | 高 | **open（阻塞推送，待人工更新 token）** | cycle 161 | 非分叉：远端 35facd6 为本地 b05599c 的 fast-forward 祖先；本地提交 b05599c（cycle-161 skipped 记录+状态）安全未丢、未推。需人工在 DSH 凭证服务轮换/重填带 repo 写权限的有效 PAT；期间任何新提交均无法推送。 |
| R-5201 | CI-CD | GitHub 在 pr-review.yml 无 `push` 触发的情况下仍生成 `event:push` 失败 run（服务端触发评估异常，20+ 次） | **已解决(c52)** | c52 先移除 pull_request(实测无效,b55de8ae 仍触发)；二次审批后删除 pr-review.yml，删除后的 push(265b42a) 触发 0 run，远端 .github/workflows 404 | 已闭环：删除 workflow 止住红叉；git 历史可找回。附带发现：文件层 on: 改动对 GitHub push 触发无效（服务端异常） |

| TD-5501 | 技术债 | R-1502 解锁后全量 spec 暴露 9 个既有失败（此前被 CI 缺 server/turf 掩盖） | **resolved (cycle 59, 用户决策)** | c56 分诊:无一是安全/核心功能缺失(6 spec 过时/路径/API漂移+1文档缺失+1环境+1待查)。c57 修 6 个:csp-permissions-policy(10/6→16/0)、helmet-8-upgrade(19/1→20/0)、helmet-permissions-policy(3/3→6/0)(均改指向 server/middleware/permissionsPolicy.js 真实实现)、protocol-shared(18/1→19/0,TOOL_OPEN/CLOSE 定义在 constants.js)、protocol-sync-script(6/3→9/0,根因 check-protocol-sync.cjs 脚本过期:提取改读 constants.js+Check5 [^/]+→.+?+spec 硬编码 4/4→动态 N/N)、sandbox-perf-benchmark(顺带转绿)→**全量 spec 失败 9→3**。c59 用户决策后修复余 3:metadata-ip-maintenance(补 metadata-ips.md 缺 169.254.170.1/169.254.0.1/fe80::a9f:feff:fecf:3c + metadata-ip-maintenance 命令,32/32)、metadata-ip-sync-script(spec 对齐当前 sync-metadata-ips.cjs 真实 API(parse/parseArgs/parseMarkdown/parseJson/parseCsv/sync/DEFAULT_SOURCE)+dry-run 不写文件断言,11/11)、viewstate-browser-decompress(client npm install pako@^2.2.0,15/15)→**全量 spec 失败 9→0；全量回归 5092 PASS / 0 FAIL** | 报告 docs/guides/td-5501-triage.md |
