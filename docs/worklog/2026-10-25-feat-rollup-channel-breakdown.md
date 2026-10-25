# 预聚合表加渠道维度与拆分列，财务中心剩余两块切到预聚合

- 日期：2026-10-25
- 分支：feat/rollup-channel-breakdown
- PR：
- 关键 commit：

## 背景

PR #34 只把财务中心「用户消耗基础列」和「经营看板每日净额」切到了 `tf_log_daily_rollups`；模型消费（分组 × 模型 × 渠道）和用户消耗的 token / 钱包订阅拆分列仍全区间扫 logs。PR #35 上线 90 天归档后，这两块对已删天会是空的，而且与同页已切预聚合的净额列口径不一致。黑鹰拍板补齐。

## 变更

- 预聚合表 `tf_log_daily_rollups` 升到 v2：
  - 维度加 `channel_id`，唯一索引改名 `uk_tf_log_daily_rollup_v2`（六列）。
  - 度量加九列：`text_input_tokens / text_output_tokens / cache_read_tokens / cache_write_tokens / audio_input_tokens / audio_output_tokens / wallet_quota / subscription_quota / last_consume_at`，只对消费行有值，口径与 `financeLogFromSQL` 的派生列一字不差（实时段的 SQL 直接改用该 FROM 片段）。
  - `LogDailyUsageRow` / `LogUsageTotals` 同步带这些字段，`Add` 对消费行累加、`LastConsumeAt` 取最大值。
- 读取器：内部过滤改为 `logUsageFilter{UserIds, ModelLike, Group}`；新增粒度 `logUsageDimsModelChannel` 与导出函数 `ReadLogUsageByModelChannel(userIds, modelLike, group, range)`，模型名模糊 / 分组过滤同时作用于实时段与预聚合段。
- 财务中心：
  - `ListFinanceUserConsumptions` 的拆分列与 `last_consume_at` 直接取自读取器的 totals，删掉 `fillFinanceUserBreakdown` 的实时补查。
  - `ListFinanceModelConsumptions` 改走 `ReadLogUsageByModelChannel`，排序 / 截断 / 渠道名补齐逻辑不变。行为差异（有意）：`username` 筛选改在 users 表匹配（用户名模糊、数字 id），与用户消耗关键词口径一致，不再匹配日志写入时的用户名。
- 一次性迁移 `MigrateLogDailyRollupV2`（`model/main.go` AutoMigrate 之后调用）：`options.tf_log_rollup_schema` 不是 `2` 时，删旧唯一索引 `uk_tf_log_daily_rollup`、清掉可重建的行、删游标与「昨天已重算」标记，维护任务下一轮从最早日志重建。已 `purged` 的天无法重建：这些天的 v1 行保留（渠道与拆分列为 0），游标停在最后一个 purged 日。重复启动幂等。
- 前端无改动：接口字段不变。

## 验证

- `make test-db PKG='-count=1 ./model/ ./service/ ./controller/'`：三包 ok，0 FAIL。
  - `TestLogDailyRollupReadSegments`：种子加渠道与三种 other 口径（OpenAI 扣缓存 / 音频、Claude 净输入、订阅扣费），实时 / 三段混读 / 按用户 / 按天 / 按模型 × 渠道折叠的全部字段（含拆分列、`last_consume_at`、渠道）一致；模型名模糊 + 分组过滤跨段生效。
  - `TestLogDailyRollupMatchesFinanceUserConsumptions`：删掉前两天原始日志后，用户消耗全部列与模型消费结果与删前逐字段相等；`username=BOB` 命中 users 表。
  - `TestMigrateLogDailyRollupV2`：无 purge 全清 + 游标归零 + 版本写入；已是 v2 不再清；有 purged 天时保留该天、游标停在该天。
- dev 库真实升级：旧表 3 行（v1 索引、游标 10-24）→ 新版启动日志 `log daily rollup schema upgraded to v2`，索引只剩 `uk_tf_log_daily_rollup_v2`，游标删除、`tf_log_rollup_schema=2`；60s 后任务重建，行带 `channel_id` 与拆分列；`DEBUG=true` 二次启动 `ALTER TABLE` 0 条、无 panic。
- `GOWORK=off go build ./...`、`go vet` 通过。

## 遗留

- 预聚合表行数由 (用户 × 模型 × 分组) 变为再 × 渠道，首轮回填时间相应变长；生产当前日志量小，不处理。
- 财务中心 `finance_usage.go` 的按用户用量汇总 / 每日 / 明细仍实时扫 logs：它们要倍率分布与逐条明细，预聚合不覆盖，归档后 90 天外只能靠 COS 回放（待做）。
