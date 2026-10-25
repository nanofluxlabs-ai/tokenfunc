---
name: release-tke
description: >-
  一键发版 tokenfunc 到腾讯云 TKE 集群（ns tokenfunc，主从两个 Deployment）：
  打 tag → 等 GitHub Actions 镜像构建（失败自动改本机构建推 GHCR）→ 本地 kubectl 滚动 master → slave → 健康验证 → 冒烟 → 监控 → 发布报告。
  当用户要"发版 / 发布 / 部署 tokenfunc 到 TKE 或 k8s"、"打 tag 上线到集群"时使用。tag 可选，缺省按命名规则推算当日下一个版本号。
# 仅人工手动触发（/release-tke），禁止模型自动调用——发版为高副作用操作。
disable-model-invocation: true
argument-hint: "[tag]"
allowed-tools:
  - Bash(git *)
  - Bash(gh *)
  - Bash(kubectl *)
  - Bash(docker *)
  - Bash(make *)
  - Bash(./scripts/tokenfunc/tke-local-image.sh *)
  - Bash(scripts/tokenfunc/tke-local-image.sh *)
  - Bash(bash deploy/k8s/scripts/deploy.sh *)
  - Bash(curl *)
  - Bash(jq *)
  - Bash(go build *)
  - Bash(go test *)
  - Bash(cd *)
  - Bash(export *)
  - Bash(date *)
  - Read
  - Write
  - Edit
  - AskUserQuestion
  - ScheduleWakeup
---

# tokenfunc TKE 一键发版

流程：`P1 前置检查 → P2 打 tag + 镜像构建（Actions，失败自动本机构建） → P3 kubectl 滚动部署 → P4 冒烟 → P5 事故响应（仅异常） → P6 部署后监控 → 发布报告`。

单机 docker 版本见 `/release-standalone`；两者只能用一个：切到 TKE 后把 GitHub 仓库变量 `DEPLOY_TARGET` 设为 `tke`，`deploy-ghcr.yml` 就只构建镜像、不再 SSH 部署到单机。本 skill 开始前先确认这一点（P1 Step 1.1）。

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `tag` | 否 | 缺省自动推算下一个版本号，格式 `vYYYY.MM.DD.N`（当日序号）。 |

调用示例：`/release-tke`、`/release-tke v2026.10.26.2`。

## ⚠️ 授权与约束

- 平时对线上 TKE 集群是**只读**约束。**本 skill 是用户主动发版，流程内的 `kubectl set image / rollout / undo` 等集群写操作在此次发版中被授权**——仅限本发版流程，不扩展到其他场景。
- **不自动 `git commit`**：预检发现未提交改动，用 `AskUserQuestion` 问用户是否提交及 commit message；tag / push / 部署属发版核心，用户调用即视为授权。
- **GitHub Actions 构建失败不中断发版**：Actions 失败 / 未启动 / 超时时，自动用 `scripts/tokenfunc/tke-local-image.sh` 本机构建并推送 GHCR，然后继续 P3，不询问用户。只有本机构建也失败、或 GHCR 推送权限需要人工授权时才停下。
- 生产只有一套（tokenfunc.com），**P1 必须弹窗二次确认**。
- 本流程只动 `tokenfunc-api-master` / `tokenfunc-api-slave` 两个 Deployment 的镜像；**禁止** `kubectl apply` 清单（会把 `image:` 回滚成文件里的旧 tag）、禁止改 ConfigMap / Secret、禁止动 PaaS 的 PG / Redis。

## 🚨 致命红线（高于所有 Phase）

P3 部署后或 P4 冒烟中出现以下任一情况，**立即回滚止血**（命令见 P5）：

- panic（`new_api_panic` / `runtime error` / `nil pointer dereference`）
- Pod 反复 CrashLoopBackOff / ImagePullBackOff，或 rollout 超时
- 5xx 高频出现（不是 1-2 个偶发）
- 健康检查持续失败 / 关键接口完全不可用

**恢复前严禁**：拉栈分析、grep 源码、读 commit diff、解释根因、"再试一次看看"。

**正确顺序**：1. 回滚（先 slave 再 master） → 2. 真实请求复测 200 且 Pod 日志无 panic → 3. 进入 P5 分析。证据（Pod 日志、CLS、GHCR 镜像）回滚后照样在，每多分析一分钟就是多一分钟全量挂掉。

---

## 进度面板格式

