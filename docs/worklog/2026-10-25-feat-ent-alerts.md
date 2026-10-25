# M8 告警三件套：授信额度预警 / 出账失败退避告警 / 对账差异告警与列表

- 日期：2026-10-25
- 分支：feat/ent-alerts
- PR：
- 关键 commit：

## 背景

对照 tokensolo 的企业运营能力审查（总方案 M8）发现三处「出了事没人知道」：

1. 授信企业的 `SettleBilling` 对 `BillingSourceCredit` 跳过上游 `checkAndSendQuotaNotify`，额度用尽前没有任何通知，直接 403 停服。
2. 出账任务 `runEnterpriseBillingOnce` 失败只 `LogWarn`，每分钟原样重试、没有告警（tokensolo 曾因同类问题 PG 打满四天半）。
3. 出账时的 `reconcile_diff_quota`（计数器 vs 明细聚合）只落字段，没有通知、没有列表、不能确认闭环。

## 变更

### A. 授信额度预警（后端 + 前端）

- `enterprises.credit_alert_percent`（默认 80，0..99，0 关闭）进 `EnterpriseCreditConfig.AlertPercent` 与 `EnterpriseBillingInfo` 15s 缓存；管理员 `PUT /enterprises/:id/credit` 新增可选 `alert_percent`，缺省沿用当前值（首次开通为 80）。
- 新表 `ent_credit_notify_records(period_id, kind) PK`，`ClaimCreditNotify` 用 `ON CONFLICT DO NOTHING` 抢占发送权，多副本安全；`ConfigureEnterpriseCredit` 在额度上调或阈值变化时删当前 open 期的 `warn` 记录，`exhausted` 保留。
- 热路径：`AddCreditUsageReturning` 在同一条 UPDATE 上加 `RETURNING id, used_quota, limit_quota`（`Model(&period).Clauses(clause.Returning)`），`AddCreditUsage` 改为薄封装，`ApplyCreditSettlement` 返回实际记账账期的 `CreditUsageState`。`CreditFunding` 在预扣成功 / 结算后用 RETURNING 的计数判档，不回查账期；预扣被拒（即将 403）直接按 `exhausted` 处理（失败路径复用已查到的 open 期）。
- `service/enterprise_credit_alert.go`：进程内 `sync.Map` 键 `periodId|kind|limit`（额度上调后键变化，配合 DB 记录清除可重触发），命中后异步 `ClaimCreditNotify`，成功才发送：企业账单邮箱（`enterpriseNoticeReceiver`，与账单邮件共用）+ `NotifyRootUser("enterprise_credit_alert")` 必发 + 主账号 `NotifyUser`（仅当通知渠道是 webhook/bark/gotify，或通知邮箱与账单邮箱不同）。
- 前端：`credit-config-form.tsx` 新增「用量预警阈值（%）」；企业概览进度条下显示阈值说明与「已达预警阈值 / 额度已用尽」徽标（`credit-alert-hint.tsx`）。

### B. 出账失败退避 + 告警

（待补）

### C. 对账差异告警 + 列表

（待补）

## 验证

（待补）

## 遗留

- 预警邮件 / 通知正文沿用企业账单邮件的英文模板，未接入后端 i18n（与 `sendEnterpriseBillEmail`、渠道健康告警一致），后续统一处理。
- 进程内已发标记与出账退避计数在重启或换节点后清零：最多多发一次预警 / 立即重试一次出账，出账幂等，已接受。
