# TokenFunc 企业模块详细设计

> 状态：v2.0 已实现（2026-10-26，M1～M14 全部合入 main，PR #47～#60）；本文为设计基线，按代码回写，实现差异见「13. 实现备注」
> 范围：企业账户、组织模型（团队 / 成员 / key 三层）、预付与授信计费（含额度信用、key 周期限额、团队预算）、账期出账与告警、账单快照与归档、Invoice、对账统计、人工调账、员工自查、后台企业客户管理
> 不在范围：主题/品牌（等设计系统）；报价单见第 11 节
> 前提：只支持 PostgreSQL；部署 docker → 腾讯云 TKE（多副本）；已获 new-api 商业授权

---

## 0. 决策摘要

| # | 决策 | 理由 |
|---|---|---|
| D1 | **企业 = 一个可登录的主账号（users 行）+ 1:1 的 `enterprises` 资料表** | 所有 key 的 `user_id` 天然就是企业主账号，上游扣费链路零改动即可归集 |
| D2 | **组织模型 = 团队 / 成员 / key 三层**（2026-10-25 改，对齐 OpenAI Projects / Anthropic Workspaces）：`ent_teams` 扁平、每企业一个 Default；成员默认不登录只持 key，可选绑定或开通登录账号并授予 developer / team_admin / enterprise_admin；项目与部门树删除 | 原部门树 + 项目 + 员工 + 负责人五个概念过重；行业只有三个 |
| D3 | **key 与团队 / 持有人的关系放独立映射表 `ent_token_assignments`**，不给上游 `tokens` 表加列 | 减少与上游合并冲突 |
| D4 | **授信 = 新增 `CreditFunding` 资金源**，实现上游 `FundingSource` 接口 | 上游已把钱包/订阅抽象成资金源，授信是第三种，侵入最小 |
| D5 | **预扣时确定账期 `period_id`**，结算/退款都记到同一期 | 根治 tokensolo"按时间 SUM 日志出账导致跨期丢账" |
| D6 | **账单金额以账期计数器为准**，明细取日聚合表，出账时二者对账 | 不扫 logs；不一致即告警 |
| D7 | **统计归因在写入时快照**（key → 团队 / 持有人），写入 `ent_usage_daily` | 成员换团队后历史不漂移；对账查小表 |
| D8 | **所有资金变动进 `ent_ledger` 流水** | 财务对账的唯一事实来源 |
| D9 | 金额内部用 quota（int64），展示/账单用 USD `numeric(20,6)` | 与上游一致；账单不溢出 |
| D10 | 时区统一 `Asia/Shanghai`（可配置），自然月/日聚合都按此 | 避免跨日/跨月口径不一致 |
| D11 | **企业密钥页是企业 key 的唯一入口**（2026-10-25）：建 / 编 / 启停 / 删 / 批量 / 明文 / 周期限额都在 `/enterprise/keys`；企业主与企业开通的账号隐藏上游 `/keys` | 一个对象一个入口；不碰上游 `features/keys` |
| D12 | **key 周期限额放独立表 `ent_token_quota_policies`**，到点由分钟任务把 `tokens.remain_quota` 恢复到周期额度 | tokens 表不加列；计量仍在上游 key |
| D13 | **团队月度预算默认只告警，可勾「超限拦截」**，拦截在任何资金源预扣之前 | 对齐 Anthropic spend limit / OpenAI budget alert |
| D14 | **额度信用 `quota_based`**：账期无固定截止（`end_at = 0`），用满即出账；`credit_auto_reset` 决定自动开下一期还是等收款 | 对标 tokensolo `quota_credit`，纳入同一账期状态机 |
| D15 | **员工凭自己的 key 查自身**（`/v1/enterprise/employee/me`），只暴露 key 级信息 | 员工无登录账号，但要能自查额度与用量 |
| D16 | **账单快照 v2 + 账期包冻结件**：出账时冻结财务口径（四项 token、单价、倍率、按天），logs 清理后明细改读 COS | 账单可验算；财务凭证不依赖 logs 保留期 |

---

## 1. 总体架构

```
                   ┌──────────────────── 管理后台（系统管理员）────────────────────────────┐
                   │ 用户管理[普通|企业]  企业详情/授信/充值/调账  财务中心(账单/对账差异/归档)  │
                   │ 卖方信息  报价单  线索                                                  │
                   └──────────────────────────────┬──────────────────────────────────────┘
                                                  │ /api/admin/enterprise/*  /api/admin/finance/*
┌──── 企业控制台（企业主 + 已开通登录的成员）────┐  │
│ 概览  团队  API 密钥  用量报表  账单            │──/api/enterprise/*──┐
└───────────────────────────────────────────┘                    ▼
                                                  ┌───────────────────────────────────┐
员工 ──(API Key)──▶ relay ──▶ TokenAuth ──▶ enterpriseBillingGate                        │
                                   │           ├ 企业停用 → 403                        │
                                   │           ├ checkTeamBudgetGate（团队预算拦截）     │◀─ ent_teams / 60s 月消耗缓存
                                   │           └ BillingSession ──▶ FundingSource        │
                                   │                 ├ WalletFunding（预付）             │
                                   │                 └ CreditFunding（授信）◀─ ent_credit_periods（RETURNING 判预警）
                                   ▼                                                   │
                              logs（上游，不改）──hook──▶ ent_usage_daily ──▶ 团队预算判档  │
                                                                                       │
员工 ──(API Key)──▶ /v1/enterprise/employee/me、/v1/dashboard/billing/{subscription,usage,credit}
                                                                                       │
                      分钟任务（Redis 锁 tokenfunc:enterprise_credit_task）               │
                      ├ 账期滚动（到期 / 额度用满翻转）                                  │
                      ├ key 周期限额重置（ent_token_quota_policies）                      │
                      ├ 出账（退避 + 告警 + 对账差异通知）──▶ ent_bills ──▶ 归档到 COS      │
                      └ 每日：逾期催款、预付月度对账单                                    │
```

---

## 2. 数据模型（全部新表，前缀 `ent_`，PG；AutoMigrate 登记见 2.14）

### 2.1 enterprises — 企业资料（与 users 1:1）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigserial PK | |
| user_id | int UNIQUE NOT NULL | 企业主账号 |
| name | varchar(128) | 企业名称 |
| contact_name / contact_email / contact_phone | varchar | 联系人 |
| billing_mode | varchar(16) | `prepaid` / `credit` |
| credit_cycle_type | varchar(16) | `natural_month` / `fixed_days` / `quota_based` |
| credit_cycle_days | int | fixed_days 时有效，1~366 |
| credit_limit_quota | bigint | 每期授信额度（quota 单位）；quota_based 必须 > 0 |
| credit_anchor_at | bigint | fixed_days 周期锚点（开通授信时刻） |
| credit_auto_reset | bool | 仅 quota_based：用满后自动开下一期（true）/ 等账单收款或管理员手动开期（false） |
| credit_alert_percent | int | 授信预警阈值 0..99，默认 80，0 关闭（连 exhausted 也不发） |
| payment_terms_days | int | 账单付款期限（Net N 天），默认 15 |
| currency | varchar(8) | 默认 `USD` |
| billing_profile | jsonb | 开票抬头：company_name / address / tax_id / billing_email / phone / country |
| status | varchar(16) | `active` / `suspended` |
| remark | text | 内部备注 |
| max_tokens | int | 企业 key 总数上限；0 = 沿用站点每用户上限，与站点上限取大 |
| created_at / updated_at | bigint | |

> 是否企业 = `enterprises` 存在且 status 有效。**不在 users 表加字段**。

### 2.2 ent_teams — 团队（扁平）
`id, enterprise_id, name, sort, is_default, status(active/archived), monthly_budget_quota, budget_alert_percent(默认 80), budget_enforce, created_at, updated_at, deleted_at`
- 每企业恰好一个 `is_default` 团队（名 `Default`，建企业时创建，不可删、不可归档；部分唯一索引 `uk_ent_team_default`）；企业内团队名唯一（`uk_ent_team_name WHERE deleted_at IS NULL`）
- 归档：成员与历史保留，其 key 停止工作、不能再加 key / 成员；删除：仍有成员或 key 时拒绝
- 月度预算：`monthly_budget_quota = 0` 不设预算；`budget_alert_percent` 告警阈值；`budget_enforce` 勾选后超限拦截（见 3.6）
- 列表接口回填 `member_count / token_count / month_quota / budget_percent / budget_state(none|ok|warn|exceeded)`

### 2.3 ent_members — 成员（不登录员工与登录角色同一张表）
`id, enterprise_id, team_id, name, email, employee_no, user_id, role(none/developer/team_admin/enterprise_admin), provisioned, status(active/disabled), remark, created_at, updated_at, deleted_at`
- `user_id = 0`：不登录，只持 key（原「员工」）；`user_id > 0`：已绑定登录账号，`role` 决定控制台范围
- 登录两种方式：绑定站内已有账号（邮箱 / 用户名查找，不能是另一企业的主账号或成员）；一键开通（`provisioned = true`，用户名 `<邮箱前缀>-e<企业>m<成员>`，随机密码只返回一次，个人余额 0）。解绑后再次开通复用旧账号（重置密码、重新启用、重新绑定）
- 解绑：`user_id/role` 清零；开通的账号同时停用
- 停用 / 删除成员 → 其名下 key 全部禁用（事务内）；删除同时解绑登录。软删除，历史统计保留
- 成员换团队 → 其 key 的 `team_id` 事务内同步更新，历史聚合不变
- 一人只属一个团队；`(enterprise_id, employee_no)`、`user_id` 部分唯一
- 列表接口回填 `month_quota`（本月持有人为该成员的 key 消耗；团队公共 key 不计入成员）

