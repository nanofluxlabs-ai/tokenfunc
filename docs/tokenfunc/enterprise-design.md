# TokenFunc 企业模块详细设计

> 状态：v1.0 已实现（2026-10-09，E1–E6 与报价单均已合入 feat/enterprise 分支）；本文为设计基线，实现差异见「13. 实现备注」
> 范围：企业账户、组织架构（部门/员工/项目）、预付与授信计费、账期出账、Invoice、对账统计、后台企业客户管理
> 不在范围：报价单（见第 11 节简述，单独出设计）、主题/品牌（等设计系统）
> 前提：只支持 PostgreSQL；部署 docker → 腾讯云 TKE（多副本）；已获 new-api 商业授权

---

## 0. 决策摘要

| # | 决策 | 理由 |
|---|---|---|
| D1 | **企业 = 一个可登录的主账号（users 行）+ 1:1 的 `enterprises` 资料表** | 所有 key 的 `user_id` 天然就是企业主账号，上游扣费链路零改动即可归集 |
| D2 | **员工不是 users，是 `ent_employees` 记录**，不能登录 | 需求确认：员工只用 key |
| D3 | **key 与员工/项目的关系放独立映射表 `ent_token_assignments`**，不给上游 `tokens` 表加列 | 减少与上游合并冲突 |
| D4 | **授信 = 新增 `CreditFunding` 资金源**，实现上游 `FundingSource` 接口 | 上游已把钱包/订阅抽象成资金源，授信是第三种，侵入最小 |
| D5 | **预扣时确定账期 `period_id`**，结算/退款都记到同一期 | 根治 tokensolo"按时间 SUM 日志出账导致跨期丢账" |
| D6 | **账单金额以账期计数器为准**，明细取日聚合表，出账时二者对账 | 不扫 logs；不一致即告警 |
| D7 | **统计归因在写入时快照**（员工→部门、key→项目），写入 `ent_usage_daily` | 员工换部门后历史不漂移；对账查小表 |
| D8 | **所有资金变动进 `ent_ledger` 流水** | 财务对账的唯一事实来源 |
| D9 | 金额内部用 quota（int64），展示/账单用 USD `numeric(20,6)` | 与上游一致；账单不溢出 |
| D10 | 时区统一 `Asia/Shanghai`（可配置），自然月/日聚合都按此 | 避免跨日/跨月口径不一致 |

---

## 1. 总体架构

```
                   ┌──────────────────────── 管理后台（系统管理员）────────────────────────┐
                   │ 用户管理[普通用户|企业用户]  企业详情  授信配置  账单/收款  Invoice 设置 │
                   └──────────────────────────────────┬──────────────────────────────────┘
                                                      │ /api/admin/enterprise/*
┌──────── 企业控制台（企业主账号）────────┐            │
│ 概览 组织架构 员工 项目 API Key 用量分析 │──/api/enterprise/*──┐
│ 账单/Invoice  资金流水  充值             │                    │
└─────────────────────────────────────────┘                    ▼
                                                  ┌─────────────────────────────┐
员工 ──(API Key)──▶ relay ──▶ TokenAuth ──▶ BillingSession ──▶ FundingSource      │
                                   │                  │        ├ WalletFunding（预付）│
                                   │                  │        ├ SubscriptionFunding  │
                                   │                  │        └ CreditFunding（授信）│◀─ ent_credit_periods
                                   │                  ▼                              │
                                   │        RecordConsumeLog ──hook──▶ ent_usage_daily
                                   ▼                                                 │
                              logs（上游，不改）                                       │
                                                  定时任务（Redis 锁，单实例执行）       │
                                                  ├ 账期滚动/出账 ──▶ ent_bills          │
                                                  └ 对账校验/告警                        │
```

---

## 2. 数据模型（全部新表，前缀 `ent_`，PG）

