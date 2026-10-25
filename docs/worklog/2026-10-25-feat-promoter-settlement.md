# 2026-10-25 feat promoter settlement

## 背景

- 推广人列表的「本月」列复用了上游 key `This month`，中文译文是「本月获得」，被当成收入；数值本身是绑定用户的净消耗。
- 黑鹰要求：列表只展示本月消耗；推广中心每日表最近在前；推广人加「分成比例」只做标识；分成结算在系统中只记状态，金额线下核算（平台要等客户回款才结算，没有固定时间）。tokensolo 已于 2026-09-29 下线佣金体系，没有可照搬的实现。

## 改动

### Commit 1 列头 + 每日倒序
- `promoters-columns.tsx` 列头改用已有 key `Month consumption`；`daily-tab.tsx` 明细表按日期倒序，柱状图仍升序。

### Commit 2 分成比例 + 编辑推广人
- `tf_promoters.share_rate numeric(5,2)`（百分比，0 = 未设置），只做标识不参与计算；`SetPromoter` 增加比例参数，新增 `UpdatePromoter`（0～100 校验）。
- `PUT /api/admin/promoter/promoters/:id`（审计 `promoter.update`，scope `user:write`）；列表新增「分成比例」列、行操作「编辑」、添加 / 编辑对话框共用 `PromoterFields`。
- 推广中心说明段落下追加「分成比例 N%。分成按净利润（扣除运营与资源成本）计算，以结算记录为准」，不列成本项。

### Commit 3 结算状态
- 表 `tf_promoter_settlements`：一行 = 推广人 × 自然月的「已结算」标记，部分唯一索引 `(promoter_user_id, month) where reverted_at IS NULL`；撤销写 `reverted_at` 留痕，再次标记插新行。落库快照：月净消耗、授信待回款、当时分成比例；可选实付金额（`numeric(20,6)`）、流水号、备注。
- `service/promoter_settlement.go`：
  - 月净消耗复用推广中心的 `promoterScope.read`（预聚合 + 实时补边 + `usage_since` 截断），结算月数字 == 推广中心同月区间的 `Summary.NetQuota`（测试直接断言）。
  - 授信拆分：名下企业主账号的每一天归到覆盖它的授信账期（先按当天末尾、再按当天开头找，固定天数账期边界落在一天中间时归较晚账期），账期已出账且账单 `paid` → 已回款；open / closing / unpaid / partially_paid → 待回款；`void` 按待回款计并单独报 `credit_void_quota`（仅管理员）。非企业用户与无账期的天不进桶。
  - 月份行附按用户子行（净消耗 + 授信拆分）。
  - 当前月 `settleable=false`；标记只允许已结束的自然月。
- 接口：`GET /api/promoter/center/settlements`（区间 → 自然月列表；`all=true` 列创建月至今）、管理端同路径 + `POST …/:id/settlements`、`DELETE …/:id/settlements/:month`（scope `billing:write`，审计 `promoter.settle` / `promoter.settle_revert`）。推广人视图不下发流水号 / 操作人 / 核销数。
- 前端：推广中心第四个 tab「结算」受顶部日期区间控制（区间只决定列出哪些月份，每月整月口径）；树形表 `SettlementsTable`（`useDataTable` + `getSubRows`，月份行展开到用户）与管理端 `SettlementsSheet`（行操作「结算」→ 抽屉，列创建月至今，标记 / 撤销）共用；`MarkSettledDialog` 以 `BillPaymentDialog` 为模板新建（那边绑定 `Bill` 与登记收款接口、金额必填且受未付上限约束，无法复用）。
- 顺带修复共享组件 `data-table-row.tsx`：`MemoizedDataTableRow` 的比较器没有包含展开态，TanStack 行对象引用稳定，树形表展开后月份行的折叠按钮不刷新（`aria-expanded` 停在 false）。把 `isExpanded` 像 `isSelected` 一样提成显式 prop 参与比较。模型消费面板同样受益。

## 验证

- `GOWORK=off go build ./... && go vet ./model/ ./service/ ./controller/ ./router/ ./middleware/`
- `make test-db PKG='-count=1 ./model/ ./service/ ./controller/ ./router/ ./middleware/'`：全部 ok（PostgreSQL 16，本地 docker `tokenfunc-postgres`）。新增 `TestPromoterSettlementMonths`（月份工具、与推广中心口径一致、授信拆分含核销账期、标记 / 重复 / 撤销 / 再标记留痕）、controller 结算契约（推广人视图无流水号、`all=true` 首项为当前月不可结算）。
- 迁移幂等：`make api TF_API_PORT=3003` 两次，第二次 `DEBUG=true` 下 `ALTER TABLE` 为 0。
- 前端：`bun run typecheck`、`bunx oxlint`（本次涉及文件零 error）、`bunx vitest run src/components/data-table src/features/promoters src/features/promoter-center src/i18n` 全绿；`bun run i18n:sync` 后上游 locale 无 diff、`_extras` 为空。表格行修复做过反向验证：回退 `data-table-row.tsx` 后 `settlements-table.test.tsx` 的折叠按钮断言失败。
- 浏览器核对交给黑鹰：列表列头「本月消耗」/「分成比例」；行操作「编辑」「结算」；推广中心「结算」tab 随区间切月份、月份行展开到用户；推广人账号看不到流水号与操作人。

## 遗留

- 管理端 `all=true` 对跨多年 × 数百用户的推广人会一次读取全维度行；推广人模块刚上线、月份少，一期可接受。升级路径：`tokenfunc_log_daily_rollup.go` 加 `(day, user_id, log_type)` 维度预设。
- 固定天数账期边界在一天中间时有半天归属误差；精确方案是用 `ent_usage_daily(day, period_id)` 分摊，二期再做。
- 推广人移除后结算记录按 `promoter_user_id` 保留；重新设为推广人后创建月变新，旧月份不再出现在抽屉里（如需历史再加开关）。
- 本次 PR：#44（https://github.com/nanofluxlabs-ai/tokenfunc/pull/44）。
