# 周期 300 审计（2026-11-26 11:10–11:45 HKT）

> 本轮由**用户 11:21 四项拍板**驱动，非空闲自查。前 157 轮连续 skipped 的计数因本轮交付而重置。

## 1. 触发与决策

用户拍板四项：

| # | 事项 | 用户选择 | 处置 |
| --- | --- | --- | --- |
| 1 | 公网入站（观测 15 轮，外部 HTTP 000） | **用户在云控制台**放开 5175（及 80）入站 | 记录等待；主机侧无 Alibaba Cloud API 凭证可改，恢复后下一整点复测关闭 R-3002 |
| 2 | cycle-77 人工冒烟（EditorPanel 展开/折叠） | **展开/折叠正常** | **cycle-77 人工冒烟结案** |
| 3 | 预览服务存活保障（systemd） | **批准创建**（属部署脚本变更，按 runbook 第 4 条需人工审批，已获批） | 本轮交付 |
| 4 | 周期频率 | **保持每小时自查** | 不降频、不转事件驱动 |

## 2. 交付：预览服务 systemd 化

**根因**：2026-11-25 20:05 `caddy.service` 重启只拉起 `/etc/caddy/Caddyfile`（80/25504）与 `Caddyfile.preview`（5174/5176），**不含 `Caddyfile.gis`（5175）**；后者与 node API（3001）靠手工 `nohup` 拉起 → 服务重启即掉线，且需下一轮自查才发现。

**改动**（仅新增 2 个 systemd 单元，**无业务代码改动**）：

- `/etc/systemd/system/gis-node.service` — `User=ubuntu`、`WorkingDirectory=/home/ubuntu/cesium-gis-editor`、`Environment=NODE_ENV=production`、`ExecStart=/home/ubuntu/.local/node/bin/node server/index.js`、`Restart=always`、`RestartSec=5`、输出走 journal。
- `/etc/systemd/system/gis-caddy.service` — `/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile.gis`、`WorkingDirectory=/var/lib/caddy`、`Environment=HOME=/var/lib/caddy`、`Restart=always`、`KillMode=mixed`。

`WorkingDirectory`/`HOME=/var/lib/caddy` 为消除 Caddy `$HOME 为空` 告警而设，使存储确定性指向 `/var/lib/caddy/.local/share/caddy`（与证书路径同根）。

**验收（全绿）**

| 检查 | 结果 |
| --- | --- |
| `systemctl is-enabled gis-node gis-caddy` | `enabled` / `enabled`（开机自启） |
| `systemctl is-active gis-node gis-caddy` | `active` / `active` |
| node API 3001 | `HTTP 200` |
| 5175 真实 Host 环回（`--resolve`） | `HTTP 200 2231B` |
| 静态资源 `/cesium/Cesium.js` | `HTTP 200 5,974,765B` |
| **回归：`systemctl restart caddy.service` 后** | 5175 仍 `HTTP 200 2231B`；`:5175` 仍由 gis-caddy 独立 pid 持有（未被 caddy.service 抢占） |
| Caddy `$HOME` 告警 | 已消除 |

端口属主核对：`:3001`=gis-node；`:5175`=gis-caddy；`:5174`/`:5176`=Caddyfile.preview（pid 955，未触碰）；`:80`/`:25504`=caddy.service。

## 3. 观测方法修正（R-3003）

回环探测 `curl -sk https://127.0.0.1:5175/` 返回 `HTTP 200 content-length:0`，**易被误判为掉线**。根因：Caddy 按 Host 路由，`127.0.0.1` 不匹配站点块 `https://129.204.202.173:5175` → 空 200 是 **Host 不匹配假象**，非故障。

**正确探测**：`curl -sk --resolve 129.204.202.173:5175:127.0.0.1 https://129.204.202.173:5175/` → `HTTP 200 2231B`。

佐证（node 访问日志）：11:31:16 与 11:32:20 各仅 1 条 `GET / 200 2231`，而每轮我发了 2 个请求（环回 5175 + 直连 3001）→ 环回 5175 请求从未到达 node，证明其未走 reverse_proxy。

## 4. 门禁说明

仅 systemd 单元与文档改动，`client/`、`server/` 无任何源码改动 → 按 runbook 第 6 条，本轮不触发 lint / 静态扫描 / spec 回归门禁（无被测对象变化）。全量回归基线仍为 172/172 绿（周期 232 起未变）。

## 5. 风险台账增量

- **R-3001**（运维可靠性，中）**resolved**：预览掉线复发隐患 → systemd 双单元 + 重启回归验证通过。
- **R-3002**（外部依赖，中）**open**：公网入站阻断（云侧安全组）；用户在云控制台处理中；每轮复测，恢复即关闭。
- **R-3003**（观测方法，低）**resolved**：回环空 200 误判 → 已给出 `--resolve` 探测式并固化。

## 6. 后续

- 下一整点（12:10，周期 301）：复测公网 `https://129.204.202.173:5175/`。若外部恢复 `HTTP 200` → 关闭 R-3002，并停止逐轮标记该外部观察。
- 进度池仍无未勾选项；P3 `useAiOrchestration`（462 行）按用户先前决定**暂不纳入**；若本轮后池仍空则恢复 skipped 计数。