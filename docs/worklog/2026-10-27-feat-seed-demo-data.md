# 本地示例数据种子 make seed-demo

- 日期：2026-10-27
- 分支：worktree-feat-seed-demo-data
- PR：
- 关键 commit：

## 背景

本地 dev 库的数据很少：logs 13 条，quota_data 10 条，ent_usage_daily 1 条。近期做的个人概览、企业概览、用量报表、账期账单、财务中心、推广结算等功能，在本地看不出效果。黑鹰要求生成一套示例数据，并确定了以下做法：

- 做成入库的 Go 命令。
- 覆盖个人、企业、管理后台三类场景，模型和渠道要多样。
- 只做增量追加，不动现有数据，可以重复执行。

## 变更

- 新增 `cmd/tokenfunc-seed-demo`，并加 `make seed-demo` 入口。
  - 单次执行约 30 秒，生成约 14 万条 logs，时间跨度为最近 4 个自然月，今天的数据截止到当前时刻。
- 流量生成：
  - 按「账号 → key → 模型」逐小时生成，带工作日 / 周末差异、上午和下午两个高峰、逐步增长、每日噪声，约 2% 的请求失败。
  - 同一批事件同时写入 logs，并在内存里聚合出 quota_data（小时 × 8 维）、ent_usage_daily（上海日 × 7 维，按账期归属）、perf_metrics（近 30 天），以及 users / tokens / channels / 账期的累计计数。
  - 因此各表的合计天然一致：线上这些派生表都是请求时在线写入的，没有从 logs 重建的入口，只能这样一起生成。
- 能从 logs 重建的数据走现有函数：
  - `RollupLogDay` 逐日重算，并推进 rollup 游标。
  - `BackfillChannelUsage` 和 `BackfillChannelDimUsageDay` 回填渠道统计。
- 组织与资金流程尽量复用 model 层函数，保证不变量：
  - 组织：`CreateEnterpriseWithNewUser`、`CreateEnterpriseTeam / Member / Token`、`ProvisionEnterpriseMemberLogin`、`ArchiveEnterpriseTeam`、`UpdateEnterpriseMember`。
  - 账单与资金：`IssueCreditBill`、`RegisterBillPayment`、`VoidBill`、`RegisterManualTopUp`、`AdjustEnterpriseWallet`、`GenerateMonthlyStatements`。
  - 这些函数只认「现在」，调用后再把时间戳回溯到账期结束后的合理时刻。
- 数据内容：
  - **个人用户**：4 个，用量轻重不同，key 有停用和晚建；充值单按「已消耗 + N 天余额」拆单，另有待支付和已过期订单。
  - **推广人**：1 个，绑定 4 个用户，除最近一个月外都已结算。
  - **授信企业 Acme**（自然月账期）：
    - 组织：6 个团队（含 1 个已归档），22 个成员（含停用），3 个登录角色。
    - key：26 把，覆盖启用、停用、过期、7 天内到期、日 / 周 / 月限额、已耗尽。
    - 团队预算：使用率分为正常、预警、超预算几档。
    - 账单：已付、部分付款且逾期、未付三种状态。
  - **预付企业 Globex**：按月充值，有补偿调账和月结单；钱包流水的「变动后余额」按时间线重放。
  - **授信企业 Initech**（固定 30 天账期）：账单有作废、对账差异 $3.6、逾期三种情况。
  - **已停用企业 Umbrella**。
  - **其他**：12 条试用线索、60 条企业审计日志。
- 保护现有数据：
  - 安全闸：SQL_DSN 必须是本机 PostgreSQL，且 search_path 必须是 `dev` 或 `dev_*`。
  - `GenerateMonthlyStatements` 会顺带给真实预付企业补月结单，种子在每次调用后立刻删掉这些非示例账单。
- 成员登录名固定改为 `demo_<企业>_admin / _lead / _dev`，避免每次重灌后变化。
- 文档：`docs/tokenfunc/development.md` 的 make 目标表和「数据与重置」一节补了用法。

## 验证

- `GOWORK=off go vet ./cmd/tokenfunc-seed-demo`：通过。
- `GOWORK=off go test ./cmd/tokenfunc-seed-demo`：通过。覆盖历史日确定性、聚合守恒、key 时间窗、DSN 安全闸。
- worktree schema 先克隆主 dev，再连续执行 `make seed-demo` 6 次：
  - 非示例数据不变：users 8 / logs 13 / tokens 14，原有 2 张账单、22 条流水保持不变。
  - 第二版随机源（按账号 × 天播种）连续两次执行：历史 logs 条数和金额完全一致。
- SQL 核对：
  - 示例 logs 的 quota 合计 = quota_data 合计 = users.used_quota 合计，请求数也一致。
  - 企业 logs 合计 = ent_usage_daily 合计。
  - 每个账期的 used_quota 与 ent_usage_daily 一致；只有 Initech 故意做的那张对账差异账单 reconcile_diff 为 1800000。
- Playwright 截图检查 15 页（个人概览、使用日志、财务对账、企业概览 / 用量报表 / 团队 / 密钥 / 对账 / 审计、财务中心、企业账单、试用线索、推广人），都有内容：
  - 企业概览 6 类待办全部出现：逾期账单、超预算、预算预警、key 耗尽、7 天内到期、待付款。
  - 截图中发现两处问题，已修复：
    - 个人充值单的 Amount 误写成 quota，导致订单金额显示 3 亿。已改为易支付 / Stripe 的语义：Amount 是美元数，Money 是实付金额。
    - 个人余额被阶梯金额撑大，导致「约可用 66 天」。已改为最后一笔只补差额。

## 遗留

- 不生成退款日志（type 6）和订阅订单。
- perf_metrics 只写数据库，不写 Redis 热桶。最近一小时的性能面板以线上热路径为准。
- 跑完需要重启 API（`make api`），进程内缓存才会失效：企业计费信息 15 秒、key 归属 30 秒、团队月用量 60 秒。
- 渠道统计回填会整表重建 `channel_hourly_usages / totals`，真实日志同样参与重建，结果是规范值。
