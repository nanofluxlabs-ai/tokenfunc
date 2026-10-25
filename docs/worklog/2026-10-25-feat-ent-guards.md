# 企业主账号在线充值拦截 + 员工凭 API key 查自身（M7）

- 日期：2026-10-25
- 分支：feat/ent-guards
- PR：#47
- 关键 commit：d76df37f0（充值拦截）、89e044525（员工自查接口）

## 背景

企业模块总方案（`~/.claude/plans/company_mgr/M7-guards-employee-me.md`）批次 1 的 M7。两件事都是「设计有、代码没有」：

1. 设计 §3.4 规定企业主账号（预付 / 授信）只能由管理员登记线下充值，但 `/api/user/pay`、兑换码、订阅购买、邀请额度划转这些写 `users.quota` 的入口没有任何拦截，钱包页也照常显示充值卡。
2. 员工拿到的 key 对 `/v1/dashboard/billing/*` 一律 403，员工没有任何渠道知道自己这把 key 的额度、用量和可用模型（tokensolo 有 `/api/employee/me`，黑鹰已拍板开放）。

## 变更

### A. 在线充值拦截

- 后端 `middleware/enterprise.go` 新增 `RejectEnterpriseOwner()`：`GetEnterpriseBillingInfo(c.GetInt("id"))`（15s 进程内缓存）非 nil 即 403，消息用 `common.NewMessage` 作为前端 locale key，常量 `EnterpriseOnlineTopUpRejectedMessage`。
- `router/api-router.go` 只加中间件参数，挂到 16 条路由：selfRoute 的 `POST /topup`、`/pay`、`/amount`、`/stripe/pay|amount`、`/creem/pay`、`/waffo/amount|pay`、`/waffo-pancake/amount|pay`、`/aff_transfer`；subscriptionRoute 的 `/balance/pay`、`/epay/pay`、`/stripe/pay`、`/creem/pay`、`/waffo-pancake/pay`。回调 / notify 不挂。
- `model/enterprise.go` 的 `UpgradeUserToEnterprise` / `CreateEnterpriseWithNewUser` 成功后 `InvalidateEnterpriseBillingInfo(userId)`，消除负缓存的 15s 窗口。
- 前端 `web/src/features/wallet/index.tsx`：复用 `useEnterpriseSelf()`（与 `use-sidebar-view.ts` 同一判定 `Boolean(data)`，M1 合并后改为 `role === 'owner'`），企业主隐藏 `RechargeFormCard`（含兑换码）、`SubscriptionPlansCard`、`AffiliateRewardsCard`，改渲染 `EmptyState` + `Button render={<Link to='/enterprise/overview'/>}`；查询中用 `LoadingState` 占位避免闪现。`WalletStatsCard` 与各弹窗不动，管理员钱包不变。
- i18n：4 个新 key 写入七个 `web/src/i18n/locales/tokenfunc/*.json`（按既有字母序插入，每文件 4 行 diff）。

### B. `GET /v1/enterprise/employee/me`

- 路由挂在 `router/dashboard.go` 根组（TokenAuth，与 `/v1/dashboard/billing/credit` 同处），另给无 `/v1` 别名；不在 `/api/` 下，不进访问令牌作用域规则。
- `model/enterprise_usage.go` 新增：
  - `GetEnterpriseTokenProfile(tokenId)`：组织 JOIN 全部收口在这一个函数，响应字段已按新三层契约命名（`team.name` 取持有人所在部门名、`member` 取员工）；无归属行返回 `ErrEnterpriseResourceNotFound`。函数注释标明「M1 合并后改 JOIN ent_teams / ent_members」。
  - `SumTokenUsage(tokenId, from, to)`、`TopTokenModels(tokenId, from, to, limit)`：按 `token_id` SUM，不按 `period_id` 分组；`CurrentEnterpriseUsageDays()` 按账期时区给今天与月初。
- `controller/enterprise_employee.go` 新文件 `GetEnterpriseEmployeeMe`：非企业 403 `access_denied`；企业停用 403 `insufficient_user_quota`（与 `billing.go` 一致）；key 无归属 / 不属本企业 403 `access_denied`；持有人已停用 403 `access_denied`。响应 `object=enterprise_employee`，含 `enterprise{name,billing_mode}`、`team{name,budget_state:null}`、`member{name,employee_no}|null`、`key{...,quota_policy:null}`、`usage{today,month}`、`top_models`、`models`；不含企业余额 / 授信额度。错误体走 `writeBillingError`（OpenAI error 格式）。
- `controller/model.go`：把 `ListModels` 的内联过滤抽成 `listUserModelNames(c)`（分组可用 + 令牌模型白名单 + 已配置计费），`ListModels` 与本接口共用，上游文件只做这一处抽取。

### 测试

