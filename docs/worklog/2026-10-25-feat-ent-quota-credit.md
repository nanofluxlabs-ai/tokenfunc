# 授信新增额度信用模式 quota_based（用满翻转 / auto_reset / 待收款）

- 日期：2026-10-25
- 分支：feat/ent-quota-credit（worktree `agent-a4af1e5688534965d`，slot 8）
- PR：#53
- 关键 commit：b528c0e39（后端）、aa4e166d2（前端）

## 背景

企业模块总方案 §2.1 第 16 行 / 模块方案 `M10-quota-based-credit.md`：对标 tokensolo 的 `quota_credit`，授信账期不按时间而按「额度用尽」翻转。`auto_reset=true` 用尽即出账并开新期；`auto_reset=false` 用尽后拒绝请求，直到账单收款或管理员手动开期。依赖 M8 已合入的预警 / `AddCreditUsageReturning` / 出账退避。

## 变更

后端（PG 专属，不动 `service/billing.go` 预扣 / 结算主链路）：

- `model/enterprise.go`：常量 `EnterpriseCreditCycleQuotaBased`；`Enterprise.CreditAutoReset`（`not null;default:false`，AutoMigrate 自动加列）。
- `model/enterprise_credit.go`：
  - `EnterpriseCreditConfig.AutoReset`；`validate()` 要求 quota_based 的 `LimitQuota > 0`（额度为 0 会在首次预扣就翻转成死循环）。
  - `creditPeriodBounds` 对 quota_based 返回 `[now, 0)`；`ensureOpenCreditPeriodTx` 把 `end_at=0` 视为永不到期；没有 open 期且 quota_based && !auto_reset && 已有历史期 → `ErrEnterpriseCreditAwaitingPayment`。
  - `ConfigureEnterpriseCredit`：待收款时改配置不开期（只更新企业配置与流水）；从预付刚切回授信（`freshEnable`）则直接开第一期，避免卡死。
  - 新增 `RolloverExhaustedCreditPeriod(enterpriseId, periodId) (next, rolled, err)`：企业行锁 + 账期行锁内 open→closing（`closed_at=now`），auto_reset 时同事务 Create `period_no+1`、`end_at=0`、`limit=企业当前额度` 的新期；非 quota_based 或 `used_quota=0` 不翻转（单笔请求超整期额度不留空期）；已被别的请求翻过则返回当前 open。提交后失效计费信息缓存。
  - 新增 `openNextCreditPeriodTx` / `OpenNextCreditPeriod(enterpriseId, operatorId, reason)`：无 open 期时开 `max(period_no)+1`，写 `credit_limit_change` 流水（detail 带 reason）；已有 open 期返回 `ErrEnterpriseCreditPeriodAlreadyOpen`。
  - `RolloverDueCreditPeriods`：时间滚动加 `end_at > 0`；再扫 `status=open AND used_quota >= limit_quota` 且企业为 quota_based 的期逐个 `RolloverExhaustedCreditPeriod`（结算补扣推过额度但无新请求时兜底）。
  - `ApplyCreditSettlement`：待收款期间没有 open 期，差额只写 `cross_period_adjustment` 流水、不动计数器（由 M11 调账兜底）。
- `model/enterprise_bill.go`：`IssueCreditBill` 的 `PeriodEnd` 在 `end_at=0` 时取 `closed_at`；`RegisterBillPayment` 结清分支同事务 `lockEnterprise` 后对 quota_based && !auto_reset 且无 open 期的企业开下一期（reason `bill_paid`），提交后失效缓存。
- `service/enterprise_credit_funding.go` `PreConsume` 重写为最多 3 轮：缓存账期落后 → 换最新 open 期重试；无 open 期 → `EnsureOpenCreditPeriod`（待收款直接返回）；同一 open 期额度不足 → 先按「用尽」告警一次，再 `RolloverExhaustedCreditPeriod`，翻转成功在新期重试（每请求最多翻一次），翻转后无新期返回 `ErrEnterpriseCreditAwaitingPayment`，未翻转返回 `ErrInsufficientCreditQuota`。
- `service/billing_session.go`：`ErrEnterpriseCreditAwaitingPayment` → 403 `insufficient_user_quota`，文案走 i18n `quota.enterprise_credit_awaiting_payment`（en / zh-CN / zh-TW）。
- `service/enterprise_credit_alert.go`：用尽告警正文按 quota_based + auto_reset 区分「已自动开启下一期」/「待收款」。
- `controller/billing.go`：`CreditBillingResponse` 加 `credit_auto_reset`；无 open 期且 quota_based && !auto_reset 返回 403 `credit_period_awaiting_payment`（其余仍 404 `credit_period_not_found`）；`GetSubscription` 的 `access_until` 对 `end_at=0` 自然为 0。
- `controller/enterprise_billing.go`：授信配置请求加 `auto_reset`（只对 quota_based 生效）；新增 `AdminOpenEnterpriseCreditPeriod`（`POST /api/admin/enterprise/enterprises/:id/credit-periods/open`，审计 `enterprise.credit.period_open`，access token 规则 `billing:write`）。

