# 企业账户菜单收口、财务对账页、账期账单详情复用财务中心

- 日期：2026-10-26
- 分支：main（直接提交，不开 PR）
- PR：
- 关键 commit：3ed87d19d

## 背景

黑鹰梳理企业账户的后台：企业组已有概览 / 密钥 / 用量，「常规」组对企业账户是重复的；日志要单独成组放企业组下面；「账单」只是账期账单，企业需要和个人用户一样的消费账单 / 充值账单，合成一个「财务对账」页；企业侧账单详情是第二份实现，要求直接复用管理员财务中心的详情；企业用户登录应落到企业概览；「个人」组只留个人资料与安全访问。

讨论中确认的三个口径（黑鹰拍板）：

- 充值账单的数据源是**企业账本**：预付企业线下充值登记只写 `ent_ledger` 并加余额，不写充值日志，个人充值账单读的是在线订单 + 充值日志，照搬会是空的。
- 企业管理员（一键开通的账号）按**企业钱包**取数：个人财务接口按登录人取数，管理员看到的会是自己的空账，所以后端加企业维度接口，内部以企业主账号 id 复用同一批函数。
- 「企业账户」= 企业主 + 企业一键开通的账号（现有 `is_owner || provisioned`）。绑定已有账号进企业的成员仍是普通钱包，菜单与落地页保持普通用户的样子。

## 变更

### 后端

- `GET /api/enterprise/finance/usage/{summary,daily,detail,export}`：企业维度用量四件套，薄包装 `financeUsage*WithArchive(c, enterprise.UserId)`；管理员四个接口改为同一批函数。`bill_id` 读冻结件复用原归属校验。PAT 规则同步加 `enterprise:read`。
- `ListEnterpriseLedger` 加 `ts_start / ts_end` 过滤，`type` 支持逗号多值（充值账单只要 topup / adjustment / bill_issued / bill_payment / cross_period_adjustment，授信配置变更是配置记录不进账单），管理员与企业侧同一处透传。
- `GetFinanceBillContext` 对 v1 旧账单现算 v2 快照并标 `snapshot_source: live`（调用点从企业侧上移，管理员侧同样拿到）；企业侧 `GET /api/enterprise/bills/:id` 改返回同一 `FinanceBillContext`（`user` 置空）。

### 前端

- 菜单：企业账户隐藏「常规」组；新增「日志」组（使用 / 审计 / 任务日志，与常规组共用同一份 item）放企业组之后；「个人」组去掉钱包与个人对账；企业组「账单」改名「财务对账」（URL 仍是 `/enterprise/bills`，预算邮件链接不变）。普通用户与绑定已有账号的成员菜单不变。
- 落地页：`/dashboard` 两个路由的 `beforeLoad` 用 `enterpriseSelfQueryOptions` 判定企业账户后转 `/enterprise/overview`，登录 / OAuth / 首页按钮里 8 处 `/dashboard` 硬编码不动。
- 财务对账页 `reconciliation-page.tsx`（替代 `bills-page.tsx`）：三 Tab「账期账单 / 消费账单 / 充值账单」。账期账单 = 授信账期表（授信企业）+ 账单表；消费账单复用个人对账页的 `UsageTab`，`UsageScope` 新增 `enterprise` 主体；充值账单 = `LedgerTable` 按页头日期区间过滤。日期控件与个人对账页同一套。
- 概览页去掉折叠的「资金流水 / 授信账期」区块，第一张 KPI 卡加「查看财务对账」深链；预付企业的最近充值仍从流水取。
- 账期账单详情：共用正文 `finance/components/bill-detail/bill-detail-content.tsx` + 骨架 `bill-detail-view.tsx`，管理员专属的对账核对 / 归档 / 账期 CSV 通过 `adminActions` / `onAckReconcile` 注入；企业侧 `bill-detail-page.tsx` 删除，`/enterprise/bills/$id` 直接渲染共用骨架。企业侧独有的已付未付、月结单五栏、按团队按成员归因、v1 兼容、live 提示并进共用正文。口径统一：账期结束日按半开区间减一天（企业侧原来多显示一天）；详情总额 2 位小数（与列表、发票一致）。
- 分页统一（第二轮，黑鹰要求与使用日志一致）：企业密钥页、财务对账的账期账单 / 充值账单、管理员企业账单页、试用申请页、日志归档页全部改为 `useDataTable` + `DataTablePage`（底部通用分页条：总数 / 每页条数 / 页码）；共享的 `BillsTable`、`LedgerTable` 接受可选的服务端分页 props（不传时不显示分页条，管理员抽屉仍只列最近若干条）；第一轮抽出的 `SimplePager` 随之删除。密钥页多选改用表格实例的行选择（`rowSelection` / `getRowId`），批量操作栏不变。评估：二开其余列表（财务中心各面板、推广人、渠道消耗、个人对账充值明细）原本就是这套分页，无需再动；授信账期表一企业一期数据量小，仍是静态表。

### 财务中心 · 企业账单（第三轮，黑鹰要求）

