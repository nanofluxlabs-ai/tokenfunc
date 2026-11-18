# 网关从单机迁入 TKE：清单对齐、切换执行与单机发版停用

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

## 切换执行（2026-11-18）

- 20:14:10 停单机 `tokenfunc-api` / `tokenfunc-sub2api`（restart=no）→ pg_dump（tokenfunc 4.98MB、sub2api 9.28MB）→ `kubectl cp` 进迁移 Pod → 清空演练数据后 pg_restore 到 TencentDB PG18。
- 核对：两库逐表行数完全一致（tokenfunc 60 表 / 103,963 行，sub2api 101 表 / 151,666 行），118 个序列都不落后于 max(id)。
- 起 sub2api ×3、网关 master ×1 + slave ×2（同版本 v2026.11.08.1），apply Ingress，旧机器 nginx 改为转发到新 CLB；约 20:18 恢复服务，停机约 4 分钟。
- 冒烟：`/api/status`、`/api/health/ready`（db / redis 均 ok）、`/v1/models` 16 个模型；经 sub2api 渠道的 glm / kimi / MiniMax / gpt-5.6 chat 非流式 + 流式、kimi Anthropic Messages 均 200。
- 网关里 sub2api 渠道的 base_url 是 `http://tokenfunc-sub2api:8080`，正好等于集群内 Service 短名，没有改库。
- `LOG_ARCHIVE_S3_PREFIX` 用 `prod`。
- `/release-standalone` 标记停用：描述加停用标记，正文开头加拦截，被调用时直接停止。Actions（deploy-ghcr.yml）只构建不部署，不会把单机容器拉起来。

## 遗留

- 单机容器只停不删，nginx 继续转发到新 CLB，保留到 2026-11-25 再下线（PG 里还有已下线的 prediroute 库，不要动）。
- 网关尚未配置 codex2api / crs 渠道。
- 在控制台给 TencentDB Redis 配内存告警（实例 1GB，noeviction）。
- 切换时 glm 非流式出现过一次 000（连接中断），重试正常，ingress 日志无非 200，继续观察。
