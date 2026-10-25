# 财务中心用户消耗与每日净额切到预聚合读取器

- 日期：2026-10-25
- 分支：refactor/finance-daily-reader
- PR：#34
- 关键 commit：4c40d59d0

## 背景

PR #32 落了 `tf_log_daily_rollups` 与 `ReadLogDailyUsage`，但财务中心三个聚合仍全区间扫 logs。黑鹰拍板：只切 `ListFinanceUserConsumptions` 的基础列与经营看板的 `financeDailyNetConsume`；模型消费按渠道维度聚合、用户消耗的 token / 钱包订阅拆分来自 jsonb，预聚合表没有这些维度，不切。PR-3 要按 90 天删 logs，这一步是它的前置：删掉的天在财务中心基础列上不能缺数。

## 变更

- `model/tokenfunc_log_daily_rollup.go`：读取器按粒度拆成全维度 / 按用户 / 按天三种（`logUsageDims`），后两种在 SQL 侧 `GROUP BY`，不把全站 用户 × 日 × 模型 行拉进内存；新增 `ReadLogUsageByUser` / `ReadLogUsageByDay`，三段拼接逻辑共用 `readLogUsage`。
- `model/finance_overview.go`：`financeDailyNetConsume` 改读 `ReadLogUsageByDay`，删掉手写 SQL 与 `financeDayQuota`。
- `model/finance_consumption.go`：`ListFinanceUserConsumptions` 基础列（消费 / 退款 / 净额 / 次数 / token）改读 `ReadLogUsageByUser`；关键词改在 `users` 表匹配（用户名 ILIKE / 数字 id，含软删用户），不再匹配日志写入时的用户名；用户名统一由 `fillFinanceUserProfiles` 从 `users` 取；`last_consume_at` 并入当前页用户的拆分查询（`MAX(created_at)`），仍只对 ≤ 100 个页内用户实时查。
- 行为差异（有意）：关键词按当前用户名而非历史用户名匹配；原始日志被归档删除后，基础列照常，拆分列与最后消耗时间只反映仍存在的日志。

## 验证

- `GOWORK=off go build ./... && go vet ./model/`：通过。
- `make test-db PKG='-count=1 ./model/ ./service/ ./controller/'`：model 19.5s / service 5.7s / controller 55.8s 全部 ok。新增断言：`ReadLogUsageByUser` / `ReadLogUsageByDay` 与全维度折叠逐项相等且跨三段；财务用户消耗与折叠结果对账；关键词按用户名 / id 命中；删掉前两天原始日志后基础列不变、最后消耗时间取自仍存在的第三天日志。既有 `TestFinanceUserConsumptions` / `TestFinanceOverview` 不改断言全部通过。
- 本地 `make api` 后 `GET /api/admin/finance/overview`、`/user-consumptions` 返回 success（见 PR）。

## 遗留

- 模型消费 `ListFinanceModelConsumptions` 仍全区间扫 logs（渠道维度）；用户消耗拆分列在归档后对已删天为 0。PR-3 若要这两块在 90 天外也完整，需给预聚合表加渠道与拆分列，届时再议。
