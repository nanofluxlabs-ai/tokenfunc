---
name: upstream-sync
description: >-
  把上游 QuantumNous/new-api 的 rc tag（v1.0.0-rc.N）同步进 tokenfunc：拉取 → 选 rc → 评估清单 →
  变更摘要（bugfix / feature / 影响面）+ 合不合的建议与理由 → 用户拍板 → 建 sync 分支合并 → 只解冲突 →
  门禁（go/bun 测试、make test-db、迁移幂等、二开冒烟）→ 开 PR → 给用户一份本地验证清单 → 用户确认合并 → 提示独立发版。
  当用户要"同步上游 / 合并 new-api / 跟进上游 rc / 吸收上游修复"时使用。rc tag 可选，缺省取最新 rc；
  传上游 commit sha 则走 cherry-pick 例外通道。节奏与约定见 docs/tokenfunc/development.md §4.6。
# 仅人工手动触发（/upstream-sync）：合并上游会大面积改动代码，禁止模型自动调用。
disable-model-invocation: true
argument-hint: "[v1.0.0-rc.N | <upstream-sha>]"
allowed-tools:
  - Bash(git *)
  - Bash(gh *)
  - Bash(make *)
  - Bash(go *)
  - Bash(bun *)
  - Bash(bunx *)
  - Bash(curl *)
  - Bash(cd *)
  - Bash(docker *)
  - Bash(cat *)
  - Bash(sed *)
  - Bash(grep *)
  - Read
  - Write
  - Edit
  - AskUserQuestion
---

# tokenfunc 上游同步

流程：`P1 选 rc → P2 评估清单 → P2.5 变更摘要 + 建议 + 用户拍板 → P3 合并 + 解冲突 → P4 门禁 → P5 开 PR → P5.5 本地验证清单 → P6 合并后收尾`。

**P2.5 之前不建分支、不合并。** 用户看完摘要和建议说"合"才进 P3；说"不合"或"只要其中几条"就按 cherry-pick 例外通道或直接结束。

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `v1.0.0-rc.N` | 否 | 要合入的上游 rc tag。缺省取 `make upstream-status` 列出的最新 rc。 |
| `<upstream-sha>` | 否 | 走例外通道：只 cherry-pick 这一个上游 commit（见文末）。 |

调用示例：`/upstream-sync`、`/upstream-sync v1.0.0-rc.44`、`/upstream-sync 45fbb149f`。

## ⚠️ 授权与约束

- **只合 rc tag，永远不合 `upstream/main` HEAD**。上游 rc 是作者认为可发布的切点，这就是筛选器。
- **节奏**：距上次同步 ≥ 2 周或累积 ≥ 2 个 rc 才合；不满足时在 P1 用 `AskUserQuestion` 让用户确认是否仍要合。
- **只解冲突，不重构上游代码**；二开只支持 PostgreSQL，不为上游新代码补 SQLite/MySQL 兼容。
- **不 push 到 `upstream`**，所有 push 只到 `origin`。**不自动合并到 `main`**，PR 开好后等用户明确同意。
- 先读 `AGENTS.md`、`docs/tokenfunc/development.md` §4.6；冲突涉及计费读门文件时按 AGENTS.md 读 `.agents/rules/billing.md`。
- 工作区必须干净（`make upstream-merge` 会自检）。当前分支如果不是 `main`，先问用户是基于 `main` 还是当前分支（stacked）建 sync 分支，传 `BASE=`。

## Phase 1 — 选 rc

```bash
make upstream-status      # 基线 rc、落后 commit 数、基线之后的 rc 列表
git log -1 --format='%ad' --date=short $(git merge-base main upstream/main)   # 上次同步点日期
```

- 没传参数：取列表最后一个 rc。
- 节奏不满足（< 2 周且 < 2 个 rc）：说明理由，`AskUserQuestion` 确认。
- 记下 `REF`、基线 rc、commit 数，作为报告头。

## Phase 2 — 评估清单

```bash
make upstream-diff REF=$REF        # 写到 .tmp/upstream/$REF.md
```

读清单，逐条给第 4 节的 commit 填「决定」：

| 决定 | 含义 |
|------|------|
| 接受 | 直接合入 |
| 回退 | 与二开冲突或不需要的功能，合并后 `git revert -m` 不可行时在冲突解决阶段保留我方 |
| 需适配 | 动了二开挂载点（`model/user.go`、`model/topup.go`、`service/quota.go`、`main.go`、计费文件），合并后要补二开逻辑或测试 |

