---
name: release-standalone
description: >-
  一键发版 tokenfunc 到单机 docker 生产环境（ssh tokenfunc，/opt/tokenfunc，域名 tokenfunc.com）：
  前置检查 → 打 tag → GitHub Actions 构建镜像并 SSH 部署 → 健康验证 → 冒烟测试 → 部署后监控 → 发布报告。
  当用户要"发版 / 发布 / 部署 tokenfunc 到生产 / 打 tag 上线"时使用。tag 可选，缺省按 vYYYY.MM.DD.N 自动推算。
  上 TKE 集群后另做 release-tke，本 skill 只覆盖 docker compose 单机形态。
# 仅人工手动触发（/release-standalone），禁止模型自动调用——发版为高副作用操作。
disable-model-invocation: true
argument-hint: "[tag]"
# 最小权限：发版只需要 git/gh/ssh/curl/make/go 与读写报告、询问确认。
allowed-tools:
  - Bash(git *)
  - Bash(gh *)
  - Bash(ssh *)
  - Bash(scp *)
  - Bash(curl *)
  - Bash(make *)
  - Bash(go *)
  - Bash(date *)
  - Bash(jq *)
  - Bash(cd *)
  - Bash(sleep *)
  - Read
  - Write
  - Edit
  - AskUserQuestion
  - ScheduleWakeup
---

# tokenfunc 单机 docker 一键发版

流程：`P1 前置检查 → P2 打 tag 等 Actions 构建镜像 → P2.5 SSH 部署到生产机（docker compose） → P3 部署验证 → P4 冒烟测试 → P5 事故响应（仅异常） → P6 部署后监控 → 发布报告`。

TKE 集群发版走 `/release-tke`；两条路线互不触发，Actions 只构建镜像。

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `tag` | 否 | 缺省自动推算下一个版本号，格式 `vYYYY.MM.DD.N`（当日序号）。 |

调用示例：`/release-standalone`、`/release-standalone v2026.10.10.2`。

## ⚠️ 授权与约束

- **不自动 `git commit`**：预检发现未提交改动，用 `AskUserQuestion` 问用户是否提交及 commit message；tag / push / 部署属发版核心，用户调用即视为授权。
- 生产只有一套（tokenfunc.com），没有 staging，所以 **P1 必须弹窗二次确认**。
- 本流程只动 `tokenfunc-api` 容器，**禁止** `docker compose down`、重启 `tokenfunc-postgres`（数据卷挂在它身上，重启等于全站中断）、改 `compose.override.yml`。
- 平时对生产机是只读约束；本流程内的 `docker compose up`（回滚）与 `.env` 里 `TF_API_IMAGE` 一行的修改被授权，不扩展到其他场景。

## 🚨 致命红线（高于所有 Phase）

P3 部署验证或 P4 冒烟中出现以下任一情况，**立即回滚止血**（命令见 P5）：

- panic（`new_api_panic` / `runtime error` / `nil pointer dereference`）
- 容器反复 Restarting / unhealthy，或 `docker compose up --wait` 超时
- 5xx 高频出现（不是 1-2 个偶发）
- 健康检查持续失败 / 关键接口完全不可用

**恢复前严禁**：拉栈分析、grep 源码、读 commit diff、解释根因、"再试一次看看"。

**正确顺序**：1. 回滚 → 2. 真实请求复测 200 且日志无 panic → 3. 进入 P5 分析。证据（容器日志、GHCR 镜像）回滚后照样在，每多分析一分钟就是多一分钟全量挂掉。

---

## 进度面板格式

每个 Phase **开始前**和**完成后**各输出一次：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 tokenfunc 发版进度  <tag>  [prod · docker]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ✅ P1  前置检查        完成
 🔄 P2  镜像构建        进行中（约 6 分钟）
 ⬜ P2.5 SSH 部署       等待
 ⬜ P3  部署验证        等待
 ⬜ P4  功能冒烟测试    必做
 ⬜ P5  事故响应        仅异常时触发
 ⬜ P6  部署后监控      约 6 分钟异步（6 轮 × 60s）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