前端：

- `enterprises/components/credit-config-form.tsx`：周期类型加「按额度」，选中时隐藏天数、显示「用满自动开下一期」Switch，额度必须 > 0（zod refine）。
- `enterprises/components/enterprise-billing-drawer.tsx`：待收款状态提示 + 「手动开下一期」按钮（复用 ConfirmDialog 二次确认）。
- `enterprises/components/enterprises-columns.tsx`：周期列 `By quota`；账期列对 `end_at=0` 显示 `start ~ —`。
- `enterprise-console/lib/credit-period.ts`（新）：`formatCreditPeriodRange`（`end_at=0` 已关闭用 `closed_at`，进行中显示 `—`）与 `isCreditAwaitingPayment`；账期表与概览页复用；概览页按 quota_based / auto_reset 调整说明文案，待收款显示徽标与提示。
- 类型：`CreditPeriod.closed_at`、`Enterprise.credit_auto_reset`、`CreditConfigPayload.auto_reset`；新增 `openCreditPeriod` API；审计模板补 `enterprise.credit.period_open`；七个 `i18n/locales/tokenfunc/*.json` 补 13 条文案。

与模块方案的偏差：

- `RolloverExhaustedCreditPeriod` 不做 23505 捕获后重读（PG 事务内 INSERT 失败即中止，无法在同一事务继续）；唯一 open 期靠企业行锁串行保证，并发用例验证只产生一个新期。
- 翻转依据企业当前 `credit_cycle_type` 而非账期 `end_at`：从自然月改为 quota_based 时，当前时间期保留到期末（周期类型从下一期生效），但若中途用满会提前翻转成额度信用期。
- `/v1/dashboard/billing/credit` 只在 `!auto_reset` 时返回 `credit_period_awaiting_payment`；auto_reset=true 没有 open 期属于瞬时异常，仍返回 404。
- `PreConsume` 用 3 轮（缓存刷新 + 翻转各占一轮）而不是方案里的 2 轮，避免缓存落后的副本在翻转前就 403。

## 验证