第 3 节「热点重叠」要逐个看上游 commit 的意图，而不只看会不会冲突：上游 fix 的落点可能在我们已经抽出去的文件里（例：日历 locale 键修复落在 `calendar-locales.ts`），这种不会报冲突但必须手工搬。

上游每次改动消息 / 日志机制（`ApiErrorT` / `NewMessage` / `LogText` / i18n 键删除），二开的覆盖层要整体重核：后端 `i18n/locales/tokenfunc.*.yaml`、前端 `locales/tokenfunc/`、`common/log_text.tokenfunc.zh-CN.json`、我方调用上游 `Record*Log` / `i18n.Msg*` 的地方。签名变化靠 `go build` 暴露，不要靠肉眼。

清单填好后进入 P2.5，不要在这里直接概括给用户。

## Phase 2.5 — 变更摘要 + 合并建议 + 用户拍板

目的：让用户基于"这个 rc 给 tokenfunc 带来什么、风险多大"决定合不合，而不是基于"到节奏了"。

### 怎么读上游变更

每条 commit 至少看 `git show --stat <sha>` 和标题；动了 `relay/`、`model/`、计费文件、`middleware/` 的再看 diff 正文。判断影响面时用这个标尺：

| 影响面 | 判定依据 |
|--------|----------|
| 生产正在踩 | 修的 bug 在生产日志 / 记忆 / 发布报告里出现过（例：限流分桶、Passkey origin） |
| 二开直接依赖 | 改了二开挂载点或覆盖层（`model/user.go`、`model/topup.go`、`service/quota.go`、`main.go`、消息 / 日志机制、主题、i18n） |
| 客户可感知 | relay 协议转换、计费口径、渠道行为、管理端页面 |
| 内部 | 仅重构 / 依赖升级 / 文档 / CI / 测试 |

### 摘要格式（写到 `.tmp/upstream/$REF-summary.md`，回复里贴这一份，不贴第 4 节大表）

```
# 上游 $REF 变更摘要（基线 rc.N → rc.M，X commit）

## Bugfix（N 条）
| sha | 修了什么（一句话，人话） | 影响面 | 对 tokenfunc |
|-----|------------------------|--------|-------------|
| … | … | 生产正在踩 / 客户可感知 / 内部 | 需要 / 顺带 / 无关 |

## Feature（N 条）
| sha | 加了什么 | 影响面 | 对 tokenfunc |
|-----|---------|--------|-------------|
| … | … | … | 有用 / 中性 / 不想要（要回退） |

## 其它（chore / build / refactor / docs，N 条）
一句话带过，只点名依赖升级与 CI 变化。

## 风险
- 真冲突 N 个文件（列出），其中二开热点 N 个
- 需适配 N 条（列出 sha 与原因）
- 迁移 / 依赖：有无 model 改动、go.mod 变化
- 上游机制变化：消息 / 日志 / 主题 / i18n 有无重做
```

### 建议（必须给，三选一，附理由）

| 建议 | 给出条件 |
|------|----------|
| **合入** | 有"生产正在踩"或"二开直接依赖"的修复，或 feature 有用且冲突 / 适配量可控 |
| **只 cherry-pick 列出的几条** | 只有零星关键 fix，其余是大改机制或不想要的 feature，整合成本高于收益 |
| **跳过，等下一个 rc** | 全是内部改动 / 不想要的 feature，或上游刚做了大改造（消息机制、依赖大版本）且紧接着还有后续 rc 在修它 |

理由写三点以内：收益（哪几条 fix / feature）、成本（冲突 + 适配 + 迁移）、时机（上游是否还在连续改同一块、我方是否有在飞的分支会撞）。有在飞的二开分支撞上游改动时要点名（`git branch -r --no-merged main` 看有哪些，和冲突文件比对）。

### 拍板

用 `AskUserQuestion` 三个选项：合入 / 只 cherry-pick（列 sha）/ 跳过。推荐项放第一个并标 (Recommended)。用户选"跳过"就结束并把摘要文件路径告诉用户；选"只 cherry-pick"走文末例外通道；选"合入"才进 P3。

## Phase 3 — 合并 + 解冲突

```bash
make upstream-merge REF=$REF [BASE=<branch>]   # 建 sync/upstream-$REF 并 git merge --no-ff
git status --short | grep '^UU\|^AA\|^DU\|^UD'  # 冲突文件
```

解冲突原则：
- 上游机械改动（如 `SysLog("…")` → `SysLog(LogText(…))`）与我方逻辑改动叠加时**两边都留**。
- 我方已删除、上游修改的文件（`docker-compose.yml` 等）：保留删除（`git rm`）。
- 二开翻译 / 主题 / 常量已拆到独立文件，上游文件只剩接线行；接线行冲突按上游新结构重新接。
- 解完：`git add -A && git commit --no-edit`（沿用 `merge(upstream): sync new-api $REF`）。
- 依赖变化：`go mod tidy`，`cd web && bun install`（lockfile 冲突以上游为准再重装）。

