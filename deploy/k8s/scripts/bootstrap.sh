#!/usr/bin/env bash
# 从零把 tokenfunc 部署到当前 kubectl 指向的集群。只管 K8s 层；PG / Redis / CLB / DNS / COS 桶是人工前置。
# 用法：bash deploy/k8s/scripts/bootstrap.sh [--dry-run]
# 前提：manifests/ghcr-secret.yaml 与 manifests/prod/tokenfunc/secret.yaml 已从 *.example 复制并填好（都 git-ignored）；
#       configmap.yaml 里的 LOG_ARCHIVE_S3_BUCKET 已填真实桶名。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
M="$(cd "$SCRIPT_DIR/../manifests" && pwd)"
NS=tokenfunc
DRY=0
for a in "$@"; do
  case "$a" in
    --dry-run|-n) DRY=1 ;;
    *) echo "用法: bash bootstrap.sh [--dry-run]"; exit 1 ;;
  esac
done
run() { if [ "$DRY" = 1 ]; then echo "  [dry-run] $*"; else "$@"; fi; }
[ "$DRY" = 1 ] && echo "*** DRY-RUN：写操作只打印不执行 ***"

echo "目标集群 context : $(kubectl config current-context)"
if [ "$DRY" != 1 ]; then
  read -r -p "确认部署到此集群? (yes/no): " ans
  [ "$ans" = "yes" ] || { echo "已取消"; exit 1; }
fi

for s in "$M/ghcr-secret.yaml" "$M/prod/tokenfunc/secret.yaml"; do
  [ -f "$s" ] || { echo "✗ 缺少 $s（git-ignored，先从同名 .example 复制并填值）"; exit 1; }
done
if grep -q '<bucket>-<appid>' "$M/prod/tokenfunc/configmap.yaml"; then
  echo "✗ configmap.yaml 的 LOG_ARCHIVE_S3_BUCKET 还是占位符"; exit 1
fi

if kubectl get ds ingress-nginx-controller -n ingress-nginx >/dev/null 2>&1; then
  echo "==> ingress-nginx 已安装，跳过 install-ingress.sh"
else
  echo "==> 安装 ingress-nginx + cert-manager（CLB_ID 环境变量可指定已有 CLB）"
  run bash "$SCRIPT_DIR/install-ingress.sh"
fi

echo "==> namespace / ClusterIssuer / 镜像拉取凭证"
run kubectl apply -f "$M/namespace.yaml"
run kubectl apply -f "$M/clusterissuer.yaml"
run kubectl apply -f "$M/ghcr-secret.yaml"

echo "==> 应用：configmap / secret / service / master / slave"
run kubectl apply -f "$M/prod/tokenfunc/"
for d in tokenfunc-api-master tokenfunc-api-slave; do
  run kubectl rollout status deploy/"$d" -n "$NS" --timeout=300s
done

echo "==> ingress"
run kubectl apply -f "$M/prod/ingress/ingress.yaml"

if [ "$DRY" = 1 ]; then
  echo "*** DRY-RUN 结束 ***"
else
  echo "✓ 完成。DNS 把 tokenfunc.com / www.tokenfunc.com 指到 CLB 后验证："
  echo "    curl -fsS https://tokenfunc.com/api/health/ready"
fi
