This guide is for the technical owner of an enterprise account: how keys are organized, how to hand them to colleagues, how to read the remaining credit from code, and what happens when a bill is due.

:::base-url
:::

## Teams, members and keys

An enterprise is one billing subject with three layers underneath. Teams are flat workspaces (every enterprise has a default team). Members belong to one team each; a member either only holds keys, or also signs in to the console as developer, team admin or enterprise admin. Keys belong to a team and optionally to a member as holder.

```text
Enterprise (one wallet / credit line)
 └ Team (= OpenAI project / Anthropic workspace; monthly budget)
     ├ Member (key only | developer | team_admin | enterprise_admin)
     └ API key (team + optional holder; quota, periodic reset, model & IP allowlists)
```

Billing never changes: every key is charged to the enterprise account. Teams and members decide where usage is attributed, so a member moving to another team changes where new usage lands, never the history.

The [enterprise console](/enterprise/overview) has the overview, teams, API keys, usage report and bills. Team admins and developers only see their own team.

## Issuing keys to employees

:::steps
### Create the member and issue a key

In the console under Teams, add the member (or import a CSV with name, email, employee_no and team), then use "Issue API Key" on the member row. The key is created under the team with the member as holder, and the plaintext is shown once together with a handover text you can paste to the employee.

### Limit what the key can do

Each key can carry a fixed quota or a periodic quota (daily / weekly / monthly / custom, automatically restored at the boundary), a model allowlist, an IP or CIDR allowlist and an expiry. Disabling a member disables all of their keys; archiving a team stops all of its keys.

### Set a team budget if you want a hard stop

A team can have a monthly budget with an alert threshold. By default reaching the budget only notifies the enterprise admins; enable "Block requests over budget" to reject the team's requests for the rest of the month with `team_budget_exceeded`.
:::

Keys issued to a member are for that person. Keys without a holder are "team keys" for shared services, and they are the only keys allowed to query enterprise credit below.

## Querying credit from code

Credit-mode enterprises can read the current period with any team key. The three endpoints accept the same Bearer key as model requests and work with or without the `/v1` prefix:

| Endpoint                                 | Description                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `GET /v1/dashboard/billing/credit`       | Structured credit information (recommended)                                     |
| `GET /v1/dashboard/billing/subscription` | OpenAI-compatible: `hard_limit_usd` = period limit, `access_until` = period end |
| `GET /v1/dashboard/billing/usage`        | OpenAI-compatible: `total_usage` = period usage × 100; dates are ignored        |

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

The `*_quota` fields are internal units; `limit` / `used` / `available` are converted to the display unit named by `quota_display_type`. Quota-based credit has no fixed end date, so `period_end` is 0. `available_quota` never goes below 0, even when late settlements push `used_quota` over the limit.

Keys issued to a member get `403 access_denied` here, so give integrations a team key. Prepaid enterprises get `403 enterprise_credit_not_enabled`; between two periods the credit endpoint returns `404 credit_period_not_found`.

## Employee self-check

Employees do not sign in. With their own key they can still see what the key may do and how much it has used:

```bash
curl {{baseUrl}}/v1/enterprise/employee/me \
  -H "Authorization: Bearer {{apiKey}}"
```

| Field        | Type          | Description                                                                                                                      |
| ------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `enterprise` | object        | Enterprise name and billing mode (prepaid / credit)                                                                              |
| `team`       | object        | Team name, plus `budget_state` (none / ok / warn / exceeded) when a monthly budget is set                                        |
| `member`     | object / null | Holder name and employee number; null for a team key                                                                             |
| `key`        | object        | Key name, `unlimited_quota`, `remain_quota`, `used_quota`, `expired_time` and `quota_policy` (periodic reset, null when not set) |
| `usage`      | object        | Requests and quota used today and this month by this key                                                                         |
| `top_models` | array         | Up to five models this key used most this month                                                                                  |
| `models`     | string[]      | Models this key may call                                                                                                         |

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

Only key-level data is returned, never the enterprise balance. A team key, a disabled member or an archived team gets `403 access_denied`; a suspended enterprise gets `403 insufficient_user_quota`.

## Identifying your end users

If your application serves many end users through one key, send a stable identifier per user in a request header such as `X-User-Id`. This site can use it for channel affinity: the same user keeps hitting the same upstream channel, which improves prompt-cache hits and session continuity.

Ask your account manager to enable the rule on the platform side; it is a channel affinity key source of type `request_header`:

```json
{ "key_sources": [{ "type": "request_header", "key": "X-User-Id" }] }
```

Use a value that is stable for the user (an internal user id or a hash of it). Session ids or timestamps defeat the purpose.

## Enterprise error codes

All errors use the OpenAI error envelope with the real HTTP status. These codes are specific to enterprise accounts; generic ones are on [Errors](/docs/api-errors).

| Error code                       | Status | Description                                                                                                                                                         |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `insufficient_user_quota`        | 403    | The enterprise balance or credit limit is used up, or the account is suspended. Top up, wait for the next period, or contact your account manager                   |
| `team_budget_exceeded`           | 403    | The key's team reached its monthly budget and is set to block. Requests resume next month or after the admin raises the budget                                      |
| `credit_period_awaiting_payment` | 403    | Quota-based credit is used up and the bill awaits payment. Service resumes once the bill is settled or the admin opens a new period                                 |
| `enterprise_credit_not_enabled`  | 403    | A prepaid enterprise or a personal account called the credit endpoint. Only credit-mode enterprises have period data                                                |
| `credit_period_not_found`        | 404    | No open credit period right now (the previous one is closing and the next has not started). Retry shortly                                                           |
| `access_denied`                  | 403    | The key may not call this endpoint: credit queries need a team key without holder; the employee self-check needs a key issued to an active member of an active team |

A 403 with a quota or budget code is not retryable: wait for the next period or month, or contact the administrator. `404 credit_period_not_found` and 5xx are safe to retry with backoff.

## Billing cycle

:::steps
### Period

Credit enterprises consume against a period limit (natural month, fixed days, or quota-based, which rolls over when the limit is used up). Prepaid enterprises consume the balance the administrator tops up offline.

### Bill

When a period closes, a bill is issued and emailed to the billing contact. Under Reconciliation in the console you can open it, print the invoice and export a usage CSV with per-model unit prices and a per-day breakdown.

### Payment

Pay offline by bank transfer; the administrator registers the payment and the bill turns paid. Reminders go out on the due date and 1, 3, 7 and 14 days after it. Quota-based credit without auto-reset resumes service only after the bill is settled.

### Alerts

The administrator sets a credit alert threshold (80% by default). When period usage crosses it the billing contact gets an email, and another one when the limit is used up.
:::

## Contact

For account questions such as raising limits, changing the billing mode or moving keys between teams in bulk, contact your {{siteName}} account manager.

:::contact-sales
:::