### 2.4 角色与范围（EnterpriseActor）
| 能力 | owner（主账号） | enterprise_admin | team_admin（本团队） | developer（本团队） |
|---|---|---|---|---|
| 团队增删改 / 预算 | ✓ | ✓ | 只读 | 只读 |
| 成员增删改、导入、登录与角色 | ✓ | ✓（≤ team_admin） | ✓（≤ developer，不能挪出团队） | 只读 |
| key 全部操作 / 明文 / 批量 / 周期限额 | ✓ | ✓ | ✓（本团队） | ✓（本团队） |
| 用量 | 全部 | 全部 | 本团队 | 本团队 |
| 账单 / 流水 / 账期 / 概览财务卡 | ✓ | ✓ | 403 | 403 |

- `model.GetEnterpriseAccess(userId)`：主账号 → `{IsOwner: true, Role: enterprise_admin}`；否则取 `role <> none AND status = active` 的成员行 → `{MemberId, Role, TeamId, Provisioned}`；都不是 → `ErrEnterpriseNoAccess`（403）
- `middleware.EnterpriseAuth()` 把 `Enterprise + EnterpriseActor` 写入上下文；`actor.Scope()`：owner / enterprise_admin 全企业，其余 `EnterpriseScope{TeamId}` 贯穿所有控制台查询与写入，越权一律 404
- 角色序：owner(4) > enterprise_admin(3) > team_admin(2) > developer(1) > none(0)；`RequireEnterpriseRole(role)` / `RequireEnterpriseOwner()` 守路由；财务类与团队写路由要求 enterprise_admin，成员写 / 登录 / 角色要求 team_admin
- 授予角色：enterprise_admin 只有 owner 能授；team_admin 需 enterprise_admin+；developer 需 team_admin+

### 2.5 ent_token_assignments — key 归属（替代给 tokens 加列）
| 字段 | 说明 |
|---|---|
| token_id PK | 上游 tokens.id |
| enterprise_id | 冗余，便于校验/查询 |
| team_id | 必填（0 回填为 Default） |
| member_id | 可空：0 = 团队公共 key；非 0 时成员必须属于 `team_id` |
| created_at / updated_at | |

- key 的 `user_id` 仍是企业主账号（计费主体不变）；主账号在上游 `/keys` 自建的 key 启动时回填到 Default 团队
- 改归属：允许，**只影响之后的请求**（历史已快照）；归属缓存 30s，改归属时主动失效

### 2.5.1 从旧模型的一次性迁移（`model/enterprise_org_migration.go`）
生产无流量时执行，幂等、仅 PG：`ent_departments` → `ent_teams`（子部门拍平为「父 / 子」）；`ent_employees` → `ent_members`（`department_id` → `team_id`）；assignments `employee_id` → `member_id`、删 `project_id`、补 `team_id`；`ent_usage_daily` 按新主键 GROUP BY 重建，旧表保留为 `ent_usage_daily_legacy`（删掉 `department_id` 列作为「已迁移」标记）；`DROP ent_projects`。

### 2.6 ent_credit_periods — 授信账期
| 字段 | 说明 |
|---|---|
| id | bigserial PK |
| enterprise_id | |
| period_no | 企业内递增期号 |
| start_at / end_at | `[start, end)` 秒级时间戳；**quota_based 期 `end_at = 0`（永不到期）** |
| limit_quota | 本期额度（可被管理员上调，立即生效） |
| used_quota | 本期已用（预扣 + 结算差额，实时） |
| inflight_count | 本期在途请求数：预扣时 +1，结算/退款时 −1（与 used_quota 同一条 UPDATE，`GREATEST(x, 0)` 防负） |
| status | `open` → `closing` → `billed` |
| bill_id | 出账后回填 |
| closed_at / billed_at | quota_based 期的账单周期截止取 `closed_at` |

- 唯一约束：`uk_ent_period_no (enterprise_id, period_no)`；部分唯一索引 `uk_ent_period_open (enterprise_id) WHERE status = 'open'` 保证同一企业只有一个 open 期
- `used_quota` 可以超过 `limit_quota`（结算补扣不中断请求，与钱包允许负余额一致），超额部分照常出账

### 2.7 ent_bills — 账单（Invoice 的数据源）
| 字段 | 说明 |
|---|---|
| id / bill_no | `TF-202610-000123`，全局唯一 |
| enterprise_id / period_id | 预付月度对账单 period_id 为 0 |
| bill_type | `credit`（授信出账）/ `statement`（预付月度对账单，仅展示不收款）；`uk_ent_bill_statement (enterprise_id, bill_type, period_start) WHERE bill_type = 'statement'` 保证对账单幂等 |
| period_start / period_end | |
| amount_quota | bigint，权威金额 = 账期计数器 |
| amount_usd / adjustment_usd / total_usd / paid_usd | numeric(20,6)；`total = amount + adjustment`，调账只改 adjustment |
| currency | USD |
| status | `unpaid` / `partially_paid` / `paid` / `void`；零金额账单出账即 `paid` |
| issued_at / due_at / paid_at | due = issued + payment_terms_days |
| reminder_count / last_reminded_at | 逾期催款次数与时间 |
| reconcile_diff_quota | 计数器与明细聚合的差值（应为 0） |
| reconcile_acked_at / reconcile_acked_by / reconcile_ack_note | 对账差异人工确认（M8） |
| usage_snapshot | jsonb，见下 |
| seller_snapshot | jsonb：出账时我方公司信息、银行账户（option `enterprise.seller_profile`） |
| buyer_snapshot | jsonb：出账时企业名、联系人、billing_profile |
| archive_info / archived_at | jsonb 归档登记 + 归档时刻（见 4.9） |
| remark | 作废备注等 |

`usage_snapshot` v2（M9，`snapshot_version = 2`）：
- 归因块（`ent_usage_daily` 口径）：`by_team`、`by_member`、`detail_total_quota`
- 财务块（logs 口径，出账事务外只读聚合，复用财务中心倍率 / 单价逻辑）：`logs_total_calls`、`logs_total_quota`、`by_group_model`、`by_model`（跨分组按模型折叠，倍率多值取主值 + shares）、`by_day`；每行含四项 token、四列单价（USD / 1M）、模型 / 分组倍率
- 预付月度对账单同样写归因块 + 财务块（范围 = 自然月）；logs 库不可用时财务块缺失（无 `snapshot_version`，前端按 v1 兼容）

### 2.8 ent_ledger — 资金流水（财务唯一事实来源）
`id, enterprise_id, type, amount_quota, balance_after_quota, ref_type, ref_id, operator_id, reference, remark, detail(jsonb), created_at`

`type` 取值：
- `topup`：预付充值（管理员登记的线下转账）
- `bill_issued`：授信出账（ref_type `bill`，reference = bill_no）
- `bill_payment`：账单收款登记
- `adjustment`：人工调整（必须写备注 ≥ 4 字）；`ref_type = wallet`（预付余额）或 `bill`（授信账单）；作废账单也写 adjustment + `ref_type = bill`
- `credit_limit_change`：授信额度 / 模式变更、手动开期（金额为 0，detail 记前后值 / reason）
- `cross_period_adjustment`：出账后才到达的结算差额（ref_type `credit_period`）；额度信用待收款期间无 open 期时只写流水不动计数器

金额只存 quota，展示时换算 USD。

### 2.9 ent_usage_daily — 用量日聚合
主键：`(day, enterprise_id, token_id, model_name, period_id, team_id, member_id)`（团队 / 持有人写入时快照）；索引 `(enterprise_id, day)`
指标：`request_count, prompt_tokens, completion_tokens, cache_tokens, cache_creation_tokens, quota`

- 写入：`INSERT ... ON CONFLICT DO UPDATE SET x = x + EXCLUDED.x`
- 预付企业 `period_id = 0`
- 团队维度随 key 归属快照：成员换团队后，新数据落新团队，旧数据不变

### 2.10 ent_token_quota_policies — key 周期限额（M4）
| 字段 | 说明 |
|---|---|
| token_id PK | 上游 tokens.id（无策略 = 固定额度 / 不限） |
| enterprise_id | |
| reset_period | `daily` / `weekly` / `monthly` / `custom`（`never` 不落行，表示删策略） |
| custom_seconds | custom 时 1 小时～366 天 |
| period_quota | 周期额度（quota） |
| next_reset_at | 下次重置时刻（索引） |
| updated_at | |