### 2.1 enterprises — 企业资料（与 users 1:1）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigserial PK | |
| user_id | int UNIQUE NOT NULL | 企业主账号 |
| name | varchar(128) | 企业名称 |
| contact_name / contact_email / contact_phone | varchar | 联系人 |
| billing_mode | varchar(16) | `prepaid` / `credit` |
| credit_cycle_type | varchar(16) | `natural_month` / `fixed_days` |
| credit_cycle_days | int | fixed_days 时有效（如 15/30），1~366 |
| credit_limit_quota | bigint | 每期授信额度（quota 单位） |
| credit_anchor_at | bigint | fixed_days 周期锚点（开通授信时刻） |
| payment_terms_days | int | 账单付款期限（Net N 天），默认 15 |
| currency | varchar(8) | 默认 `USD` |
| billing_profile | jsonb | 开票抬头：公司全称、地址、税号、收件邮箱… |
| status | varchar(16) | `active` / `suspended` |
| remark | text | 内部备注 |
| created_at / updated_at | bigint | |

> 是否企业 = `enterprises` 存在且 status 有效。**不在 users 表加字段**。

### 2.2 ent_departments — 部门树
`id, enterprise_id, parent_id(0=根), name, sort, created_at, deleted_at`
- 索引 `(enterprise_id, parent_id)`；同级同名唯一（部分唯一索引 `WHERE deleted_at IS NULL`）
- 删除部门：有子部门或员工时拒绝

### 2.3 ent_employees — 员工（子账号，无登录）
`id, enterprise_id, department_id, name, email, employee_no, status(active/disabled), remark, created_at, deleted_at`
- 停用/删除员工 → 其名下 key 全部禁用（事务内）
- 软删除，历史统计保留

### 2.4 ent_projects — 项目
`id, enterprise_id, name, code, status(active/archived), remark, created_at, deleted_at`

### 2.5 ent_token_assignments — key 归属（替代给 tokens 加列）
| 字段 | 说明 |
|---|---|
| token_id PK | 上游 tokens.id |
| enterprise_id | 冗余，便于校验/查询 |
| employee_id | 可空（企业公共 key） |
| project_id | 可空 |
| created_at / updated_at | |

- 一个 key 至多属于一个员工、一个项目；一个员工可有多个 key（对应不同项目）
- key 改项目/改员工：允许，**只影响之后的请求**（历史已快照）

### 2.6 ent_credit_periods — 授信账期
| 字段 | 说明 |
|---|---|
| id | bigserial PK |
| enterprise_id | |
| period_no | 企业内递增期号 |
| start_at / end_at | `[start, end)` 秒级时间戳 |
| limit_quota | 本期额度（可被管理员上调，立即生效） |
| used_quota | 本期已用（预扣 + 结算差额，实时） |
| inflight_count | 本期在途请求数：预扣时 +1，结算/退款时 −1（与 used_quota 同一条 UPDATE） |
| status | `open` → `closing` → `billed` |
| bill_id | 出账后回填 |
| closed_at / billed_at | |

- 唯一约束：`(enterprise_id, period_no)`；部分唯一索引 `(enterprise_id) WHERE status='open'` 保证同一企业只有一个 open 期
- `used_quota` 可以超过 `limit_quota`（结算补扣不中断请求，与钱包允许负余额一致），超额部分照常出账

### 2.7 ent_bills — 账单（Invoice 的数据源）
| 字段 | 说明 |
|---|---|
| id / bill_no | `TF-202610-000123`，全局唯一 |
| enterprise_id / period_id | 预付月度对账单 period_id 为空 |
| bill_type | `credit`（授信出账）/ `statement`（预付月度对账单，仅展示不收款） |
| period_start / period_end | |
| amount_quota | bigint，权威金额 = 账期计数器 |
| amount_usd | numeric(20,6) |
| adjustment_usd | numeric(20,6)，跨期调整、人工调整 |
| total_usd | numeric(20,6) |
| currency | USD |
| status | `unpaid` / `partially_paid` / `paid` / `void` |
| paid_usd | numeric(20,6) |
| issued_at / due_at / paid_at | |
| reminder_count / last_reminded_at | 逾期催款次数与时间 |
| usage_snapshot | jsonb：按模型 / 按项目 / 按部门的汇总 |
| seller_snapshot | jsonb：出账时我方公司信息、银行账户（来自系统配置） |
| buyer_snapshot | jsonb：出账时企业 billing_profile |
| reconcile_diff_quota | 计数器与明细聚合的差值（应为 0） |