## Phase 4 — 门禁（全部必须通过）

```bash
go build ./... && go vet ./...
cd relaykit && GOWORK=off go build ./... && cd ../tokenkit && GOWORK=off go build ./... && cd ..
make test                                   # CI 同款
make test-db                                # 真 PG，覆盖二开 PostgreSQL 回归
cd web && bun run typecheck && bun run test && bun run i18n:sync && git status --short src/i18n/locales/*.json && cd ..
```

- `i18n:sync` 之后上游 locale json 必须无 diff；二开目录 `locales/tokenfunc/_extras/` 必须为空。
- 迁移幂等：上游清单第 2 节有 `model/` 或迁移改动时，宿主机 API 连 dev schema 启动两次：`make api TF_API_PORT=3003` → `make api-stop` → `DEBUG=true make api TF_API_PORT=3003`（GORM 默认不打 SQL，DEBUG 才打），第二次 `grep -c 'ALTER TABLE' .tmp/logs/api.out` 必须为 0，且 SQL 行数 > 0 证明确实在打印；完成后 `make api-stop`。
- `DEFAULT_LANGUAGE=zh-CN` 下启动日志应为中文，`grep 已启动 .tmp/logs/api.out` 出现 `tokenfunc vX 已启动`（品牌名由 `log_text.tokenfunc.zh-CN.json` 覆盖）。
- 二开冒烟（`make api` 后 `http://127.0.0.1:3000`）：`/api/status` 的 `theme=tokenfunc`；企业列表 / 授信 / 报价 / 财务导出 / 手工充值接口返回正常；营销页中文文案与品牌色正常。
- 上游新功能（清单里的 `feat`）至少各点一次。

## Phase 5 — 开 PR

```bash
git push -u origin sync/upstream-$REF
gh pr create -R nanofluxlabs-ai/tokenfunc --base main --head sync/upstream-$REF \
  --title "merge(upstream): sync new-api $REF" --body-file <body>
```

PR 正文用 `.github/PULL_REQUEST_TEMPLATE.md`（仓库所有者的 PR），首行声明 AI 辅助；变更描述 = 评估清单的概括（基线 → REF、commit 数、需适配项及处理、回退项及理由）；运行证明 = P4 实际跑过的命令与结果。把清单文件内容附在折叠块里。

PR 开好后进入 P5.5 出验证清单，然后**停下**：回复里给 PR 链接、冲突/适配摘要和验证清单，等用户确认合并。

## Phase 5.5 — 本地验证清单（必做）

目的：用户在合并前要亲手验一遍上游的修复和新功能。P4 门禁证明"没坏"，这份清单告诉用户"怎么证明确实修了 / 确实能用"。写到 `.tmp/upstream/$REF-verify.md`，回复里完整贴出。

### 来源

逐条过 P2 清单第 4 节里决定为「接受」「需适配」的 commit，以及 P2.5 摘要里影响面为"生产正在踩 / 二开直接依赖 / 客户可感知"的条目；"内部"（重构、依赖、CI、纯 UI 微调）不进清单。每条要从代码里找到真实入口再写，不要凭 commit 标题猜：

```bash
B=sync/upstream-$REF
git grep -n "t('" $B -- web/src/features/<模块>/ | sed -E "s/.*t\('([^']+)'.*/\1/" | sort -u   # 页面按钮 / 开关文案
git grep -n "path: \"/\|\.GET(\|\.POST(" $B -- router/                                     # 新接口路径
git grep -n "OptionMap\[\"<Key>\"\]" $B -- model/option.go                                  # 系统设置项名
git show "${B}:<file>" | sed -n a,bp                                                            # 判定条件（阈值、采样次数、默认值）
```

> 工作区可能已切回 `main`，查代码一律用 `git grep <pat> $B -- <path>` / `git show "${B}:<path>"`（zsh 下 `$B:path` 会被当修饰符，必须 `${B}`）。

### 格式

```
# $REF 本地验证清单（分支 sync/upstream-$REF，PR #N）

## 0. 准备
切分支与起服务的命令（`make api TF_API_PORT=3003`）；要用的账号（管理员项 root，普通用户项 acme）；
relay 项需要的真实渠道 key；控制台 API 取 token 的方法（登录响应 data.access_token，Bearer）。

## 1. 普通用户可验      ## 2. 管理员才可验      ## 3. 需要真实渠道      ## 4. 本地验不了（只靠测试，写明原因）
| # | 变更（sha + 一句人话） | 怎么触发（页面路径 / 按钮文案 / curl） | 看什么（具体的字段值、状态码、文案、时间条件） |

## 5. 收尾
make api-stop；删掉验证时建的令牌 / 渠道 / webhook；切回 main。
```

