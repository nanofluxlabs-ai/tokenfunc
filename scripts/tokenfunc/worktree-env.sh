#!/usr/bin/env bash
# worktree 隔离环境：每个 git worktree 领一个 slot（主 checkout 固定 0），
# 由 slot 与 worktree 名派生 PG schema / Redis db / 端口，写入该 worktree 自己的 .env。
# 由 make wt-init / wt-clean / wt-list / wt-env 调用，约定见 docs/tokenfunc/development.md §4.7
set -euo pipefail

# 与 compose.yml 里 redis --databases 64 对应：每个环境占 2 个 db，0/1 留给主 checkout
MAX_SLOT=31
API_PORT_BASE=${TF_WT_API_PORT_BASE:-3000}
WEB_PORT_BASE=${TF_WT_WEB_PORT_BASE:-5173}
ENV_MARK='# ---- worktree 隔离参数（make wt-init 生成，勿手改；重跑 wt-init 会刷新）----'
MANAGED_KEYS='TF_WORKTREE|TF_WORKTREE_SLOT|TF_DEV_SCHEMA|TF_TEST_SCHEMA|TF_DEV_REDIS_DB|TF_TEST_REDIS_DB|TF_API_PORT|TF_WEB_PORT'

usage() {
  cat <<'EOF'
用法: worktree-env.sh <init|clean|list|env>
  init   领 slot、生成本 worktree 的 .env、起库建 schema、bun install（NAME= 可指定）
  clean  停 API、删 schema、清 redis db、释放 slot（在主 checkout 上用 NAME= 清理已删掉的 worktree）
  list   列出所有登记过的 worktree 及其端口 / schema，标出目录已不存在的孤儿
  env    打印本 worktree 的隔离参数
EOF
}

die() { echo "wt: $*" >&2; exit 1; }

toplevel=$(git rev-parse --show-toplevel)
main_root=$(git worktree list --porcelain | awk 'NR==1 && $1=="worktree" {print $2}')
[ -n "$main_root" ] || die "无法确定主 checkout 路径"
registry_dir="$main_root/.tmp"
registry="$registry_dir/worktree-slots.tsv"
lock_dir="$registry_dir/worktree-slots.lock"
compose=(docker compose -f "$main_root/compose.yml" --project-directory "$main_root")

slug_of() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/_/g; s/^_+//; s/_+$//' | cut -c1-40
}

# 解析目标 worktree 名：NAME= 优先；否则取当前 worktree 目录名；主 checkout 上必须显式给 NAME
resolve_name() {
  if [ -n "${NAME:-}" ]; then
    printf '%s' "$NAME"
  elif [ "$toplevel" != "$main_root" ]; then
    basename "$toplevel"
  else
    die "当前是主 checkout（slot 0，不需要隔离参数）；要操作某个 worktree 请加 NAME=<worktree 名>"
  fi
}

with_lock() {
  mkdir -p "$registry_dir"
  local i=0
  until mkdir "$lock_dir" 2>/dev/null; do
    i=$((i + 1))
    [ "$i" -le 100 ] || die "锁 $lock_dir 超过 10 秒未释放；确认没有别的 wt-init / wt-clean 在跑后可手动删除"
    sleep 0.1
  done
  trap 'rmdir "$lock_dir" 2>/dev/null || true' EXIT
}

registry_slot() {
  [ -f "$registry" ] || return 0
  awk -F'\t' -v n="$1" '$1 == n {print $2; exit}' "$registry"
}

port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

# 分配最小空闲 slot；已登记则沿用。端口被别的进程占着的 slot 跳过（宿主机上可能有无关服务）
alloc_slot() {
  local name=$1 slot
  slot=$(registry_slot "$name")
  if [ -n "$slot" ]; then printf '%s' "$slot"; return; fi
  touch "$registry"
  local n=1
  while [ "$n" -le "$MAX_SLOT" ]; do
    if awk -F'\t' -v s="$n" '$2 == s {found=1} END {exit !found}' "$registry"; then
      n=$((n + 1)); continue
    fi
    if port_busy "$((API_PORT_BASE + n))" || port_busy "$((WEB_PORT_BASE + n))"; then
      echo "wt: slot $n 的端口 $((API_PORT_BASE + n)) / $((WEB_PORT_BASE + n)) 已被占用，跳过" >&2
      n=$((n + 1)); continue
    fi
    printf '%s\t%s\n' "$name" "$n" >>"$registry"
    printf '%s' "$n"
    return
  done
  die "slot 已用完（上限 $MAX_SLOT），先 make wt-list 找孤儿并 make wt-clean NAME= 释放"
}

release_slot() {
  [ -f "$registry" ] || return 0
  local tmp
  tmp=$(mktemp)
  awk -F'\t' -v n="$1" '$1 != n' "$registry" >"$tmp" && mv "$tmp" "$registry"
}

# 活跃 worktree 目录名列表（不含主 checkout）
active_names() {
  git worktree list --porcelain | awk -v main="$main_root" '$1 == "worktree" && $2 != main {n = split($2, p, "/"); print p[n]}'
}

print_card() {
  local name=$1 slot=$2 slug
  slug=$(slug_of "$name")
  cat <<EOF
worktree   $name   (slot $slot)
  API        http://127.0.0.1:$((API_PORT_BASE + slot))
  前端       http://localhost:$((WEB_PORT_BASE + slot))   （代理到上面的 API）
  PG schema  dev_$slug / test_$slug
  Redis db   $((slot * 2)) / $((slot * 2 + 1))
EOF
}