`✅` 完成 · `🔄` 进行中 · `⬜` 等待 · `❌` 失败/中止 · `⚠️` 跳过。tag 确认前写 `待定`。

---

## 服务参数

| 项 | 值 |
|----|-----|
| GitHub repo | `nanofluxlabs-ai/tokenfunc`，分支 `main` |
| tag 格式 | `vYYYY.MM.DD.N` |
| 构建 workflow | `.github/workflows/deploy-ghcr.yml`（名 `Build & Deploy (GHCR)`）：推 `v*` tag → 构建推 GHCR 并移动 `:latest`；推 main → 只构建 `main-<date>-<sha>` 镜像。**不部署**，部署由本 skill P2.5 通过 SSH 完成 |
| 镜像 | `ghcr.io/nanofluxlabs-ai/tokenfunc:<tag>`（发版同时移动 `:latest`） |
| 生产机 | `ssh tokenfunc`（用户 ubuntu），目录 `/opt/tokenfunc`，文件 `compose.yml` + `.env` + `compose.override.yml`（后者不在仓库） |
| 容器 | `tokenfunc-api`（profile `app`）、`tokenfunc-postgres`、`tokenfunc-redis` |
| 当前镜像 | `ssh tokenfunc "docker inspect -f '{{.Config.Image}}' tokenfunc-api"`，与 `.env` 里 `TF_API_IMAGE` 一致（P2.5 会改写） |
| 健康 URL | `https://tokenfunc.com/api/status`（`success:true`，`data.version` 即镜像 tag） |
| 容器访问日志 | `docker logs tokenfunc-api` 的 `[GIN]` 行：`\| 状态码 \| 耗时 \| 客户端 IP \| 方法 路径`；panic 行含 `new_api_panic` |
| 冒烟 token 环境变量 | `TOKENFUNC_SMOKE_API_KEY`（`sk-` 开头的 API 令牌，可在 `.claude/settings.local.json` 的 env 预配置） |

---

## Phase 1 — 前置检查

**开始时**输出进度面板（P1 🔄，其余 ⬜，tag=待定）。

### Step 1.0 — 生产二次确认

用 `AskUserQuestion`：

```
question: "即将发布到生产环境 tokenfunc.com（唯一环境，无 staging），请再次确认"
header: "⚠️ 生产发版确认"
options:
  - label: "确认，发布到生产"
    description: "线上流量将切到新版本"
  - label: "取消"
    description: "中止本次发版"
```

### Step 1.1 — 代码预检

每一步失败立即停止，不跳过：

```bash
cd /Users/yangxin/Documents/code/projects/ai/tokenfunc
git branch --show-current          # 必须是 main，否则询问用户
git fetch origin && git pull --ff-only origin main
git fetch --tags                   # 本地 tag 可能落后，不拉会推错版本号
git status --short                 # 非空 → AskUserQuestion 询问是否提交（不自动 commit）
GOWORK=off go build ./...
make test-db PKG='-count=1 ./model/ ./service/ ./middleware/ ./controller/ ./logger/' 2>&1 | grep -E "^(ok|FAIL|--- FAIL)"
```

> `make test-db` 会自动起本地 docker 基础设施并注入 `TEST_POSTGRES_DSN`，企业模块（`ent_*`）的 PG 测试只在这里跑得到。`controller/` 必须覆盖——relay 链路里的 nil 指针一上线就是 100% 流量挂掉。

**测试失败处理**：
1. `go test ./xxx/ -run <TestName> -v -count=1` 看性质：**断言陈旧**（上游用例与二开默认值冲突、模型列表变化等）→ 直接改测试与代码对齐；**业务代码新引入** → ❌ 停止，报告用户。
2. 已知偶发：`TestSecurityAccountDeletionConcurrentRequestsHaveOneWinner` 在上游 main 也偶发失败，复跑一次通过即可。
3. `go test ... | grep` 输出为空 **≠** 全绿，先看原始输出确认确实有 `ok` 行。