硬性要求：
- "怎么触发"必须到按钮文案或 curl 级别，"看什么"必须是可判对错的具体值（字段名、状态码、次数、阈值），不写"功能正常"。
- 每条标明角色前提；管理员项与普通用户项分开，用户才能按手头的账号挑着做。
- 有正反两面的改动（开关、白名单、分桶、只发一次）写成对照：开 / 关各一次，命中 / 不命中各一次。
- 涉及时间或采样的（峰谷价、连续 N 次采样、提醒重置）写清判定条件和等待时长。
- 二开适配项（P3 里为编译 / 语义补的代码）单独列回归项，写明二开语义是什么。
- 末尾给**优先级建议**：时间不够只做哪几项，选择标准 = 有迁移的、改二开挂载点的、冲突最大的、与生产计费直接相关的。
- 本地环境已知限制如实写（无渠道、无管理员密码、DNS 环境），不要把验不了的项写成已验。


## Phase 6 — 合并后收尾

- 提示用户用 `/release-standalone` **独立发版**（同步版本不混二开功能），发布报告的"包含提交"写"基于上游 $REF"。
- 清单第 4 节标为"需适配"但本次未处理的项，写进 PR 评论作为后续待办。

## 例外通道：cherry-pick 单个上游 commit

```bash
git fetch upstream
git switch -c fix/upstream-<sha7> main
git cherry-pick -x <sha>
```

同样跑 P4 门禁、按 P5 开 PR（标题 `fix(upstream): cherry-pick <sha7> <原标题>`）。适用：安全修复、数据正确性 fix、我方生产踩到的 bug。不要用它搬 feature。

## 已知坑速查

| 现象 | 处理 |
|------|------|
| `docker-compose.yml` delete/modify 冲突 | 我方用 `compose.yml`，`git rm docker-compose.yml` |
| `web/src/components/config-drawer.tsx` 冲突 | 只保留 `{!isSiteThemeLocked() && (…)}` 这一处接线，其余取上游 |
| `theme-customization-provider.tsx` 冲突 | 接线只有 `useSiteThemePreset` / `siteThemeFont` / `siteThemeRadius` 三处，其余取上游 |
| 上游往 `common/constants.go` 加变量与我方冲突 | 我方二开变量都在 `common/tokenfunc_constants.go`，`constants.go` 直接取上游后补 `SystemName` / `RequestIdKey` 两处改值 |
| `i18n:sync` 把二开 key 挪进 `_extras` | 该 key 没写进 `locales/tokenfunc/en.json`，补上再跑 |
| 上游测试在 PG 上报 `3F000` | 测试 DSN 的 `search_path=test,public` 已处理，见 makefile `TEST_SQL_DSN` 注释 |
| `TestLanguageFromUserSetting` 报 `expected key-values, got a single value` | go-i18n 不接受只有注释的 yaml；`i18n.go` 按 glob 可选加载 `tokenfunc.*.yaml`，没有覆盖项就不要留文件 |
| `i18n:sync` 把某种语言的译文填进其他语言 | sync 以 key 最多的文件为基准填缺失值；二开 key 先写 `tokenfunc/en.json` 再写 `zh.json`，覆盖上游 key 时其他语言填上游原值 |
| 我方调用 `RecordTopupLog` / `i18n.Msg*` 编译失败 | 上游把控制台消息改成前端翻译 key：改用 `common.NewMessage(key, params)` / `common.ApiErrorT(c, key)`，key 的译文加进 `locales/tokenfunc/<lang>.json` |
| 上游 `SysLog(LogText(...))` 与我方 JSON 日志叠加 | `recover.go` / `main.go` 保留 `LogFormatJSON` 分支走 `LogPanic`，文本分支用上游 `LogText`；`logger.go` 的 lumberjack 段整体取我方 |
| 从非 main 分支（stacked PR）建 sync 分支 | `make upstream-merge REF=… BASE=<branch>`；PR base 指向该分支，合并顺序错会把前置 commit 混进 diff |
| 自写 bash 脚本在 macOS 报 `未绑定的变量` | bash 3.2 把 `$var` 紧跟的中文字节当变量名，一律写 `${var}` |
| 品牌名残留 | 上游新增的日志 / 文案里 `New API` 指产品名的要改 `common.SystemName`（`New API channel` 指渠道类型，保留） |
