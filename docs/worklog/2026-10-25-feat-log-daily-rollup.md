# logs 按天预聚合表 `tf_log_daily_rollups` 与维护任务

- 日期：2026-10-25
- 分支：feat/log-daily-rollup
- PR：#32
- 关键 commit：4678c74e0

## 背景

推广人模块（后续 PR `feat/promoter`）要按「若干用户 × 日期区间」统计消耗，财务中心现有实现是每次全区间扫 logs。参考 tokensolo 的经验：logs 超过 2000 万行后实时聚合会把 PG CPU 打满（10-24 事故），且「每小时重算昨天」会造成周期性尖峰。因此先落一张按天预聚合表，让后续读路径只对「今天 + 区间两端不满一天」实时查 logs。

## 变更

- 后端 / 迁移：新表 `tf_log_daily_rollups`，粒度 (上海日, user_id, log_type 2|6, group_name, model_name)，唯一索引覆盖这五列，另有 (user_id, day) 索引；登记进 `model/main.go` 的 AutoMigrate 列表。
- 后端：`model/tokenfunc_log_daily_rollup.go` 提供 `RollupLogDay`（LOG_DB 聚合 → 主库同事务删旧插新，重跑幂等）、`ReadLogDailyUsage`（区间自动分三段：头部不满一天实时 / 完整日且 ≤ 游标读表 / 其余与今天实时；user_id IN 按 500 分批）、泛型折叠 `FoldLogDailyUsage` 与 `LogUsageTotals`（净额 = 消费 − 退款，次数与 token 只计消费，与财务中心口径一致）。
- 后端：游标 `tf_log_rollup_cursor`（最后一个完整 rollup 日）与 `tf_log_rollup_yesterday_done` 存 options 表，直接 upsert 读写，不走 `UpdateOption` / `OptionMap`（多副本内存快照不同步）。
- 后端：`service/log_daily_rollup_task.go` 每小时一轮，启动后 1 分钟首跑，Redis 锁 `tokenfunc:log_daily_rollup`，非 PG 不启动；从游标下一天补到昨天（首次回看最多 400 天，逐日推进游标，天与天之间停 300ms），昨天只在「上一轮已算过」之后重算一次，今天永不写。`main.go` 在授信任务后接线。
- 后端：新增 `model/tokenfunc_db.go`：`BillingLocation()`（替换 `controller/finance.go` 手写的 FixedZone）与 `InitColumnNames()`（给跨包 PG 测试夹具初始化 `logGroupCol`）。
- 测试：`model/tokenfunc_log_daily_rollup_test.go`（三段读取与删除原始日志后结果一致、游标决定数据来源、重跑幂等、与 `ListFinanceUserConsumptions` 对账）、`service/log_daily_rollup_task_test.go`（游标推进、今天不写、昨天只重算一次、跨天继续推进、无日志不动游标）。`financeTestTables` 补了 `LogDailyRollup` 与 `Option`。

财务中心三个聚合接口切到读取器不在本 PR，单独 follow-up。

## 验证

- `GOWORK=off go build ./... && go vet ./model/ ./service/ ./controller/`：通过。
- `make test-db PKG='-count=1 ./model/ ./service/ ./controller/'`：model 18.6s / service 3.8s / controller 47.4s 全部 ok（PostgreSQL 容器 `tokenfunc-postgres`，test schema）。
- 迁移幂等：`make api TF_API_PORT=3003` → `make api-stop` → `DEBUG=true make api TF_API_PORT=3003`，第二次 `grep -c 'ALTER TABLE' .tmp/logs/api.out` = 0，SQL 行数 1331 > 0。
- 任务首跑：第一次启动 60s 后日志出现 `log daily rollup: day=2026-10-09 rows=2` … `day=2026-10-24 rows=0`（dev 库最早日志 10-09），`options` 里 `tf_log_rollup_cursor = 2026-10-24`，`tf_log_daily_rollups` 3 行。
- 本项目二开只支持 PostgreSQL（见 CLAUDE.md），未做 SQLite / MySQL 矩阵。

## 遗留

- 财务中心 `ListFinanceUserConsumptions` / `ListFinanceModelConsumptions` / `financeDailyNetConsume` 仍实时扫 logs，待切到 `ReadLogDailyUsage`。
- 90 天 logs 保留 + 归档到腾讯云 COS 为独立 PR-3，本 PR 不含。
- 预聚合只到天，「最后消耗时间」类字段在读预聚合的场景只能给到日期。
