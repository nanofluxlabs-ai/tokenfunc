# 企业员工账号从个人用户列表分离，系统管理员只读查看企业成员

- 日期：2026-10-26
- 分支：worktree-feat-enterprise-member-visibility
- PR：#61
- 关键 commit：见 PR

## 背景

企业管理员 / 团队管理员给成员开通或绑定登录账号后，该账号出现在系统管理员的「个人用户」列表里，与自然注册用户混在一起，员工多了无法辨认，系统管理员还能直接把它删掉。顺带发现 `controller/user.go` 对企业**主账号**也没有任何删除 / 禁用保护，硬删主账号会让企业变孤儿。

根因：个人列表的过滤 `EnterpriseUserTypeScope` 只排除了 `enterprises.user_id`（主账号），没有排除 `ent_members.user_id`（员工账号）。

决策：
- 归属标识反查 `ent_members`，不在 `users` 表加列（沿用设计基线「不在 users 表加字段」，`ent_members.user_id` 是唯一事实来源，避免双写）。
- 系统管理员查看员工：企业用户页签的企业表加成员数列 + 「成员」行操作，打开**只读**侧边抽屉，与账务抽屉同一交互。不做行展开（成员上百人要分页搜索）、不做独立页面（企业数量少）。
- 解绑后被停用的开通账号会回到个人列表，在 `users.remark` 写固定备注「企业员工」供管理员识别清理（用户要求）。

## 变更

后端
- `model/enterprise.go`：`EnterpriseUserTypeScope` 的 personal 分支追加 `NOT EXISTS ent_members(user_id = users.id AND deleted_at IS NULL)`；`ListEnterprises` 增加 `member_count` / `login_count` 子查询，`EnterpriseListItem` 加对应字段。
- `model/enterprise_org.go`：新增 `EnterpriseUnboundRemark`（固定备注「企业员工」）与 `markProvisionedLoginUnbound`（只在解绑、删除成员两条路径写 remark，管理员手写备注不覆盖；再次开通时清掉）；新增 `GetUserEnterpriseAffiliation` 查账号归属（主账号 / 在职成员 / 无）。
- `controller/enterprise_admin.go`：`rejectEnterpriseAffiliatedUser` 守卫与 `AdminListEnterpriseMembers` 只读成员列表（全企业范围，复用 `ListEnterpriseMembers`）。
- `controller/user.go`：`DeleteUser`（硬删）、`ManageUser` 的 disable / delete / promote 三个分支接入守卫，被拒时提示去企业模块；enable / demote / UpdateUser 不拦。
- `router/enterprise-router.go`：`GET /api/admin/enterprise/enterprises/:id/members`。

前端（`web/src/features/enterprises/`）
- 企业表加 Members 列（人数 + 可登录人数）；行操作加「成员」图标按钮。
- 新组件 `enterprise-members-drawer.tsx`：Sheet + `drawer-layout`，搜索 + 登录筛选 + 分页表（`DataTablePage` / `useDataTable`，与企业控制台成员表同一套），无任何写操作；`FilterSelect` 从企业控制台 `members-section.tsx` 导出复用。
- 文案写入 `web/src/i18n/locales/tokenfunc/*.json` 七个语言文件。

文档
- `docs/tokenfunc/enterprise-design.md` §2.3 / §8 / §9 补充上述规则。

## 验证

- `GOWORK=off go build ./...`、`gofmt -l`、`go vet ./model ./controller ./router` 通过。
- PG 实库（worktree 独立 schema `test_feat_enterprise_member_visibility`）：
  - `go test ./model -run 'TestEnterprisePersonalScopeAndAffiliation|TestEnterpriseMemberLoginAndAccess|TestEnterpriseCreateAndUpgrade'` 通过：主账号 / 绑定员工 / 开通员工均不在 personal scope；解绑、删除成员后回到列表；孤儿账号 remark 为「企业员工」，再开通后清空；管理员手写备注不覆盖；`member_count` / `login_count` 计数正确。
  - `go test ./controller -run TestAdminCannotManageEnterpriseAffiliatedUsers` 通过：root 对员工账号 disable / delete / promote 与对主账号硬删均被拒；enable 不拦；解绑后放行。
- 接口冒烟（worktree `make api`，端口 3002，脚本走 setup → 建企业 → 企业主建成员并一键开通 → 管理员接口）：`GET /api/user/?user_type=personal` 不含主账号与开通账号，`search` 同样命中 0；企业列表 `member_count=1 / login_count=1`；`GET /enterprises/:id/members?has_login=true` 返回该成员含 username / role / team_name；管理员对员工 disable / delete / promote 与对主账号 `DELETE /api/user/:id` 均返回 "This account belongs to an enterprise, manage it from the enterprise module"；企业主解绑后该账号以 status=2、remark「企业员工」回到个人列表，`login_count` 归 0，此时管理员 disable 进入二次验证（403），说明守卫已放行。
- 前端：`bun run typecheck` 通过；`oxlint` 对改动文件无报错（全量 lint 的报错均为既有文件 `scripts/sync-i18n.mjs`、`src/assets/*.tsx`，与本次无关）；`vitest src/features/enterprises` 6 个文件 30 用例通过，新增抽屉测试覆盖渲染 / 空态 / 关键字与登录筛选透传。

## 遗留

- 员工解绑后的开通账号以 disabled + 备注「企业员工」回到个人列表，由管理员决定是否硬删；硬删后再开通会新建账号，不影响复用逻辑。
- 企业开通账号的「任务日志 / 用量日志」入口永远为空、企业级审计缺失，均待另开任务。
- `ProvisionEnterpriseMemberLogin` 开通账号时 `FinishInsert` 仍写一条「新人赠送额度」日志但实际余额 0，既有瑕疵未处理。
