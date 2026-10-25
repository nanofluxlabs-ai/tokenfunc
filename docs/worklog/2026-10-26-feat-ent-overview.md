# 企业概览页重做：KPI 四卡 / 待办 / 近 30 天柱图 / 折叠财务区，按角色裁剪（M6）

- 日期：2026-10-26
- 分支：feat/ent-overview（worktree `agent-abaac5dbe5e05f7cf`，slot 3）
- PR：#59
- 关键 commit：b43d8103f（后端）、3227d3d24（前端）

## 背景

企业概览原来只有「计费模式 / 本期已用 / 当前账期」三张卡加两张财务表，团队角色登录后只剩企业资料，回答不了「钱用到哪了、有什么风险、入口在哪」。按 `~/.claude/plans/company_mgr/M6-enterprise-overview.md` 重做：概览 = 状态 + 风险 + 入口，Top 列表与用量报表重叠不做；team_admin / developer 只见本团队卡与图，不见授信 / 余额 / 账单待办。

## 变更

后端：

- `GET /api/enterprise/overview` 扩展：`month{quota, prev_quota}`、`keys{total, active, disabled, exhausted, expired, expiring_7d}`、`org{teams, members, login_members}`、`daily[30]`（补零）、`todos{unpaid_bills, overdue_bills, exhausted_keys, expiring_keys, credit_alert_hit, team_budget_warn[], team_budget_exceeded[]}`、`team_budget`（团队角色本团队预算）、`scope`（团队角色的 team_id / team_name）。全部来自 `tokens` / `ent_*` / `ent_usage_daily`，不扫 `logs`。
- 团队角色（scope 非 nil）只返回本团队的统计；账单计数、授信预警、余额、当前账期仍只对企业主 / 企业管理员下发。
- key 四态按余额与到期时间派生（Redis 模式下 `tokens.status` 不回写）：过期 > 耗尽 > 停用 > 启用，一把 key 只归一档；`expiring_7d` 只数仍启用且 7 天内到期的。
- 新增 `model.SummarizeEnterpriseUsageByDay`（补零）、`model.CountEnterpriseOutstandingBills`、`model/enterprise_overview.go`（key / 组织计数与统计组装）。

前端：

- `overview-page.tsx` 重写：`OverviewKpiCards`（本期已用 / 余额与最近充值 / 团队角色本团队消耗与预算 → 本月消耗环比 → 活跃密钥与即将过期 → 团队 · 成员）→ `OverviewTodos`（按严重程度排序，无待办不渲染）→ 近 30 天柱图 → `Collapsible` 账期 / 流水（默认收起、展开再请求；团队角色不渲染）。
- 深链：活跃密钥 → `/enterprise/keys`；耗尽 → `?status=4`；即将过期 → `?expiring=true`；团队预算 → `/enterprise/teams?team_id=`；本月消耗 / 柱图 → `/enterprise/usage`；账单 → `/enterprise/bills`。
- 柱图抽成共享组件 `web/src/components/charts/daily-quota-bar-chart.tsx`，`promoter-center` 的每日 tab 改用它。
- `TeamBudgetMeter` / `isTeamBudgetBlocked` 的入参放宽为最小字段集 `TeamBudgetView`，概览直接复用。
- 新文案写入七个 `web/src/i18n/locales/tokenfunc/*.json`。

## 验证

- `make wt-init`：领到 slot 3（API 3003 / 前端 5176 / schema `dev_agent_abaac5dbe5e05f7cf` / `test_agent_abaac5dbe5e05f7cf` / Redis 6、7）。
- `make test-db PKG='./controller/ -run TestEnterpriseConsoleOverview -count=1'`：ok。用例覆盖 6 把 key 的四态派生（2 耗尽含 1 把 remain_quota=0、1 过期按 expired_time、1 把 7 天内到期）、2 张未结清账单其中 1 张逾期、Research 团队超预算且拦截、30 天补零、授信 90% 命中 80% 预警；team_admin 只拿到本团队 4 把 key、本团队预算，`open_period` 为 null、账单计数为 0。
- `make test-db PKG='./controller/ ./model/ ./middleware/ ./router/ -run "Enterprise|AccessTokenRoute" -count=1'`：四包 ok。期间发现 `TestEnterpriseConsoleMemberRoles` 单跑会因列名未初始化失败（`SQL logic error: near "FROM"`，依赖前面用例顺带初始化），补了 `model.InitColumnNames()`。
- `cd web && bun run typecheck`：通过；`bunx oxlint -c .oxlintrc.json <改动文件>`：无 error（修掉一处 `no-array-index-key`）；`bunx oxfmt --write` 已跑。
- `bunx vitest run src/features/enterprise-console src/features/promoter-center src/i18n/tokenfunc`：enterprise-console 13 文件 48 用例通过，promoter-center 与 locale-shape 通过。新增 `overview-page.test.tsx`（授信 / 预付 / 团队角色三种渲染、待办为空不渲染、深链 href、财务区默认收起且不请求）与 `lib/__tests__/overview.test.ts`（环比与待办排序）。
- 浏览器（`make api` + `make web`，本 worktree 的 3003 / 5176，dev schema 新初始化后用脚本建 Acme Robotics 授信企业、3 个团队、3 个成员、7 把 key，再写 30 天用量 / 本期已用 $1,240 / 一张逾期账单）：
  - 企业主登录：四卡「$1,240 / $5,000 · Period #1 · 预警 80%」「$1,844 · +479.9% vs last month」「5 / 7 · 1 把 7 天内过期」「4 · 3 · 1 人可登录」；待办四条（逾期账单 → 账单、耗尽 key → `?status=4`、Research 预算 88% → 团队、即将过期 → `?expiring=true`）；柱图 30 根；账期 / 流水默认收起，展开后各自出表。截图 `.tmp/m6_overview_owner_credit.jpg`。
  - 研发 team_admin 登录：第一张卡变「Team spend this month $1,328 / $1,500 · Budget warning」，第四张卡「Research · Members 2」，待办只有本团队 key 与预算，没有账单条目，没有账期 / 流水区。截图 `.tmp/m6_overview_team_admin.jpg`。
- 合并 `origin/main`（含 #53 M10、#54 M11、#55 M2、#56 M12）后重跑了上述 Go / vitest / typecheck。

## 遗留

- 方案提到的页头 `EnterpriseRoleBadge`（M1）在仓库里不存在，未加。
- 耗尽 / 过期按余额与到期时间派生，Redis 模式下密钥页 `?status=4` 筛选仍按 `tokens.status`，待办数字可能略多于筛选结果；与密钥页口径统一需另改 M3 的筛选。
- 团队角色第一张卡里标题与预算进度条各显示一次「已用 / 预算」，略有重复，保留了 `TeamBudgetMeter` 原样以免分叉。