- 边界按账期时区：daily 次日 00:00、weekly 下周一 00:00、monthly 下月 1 日 00:00、custom = now + 秒
- 写入即施行：事务内 `ON CONFLICT (token_id) DO UPDATE` + `UPDATE tokens SET remain_quota = period_quota, unlimited_quota = false, status = CASE 4 THEN 1`，先失效 token 缓存；批量 ≤ 200 把、全成功或全失败；范围外 id 整批 404
- 到期重置见 4.5；企业页删除 key 同事务清策略，绕过企业页软删的 key 由分钟任务顺手清

### 2.11 ent_credit_notify_records — 授信预警发送记录（M8）
`(period_id, kind) PK, enterprise_id, created_at`；`kind ∈ warn | exhausted`。`ClaimCreditNotify` 用 `ON CONFLICT DO NOTHING` 抢占发送权，多副本安全；额度上调或阈值变化时删当前 open 期的 `warn` 记录（`exhausted` 保留）。

### 2.12 ent_team_budget_notify — 团队预算通知记录（M14）
`(team_id, month(YYYY-MM), kind) PK, enterprise_id, created_at`；`kind ∈ warn | exceeded`。同一团队同一月同一档只发一次；上调预算清当月 warn + exceeded，只改阈值清 warn；换月自然重置。

### 2.13 ent_trial_leads — 营销页留资
`id, company, contact, volume, status(new/...), remark, client_ip, created_at, updated_at`；匿名 `POST /api/enterprise/leads`（严格限流 + 请求体限制 + 按 IP 日配额），管理员在 `/enterprise-leads` 处理。

### 2.14 AutoMigrate 登记（`model/main.go`）
`Enterprise, EnterpriseTeam, EnterpriseMember, EnterpriseTokenAssignment, EnterpriseTokenQuotaPolicy, EnterpriseCreditPeriod, EnterpriseLedgerEntry, EnterpriseUsageDaily, EnterpriseTeamBudgetNotify, EnterpriseBill, EnterpriseCreditNotifyRecord, EnterpriseTrialLead`；组织 v2 迁移在 AutoMigrate 前后各一段（2.5.1）；启动时 drop 遗留 `ent_quotes`。

---

## 3. 计费链路改造

### 3.1 改动点清单（上游文件，尽量少）
| 文件 | 改动 |
|---|---|
| `service/billing_session.go` | `NewBillingSession` 开头走 `enterpriseBillingGate`（停用 403 → 团队预算拦截 → 授信走 `CreditFunding`，预付返回走钱包）；`reserveFunding` / `rollbackFundingReserve` / `needsRefundLocked` 加 `*CreditFunding` 分支；`Settle` delta=0 时调资金源可选 `Finish()`；`ErrEnterpriseCreditAwaitingPayment` → 403 `insufficient_user_quota`（i18n `quota.enterprise_credit_awaiting_payment`） |
| `service/quota.go` → `postConsumeQuotaWithResult` | 授信企业直扣路径（违规费等）走 `ApplyCreditSettlement`，只改调用签名 |
| `model/log.go` → `RecordConsumeLog` | 首行调 `RecordEnterpriseUsageAsync`（放在 `LogConsumeEnabled` 判断之前） |
| `model/main.go` | AutoMigrate 注册新表 + 组织 v2 迁移 |
| `router/api-router.go` | 注册企业路由组；16 条在线充值 / 订阅 / 划转路由加 `RejectEnterpriseOwner()` |
| `router/dashboard.go` | TokenAuth 根组加 `/dashboard/billing/credit`、`/enterprise/employee/me`（带与不带 `/v1`） |
| `controller/model.go` | `ListModels` 的过滤抽成 `listUserModelNames(c)` 与员工自查共用 |
| `main.go` | `StartEnterpriseCreditTask()`、`StartBillArchiveTask()` |
| `i18n/` | `quota.team_budget_exceeded`、`quota.enterprise_credit_awaiting_payment` |

新增代码全部放在：`model/enterprise_*.go`、`service/enterprise_*.go`、`controller/enterprise_*.go`、`router/enterprise-router.go`、`middleware/enterprise.go`、`middleware/access_token_routes_enterprise.go`。

### 3.2 CreditFunding（`service/enterprise_credit_funding.go`）
```go
// CreditFunding 授信资金来源：在当前账期额度内预扣，结算差额记回同一账期
type CreditFunding struct {
    enterpriseId int
    periodId     int64 // 预扣时确定，之后结算/退款都用它
    consumed     int
    reserved     bool
    alertPercent int
}
Source()          -> "credit"
PreConsume(x)     -> 最多 3 轮：AddCreditUsageReturning(periodId, x, +1, enforceLimit=true)
                     = UPDATE ent_credit_periods SET used_quota += x, inflight_count += 1
                       WHERE id = :periodId AND status = 'open' AND used_quota + x <= limit_quota
                       RETURNING id, used_quota, limit_quota
                     未命中依次处理：缓存账期已滚动 → 换最新 open 期重试；无 open 期 → EnsureOpenCreditPeriod
                     （待收款直接返回 ErrEnterpriseCreditAwaitingPayment）；同一 open 期额度不足 → 先按「用尽」
                     告警一次，再 RolloverExhaustedCreditPeriod（仅 quota_based 翻转；每请求最多翻一次）；
                     翻转后无新期 → AwaitingPayment（403）；未翻转 → ErrInsufficientCreditQuota（403）
Settle(delta)     -> ApplyCreditSettlement：先记回 periodId（open/closing 无额度条件，允许超额）；
                     已 billed → 记到当前 open 期并写 cross_period_adjustment；待收款无 open 期 → 只写流水
Refund()          -> used_quota -= consumed, inflight_count -= 1（同一 periodId）
Finish()          -> 结算差额为 0 时也要 inflight_count -= 1
reserveExtra()    -> 发送前补充预扣：图片类必须在额度内（失败 403 并按「用尽」告警），其余无条件累加
```

- 预扣成功 / 结算后用 RETURNING 的计数判预警档（不回查账期），见 3.7
- `shouldTrust`：授信不走信任旁路
- `periodId` 写入 `relayInfo.CreditPeriodId` 与 gin context `enterprise_credit_period_id`，供用量聚合钩子使用，保证"计数器"与"明细"记在同一期
- `x = 0`（如按次计费为 0）时直接通过

### 3.3 企业计费信息缓存
- `EnterpriseBillingInfo{EnterpriseId, BillingMode, Status, OpenPeriodId, CreditAlertPercent, TeamBudgets}`：进程内 `sync.Map`，按 user_id，TTL 15s，含负缓存（非企业用户）；**没有 Redis 层**
- 写（改配置 / 滚动账期 / 上调额度 / 升级为企业 / 改团队预算 / 收款开期）时主动失效；多副本其它节点最多延迟 15s（已接受）
- 额度判断不依赖缓存，始终以 SQL 条件更新为准；缓存只用于"走哪个资金源"、"当前 open 期是哪个"、预警阈值与团队预算配置

### 3.4 预付企业
- 直接复用 WalletFunding（users.quota），**零改动**
- 充值：**只支持线下转账，由管理员登记**（写 `ent_ledger.topup`，同时加 users.quota）；`middleware.RejectEnterpriseOwner()` 对企业主账号拦 `/api/user/topup|pay|amount|stripe/*|creem/pay|waffo*/*|aff_transfer` 与订阅购买共 16 条路由（403，消息为前端 locale key）；回调 / notify 不拦；只拦主账号（`enterprises.user_id`），绑定登录的成员仍是普通钱包
- 钱包页企业主隐藏充值 / 兑换码 / 订阅 / 邀请卡，改为提示跳企业概览
- 授信企业**只走授信额度**，不使用 users.quota 余额（二者互斥，切换模式时由管理员处理余额）

### 3.5 key 限额
- 固定额度：沿用上游 `tokens.remain_quota / unlimited_quota`，企业密钥页设置
- **周期限额（M4）**：`ent_token_quota_policies`（2.10），抽屉里「不限 / 固定额度 / 周期限额」三选一；新建 key 带策略时同事务写入且初始额度 = 周期额度；编辑时 `quota_policy` 省略不动、`never` 删策略、其余写入即施行（在 `token.Update()` 之后单独事务）
- 重置不动 `used_quota`；耗尽态（4）恢复为启用，disabled 保持；`BatchUpdateEnabled` 下排队中的扣费增量会造成秒级漂移（已接受）
- 其它限制：分组（必须是主账号可选分组，不支持 auto）、模型白名单（必须在所选分组启用的模型内）、IP / CIDR 白名单 ≤ 50 行、名称 ≤ 50 字；企业 key 总数上限 = `max(站点每用户上限, enterprises.max_tokens)`

