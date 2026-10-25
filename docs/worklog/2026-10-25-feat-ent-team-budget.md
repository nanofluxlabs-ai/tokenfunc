# 团队月度预算：告警 + 可选超限拦截（M14）

- 日期：2026-10-25
- 分支：feat/ent-team-budget
- PR：#50
- 关键 commit：439826d5e（后端）、e682b7d74（前端）

## 背景

企业模块总方案批次 2 的 M14（`~/.claude/plans/company_mgr/M14-team-budget.md`）：每个团队可设月度预算（USD）与告警阈值，与 Anthropic workspace spend limit / OpenAI budget alert 同语义。黑鹰拍板：默认只告警（到阈值发一次邮件给企业主 / 企业管理员），勾「超限拦截」后本月剩余时间拒绝该团队 key 的请求；拦截在预扣前，本月消耗 60 秒缓存，接受窗口内略超；预算 0 = 不设。M1（#49）已把 `ent_teams.monthly_budget_quota / budget_alert_percent / budget_enforce` 三列与团队弹窗落地，本分支补判定、通知、拦截与状态展示。

## 变更

- 后端
  - `model/enterprise_team_budget.go`（新）：`ent_team_budget_notify(team_id, month, kind)` 发送记录表，`ClaimTeamBudgetNotify` 用 `ON CONFLICT DO NOTHING` 抢占（多副本安全），进程内 `teamBudgetNotified` 标记键带预算与阈值；团队本月消耗进程内缓存 60 秒（`GetTeamMonthUsage` / `addTeamMonthUsage` / `InvalidateTeamMonthUsage`），本节点写入的用量即时累加；`teamBudgetState` 判档（warn / exceeded）；`TeamBudgetAlertSender` 钩子由 service 注入（model 不能依赖 service）；`fillTeamBudgetStates` 给团队列表回填 `month_quota / budget_percent / budget_state`。
  - `model/enterprise_credit.go`：`EnterpriseBillingInfo` 随 15 秒缓存一并下发 `TeamBudgets`（只含设了预算的团队；表不存在的测试库按无预算处理）。
  - `model/enterprise_usage.go`：`RecordEnterpriseUsage` 成功写入后对设了预算的团队判档并通知。
  - `model/enterprise_org.go`：`UpdateEnterpriseTeam` 改为事务，预算上调清当月 warn + exceeded 记录、只改阈值清 warn，完成后失效计费信息缓存与月消耗缓存；`ListEnterpriseTeams` 回填预算状态。
  - `service/enterprise_team_budget.go`（新）：`checkTeamBudgetGate` 在 `enterpriseBillingGate` 的状态校验之后、任何资金源预扣之前执行，只对 `budget_enforce` 团队生效，`月消耗 + 预估预扣 > 预算` → 403 `team_budget_exceeded`（文案走后端 i18n `quota.team_budget_exceeded`），预付与授信企业都适用；被拦截时按「用尽」补发一次通知。`sendTeamBudgetAlert`：企业账单邮箱 / 联系人邮箱 + `NotifyRootUser("enterprise_team_budget")` + 企业主（非邮箱渠道或邮箱不同时）+ 该团队已绑定登录的团队管理员（webhook / bark / gotify），正文含团队名、预算、已用、百分比、是否拦截与 `/enterprise/organization?team_id=` 链接。
  - `model/main.go` AutoMigrate 登记新表；`i18n/keys.go` + 三语 yaml 新增 `quota.team_budget_exceeded`。
  - 路由不变：预算仍随 `PUT /api/enterprise/teams/:id` 写入，`GET /api/enterprise/teams` 多三个字段，访问令牌规则无需改。
- 前端
  - `types.ts` Team 增加 `month_quota / budget_percent / budget_state`；`lib/team-budget.ts` 的 `isTeamBudgetBlocked`。
  - `components/team-budget-meter.tsx`（新）：团队行下方显示本月消耗 / 预算进度条（`@/components/ui/progress`），warn 黄、exceeded 红并加 `StatusBadge`「Budget warning」/「Over budget」，勾了拦截再加「Blocked by budget」；未设预算不渲染。`team-panel.tsx` 的 TeamRow 接入。
  - `keys-page.tsx` 状态列：所属团队已拦截的 key 追加「Blocked by budget」徽标（读 `useTeams()` 的 `budget_state`）。
  - i18n 七语言 +4 键；新增 `__tests__/team-budget-meter.test.tsx`。

与方案的偏差：方案写「上调预算后清当月 warn 记录」，实现为上调时同时清 warn 与 exceeded（上调到用量之上后再次用尽是新事件，应再通知）；改阈值只清 warn。

合并 main（#51 M3 密钥页重做合入后）：`keys-page.tsx` 以 M3 新页为准，「Blocked by budget」徽标搬进新页 `status` 列的 `API_KEY_STATUSES` 徽标旁（`useTeams` / `blockedTeamIds` 自动合并保留）；M3 在 `enterprise_org.go` 也加了 `enterpriseMonthRange`（返回本月 + 上月四个日期），删掉本分支同名两值版本改为复用；i18n 七文件自动合并。复跑六包 PG ok、typecheck 通过、vitest 13 文件 47 例通过。

