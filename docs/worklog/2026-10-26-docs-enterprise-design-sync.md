# 企业设计文档回写：按 M1～M14 实际实现重写 enterprise-design.md

- 日期：2026-10-26
- 分支：docs-enterprise-design-sync
- PR：（不开 PR，按用户要求只 commit 到分支）
- 关键 commit：见分支

## 背景

2026-10-25～26 企业模块按总方案落地了 14 个模块（M1～M14，PR #47～#60）并全部合入 main，但 `docs/tokenfunc/enterprise-design.md` 只在 M1 时重写了组织模型章节（§2.2～2.5.1、§7.1 部分），其余章节仍是 2026-10-09 的旧设计：缺新表与新列、API 列表不全、前端页面清单过时、实施拆分还是 E1～E6。本次以代码为准（model / controller / router / service / middleware / 前端路由与侧边栏）逐章核对后回写，让文档重新成为准确基线，worklog 与总方案只作线索。

## 变更

只改 `docs/tokenfunc/enterprise-design.md`（全文重写，保留已准确的组织模型章节与报价单章节）：

- §0 决策摘要追加 D11～D16（企业密钥唯一入口、key 周期限额独立表、团队预算告警 / 拦截、额度信用 quota_based、员工凭 key 自查、账单快照 v2 + 冻结件）；§1 架构图补团队预算拦截、员工自查接口、分钟任务四步与归档。
- §2 数据模型：2.1 补 `credit_auto_reset / credit_alert_percent / max_tokens`；2.6 补 quota_based 的 `end_at = 0` 与 `closed_at`；2.7 补对账确认三列、`archive_info / archived_at / remark`、对账单部分唯一索引、快照 v2 结构；2.8 修正 ent_ledger 列（去掉不存在的 `amount_usd`，补 `reference / detail`，列出 ref_type 取值）；新增 2.10 `ent_token_quota_policies`、2.11 `ent_credit_notify_records`、2.12 `ent_team_budget_notify`、2.13 `ent_trial_leads`、2.14 AutoMigrate 登记清单。
- §3 计费：3.1 改动点清单按现状（`enterpriseBillingGate`、16 条充值路由拦截、dashboard 根组路由、i18n 键）；3.2 CreditFunding 按三轮 PreConsume + RETURNING + quota_based 翻转重写；3.3 缓存改为 15s 进程内（无 Redis 层）；3.4 补充值拦截实现；3.5 补周期限额与 key 其它限制；新增 3.6 团队预算拦截、3.7 授信预警。
- §4 账期：4.1 生命周期图加 quota_based 翻转与出账七步；4.2 补 quota_based；4.3 补预警记录重置与手动开期；4.4 催款节奏改为代码常量 `[0,1,3,7,14]` 不可配置、结清自动开期；4.5 改为分钟任务顺序 + 锁键 + 退避告警 + 每日任务 + 归档任务；新增 4.7 对账差异告警、4.8 人工调账、4.9 账单归档与冻结件。
- §5 用量：5.1 补 cache 列与重试；5.2 按 M5 页面；5.3 补快照 v2 口径与冻结件；新增 5.4 概览统计。
- §6 Invoice：改为单模板随界面语言、补 v2 快照输出与导出 CSV、卖方信息接口路径改为 `settings/seller`。
- §7 API：7.1 / 7.2 全量对齐 `router/enterprise-router.go` 与 `middleware/access_token_routes_enterprise.go`，补财务中心相关路由；7.4 补 `credit_auto_reset` 与 `credit_period_awaiting_payment`；新增 7.5 员工自查、7.6 错误码表。
- §8 前端：按总方案 §3.3 信息架构重写（五个页面 + 管理员页面 + 侧边栏可见性逻辑）、页面组件清单、角色可见性表。
- §9 安全：补成员角色授予上限、员工自查边界、审计模板范围、人工调账二次验证。
- §10 实施拆分改为「已完成模块清单」（M1～M14 + PR 号 + worklog 文件名）并更新测试要点。
- §12 补 2026-10-25～26 拍板项；§13 实现备注按本次核对结果重写。

## 与代码核对时发现的不一致点

### A. 实现与设计 / 文档页不一致（主线需决定是否修代码）

1. **员工自查接口字段未回填**：`controller/enterprise_employee.go` 第 88 / 97 行 `team.budget_state` 与 `key.quota_policy` 仍是 M7 预留的硬编码 `nil`；M14（预算状态）与 M4（周期策略）合入后都没有补。文档中心企业接入指南（`web/src/features/docs/content/enterprise-integration.tsx` 第 118 / 126 行）示例却写了 `budget_state: 'ok'` 与 `quota_policy: {reset_period, period_quota}`，对客户的承诺与接口不符。
2. **团队预算通知邮件链接丢 team_id**：`service/enterprise_team_budget.go` 第 85 行链接为 `/enterprise/organization?team_id=`，M2 已把 `organization.tsx` 改为 `redirect({to: '/enterprise/teams'})`，重定向不带 search，点开后不会选中该团队。改成 `/enterprise/teams?team_id=` 即可。
3. **`enterprises.max_tokens` 无管理入口**：列与读取都在，但 `controller/enterprise_admin.go` 的 `enterpriseProfileRequest` 没有 `max_tokens` 字段，前端企业编辑抽屉也没有输入框，只能改库（M3 worklog 已列为遗留）。
4. **概览待办与密钥页筛选口径不一致**：概览「耗尽 / 过期」按余额与到期时间派生，密钥页 `?status=4` 按 `tokens.status` 筛，Redis 模式下 `tokens.status` 不回写，待办数可能大于筛选结果（M6 worklog 遗留）。
5. **上游 `/api/token/:id` 删除企业 key 不清周期策略**：只能等分钟任务在下次到期时清理（M4 遗留）；企业主虽已隐藏 `/keys` 菜单，直达 URL 仍可操作。
6. **直扣路径不触发授信预警**：`service/quota.go` 的违规费等直扣记入账期但不走 `checkCreditAlert`（M8 遗留）。
7. **`GET /api/admin/enterprise/reconcile/alerts` 前端未调用**：财务 Tab 走 `bills?reconcile=diff`，接口目前只对访问令牌 / 未来概览有用。

