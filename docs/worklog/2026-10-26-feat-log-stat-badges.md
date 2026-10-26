# 使用日志页统计徽标增强：请求数、净消耗、Tokens/缓存、失败率、实时 RPM/TPM

- 日期：2026-10-26
- 分支：feat/log-stat-badges
- PR：#65
- 关键 commit：a5fd945a9（后端）

## 背景

黑鹰对比 tokensolo 使用记录页的统计卡片（总请求 / 消耗 / 日志 RPM / 日志 TPM），问 tokenfunc 要不要做。tokenfunc 通用日志筛选栏原本就有上游的「消耗 / RPM / TPM」徽标，但存在四个问题：

- 没有请求数。
- RPM/TPM 是最近 60 秒的值，与所选区间无关，查历史区间时容易误读。
- 统计不认 `request_id` / `upstream_request_id` 筛选，结果和表格对不上。
- 缺少排查用的指标。

决定保持徽标形态，不做大卡片。日志页定位是查明细，总览类卡片已经放在 dashboard / finance。

## 变更

- 后端（二开独立文件，不改上游 `SumUsedQuota` 和 `/api/log/stat`）：
  - `model/tokenfunc_log_stat.go`：`SumLogStat` 复用 `LogFilter.apply`，筛选条件与日志列表一致。用一条 PG SQL（`FILTER` 聚合 + lateral 解析 `other`）统计请求数、消费 / 退款 / 净额、prompt / completion、含缓存的输入总量、缓存读写和错误数。缓存与 `is_net` 的口径照抄 `financeLogFromSQL`。实时 RPM/TPM 沿用最近 60 秒。
  - `controller/tokenfunc_log_stat.go`：新增 `GET /api/log/summary`（管理员）和 `GET /api/log/self/summary`（按 user_id 限定，普通用户受区间上限约束），返回中带 `error_log_enabled`。
  - 路由在 `router/log-stat-router.go`，访问令牌 scope 在 `middleware/access_token_routes_log_stat.go`（`log:read` / `usage:read`，与上游 stat 一致）。
- 前端 `features/usage-logs`：
  - 统计接口改为 `/summary`。徽标依次为：请求数、净消耗（有退款时 tooltip 显示消费 / 退款）、Tokens · 缓存命中率（tooltip 列出输入含缓存 / 输出 / 缓存读 / 缓存写）、失败率、实时 RPM / TPM（tooltip 说明不受区间影响）。
  - 失败率只在 `ERROR_LOG_ENABLED` 打开时显示。
  - 徽标高度 h-7 → h-8，数值放大一档。
- i18n：tokenfunc 的 7 个语言文件新增 7 个 key，其余 key 复用已有的。

## 验证

- `go build ./... && go vet ./model ./controller ./router ./middleware`：通过。
- `make test-db PKG='-count=1 -run "TestLogSummary|AccessToken|Scope" ./controller/ ./router/ ./middleware/'`：全部 ok。`-v` 确认 `TestLogSummaryMatchesListFiltersAndCacheSemantics` 实际跑在 PG（docker `tokenfunc-postgres`，schema `test_feat_log_stat_badges`）上，未被跳过。覆盖的场景：
  - openai 语义与 anthropic 语义的缓存口径；
  - 退款冲减；
  - 错误计数；
  - `type` 筛选不影响统计；
  - `request_id` 筛选；
  - 普通用户只看自己；
  - 超出区间上限时报错。
- `bun run typecheck`：通过。
- `bunx vitest run src/features/usage-logs src/i18n`：464 个通过。其中新增 `logs-stats.test.tsx`；`mobile-filter.test.tsx` 的文案由 Usage 改为 Net usage。
- 对改动文件跑 `bunx oxlint`：无问题。`bun run lint` 有若干既有 error（`scripts/sync-i18n.mjs`、`src/assets/logo.tsx` 等），与本次改动无关。
- `bun run i18n:sync`：上游 locale 文件无 diff。

## 遗留

- 管理员不受区间上限约束，大区间时对 logs 原表做 jsonb 解析和 SUM 会偏慢。必要时可改为整天部分走 `tf_log_daily_rollups`；rollup 没有 token_name / request_id 维度，只能在不带这两个筛选时使用。
- 生产 `ERROR_LOG_ENABLED` 默认为 false，失败率徽标不会出现。是否打开在发版时决定。
- 上游 `/api/log/stat` 仍保留，前端已不再调用。
- 本地接口冒烟未做：worktree 的 dev schema 没有日志数据，口径由 PG 集成测试覆盖。
