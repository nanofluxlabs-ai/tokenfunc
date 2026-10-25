# M11 人工调账：预付余额 / 授信账单调整 + 二次验证 + 审计

- 日期：2026-10-25
- 分支：feat/ent-manual-adjustment
- PR：#54
- 关键 commit：d27c33032（后端）、557eefcc6（前端）、后续一条 test + worklog 提交

## 背景

企业模块总方案 M11：`ent_ledger` 早就定义了 `adjustment` 类型（设计 §2.8，必须写备注），但没有任何接口能写它——重复计费冲减、漏计补收、商务让利这类财务动作只能改库。M10 额度信用模式 `auto_reset=false` 期间的跨期结算差额也要靠人工调账兜底。要求：只走流水不碰预扣 / 结算链路，每笔二次验证 + 审计，仅平台管理员可操作，企业侧只读看到流水与账单变化。

## 变更

### 后端

- `model/enterprise_adjustment.go`
  - `AdjustEnterpriseWallet(enterpriseId, deltaQuota, operatorId, remark)`：事务内 `lockEnterprise`，仅预付企业；正数 `WHERE quota <= MaxWalletQuota − δ`、负数 `WHERE quota + δ >= 0`，靠影响行数判断（`ErrEnterpriseAdjustmentExceedsBalance`）；读回余额写 `balance_after_quota`；流水 `type=adjustment, ref_type=wallet`；提交后 `cacheIncrUserQuota`。
  - `AdjustEnterpriseBill(billId, amountUSD, operatorId, remark)`：`lockForUpdate` 读账单，仅 `credit` 且 unpaid / partially_paid；`adjustment_usd += x`、`total_usd = amount_usd + adjustment_usd`，要求 `total ≥ paid ≥ 0`（`ErrEnterpriseBillAdjustmentBelowPaid`）；状态：`paid == total` → paid（含调到 0，与出账时零金额即 paid 一致）、`paid > 0` → partially_paid、否则 unpaid；流水 `ref_type=bill, ref_id, reference=bill_no`，金额经 `WalletQuotaFromDecimalStrict`。
  - 备注 trim 后按 rune 计 ≥ 4 字（`ErrEnterpriseAdjustmentRemark`），金额为 0 拒绝。
- `controller/enterprise_adjustment.go`：`POST /api/admin/enterprise/enterprises/:id/adjustments {kind: wallet|bill, bill_id, amount_usd, remark}`。顺序：参数校验（kind / 非零且 |x| ≤ 1e9 / 备注 4～1000 字 / 换算后 quota 非零）→ 读企业（404）→ bill 模式校验 `bill.enterprise_id == :id`（否则 404，避免跨企业探测）→ `requireAdminUserProof(admin.user.manage, {user_id: 企业主, action: enterprise_adjust})` → 写入 → 审计。响应 `{kind, ledger, bill?}`。
- `service/security_verification.go`：`adminUserManageActions` 白名单加 `enterprise_adjust`；`controller/audit.go` 加 `enterprise.adjustment.wallet` / `enterprise.adjustment.bill` 两个模板（params 含 `enterprise_id, kind, amount_usd, remark, verification_method, ledger_id, bill_no, status, total_usd`）。
- 路由登记 `router/enterprise-router.go` + `middleware/access_token_routes_enterprise.go`（`billing:write`）。
- 余额口径收口：`GenerateMonthlyStatements` 汇总 adjustment 时加 `ref_type = 'wallet'`（作废账单也写 adjustment 但 `ref_type=bill`，以前会错误地进预付对账单）；个人财务「钱包流水」`finance_topup.go` 新增来源 `enterprise_adjust`（`type=adjustment AND ref_type=wallet`，类型归 adjust），保持「期末余额 = 期初 + Σ本账单 − Σ消费」成立。

### 前端

- `features/enterprises/components/adjustment-dialog.tsx`：`Dialog` + RHF/zod；金额可负（输入框保留原始文本，否则受控成数字后「-」会被重置成 0）、备注 ≥ 4 字；账单模式描述行显示未付金额、实时显示「调整后总额」并拒绝低于已付；提交先 `requestVerification({scope:'admin.user.manage', context:{user_id: 企业主, action:'enterprise_adjust'}})`，取消即返回，拿到 proof 后 `createEnterpriseAdjustment(id, payload, proof_token)`；成功后 invalidate `['admin-enterprise']` 并 toast。二次验证对话框由本组件自行挂载。
- 入口：`enterprise-billing-drawer.tsx` 预付企业「账户」段「余额调账」按钮；`bills-admin-page.tsx` unpaid / partially_paid 授信账单行「账单调账」图标按钮。
- `securityProofConfig` 从 `users/api.ts` 上提到 `@/lib/api`（users 改为复用）；`AdminUserManageAction` 加 `'enterprise_adjust'`，`users/data-table-row-actions.tsx` 的标题映射用 `Exclude` 排除。
- `enterprise-console` 的 `LedgerEntry` 加 `ref_type`，流水表对 `ref_type=wallet` 的调账也显示期后余额；`reconciliation` 新增来源 `enterprise_adjust`；审计模板 TS 同步两条；七个 `tokenfunc/*.json` 各加 19 条文案（非英文均为真实译文）。