每个 Phase **开始前**和**完成后**各输出一次：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 tokenfunc TKE 发版进度  <tag>  [prod · ns tokenfunc]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ✅ P1  前置检查        完成
 🔄 P2  镜像构建        进行中（Actions 约 6 分钟；失败自动本机构建）
 ⬜ P3  集群部署        等待
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
| GitHub repo | `nanofluxlabs-ai/tokenfunc`，分支 `main`；`gh` 一律带 `-R nanofluxlabs-ai/tokenfunc`（本地有 upstream remote 会解析错仓库） |
| tag 格式 | `vYYYY.MM.DD.N` |
| 构建 workflow | `.github/workflows/deploy-ghcr.yml`（名 `Build & Deploy (GHCR)`）：推 `v*` tag → build job 构建推 GHCR；`DEPLOY_TARGET=tke` 时 deploy job 跳过 |
| 镜像 | `ghcr.io/nanofluxlabs-ai/tokenfunc:<tag>`（发版同时移动 `:latest`） |
| KUBECONFIG | `~/.kube/tokenfunc.config`（也可 `export KUBECONFIG=` 指定） |
| Namespace | `tokenfunc` |
| Deployment | `tokenfunc-api-master`（×1，跑后台任务，不接流量）+ `tokenfunc-api-slave`（×N，接流量） |
| Pod label selector | `app=tokenfunc-api,role=master` / `app=tokenfunc-api,role=slave`（**不是** `app=tokenfunc-api-master`） |
| 容器名（set image） | `tokenfunc-api` |
| rollout timeout | master 180s / slave 300s（`deploy/k8s/scripts/deploy.sh` 内置） |
| 健康 URL | `https://tokenfunc.com/api/health/ready`（`data.ready=true db=true redis=true`）；版本看 `/api/status` 的 `data.version` |
| 冒烟 token 环境变量 | `TOKENFUNC_SMOKE_API_KEY`（`sk-` 开头的 API 令牌，可在 `.claude/settings.local.json` 的 env 预配置） |
| 日志 | Pod stdout 为 NDJSON，访问日志 `"type":"access"`，字段 `status / path / client_ip / latency_ms`；CLS 主题接好后填 `TOKENFUNC_CLS_TOPIC_ID`（见 P6） |

---

## Phase 1 — 前置检查

**开始时**输出进度面板（P1 🔄，其余 ⬜，tag=待定）。

### Step 1.0 — 生产二次确认

用 `AskUserQuestion`：

```
question: "即将发布到生产 TKE 集群（tokenfunc.com，ns tokenfunc），请再次确认"
header: "⚠️ 生产发版确认"
options:
  - label: "确认，发布到生产"
    description: "slave 流量将滚动到新版本"
  - label: "取消"
    description: "中止本次发版"
```

### Step 1.1 — 环境预检

```bash
export KUBECONFIG=~/.kube/tokenfunc.config
kubectl config current-context                                   # 必须是 tokenfunc 的 TKE 集群
kubectl -n tokenfunc get deploy tokenfunc-api-master tokenfunc-api-slave -o custom-columns=NAME:.metadata.name,READY:.status.readyReplicas,IMAGE:.spec.template.spec.containers[0].image
gh variable get DEPLOY_TARGET -R nanofluxlabs-ai/tokenfunc        # 必须是 tke，否则推 tag 会同时 SSH 部署到单机 docker → 停止，让用户先设置
```

### Step 1.2 — 代码预检

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

> `make test-db` 自动起本地 docker 基础设施并注入 `TEST_POSTGRES_DSN`，二开 PG 用例只在这里跑得到。`controller/` 必须覆盖——relay 链路里的 nil 指针一上线就是 100% 流量挂掉。`grep` 输出为空 **≠** 全绿，先看原始输出确认确实有 `ok` 行。

**测试失败处理**：
1. `go test ./xxx/ -run <TestName> -v -count=1` 看性质：**断言陈旧**（上游用例与二开默认值冲突、模型列表变化等）→ 直接改测试与代码对齐；**业务代码新引入** → ❌ 停止，报告用户。
2. 已知偶发 / 环境相关：`TestSecurityAccountDeletionConcurrentRequestsHaveOneWinner` 上游 main 也偶发，复跑一次；`TestAdaptorMasksDialedHostsInDialFailure` 在本机 fake-ip DNS 下必失败，上游原码同样失败，不是回归。前端 `usage-logs/.../detail-preview.test.tsx` 的 20s 超时用例在 main 上就超时。

