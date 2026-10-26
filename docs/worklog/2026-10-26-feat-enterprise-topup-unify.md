# 企业充值并入管理员手动充值，订单中心去掉合成行键

- 日期：2026-10-26
- 分支：worktree-feat-enterprise-topup-unify
- PR：
- 关键 commit：见 PR

## 背景

用户要求：企业用户页签加充值快捷操作，逻辑与普通用户快捷充值一致并记录订单；账务抽屉里的「登记充值」移走；订单中心订单号下方那一行显示的"编号"改成业务描述。

现状是两条互不相通的充值路径：普通用户走 `POST /api/user/topup/manual`（写 `top_ups` 订单、充值日志、审计，带支付方式与二次验证，但对企业主直接拒绝）；企业走 `POST /api/admin/enterprise/enterprises/:id/topup`（只写企业台账，无订单、无支付方式、无二次验证），所以企业充值进不了订单中心与对账。

订单号下方的"编号"其实是 `top_ups ∪ subscription_orders` UNION 视图的程序行键 `<类型>:<源表 id>`（两张源表自增 id 会撞），无业务含义，不该展示。

## 变更

后端
- `model/topup_manual.go`：`RegisterManualTopUp` 加 `operatorId` 参数；目标是企业主时不再拒绝，同一事务内调 `registerEnterpriseTopupTx`（锁企业行、预付校验、钱包上限、加余额、写 `ent_ledger.topup`，remark 为订单号）再写 `top_ups`；事后的充值日志 / 缓存同步与普通用户一致。删除 `ErrManualTopUpEnterpriseOwner`。
- `model/enterprise_credit.go`：`RegisterEnterpriseTopup` 改为事务内私有函数 `registerEnterpriseTopupTx`。
- `model/finance_topup.go`：钱包流水 online 来源排除企业主的 provider=admin 行（这类行只能来自手动充值，台账已表达），避免同一笔计两次。
- `controller/topup.go`：传 `operatorId`；`ErrEnterpriseNotPrepaid` → "Credit enterprises are settled by bill payment, not top-up"；审计补 `enterprise_id`。
- 删除 `controller/enterprise_billing.go` 的 `AdminRegisterEnterpriseTopup` 与路由。

前端
- `features/enterprises`：行操作加「充值」按钮（授信企业禁用并提示），复用 `@/features/users/components/dialogs/user-topup-dialog`（用户页已有 `UsersProvider` 提供二次验证）；删除 `topup-form.tsx`、`registerEnterpriseTopup`、账务抽屉的「登记充值」区块，抽屉预付说明改为指向企业行的充值操作。
- `features/finance/components/orders/orders-columns.tsx`：订单号下方不再渲染合成 id；支付方式列保留。
- 钱包页（`features/wallet/index.tsx`）：企业主账号打开钱包时不再预算在线充值金额（原来照旧调 `/api/user/amount`，被 `RejectEnterpriseOwner` 拦成 403，页面已显示线下充值提示，这次请求纯多余）；用户验证时看到的 403 即来源于此。
- 账务抽屉授信模式布局（用户截图反馈）：「账户」区左侧补本期授信额度 / 已用摘要，不再只剩一个「停用企业」按钮；`CreditConfigForm` 加 `secondaryAction`，「切回预付」与「更新授信」并排在同一按钮行。
- 文案写入 `web/src/i18n/locales/tokenfunc/*.json` 七个语言文件。

文档：`docs/tokenfunc/enterprise-design.md` §3.4 / §7 同步。

## 验证

- `go build ./model ./controller ./router`、`go vet`、`gofmt -l`：无输出。
- PG 实库（worktree schema `test_feat_enterprise_topup_unify`）`go test ./model -run 'TestRegisterManualTopUp|TestEnterpriseTopupAndStatus|TestEnterpriseCredit|TestFinanceTopupLedger'` 通过：预付企业主充值 → `top_ups` 一行（provider admin、method wxpay）+ 台账一行（operator / reference / remark=订单号 / balance_after）+ 余额增加；订单中心按 provider=admin 命中 1 条；钱包流水只有 1 条且来源为 enterprise_topup；切成授信后充值返回 `ErrEnterpriseNotPrepaid`，订单 / 台账 / 余额均不变；普通用户路径与失败路径行为不变。
- `go test ./controller -run 'TopUp|Topup|Enterprise'` 通过。
- 接口冒烟（worktree `make api`，端口 3003）：setup → 建预付企业 → `POST /api/verify`（password）拿凭证 → `POST /api/user/topup/manual {user_id: 企业主, amount_usd: 12.5, payment_method: wxpay}` 成功，返回 `ADMIN...` 订单号、provider admin；`GET /api/admin/finance/orders` 命中该订单（wallet_topup / wxpay / 12.5）；`GET /enterprises/1/ledger?type=topup` 一条，`remark` 等于订单号、`balance_after_quota=6250000`；企业列表 `quota=6250000`；企业主 `GET /api/user/finance/topup/detail` 只有 1 条，来源 enterprise_topup；`PUT /enterprises/1/credit` 切成授信后再充值返回 "Credit enterprises are settled by bill payment, not top-up"，台账仍 1 条。
- 前端 `bun run typecheck` 通过；`oxlint` 对 `features/enterprises`、`finance/components/orders` 无报错；`vitest src/features/enterprises src/features/finance src/features/users/components/dialogs` 22 文件 79 用例通过，新增 `enterprise-row-actions.test.tsx`（预付可点开 topup、授信禁用）；布局调整后新增 `credit-config-form.test.tsx`（次要操作与提交按钮同一行）通过。

## 遗留

- 企业台账的 topup 条目不再带管理员自由备注（原「登记充值」表单的 remark 字段），remark 固定为订单号；支付方式看订单中心。
- 既有的旧台账条目（历史登记充值）没有对应订单，订单中心只从本次上线后开始完整。
