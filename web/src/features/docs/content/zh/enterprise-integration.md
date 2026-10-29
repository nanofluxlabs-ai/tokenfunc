本指南面向企业账户的技术负责人：密钥如何组织、怎么分发给同事、如何在代码里查询剩余授信，以及账单到期后会发生什么。

:::base-url
:::

## 团队、成员与密钥

一个企业是一个计费主体，下面分三层。团队是平级的工作空间（每个企业都有一个默认团队）；成员各属于一个团队，可以只持有密钥，也可以作为开发者、团队管理员或企业管理员登录控制台；密钥属于某个团队，可以指定一名成员为持有人。

```text
企业（一个钱包 / 一条授信额度）
 └ 团队（相当于 OpenAI 的 Project、Anthropic 的 Workspace；可设月度预算）
     ├ 成员（仅持有密钥 | developer | team_admin | enterprise_admin）
     └ API 密钥（所属团队 + 可选持有人；额度、周期重置、模型与 IP 白名单）
```

计费主体始终不变：所有密钥的费用都记在企业账户上。团队和成员只决定用量归属到哪里，成员调到其他团队后，新用量记到新团队，历史记录不变。

[企业控制台](/enterprise/overview) 提供概览、团队、API 密钥、用量报表和账单。团队管理员和开发者只能看到自己所在的团队。

## 给员工发放密钥

:::steps
### 创建成员并发放密钥

在控制台的「团队管理」中添加成员（也可以导入包含 name、email、employee_no、team 列的 CSV），然后在成员行上点击「发放密钥」。密钥会创建在该团队下、持有人为该成员，明文只显示一次，同时附带一段可以直接转发给员工的交接说明。

### 限制密钥的用途

每把密钥可以设置固定额度或周期额度（每天 / 每周 / 每月 / 自定义，到期自动恢复）、模型白名单、IP 或网段白名单和有效期。停用成员会停用其名下全部密钥；归档团队会停止该团队的全部密钥。

### 需要硬性上限时设置团队预算

团队可以设置月度预算和提醒阈值。默认达到预算只通知企业管理员；开启「超出预算时拦截请求」后，该团队在当月剩余时间内的请求会被拒绝，错误码为 `team_budget_exceeded`。
:::

发给成员的密钥供个人使用。没有持有人的密钥是「团队密钥」，用于共享服务，也只有团队密钥能调用下面的授信查询接口。

## 在代码里查询授信

授信模式的企业可以用任意团队密钥查询当前账期。以下三个接口与模型调用使用相同的 Bearer 密钥，带不带 `/v1` 前缀都可以：

| 接口                                     | 说明                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `GET /v1/dashboard/billing/credit`       | 结构化的授信信息（推荐）                                                |
| `GET /v1/dashboard/billing/subscription` | OpenAI 兼容：`hard_limit_usd` 为账期额度，`access_until` 为账期结束时间 |
| `GET /v1/dashboard/billing/usage`        | OpenAI 兼容：`total_usage` 为账期用量 × 100，日期参数会被忽略           |

```bash
curl {{baseUrl}}/v1/dashboard/billing/credit \
  -H "Authorization: Bearer {{apiKey}}"
```

```json
{
  "object": "billing_credit",
  "billing_mode": "credit",
  "credit_cycle_type": "natural_month",
  "period_no": 3,
  "period_start": 1759276800,
  "period_end": 1761955200,
  "limit_quota": 500000000,
  "used_quota": 12345,
  "available_quota": 499987655,
  "limit": 1000,
  "used": 0.02469,
  "available": 999.97531,
  "quota_display_type": "USD",
  "currency": "USD"
}
```

`*_quota` 字段是内部额度单位；`limit` / `used` / `available` 已换算为 `quota_display_type` 指定的展示单位。按额度循环的授信没有固定结束日期，此时 `period_end` 为 0。即使结算延迟导致 `used_quota` 超过额度，`available_quota` 也不会小于 0。

发给成员的密钥调用这些接口会返回 `403 access_denied`，集成请使用团队密钥。预付费企业返回 `403 enterprise_credit_not_enabled`；两个账期之间调用会返回 `404 credit_period_not_found`。

## 员工自查

员工不需要登录，用自己的密钥就能查看这把密钥能做什么、用了多少：

```bash
curl {{baseUrl}}/v1/enterprise/employee/me \
  -H "Authorization: Bearer {{apiKey}}"
```

