# M8 告警三件套：授信额度预警 / 出账失败退避告警 / 对账差异告警与列表

- 日期：2026-10-25
- 分支：feat/ent-alerts
- PR：#48
- 关键 commit：96e3f0699（A 授信预警）、b1d98f66a（B 出账退避 + 出账入口）、ccc1995b7（C 对账差异接口与前端）

## 背景

对照 tokensolo 的企业运营能力审查（总方案 M8）发现三处「出了事没人知道」：

1. 授信企业的 `SettleBilling` 对 `BillingSourceCredit` 跳过上游 `checkAndSendQuotaNotify`，额度用尽前没有任何通知，直接 403 停服。
2. 出账任务 `runEnterpriseBillingOnce` 失败只 `LogWarn`，每分钟原样重试、没有告警（tokensolo 曾因同类问题 PG 打满四天半）。
3. 出账时的 `reconcile_diff_quota`（计数器 vs 明细聚合）只落字段，没有通知、没有列表、不能确认闭环。

## 变更

### A. 授信额度预警（后端 + 前端）

- `enterprises.credit_alert_percent`（默认 80，0..99，0 关闭）进 `EnterpriseCreditConfig.AlertPercent` 与 `EnterpriseBillingInfo` 15s 缓存；管理员 `PUT /enterprises/:id/credit` 新增可选 `alert_percent`，缺省沿用当前值（首次开通为 80）。
- 新表 `ent_credit_notify_records(period_id, kind) PK`，`ClaimCreditNotify` 用 `ON CONFLICT DO NOTHING` 抢占发送权，多副本安全；`ConfigureEnterpriseCredit` 在额度上调或阈值变化时删当前 open 期的 `warn` 记录，`exhausted` 保留。
- 热路径：`AddCreditUsageReturning` 在同一条 UPDATE 上加 `RETURNING id, used_quota, limit_quota`（`Model(&period).Clauses(clause.Returning)`），`AddCreditUsage` 改为薄封装，`ApplyCreditSettlement` 返回实际记账账期的 `CreditUsageState`（`service/quota.go` 直扣路径只改调用签名）。`CreditFunding` 在预扣成功 / 结算后用 RETURNING 的计数判档，不回查账期；预扣被拒（即将 403）直接按 `exhausted` 处理（失败路径复用已查到的 open 期；`reserveExtra` 的 403 多一次 PK 读）。
- `service/enterprise_credit_alert.go`：进程内 `sync.Map` 键 `periodId|kind|limit`（额度上调后键变化，配合 DB 记录清除可重触发），命中后异步 `ClaimCreditNotify`，成功才发送：企业账单邮箱（`enterpriseNoticeReceiver`，与账单邮件共用）+ `NotifyRootUser("enterprise_credit_alert")` 必发 + 主账号 `NotifyUser`（仅当通知渠道是 webhook/bark/gotify，或通知邮箱与账单邮箱不同）。阈值为 0 时连 `exhausted` 也不发。
- 前端：`credit-config-form.tsx` 新增「用量预警阈值（%）」；企业概览进度条下显示阈值说明与「已达预警阈值 / 额度已用尽」徽标（`credit-alert-hint.tsx`）。

### B. 出账失败退避 + 告警

- `runEnterpriseBillingOnce` 按账期维护进程内退避 `billingIssueBackoff`（1/2/4/8/16/30 分钟，与 `bill_archive_task.go` 同一模式），退避期内跳过；连续失败 ≥3 次复用 `logArchiveAlert("enterprise_billing_issue:<period>")` 通知 root（24h 去重），成功后清零、清去重键并发一条恢复通知；零消费账期 `nil, nil` 视为成功。
- `service/enterprise_billing_issue.go`：`issueCreditBill` 包变量（默认 `model.IssueCreditBill`）便于测试注入；`IssueCreditBillAndNotify` 成为出账唯一入口（任务 + 管理员手动出账）。

### C. 对账差异告警 + 列表

- `ent_bills` 新增 `reconcile_acked_at / reconcile_acked_by / reconcile_ack_note`；`IssueCreditBillAndNotify` 出账后 `ReconcileDiffQuota != 0` 时 `NotifyRootUser("enterprise_reconcile_diff")`（企业名、bill_no、计数器 / 明细 / 差额 USD、`/finance/bills/bill-<id>` 链接），对已出账的期重复调用不重复通知（先读账期状态）。
- `GET /api/admin/enterprise/reconcile/alerts?state=pending|acked|all&enterprise_id=&p=&page_size=`（`ListReconcileAlerts`，企业名复用 `financeEnterpriseBriefs`，明细合计读快照 `detail_total_quota`，旧快照回退 `amount − diff`）；`POST /api/admin/enterprise/reconcile/alerts/:bill_id/ack {note}`（幂等、不覆盖首次备注，审计 `enterprise.reconcile.ack`）；`EnterpriseBillFilter.ReconcileDiffOnly`，`/api/admin/enterprise/bills` 与 `/api/admin/finance/bills` 接受 `reconcile=diff`。两条新路由登记 `middleware/access_token_routes_enterprise.go`（`billing:read` / `billing:write`）。
- 前端：`bills-admin-page.tsx` 新增 `reconcile` Tab（`reconcile: 'diff'`），`bills-table.tsx` 新增 `showReconcile` 列（`ReconcileDiffCell`：无差异「—」、未核对 warning 徽标、已核对 check + 确认人），企业侧 `bills-page.tsx` 不开启；财务账单详情 `reconcile-diff-alert.tsx`：差异 `Alert` +「标记已核对」，`ReconcileAckDialog`（`ConfirmDialog` + 备注）由 `BillDetailPage` 在 `SectionPageLayout` 外渲染，成功后失效 `[admin-finance, bill]` 与 `[admin-enterprise]`。
- 新文案 18 条写入七个 `web/src/i18n/locales/tokenfunc/*.json`。