**pull 冲突**：不确定的冲突立即停止，列出冲突文件与段落给用户确认；带未解决冲突或脏工作树绝不打 tag。

### Step 1.3 — 确定 tag

```bash
git tag --sort=-creatordate | grep -E '^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$' | head -1
```

`vYYYY.MM.DD.N`：日期取今天（`date +%Y.%m.%d`），N = 今天已有 tag 的最大序号 +1，没有则 1。用户指定 tag 则直接用。未指定时用 `AskUserQuestion` 确认版本号（选项：推算值（推荐）/ 自定义）。

### Step 1.4 — 记录回滚目标

```bash
kubectl -n tokenfunc get deploy tokenfunc-api-master -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
kubectl -n tokenfunc get deploy tokenfunc-api-slave  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

把当前镜像记为 `PREV_IMAGE`（两者应相同；不同说明上次发版没走完，先问用户）。

**完成后**输出进度面板（P1 ✅，P2 🔄，tag 替换为实际值）。

---

## Phase 2 — 打 tag + 镜像构建

**开始时**输出进度面板。

```bash
[ -z "$(git status --short)" ] || { echo "❌ 工作区不干净，中止"; exit 1; }
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || git push origin main
git tag <tag>
git push origin <tag>              # 触发 Build & Deploy (GHCR) 的 build job
```

### Step 2.0 — 等 Actions 构建

```bash
sleep 20
RUN_ID=$(gh run list -R nanofluxlabs-ai/tokenfunc --workflow deploy-ghcr.yml --branch <tag> --limit 1 --json databaseId --jq '.[0].databaseId')
# 每 30s 查一次直到 status=completed；拿到 completed 后隔 15s 再查一次双确认（不要 `gh run watch | tail`，管道会吞掉网络错误变假成功）
gh run view -R nanofluxlabs-ai/tokenfunc $RUN_ID --json status,conclusion,jobs \
  --jq '"\(.status) \(.conclusion) | " + ([.jobs[] | "\(.name)=\(.status)/\(.conclusion)"] | join(", "))'
```

只看 `Build & push image` job（`DEPLOY_TARGET=tke` 时 deploy job 应为 skipped；若它跑了，说明变量没设，立即停下报告用户——单机已被部署）。

| 情况 | 处理 |
|------|------|
| build job `completed/success`（双确认） | 进入 P3 |
| `failure` / `cancelled` / `startup_failure`（双确认） | 记录原因 → **自动走 Step 2.1 本机构建** |
| tag push 后 3 分钟仍查不到 run | 走 Step 2.1 |
| 25 分钟仍未 `completed` | 先 `gh run cancel $RUN_ID -R nanofluxlabs-ai/tokenfunc`，再走 Step 2.1（避免 Actions 晚到的镜像覆盖本机推送的同名 tag） |

job 没执行任何步骤就失败时（账单 / runner），原因在注解里：

```bash
JOB=$(gh api repos/nanofluxlabs-ai/tokenfunc/actions/runs/$RUN_ID/jobs --jq '.jobs[0].id')
gh api repos/nanofluxlabs-ai/tokenfunc/check-runs/$JOB/annotations --jq '.[] | "\(.annotation_level): \(.message)"'
```

> 查询偶发 `Post ... EOF` 是网络抖动，重试即可。

### Step 2.1 — Actions 失败回退：本机构建（自动执行，不询问用户）

开始前再查一次该 run：`status` 必须是 `completed`；没结束先 `gh run cancel`。

```bash
./scripts/tokenfunc/tke-local-image.sh <tag>   # 后台运行，约 5～15 分钟；前端宿主机编译、Go 交叉编译 linux/amd64，crane HTTP/1.1 推送 :<tag> 与 :latest，结束前核验平台与版本号
```

| 脚本退出码 | 处理 |
|-----------|------|
| 0 | 记下输出里的 digest，进入 P3。发布报告「镜像构建」写明「本机构建（Actions 失败原因：…）」 |
| 3（GHCR 推送权限缺失） | 唯一需要用户介入的情况：请用户执行 `! gh auth refresh -h github.com -s write:packages`，授权后重跑脚本 |
| 1 / 2 | ❌ 停止发版，不部署。把 Actions 与本机两边的报错一起报告用户 |

- 脚本已经推上 GHCR、只是后续核验步骤失败时，不要重跑整个脚本，用 `GODEBUG=http2client=0 crane digest ghcr.io/nanofluxlabs-ai/tokenfunc:<tag>` 确认 tag 存在即可。
- 演练 / 自检：`./scripts/tokenfunc/tke-local-image.sh <tag> --no-push`。
- 改 `Dockerfile` 的运行层或编译参数时要同步改脚本里的内嵌 Dockerfile。

**完成后**输出进度面板（P1-P2 ✅，P3 🔄）。

---

## Phase 3 — 集群部署

**开始时**输出进度面板。

```bash
export KUBECONFIG=~/.kube/tokenfunc.config
bash deploy/k8s/scripts/deploy.sh <tag>       # master 先滚（跑迁移 + 后台任务），再 slave；任一阶段 rollout 失败脚本自动 undo 并非 0 退出
```

脚本非 0 退出 → 已自动回滚，直接进入 P5（先用真实请求复测确认恢复）。

**部署后立即验证**：

```bash
# 1. 对外健康与版本
curl -fsS --retry 6 --retry-delay 5 --retry-connrefused https://tokenfunc.com/api/health/ready | jq -r '"ready=\(.data.ready) db=\(.data.db) redis=\(.data.redis)"'
curl -fsS https://tokenfunc.com/api/status | jq -r '"\(.success) \(.data.version)"'      # version 必须等于 tag

