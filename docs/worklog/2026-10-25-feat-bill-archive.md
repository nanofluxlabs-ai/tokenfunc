# 已出账账单的账期包归档到对象存储

- 日期：2026-10-25
- 分支：feat/bill-archive（基于 feat/logarchive-import）
- PR：#41
- 关键 commit：53e54a1fb

## 背景

黑鹰最初的需求是「财务中心已结算账单和 logs 归档时存 oss 长期保存」，PR #35 只做了 logs 那一半。90 天归档开启后，账单账期内的原始日志会被删掉，账单详情页「导出 CSV（含明细）」对老账单会越来越空；账单作为财务凭证需要在出账时就冻结一份放到 COS。

## 变更

- 后端
  - `ent_bills` 加 `archive_info`（jsonb）与 `archived_at`；`model/tokenfunc_bill_archive.go` 定义登记结构、`bills/{bill_no}/{statement|raw-logs}.csv.gz` 对象路径、待归档查询、`MinUnarchivedBillPeriodStart`、`BillPeriodLogsPurged`。
  - `service/bill_archive_task.go`：事件驱动 + 兜底。出账成功后（授信自动出账、管理员手动出账、预付月度对账单生成）立即异步 `ArchiveBillAsync`；每小时一轮兜底任务只扫 `archived_at = 0` 的漏网账单（Redis 锁 `tokenfunc:bill_archive`，无 Redis 时 master-only，每轮 10 张），失败指数退避（1 小时起、封顶 24 小时），连续 3 次失败告警。黑鹰指出 5 分钟轮询相对月级账期过密，改为此方案；tokensolo 仍是 5 分钟轮询。`ArchiveBill` 生成两个对象：对账单冻结件复用新抽出的 `service.BuildFinanceUsageCSVPayload`（HTTP 导出与冻结件同一装配函数，含逐条明细），原始日志用 `WriteLogsArchiveCSV` + 新增的 `LogArchiveFilter.UserIds`；上传后登记。对象存储未配置时任务只记一次日志。
  - logs 保留任务新增红线：有未归档（且未作废）账单时，其最早账期开始日前一天起的天不清理（`PurgeArchivedLogsBefore` 与 `RetryLogArchiveDay` 都受约束）。
  - 接口：`POST /api/admin/finance/bill-archives/:id` 手动（重新）归档，审计 `bill.archive`；`GET /api/admin/finance/bill-archives/:id/:file` 从 COS 透传下载（桶私有、不签 URL）。scope `billing:write` / `billing:read`。
  - 账单详情上下文加 `logs_purged`（账期内已有天被清理）。
- 前端：账单详情页标题栏新增 `BillArchiveControl`（未归档 → 「归档到对象存储」；已归档 → 「已归档 · 日期」徽标 + 「对账单冻结件」「原始日志」下载）；`logs_purged` 时顶部告警提示以冻结件为准。审计模板补 `bill.archive` 与 #35 漏掉的 `log_archive.retry`。10 个新 i18n key × 7 语言。
- 回放工具 `cmd/logarchive-import` 加 `-bill <账单号>`：校验 sha256 后按 (主账号, 账期) 替换导入 `raw-logs.csv.gz`。
- 文档：`docs/tokenfunc/development.md` §5 补一句。

## 验证

- `make test-db PKG='-count=1 ./model/ ./service/ ./controller/ ./router/ ./cmd/...'`：全部 ok。
  - `TestBillArchiveProducesPeriodPackageAndGuardsRetention`：未归档时保留任务止步于 `unarchived bill period from 2026-03-09`、单日重试被拒；COS 故障三次后告警一次且退避期内不重试；恢复后任务归档成功，登记两个对象（原始日志 8 行、sha256 64 位、冻结件含企业名与账期日），下载入口按文件名打开；归档后保留任务放行并清理两天；详情上下文 `logs_purged=true`；作废账单不进队列。
  - 回放工具 `-bill` 用例：按账单导入 2 行、重复导入替换、不存在的账单号报错。
- 前端：`bun run typecheck`、oxlint 0 error、`bill-archive-control.test.tsx`（未归档显示归档按钮并调接口；已归档显示两个下载按钮，冻结件另存为 `<bill_no>-statement.csv.gz`）与财务 / 审计 / i18n 相关测试通过；`i18n:sync` 两次无 diff。
- dev 库迁移：`ent_bills` 新增两列，二次启动 `ALTER TABLE` 0 条，启动日志有 `bill archive task started`。
- 未对真实 COS 跑：dev 库没有已出账账单；生产发版后可在账单详情页点「归档到对象存储」验证首单。

## 遗留

- 账期包只覆盖企业主账号（员工无登录账号，消耗都在主账号）；个人用户没有账单，不在范围。
- 作废账单任务不自动归档，需要留证据时手动点按钮。
- 财务中心账单详情页的明细区仍读实时 logs；账期内日志被清理后只提示、不自动改读冻结件。
