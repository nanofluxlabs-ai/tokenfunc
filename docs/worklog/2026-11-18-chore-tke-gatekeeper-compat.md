# TKE 部署脚本与清单兼容集群 Gatekeeper 策略

- 日期：2026-11-18
- 分支：main
- PR：
- 关键 commit：

## 背景

新建的 tokenfunc 专用 TKE 集群（cls-jvs144fu，东京）默认启用 Gatekeeper 约束 `psp-automount-serviceaccount-token-pod`：除 kube-system / default 等系统 ns 外，禁止任何 Pod 自动挂载 SA token。实测在 ns `tokenfunc` 起普通 Pod 即被拒绝；按原脚本安装的 ingress-nginx、cert-manager 和网关 Deployment 都会被拦。

## 变更

- `deploy/k8s/manifests/helm/` 新增 ingress-nginx、cert-manager 的 values：Pod 级显式关闭自动挂载，再手动挂同内容的 projected token 到标准路径（策略只检查"未声明且挂在标准路径"或"显式 true"）；关闭 ingress-nginx admission webhook（证书生成 Job 无法挂卷）和 cert-manager startupapicheck。
- `install-ingress.sh`：固定 chart 版本（ingress-nginx 4.15.1、cert-manager v1.21.3），引入上述 values；`helm repo update` 只更新这两个仓库；开头打印目标 context。
- 网关 master / slave Deployment 加 `automountServiceAccountToken: false`（业务不访问 apiserver）。codex2api、crs 仓库同步做了相同修改。

## 验证

- `helm template` 渲染两个 chart：所有 Deployment / DaemonSet 的 Pod 级 `automountServiceAccountToken: false`，token 挂载在 `/var/run/secrets/kubernetes.io/serviceaccount`，无残留 Job。
- `kubeconform -strict` 校验 4 个 Deployment 通过；`bash -n install-ingress.sh` 通过。
- 集群实装结果见后续首次部署记录。

## 遗留

- 关闭 ingress-nginx admission webhook 后，写错的 Ingress 不会在 apply 时被拒绝，需看 controller 日志。
- cert-manager 的 HTTP01 acmesolver Pod 是否满足策略，以首次签证书的实测为准。