### 3.6 团队月度预算拦截（M14，`service/enterprise_team_budget.go`）
- 位置：`enterpriseBillingGate` 的状态校验之后、任何资金源预扣之前；预付与授信都适用；非企业请求只多一次 map 读
- 只对 `budget_enforce` 团队生效：`本月消耗 + 预估预扣 > monthly_budget_quota` → 403 `team_budget_exceeded`（i18n `quota.team_budget_exceeded`），被拦截时按「用尽」补发一次通知
- 本月消耗：进程内 60s 缓存（`GetTeamMonthUsage`），本节点写入的用量即时累加，其它副本最多延迟一个 TTL，接受窗口内略超；改预算时失效
- 判档在 `RecordEnterpriseUsage` 写入聚合后：`warn` = used×100 ≥ budget×alert_percent（alert_percent=0 关闭）；`exceeded` = used ≥ budget；去重先看进程内标记再 `ent_team_budget_notify` 抢占
- 通知：企业账单邮箱 / 联系人邮箱 + `NotifyRootUser("enterprise_team_budget")` + 企业主（非邮箱渠道或邮箱不同时）+ 该团队已绑定登录的 team_admin（webhook / bark / gotify）；正文含团队、预算、已用、百分比、是否拦截与团队页链接

### 3.7 授信额度预警（M8，`service/enterprise_credit_alert.go`）
- 档位：`warn`（used×100 ≥ limit×credit_alert_percent）、`exhausted`（used ≥ limit，或预扣被拒）
- 热路径零额外查询：预扣 / 结算的 UPDATE 带 RETURNING，`checkCreditAlert(state, rejected)` 用返回计数判档；进程内 `sync.Map` 键 `periodId|kind|limit`（额度上调后键变化可重触发），命中后异步 `ClaimCreditNotify`，抢到才发
- 发送：企业账单邮箱（`enterpriseNoticeReceiver`：billing_email 优先，其次 contact_email）+ `NotifyRootUser("enterprise_credit_alert")` 必发 + 主账号 `NotifyUser`（仅当通知渠道是 webhook / bark / gotify，或通知邮箱与账单邮箱不同）
- `exhausted` 正文按周期类型区分：时间周期「拒绝直到上调或下期」/ quota_based + auto_reset「已自动开下一期」/ quota_based 待收款
- `service/quota.go` 直扣路径记入账期但不触发预警（已知）

---

## 4. 账期与出账

### 4.1 账期生命周期
```
 开通授信 ──▶ 创建第 1 期 [now, end) status=open     （quota_based：end_at = 0）
                   │
   请求预扣/结算 ──▶ used_quota 实时增减
                   │
 时间周期 now >= end_at ──▶ 分钟任务 / 下一次预扣（EnsureOpenCreditPeriod）：
                   ├─ 事务内（企业行锁）：当前期 open → closing（closed_at = now）；创建下一期 open（额度 = 企业当前额度，used = 0，start = 上期 end）
                   └─ 失效缓存（新请求立即进入新期）
 quota_based used >= limit ──▶ 预扣被拒时 RolloverExhaustedCreditPeriod（或分钟任务兜底扫描）：
                   ├─ open → closing；auto_reset=true 同事务开 period_no+1（end_at=0，start=now）
                   └─ auto_reset=false 不开新期 → 后续请求 403 insufficient_user_quota（待收款），直到账单结清或管理员手动开期
                   │
 closing 期 inflight_count = 0（通常 1 分钟内）
   或 closed_at + 30 分钟兜底（进程崩溃导致计数泄漏时）──▶ 出账（IssueCreditBillAndNotify）：
                   ├─ 1. 事务外只读聚合财务块（logs 口径，绕过 60s 缓存）
                   ├─ 2. 事务内锁账期：billed 则幂等返回；非 closing 报 ErrEnterprisePeriodNotReady
                   ├─ 3. amount = used_quota；明细 = SUM(ent_usage_daily WHERE period_id)
                   ├─ 4. 二者都为 0 → 账期直接 billed，不生成账单
                   ├─ 5. 不等 → 记 reconcile_diff_quota（以计数器为准出账），出账后通知 root（4.7）
                   ├─ 6. 生成 ent_bills（归因块 + 财务块 + 买卖双方快照），closing → billed，写 ent_ledger.bill_issued
                   └─ 7. 邮件通知企业（带账单链接）、异步归档账期包到 COS（4.9）
```

### 4.2 周期计算
- `natural_month`：`[本月 1 日 00:00, 下月 1 日 00:00)`，Asia/Shanghai
- `fixed_days`：`[anchor + k*N 天, anchor + (k+1)*N 天)`，按秒计算
- `quota_based`：`[now, 0)`；账单周期截止取 `closed_at`；用满翻转依据企业当前 `credit_cycle_type`（从时间周期切到 quota_based 时当前时间期保留到期末，但中途用满会提前翻转）
- 周期类型/天数修改：**下一期生效**，当前期不截断
- 首期：从开通时刻起算；自然月首期为"开通时刻 → 下月 1 日"（不足月）

### 4.3 额度调整
- 管理员上调/下调额度：事务内同时更新 `enterprises.credit_limit_quota` 与当前 open 期 `limit_quota`，**立即生效**；写 `credit_limit_change` 流水（记前后值、操作人）；上调或阈值变化时删当前期 `warn` 发送记录
- 下调到低于已用：允许，效果为立即停服直到下期
- quota_based 待收款时改配置不开期（只更新配置与流水）；从预付刚切回授信直接开第一期
- 管理员「手动开期」`POST /enterprises/:id/credit-periods/open`：无 open 期时开 `max(period_no)+1`（审计 `enterprise.credit.period_open`）；已有 open 期返回 `ErrEnterpriseCreditPeriodAlreadyOpen`

### 4.4 收款与催款
- 管理员登记收款（金额、方式、参考号、备注）→ `bill_payment` 流水；支持部分付款；超额拒绝
- 账单结清（收款或调账调到 total == paid）时，quota_based 且 `auto_reset = false` 且无 open 期的企业在同一事务内自动开下一期（`reopenCreditPeriodAfterBillSettledTx`，reason `bill_paid`）
- 上期未付**不影响**时间周期的新一期额度；逾期不停服
- 付款期限默认 Net 15（企业级可改）
- 逾期催款：每日一次，到期当天及逾期第 1 / 3 / 7 / 14 天各发一次（代码常量 `[0,1,3,7,14]`，**不可配置**），同一天只发一次，记录 reminder_count；后台标红逾期账单

### 4.4.1 为什么不是"账期结束那一刻"出账
账期结束时还有在途请求（长流式、Claude 长思考可达几十分钟），它们在旧期预扣、要等请求结束才知道实际金额。此时出账，金额会漏掉这些差额。所以：账期结束后等旧期 `inflight_count` 归零立即出账（通常 1 分钟内），最多等 30 分钟兜底；兜底后才到达的差额记入当前期并写跨期调整流水。

### 4.5 定时任务与多副本
分钟任务 `StartEnterpriseCreditTask`（`service/enterprise_credit_task.go`）：Redis `SET NX PX` 锁 `tokenfunc:enterprise_credit_task`（55s），无 Redis 时只在 master 节点跑；每轮顺序：
1. `RolloverDueCreditPeriods`：时间周期到期滚动（`end_at > 0 AND end_at <= now`）+ quota_based 用满兜底翻转
2. `ResetDueTokenQuotaPolicies`：`next_reset_at <= now` 前 500 条，按 `(token_id, next_reset_at)` 乐观认领前移下次时刻（以 now 为基准，补跑不连跳、多副本只重置一次），key 已软删则删策略
3. `runEnterpriseBillingOnce`：对 `FindClosingPeriodsReadyToBill` 逐期出账；失败按账期进程内退避 1/2/4/8/16/30 分钟，连续失败 ≥ 3 次 `logArchiveAlert("enterprise_billing_issue:<period>")` 通知 root（24h 去重），成功后清零并发恢复通知；零消费账期视为成功
4. 每日一次（进程内按天去重）：逾期催款邮件；预付企业上月对账单 `GenerateMonthlyStatements`（幂等，期初 = 当前余额 − 本月充值 + 本月消耗 − 本月钱包调整）并即时归档

归档任务 `StartBillArchiveTask`：每小时，锁 `tokenfunc:bill_archive`，只兜底 `archived_at = 0` 的漏网账单（每轮 10 张，指数退避 1h～24h，连续 3 次失败告警）；出账 / 手动出账 / 对账单生成后立即 `ArchiveBillAsync`。

- 每个企业的滚动在单事务内完成（企业行锁）；部分唯一索引保证不会出现两个 open 期
- 所有步骤幂等：重复执行不会重复出账（以 period.status 为状态机）；进程内退避 / 去重标记重启清零，最多多发一次通知或立即重试一次（已接受）

### 4.6 热点行
- 每次请求更新一次企业的 open 期行（预扣 + 结算 2 次）。早期规模 PG 足够
- 单企业 QPS 很高时的预案：改为 Redis `INCRBY` 计数 + Lua 判断额度，周期性落库；接口不变

### 4.7 对账差异告警与确认（M8）
- 出账后 `reconcile_diff_quota != 0` → `NotifyRootUser("enterprise_reconcile_diff")`（企业名、bill_no、计数器 / 明细 / 差额 USD、财务账单详情链接）；已出账的期重复调用不重复通知
- 列表 `GET /api/admin/enterprise/reconcile/alerts?state=pending|acked|all&enterprise_id=`；`/api/admin/enterprise/bills` 与 `/api/admin/finance/bills` 接受 `reconcile=diff`
- 确认 `POST /api/admin/enterprise/reconcile/alerts/:bill_id/ack {note}`：幂等、不覆盖首次备注，审计 `enterprise.reconcile.ack`；财务中心账单详情显示差异 Alert 与「标记已核对」

