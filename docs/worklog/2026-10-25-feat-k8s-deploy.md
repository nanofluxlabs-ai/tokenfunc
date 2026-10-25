# k8s 部署清单与脚本、健康探针、compose 透传保留 / 归档变量

- 日期：2026-10-25
- 分支：feat/k8s-deploy
- PR：#37
- 关键 commit：d8c69f366

## 背景

黑鹰拍板：k8s 清单放 `deploy/k8s/`，参考 tokensolo 的 prod 清单与上层公共清单；做多副本主从；单机 docker 节点类型默认 master。同时解决发版前的硬伤：`compose.yml` 是显式映射，`.env` 里新加的 `DB_LOG_RETENTION_*` / `LOG_ARCHIVE_S3_*` 进不了容器。

## 变更

- 后端：`controller/tokenfunc_health.go` 新增匿名探针 `GET /api/health/live`（进程存活）与 `GET /api/health/ready`（主库 ping + Redis ping，任一失败 503），在 `router/api-router.go` 接线两行，访问令牌路由覆盖测试的豁免表登记。
- compose：`api.environment` 透传 `NODE_TYPE`（`TF_NODE_TYPE`，默认 master）、5 个 `DB_LOG_RETENTION_*`、7 个 `LOG_ARCHIVE_S3_*`（与 `make api` / k8s 同名，不加 `TF_` 前缀）；healthcheck 改打 `/api/health/ready`。`.env.example` 补保留任务变量说明。
- `deploy/k8s/`（照 tokensolo 的目录形状）：`manifests/namespace.yaml`、`clusterissuer.yaml`、`ghcr-secret.yaml.example`、`prod/tokenfunc/{configmap,secret.yaml.example,deployment-master,deployment-slave,service}.yaml`、`prod/ingress/ingress.yaml`；`scripts/{install-ingress,bootstrap,deploy,env-to-k8s}.sh`；README 说明主从拆分、配置分层、首次部署、发版回滚与未接项。
  - master 1 副本 `NODE_TYPE=master` 跑上游定时任务与二开后台任务，不接 Service；slave N 副本 `NODE_TYPE=slave` 接全部流量，软反亲和。
  - ConfigMap 放非敏感项，Secret 放 `SQL_DSN` / `REDIS_CONN_STRING` / `SESSION_SECRET` / `CRYPTO_SECRET` / COS 密钥；`envFrom` 注入；`NODE_NAME` 用 downward API。
  - `terminationGracePeriodSeconds=1830` > `SHUTDOWN_TIMEOUT_SECONDS=1800` + preStop 15s；`/tmp` 挂 emptyDir 给归档临时文件；`LOG_DIR=""` 只打 stdout。
  - `deploy.sh <tag>`：set image master → slave，任一阶段失败自动 undo；`--undo` 回滚。
  - `env-to-k8s.sh`：一份应用变量名的 .env 按敏感键名单拆成 configmap.yaml / secret.yaml。
- `.gitignore` 忽略 `deploy/k8s/manifests/ghcr-secret.yaml` 与 `**/secret.yaml`；`development.md` §6 加 k8s 指引与 master 约定；`/release-standalone` P3 加探针检查。

## 验证

- `GOWORK=off go build ./... && go vet ./controller/ ./router/`：通过；`go test ./router/ -run TestAccessTokenRouteRules`：ok。
- `docker compose --profile app config -q`：通过，渲染结果里 `NODE_TYPE: master`、`DB_LOG_RETENTION_DAYS: "0"`、`LOG_ARCHIVE_S3_BUCKET` 取到 `.env` 值、healthcheck 为 `/api/health/ready`。
- `make api` 后 `curl /api/health/live` → 200 `live=true`；`/api/health/ready` → 200 `ready=true db=true redis=true`。
- `kubeconform -strict`：7 个资源 Valid 6 / Invalid 0 / Skipped 1（ClusterIssuer 为 CRD 无内置 schema）；本机 kubectl 没有可用集群，未做 server 端 dry-run。
- `bash -n` 四个脚本通过；`env-to-k8s.sh` 用临时 env 验证：注释跳过、成对引号去除、含引号值正确转义、带数字的密钥键进 Secret。
- 未在真实 TKE 上 apply（集群未建）。

## 遗留

- `deploy-ghcr.yml` 还只部署单机 docker；切 TKE 时加 job 调 `deploy.sh`（kubeconfig 进 GitHub Secrets），`/release-standalone` 改 kubectl 版本。
- staging 目录与脚本的环境参数化待有 staging 时再加。
- `TRUSTED_PROXIES` 留空走默认信任私网并打启动告警，上集群后按 ingress-nginx Pod CIDR 收紧。
- ClusterIssuer 邮箱填了 support@tokenfunc.com，黑鹰可改。
