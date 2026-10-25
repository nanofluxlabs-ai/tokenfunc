#!/usr/bin/env bash
# 把一份「应用变量名」的 .env（不是 compose 用的 TF_* 那份）渲染成 ConfigMap + Secret 两份 yaml，避免手抄漏项。
# 用法：bash deploy/k8s/scripts/env-to-k8s.sh prod.env [out_dir]
#   敏感键（SECRET_KEYS）进 Secret tokenfunc-api，其余进 ConfigMap tokenfunc-api-config；
#   输出 <out_dir>/configmap.yaml 与 <out_dir>/secret.yaml（后者 git-ignored）。
set -euo pipefail
ENV_FILE="${1:-}"; OUT="${2:-.}"
[ -f "${ENV_FILE}" ] || { echo "用法: bash env-to-k8s.sh <env 文件> [输出目录]"; exit 1; }
SECRET_KEYS="SQL_DSN LOG_SQL_DSN REDIS_CONN_STRING SESSION_SECRET CRYPTO_SECRET LOG_ARCHIVE_S3_ACCESS_KEY LOG_ARCHIVE_S3_SECRET_KEY SMTP_TOKEN"
mkdir -p "${OUT}"
cm="${OUT}/configmap.yaml"; sec="${OUT}/secret.yaml"
{
  printf 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: tokenfunc-api-config\n  namespace: tokenfunc\ndata:\n'
} > "${cm}"
{
  printf 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: tokenfunc-api\n  namespace: tokenfunc\ntype: Opaque\nstringData:\n'
} > "${sec}"
while IFS= read -r line || [ -n "${line}" ]; do
  line="${line%%$'\r'}"
  case "${line}" in ''|'#'*) continue ;; esac
  key="${line%%=*}"; value="${line#*=}"
  key="$(echo "${key}" | tr -d '[:space:]')"
  # 去掉成对引号
  case "${value}" in \"*\") value="${value#\"}"; value="${value%\"}" ;; \'*\') value="${value#\'}"; value="${value%\'}" ;; esac
  escaped="$(printf '%s' "${value}" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  if [[ " ${SECRET_KEYS} " == *" ${key} "* ]]; then
    printf '  %s: "%s"\n' "${key}" "${escaped}" >> "${sec}"
  else
    printf '  %s: "%s"\n' "${key}" "${escaped}" >> "${cm}"
  fi
done < "${ENV_FILE}"
echo "已写出 ${cm} 与 ${sec}（secret.yaml 不要提交）"