**pull 冲突**：不确定的冲突立即停止，把冲突文件与段落列给用户确认解法；带未解决冲突或脏工作树绝不打 tag。

### Step 1.2 — 确定 tag

```bash
git tag --sort=-creatordate | grep -E '^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$' | head -1
```

`vYYYY.MM.DD.N`：日期取今天（`date +%Y.%m.%d`），N = 今天已有 tag 的最大序号 +1，没有则 1。用户指定 tag 则直接用。

未指定 tag 时用 `AskUserQuestion` 确认版本号（选项：推算值（推荐）/ 自定义）。

### Step 1.3 — 记录回滚目标

```bash
ssh tokenfunc "docker inspect -f '{{.Config.Image}}' tokenfunc-api; grep '^TF_API_IMAGE=' /opt/tokenfunc/.env"
```

把当前镜像记为 `PREV_IMAGE`，写进本次发版的工作记录（P5 回滚要用）。

**完成后**输出进度面板（P1 ✅，P2 🔄，tag 替换为实际值）。

---

## Phase 2 — 打 tag，Actions 构建镜像

**开始时**输出进度面板。

```bash
# 两条都必须满足，否则停止
[ -z "$(git status --short)" ] || { echo "❌ 工作区不干净，中止"; exit 1; }
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || git push origin main

git tag <tag>
git push origin <tag>              # 触发 Build & Deploy (GHCR) 的 build job（只构建推 GHCR）
```

找到由该 tag 触发的 run 并**轮询**到结束（不要 `gh run watch | tail`，管道会吞掉 gh 的网络错误变假成功）：

```bash
sleep 20
RUN_ID=$(gh run list -R nanofluxlabs-ai/tokenfunc --workflow deploy-ghcr.yml --branch <tag> --limit 1 --json databaseId --jq '.[0].databaseId')
# 每 60s 查一次，直到 status=completed；以 conclusion 为准
gh run view -R nanofluxlabs-ai/tokenfunc $RUN_ID --json status,conclusion,jobs \
  --jq '"\(.status) \(.conclusion) | " + ([.jobs[] | "\(.name)=\(.status)/\(.conclusion)"] | join(", "))'
```

> 查询偶发 `Post ... EOF`（网络抖动）：重试即可，不要当失败。`gh pr merge` 也会这样，合并后要用 `gh pr view --json state` 确认。

- `Build & push image` 失败 → 停止，报告构建日志（`gh run view -R nanofluxlabs-ai/tokenfunc $RUN_ID --log-failed`），不部署。
- `completed/success` 后隔 15 秒再查一次双确认，再进 P2.5。

构建约 5-6 分钟。**完成后**输出进度面板（P1-P2 ✅，P2.5 🔄）。

---

## Phase 2.5 — SSH 部署到生产机

**开始时**输出进度面板。以下即原 Actions deploy job 的步骤，改在本机执行（`ssh tokenfunc` 已配好别名与密钥）：

