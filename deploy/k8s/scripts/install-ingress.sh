#!/usr/bin/env bash
# 一键安装 / 修复 ingress-nginx + cert-manager（腾讯云 TKE，Service LoadBalancer 绑定已有 CLB）。
# 用法：CLB_ID=lb-xxxxxxxx bash deploy/k8s/scripts/install-ingress.sh   （CLB_ID 留空则自动新建 CLB）
# 幂等：helm upgrade --install，重跑即修复配置。
set -euo pipefail
CLB_ID="${CLB_ID:-}"

echo "==> 添加 Helm 仓库"
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null
helm repo add jetstack https://charts.jetstack.io >/dev/null
helm repo update >/dev/null

echo "==> 安装 ingress-nginx（DaemonSet，externalTrafficPolicy=Local 保留客户端 IP）"
INGRESS_SET_ARGS=(
  --set controller.kind=DaemonSet
  --set controller.service.type=LoadBalancer
  --set controller.service.externalTrafficPolicy=Local
  # Ingress 用到 configuration-snippet / server-snippet，v1.15+ 需要显式放开
  --set "controller.allowSnippetAnnotations=true"
  --set "controller.config.allow-snippet-annotations=true"
  --set "controller.config.annotations-risk-level=Critical"
  # 流式透传
  --set "controller.config.proxy-buffering=off"
  --set "controller.config.proxy-read-timeout=1800"
  --set "controller.config.proxy-send-timeout=1800"
  # 静态资源压缩在 ingress 层做；types 不含 text/event-stream，SSE 不会被压缩
  --set "controller.config.enable-brotli=true"
  --set "controller.config.brotli-level=6"
  --set "controller.config.brotli-types=text/css application/javascript text/javascript application/json application/xml image/svg+xml font/woff2 application/wasm"
  --set "controller.config.use-gzip=true"
  # 客户端 keepalive 620s，必须低于 CLB 四层监听器空闲超时（900s）
  --set "controller.config.keep-alive=620"
  --set 'controller.config.log-format-upstream=$remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent" $request_length $request_time [$proxy_upstream_name] [$proxy_alternative_upstream_name] $upstream_addr $upstream_response_length $upstream_response_time $upstream_header_time $upstream_status $req_id $host'
)
if [[ -n "$CLB_ID" ]]; then
  echo "    绑定已有 CLB：$CLB_ID"
  INGRESS_SET_ARGS+=(--set "controller.service.annotations.service\\.kubernetes\\.io/tke-existed-lbid=$CLB_ID")
fi
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace "${INGRESS_SET_ARGS[@]}"
kubectl rollout status daemonset/ingress-nginx-controller -n ingress-nginx --timeout=180s

echo "==> 安装 cert-manager（含 CRD）"
helm upgrade --install cert-manager jetstack/cert-manager -n cert-manager --create-namespace --set installCRDs=true
kubectl rollout status deployment/cert-manager -n cert-manager --timeout=120s
kubectl rollout status deployment/cert-manager-webhook -n cert-manager --timeout=120s

echo "==> 完成。CLB 公网 IP（DNS 指向它）："
kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}{"\n"}'