### 2.8 ent_ledger — 资金流水（财务唯一事实来源）
`id, enterprise_id, type, amount_quota, amount_usd, balance_after_quota, ref_type, ref_id, operator_id, remark, created_at`

`type` 取值：
- `topup`：预付充值（在线支付 / 管理员登记的线下转账）
- `bill_issued`：授信出账
- `bill_payment`：账单收款登记
- `adjustment`：人工调整（必须写备注）
- `credit_limit_change`：授信额度变更（金额为 0，记录前后值）
- `cross_period_adjustment`：出账后才到达的结算差额

### 2.9 ent_usage_daily — 用量日聚合
主键：`(day, enterprise_id, token_id, model_name, period_id)`
冗余维度：`employee_id, department_id, project_id`（写入时快照）
指标：`request_count, prompt_tokens, completion_tokens, cache_tokens, quota`

- 写入：`INSERT ... ON CONFLICT DO UPDATE SET x = x + EXCLUDED.x`
- 预付企业 `period_id = 0`
- 部门维度随员工快照：员工换部门后，新数据落新部门，旧数据不变

---

## 3. 计费链路改造

### 3.1 改动点清单（上游文件，尽量少）
| 文件 | 改动 | 行数级别 |
|---|---|---|
| `service/billing_session.go` → `NewBillingSession` | 开头加分支：授信企业 → `tryCredit()` | ~15 |
| `service/billing_session.go` → `reserveFunding` / `rollbackFundingReserve` / `needsRefundLocked` | 增加 `*CreditFunding` 分支 | ~15 |
| `service/billing_session.go` → `Settle` | delta=0 时回调资金源的可选 `Finish()`（用于在途计数） | ~5 |
| `service/quota.go` → `postConsumeQuotaWithResult` | 授信企业走 CreditFunding（覆盖 xAI 违规费等直扣路径） | ~10 |
| `model/log.go` → `RecordConsumeLog` | 第一行加用量聚合钩子（放在 `LogConsumeEnabled` 判断之前） | 1 |
| `model/main.go` | AutoMigrate 注册新表 | 1 |
| `router/` | 注册企业路由组 | 1 |
| `main.go` | 启动企业定时任务 | 1 |

新增代码全部放在：`model/enterprise_*.go`、`service/enterprise_*.go`、`controller/enterprise_*.go`、`router/enterprise-router.go`。

### 3.2 CreditFunding
```go
// CreditFunding 授信资金来源：在当前账期额度内预扣，结算差额记回同一账期
type CreditFunding struct {
    enterpriseId int
    periodId     int64 // 预扣时确定，之后结算/退款都用它
    consumed     int
}
Source()          -> "credit"
PreConsume(x)     -> UPDATE ent_credit_periods SET used_quota = used_quota + x, inflight_count = inflight_count + 1
                     WHERE id = :open_period AND status = 'open' AND used_quota + x <= limit_quota
                     影响 0 行 → ErrInsufficientCreditQuota（403，额度不足，停服）
Settle(delta)     -> UPDATE ... SET used_quota = used_quota + delta, inflight_count = inflight_count - 1 WHERE id = :periodId
                     （无额度条件，允许超额；period 已 billed → 记到当前 open 期并写 cross_period_adjustment 流水）
Refund()          -> used_quota -= consumed, inflight_count -= 1（同一 periodId）
Finish()          -> 结算差额为 0 时也要 inflight_count -= 1
                     （上游 BillingSession.Settle 在 delta=0 时不调用 funding.Settle，需加一个可选接口回调）
```

- `shouldTrust`：授信不走信任旁路（上游 default 分支已返回 false，无需改）
- `periodId` 同时写入 gin context，供用量聚合钩子使用，保证"计数器"与"明细"记在同一期
- `x = 0`（如按次计费为 0）时直接通过