### 4.8 人工调账（M11，`model/enterprise_adjustment.go`）
- `POST /api/admin/enterprise/enterprises/:id/adjustments {kind: wallet|bill, bill_id, amount_usd, remark}`，仅平台管理员；顺序：参数校验（非零、|x| ≤ 1e9 USD、备注 4～1000 字）→ 企业 404 → bill 必须属于该企业（否则 404）→ **二次验证** `requireAdminUserProof(admin.user.manage, {user_id: 企业主, action: enterprise_adjust})` → 写入 → 审计
- `wallet`：仅预付企业；事务内锁企业行，正数不超 `MaxWalletQuota`、负数不低于 0（靠影响行数判断）；流水 `adjustment / ref_type=wallet`，`balance_after_quota` 读回；提交后刷余额缓存
- `bill`：仅 `credit` 且 unpaid / partially_paid；`adjustment_usd += x`、`total = amount + adjustment`，要求 `total ≥ paid ≥ 0`；状态按 `paid == total` → paid（含调到 0）/ `paid > 0` → partially_paid / 否则 unpaid；结清触发 4.4 的自动开期；流水 `adjustment / ref_type=bill`
- 只走流水，不碰预扣 / 结算 / 账期计数器；不重新归档账期包（包内不含 adjustment）
- 预付月度对账单只汇总 `ref_type = wallet` 的 adjustment；个人财务钱包流水新增来源 `enterprise_adjust`

### 4.9 账单归档与冻结件（PR #42 + M13）
- 出账成功后异步把账期包上传 COS：`bills/{bill_no}/statement.csv.gz`（财务对账单含逐条明细，复用 `BuildFinanceUsageCSVPayload`）、`statement.json.gz`（同一载荷的 JSON 旁路件，M13 新增）、`raw-logs.csv.gz`（原始日志）；登记进 `archive_info`（key / bytes / sha256 / rows，`schema_version = 2`）与 `archived_at`
- logs 保留任务红线：有未归档（且未作废）账单时，其最早账期开始日前一天起不清理
- 管理员 `POST /api/admin/finance/bill-archives/:id` 手动（重新）归档（审计 `bill.archive`），`GET /bill-archives/:id/:file` 透传下载（`statement | statement-json | raw-logs`）
- 读冻结件（M13，`service/bill_archive_read.go`）：`LoadBillStatementPayload` 进程内缓存 10 分钟 / 20 份，sha256 变化即失效；明细超 20 万行只保留汇总 / 按天
- 财务中心 `usage/summary|daily|detail|export` 接受 `bill_id`：账单已归档且账期内 logs 已清理（或 `source=archive`）时改读冻结件，响应同形加 `"source":"archive"`，账期按账单；无 JSON 件 / 存储未配置回落实时 logs；账单上下文 `usage_source ∈ live | archive | archive_unavailable`
- 企业侧账单导出 `GET /api/enterprise/bills/:id/export`：已归档 → 透传 `statement.csv.gz`；否则快照 v2 还原 CSV（不含逐条明细）；旧快照不可导出

---

## 5. 用量统计与对账

### 5.1 聚合写入（`model/enterprise_usage.go`）
- 钩子位置：`model.RecordConsumeLog` 首行 `RecordEnterpriseUsageAsync`（覆盖文本、音频、WSS、违规费等所有消费日志路径）
- 输入：`userId, tokenId, modelName, promptTokens, completionTokens, quota, created_at`，`Other` 快照里的 `cache_tokens / cache_creation_tokens`，以及 context 里的 `enterprise_credit_period_id`
- 非企业用户：直接返回（15s 缓存判断，无 DB 开销）
- 维度解析：`token_id → (team_id, member_id)`（`ent_token_assignments`，30s 缓存，改归属时失效）
- 写入方式：异步 goroutine upsert；失败重试 3 次（200ms 递增）后记错误日志；写入成功后对设了预算的团队判档并通知（3.6）

### 5.2 企业控制台报表（M5）
- `GET /usage/summary?group_by=team|member|token|model|day&from=&to=&team_id=&member_id=`（默认 group_by team；团队角色强制本团队）
- 指标：请求数、输入 / 输出 / 缓存 / 缓存写入 token、金额（USD）
- 页面：趋势图 + 三卡（金额环比）+ 维度 tabs + 下钻（团队 → 成员 → key → 上游使用日志页）+ 面包屑；筛选全进 URL；导出 `GET /usage/export` CSV 跟随筛选
- 明细下钻：跳上游 `logs`（企业主账号的 user_id 下全部 key，按 token_id 过滤），**无需新表**

### 5.3 对账口径
- 授信账单金额 = 账期计数器（权威）
- 账单明细 = `ent_usage_daily` 按 period_id 汇总（`detail_total_quota`），出账时与计数器比对，差异写 `reconcile_diff_quota` 并告警（4.7）
- 财务块 = logs 口径（`logs_total_quota`），前端在 `logs_total_quota ≠ amount_quota` 时提示在途尾差
- 预付企业月度对账单 = 期初余额 + 充值 − 消耗 ± 钱包调整 = 期末余额（由 `ent_ledger` + 聚合表生成，可核对）
- 两侧账单详情统一口径：已结算读 `usage_snapshot` v2，进行中账期实时 logs（财务中心 `UsageBreakdownSection`）；逐条明细管理员侧归档后读冻结件（4.9），企业侧不做逐条明细

### 5.4 概览统计（M6，`model/enterprise_overview.go`）
- `month{quota, prev_quota}`、`keys{total, active, disabled, exhausted, expired, expiring_7d}`、`org{teams, members, login_members}`、`daily[30]`（补零）、`todos{unpaid_bills, overdue_bills, exhausted_keys, expiring_keys, credit_alert_hit, team_budget_warn[], team_budget_exceeded[]}`、`team_budget`（团队角色本团队）、`scope{team_id, team_name}`；全部来自 `tokens / ent_*`，不扫 `logs`
- key 四态按余额与到期时间派生（Redis 模式下 `tokens.status` 不回写）：过期 > 耗尽 > 停用 > 启用，一把 key 只归一档；`expiring_7d` 只数仍启用且 7 天内到期的
- 团队角色（scope 非 nil）只返回本团队统计；账单计数、授信预警、余额、当前账期只对企业主 / 企业管理员下发

---

## 6. Invoice（账单 / 付款通知 PDF）与导出

- 生成方式：前端渲染 HTML 模板（`lib/invoice-html.ts`）→ 新标签页 `window.print()` 另存为 PDF（A4 横向，无新依赖）；单一模板，文案跟随界面语言（i18n），**没有独立的中 / 英两套模板**
- 数据：只读 `ent_bills` 的快照字段，**出账后公司信息变更不影响历史 Invoice**；v2 快照输出按模型表（四项 token + 四列单价 + 倍率，多值加 `*` 注释）、按天表、按团队 / 成员表（含缓存两列）；v1 兼容 `by_department`
- 我方信息配置（`GET/PUT /api/admin/enterprise/settings/seller`，option `enterprise.seller_profile`）：公司名、地址、税号、银行账户、付款说明、页脚条款、Logo
- 账单页行操作：「导出发票」（打印窗口）+「导出 CSV」（4.9 的导出接口）；企业侧与管理员财务中心共用 `BillsTable`
- 默认币种 USD；预留 currency 字段，不做汇率换算

---

## 7. API 设计

所有 `/api/` 路由登记 `middleware/access_token_routes_enterprise.go`（守卫测试 `TestAccessTokenRouteRulesCoverEveryDashboardRoute`）；控制台用 `enterprise:read` / `enterprise:write`，管理员侧企业资料用 `user:*`、财务类用 `billing:*`。

### 7.1 企业控制台 `/api/enterprise/*`（`UserAuth + EnterpriseAuth`；标注角色为最低要求，未标注 = 所有角色、范围按 scope 收窄）
```
GET    /self                         企业资料 + 当前身份 actor（UserAuth，非企业用户 data=null）
GET    /overview                     KPI / 待办 / 30 天 / 账期；团队角色无财务字段（5.4）
GET    /usage/summary  GET /usage/export                                   （5.2）
GET    /ledger?type=  GET /credit-periods  GET /bills  GET /bills/:id  GET /bills/:id/export   enterprise_admin+
GET    /teams                        团队列表（含预算状态；团队角色只见本团队）
POST   /teams  PUT /teams/:id  POST /teams/:id/archive  DELETE /teams/:id   enterprise_admin+（预算随 PUT：monthly_budget_usd / budget_alert_percent / budget_enforce）
GET    /members?team_id=&keyword=&status=&has_login=   （含 month_quota）
POST   /members  POST /members/import  PUT /members/:id  DELETE /members/:id   team_admin+
POST   /members/:id/login {mode: bind|provision, identifier, role}  DELETE /members/:id/login  PUT /members/:id/role   team_admin+
GET    /tokens?team_id=&member_id=&status=&expiring=&keyword=   企业 key 列表（团队 / 持有人 / 限制 / 本月与上月消耗 / 周期限额）
GET    /tokens/options               可选分组、模型等
POST   /tokens                       {name, team_id, member_id, remain_quota, unlimited_quota, expired_time, group, model_limits[], allow_ips, quota_policy?}
PUT    /tokens/:id                   同上（quota_policy 省略不动 / never 删 / 其余写入即施行）
PUT    /tokens/:id/status {status}   启用时过期 / 耗尽的 key 拒绝
PUT    /tokens/:id/assignment {team_id, member_id}
DELETE /tokens/:id                   软删 + 删归属 + 删周期策略
POST   /tokens/:id/key               key 明文（成员账号无法走上游 /api/token/:id/key）
POST   /tokens/batch-status {ids[], status}   启用时跳过过期 / 耗尽并返回 skipped；任一 id 不在范围整批 404
POST   /tokens/batch-delete {ids[]}
PUT    /tokens/:id/quota-policy {reset_period, custom_seconds, period_quota}
POST   /tokens/batch-quota-policy {token_ids[], reset_period, custom_seconds, period_quota}   ≤ 200 把
POST   /leads                        营销页匿名留资（CriticalRateLimit + 请求体限制，无需登录）
```

