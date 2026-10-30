
# ---- Codex ----
# 在 ~/.codex/config.toml 写入自定义提供方 tokenfunc，密钥放在环境变量 TOKENFUNC_API_KEY

tf_write_codex_config() {
  local dir="$HOME/.codex"
  local file="$dir/config.toml"
  local tmp
  mkdir -p "$dir"
  tf_backup "$file"
  tmp="$(mktemp)"
  {
    # model 与 model_provider 必须在任何 [...] 小节之前，否则会被当成小节字段
    printf 'model = "%s"\nmodel_provider = "tokenfunc"\n\n' "$TF_MODEL"
    if [ -f "$file" ]; then
      # 去掉旧的顶层 model / model_provider 与旧的 tokenfunc 提供方小节，其余原样保留
      awk '
        BEGIN { top = 1; skip = 0 }
        /^[[:space:]]*\[/ {
          top = 0
          skip = ($0 ~ /^[[:space:]]*\[model_providers\.tokenfunc\][[:space:]]*$/)
        }
        top && /^[[:space:]]*(model|model_provider)[[:space:]]*=/ { next }
        !skip { print }
      ' "$file"
    fi
    printf '\n[model_providers.tokenfunc]\nname = "%s"\nbase_url = "%s/v1"\nenv_key = "TOKENFUNC_API_KEY"\nwire_api = "responses"\nrequires_openai_auth = false\n' \
      "$TF_SITE_NAME" "$TF_BASE_URL"
  } | awk '/^[[:space:]]*$/ { if (blank) next; blank = 1; print; next } { blank = 0; print }' >"$tmp"
  mv "$tmp" "$file"
  tf_info "已写入 $file"
}

# 把 TOKENFUNC_API_KEY 写进当前 shell 的启动文件，新开终端即生效
tf_persist_key() {
  local shell_name rc line tmp
  shell_name="$(basename "${SHELL:-}")"
  case "$shell_name" in
  zsh) rc="$HOME/.zshrc" ;;
  bash)
    if [ "$(uname -s)" = Darwin ]; then rc="$HOME/.bash_profile"; else rc="$HOME/.bashrc"; fi
    ;;
  fish) rc="$HOME/.config/fish/config.fish" ;;
  *) rc="$HOME/.profile" ;;
  esac
  if [ "$shell_name" = fish ]; then
    line="set -gx TOKENFUNC_API_KEY \"$TF_KEY\""
  else
    line="export TOKENFUNC_API_KEY=\"$TF_KEY\""
  fi
  mkdir -p "$(dirname "$rc")"
  touch "$rc"
  tmp="$(mktemp)"
  grep -v -E '^[[:space:]]*(export[[:space:]]+TOKENFUNC_API_KEY=|set -gx TOKENFUNC_API_KEY )' "$rc" >"$tmp" || true
  printf '%s\n' "$line" >>"$tmp"
  cat "$tmp" >"$rc"
  rm -f "$tmp"
  tf_info "已把 TOKENFUNC_API_KEY 写入 $rc"
}

tf_info "$TF_SITE_NAME · Codex 一键配置"
tf_read_key
tf_fetch_models
tf_choose_model 'gpt|codex' ' GPT '
tf_ensure_tool codex 'curl -fsSL https://chatgpt.com/codex/install.sh | sh' '@openai/codex'
tf_write_codex_config
tf_persist_key

printf '\n'
tf_info "配置完成：地址 $TF_BASE_URL/v1，默认模型 $TF_MODEL"
tf_info "请新开一个终端再运行 codex（密钥环境变量在新终端才生效），输入 /status 确认 provider 为 tokenfunc"