- `controller/enterprise_console_test.go` 追加两个 PG 用例（复用 `setupCreditBillingPostgres`，该夹具表清单补了 `Ability`、`EnterpriseUsageDaily`）：
  - `TestRejectEnterpriseOwnerBlocksOnlineTopUp`：普通用户 200；预付 / 授信企业主 403 且 message 为 locale key；普通用户命中负缓存后升级为企业立即 403。
  - `TestEnterpriseEmployeeMe`：员工 key 200（团队名 / 持有人 / key 额度 / 今日与本月用量 / top_models / `models` 受 `model_limits` 约束 / 顶层不含 `balance`、`limit_quota`）；仅项目归属的 key 200 且 `member=null`；主账号未分配 key 与个人 key 403 `access_denied`；企业停用 403 `insufficient_user_quota`。
- `web/src/features/wallet/__tests__/enterprise-notice.test.tsx`：mock `useEnterpriseSelf`，企业主显示提示与跳转按钮且无充值卡；非企业用户有充值卡无提示；查询中两者都不渲染。

## 验证

数据库：PostgreSQL 17.11（docker `tokenfunc-postgres`，schema `test_agent_a7060ed3bb27fdfa0`）；Go 1.26.0。二开只支持 PG，未跑 SQLite / MySQL。

- `gofmt -l controller model middleware router` 无输出；`go vet ./controller/ ./model/ ./middleware/ ./router/` 通过；`go build ./controller/... ./model/... ./middleware/... ./router/... ./service/...` 通过（`go build ./...` 因 worktree 无 `web/dist` 在 main 包 embed 处失败，与本次改动无关）。
- `make test-db PKG='./controller/ -run "TestRejectEnterpriseOwnerBlocksOnlineTopUp|TestEnterpriseEmployeeMe|TestCreditBillingEndpoints|TestEnterpriseConsoleAccessTokenScopes" -count=1'` → `ok github.com/QuantumNous/new-api/controller 2.190s`。
- `make test-db PKG='./router/ -run TestAccessTokenRouteRulesCoverEveryDashboardRoute -count=1'` → `ok ... router 0.696s`（新路由不在 `/api/` 下，无需登记）。
- `make test-db PKG='./middleware/ ./controller/ ./model/ -count=1'` → 见下方「全量结果」。
- `cd web && bun run typecheck` 通过；`bunx oxlint` 对 `wallet/index.tsx`、新测试文件 0 error。
- `bunx vitest run src/features/wallet/__tests__/enterprise-notice.test.tsx src/features/wallet/__tests__/copy.test.tsx src/i18n/tokenfunc/__tests__/locale-shape.test.ts` → 3 files / 8 tests passed。
- 未做浏览器手工验证（worktree 未起 `make dev`）；验收路径见 M7 文件「验收」。

全量结果：

```
ok  	github.com/QuantumNous/new-api/middleware	0.778s
ok  	github.com/QuantumNous/new-api/controller	46.840s
ok  	github.com/QuantumNous/new-api/model	16.300s
```

## M1 适配（PR #49 合入 main 后）

已按 M1 适配：合并 `origin/main`（`a68a3a4b4`）并把组织关联切到三层模型。`GetEnterpriseTokenProfile` 改 JOIN `ent_teams t` / `ent_members m`（`a.member_id = 0` 为团队公共 key，`member` 返回 `null`），新增 `TeamStatus`；`GetEnterpriseEmployeeMe` 对 `status = archived` 的团队返回 403 `access_denied`（归档本身会停用 key，这里兜底手工重新启用的漂移），持有人停用判断改用 `EnterpriseMemberStatusActive`。`RejectEnterpriseOwner` 仍按 `enterprises.user_id` 判定，只拦企业主账号，绑定登录的成员不拦。钱包页 `isEnterpriseOwner` 改读 `enterprise?.actor?.is_owner`，vitest 补「成员账号与普通用户一致」用例。测试夹具表清单换成 `EnterpriseTeam{} / EnterpriseMember{} / EnterpriseTokenAssignment{}`，「项目公共 key」用例改为「团队公共 key」，新增「归档团队 403」用例。

验证（PostgreSQL 17.11）：`go build ./...`（web/dist 占位后）通过；`make test-db PKG='./model/ ./service/ ./controller/ ./middleware/ ./router/ -count=1'` → `ok model 37.204s / ok service 14.224s / ok controller 49.946s / ok middleware 0.790s / ok router 0.820s`；`cd web && bun run typecheck` 通过；`bunx vitest run` 钱包页 + copy + locale-shape → 3 files / 9 tests passed。

## 遗留

- `team.budget_state`（M14）与 `key.quota_policy`（M4）暂为 `null`，契约字段已占位。
- 多副本下其它节点的 `enterpriseBillingInfoCache` 仍有最多 15s 延迟（已接受的退化，与授信配置变更一致）。
- #48（M8，`627b397ab`）已二次合入：仅 `billing_credit_test.go` 夹具表清单冲突（补 `EnterpriseCreditNotifyRecord`），重跑 `go build ./...`、五包 PG 测试（`ok model 21.300s / service 6.630s / controller 48.221s / middleware 0.750s / router 0.775s`）、typecheck、钱包 vitest（3 files / 9 tests）全部通过。