```bash
IMAGE=ghcr.io/nanofluxlabs-ai/tokenfunc:<tag>

# 1. 生产机登录 GHCR（镜像私有时才需要；令牌经 stdin，不落命令行）
gh auth token | ssh tokenfunc "docker login ghcr.io -u $(gh api user --jq .login) --password-stdin"

# 2. 同步 compose.yml：先与生产机的 .env / override 一起校验，通过才替换，旧文件留 compose.yml.prev
scp compose.yml tokenfunc:/opt/tokenfunc/compose.yml.new
ssh tokenfunc 'cd /opt/tokenfunc || exit 1
  files=compose.yml.new
  [ -f compose.override.yml ] && files="$files:compose.override.yml"
  COMPOSE_FILE="$files" docker compose --profile app config -q \
    && cp compose.yml compose.yml.prev && mv compose.yml.new compose.yml && echo "compose.yml synced"'

# 3. 钉住新 tag 并滚动 api 容器（只动 api，postgres / redis 不动）
ssh tokenfunc "cd /opt/tokenfunc \
  && echo \"previous image: \$(docker inspect -f '{{.Config.Image}}' tokenfunc-api 2>/dev/null || echo none)\" \
  && sed -i 's#^TF_API_IMAGE=.*#TF_API_IMAGE=$IMAGE#' .env && grep -q '^TF_API_IMAGE=' .env \
  && docker compose --profile app pull api \
  && docker compose --profile app up -d --wait api \
  && docker image prune -f"

# 4. 等 healthy（最多 5 分钟）
ssh tokenfunc 'for i in $(seq 1 30); do
  s=$(docker inspect -f "{{.State.Health.Status}}" tokenfunc-api 2>/dev/null || echo missing); echo "attempt $i: $s"
  [ "$s" = healthy ] && exit 0; sleep 10; done; docker logs --tail 80 tokenfunc-api; exit 1'
```

- 步骤 2 校验失败 → 停止，compose.yml 不替换，不部署；把 `docker compose config` 的报错给用户。
- 步骤 3/4 失败（`up --wait` 超时 / 不 healthy）→ 直接进入 P3 判断是否要回滚：此时旧容器可能已被替换。

**完成后**输出进度面板（P1-P2.5 ✅，P3 🔄）。

---

## Phase 3 — 部署验证

**开始时**输出进度面板。

```bash
# 1. 线上版本必须等于 tag
curl -fsS https://tokenfunc.com/api/status | jq -r '"\(.success) \(.data.version)"'
curl -fsS https://tokenfunc.com/api/health/ready | jq -r '"ready=\(.data.ready) db=\(.data.db) redis=\(.data.redis)"'   # 2026-10-25 起镜像带探针；旧镜像 404 可忽略

# 2. 容器状态与镜像、.env 已固化
ssh tokenfunc "cd /opt/tokenfunc && docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | grep tokenfunc; grep '^TF_API_IMAGE=' .env"

# 3. 启动日志巡检：迁移完成、Redis 启用、无 panic
ssh tokenfunc "docker logs --since 5m tokenfunc-api 2>&1 | grep -E 'PostgreSQL|migration|Redis|new_api_panic|runtime error|nil pointer' | head"
```

- `data.version == tag`、`tokenfunc-api` / `tokenfunc-postgres` / `tokenfunc-redis` 全部 healthy、无 panic → 继续 P4。
- panic / 反复 Restarting / 健康检查失败 → **立即执行 P5 回滚命令 → 复测 → 进入 P5**。
- 零星业务错误（401、模型不存在、额度不足）属正常波动，继续。

**完成后先输出一句醒目结论**：「✅ 部署已完成，线上版本 <tag>，服务健康（/api/status 200、容器 healthy、日志零 panic），剩余冒烟测试与后台监控」——后续阶段交互稀疏，缺这句用户会把等待误判为卡死。然后输出进度面板（P1-P3 ✅，P4 🔄）。

---

## Phase 4 — 功能冒烟测试（必做）

> 发版风险不能由 commit message 字面判断，所有改动都要用真实请求过一遍。

**开始时**输出进度面板。

### Step 4.0 — 获取测试 token

```bash
TOKEN="${TOKENFUNC_SMOKE_API_KEY:-}"
```

为空则用 `AskUserQuestion` 索要（选项：粘贴 token（Other 输入）/ 跳过冒烟（高风险，需再次显式确认"我接受跳过冒烟测试的全部风险"））。跳过时面板标 `P4 ⚠️ 跳过（高风险）`。

### Step 4.1 — 执行测试