### 3.3 授信企业识别与缓存
- `EnterpriseBillingCache`：`user_id → {enterprise_id, billing_mode, open_period_id, status}`
- 读：进程内 LRU（TTL 30s）+ Redis；写（改配置/滚动账期/上调额度）时主动失效
- 额度判断不依赖缓存，始终以 SQL 条件更新为准；缓存只用于"走哪个资金源"和"当前 open 期是哪个"
- 缓存里的 open_period_id 可能落后一个期：PreConsume 的 `WHERE status='open'` 失败时，刷新缓存重试一次

### 3.4 预付企业
- 直接复用 WalletFunding（users.quota），**零改动**
- 充值：**只支持线下转账，由管理员登记**（写 `ent_ledger.topup`，同时加 users.quota）；企业主账号隐藏在线充值入口，后端充值接口对企业账号拒绝
- 授信企业**只走授信额度**，不使用 users.quota 余额（二者互斥，切换模式时由管理员处理余额）

### 3.5 key 限额
- 员工 key 的额度上限沿用上游 `tokens.remain_quota / unlimited_quota`，企业控制台可设置
- 部门/项目不做额度拦截（需求确认），后续可加

---

## 4. 账期与出账

### 4.1 账期生命周期
```
 开通授信 ──▶ 创建第 1 期 [anchor, end) status=open
                   │
   请求预扣/结算 ──▶ used_quota 实时增减
                   │
 now >= end_at ──▶ 定时任务：
                   ├─ 1. 事务内：当前期 open → closing；创建下一期 open（额度 = 企业当前额度，used=0）
                   ├─ 2. 失效缓存（新请求立即进入新期）
                   │
 closing 期 inflight_count = 0（通常 1 分钟内）
   或 距 end_at 已超 30 分钟兜底（进程崩溃导致计数泄漏时）──▶
                   ├─ 3. 锁定：closing → billed
                   ├─ 4. amount = used_quota；明细 = SUM(ent_usage_daily WHERE period_id)
                   ├─ 5. 二者不等 → 记 reconcile_diff_quota 并告警（以计数器为准出账）
                   ├─ 6. 生成 ent_bills（快照买卖双方信息），写 ent_ledger.bill_issued
                   └─ 7. 通知企业（邮件，带账单链接）
```

### 4.2 周期计算
- `natural_month`：`[本月 1 日 00:00, 下月 1 日 00:00)`，Asia/Shanghai
- `fixed_days`：`[anchor + k*N 天, anchor + (k+1)*N 天)`，按秒计算
- 周期类型/天数修改：**下一期生效**，当前期不截断
- 首期：从开通时刻起算；自然月首期为"开通时刻 → 下月 1 日"（不足月）

### 4.3 额度调整
- 管理员上调/下调额度：事务内同时更新 `enterprises.credit_limit_quota` 与当前 open 期 `limit_quota`，**立即生效**；写 `credit_limit_change` 流水（记前后值、操作人）
- 下调到低于已用：允许，效果为立即停服直到下期

### 4.4 收款与催款
- 管理员登记收款（金额、方式、参考号、备注）→ `bill_payment` 流水；支持部分付款
- 上期未付**不影响**新一期额度（需求确认）；逾期不停服
- 付款期限默认 Net 15（企业级可改）
- 逾期自动邮件催款：每日任务，到期日当天提醒一次，之后逾期第 1 / 3 / 7 / 14 天各发一次（可配置），记录 reminder_count；后台标红逾期账单

### 4.4.1 为什么不是"账期结束那一刻"出账
账期结束时还有在途请求（长流式、Claude 长思考可达几十分钟），它们在旧期预扣、要等请求结束才知道实际金额。
此时出账，金额会漏掉这些差额。所以：账期结束后等旧期 `inflight_count` 归零立即出账（通常 1 分钟内），
最多等 30 分钟兜底；兜底后才到达的差额记入当前期并写跨期调整流水。

### 4.5 并发与多副本
- 出账检查任务每分钟执行，用 Redis `SET NX PX` 分布式锁，确保 TKE 多副本下只有一个实例执行
- 每个企业的滚动在单事务内完成；部分唯一索引保证不会出现两个 open 期
- 所有步骤幂等：重复执行不会重复出账（以 period.status 为状态机）

### 4.6 热点行
- 每次请求更新一次企业的 open 期行（预扣 + 结算 2 次）。早期规模 PG 足够
- 单企业 QPS 很高时的预案：改为 Redis `INCRBY` 计数 + Lua 判断额度，周期性落库；接口不变

