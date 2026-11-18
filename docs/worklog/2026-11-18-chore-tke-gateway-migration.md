# 网关从单机迁入 TKE：清单对齐单机生产配置

- 日期：2026-11-18
- 分支：main
- PR：
- 关键 commit：

## 背景

网关与 sub2api 要和 codex2api / crs 一起迁入 tokenfunc 专用 TKE 集群（cls-jvs144fu），切换手册在工作区根仓库 `docs/runbooks/2026-11-tke-cutover-gateway-sub2api.md`。迁移前逐项比对了单机生产容器的环境变量和 nginx 配置与 TKE 清单。

## 变更

- `configmap.yaml`：
  - `LOG_ARCHIVE_S3_BUCKET` 填真实桶 `tokenfunc-1313535897`。
  - `TRUSTED_PROXIES` 从留空（信任全部私网）收紧为集群 VPC 网段 `192.168.0.0/16`；单机生产原来是 docker 网段 `172.16.0.0/12`。
- `ingress.yaml`：`proxy-body-size` 从 50m 改为 200m，与单机 nginx 的 `client_max_body_size 200m` 一致，避免迁移后大请求体被 413。

## 验证

- 单机生产 `docker inspect tokenfunc-api` 的非敏感环境变量与 configmap 逐项比对。差异只剩以下几项，都在预期内：
  - 文件日志相关的 `LOG_MAX_*` / `LOG_RETENTION_DAYS`：k8s 不写文件。
  - `NODE_TYPE`：由 Deployment 设置。
  - TKE 侧新增的连接池和停机超时参数。
  - `LOG_ARCHIVE_S3_PREFIX`：单机是 `local`，清单是 `prod`，待用户决定。
- 确认 v2026.11.08.1 已包含探针用的 `/api/health/live`、`/api/health/ready`，迁移可直接沿用线上版本。

## 遗留

- `LOG_ARCHIVE_S3_PREFIX` 待定。
- 切换执行结果补在本条目。