- 进行中 / 待出账的授信账期不再单独一张表，并入账单表：后端 `ListFinanceBills` 改为账期（end_at 升序）在前、已出账账单在后的同一分页序列，`total` 合计，分页跨段自动衔接；已出账行带完整 `bill`，行操作（发票 / CSV / 收款 / 调账 / 作废）不再二次请求。旧 `open_periods` 字段删除。
- 查询条：企业名称 / 账单号（ILIKE，`EnterpriseBillFilter` 新增两个字段，`/api/admin/enterprise/bills` 同样可用）/ 状态下拉（第一项「全部状态」，之后 进行中 / 待出账 / 未付 / 部分已付 / 逾期 / 已付 / 已作废 / 月度对账单 / 对账差异，一个 `status` 参数覆盖原来的 tab + overdue + bill_type + reconcile）/ 查询 / 重置 / 共 N 条；原来的状态 Tabs 删除。
- 前端：`BillsTable` 的行改成 `账单 | 账期` 联合类型（`rows`），企业侧对账页只传账单行；财务中心 `bills-panel.tsx` 承载查询条 + 表 + 行操作对话框，`enterprises/components/bills-admin-page.tsx` 与 `finance/components/bills/open-periods-table.tsx` 删除，对账差异测试迁为 `finance/components/bills/__tests__/bills-panel.test.tsx`（账期行与账单行同表、查询 / 重置、状态下拉）。

## 验证

- 后端：`go build ./... && gofmt -l controller model router middleware` 无输出；`make test-db PKG="./controller/... ./model/... ./router/... ./middleware/..."` 四包 ok（PG）；新增用例单跑 PASS（`TestFinanceBillContextAndList`、`TestAdminFinanceUsageReadsArchivedStatementAfterLogsPurged`、`TestEnterpriseConsoleBillExport` 含账本时间 / 多类型过滤）。
- 企业账单一轮：`make test-db PKG="-count=1 -run TestFinanceBillContextAndList ./model/"` PASS（新增：账期在前账单在后、跨段分页、只看 open、账单号只过滤账单、企业名称不区分大小写）；`make test-db PKG="-count=1 ./model/... ./controller/..."`；前端 `typecheck`、改动文件 oxlint / oxfmt、`vitest run src/features/finance src/features/enterprise-console src/features/enterprises` 41 文件 154 用例通过；浏览器（qa-admin）财务中心企业账单：查询条 + 单表，按账单号「TF-2026」搜索得 1 条。
- 分页统一一轮：`bun run typecheck`、改动文件 oxlint / oxfmt 通过；`vitest run --changed HEAD` 6 文件 19 用例通过（密钥页 5、财务对账页 5、概览等）；浏览器确认密钥页（整页高度、页脚分页、多选）、财务对账账期账单 / 充值账单（表格下方分页条，每页 20 可切）。
- 前端：`bun run typecheck` 通过；`oxlint` 改动目录 0 error（仅上游既有 warning 与 `chat/$chatId.tsx` 的既有 error）；`oxfmt --check` 改动文件通过；`vitest run --changed HEAD` 32 文件 203 用例通过；全量 `vitest run` 295 文件 2744 用例 0 失败（第一次全量与代理并行跑时有 7 个文件偶发失败，复跑全部通过）。
- 浏览器（本地 :5173，三个 host 各一个会话）：
  - acme（企业主）带 `redirect=/dashboard` 登录 → 落到 `/enterprise/overview`；侧边栏 = 聊天 / 企业（概览、团队管理、API 密钥、用量报表、财务对账）/ 日志（使用、审计、任务）/ 个人（个人资料、安全与访问），无常规组；概览无折叠区，余额卡有「查看财务对账」。
  - 财务对账三 Tab：账期账单列 2 张账单 + 分页；消费账单按企业钱包出数（请求数 / 总额 / 令牌分组 / 按天 / 明细 / 导出 CSV）；充值账单列企业账本资金变动，过滤后不再混入「授信配置变更」。
  - 企业侧账单详情 `/enterprise/bills/1` 与管理员 `/finance/bills/bill-1` 同一版式：live 提示、总金额 2 位、已付 / 未付、授信额度、使用率、账期 `2026-10-09 ~ 2026-10-31`（半开区间减一天）、出账 / 到期、请求数、令牌分组 / 按天 / 消费明细；管理员多出归档徽标、对账单冻结件、原始日志按钮。
  - wangwu（团队管理员，一键开通账号）直达 `/dashboard` → 企业概览；菜单无财务对账、无常规组、有日志组；直达 `/enterprise/bills` 后端 403「insufficient enterprise role」。
  - qa-admin（平台管理员，非企业账户）菜单不变：常规 / 个人（含钱包、财务对账）/ 管理员。

## 遗留

- 企业侧不支持进行中账期（`period-<id>`）的详情，概览第一张卡已展示本期实时数字；日后加 `GET /api/enterprise/credit-periods/:id` 返回同一 context 即可复用正文。
- 充值账单（企业账本）暂无 CSV 导出。
- 管理员打开 logs 未清理的 v1 旧账单详情会在请求内扫一次账期 logs（企业侧原本如此，范围有界）。
