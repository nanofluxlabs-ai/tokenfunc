#!/usr/bin/env bash
# tokenfunc 一键配置脚本（macOS / Linux）。由站点按请求生成，站点地址已填好。
# 用法：curl -fsSL <站点地址>/install/<工具>.sh | bash
# 可选环境变量：
#   TOKENFUNC_API_KEY       跳过密钥输入（适合自动化）
#   TOKENFUNC_MODEL         指定默认模型，跳过模型选择
#   TOKENFUNC_SKIP_INSTALL  设为 1 时不自动安装工具，只写配置
set -euo pipefail

TF_BASE_URL="__TF_BASE_URL__"
TF_SITE_NAME="__TF_SITE_NAME__"

tf_info() { printf '\033[32m==>\033[0m %s\n' "$*"; }
tf_warn() { printf '\033[33m[!]\033[0m %s\n' "$*" >&2; }
tf_die() {
  printf '\033[31m[x]\033[0m %s\n' "$*" >&2
  exit 1
}
tf_have() { command -v "$1" >/dev/null 2>&1; }
# 脚本通过管道运行时 stdin 是脚本本身，交互输入必须从终端读
tf_has_tty() { [ -r /dev/tty ] && [ -w /dev/tty ] && : 2>/dev/null </dev/tty; }

tf_read_key() {
  if [ -n "${TOKENFUNC_API_KEY:-}" ]; then
    TF_KEY="$TOKENFUNC_API_KEY"
    tf_info "使用环境变量 TOKENFUNC_API_KEY 中的密钥"
    return
  fi
  tf_has_tty || tf_die "无法读取输入，请先设置环境变量 TOKENFUNC_API_KEY 再运行"
  printf '请粘贴 %s 的 API 密钥（输入时不显示）：' "$TF_SITE_NAME" >/dev/tty
  IFS= read -rs TF_KEY </dev/tty || true
  printf '\n' >/dev/tty
  TF_KEY="$(printf '%s' "$TF_KEY" | tr -d '[:space:]')"
  [ -n "$TF_KEY" ] || tf_die "密钥不能为空。可在 $TF_BASE_URL/keys 创建或复制密钥"
}

# 用 /v1/models 校验地址与密钥（不扣费），同时拿到这把密钥可用的模型
tf_fetch_models() {
  tf_have curl || tf_die "需要 curl"
  local response status body
  response="$(curl -sS --max-time 20 -w '\n%{http_code}' \
    -H "Authorization: Bearer $TF_KEY" "$TF_BASE_URL/v1/models")" ||
    tf_die "无法连接 $TF_BASE_URL，请检查网络或代理"
  status="${response##*$'\n'}"
  body="${response%$'\n'*}"
  case "$status" in
  200) ;;
  401 | 403) tf_die "密钥无效或已停用（HTTP $status），请到 $TF_BASE_URL/keys 检查" ;;
  *) tf_die "校验密钥失败（HTTP $status）" ;;
  esac
  TF_MODELS="$(printf '%s' "$body" | grep -o '"id": *"[^"]*"' | sed 's/^"id": *"//; s/"$//' || true)"
  tf_info "密钥有效"
}

# 选默认模型：$1 为优先匹配的正则，$2 为提示里的系列名
tf_choose_model() {
  if [ -n "${TOKENFUNC_MODEL:-}" ]; then
    TF_MODEL="$TOKENFUNC_MODEL"
    return
  fi
  local candidates count choice
  candidates="$(printf '%s\n' "$TF_MODELS" | grep -Ei "$1" || true)"
  [ -n "$candidates" ] || candidates="$TF_MODELS"
  [ -n "$candidates" ] || tf_die "这把密钥没有可用的模型，请检查密钥分组或联系管理员"
  count="$(printf '%s\n' "$candidates" | wc -l | tr -d ' ')"
  if [ "$count" = 1 ] || ! tf_has_tty; then
    TF_MODEL="$(printf '%s\n' "$candidates" | head -n 1)"
    tf_info "默认模型：$TF_MODEL"
    return
  fi
  printf '\n可用的%s模型：\n' "$2" >/dev/tty
  printf '%s\n' "$candidates" | head -n 30 | awk '{ printf "  %2d. %s\n", NR, $0 }' >/dev/tty
  printf '选择默认模型（输入序号或模型名，直接回车选 1）：' >/dev/tty
  IFS= read -r choice </dev/tty || true
  choice="${choice:-1}"
  case "$choice" in
  *[!0-9]*) TF_MODEL="$choice" ;;
  *) TF_MODEL="$(printf '%s\n' "$candidates" | sed -n "${choice}p")" ;;
  esac
  [ -n "$TF_MODEL" ] || tf_die "选择无效"
  tf_info "默认模型：$TF_MODEL"
}

tf_backup() {
  if [ -s "$1" ]; then
    local backup
    backup="$1.bak.$(date +%Y%m%d%H%M%S)"
    cp "$1" "$backup"
    tf_info "已备份原配置：$backup"
  fi
}

# 安装工具：$1 命令名，$2 官方安装命令，$3 npm 包名
tf_ensure_tool() {
  if tf_have "$1" || [ -x "$HOME/.local/bin/$1" ]; then
    tf_info "已安装 $1"
    return
  fi
  if [ "${TOKENFUNC_SKIP_INSTALL:-}" = 1 ]; then
    tf_warn "未检测到 $1，按 TOKENFUNC_SKIP_INSTALL=1 跳过安装"
    return
  fi
  tf_info "未检测到 $1，正在用官方方式安装…"
  if bash -c "$2"; then
    tf_info "$1 安装完成"
    return
  fi
  if tf_have npm; then
    tf_warn "官方安装脚本失败，改用 npm 安装 $3"
    npm install -g "$3" && return
  fi
  tf_die "$1 安装失败，请按 $TF_BASE_URL/docs 中的手动步骤安装后重新运行本脚本"
}
