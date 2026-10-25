# tokenfunc 在 Kubernetes（腾讯云 TKE）上的部署

```
deploy/k8s/
├── manifests/
│   ├── namespace.yaml              集群级，只装一次
│   ├── clusterissuer.yaml          Let's Encrypt（cert-manager）
│   ├── ghcr-secret.yaml.example    GHCR 拉取凭证模板 → 复制为 ghcr-secret.yaml（git-ignored）
│   └── prod/
│       ├── tokenfunc/
│       │   ├── configmap.yaml      非敏感配置（入库）
│       │   ├── secret.yaml.example 敏感配置模板 → secret.yaml（git-ignored）
│       │   ├── deployment-master.yaml  1 副本，NODE_TYPE=master
│       │   ├── deployment-slave.yaml   N 副本，NODE_TYPE=slave
│       │   └── service.yaml        只选 slave
│       └── ingress/ingress.yaml    tokenfunc.com / www
└── scripts/
    ├── install-ingress.sh          ingress-nginx + cert-manager（helm，幂等）
    ├── bootstrap.sh                从零拉起全套（有 --dry-run）
    ├── deploy.sh                   发版：set image master → slave，失败自动 undo；--undo 回滚
    └── env-to-k8s.sh               一份 .env → configmap.yaml + secret.yaml
```

## 主从为什么拆成两个 Deployment

上游 new-api 用 `NODE_TYPE` 区分：master 跑渠道自动更新、订阅额度重置、系统任务、认证清理等定时任务，这些没有分布式锁，多副本都当 master 会重复执行。二开的三个后台任务（授信账期、logs 预聚合、logs 归档）带 Redis 锁，slave 上不会重复跑。

- `tokenfunc-api-master`：固定 1 副本，不接 Service 流量，升级时先滚它（跑迁移）。
- `tokenfunc-api-slave`：接全部 API 流量，副本数按负载调；软反亲和分散节点。
- 单机 docker 只有一个实例，compose 默认 `NODE_TYPE=master`。

## 配置

- 变量名在 `make api`、compose、k8s 三处一致（上游变量名 + 二开的 `DB_LOG_RETENTION_*` / `LOG_ARCHIVE_S3_*`），compose 那份 `.env` 的 `TF_*` 只是 compose 模板用的中间名。
- ConfigMap 放非敏感项；Secret 放 `SQL_DSN` / `REDIS_CONN_STRING` / `SESSION_SECRET` / `CRYPTO_SECRET` / COS 密钥。`SESSION_SECRET` 所有副本必须一致。
- 两者都是 env 注入，改完 `kubectl apply` 还要 `kubectl rollout restart deploy/tokenfunc-api-master deploy/tokenfunc-api-slave -n tokenfunc` 才生效。
- 日志：`LOG_DIR=""` 只打 stdout（JSON），由 CLS 采集；容器内不写文件。
- 归档临时文件写 `/tmp`（emptyDir），按单日最大 csv.gz 预留。

## 首次部署

1. 人工前置：PaaS PostgreSQL（建库 `tokenfunc`，`search_path=public`）、Redis、CLB、COS 桶（名字带 `-APPID`）与只写子账号、DNS。
2. 复制并填好 `manifests/ghcr-secret.yaml`、`manifests/prod/tokenfunc/secret.yaml`；把 `configmap.yaml` 的 `LOG_ARCHIVE_S3_BUCKET` 换成真实桶名。
3. `CLB_ID=lb-xxxx bash deploy/k8s/scripts/bootstrap.sh --dry-run` 看一遍，再去掉 `--dry-run` 执行。
4. DNS 指到 CLB 公网 IP，`curl -fsS https://tokenfunc.com/api/health/ready`。

从单机 docker 迁移时：先把 PG 数据迁到 PaaS（pg_dump / DTS），Redis 可空库起（丢失的只是缓存与限流计数），切 DNS 前把 docker 侧的 API 停掉，避免两边同时跑 master 任务。

## 发版与回滚

- 发版：`bash deploy/k8s/scripts/deploy.sh v2026.10.25.1`（镜像由 `deploy-ghcr.yml` 在打 tag 时构建）。
- 回滚：`bash deploy/k8s/scripts/deploy.sh --undo`。
- 探针：`/api/health/live`（进程活着）/ `/api/health/ready`（DB + Redis 可用），readiness 失败会把 Pod 摘出 Service。
- `kubectl apply -f deployment-*.yaml` 之前先核对线上 tag，文件里的 `image:` 不会自动跟随发版。

## 还没接的

- `deploy-ghcr.yml` 目前只部署到单机 docker；切到 TKE 后加一个 job 调 `deploy.sh`（需要把 kubeconfig 放进 GitHub Secrets），`/release-standalone` 技能同步改成 kubectl 版本。
- staging 环境：复制 `manifests/prod` 为 `manifests/staging` 改域名与 Secret 即可，脚本按目录参数化时再加。