---

## 5. 用量统计与对账

### 5.1 聚合写入
- 钩子位置：`model.RecordConsumeLog` 首行（覆盖文本、音频、WSS、违规费等所有消费日志路径）
- 输入：`userId, tokenId, modelName, promptTokens, completionTokens, quota, created_at`，以及 context 里的 `periodId`
- 非企业用户：直接返回（缓存判断，无 DB 开销）
- 维度解析：`token_id → (employee_id, project_id)`（缓存）→ `employee_id → department_id`（缓存）
- 写入方式：异步 goroutine 执行 upsert；失败重试 3 次后记错误日志并计入告警指标

### 5.2 企业控制台报表
- 维度：时间（日/月）× 部门 / 员工 / 项目 / key / 模型
- 指标：请求数、输入/输出/缓存 token、金额（USD）
- 明细下钻：直接查上游 `logs`（企业主账号的 user_id 下全部 key，按 token_id 集合过滤），**无需新表**
- 导出：CSV（汇总 + 明细）

### 5.3 对账口径
- 授信账单金额 = 账期计数器（权威）
- 账单明细 = `ent_usage_daily` 按 period_id 汇总，出账时与计数器比对
- 预付企业月度对账单 = 期初余额 + 充值 − 消耗 ± 调整 = 期末余额（由 `ent_ledger` + 聚合表生成，可核对）

---

## 6. Invoice（账单 / 付款通知 PDF）

- 生成方式：前端渲染 HTML 模板 → `window.print()` 另存为 PDF（无新依赖、中英文字体无问题）
- 数据：只读 `ent_bills` 的快照字段，**出账后公司信息变更不影响历史 Invoice**
- 我方信息配置（系统设置 → Invoice）：公司名、地址、税号、银行账户（多币种可多条）、付款说明、页脚条款、Logo
- 语言：中文 / 英文两套模板（海外客户）
- 默认币种 USD；预留 currency 字段，不做汇率换算

---

## 7. API 设计

### 7.1 企业控制台 `/api/enterprise/*`（企业主账号登录，中间件校验企业身份）
```
GET    /overview                     本期额度/已用/余额、近 30 天趋势
GET    /departments                  部门树
POST   /departments  PUT /departments/:id  DELETE /departments/:id
GET    /employees?dept=&q=&status=   POST /employees  PUT /employees/:id  DELETE /employees/:id
POST   /employees/import             CSV 批量导入
GET    /projects  POST /projects  PUT /projects/:id  DELETE /projects/:id
GET    /tokens?employee=&project=    企业 key 列表（含归属）
POST   /tokens                       创建 key 并指定员工/项目（复用上游 token 创建逻辑）
PUT    /tokens/:id/assignment        修改归属
GET    /usage/summary?group_by=department|employee|project|model|token&from=&to=
GET    /usage/export
GET    /bills  GET /bills/:id        账单与 Invoice 数据
GET    /ledger                       资金流水
```

### 7.2 系统管理员 `/api/admin/enterprise/*`
```
GET    /enterprises?q=&mode=&status=   企业客户列表
POST   /enterprises                     新建企业（新建主账号 或 把已有用户升级为企业）
GET    /enterprises/:id  PUT /enterprises/:id
PUT    /enterprises/:id/credit          开通/修改授信（模式、周期、额度）
POST   /enterprises/:id/topup           登记线下充值
GET    /bills?status=&overdue=          全局账单
POST   /bills/:id/payments              登记收款
POST   /bills/:id/void                  作废（需备注）
GET    /reconcile/alerts                对账差异告警
GET/PUT /settings/invoice               我方 Invoice 信息
```

### 7.3 上游用户管理
- 普通用户列表：增加过滤 `NOT EXISTS (SELECT 1 FROM enterprises WHERE user_id = users.id)`
- 前端用户管理页拆成两个页签：普通用户（上游页面）｜企业用户（新页面）

---

## 8. 前端（React 19 + TanStack，遵循 web/AGENTS.md，优先复用现有组件）