write_env() {
  local name=$1 slot=$2 slug base out tmp
  slug=$(slug_of "$name")
  out="$toplevel/.env"
  if [ -f "$main_root/.env" ]; then base="$main_root/.env"; else base="$toplevel/.env.example"; fi
  tmp=$(mktemp)
  # 以主 checkout 的 .env 为底（带 COS 凭据等本地配置），剔除由 slot 接管的键与旧的隔离块
  awk -v mark="$ENV_MARK" -v keys="^($MANAGED_KEYS)=" '
    $0 == mark {skip = 1; next}
    skip && /^# ---- end worktree ----$/ {skip = 0; next}
    skip {next}
    $0 ~ keys {next}
    {print}
  ' "$base" >"$tmp"
  {
    printf '\n%s\n' "$ENV_MARK"
    printf 'TF_WORKTREE=%s\n' "$name"
    printf 'TF_WORKTREE_SLOT=%s\n' "$slot"
    printf 'TF_DEV_SCHEMA=dev_%s\n' "$slug"
    printf 'TF_TEST_SCHEMA=test_%s\n' "$slug"
    printf 'TF_DEV_REDIS_DB=%s\n' "$((slot * 2))"
    printf 'TF_TEST_REDIS_DB=%s\n' "$((slot * 2 + 1))"
    printf 'TF_API_PORT=%s\n' "$((API_PORT_BASE + slot))"
    printf 'TF_WEB_PORT=%s\n' "$((WEB_PORT_BASE + slot))"
    printf '# ---- end worktree ----\n'
  } >>"$tmp"
  mv "$tmp" "$out"
}

cmd_init() {
  local name slot
  name=$(resolve_name)
  [ "$toplevel" != "$main_root" ] || die "wt-init 只在 worktree 目录里执行"
  [ "$(basename "$toplevel")" = "$name" ] || die "NAME=$name 与当前 worktree 目录 $(basename "$toplevel") 不一致"
  with_lock
  slot=$(alloc_slot "$name")
  write_env "$name" "$slot"
  rmdir "$lock_dir" 2>/dev/null || true
  trap - EXIT
  echo ".env 已生成: $toplevel/.env"
  make -C "$toplevel" --no-print-directory infra
  (cd "$toplevel/web" && bun install)
  print_card "$name" "$slot"
  local orphans
  orphans=$(cmd_list | awk '$NF == "孤儿" {print $1}')
  [ -z "$orphans" ] || echo "提示：注册表里有目录已不存在的 worktree（$(echo "$orphans" | tr '\n' ' ')），用 make wt-clean NAME=<名> 释放"
}

cmd_clean() {
  local name slot slug
  name=$(resolve_name)
  slug=$(slug_of "$name")
  [ -n "$slug" ] || die "worktree 名 $name 无法派生 schema 名"
  case "$slug" in dev|test|public) die "拒绝清理保留 schema $slug" ;; esac
  slot=$(registry_slot "$name")
  if [ "$toplevel" != "$main_root" ] && [ "$(basename "$toplevel")" = "$name" ]; then
    make -C "$toplevel" --no-print-directory api-stop
  fi
  if "${compose[@]}" ps --status running postgres >/dev/null 2>&1 && [ -n "$("${compose[@]}" ps -q --status running postgres)" ]; then
    "${compose[@]}" exec -T -e PGOPTIONS="-c client_min_messages=warning" postgres \
      psql -v ON_ERROR_STOP=1 -U "${TF_PG_USER:-tokenfunc}" -d "${TF_PG_DB:-tokenfunc}" \
      -c "DROP SCHEMA IF EXISTS \"dev_$slug\" CASCADE;" -c "DROP SCHEMA IF EXISTS \"test_$slug\" CASCADE;" >/dev/null
    echo "已删除 schema dev_$slug / test_$slug"
    if [ -n "$slot" ]; then
      "${compose[@]}" exec -T redis redis-cli -n "$((slot * 2))" FLUSHDB >/dev/null
      "${compose[@]}" exec -T redis redis-cli -n "$((slot * 2 + 1))" FLUSHDB >/dev/null
      echo "已清空 redis db $((slot * 2)) / $((slot * 2 + 1))"
    fi
  else
    echo "postgres / redis 未运行，跳过删 schema 与清 redis（下次 make infra 后可再 make wt-clean NAME=$name 补清）"
  fi
  if [ -n "$slot" ]; then
    with_lock
    release_slot "$name"
    echo "已释放 slot $slot"
  else
    echo "注册表里没有 $name，无需释放 slot"
  fi
}

cmd_list() {
  [ -f "$registry" ] && [ -s "$registry" ] || { echo "（没有登记过的 worktree）"; return 0; }
  local active
  active=$(active_names)
  printf '%-32s %-5s %-6s %-6s %-9s %-40s %s\n' NAME SLOT API WEB REDIS SCHEMA 状态
  while IFS=$'\t' read -r name slot; do
    [ -n "$name" ] || continue
    local state=活跃 slug
    slug=$(slug_of "$name")
    grep -qxF "$name" <<<"$active" || state=孤儿
    printf '%-32s %-5s %-6s %-6s %-9s %-40s %s\n' "$name" "$slot" "$((API_PORT_BASE + slot))" "$((WEB_PORT_BASE + slot))" \
      "$((slot * 2))/$((slot * 2 + 1))" "dev_$slug / test_$slug" "$state"
  done <"$registry"
}

cmd_env() {
  local name slot
  name=$(resolve_name)
  slot=$(registry_slot "$name")
  [ -n "$slot" ] || die "$name 尚未登记，先 make wt-init"
  print_card "$name" "$slot"
}

case "${1:-}" in
  init) cmd_init ;;
  clean) cmd_clean ;;
  list) cmd_list ;;
  env) cmd_env ;;
  *) usage; exit 1 ;;
esac