```bash
BASE=https://tokenfunc.com

# 健康 + 版本
curl -s $BASE/api/status | jq '{success, version: .data.version, theme: .data.theme}'

# 令牌可用的模型列表：取第一个 claude-* 与第一个 gpt-* 作为基线模型
curl -s $BASE/v1/models -H "Authorization: Bearer $TOKEN" | jq -r '.data[].id' | head -20

# OpenAI Chat（非流式 + 流式）
curl -s $BASE/v1/chat/completions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"model":"<gpt-model>","messages":[{"role":"user","content":"hi"}],"max_tokens":16}'
curl -sN $BASE/v1/chat/completions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"model":"<gpt-model>","messages":[{"role":"user","content":"hi"}],"max_tokens":16,"stream":true}' | tail -3

# Anthropic Messages
curl -s $BASE/v1/messages -H "x-api-key: $TOKEN" -H "anthropic-version: 2023-06-01" -H "Content-Type: application/json" \
  -d '{"model":"<claude-model>","messages":[{"role":"user","content":"hi"}],"max_tokens":10}'

# 营销页与登录页（二开前端）
curl -s -o /dev/null -w "%{http_code}\n" $BASE/
curl -s $BASE/ | grep -o '<title>[^<]*</title>'
```

| 接口 | 成功标志 |
|------|---------|
| `GET /api/status` | `success:true`，`version` = tag |
| `GET /v1/models` | `data` 非空；**为空说明生产还没配渠道**，relay 三项标 `⏭️ 跳过（无渠道）`而不是失败 |
| `POST /v1/chat/completions` | `object:"chat.completion"`，流式末尾 `data: [DONE]` |
| `POST /v1/messages` | `type:"message"` |
| `GET /` | 200，`<title>tokenfunc</title>` |

从本次 tag 包含的 commit（`git log <PREV_TAG>..<tag> --oneline`）提炼测试重点，追加对应场景（企业模块改动 → 用管理员登录态过一遍对应后台页；营销页改动 → 看首页与登录页渲染）。

**输出测试报告表**：

| 场景 | 接口/模型 | 预期 | 实际 | HTTP | 结论 |
|------|----------|------|------|------|------|

附未覆盖场景与原因。

### 测试中发现致命错误

任一请求 panic / 持续 5xx / 100% 失败：**停止测试 → 立即回滚（P5 命令）→ 复测 → 进入 P5**。不要"再试一次"、不要先看日志。

**完成后**输出进度面板（P1-P4 ✅，P6 🔄 即将启动）。

---

## Phase 5 — 事故响应（仅 P3/P4 发现致命错误时）

### 回滚命令

```bash
# PREV_IMAGE 来自 P1 Step 1.3；只动 api 容器，不碰 postgres/redis
ssh tokenfunc "cd /opt/tokenfunc \
  && sed -i 's#^TF_API_IMAGE=.*#TF_API_IMAGE=<PREV_IMAGE>#' .env \
  && docker compose --profile app up -d --wait api"
curl -fsS https://tokenfunc.com/api/status | jq -r '.data.version'      # 必须回到旧版本
ssh tokenfunc "docker logs --since 2m tokenfunc-api 2>&1 | grep -ciE 'new_api_panic|runtime error'"   # 应为 0
```

**进入下面步骤的前置条件**：已回滚、已真实请求复测恢复、面板上 P3/P4 已标 ❌。

### Step 5.1 — 证据收集（线上已恢复后）

```bash
ssh tokenfunc "docker logs --since 30m tokenfunc-api 2>&1 | grep -B2 -A40 -E 'new_api_panic|runtime error' | head -120"
gh run view -R nanofluxlabs-ai/tokenfunc <RUN_ID> --log 2>/dev/null | tail -80          # 部署日志里有 previous image
docker pull ghcr.io/nanofluxlabs-ai/tokenfunc:<tag>        # 本地复现：TF_API_IMAGE=<镜像> make up
```