# 2. Pod 状态与镜像
kubectl -n tokenfunc get pods -l app=tokenfunc-api -o custom-columns=NAME:.metadata.name,ROLE:.metadata.labels.role,READY:.status.containerStatuses[0].ready,RESTARTS:.status.containerStatuses[0].restartCount,IMAGE:.spec.containers[0].image

# 3. 启动日志巡检（master 跑迁移）：迁移完成、Redis 启用、无 panic
kubectl -n tokenfunc logs deploy/tokenfunc-api-master --tail=200 2>&1 | grep -E 'PostgreSQL|迁移|migration|Redis|已启动|started|new_api_panic|runtime error|nil pointer' | head
kubectl -n tokenfunc logs deploy/tokenfunc-api-slave  --tail=200 2>&1 | grep -ciE 'new_api_panic|runtime error|nil pointer'
```

- `ready=true`、`version == tag`、Pod 全 Ready 且 RESTARTS 为 0、无 panic → 继续 P4。
- panic / CrashLoopBackOff / 健康检查失败 → **立即执行 P5 回滚命令 → 复测 → 进入 P5**。
- 零星业务错误（401、模型不存在、额度不足）属正常波动，继续。

**完成后先输出一句醒目结论**：「✅ 部署已完成，线上版本 <tag>，服务健康（ready 200、Pod 全 Ready、日志零 panic），剩余冒烟测试与后台监控」。然后输出进度面板（P1-P3 ✅，P4 🔄）。

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

curl -s $BASE/api/status | jq '{success, version: .data.version, theme: .data.theme}'
curl -s $BASE/api/health/ready | jq .data

# 令牌可用的模型列表：取第一个 claude-* 与第一个非 claude 模型作为基线
curl -s $BASE/v1/models -H "Authorization: Bearer $TOKEN" | jq -r '.data[].id' | head -20

# OpenAI Chat（非流式 + 流式）
curl -s $BASE/v1/chat/completions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"model":"<model>","messages":[{"role":"user","content":"hi"}],"max_tokens":16}'
curl -sN $BASE/v1/chat/completions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"model":"<model>","messages":[{"role":"user","content":"hi"}],"max_tokens":16,"stream":true}' | tail -3

# Anthropic Messages（有 claude 渠道时）
curl -s $BASE/v1/messages -H "x-api-key: $TOKEN" -H "anthropic-version: 2023-06-01" -H "Content-Type: application/json" \
  -d '{"model":"<claude-model>","messages":[{"role":"user","content":"hi"}],"max_tokens":10}'

# 页面壳与鉴权负例
curl -s -o /dev/null -w "%{http_code}\n" $BASE/
curl -s $BASE/ | grep -o '<title>[^<]*</title>'
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/log/self            # 未登录 401
```

| 接口 | 成功标志 |
|------|---------|
| `GET /api/health/ready` | `ready:true` |
| `GET /api/status` | `success:true`，`version` = tag |
| `GET /v1/models` | `data` 非空；**为空说明还没配渠道**，relay 三项标 `⏭️ 跳过（无渠道）` |
| `POST /v1/chat/completions` | `object:"chat.completion"`，流式末尾 `data: [DONE]` |
| `POST /v1/messages` | `type:"message"` |
| `GET /` | 200，`<title>tokenfunc</title>` |