合并 main（#47 M7 / #48 M8 合入后）：`EnterpriseBillingInfo` 取两边字段并集（`CreditAlertPercent` + `TeamBudgets`），model / service 两个测试夹具的表列表取并集，`enterprise_credit_funding_test.go` 末尾两个追加的用例都保留；通知收件邮箱改为复用 #48 的 `enterpriseNoticeReceiver`，删掉临时的 `teamBudgetNoticeReceiver`。

## 验证

- 环境：worktree `agent-a9226934be583ba1f`（slot 4，API 3004 / 前端 5177 / schema `dev_agent_a9226934be583ba1f` / `test_agent_a9226934be583ba1f` / Redis db 8、9），`make wt-init` 领取。PostgreSQL 为 `make infra` 的 tokenfunc-postgres 容器。
- `gofmt -l model/ service/ i18n/` 无输出；`GOWORK=off go build ./model/... ./service/... ./controller/... ./middleware/... ./router/... ./i18n/...` 通过（根包因 `web/dist` 未构建不能 `go build ./...`，与本分支无关）。
- `make test-db PKG='./model/ ./service/ ./controller/ ./middleware/ ./router/ ./i18n/'`：六包全部 ok。新增用例：
  - `model.TestEnterpriseTeamBudgetAlertsAndState`：700 不发、800 发一次 warn、850 不重复、1000 发 exceeded、1010 不重复；列表回填 1010 / 101% / exceeded，Default 为 none；8 个 goroutine 并发 Claim 只一方成功、换月键可再抢；上调预算到 2000 后当月记录清空、状态 ok 50%、再到 1610 发第二次 warn；预算改 0 后不再判档。
  - `service.TestBillingSessionTeamBudgetEnforce`：预付企业 Research 团队预算 1000 开拦截，已用 950；预扣 100 → 403 `team_budget_exceeded`、钱包未动、exceeded 通知一次且重复请求不再发；预扣 50 放行、无预算的 Sales 团队 key 放行；直接改库把用量改到 1200（模拟其他副本）60 秒内仍放行、`InvalidateTeamMonthUsage` 后立即 403；关掉拦截立即放行。
  - 首次跑 model 用例失败：表重建后 token id 复用，前一个用例留下的归属缓存（30 秒）把用量记到了别的团队；用例里加 `InvalidateAllTokenAttribution()` 后通过。控制器两处 AutoMigrate 补 `EnterpriseUsageDaily`（团队列表现在要读聚合表）。
- 前端：`bun run typecheck` 通过；改动 6 个文件 `bunx oxfmt --write` + `bunx oxlint -c .oxlintrc.json` 0 error；`bunx vitest run src/features/enterprise-console src/i18n/tokenfunc` 5 个文件 17 例通过（含新增 team-budget-meter 4 例与 locale-shape 守卫）。
- 迁移冒烟：worktree 库 `make api` 两次启动，`information_schema` 看到 `ent_team_budget_notify(team_id bigint, month varchar(7), kind varchar(16), enterprise_id bigint, created_at bigint)`，主键 `(team_id, month, kind)` + `idx_ent_team_budget_notify_enterprise_id`；二次启动 `.tmp/logs/api.out` 无 error / ALTER。
- HTTP 冒烟（worktree 库从主 dev 复制 root 行并重置密码；登录接口返回 JWT，请求带 `Authorization: Bearer` + `New-Api-User`）：root `POST /api/admin/enterprise/enterprises` 新建 m14acme → 企业主 `GET /api/enterprise/teams` 返回 `month_quota:0, budget_percent:0, budget_state:"none"` → `PUT /teams/1 {monthly_budget_usd:1, budget_alert_percent:80, budget_enforce:true}` → 列表 `monthly_budget_quota:500000, budget_state:"ok"` → 直接写 `ent_usage_daily` 425000 → `budget_percent:85, budget_state:"warn"` → 改 600000 → `120 / exceeded`。
- 浏览器（前端 5177，m14acme 登录）：团队页 Default 行显示橙色进度条「$0.85 / $1 Budget warning」（`.tmp/m14-team-budget.png`）；改为超预算后显示红条「$1.2 / $1 Over budget Blocked by budget」（`.tmp/m14-team-exceeded.png`）；密钥页 m14-smoke 行状态列「Enabled」+「Blocked by budget」（`.tmp/m14-keys-blocked.png`）。
- 未验证：真实 relay 请求被 403（本地无渠道，拦截路径靠 `TestBillingSessionTeamBudgetEnforce` 覆盖）；邮件实际投递（本地无 SMTP，发送函数在测试里被替换为收集器）。
- 合并 main 后复跑：`make test-db` 六包 ok（含 #48 的 `TestCreditFundingAlerts` 与本分支 `TestBillingSessionTeamBudgetEnforce` 同文件共存）；`bun run typecheck` 通过；`bunx vitest run src/features/enterprise-console src/i18n/tokenfunc src/features/enterprises` 10 文件 39 例通过。

## 遗留

- M6 概览待办「N 个团队预算告警 / M 个已拦截」按方案归 M6，本分支未做；团队列表已下发 `budget_state` 可直接汇总。
- 预算通知邮件正文为英文（与 M8 授信预警一致），后端通知文案 i18n 化留待统一处理。
- 本月消耗缓存是进程内的：多副本下其他节点写入的用量最多延迟 60 秒，拦截可能略超一个窗口（已拍板接受）。
- worktree 库里留有冒烟数据（企业 m14acme、Default 团队预算 1 USD、key m14-smoke、一条 600000 quota 的聚合行），PR 合并后随 `make wt-clean` 删除。