### 7.2 系统管理员 `/api/admin/enterprise/*`（AdminAuth）
```
GET    /enterprises?q=&mode=&status=     企业客户列表（含主账号摘要与当前账期额度）
POST   /enterprises                       新建企业（新建主账号 或 把已有用户升级为企业）
GET    /enterprises/:id  PUT /enterprises/:id
PUT    /enterprises/:id/credit {cycle_type, cycle_days, limit_usd, alert_percent?, auto_reset}   开通 / 修改授信
DELETE /enterprises/:id/credit            切回预付
PUT    /enterprises/:id/status {status}   active / suspended
POST   /enterprises/:id/topup {amount_usd, reference, remark}   登记线下充值
POST   /enterprises/:id/adjustments {kind, bill_id, amount_usd, remark}   人工调账（二次验证，4.8）
GET    /enterprises/:id/ledger  GET /enterprises/:id/credit-periods
POST   /enterprises/:id/credit-periods/open   手动开下一期（额度信用待收款）
GET    /enterprises/:id/usage/summary  GET /enterprises/:id/usage/export
GET    /bills?status=&bill_type=&enterprise_id=&reconcile=diff   全局账单
GET    /bills/:id  GET /bills/:id/export
POST   /bills/:id/payments {amount_usd, reference, remark}   登记收款（部分付款）
POST   /bills/:id/void {remark}           作废（需备注）
POST   /credit-periods/:id/issue          立即出账（closing 期）
GET    /reconcile/alerts?state=&enterprise_id=   对账差异列表
POST   /reconcile/alerts/:bill_id/ack {note}
GET/PUT /settings/seller                  我方 Invoice 信息
GET/PUT /quotes/config  POST /quotes/render   报价单（第 11 节）
GET    /leads  PUT /leads/:id              线索
```

财务中心 `/api/admin/finance/*`（与企业相关的部分）：`GET /bills?reconcile=diff`、`GET /bills/:kind/:id`（含 `usage_source`、`logs_purged`、归档信息）、`GET /usage/summary|daily|detail|export?user_id=&bill_id=&source=`（4.9）、`POST /bill-archives/:id`、`GET /bill-archives/:id/:file`。

### 7.3 上游用户管理
- 用户列表 / 搜索接受 `user_type=personal|enterprise`（普通用户 = `NOT EXISTS (SELECT 1 FROM enterprises WHERE user_id = users.id)`）
- 前端用户管理页拆成两个页签：普通用户（上游页面）｜企业用户

### 7.4 授信额度查询（API key，2026-10-13）

授信企业客户（如腾讯云）用自己的 API key（`Authorization: Bearer sk-...`）查询额度，不需要登录态或 PAT。路径沿用 one-api / new-api 生态惯例，带与不带 `/v1` 前缀均可。

```
GET /v1/dashboard/billing/subscription   OpenAI 兼容：hard/soft/system_hard_limit_usd = 当前账期额度，access_until = 账期结束时间（quota_based 为 0）
GET /v1/dashboard/billing/usage          OpenAI 兼容：total_usage = 当前账期已用 × 100（忽略 start_date / end_date）
GET /v1/dashboard/billing/credit         结构化授信信息（二开新增）
GET /api/usage/token/                    令牌自身额度，上游原样
```

`credit` 响应：

```json
{
  "object": "billing_credit",
  "billing_mode": "credit", "credit_cycle_type": "natural_month", "credit_auto_reset": false, "period_no": 3,
  "period_start": 1759276800, "period_end": 1761955200,
  "limit_quota": 500000000, "used_quota": 12345, "available_quota": 499987655,
  "limit": 1000, "used": 0.02469, "available": 999.97531,
  "quota_display_type": "USD", "currency": "USD"
}
```

- `*_quota` 为内部额度原值；`limit / used / available` 按站点「额度展示类型」换算（USD 除以 QuotaPerUnit，CNY 再乘汇率，TOKENS 为原值），`quota_display_type` 告知单位；`currency` 是开票币种，两者独立。
- `available_quota = max(limit - used, 0)`：出账后到达的结算差额会无条件累加，已用可能超过额度。
- 账期滚动空窗（上一期已 closing、下一期尚未创建）：`subscription` / `usage` 返回 0，`credit` 返回 404 `credit_period_not_found`；quota_based 且 `auto_reset = false` 待收款时 `credit` 返回 403 `credit_period_awaiting_payment`。查询接口只读，不会像 relay 预扣那样顺带开期。
- 权限：只允许团队公共 key（`ent_token_assignments.member_id = 0`）；分配给成员的 key 三条路由统一 403 `access_denied`（成员自查走 7.5）。企业停用时 403 `insufficient_user_quota`，与 relay 入口一致。
- 非企业用户与预付企业：`subscription` / `usage` 保持上游行为（受 `DisplayTokenStatEnabled` 影响），`credit` 返回 403 `enterprise_credit_not_enabled`。授信分支优先于 `DisplayTokenStatEnabled`。
- 错误体为 OpenAI error 格式 `{"error": {"message", "type": "new_api_error", "code"}}`，使用真实 HTTP 状态码；上游两条接口原有的「200 + error」错误路径未改。
- 已知坑（上游既有）：展示类型为 TOKENS 时 `*_usd` 字段的值是 tokens 数，`total_usage` 为 tokens × 100。
- 缓存：企业计费模式判定走 15s 进程内缓存，limit / used 每次查 `ent_credit_periods` 实表；归属 30s 缓存，改归属时主动失效。

### 7.5 员工自查 `GET /v1/enterprise/employee/me`（M7，TokenAuth，带与不带 `/v1` 均可）
- 响应 `object = enterprise_employee`：`enterprise{name, billing_mode}`、`team{name, budget_state}`、`member{name, employee_no} | null`（团队公共 key 为 null）、`key{name, unlimited_quota, remain_quota, used_quota, expired_time, quota_policy}`、`usage{today, month}`（按 `ent_usage_daily` 的 token_id SUM，账期时区）、`top_models`、`models`（分组可用 ∩ key 白名单 ∩ 已配置计费，与 `ListModels` 同一函数）；**不含企业余额 / 授信额度**
- 403 `access_denied`：非企业 key、主账号未分配归属的 key、持有人已停用、团队已归档；403 `insufficient_user_quota`：企业停用
- 当前实现 `team.budget_state` 与 `key.quota_policy` 固定返回 `null`（见 13）

### 7.6 企业相关错误码（relay 与 TokenAuth 接口）
| HTTP | code | 场景 |
|---|---|---|
| 403 | `insufficient_user_quota` | 企业停用；授信额度用尽（`ErrInsufficientCreditQuota`）；额度信用待收款（`ErrEnterpriseCreditAwaitingPayment`） |
| 403 | `team_budget_exceeded` | 团队预算拦截（3.6） |
| 403 | `access_denied` | 成员 key 调额度查询接口；非企业 / 无归属 / 停用持有人 / 归档团队调员工自查 |
| 403 | `enterprise_credit_not_enabled` | 非授信企业调 `/billing/credit` |
| 404 | `credit_period_not_found` | 账期滚动空窗 |
| 403 | `credit_period_awaiting_payment` | quota_based 待收款 |

---

## 8. 前端（React 19 + TanStack，遵循 web/AGENTS.md，优先复用现有组件）

