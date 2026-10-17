---
name: upstream-sync
description: >-
  把上游 QuantumNous/new-api 的 rc tag（v1.0.0-rc.N）同步进 tokenfunc：拉取 → 选 rc → 评估清单 →
  建 sync 分支合并 → 只解冲突 → 门禁（go/bun 测试、make test-db、迁移幂等、二开冒烟）→ 开 PR → 用户确认合并 → 提示独立发版。
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

流程：`P1 选 rc → P2 评估清单 → P3 合并 + 解冲突 → P4 门禁 → P5 开 PR → P6 合并后收尾`。

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

把填好的清单用一句话概括给用户（几个接受 / 几个需适配 / 哪些回退），**不要整段贴**。

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
- 迁移幂等：上游清单第 2 节有 `model/` 或迁移改动时，`make up-build` 启动两次，第二次日志不得再出现 `ALTER TABLE`。
- 二开冒烟（`make api` 后 `http://127.0.0.1:3000`）：`/api/status` 的 `theme=tokenfunc`；企业列表 / 授信 / 报价 / 财务导出 / 手工充值接口返回正常；营销页中文文案与品牌色正常。
- 上游新功能（清单里的 `feat`）至少各点一次。

## Phase 5 — 开 PR

```bash
git push -u origin sync/upstream-$REF
gh pr create -R nanofluxlabs-ai/tokenfunc --base main --head sync/upstream-$REF \
  --title "merge(upstream): sync new-api $REF" --body-file <body>
```

PR 正文用 `.github/PULL_REQUEST_TEMPLATE.md`（仓库所有者的 PR），首行声明 AI 辅助；变更描述 = 评估清单的概括（基线 → REF、commit 数、需适配项及处理、回退项及理由）；运行证明 = P4 实际跑过的命令与结果。把清单文件内容附在折叠块里。

PR 开好后**停下**，告诉用户 PR 链接与冲突/适配摘要，等用户确认合并。

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
