# M13 财务中心账单明细在 logs 清理后自动改读 COS 冻结件

- 日期：2026-10-26
- 分支：feat/finance-bill-archived-detail（worktree `agent-a2b5df6bc7b8d5040`，slot 4）
- PR：
- 关键 commit：59df84ab6（后端）、c711e054e（前端）、43e4929ba（合入 origin/main #54 / #55）

## 背景

`2026-10-25-feat-bill-archive.md` 遗留项：logs 90 天清理后，管理员财务中心账单详情的「消费明细」只剩一条横幅提示，逐条明细区按实时 logs 查为空。M9 已让已结算账单的 summary / daily 走 `usage_snapshot` v2，本模块只接管逐条明细。方案见 `~/.claude/plans/company_mgr/M13-finance-bill-archived-detail.md`；已拍板：归档加 JSON 旁路件、进程内小 LRU、旧归档回落实时并保留横幅、明细超 20 万行只缓存汇总 / 按天、企业侧不做逐条明细。

## 变更

后端：

- `model/tokenfunc_bill_archive.go`：`BillArchiveInfo` 加 `StatementJSON`，文件名常量 `BillArchiveFileStatementJSON = "statement-json"`（对象 `bills/{bill_no}/statement.json.gz`），`BillArchiveObjectName` 统一对象基名与下载后缀；新增 `BillArchiveSchemaVersion = 2`（**与方案的偏差**：方案写 `LogArchiveSchemaVersion` 1→2，但该常量同时写进每日 logs 清单，logs 格式没变不该跟着升版，故账期包单独计版，logs 仍为 1）；`BillUsageSource` 按是否登记 JSON 件判定来源。
- `service/bill_archive_task.go ArchiveBill`：在 statement 之后把同一 `FinanceUsageCSVPayload` `common.Marshal` 后 gzip 上传为 JSON 件并登记（幂等覆盖）；存量 v1 归档靠账单详情页「归档到对象存储」重归档回填。
- `service/bill_archive_read.go`（新）：`LoadBillStatementPayload` = `ArchiveObject(statement-json)` → `store.Get` → gunzip → `common.DecodeJson`；进程内按账单 id 缓存 10 分钟、上限 20 份、登记的 sha256 变化即失效；明细超过 `FinanceUsageExportMaxRows`（20 万）时丢掉 Details、`IncludeDetail=false`。无 JSON 件返回 `model.ErrBillArchiveNotFound`。`SetLogArchiveStoreForTest` 导出给 controller 测试换内存 store。
- `controller/finance.go`：管理员 `usage/summary|daily|detail|export` 接受可选 `bill_id`（`financeArchivedBillPayload`）：账单必须属于 `user_id` 对应企业，否则 404；`archived_at>0 && BillPeriodLogsPurged`（或 `source=archive`）时从冻结件取数，响应同形并加 `"source":"archive"`，账期按账单；detail 内存分页（冻结件已按时间倒序），超上限返回 `Archived detail rows exceed the inline limit; download the statement snapshot instead`；export 含明细时透传 `statement.csv.gz` 解压流（与对象逐字节一致），`include_detail=false` 用同一载荷重写不含明细。`ErrBillArchiveNotFound` / 存储未配置回落实时 logs；其它存储错误直接报错不假装完整。个人 `/api/user/finance` 四接口不变。
- `model/finance_bill.go`：`FinanceBillContext` 加 `usage_source: live | archive | archive_unavailable`。
- 不新增路由，无需登记作用域；不触及 billing 读门。

前端 `features/finance`：

- `types.ts`：`UsageScope(admin)` 加 `bill_id?`，`FinanceBillContext.usage_source`；`api.ts usageRequest` 透传 `bill_id`。
- hooks：`usageKey` 加入 `bill_id`（同主体同区间的实时与冻结件两份缓存分开）；抽 `usageScopeOf`，明细表 / 导出控件 / `useUsageDetail` 共用，去掉三处重复的 scope 拼装。
- `bill-detail-page.tsx`：已出账账单的用量请求都带 `bill_id`（后端决定是否切冻结件）；`usage_source=archive` 显示「本账期的原始日志已清理，下方逐条明细改读 {{date}} 归档的对账单冻结件」（普通 Alert），`archive_unavailable` 保留原警告，`live` 不提示。`ExportCsvControl` 仍只对进行中账期显示（已出账账单的 CSV 走 M9 的 `BillExportCsvButton`）。
- 七个 `web/src/i18n/locales/tokenfunc/*.json` 各加 2 键（1314 键一致）。