### 8.1 信息架构（总方案 §3.3）
```
企业（owner / enterprise_admin / team_admin / developer 同一套菜单，范围由 scope 决定）
 ├ 企业概览   /enterprise/overview        M6
 ├ 团队       /enterprise/teams           M1 / M2 / M14   （/enterprise/organization、/enterprise/projects 重定向至此）
 ├ API 密钥   /enterprise/keys            M3 / M4
 ├ 用量报表   /enterprise/usage           M5
 └ 账单       /enterprise/bills, /enterprise/bills/:id   M9（team_admin / developer 不可见）
常规
 ├ 概览 / 仪表盘 / [API 密钥 /keys ← 企业主与企业开通账号隐藏] / 使用日志 / 审计日志
个人
 └ 钱包 /wallet：企业主隐藏充值 / 兑换 / 订阅 / 邀请卡，提示线下充值
管理员
 ├ 用户管理 /users（普通 | 企业页签）  企业客户 /enterprise-billing（企业列表、详情抽屉：授信配置 / 充值 / 调账 / 手动开期、账单页签）
 ├ 财务中心 /finance（账单列表含对账差异 Tab、账单详情 /finance/bills/:billId：快照 v2 / 冻结件明细 / 归档 / 差异确认）
 └ 报价单 /quotes  线索 /enterprise-leads  文档中心 /docs/enterprise-integration（M12）
```
侧边栏（`use-sidebar-view.ts`）：企业分组对主账号与已开通登录的成员可见；账单项仅 `actorAtLeast(enterprise_admin)`；`/keys` 对 `is_owner || provisioned` 隐藏（绑定已有账号的成员保留个人 key 入口）。

### 8.2 页面清单（`web/src/features/enterprise-console/`）
| 页面 | 组件 | 要点 |
|---|---|---|
| 概览 | `overview-page` + `overview-kpi-cards` / `overview-todos` / `charts/daily-quota-bar-chart`（共享） | 四 KPI（本期已用或本团队消耗 → 本月消耗环比 → 活跃密钥与即将过期 → 团队 · 成员）→ 待办（按严重程度，无待办不渲染）→ 30 天柱图 → 折叠账期 / 流水（默认收起，展开再请求；团队角色不渲染）；深链 `/enterprise/keys?status=4`、`?expiring=true`、`/enterprise/teams?team_id=`、`/enterprise/usage`、`/enterprise/bills`；授信进度条下显示预警阈值与「已达阈值 / 已用尽」徽标、quota_based 待收款徽标 |
| 团队 | `teams-page` + `team-panel` / `members-section` / `team-dialog` / `team-admin-dialog` / `member-dialog` / `member-login-dialog` / `member-import-dialog` / `team-budget-meter` | search `team_id | status | login | q | page`；左团队列表（人数、本月消耗 / 预算进度与 warn / exceeded / Blocked 徽标、归档态），团队行「编辑（名称 / 预算 / 阈值 / 拦截）」「设团队管理员」「归档」「删除」；右成员表（姓名、工号、登录 + 角色、密钥数 →、本月消耗 →、状态），成员行「发放密钥」+ 更多（控制台登录 / 编辑 / 停启用 / 删除）；导入 CSV `name,email,employee_no,team`；team_admin / developer 固定本团队 |
| API 密钥 | `keys-page` + `token-mutate-sheet` / `token-quota-cell` / `token-quota-policy-dialog` / `token-quota-policy-fields` | 筛选 团队 / 持有人 / 状态四态 / 即将过期 / 关键字进 URL；列 = 名称 + 掩码 · 团队 · 持有人 · 额度（固定额度复用上游 `ApiKeyQuotaCell`，周期限额显示剩余 / 周期 · 频率 + 下次重置）· 本月消耗（环比）· 限制（分组 · N 模型 · N IP）· 状态（+ Blocked by budget）· 最近使用 · 操作；多选批量启停 / 删除 / 周期限额；新建与编辑共用四段抽屉（基本 / 额度三选一 / 访问限制 / 成功态含明文 + 交付文案，文档链接 `/docs/enterprise-integration`）；总数达上限九成提示 |
| 用量 | `usage-page` + `usage-panel` | search `group_by | team_id | member_id`；趋势图 + 三卡 + 维度 tabs + 下钻面包屑 + cache 列；导出跟随筛选 |
| 账单 | `bills-page` + `bills-table` / `bill-detail-page` / `billing-tables` | 单列表（类型作一列），行操作「导出发票」「导出 CSV」；详情：v2 走共享 `finance/components/usage-breakdown/bill-snapshot-section`（按模型 / 按天 + 尾差提示），v1 旧快照按模型表并提示；按团队 / 成员块含缓存列；状态卡「导出 CSV」 |

管理员侧（`web/src/features/enterprises/`、`features/finance/`）：`enterprises-table` / `enterprise-mutate-drawer` / `enterprise-billing-drawer`（账户段「余额调账」、授信段、待收款提示 + 「手动开下一期」）/ `credit-config-form`（周期类型含「按额度」、auto_reset Switch、预警阈值）/ `topup-form` / `adjustment-dialog`（自挂二次验证）/ `bills-admin-page`（`reconcile` Tab、「账单调账」）/ `seller-profile-dialog` / `leads-admin-page`；财务账单详情 `bill-detail/bill-detail-page`（快照 v2 分流、`usage_source` 横幅、`BillArchiveControl`、`reconcile-diff-alert`）。

### 8.3 角色可见性（总方案 §3.5）
| 能力 | owner | enterprise_admin | team_admin（本团队） | developer（本团队） |
|---|---|---|---|---|
| 团队增删改 / 预算 / 设管理员 | ✓ | ✓ | 只读 | 只读 |
| 成员增删改、导入、登录、角色 | ✓ | ✓（≤ team_admin） | ✓（≤ developer，不挪出团队） | 只读（仅发放密钥） |
| key 全部操作 / 明文 / 批量 / 周期限额 | ✓ | ✓ | ✓ | ✓ |
| 用量 | 全部 | 全部 | 本团队 | 本团队 |
| 账单 / 流水 / 账期 / 概览财务卡 | ✓ | ✓ | 隐藏 + 403 | 隐藏 + 403 |
| 常规 `/keys` | 隐藏 | 保留（绑定账号）/ 隐藏（企业开通） | 同左 | 同左 |
| 钱包充值 / 订阅 / 划转 | 隐藏，线下充值提示 | 不变 | 不变 | 不变 |

- 文案写七个 `web/src/i18n/locales/tokenfunc/*.json`（`locale-shape.test.ts` 守卫键集一致）；文档中心页只保证中英，其余四语言英文回填
- 不碰上游 `features/keys` 页面，只复用子组件（`ApiKeyGroupCombobox`、`ApiKeyQuotaCell`）

---

## 9. 安全与权限

- 企业控制台接口：必须是已登录用户，且是 active 企业的主账号或 `role <> none AND status = active` 的成员；所有资源按 `enterprise_id` 归属校验，团队角色再按 `scope.TeamId` 收窄，越权一律 404（批量接口任一 id 越权整批 404），财务类对团队角色 403
- 角色授予有上限（2.4）：enterprise_admin 只有 owner 能授；team_admin 不能把成员挪出本团队
- 员工无登录账号，不提供「凭邮箱查用量」之类无凭证接口；员工自查必须持有自己的 API key（7.5），且只暴露 key 级信息、不含企业余额 / 授信额度
- key 明文：创建时展示一次（沿用上游）；企业密钥页「复制 key」走 `POST /tokens/:id/key`（所有角色、本团队范围内）
- 一键开通的随机密码只返回一次；解绑即停用账号；开通的账号个人余额 0 且钱包入口隐藏
- 管理员敏感操作写审计（`controller/audit.go` 模板 `enterprise.*`、`bill.archive`）：企业增改、授信配置 / 切回预付 / 手动开期、状态、充值、收款、作废、立即出账、调账（wallet / bill）、卖方信息、对账差异确认；控制台侧：团队增改归档删、成员登录绑定 / 开通 / 解绑 / 改角色、key 增改启停删与批量、周期限额与批量
- **人工调账二次验证**：`requireAdminUserProof(admin.user.manage, {user_id: 企业主, action: enterprise_adjust})`，凭证一次性、上下文不匹配 403 `SECURITY_PROOF_CONTEXT_MISMATCH`；审计记录 `verification_method`
- 在线充值 / 订阅 / 划转对企业主账号服务端拦截（3.4），前端隐藏只是体验
- 不存请求体/响应体/提示词；用量聚合表只有计数；归档的原始日志为上游 logs 列

---

## 10. 已完成模块清单（2026-10-25～26，总方案 §4）

| 模块 | PR | 内容 | worklog |
|---|---|---|---|
| M1 + M5 | #49 | 团队 / 成员 / key 三层底座、迁移、scope、登录绑定 / 开通；`ent_usage_daily` 新维度 + cache 列 + 用量页维度 | `2026-10-25-feat-ent-teams-members.md` |
| M7 | #47 | 企业主在线充值拦截 + `GET /v1/enterprise/employee/me` | `2026-10-25-feat-ent-guards.md` |
| M8 | #48 | 授信预警 / 出账退避告警 / 对账差异告警与确认 | `2026-10-25-feat-ent-alerts.md` |
| M3 | #51 | 企业密钥页重做（唯一入口、PUT / DELETE / 批量、限制、`max_tokens`、菜单收口） | `2026-10-25-feat-ent-keys-page.md` |
| M14 | #50 | 团队月度预算告警 + 可选拦截 | `2026-10-25-feat-ent-team-budget.md` |
| M9 | #52 | 账单快照 v2、两侧详情统一口径、企业 CSV 导出、账单页去 tab | `2026-10-25-feat-ent-bill-verifiable.md` |
| M10 | #53 | 额度信用 `quota_based` + `auto_reset` + 待收款 / 手动开期 | `2026-10-25-feat-ent-quota-credit.md` |
| M11 | #54 | 人工调账（余额 / 账单）+ 二次验证 + 审计 | `2026-10-25-feat-ent-manual-adjustment.md` |
| M2 | #55 | 团队页：URL 筛选、本月消耗、设管理员、路由 `/enterprise/teams` | `2026-10-26-feat-ent-teams-page.md` |
| M12 | #56 | 文档中心「企业接入指南」`/docs/enterprise-integration` | `2026-10-26-feat-ent-docs.md` |
| M13 | #57 | 财务账单逐条明细 logs 清理后读 COS 冻结件 | `2026-10-26-feat-finance-bill-archived-detail.md` |
| M4 | #58 | key 周期限额 `ent_token_quota_policies` + 分钟任务重置 | `2026-10-26-feat-ent-token-quota-policy.md` |
| M6 | #59 / #60 | 概览 KPI / 待办 / 30 天 / scope 裁剪（#60 修测试夹具） | `2026-10-26-feat-ent-overview.md` |