从本次 tag 包含的 commit（`git log <PREV_TAG>..<tag> --oneline`）提炼测试重点，追加对应场景（企业 / 推广 / 财务改动 → 用管理员 API 令牌（环境变量 `TOKENFUNC_LOCAL_ADMIN_TOKEN` 只对本地有效，生产另配）过一遍对应接口；营销页改动 → 看首页与登录页渲染；日志归档改动 → `GET /api/admin/log-archive/status`）。

**输出测试报告表**：

| 场景 | 接口/模型 | 预期 | 实际 | HTTP | 结论 |
|------|----------|------|------|------|------|

附未覆盖场景与原因。

### 测试中发现致命错误

任一请求 panic / 持续 5xx / 100% 失败：**停止测试 → 立即回滚（P5 命令）→ 复测 → 进入 P5**。不要"再试一次"、不要先看日志。

**完成后**输出进度面板（P1-P4 ✅，P6 🔄 即将启动）。

---

## Phase 5 — 事故响应（仅 P3/P4 发现致命错误时）

### 回滚命令（先 slave 再 master，与滚动顺序相反）

```bash
export KUBECONFIG=~/.kube/tokenfunc.config
bash deploy/k8s/scripts/deploy.sh --undo
# 或手动：
kubectl rollout undo deploy/tokenfunc-api-slave  -n tokenfunc && kubectl rollout status deploy/tokenfunc-api-slave  -n tokenfunc --timeout=300s
kubectl rollout undo deploy/tokenfunc-api-master -n tokenfunc && kubectl rollout status deploy/tokenfunc-api-master -n tokenfunc --timeout=180s
curl -fsS https://tokenfunc.com/api/status | jq -r '.data.version'   # 必须回到 PREV_IMAGE 的 tag
kubectl -n tokenfunc logs deploy/tokenfunc-api-slave --tail=200 2>&1 | grep -ciE 'new_api_panic|runtime error'   # 应为 0
```

**进入下面步骤的前置条件**：已回滚、已真实请求复测恢复、面板上 P3/P4 已标 ❌。

### Step 5.1 — 证据收集（集群已恢复后）

```bash
kubectl -n tokenfunc logs deploy/tokenfunc-api-slave --previous --tail=300 2>&1 | grep -B2 -A40 -E 'new_api_panic|runtime error' | head -120
kubectl -n tokenfunc describe pods -l app=tokenfunc-api,role=slave | grep -A 10 "Events:"
gh run view -R nanofluxlabs-ai/tokenfunc $RUN_ID --log 2>/dev/null | tail -80
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

监控起点固定为 P3 部署完成时刻（`SINCE`，RFC3339），**每轮都从起点查到当前**，不用滑动窗口。

**默认数据源：slave Pod 的 stdout（NDJSON，访问日志 `"type":"access"`）**。两类 Pod 都要查：

```bash
export KUBECONFIG=~/.kube/tokenfunc.config
# 4xx/5xx 按 状态码 / 路径 / 客户端 IP 聚合（path 去掉查询串）；用 kubectl 的 --since-time 固定起点
kubectl -n tokenfunc logs -l app=tokenfunc-api,role=slave --all-containers --since-time="$SINCE" --tail=-1 2>/dev/null \
  | grep '"type":"access"' | jq -r 'select((.status|tonumber) >= 400) | "\(.status) \(.path|split("?")[0]) \(.client_ip)"' \
  | sort | uniq -c | sort -rn | head -20

# panic 巡检（master + slave）
kubectl -n tokenfunc logs -l app=tokenfunc-api --all-containers --since-time="$SINCE" --tail=-1 2>/dev/null | grep -ciE 'new_api_panic|runtime error|nil pointer'