## 验证

- `make wt-init`：slot 4，API 3004 / 前端 5177，schema `dev_agent_a2b5df6bc7b8d5040` / `test_agent_a2b5df6bc7b8d5040`，Redis db 8 / 9。
- `gofmt -l model/ service/ controller/` 无输出；`go vet ./model/ ./service/ ./controller/ ./middleware/ ./router/` 通过。
- `make test-db PKG='./service/ -run TestBillArchiveProducesPeriodPackageAndGuardsRetention -count=1 -v'`：PASS。新增断言：归档登记 `statement_json` key 与行数 2；`LoadBillStatementPayload` 读回与 `BuildFinanceUsageCSVPayload` 实时装配的载荷 `assert.Equal` 深度相等；删掉对象后第二次读命中缓存（同一指针），清缓存后报错而不回落；去掉 JSON 登记的 v1 账单返回 `ErrBillArchiveNotFound`、`BillUsageSource` 为 `archive_unavailable`；logs 清理后 `GetFinanceBillContext.UsageSource == archive` 且冻结件仍可读到 2 行明细。
- `make test-db PKG='./controller/ -run TestAdminFinanceUsageReadsArchivedStatementAfterLogsPurged -count=1 -v'`：PASS（真实 PG + 内存 store）。这是方案「验收」一节的本地演练：3 条消费 logs → `ArchiveBill` 三对象 → logs 未清理时 detail 走实时且无 `source` → 登记一天为 purged 并 `DELETE` 该用户账期内全部 logs → detail `page_size=2` 翻三页（2 / 1 / 0 行，`total=3`，时间倒序首行 quota 300）、`source=archive`；summary `total_calls=3 / total_quota=600`、账期按账单；export 正文与 store 里 `statement.csv.gz` 解压后逐字节相等且含「调用明细」，`include_detail=false` 不含；`GET /bills/bill/:id` 返回 `usage_source=archive`；他人 `user_id` 配该账单 404；改回 v1 登记后 detail 回落实时（`total=0`、无 `source`）、`usage_source=archive_unavailable`。
- 合入 origin/main `b376208f8`（#54 M11、#55）：无冲突。之后 `make test-db PKG='./model/ ./service/ ./controller/ ./middleware/ ./router/ -count=1'` 五包 `ok`（model 17.3s、service 6.3s、controller 47.5s、middleware 0.8s、router 0.8s）。
- 前端：`bunx oxfmt --write` 8 个改动文件；`bunx oxlint -c .oxlintrc.json src/features/finance` exit 0；`bun run typecheck` 通过；`bunx vitest run src/features/finance src/features/enterprise-console src/features/enterprises src/i18n` 32 文件 110 条通过，其中新增 `hooks/__tests__/use-usage-breakdown-queries.test.tsx`（带 / 不带 `bill_id` 的 queryKey 不同、self 主体占位 0；`useUsageDetail` 把 `bill_id` 传给 API 且缓存 key 含 42）与 `bill-detail/__tests__/bill-detail-usage-source.test.tsx`（archive 横幅含归档日期且无旧警告；archive_unavailable 只有旧警告；live 两者皆无且明细请求带 `bill_id`），`locale-shape.test.ts` 守卫七文件键集合一致。
- 未做浏览器验收：worktree 的 dev schema 为空库，没有已出账且归档的账单，也不接真实 COS；删 logs 后翻页与导出一致性由上述 controller PG 测试覆盖。

## 遗留

- 存量 v1 归档账单没有 JSON 件，页面显示 `archive_unavailable` 警告；趁 logs 未删在账单详情页点「归档到对象存储」重归档即可回填。
- 明细超过 20 万行的冻结件只在线给汇总 / 按天，明细提示下载冻结件；当前 `ListFinanceUsageForExport` 超 20 万行直接报错导致归档失败，所以这条分支目前只是防御。
- 下载接口 `GET /bill-archives/:id/:file` 现在也接受 `statement-json`，前端没加按钮。
- 企业侧账单详情仍只到按模型 / 按天（方案「不做」项）。