## 验证

环境：worktree slot 9（`make wt-init`），PostgreSQL 17.11（docker `tokenfunc-postgres`，schema `test_agent_acb5ab2a26242ae6c`），Go 1.26.0 darwin/arm64，二开代码只支持 PG。

- `gofmt -l model/ controller/ service/ router/ middleware/` 无输出；`GOWORK=off go build ./...`（放了 `web/dist/index.html` 占位满足 embed）与 `go vet` 五个包通过。
- `make test-db PKG='./model/ -run "TestEnterpriseManualAdjustments|TestEnterpriseTopupAndStatus|TestFinanceTopupLedger" -count=1 -v'`：3 个用例 PASS（`ok model 1.067s`）。
  - 新增 `TestEnterpriseManualAdjustments`：钱包正 / 负、`balance_after` 1300 → 50、扣超余额拒绝且余额不变、备注过短 / 金额为 0 拒绝、不存在企业 404 错误、授信企业拒绝；账单 −7 低于已付拒绝、+2.5 → 12.5 仍 partially_paid（流水 1,250,000 quota、`ref_type=bill`）、−8.5 → 恰好等于已付 4 自动 paid、已结清 / 作废 / 不存在拒绝；最终 4 条 adjustment 流水（2 钱包 + 2 账单）。
  - 扩展 `TestFinanceTopupLedger`：钱包调账 −500,000 以来源 `enterprise_adjust` 出现在钱包流水，`ref_type=bill` 的 adjustment 行不出现；条数 6 → 7，合计与 by_source 同步。
