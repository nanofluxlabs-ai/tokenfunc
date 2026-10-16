#!/usr/bin/env bash
# 生成上游（QuantumNous/new-api）同步评估清单，输出 markdown 到 stdout。
# 用法：scripts/tokenfunc/upstream-diff.sh <upstream-ref> [base-branch]
# 通常通过 make upstream-diff REF=v1.0.0-rc.N 调用，结果写到 .tmp/upstream/<REF>.md
set -euo pipefail

REF=${1:?用法: upstream-diff.sh <upstream-ref> [base-branch]}
BASE_BRANCH=${2:-main}
TAG_GLOB=${TF_UPSTREAM_TAG_GLOB:-v1.0.0-rc.*}

git rev-parse --verify --quiet "${REF}^{commit}" >/dev/null || { echo "找不到 ${REF}，先 make upstream-fetch" >&2; exit 1; }

base=$(git merge-base "${BASE_BRANCH}" "${REF}")
baseline=$(git describe --tags --match "${TAG_GLOB}" --abbrev=0 "${base}" 2>/dev/null || echo "(无 rc tag)")
count=$(git rev-list --count "${base}..${REF}")
first_date=$(git log --reverse --format=%ad --date=short "${base}..${REF}" | head -1)
last_date=$(git log -1 --format=%ad --date=short "${REF}")

# 二开热点：相对分叉点我们修改过的上游文件；上游也动了的就是潜在冲突面
ours_modified=$(git diff --name-status "${base}" "${BASE_BRANCH}" | awk '$1=="M"{print $2}' | sort)
theirs_changed=$(git diff --name-only "${base}" "${REF}" | sort)
overlap=$(comm -12 <(printf '%s\n' "${ours_modified}") <(printf '%s\n' "${theirs_changed}") | sed '/^$/d' || true)

# git merge-tree 有冲突时退出码为 1，输出第 1 行是树对象，之后到空行为止是冲突文件
conflicts=$( (git merge-tree --write-tree --name-only "${BASE_BRANCH}" "${REF}" 2>/dev/null || true) | sed -n '2,/^$/p' | sed '/^$/d')

# 高风险：数据库 / 依赖 / 迁移 / 中间件 / AGENTS.md 计费读门文件
risk_pattern='^(go\.mod|go\.sum|model/|middleware/|relay/common/relay_info\.go|pkg/billingexpr/|setting/billing_setting/|common/quota_math\.go|types/price_data\.go|relay/request_billing\.go|relay/image_handler\.go|relay/relay_task\.go|relay/helper/price\.go|relay/helper/billing_expr_request\.go|relay/helper/valid_request\.go|service/quota\.go|service/text_quota\.go|service/image_billing\.go|service/tiered_settle\.go|service/task_billing\.go|service/responses_usage\.go|service/log_info_generate\.go)|migration'
risky=$(printf '%s\n' "${theirs_changed}" | grep -E "${risk_pattern}" || true)

count_lines() { if [ -z "$1" ]; then echo 0; else printf '%s\n' "$1" | wc -l | tr -d ' '; fi; }

cat <<MD
# 上游同步评估：${REF}

| 项 | 值 |
|---|---|
| 基线（当前已合入的上游 rc） | ${baseline}（merge-base \`$(git rev-parse --short "${base}")\`） |
| 本次范围 | ${count} 个 commit，${first_date} ~ ${last_date} |
| 真冲突文件 | $(count_lines "${conflicts}") |
| 高风险文件 | $(count_lines "${risky}") |
| 与二开热点重叠的文件 | $(count_lines "${overlap}") |

## 1. 真冲突文件（git merge-tree 预判）

MD
if [ -n "${conflicts}" ]; then printf '%s\n' "${conflicts}" | sed 's/^/- /'; else echo "- 无"; fi

cat <<MD

## 2. 高风险改动（model/、go.mod、迁移、middleware、计费读门文件）

MD
if [ -n "${risky}" ]; then
  printf '%s\n' "${risky}" | while read -r f; do
    echo "- \`${f}\` ← $(git log --format='%h' "${base}..${REF}" -- "${f}" | tr '\n' ' ')"
  done
else
  echo "- 无"
fi

cat <<MD

## 3. 与二开热点重叠（我们改过、上游也改了的文件）

MD
if [ -n "${overlap}" ]; then
  printf '%s\n' "${overlap}" | while read -r f; do
    echo "- \`${f}\` ← $(git log --format='%h' "${base}..${REF}" -- "${f}" | tr '\n' ' ')"
  done
else
  echo "- 无"
fi

cat <<MD

## 4. 上游 commit 清单（逐条填「决定」：接受 / 回退 / 需适配）

| sha | 类型 | 标题 | 决定 | 备注 |
|-----|------|------|------|------|
MD
git log --reverse --format='%h%x09%s' "${base}..${REF}" | awk -F'\t' '{
  type = "other";
  if (match($2, /^[a-z]+(\([^)]*\))?!?:/)) { type = substr($2, 1, RLENGTH); sub(/[(:!].*/, "", type) }
  title = $2; gsub(/\|/, "\\|", title);
  printf "| %s | %s | %s |  |  |\n", $1, type, title
}'