### Step 5.2 — 根因分析（先写给用户看，确认后再改代码）

```
**问题描述**  复现步骤 / 实际 / 预期
**影响范围**  受影响用户与触发条件
**根因分析**  代码路径（文件:行号）、关键变量、为什么 P1 测试没拦下（必填）
**修复方向**
```

### Step 5.3 — 修复 + 回归测试 + SOP 加固

1. 先写能抓到该 bug 的回归测试，反向验证（回退修复 → FAIL，恢复 → PASS）；2. 最小化修复；3. 同类路径加兜底；4. P1 测试范围或红线有缺口的，本次就补进本 skill；5. 重新走完整流程发版，tag 用同日下一序号。

### Step 5.4 — 事故归档

写 `docs/tokenfunc/releases/<YYYY-MM-DD>-incident-<short-desc>.md`：时间线（含挂掉总时长）、根因与误判记录、已落地的改进项。

---

## Phase 6 — 部署后监控（6 轮 × 60 秒，异步）

P4 通过后立即启动，不阻塞用户。用 `ScheduleWakeup(delaySeconds=60)` 循环 6 轮，**每轮一律 `noop:false`**（连续 noop 轮会被终端折叠，用户会以为流程卡死）；每轮 prompt 携带监控起点时间、累计错误清单、当前轮次。

监控起点固定为 P3 部署完成时刻（`SINCE`，RFC3339），**每轮都从起点查到当前**，不用滑动窗口：

```bash
# 4xx/5xx 按 状态码 / 路径 / 客户端 IP 聚合（排除流水号后的查询串）
ssh tokenfunc "docker logs --since '<SINCE>' tokenfunc-api 2>&1 \
  | grep '^\[GIN\]' \
  | awk -F'|' '{gsub(/ /,\"\",\$4); gsub(/^ +| +\$/,\"\",\$6); split(\$7,p,\"?\"); gsub(/^ +/,\"\",p[1]); if (\$4+0>=400) c[\$4\" \"p[1]\" \"\$6]++} END {for (k in c) print c[k], k}' \
  | sort -rn | head -20"

# panic 巡检
ssh tokenfunc "docker logs --since '<SINCE>' tokenfunc-api 2>&1 | grep -ciE 'new_api_panic|runtime error|nil pointer'"

# sanity：窗口内必须有访问日志，否则"0 错误"不可信
ssh tokenfunc "docker logs --since '<SINCE>' tokenfunc-api 2>&1 | grep -c '^\[GIN\]'"
```

**每轮状态行（必须输出）**：

```
[P6 监控 轮次 N/6 | HH:MM] 访问 X 条，累计 Y 条 4xx/5xx，panic 0 — [正常 / ⚠️ 新增 …]
```

**相关性判断**：

| 错误特征 | 判断 |
|---------|------|
| 来源 IP 是本机出口（冒烟测试自己打的 401/404） | 流程噪音，忽略 |
| 路径与本次改动模块无关 / 单用户 401、429、model_not_found | 非版本引入，记录继续 |
| 路径或模型与改动模块匹配的 5xx | ⚠️ 疑似版本引入，停止监控进入 P5 |
| 发版前同路径同模式已存在 | pre-existing |
| 全渠道同时爆发上游错误 | 上游问题，继续监控 |

第 6 轮输出汇总表（时间 / 状态码 / 路径 / 次数 / 与本次相关），结论 正常 或 进入 P5。

---

## 发布报告

发版完成后写 `docs/tokenfunc/releases/<YYYY-MM-DD>-<tag>.md`，状态列用 `✅ 成功 / ❌ 失败 / ⚠️ 注意 / ⏭️ 跳过`：

