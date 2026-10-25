#!/usr/bin/env bash
# 发版：按 tag 滚动 master → slave，任一阶段失败自动回滚已滚动的 Deployment。
# 用法：bash deploy/k8s/scripts/deploy.sh v2026.10.25.1 [--image ghcr.io/nanofluxlabs-ai/tokenfunc]
#       bash deploy/k8s/scripts/deploy.sh --undo        # 两个 Deployment 都回退到上一版本
# 零停机：maxUnavailable=0 + terminationGracePeriodSeconds=1830，set image 是平滑滚动，不中断在途请求。
set -euo pipefail
NS=tokenfunc
IMAGE_REPO="ghcr.io/nanofluxlabs-ai/tokenfunc"
CONTAINER=tokenfunc-api
TAG=""
for a in "$@"; do
  case "$a" in
    --undo) echo "==> 回滚 slave → master"
      kubectl rollout undo deploy/tokenfunc-api-slave -n "$NS"
      kubectl rollout status deploy/tokenfunc-api-slave -n "$NS" --timeout=300s
      kubectl rollout undo deploy/tokenfunc-api-master -n "$NS"
      kubectl rollout status deploy/tokenfunc-api-master -n "$NS" --timeout=120s
      exit 0 ;;
    --image=*) IMAGE_REPO="${a#--image=}" ;;
    v*) TAG="$a" ;;
    *) echo "用法: bash deploy.sh <vYYYY.MM.DD.N> [--image=<repo>] | --undo"; exit 1 ;;
  esac
done
[ -n "$TAG" ] || { echo "缺少 tag"; exit 1; }
IMAGE="$IMAGE_REPO:$TAG"
echo "目标集群 context : $(kubectl config current-context)"
echo "镜像             : $IMAGE"
echo "当前 master      : $(kubectl -n "$NS" get deploy tokenfunc-api-master -o jsonpath='{.spec.template.spec.containers[0].image}')"
echo "当前 slave       : $(kubectl -n "$NS" get deploy tokenfunc-api-slave -o jsonpath='{.spec.template.spec.containers[0].image}')"

echo "==> 滚动 master（单副本，跑迁移与后台任务，先于 slave）"
kubectl set image deploy/tokenfunc-api-master "$CONTAINER=$IMAGE" -n "$NS"
if ! kubectl rollout status deploy/tokenfunc-api-master -n "$NS" --timeout=180s; then
  echo "✗ master 滚动失败，回滚 master"; kubectl rollout undo deploy/tokenfunc-api-master -n "$NS"; exit 1
fi
echo "==> 滚动 slave"
kubectl set image deploy/tokenfunc-api-slave "$CONTAINER=$IMAGE" -n "$NS"
if ! kubectl rollout status deploy/tokenfunc-api-slave -n "$NS" --timeout=300s; then
  echo "✗ slave 滚动失败，回滚 slave 与 master"
  kubectl rollout undo deploy/tokenfunc-api-slave -n "$NS"; kubectl rollout undo deploy/tokenfunc-api-master -n "$NS"; exit 1
fi
echo "==> 就绪校验"
kubectl -n "$NS" get pods -l app=tokenfunc-api -o wide
echo "✓ 已滚动到 $IMAGE；对外验证：curl -fsS https://tokenfunc.com/api/status | jq .data.version"