- `make wt-init`：slot 8，API 3008 / 前端 5181，schema `dev_agent_a4af1e5688534965d` / `test_agent_a4af1e5688534965d`，Redis db 16 / 17。
- `GOWORK=off go vet ./model/ ./service/ ./controller/ ./middleware/ ./router/ ./i18n/`：无输出。
- `make test-db PKG="./model/ -run 'TestEnterpriseQuotaBasedCredit|TestEnterpriseCreditPeriodsAndUsage|TestEnterpriseCreditBillLifecycle' -count=1"`：`ok`（新增 `TestEnterpriseQuotaBasedCredit`：额度 0 拒绝、首期 end_at=0、定时任务不按时间滚、零消费不翻、恰好用满翻转 no+1、closing 期仍可结算、两 goroutine 并发只产生一个新期、兜底扫描翻转、账单 period_end=closed_at、auto_reset=false 待收款 / 改额度不放行 / 差额只写流水、部分付款不开期 / 结清自动开期、手动开期与重复开期拒绝、预付重开为 auto_reset=false 直接开第一期）。
- `make test-db PKG="./service/ -run 'TestBillingSessionCredit|TestBillingSessionPrepaid|TestCreditFunding' -count=1"`：`ok`（新增 `TestCreditFundingQuotaBasedRollover`：预扣被拒翻转、归属新期、exhausted 只发一次、旧期在途结算记回 closing 期、单笔超额不留空期、auto_reset=false 两次 403、收款结清后自动恢复）。
- `make test-db PKG="./controller/ -run 'TestCreditBillingEndpoints' -count=1"`：`ok`（新增子用例：`access_until=0`、`period_end=0`、`credit_auto_reset=false`、翻转后 403 `credit_period_awaiting_payment`）。
- `GOWORK=off go test ./middleware/ ./i18n/ -count=1`：`ok`（路由登记守卫 `TestAccessTokenRouteRulesCoverEveryDashboardRoute` 通过）。
- 全量：`make test-db PKG="./model/ ./service/ ./controller/ ./middleware/ ./router/ -count=1"`：model 23.9s / service 8.4s / controller 61.9s / middleware 0.8s / router 0.8s 全部 `ok`（PostgreSQL 17.11，docker `tokenfunc-postgres`，schema `test_agent_a4af1e5688534965d`）。
- 前端：`bun run typecheck` 无错误；`bunx oxlint -c .oxlintrc.json <改动文件>` 无错误；`bunx vitest run src/features/enterprise-console/lib/__tests__/credit-period.test.ts src/i18n/tokenfunc/__tests__/locale-shape.test.ts src/features/enterprises/components/__tests__/enterprises-columns-credit.test.tsx src/features/enterprise-console`：7 files / 32 tests passed。
- 迁移：`make api` 两次启动（fresh schema → 第二次），日志无 error；`information_schema.columns` 看到 `enterprises.credit_auto_reset boolean default false`；第二次启动后账期数据保留。
- API 冒烟（`make api` 在 3008，脚本记录于 `.tmp/smoke-quota-credit.log`）：root 初始化 → 建企业 quotaco → `limit_usd=0` 的 quota_based 被拒（`quota based credit requires a positive limit`）→ 开通 limit 0.002 USD / auto_reset=false，账期 `end_at=0` → 已有 open 期时手动开期被拒 → 企业主建 key → `/v1/dashboard/billing/credit` 返回 `period_end=0, credit_auto_reset=false`，`subscription.access_until=0` → `UPDATE used_quota=limit_quota` 后约 40s 定时任务兜底翻转，期 #1 `closing → billed`（bill_id=1）→ `credit` 返回 403 `credit_period_awaiting_payment`，`/api/enterprise/overview` `open_period=null` → `POST .../credit-periods/open` 返回期 #2 → `credit` 恢复 200 `period_no=2` → 审计日志出现 `enterprise.credit.period_open`。
- 合并 `origin/main`（批次 2 已合入 #51 / #50 / #52，merge commit `4a349cec7`）：冲突只在双方各自追加的相邻行——`i18n/keys.go`、`i18n/locales/*.yaml`（M14 的 `quota.team_budget_exceeded`）、`middleware/access_token_routes_enterprise.go`、七个 `tokenfunc/*.json`（取键并集，main 1269 + 本分支 15 = 1284，`locale-shape` 守卫通过）；其余文件自动合并。合并后：`go vet` 五包无输出；`make test-db PKG="./model/ ./service/ ./controller/ ./middleware/ ./router/ -count=1"` 全部 `ok`（model 28.1s / service 8.6s / controller 48.0s）；`bun run typecheck` 无错误；改动文件 oxlint 无错误；`bunx vitest run src/features/enterprise-console src/features/enterprises src/i18n`：16 files / 61 tests passed。
- 未做浏览器验收（本 worktree 未起前端），表单 / 抽屉 / 概览改动以 typecheck、lint、vitest 覆盖。

## 遗留

- auto_reset=false 待收款期间到达的结算差额只写 `cross_period_adjustment` 流水、不入任何账期，需 M11 人工调账兜底；发版前确认 M11 已合入。
- 从时间周期切到 quota_based 时当前时间期不截断；如需立即进入额度信用，管理员可「立即出账」后再手动开期（现有能力组合，未加专门入口）。
- 翻转时用尽告警对 quota_based 只发一次（按旧期 period_id 去重），新期的 warn / exhausted 按新 period_id 重新计。