此前基线：E1～E6（2026-10-09）、授信额度查询接口（#18）、账单归档到 COS（#42）。

### 测试要点（PG 实库，`TEST_POSTGRES_DSN`）
- 预扣/结算/退款跨账期：请求在 P1 预扣、P2 结算 → 全额计入 P1；P1 已 billed → 记入当前期并生成跨期调整流水；待收款无 open 期 → 只写流水
- 账期滚动并发：滚动瞬间的请求不丢、不重复；不会出现两个 open 期；quota_based 两 goroutine 并发只产生一个新期
- 额度：恰好用满、超额拒绝、上调后立即恢复、下调低于已用；预警 70% 不发 / 85% 一次 / 403 触发 exhausted 一次 / 上调后重触发 / percent=0 不发
- 出账幂等 + 退避：重复执行 / 多副本只出一张；失败按 1/2/4/8 分钟退避、第 3 次告警、恢复通知一次
- 对账：计数器 = 明细聚合；人为制造差异触发通知、列表、ack 幂等；快照 v2 单价 / 倍率折叠 / `Σby_day == logs_total`
- 团队预算：阈值一次 warn / 一次 exceeded、上调清记录、拦截 403 且钱包未动、缓存窗口与失效
- 周期限额：边界（周一 0 点、月末）、写入即施行、到期任务同分钟二次 no-op、删 key 清策略
- 越权：企业 A 访问企业 B 的成员 / key / 账单 404；team_admin 对别的团队 404；批量混入范围外 id 整批 404
- 员工自查：团队公共 key `member=null`、个人 key 403、企业停用 403、归档团队 403
- 调账：缺凭证 403、上下文不匹配 403、低于已付拒绝、调到恰好等于已付自动 paid 并开期
- 冻结件：logs 清理后 detail 翻页 / export 与对象逐字节一致、v1 归档回落实时

---

## 11. 报价单（价目表生成器，2026-10-11 重做）
- 定位：一次性生成对外的「模型与报价清单」给客户/代理商，**不持久化、不做历史**（早期 `ent_quotes` 版本已删除，启动迁移自动 drop 表）。
- 数据：`setting/quote_setting`（option 表 `quote_setting.*` 五个 key：groups / models / capability / meta / image_pricing），管理员在「报价单 → 报价单配置」维护，保存即生效；代码内置默认值（Claude 满血 / Claude 反代 / GPT 三组、22 个模型）。
- 价格：**手工维护的官方价（USD / 1M tokens）× 分组折扣 × 汇率**，与网关计费倍率无关（有意为之：可表达同一模型在不同渠道的不同官方价）。
- 生成：`POST /api/admin/enterprise/quotes/render` {各分组折扣, 汇率, 有效天数, 生成日期} → Go 拼 Markdown（`service/quote_template.go`，章节骨架与长文案在代码）→ 前端预览 / 下载 .md / .html / 新标签页打印另存 PDF（A4 横向，tokenfunc 品牌色）。
- 接口：`GET/PUT /api/admin/enterprise/quotes/config`（`?reset=1` 返回内置默认），作用域 `billing:read` / `billing:write`。
- 测试：`service/quote_template_test.go` golden 基线（`-update-golden` 更新）。

---

## 12. 已确认

### 2026-10-08
1. 预付企业只能线下转账，由管理员登记
2. 授信企业只走授信额度，不用预付余额
3. 付款期限默认 15 天，逾期自动邮件催款
4. 出账时机：账期结束后在途请求结算完即出账（通常 1 分钟内，最长 30 分钟兜底）

### 2026-10-25～26（总方案「已拍板」）
5. 对照 tokensolo 的报告 + P1 + P2 全做；开放员工凭自己的 key 查自身；额度信用纳入
6. 员工密钥不并入组织架构；企业密钥页成为企业主 / 管理员的唯一密钥页；`/keys` 对 owner 与企业开通账号隐藏、绑定账号的成员保留
7. 密钥新建 / 编辑用侧边抽屉；用量下钻到 key 后跳上游使用日志页；企业账单页去 tab、打印改「导出发票」；账单详情已结算读快照、进行中实时（两侧统一）
8. 组织模型改为团队 / 成员 / key 三层（生产无流量，启动一次性迁移，`DROP ent_projects`）；成员可见明文 key；员工自查接口暴露团队名
9. 团队月度预算默认只告警，可勾「超限拦截」；拦截在预扣前，本月消耗 60s 缓存，接受窗口内略超
10. M13：归档加 JSON 旁路件、进程内小 LRU、旧归档回落实时并保留横幅、明细超 20 万行只缓存汇总 / 按天、企业侧不做逐条明细
11. 账单调账结清与收款结清一视同仁（都触发额度信用待收款自动开期）；账单调到 0 且未付直接 paid
12. 不做：部门层级、一人多团队、成员级预算；白标 / 隐藏网关身份；客户端断开按已消耗结算（另开调研）；预付企业预警改造；催款节奏可配置；Invoice 多模板；成员详情抽屉；企业页内逐条明细

---

## 13. 实现备注

### 2026-10-09
- 管理员账单页路由为 `/enterprise-billing`（`/enterprise-bills` 与 `/enterprise/bills` 在 TanStack 路由树生成的标识符冲突）。
- 企业控制台接口支持访问令牌作用域 `enterprise:read` / `enterprise:write`，管理员侧账单与报价使用 `billing:read` / `billing:write`。
- 出账时机：closing 期在途计数归零立即出账，兜底 30 分钟；零消费账期直接结束不生成账单。
- 报价单（2026-10-11 重做）不再读系统定价，见第 11 节。
- 成员批量导入为全成功或全失败；缺失团队自动新建，留空归 Default。
- 本地测试需要 PG：`TEST_POSTGRES_DSN=postgres://...`，未设置时企业相关测试自动跳过。

### 2026-10-26（M1～M14 回写时与代码核对）
- 用量聚合主键维度为团队 / 持有人（不再是员工 / 部门 / 项目），归属变更只影响新行。
- 企业计费信息缓存是 15s 进程内缓存，没有 Redis 层（3.3 原设计的「LRU 30s + Redis」未实现，多副本靠短 TTL 收敛）。
- 催款节奏 `[0,1,3,7,14]` 为代码常量，不可配置（§12 第 12 条已列为不做）。
- Invoice 单一 HTML 模板，文案跟随界面语言，没有独立中 / 英两套模板。
- `GET /v1/enterprise/employee/me` 的 `team.budget_state` 与 `key.quota_policy` 仍是 M7 预留的 `null`，M4 / M14 合入后未回填；文档中心企业接入指南示例按契约写了真实值，两者不一致，待补实现。
- M4 批量接口为 `POST /tokens/batch-quota-policy`（与 batch-status / batch-delete 一致），不是方案里的 PUT；编辑 key 时策略在 `token.Update()` 之后单独事务写入，新建时同事务。
- `enterprises.max_tokens` 只有列与读取，管理员企业编辑表单没有输入框，需要时改库。
- 概览的耗尽 / 过期按余额与到期时间派生，密钥页 `?status=4` 按 `tokens.status` 筛（Redis 模式不回写），待办数可能略多于筛选结果。
- 团队预算通知邮件链接仍是 `/enterprise/organization?team_id=`，该路由重定向到 `/enterprise/teams` 时不带 search，`team_id` 丢失。
- 上游 `/api/token/:id` 删除企业 key 不同步清周期策略，由分钟任务在下次到期时清理。
- 授信直扣路径（`service/quota.go`，违规费等）记入账期但不触发预警；`GET /reconcile/alerts` 前端未直接调用（财务 Tab 走 `bills?reconcile=diff`）。
- 历史 v1 账单快照不回填 v2；存量 v1 归档没有 JSON 件（`usage_source = archive_unavailable`），趁 logs 未删在账单详情页重归档即可回填。
- 账单调账后不重新归档账期包（包内本就不含 adjustment）。
- 周期限额边界与前端预览都按上海时区切分，不跟随企业所在时区。
- 预警 / 预算 / 账单邮件正文为英文模板，未接后端 i18n。
- 一键开通后再次解绑 / 开通复用旧账号（重置密码、重新启用、重新绑定），不再新建用户。