### B. 旧设计文档的错误（本次已改正，无需改代码）

8. §2.8 原文写 `ent_ledger.amount_usd` 列，代码没有这一列（只有 `amount_quota`），且漏了 `reference / detail`。
9. §3.3 原文「进程内 LRU（TTL 30s）+ Redis」，实际是 15s 进程内 `sync.Map`，没有 Redis 层。
10. §4.4 原文「逾期第 1 / 3 / 7 / 14 天各发一次（可配置）」，实际为代码常量，不可配置；总方案已把「催款节奏可配置」列为不做。
11. §6 原文「中文 / 英文两套模板」，实际是单一模板，文案跟随界面语言。
12. §7.2 原文 `GET/PUT /settings/invoice`，实际路由是 `/settings/seller`；原 7.1 / 7.2 缺 20 余条已存在的路由（充值拦截、调账、手动开期、导出、对账差异、线索、报价、周期限额、批量等）。
13. §8 原文 `web/src/routes/_authenticated/admin/enterprises/...` 不存在，管理员页实际在 `/enterprise-billing`、`/enterprise-leads`、`/finance/*`、`/users`、`/quotes`；企业侧 `organization-page` 已被 `teams-page` 替代。
14. §13 原文「用量聚合主键包含员工/部门/项目维度」「缺失部门自动建为顶级部门」已过时（现为团队 / 持有人、缺失团队自动新建）。

### C. 模块 worklog 与模块方案的偏差（已在文档中按代码记录）

15. M4 批量接口是 `POST /tokens/batch-quota-policy`（方案写 PUT）；编辑 key 的策略在 `token.Update()` 之后单独事务。
16. M10 `RolloverExhaustedCreditPeriod` 不做 23505 捕获后重读，靠企业行锁串行；`PreConsume` 3 轮而非 2 轮。
17. M11 审计拆成 `enterprise.adjustment.wallet / bill` 两条模板；账单调到 0 且未付直接 paid（方案写 unpaid）；调账结清触发 M10 自动开期（方案未涉及，合并时按拍板语义决定）。
18. M13 账期包单独计版 `BillArchiveSchemaVersion = 2`，logs 清单仍为 1（方案写同一常量升版）。
19. M9 在途尾差提示比较 `logs_total_quota` 与 `amount_quota`（方案写 `detail_total_quota`）。

## 验证

- 逐章 Read / grep 核对的源文件：`model/enterprise.go`、`enterprise_org.go`、`enterprise_credit.go`、`enterprise_credit_notify.go`、`enterprise_bill.go`、`enterprise_bill_snapshot.go`、`enterprise_usage.go`、`enterprise_token_quota.go`、`enterprise_team_budget.go`、`enterprise_overview.go`、`enterprise_adjustment.go`、`enterprise_lead.go`、`tokenfunc_bill_archive.go`、`finance_bill.go`、`main.go`（AutoMigrate）；`service/enterprise_credit_task.go`、`enterprise_billing_task.go`、`enterprise_billing_issue.go`、`enterprise_credit_funding.go`、`enterprise_credit_alert.go`、`enterprise_team_budget.go`、`bill_archive_task.go`、`bill_archive_read.go`；`controller/enterprise_*.go`、`billing.go`、`finance.go`、`audit.go`、`user.go`；`middleware/enterprise.go`、`access_token_routes_enterprise.go`；`router/enterprise-router.go`、`dashboard.go`、`api-router.go`、`finance-router.go`；`main.go`；前端 `web/src/routes/_authenticated/{enterprise,finance,...}`、`hooks/use-sidebar-view.ts`、`hooks/use-sidebar-data.ts`、`features/enterprise-console/components/*`、`features/enterprises/components/*`、`features/docs/content/enterprise-integration.tsx`、`lib/invoice-html.ts`。
- 文档中所有表名、列名、路由、错误码、锁键、TTL、退避序列、催款节奏均取自上述文件，不含任何密码 / token 值。
- 纯文档变更，未跑 Go / 前端测试。

## 遗留

- 上面 A 组 7 条需要主线决定是否修代码；其中第 1、2 条是对客户 / 邮件可见的功能性不一致，建议优先。
- 文档未逐项核对 `web/src/features/enterprises` 管理员抽屉里每个按钮的角色门控，只核对了路由与侧边栏可见性逻辑。