```markdown
# 发布报告 — tokenfunc {{tag}}

> 环境：prod（tokenfunc.com，单机 docker） · 时间：{{YYYY-MM-DD HH:MM}}

## 概览
| 项 | 值 |
|----|----|
| 版本 tag | {{tag}} |
| 镜像 | ghcr.io/nanofluxlabs-ai/tokenfunc:{{tag}} |
| 上一版本 | {{PREV_IMAGE}} |
| 包含提交 | {{git log prev..tag --oneline 的条数与要点}} |
| 发布结果 | {{✅ 成功 / ❌ 失败（已回滚到 PREV）}} |

## 各阶段
| 阶段 | 状态 | 详情 |
|------|------|------|
| 前置检查 | | 分支 / 测试包 / 结果 |
| 打 tag & push | | |
| Actions 镜像构建 | | run-id，构建耗时 |
| SSH 部署 | | compose.yml 校验与同步 / pull / up --wait / healthy 耗时 |
| 部署验证 | | /api/status 版本、容器状态、panic 巡检 |
| 冒烟测试 | | 覆盖接口 / 跳过原因 |
| 部署后监控 | | 6 轮汇总 |

## 冒烟测试
（P4 表格）

## 回滚记录
无 / 原因、回滚到、恢复验证
```

---

## 易踩坑速查

| 坑 | 正确做法 |
|----|---------|
| 本地 tag 过时，版本号推算错 | P1 先 `git fetch --tags` |
| 工作区不干净或本地 commit 未 push 就打 tag | P2 强制检查；未 push 先 push main，tag 必须等于 origin/main HEAD |
| 以为推 tag 会自动部署 | Actions 只构建镜像，**部署由本 skill P2.5 通过 SSH 完成**；合并 PR 后仍需本 skill 打 tag |
| `gh` 不带 `-R` 解析到上游 `QuantumNous/new-api`（本地有 upstream remote），报 `workflow deploy-ghcr.yml not found` | 所有 `gh run` / `gh pr` 命令加 `-R nanofluxlabs-ai/tokenfunc` |
| `gh run watch … \| tail` 把网络错误吞成成功 | 轮询 `gh run view --json status,conclusion`，以 conclusion 为准 |
| `gh pr merge` / `gh api` 报 `Post … EOF` | 网络抖动，重试并用 `gh pr view --json state` 确认真实状态 |
| 上游断言与二开默认值冲突（如 `/api/status.theme` 期望 `default`） | 属断言陈旧，改测试与二开行为对齐，不是停发理由 |
| `make test-db` 首跑 model/service 企业用例报 `SQLSTATE 23505 pg_type_typname_nsp_index` / `42P01 relation "users" does not exist` | 多包并行在同一 test schema 抢 AutoMigrate；makefile 已固定 `-p 1` 串行，不要绕过 make 直接并行 `go test` |
| `make test-db` 下 controller 的 `*DatabaseMatrix` 用例报 `SQLSTATE 3F000` | 这些用例用 DSN 新建临时库再连入，DSN 的 `search_path` 必须是 `test,public`（makefile 已固定），不要手写只带 `test` 的 DSN |
| 生产 `/v1/models` 为空 | 还没配渠道，relay 冒烟标 ⏭️ 并说明，不算失败 |
| 回滚时 `docker compose down` 或重启 postgres | 只 `up -d --wait api`，postgres / redis 不动，避免把全站打断 |
| 回滚只改容器不改 `.env` | 下次任何人 `docker compose up` 又会拉回坏版本；回滚必须同时 `sed` 改 `TF_API_IMAGE` |
| 用 nginx access.log 做监控 | 用 `docker logs tokenfunc-api` 的 `[GIN]` 行，字段固定（状态码 / 耗时 / IP / 路径），不必解析 nginx 格式 |
| 监控用滑动时间窗 | 固定 `--since <部署时刻>` 累计查，先看访问总数非 0 再下"0 错误"结论 |
| P6 每轮 `noop:true` | 一律 `noop:false`，否则状态行被终端折叠 |
| P3 完成只贴面板 | 先输出醒目的"✅ 部署已完成，服务健康"结论句，再贴面板 |