- `make test-db PKG='./controller/ -run TestAdminCreateEnterpriseAdjustment -count=1 -v'`：5 个子用例 PASS（`ok controller 1.091s`）——备注短 / 金额 0 / kind 非法 / 缺 bill_id / 超 1e9 全部在要求凭证之前返回；缺凭证 403 `SECURITY_PROOF_REQUIRED`、`topup` 动作的凭证与绑定到别家企业主的凭证均 403 `SECURITY_PROOF_CONTEXT_MISMATCH` 且余额 / 流水不变；钱包 −2 USD 成功后余额 5 → 3、审计 `enterprise.adjustment.wallet` 内容与 `verification_method=password` 正确、凭证一次性、扣超余额返回业务错误；跨企业账单与不存在企业 404；账单 −6 → 恰好等于已付自动 paid、钱包不动、审计 `enterprise.adjustment.bill` 正确。
- `make test-db PKG='./middleware/ ./router/ -count=1'`：`ok middleware 0.798s / ok router 0.812s`（`TestAccessTokenRouteRulesCoverEveryDashboardRoute` 通过，新路由已登记）；`go test ./service/ -run "Verification|SecurityProof|AdminUserManage"` 通过。
- `make test-db PKG='./model/ ./service/ ./controller/ ./middleware/ ./router/ -count=1'`：`ok model 30.809s / ok service 15.469s / ok middleware 0.849s / ok router 0.804s`；controller 包前两轮全量都只有上游 `TestResponsesWebSocketReusesConnectionAndSettlesEachRequest`（断言「额度耗尽的 token 必须在联系上游前被拒」）失败，而 `-skip TestAdminCreateEnterpriseAdjustment` 全包 `ok controller 51.393s`、两者成对跑 `ok controller 1.239s`，说明是新用例夹具经 `service.CreateLoginSession` + `model.PublishUserAuthCache` 走登录流程留下的进程内状态在整包顺序下污染了该用例。改为与 `createAccessTokenTestSession` 一样直接落一条 `user_sessions` 构造 step-up 身份、并把 operator / owner / otherOwner 三个 user_id 的企业计费缓存都在 cleanup 里失效后，全包 `ok controller 45.694s`。
- 顺带发现（与本分支无关）：`TestDeleteRedemptionBatch` 单独运行失败（`-run TestDeleteRedemptionBatch` → 401），它依赖同包更早的用例调用过 `model.EnsureLegacyAccessTokenRetireAt`，整包运行时通过。
- 前端：`bun run typecheck` 通过；`bunx oxfmt --write` / `bunx oxlint -c .oxlintrc.json` 只对改动文件执行，oxlint 退出码 0；`bunx vitest run src/features/enterprises src/i18n/tokenfunc src/features/reconciliation src/features/enterprise-console src/features/usage-logs src/lib/__tests__`：48 个文件 584 用例通过（含新增 `adjustment-dialog.test.tsx` 4 用例、`locale-shape.test.ts` 七文件键集一致、`bills-admin-page-reconcile.test.tsx`），唯一失败 `usage-logs/components/__tests__/detail-preview.test.tsx > task log prices use localized unit labels`（上游用例，20s 超时，单独重跑仍超时，与本分支改动无关——本分支只在审计模板表追加两条字符串）。`users/__tests__/quota-display.test.tsx` 的「creation and last login」用例同样在本分支前就失败（`getByText('—')` 命中多个元素，最近一次改动来自 `05cf84e2b`），本分支对 users 目录只改了导入与类型。
- 合并 `origin/main`（#47 M7 守卫 / 员工自查）后无冲突：`gofmt -l` 无输出、`go build ./...`、`go vet` 通过；`make test-db PKG='./model/ ./service/ ./controller/ ./middleware/ ./router/ -count=1'` → `ok model 20.215s / ok service 6.312s / ok controller 44.701s / ok middleware 0.770s / ok router 0.775s`；`bun run typecheck` 通过；`bunx vitest run src/features/enterprises src/i18n/tokenfunc src/features/reconciliation src/features/enterprise-console src/features/wallet src/lib/__tests__` → 27 文件 143 用例通过。
- 合并批次 2（`origin/main` 1ebdd640d，含 #50 M14 / #51 M3 / #52 M9 / #53 M10）：冲突 9 个文件——`middleware/access_token_routes_enterprise.go`（M10 加了 `credit-periods/open` 并重排对齐，取 main 版再加回 `adjustments` 一行）、`model/enterprise_test.go`（两边都在文件尾追加用例，保留两侧）、七个 locale（取 main 版后用脚本重新写入本分支 19 条键，`locale-shape.test.ts` 键集一致）。两个前端入口文件（计费抽屉 / 账单页）自动合并成功，调账入口与 M10 的「待收款 / 手动开期」并存。
  - **与 M10 的语义交叉**：M10 在 `RegisterBillPayment` 里对「账单结清 → 额度信用 `auto_reset=false` 待收款企业自动开下一期」；本分支账单调账「调到恰好等于已付即 paid」也是结清。按已拍板语义（用满后拒绝请求直到账单结清 / 管理员手动开期），调账结清与收款结清一视同仁：把 M10 的开期块抽成 `reopenCreditPeriodAfterBillSettledTx`，收款与调账共用；非额度信用 / `auto_reset=true` / 已有 open 期时不动。`TestEnterpriseManualAdjustments` 末尾新增用例：quota_based 用满出账待收款 → 调一半仍 unpaid 不开期 → 调到 0 即 paid 并开出 `period_no+1`、余额缓存失效。
  - 合并后：`gofmt -l` 无输出、`go build ./...`、`go vet` 五包通过；`bun run typecheck` 通过；oxlint 退出码 0；`bunx vitest run src/features/enterprises src/i18n/tokenfunc src/features/reconciliation src/features/enterprise-console src/features/wallet src/lib/__tests__` → 33 文件 166 用例通过；`make test-db PKG='./model/ ./service/ ./controller/ ./middleware/ ./router/ -count=1'` → `ok model 38.875s / ok service 6.506s / ok controller 46.857s / ok middleware 0.787s / ok router 0.799s`。
- 未做：浏览器手工验收（`make dev` 后在企业计费抽屉 / 财务账单页点调账、走二次验证）。

## 遗留

- 与方案的偏差：
  - 审计动作拆成 `enterprise.adjustment.wallet` / `enterprise.adjustment.bill` 两条模板（方案是一条带 `${bill_no}` 的模板，钱包调账会渲染出空的 `(bill )`）。
  - 前端二次验证没有接进 `EnterprisesProvider`，而是由 `AdjustmentDialog` 自己挂 `SecureVerificationDialog`：企业账单页 `BillsAdminContent` 渲染在财务中心，不在 provider 之内。
  - 账单调账后没有重新 `ArchiveBillAsync`：账期包只含对账单明细与原始日志（`BuildFinanceUsageCSVPayload` / `WriteLogsArchiveCSV`），不含 `adjustment_usd / total_usd`，重新归档会产出完全相同的对象。
  - 账单调到总额为 0 且未付时直接置 paid（方案写 unpaid），与出账时「零金额即 paid」一致，避免 0 元账单进催款。
  - 账单调账结清会触发 M10 的「待收款自动开期」（方案未涉及，合并批次 2 时按已拍板语义决定）。
- 企业侧账单详情（`enterprise-console/bill-detail-page.tsx`）已能看到 `adjustment_usd` 与 `total_usd` 变化和流水，但没有单独的「调整明细」列表；需要时读 `GET /api/enterprise/ledger?type=adjustment`。
- 不做：授信账期计数器的人工修正、批量调账（方案「不做」项）。