```
web/src/features/enterprise/          企业控制台
  overview/  org/(部门树 + 员工表)  projects/  tokens/  usage/  bills/(含 invoice 打印页)  ledger/
web/src/features/admin-enterprise/    管理员：企业客户列表、详情、授信配置、账单收款、Invoice 设置
web/src/routes/_authenticated/enterprise/...
web/src/routes/_authenticated/admin/enterprises/...
```
- 侧边栏：企业主账号显示"企业管理"分组；隐藏 Midjourney、任务日志入口（不做视频/任务类模型）
- 所有文案走 i18n（en/zh 必填）

---

## 9. 安全与权限

- 企业控制台接口：必须是已登录用户，且是 active 企业的主账号；所有资源按 `enterprise_id` 做归属校验（防越权访问其他企业的员工/key）
- 员工无登录，不提供"凭邮箱查用量"之类无凭证接口（tokensolo 的教训）
- key 明文只在创建时展示一次（沿用上游行为）
- 管理员敏感操作（改额度、登记收款、作废账单、人工调整）写审计日志：操作人、前后值、备注
- 不存请求体/响应体/提示词；用量聚合表只有计数

---

## 10. 实施拆分

```
E1  数据模型 + 迁移 + 企业 CRUD + 管理员企业客户列表/用户管理分页签
E2  组织架构：部门、员工、项目、key 归属；企业控制台基础页面
E3  计费：CreditFunding + 缓存 + 授信配置 + 停服/上调额度
E4  用量聚合钩子 + 报表 + 导出
E5  账期滚动/出账定时任务 + 账单 + 收款 + 资金流水
E6  Invoice 模板（中/英）+ 我方信息配置 + 预付月度对账单
```
依赖：E1 → E2 → E3 → E4 → E5 → E6（E4 可与 E3 并行）

### 测试要点（PG 实库）
- 预扣/结算/退款跨账期：请求在 P1 预扣、P2 结算 → 全额计入 P1
- 账期滚动并发：滚动瞬间的请求不丢、不重复；不会出现两个 open 期
- 额度：恰好用满、超额拒绝、上调后立即恢复、下调低于已用
- 结算在 P1 已 billed 之后到达 → 记入当前期并生成跨期调整流水
- 出账幂等：定时任务重复执行/多副本同时执行只出一张账单
- 对账：计数器 = 明细聚合；人为制造差异能触发告警
- 越权：企业 A 访问企业 B 的员工/key/账单返回 404

---

## 11. 报价单（简述，另出设计）
- 价格来源：系统现有模型定价（不另建价格表）× 客户折扣
- 管理员选择：客户名、模型（仅 Claude / GPT / Gemini / xAI）、折扣（全局或按模型）、有效期、备注条款
- 输出：前端 HTML 模板打印为 PDF，一次性生成，不做版本管理；可选保存生成记录（客户、时间、操作人）便于追溯

---

## 12. 已确认（2026-10-08）
1. 预付企业只能线下转账，由管理员登记
2. 授信企业只走授信额度，不用预付余额
3. 付款期限默认 15 天，逾期自动邮件催款
4. 出账时机：账期结束后在途请求结算完即出账（通常 1 分钟内，最长 30 分钟兜底）

---

## 13. 实现备注（2026-10-09）
- 管理员账单页路由为 `/enterprise-billing`（`/enterprise-bills` 与 `/enterprise/bills` 在 TanStack 路由树生成的标识符冲突）。
- 企业控制台接口支持访问令牌作用域 `enterprise:read` / `enterprise:write`，管理员侧账单与报价使用 `billing:read` / `billing:write`。
- 出账时机：closing 期在途计数归零立即出账，兜底 30 分钟；零消费账期直接结束不生成账单。
- 用量聚合主键包含员工/部门/项目维度，归属变更只影响新行。
- 报价单价格来源：`模型倍率 × 2 × 分组倍率`（USD / 1M tokens）；折后价服务端计算并快照。
- 员工批量导入为全成功或全失败；缺失部门自动建为顶级部门。
- 本地测试需要 PG：`TEST_POSTGRES_DSN=postgres://...`，未设置时企业相关测试自动跳过。
