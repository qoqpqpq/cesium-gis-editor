# Cloud Metadata IP Blacklist 维护

> **背景**: 周期 4 P0-1 + 周期 5 P0-1 持续维护。云厂商的元数据 endpoint 即使位于
> link-local（169.254/16）或 unique-local（fd00::/8）IP 段，仍应被显式黑名单——这
> 是"默认拒绝"安全姿态的核心。
>
> **维护 SLA**: 每季度由 security-team 复查本表与 IANA / 云厂商公告同步。

## 1. 黑名单（程序中使用）

### IPv4

| IP | 厂商 / 服务 | 端口 | 备注 |
| -- | ----------- | ---- | ---- |
| `169.254.169.254` | AWS / GCP / Azure / OpenStack IMDS | 80 | IMDSv1 + IMDSv2 token endpoint |
| `169.254.170.2` | AWS ECS task metadata v2 | 80 | |
| `169.254.170.1` | AWS ECS task metadata v1 | 80 | |
| `169.254.0.1` | 部分 K8s 服务 | 10250 | kubelet API（非 metadata 但同段） |

### IPv6

| IP | 厂商 / 服务 | 端口 | 备注 |
| -- | ----------- | ---- | ---- |
| `fd00:ec2::254` | AWS EC2 Nitro IPv6 IMDS | 80 | |
| `fd00:ec2::253` | AWS ECS task metadata v2 IPv6 | 80 | **周期 5 P0-1 新增** |
| `fe80::a9f:feff:fecf:3c` | 旧 IMDS IPv6 | 80 | |

## 2. 已废弃（曾经加入但当前不再使用）

| IP | 原因 |
| -- | ---- |
| `2600:2d00:1:7000::a` | 调研阶段考虑加入（GCP IPv6 metadata），最终未确认 cloud-metadata.com 实际使用 |

## 3. 维护流程

### 3.1 季度 cron 任务

```bash
# 季度 1 月 1 日 / 4 月 1 日 / 7 月 1 日 / 10 月 1 日
node tests/specs/metadata-ip-maintenance.cjs
```

该 spec 会：
- 验证黑名单表与本文件一致
- 跑 `dns.resolve4/6` 对当前已知 metadata 主机（`metadata` / `metadata.google.internal`）确认 IP 仍有效
- 检查 `isMetadataIp` 实现对所有表内 IP 返回 true
- 失败则提示更新黑名单

### 3.2 新增 / 删除 IP 的步骤

1. 调研新 metadata IP（建议来源：<https://cloud-metadata.com> 或各厂商官方文档）
2. 改 `server/services/ssrf-guard.js` 的 `METADATA_IPS_V4` / `METADATA_IPS_V6` Set
3. 同步改本文件"黑名单"表
4. 跑 `tests/specs/ssrf-metadata-ipv6.cjs` + `tests/specs/metadata-ip-maintenance.cjs` 验证

### 3.3 监控 / 告警

- 任何**新增**的 IP 必须附 commit message 引用 source URL
- 任何**删除**的 IP 必须附 commit message 说明"被云厂商弃用 / 移到新段"

## 4. 威胁模型

### 4.1 攻击场景

1. **SSRF 直接读 metadata**：攻击者提交 `https://attacker-controlled.com/redirect-to-169.254.169.254`
   - 周期 3 P0-1 防御：safeFetch redirect:'manual' 拒绝跟随
   - 周期 4 P0-1 强化：isMetadataIp 显式拒 + pin IP
2. **DNS rebinding 抢跑**：校验时解析到公网 IP，fetch 时 DNS 抢换到 169.254.169.254
   - 周期 4 P0-1 防御：safeFetch 二次解析 + Host allowlist
3. **白名单主机被劫持**：白名单 `api.openai.com` DNS 解析到 169.254.169.254
   - 周期 4 P0-1 防御：isMetadataIp 显式黑名单

### 4.2 残余风险

- **未知 metadata IP**：新云厂商 / 私有云 metadata IP 未在本表
- **IPv6 link-local 段大量 IP**：fe80::/10 我们用 classifyIp 拒，但未全列
- **可写 metadata**：GCP metadata server 允许自定义 SSH keys 等

## 5. 参考链接

- OWASP SSRF Prevention Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html>
- AWS IMDS 文档: <https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instancedata-data-retrieval.html>
- AWS Nitro Enclaves IPv6 IMDS: <https://docs.aws.amazon.com/enclaves/latest/user/nitro-enclave-concepts.html>
- Cloud Metadata IP 社区维护: <https://cloud-metadata.com>
- IANA Special-Purpose Address Registry: <https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml>