# sanity：窗口内必须有访问日志，否则"0 错误"不可信
kubectl -n tokenfunc logs -l app=tokenfunc-api,role=slave --all-containers --since-time="$SINCE" --tail=-1 2>/dev/null | grep -c '"type":"access"'
```

CLS 主题接好后（`TOKENFUNC_CLS_TOPIC_ID` 非空）改用 `tccli cls SearchLog`，查询 `service:tokenfunc AND type:access AND status:>=400 | SELECT status, path, client_ip, count(*) AS cnt GROUP BY status, path, client_ip ORDER BY cnt DESC LIMIT 20`，sanity 查 `service:tokenfunc AND type:access | SELECT count(*) AS access_total`；`AnalysisRecords` 是 JSON 字符串数组，取值用 `jq -r '.AnalysisRecords[]? | fromjson'`。

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
| 部署后几分钟内渠道探测失败集中出现 | 新 Pod 启动各跑一轮全量外接慢探，按 channel_id 集合与发版前对照，不是版本问题 |

第 6 轮输出汇总表（时间 / 状态码 / 路径 / 次数 / 与本次相关），结论 正常 或 进入 P5。

---

## 发布报告

发版完成后写 `docs/tokenfunc/releases/<YYYY-MM-DD>-<tag>.md`，状态列用 `✅ 成功 / ❌ 失败 / ⚠️ 注意 / ⏭️ 跳过`：

```markdown
# 发布报告 — tokenfunc {{tag}}

> 环境：prod（tokenfunc.com，TKE ns tokenfunc） · 时间：{{YYYY-MM-DD HH:MM}}

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
| 前置检查 | | 分支 / 测试包 / 结果 / DEPLOY_TARGET |
| 打 tag & push | | |
| 镜像构建（Actions） | | run-id，耗时；失败时写明原因 |
| 镜像构建（本机回退） | {{状态 / ⏭️ 未触发}} | scripts/tokenfunc/tke-local-image.sh，digest |
| 集群部署 | | master / slave rollout 摘要，旧镜像 → 新镜像 |
| 部署验证 | | ready / version / Pod 状态 / panic 巡检 |
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
| `DEPLOY_TARGET` 没设成 `tke` 就推 tag | Actions 会同时 SSH 部署到单机 docker。P1 用 `gh variable get` 校验，不是 `tke` 就停 |
| 本地 tag 过时，版本号推算错 | P1 先 `git fetch --tags` |
| 工作区不干净或本地 commit 未 push 就打 tag | P2 强制检查；tag 必须等于 origin/main HEAD |
| `gh` 不带 `-R` 解析到上游 `QuantumNous/new-api` | 所有 `gh` 命令加 `-R nanofluxlabs-ai/tokenfunc` |
| `gh run watch … \| tail` 把网络错误吞成成功 | 轮询 `gh run view --json status,conclusion`，以 conclusion 为准 |
| Actions 失败就停下问用户 | 不问，自动走 Step 2.1 本机构建；只有脚本退出码 1/2/3 才停 |
| Actions 构建几秒失败、0 步执行 | 看 job 注解：账单拦截直接回退本机构建 |
| Actions 卡住时直接本机推送 | 先 `gh run cancel`，否则 Actions 晚到的镜像会覆盖同名 tag |
| 本机推 GHCR 403 | gh 默认令牌没有 `write:packages`；脚本退出码 3，请用户 `! gh auth refresh -h github.com -s write:packages` |
| 本机推镜像卡在最后一层 | HTTP/2 被线路卡死，脚本已用 crane HTTP/1.1；手动补推 `docker save <img> -o x.tar && GODEBUG=http2client=0 crane push x.tar <img>` |
| 用 `kubectl apply -f deployment-*.yaml` 发版 | 文件里的 `image:` 是旧 tag，apply 等于回滚；发版只用 `deploy.sh` / `set image` |
| slave 先于 master 滚动，或 master 先于 slave 回滚 | 滚动 master → slave（master 跑迁移）；回滚 slave → master |
| `kubectl get pods -l app=tokenfunc-api-master` 查出空 | label 是 `app=tokenfunc-api,role=master` |
| 日志 grep panic 无输出就判「无 panic」 | 先 `kubectl logs … \| wc -l` 确认日志非空；selector 写错时 grep 也是空 |
| 监控用滑动时间窗 | 固定 `--since-time=<部署时刻>` 累计查，先看访问总数非 0 再下"0 错误"结论 |
| P6 每轮 `noop:true` | 一律 `noop:false` |
| P3 完成只贴面板 | 先输出醒目的"✅ 部署已完成"结论句，再贴面板 |
| 生产 `/v1/models` 为空 | 还没配渠道，relay 冒烟标 ⏭️ 并说明，不算失败 |
| `make test-db` 下 model/service 报 `23505 pg_type_typname_nsp_index` / `relation "users" does not exist` | 多包并行抢 AutoMigrate；makefile 已固定 `-p 1`，不要绕过 make 直接并行 `go test` |
| zsh 冒烟脚本里变量名用 `path` | zsh 的 `path` 绑定 PATH，换 `route` / `ep` |
