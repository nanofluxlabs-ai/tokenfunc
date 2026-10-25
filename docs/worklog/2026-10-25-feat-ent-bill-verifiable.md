# M9 账单可验算：快照 v2、两侧详情统一口径、企业账单 CSV 导出、账单页去 tab

- 日期：2026-10-25
- 分支：feat/ent-bill-verifiable（worktree `agent-aa56ac2a2dd59a524`，slot 5）
- PR：
- 关键 commit：889c33f95（后端）、c878d2185（前端）

## 背景

企业财务拿到账单只有金额级的按模型 / 按团队 / 按成员块，无法自己验算：没有四项 token、没有单价、没有倍率、没有按天。财务中心（`model/finance_usage.go` / `finance_log_dims.go` / `service/finance_export.go`）已经有与 tokensolo 三份报告一致的口径（倍率多值取消费占比最大、单价四列 = 模型 × 分组 × (1e6 / QuotaPerUnit) × 维度倍率、缺失为 null 不倒推），管理员账单详情却全部实时扫 logs，logs 归档清理后就看不到了。方案见 `~/.claude/plans/company_mgr/M9-bill-verifiable.md`：出账时调用财务聚合冻结进 `usage_snapshot`（方案 B），两侧详情已结算读快照、进行中实时。

## 变更

后端（只读聚合写快照，不触及 billing 预扣 / 结算 / 价格）：

- `model/enterprise_bill_snapshot.go`（新）：`EnterpriseBillUsageSnapshot`（`snapshot_version=2`、`logs_total_calls / logs_total_quota`、`by_group_model`、`by_model`、`by_day`），`snapshotEnterpriseBillUsage` 在事务外只读聚合，失败只 `SysError` 返回 nil；`UsageSnapshotV2()` 解析账单快照；`FinanceSummary()` / `FinanceDaily()` 把快照还原成财务汇总供 CSV 复用。聚合绕过 `GetFinanceUsageSummary` 的 60 秒缓存（直接 `aggregateFinanceUsage`），避免账期刚结束时拿到在途结算落地前的旧值。
- `model/enterprise_bill.go`：`IssueCreditBill` 先读账期（不加锁），closing 时在事务前聚合，事务内 `mergeInto` 写进同一个 jsonb（`by_model` 覆盖 `ent_usage_daily` 口径的同名块，`by_team / by_member / detail_total_quota` 不变）；`summarizeUsageByPeriod` 改为 `summarizeUsageAttribution(tx, enterpriseId, scope)`，预付月度对账单 `GenerateMonthlyStatements` 也写归因块 + v2 财务块（范围 = 自然月）。
- `model/finance_usage.go` 新增 `FoldFinanceModelRatios`：跨分组按模型折叠，倍率分布合并后重新 `resolve`、单价按主值换算；`model/finance_log_dims.go` 给 `financeRatioAccumulator` 加 `addResolved`。
- `controller/enterprise_bill.go`：`GET /api/enterprise/bills/:id/export`（`enterprise:read`，企业管理员及以上）与 `GET /api/admin/enterprise/bills/:id/export`（`billing:read`）。已归档 → `OpenBillArchiveObject(statement)` gzip 解压透传（含逐条明细）；对象存储不可用则退回快照；未归档 → 快照 v2 还原 `FinanceUsageCSVPayload`（`IncludeDetail=false`）走 `WriteFinanceUsageCSV`；旧快照返回 `success=false` 提示无法导出。`currentEnterpriseBill` 收口企业侧越权 404。
- 路由 `router/enterprise-router.go`、作用域登记 `middleware/access_token_routes_enterprise.go`。

前端：