## 验证

环境：worktree slot 3（`make wt-init`），PostgreSQL 17.11（docker `tokenfunc-postgres`，schema `test_agent_a5fc80a95356c106e`），Go 1.26.0 darwin/arm64，二开代码只支持 PG。

- `go build ./...` 通过（需先放一个 `web/dist/index.html` 占位满足 embed）；`gofmt -l model/ service/ controller/ router/ middleware/` 无输出；`go vet` 五个包无告警。
- `make test-db PKG='./model/ ./service/ ./controller/ ./middleware/ ./router/ -count=1'`（PG）：
  ```
  ok  github.com/QuantumNous/new-api/model       20.199s
  ok  github.com/QuantumNous/new-api/service      7.169s
  ok  github.com/QuantumNous/new-api/controller  50.058s
  ok  github.com/QuantumNous/new-api/middleware   0.813s
  ok  github.com/QuantumNous/new-api/router       0.837s
  ```
  覆盖 `TestAccessTokenRouteRulesCoverEveryDashboardRoute`（新路由已登记）。
- 新增 / 扩展用例（均 PASS）：
  - `service/enterprise_credit_funding_test.go TestCreditFundingAlerts`：70% 不发、85% warn 一次、继续消费不重复、403 触发 exhausted 一次、额度上调后两 goroutine 并发只一方 Claim、percent=0 连 403 都不发、滚入新期重触发；`TestBillingSessionCreditLifecycle` 等既有用例在 RETURNING 改造后回归通过。
  - `service/enterprise_billing_issue_test.go TestEnterpriseBillingIssueBackoffAndReconcileNotify`：注入失败后 1 分钟内不重试、第 2/3/4 次按 2/4/8 分钟退避、第 3 次告警且第 4 次不重复、恢复后清零 + 恢复通知 + 差异通知各一次（含 bill_no 与详情链接）、幂等重调不重复通知、一致账单不通知、零消费账期不计失败。
  - `model/enterprise_test.go`：`AddCreditUsageReturning` 返回值、`ClaimCreditNotify` 抢占 / 上调额度后 warn 重新可抢、`ApplyCreditSettlement` 跨期返回 open 期计数、`ListReconcileAlerts` 分页 / state / 非法 state、`ReconcileDiffOnly` 筛选、`AckReconcileAlert` 幂等与不存在账单。
- 前端：`bun run typecheck` 通过；`bunx vitest run` 相关目录 8 个文件 27 用例通过（新增 `credit-alert-hint.test.tsx`、`reconcile-diff-alert.test.tsx`、`bills-admin-page-reconcile.test.tsx`，`locale-shape.test.ts` 七文件键集一致）；`bunx oxlint` 对改动文件无 error；只对新 / 改文件跑了 `bunx oxfmt --write`。
- 过程中发现并修复：service 包全量跑时 `TestFixedPriceBillingDatabaseMatrix/sqlite` 失败，根因是 funding 测试把授信态留在按 user_id 的进程内缓存里、后续 sqlite 用例同 id 用户命中授信路径；已在 `newCreditEnterprise` 加 `t.Cleanup` 失效缓存（与 controller 测试同做法）。
- 未做：浏览器手工验收（acme 调额 → 收邮件、人工制造差异出账 → 财务 Tab 可见并 ack）；`make dev` 冒烟未跑。

## 遗留

- 预警邮件 / 通知正文沿用企业账单邮件的英文模板，未接入后端 i18n（与 `sendEnterpriseBillEmail`、渠道健康告警一致），后续统一处理。
- 进程内已发标记与出账退避计数在重启或换节点后清零：最多多发一次预警 / 立即重试一次出账，出账幂等，已接受（总方案 §7）。
- `GET /reconcile/alerts` 目前前端未直接调用（财务 Tab 走 `bills?reconcile=diff` 复用 `BillsTable`），接口留给 M6 概览待办。
- `service/quota.go` 直扣路径（违规费）记入授信账期但不触发预警；额度信用模式（M10）需在同一 `checkCreditAlert` 上扩展。
