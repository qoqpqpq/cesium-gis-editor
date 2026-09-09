# SSRF metadata IP 黑名单（周期 12 P2-3 维护）

> 维护说明：周期 12 起由 `scripts/sync-metadata-ips.cjs` 自动同步；每周 cron 拉取新厂商列表。
> 手动编辑：直接修改本文件，sync 脚本仅 dry-run 不会覆盖已写条目。

## AWS

- `169.254.169.254/32` — EC2 IMDSv1/v2 token endpoint
- `169.254.170.2/32` — ECS task metadata v2
- `fd00:ec2::254/128` — EC2 Nitro IPv6 metadata
- `fd00:ec2::253/128` — ECS task metadata v2 IPv6

## GCP

- `169.254.169.254/32` — GCE metadata server
- `metadata.google.internal/32` — DNS alias

## Azure

- `169.254.169.254/32` — Azure Instance Metadata Service

## 通用保留段

- `169.254.0.0/16` — link-local（IMDS 默认）
- `100.64.0.0/10` — CGNAT shared address space