- `bills-page.tsx` 去 tab，`listBills` 不再传 `bill_type`；`bills-table.tsx` 类型作独立列，行操作「导出发票」（`FileText`，仍走 `openInvoicePrintWindow`）+「导出 CSV」（新 `BillExportCsvButton`，`exportScope` 区分企业 / 管理员路由，复用 `readBlobError / saveBlob`）；管理员 `bills-admin-page.tsx` 传 `exportScope='admin'`。
- `types.ts`：`BillUsageSnapshotV1 / V2` 判别联合 + `isBillSnapshotV2`，`Bill.usage_snapshot` 改为该类型。
- 新 `features/finance/components/usage-breakdown/bill-snapshot-section.tsx`：渲染 v2 快照（复用 `TokenGroupSummaryTable` + `DailySummaryTable`），`logs_total_quota ≠ amount_quota` 时 Alert 提示在途尾差；企业侧与管理员侧共用。
- 企业 `bill-detail-page.tsx`：v2 走 `BillSnapshotSection`，v1 维持按模型表并提示旧快照；按团队 / 按成员块加缓存两列（旧快照显示「-」）；状态卡加「导出 CSV」。
- 管理员 `finance/components/bill-detail/bill-detail-page.tsx`：`kind==='bill' && snapshot_version>=2` 时渲染快照、`useUsageSummary` 关闭、请求数取 `logs_total_calls`，逐条明细区加「以归档冻结件为准」说明（实时表保留，M13 接管）；进行中账期维持 `UsageBreakdownSection` + `ExportCsvControl`；账单的 CSV 改为 `BillExportCsvButton scope='admin'`。
- `lib/invoice-html.ts`：v2 按模型表四项 token + 四列单价（出现 1h 缓存写入时拆 5m / 1h）+ 金额 + 模型 / 分组倍率（多值加「*」并在表尾注释取值 / 占比，复用 `describeRatio / formatRatioValue / formatUnitPrice`），追加按天表；按团队表（v1 兼容 `by_department`）加缓存两列；`quotaToUsd` 改读 `getCurrencyDisplay().config.quotaPerUnit`；打印改 A4 横向。
- 七个 `web/src/i18n/locales/tokenfunc/*.json`：新增 8 个键，`Usage by department` 改名 `Usage by team`。

## 验证

- `make wt-init`：slot 5，API 3005 / 前端 5178，schema `dev_agent_aa56ac2a2dd59a524` / `test_agent_aa56ac2a2dd59a524`，Redis db 10 / 11。
- `GOWORK=off go build ./...`（本地无 `web/dist` 时报 embed 错误，与本次改动无关）；`gofmt -l model/ controller/` 无输出；`go vet ./model/ ./controller/ ./router/ ./middleware/` 通过。
- `make test-db PKG='./model/ -run "TestIssueCreditBillSnapshotV2|TestEnterpriseBillRemindersAndStatements" -count=1 -v'`：两条均 `--- PASS`（真实 PG，未跳过）。`TestIssueCreditBillSnapshotV2` 断言：同一模型跨两个分组倍率 2.5（6000）/ 3（1000）折叠后主值 2.5 且 shares 完整；单价四列 5 / 0.5 / 6.25 / 25；无倍率的行单价 null；`Σby_day.quota == logs_total_quota == 7500` 而账单金额仍为计数器 7600；`LOG_DB=nil` 时出账照常且快照无 `snapshot_version`。
- `make test-db PKG='./model/ ./service/ ./controller/ ./middleware/ ./router/ -count=1'`：五个包全部 `ok`（model 22.7s、controller 46.1s）。含 `TestEnterpriseConsoleBillExport`（sqlite，走现有 controller 夹具）：v2 账单导出 200、`text/csv`、BOM、含「汇总(按令牌分组-模型)」「汇总(按模型)」「汇总(按天)」与单价列 `5.0000`、不含「调用明细」；v1 账单 `success:false`；他企业账单 404。`router` 的 `TestAccessTokenRouteRulesCoverEveryDashboardRoute` 通过（两条新路由已登记）。
- 前端：`bun run typecheck` 通过；`bunx oxfmt --write` 与 `bunx oxlint -c .oxlintrc.json` 对改动文件 / 目录无 error；`bunx vitest run src/features/enterprise-console src/features/finance src/i18n`：17 个文件 53 条通过，其中新增 `bill-detail-snapshot.test.tsx`（v1 显示「-」且无单价列、v2 渲染单价表头与按天表、logs 合计 ≠ 账单金额时出提示）、`invoice-html.test.ts` 补 v1 / v2 两条（单价列、`2.5*` 标注与表尾注释、按天表、按团队缓存列），`locale-shape.test.ts` 守卫七文件键集合一致。
- 未做浏览器验收：worktree 的 dev schema 为空库，没有 acme 企业与消费日志可出账；端到端链路（logs → 出账 → 快照 → 页面 / CSV）由上述 PG 测试覆盖。

## 遗留

- 历史账单（无 `snapshot_version`）不回填 v2，前端按 v1 兼容渲染并提示；需要的话可对 logs 仍在的账单写一次性回填脚本（M9 方案「不做」项）。
- 管理员财务详情的逐条明细区在已结算账单上仍是实时 logs，logs 清理后为空；读归档冻结件由 M13 接管。
- 在途尾差提示按 `logs_total_quota` 与 `amount_quota`（账期计数器）比较，而非方案里写的 `detail_total_quota`：财务验算的对象是账单金额，计数器与明细的差已有 `reconcile_diff_quota` 承接。
- `FoldFinanceModelRatios` 合并跨分组倍率时，专属分组标记只跟随合并后的主值，shares 里不区分专属与否（与 CSV 单行口径一致）。