| 字段         | 类型          | 说明                                                                                                                         |
| ------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `enterprise` | object        | 企业名称和计费模式（prepaid / credit）                                                                                       |
| `team`       | object        | 团队名称；设置了月度预算时包含 `budget_state`（none / ok / warn / exceeded）                                                 |
| `member`     | object / null | 持有人姓名和工号；团队密钥为 null                                                                                            |
| `key`        | object        | 密钥名称、`unlimited_quota`、`remain_quota`、`used_quota`、`expired_time` 和 `quota_policy`（周期重置设置，未设置时为 null） |
| `usage`      | object        | 这把密钥今天和本月的请求数与消耗额度                                                                                         |
| `top_models` | array         | 本月用得最多的最多 5 个模型                                                                                                  |
| `models`     | string[]      | 这把密钥可以调用的模型                                                                                                       |

```json
{
  "object": "enterprise_employee",
  "enterprise": { "name": "Acme", "billing_mode": "credit" },
  "team": { "name": "Research", "budget_state": "ok" },
  "member": { "name": "Alice", "employee_no": "E001" },
  "key": {
    "name": "alice-dev",
    "unlimited_quota": false,
    "remain_quota": 2500000,
    "used_quota": 500000,
    "expired_time": -1,
    "quota_policy": {
      "reset_period": "daily",
      "period_quota": 3000000,
      "next_reset_at": 1761523200
    }
  },
  "usage": {
    "today": { "requests": 3, "quota": 120000 },
    "month": { "requests": 12, "quota": 500000 }
  },
  "top_models": [{ "model": "{{model:gpt}}", "quota": 480000 }],
  "models": ["{{model:gpt}}", "{{model:claude}}"]
}
```

只返回密钥级别的数据，不包含企业余额。团队密钥、已停用成员或已归档团队的密钥返回 `403 access_denied`；企业被暂停时返回 `403 insufficient_user_quota`。

## 标识你的终端用户

如果你的应用通过一把密钥服务很多终端用户，可以在请求头里为每个用户带上稳定的标识，例如 `X-User-Id`。本站可以据此做渠道亲和：同一用户始终命中同一条上游渠道，提高提示词缓存命中率和会话连续性。

这条规则需要联系客户经理在平台侧开启，它是一个类型为 `request_header` 的渠道亲和键来源：

```json
{ "key_sources": [{ "type": "request_header", "key": "X-User-Id" }] }
```

请使用对用户稳定不变的值（内部用户 ID 或其哈希值），会话 ID 或时间戳会使它失去意义。

## 企业相关错误码

所有错误都使用 OpenAI 错误格式并返回真实的 HTTP 状态码。以下是企业账户特有的错误码，通用错误见 [错误码](/docs/api-errors)。

| 错误码                           | 状态码 | 说明                                                                                             |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| `insufficient_user_quota`        | 403    | 企业余额或授信额度用完，或企业账户被暂停。充值、等待下个账期或联系客户经理                       |
| `team_budget_exceeded`           | 403    | 密钥所属团队已达月度预算且设置为拒绝。下月或管理员调高预算后恢复                                 |
| `credit_period_awaiting_payment` | 403    | 按额度循环的授信已用完，账单待支付。账单结清或管理员开启新账期后恢复                             |
| `enterprise_credit_not_enabled`  | 403    | 预付费企业或个人账户调用了授信接口。只有授信模式的企业有账期数据                                 |
| `credit_period_not_found`        | 404    | 当前没有进行中的账期（上一期正在结算、下一期尚未开始），稍后重试                                 |
| `access_denied`                  | 403    | 该密钥不能调用此接口：授信查询需要没有持有人的团队密钥；员工自查需要发给活跃团队中活跃成员的密钥 |

带额度或预算错误码的 403 不可重试，需等待下个账期 / 下个月或联系管理员。`404 credit_period_not_found` 和 5xx 可以退避重试。

## 账期与账单

:::steps
### 账期

授信企业按账期额度消费（自然月、固定天数，或按额度循环：额度用完即进入下一期）。预付费企业消费由管理员线下充值的余额。

### 账单

账期结束时生成账单并发送到账单联系人邮箱。在控制台「财务对账」中可以打开账单、打印发票，并导出含各模型单价和每日明细的用量 CSV。

### 付款

通过银行转账线下付款，管理员登记后账单变为已支付。到期日及到期后第 1、3、7、14 天会发送提醒。没有自动重置的按额度循环授信，需要账单结清后才恢复服务。

### 提醒

管理员可以设置授信提醒阈值（默认 80%），账期用量超过阈值时会给账单联系人发邮件，额度用完时再发一封。
:::

## 联系我们

提高额度、更改计费模式、批量调整密钥所属团队等账户问题，请联系你的 {{siteName}} 客户经理。

:::contact-sales
:::
