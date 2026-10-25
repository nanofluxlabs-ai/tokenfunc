# 团队页：URL 筛选、本月消耗、设管理员、路由改为 /enterprise/teams（M2）

- 日期：2026-10-26
- 分支：feat/ent-teams-page
- PR：#55
- 关键 commit：aa97f0211

## 背景

总方案批次 3 的 M2（`~/.claude/plans/company_mgr/M2-organization-page.md`）。M1 已把组织页改成团队 + 成员的基本形态，M3 提供了发放密钥抽屉，M14 加了团队预算进度条；本模块补齐团队页剩下的交互：筛选进 URL、成员本月消耗与深链、设团队管理员、团队角色的裁剪，并把路由收口到 `/enterprise/teams`。

## 变更

- 后端：`ListEnterpriseMembers` SELECT 追加 `month_quota`（`ent_usage_daily` 按 `member_id` 自本月 1 日起 SUM，复用 M3 的 `enterpriseMonthRange`），`EnterpriseMemberListItem.MonthQuota`；无新路由。
- 前端
  - 路由：新增 `routes/_authenticated/enterprise/teams.tsx`（search `team_id | status | login | q | page`，`search-schema.ts enterpriseTeamsSearchSchema`）；`organization.tsx` 与 `projects.tsx` 改为重定向到 `/enterprise/teams`；`usage.tsx` 加 search（`group_by | team_id | member_id`，`enterpriseUsageSearchSchema`），`UsagePanel` 加 `initialGroupBy`，用量页按 URL 初始化维度与过滤；`routeTree.gen.ts` 用 `@tanstack/router-generator` 重新生成；侧边栏「Teams」指向 `/enterprise/teams`。
  - `teams-page.tsx`（替代 `organization-page.tsx`）：选中团队与成员筛选全在 URL；页头动作「导入 CSV」「添加成员」（team_admin+）「新建团队」（enterprise_admin+）；team_admin / developer 固定本团队、左栏无「全部成员」。
  - `team-panel.tsx`：去掉面板内新建按钮；团队行加「设团队管理员」（`team-admin-dialog.tsx`：`MemberPicker` 按团队 + 仅可登录成员筛选，调 `PUT /members/:id/role` 置 team_admin）；`MemberPicker` 加 `hasLogin` 参数。
  - `members-section.tsx`：筛选条加状态（在职 / 停用）与登录状态（可登录 / 仅密钥）两个下拉并写 URL；新列「本月消耗」深链 `/enterprise/usage?group_by=token&member_id=`；密钥数深链带 `team_id`；行操作改为「发放密钥」按钮 + 更多菜单（控制台登录 / 编辑 / 停用或启用 / 删除），developer 只剩发放密钥；「No login」改「仅密钥」。
  - i18n 七语言 +9 键。
- 测试：Go `TestEnterpriseUsageAggregationSnapshotsAttribution` 补成员列表 `month_quota` 断言；vitest 新增 `teams-page.test.tsx`（URL → 请求参数与深链 href、选团队写 URL、owner 动作与行菜单、developer 裁剪）。

## 验证

- `make test-db PKG='./model/ -run "TestEnterpriseUsageAggregationSnapshotsAttribution|TestEnterpriseTeamsAndMembers"'` ok；五包回归见下。
- `bun run typecheck` 通过；改动文件 oxlint 0 error；`vitest run src/features/enterprise-console src/i18n src/hooks` 16 文件 66 用例通过；`src/features/enterprises src/features/finance src/components/layout` 19 文件 66 用例通过。
- 五包回归：`make test-db PKG='./model/ ./service/ ./controller/ ./middleware/ ./router/ -count=1'`（PG）全部 ok（model 22.8s / service 8.2s / controller 54.8s / middleware 0.9s / router 0.8s）。

## 遗留

- 浏览器验收未做（批次 3 并行期间会话限额吃紧，先靠 vitest / Go 用例）。
- M6 概览的团队预算深链若仍指向 `/enterprise/organization`，靠重定向可达但会丢 `team_id`，M6 合并后改一行。
- 成员「本月消耗」只统计持有人为该成员的 key，团队公共 key 的消耗落在团队列不落成员列（与归因快照口径一致）。
