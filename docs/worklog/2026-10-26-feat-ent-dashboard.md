# 企业概览与用量报表看板改版

- 日期：2026-10-26
- 分支：worktree-feat-ent-dashboard
- PR：
- 关键 commit：81088d377（后端 token 字段）、25a3c93cd（前端改版）

## 背景

黑鹰要求参考 tokensolo 的「数据看板」「团队管理 · 用量总览」，优化企业概览与用量报表的布局、指标与图表，并处理两页数据重叠。原状：概览是四张纯文字卡 + 30 天柱图；报表是三张合计卡 + 维度页签 + 一张表，没有图。

讨论中黑鹰两次追问重叠问题，定稿原则：**一个数字只在一个地方当主角，跨页能对上的数字只能是下钻后的同口径数字；同一份数据不在两页各画一次。**

- 企业概览 = 今日 / 近 7 天快照 + 账户状态 + 待办 + 入口，不放按日明细表。
- 用量报表 = 所选区间（默认本月）的按日 / 按模型 / 按归属三块，每块「图 + 表」同源。
- 概览趋势固定 7 天（推翻了上一轮选的 7/30 切换，因 30 天与报表重复）；「本月消耗」卡去掉（授信自然月账期时与账户卡「本期已用」相同），换成「近 7 天消耗 vs 前 7 天」。
- 不搬：退款 / 净消耗列（用量日表无退款口径）、累计 Token、「今日已跑 N 次请求」。

## 变更

- 后端：`EnterpriseUsageDayItem` 增加 prompt / completion / cache token，概览 `daily` 带出；向后兼容，不加查询。
- 公共组件：新增 `components/charts/daily-trend-chart.tsx`（平滑面积图 + 渐变、多系列可堆叠、货币 / 数字两种格式）。现有 `DailyQuotaBarChart` 只能画单系列美元柱图，推广中心仍在用，保持不动。
- 概览：账户卡（授信看剩余额度与本期进度、预付看余额、团队角色看本团队预算，带刷新）；四张 KPI 复用上游 `StatCard`（7 天迷你图，环比放 `action` 槽，不改上游文件），整卡下钻报表同区间；近 7 天趋势（消耗 / Token / 请求）；快捷入口收纳原密钥 / 组织卡的计数；今日模型 Top5（与报表模型查询同一 queryKey）。
- 报表：快捷区间（今天 / 近 7 天 / 本月 / 近 30 天）+ 深链 `from` / `to` / `range`；区间合计四卡（消耗、请求、Token、缓存命中率）取自按日数据；按日（趋势 + 倒序明细）、按模型（环形 + 明细，色点与切片一一对应）、按归属（团队 / 成员 / 密钥页签，横向排行 + 明细）；明细统一加缓存写入、占比列。容器查询让管理员计费抽屉里自动单列。
- `TeamBudgetMeter` 新增可选 `showAmount`（默认 true），账户卡已大号展示金额时隐藏重复金额。
- 图表颜色取 body 上的品牌预设变量（`data-theme-preset` 挂在 body，读 documentElement 会拿到默认主题的蓝色）。
- 七个 tokenfunc locale 末尾追加 42 个键。

## 验证

- `make test-db PKG="./model/ -run TestEnterpriseUsage -count=1 -v"`：PASS（PG，`TestEnterpriseUsageAggregationSnapshotsAttribution` 新增按天 token 断言）。
- `bun run typecheck` 通过；`bunx oxlint src/features/enterprise-console src/components/charts` 无 error；`bunx vitest run src/features/enterprise-console src/features/enterprises`：27 文件 116 用例全过（新增 `usage-panel.test.tsx`、`usage-range.test.ts`，重写 `overview-page.test.tsx`）。
- 浏览器（worktree 5176，dev schema 克隆主 dev 后给 Acme 造了 30 天合成 `ent_usage_daily`，仅本 worktree schema）：
  - 企业主概览：KPI、迷你图、近 7 天趋势三个指标、快捷入口计数、今日模型 Top5 正常；点今日消耗下钻报表 `from=to=今日`，合计 $4.38 / 483 次 / 301.9 万 Token 与卡片一致，「今天」快捷档高亮。
  - 报表：本月默认、`group_by=model` 深链滚动到模型区块，环形色点对应，团队排行 $44.93 与团队管理员概览的本团队本月消耗一致。
  - 团队管理员概览：本团队预算卡、快捷入口无财务对账。
  - 管理员企业计费抽屉：合计两列、模型区块单列，表格横向滚动。

## 遗留

- 授信企业的账户卡只有单测覆盖，本地 dev 数据没有授信企业，未做浏览器验收。
- 亮色主题未做浏览器验收：当前品牌预设下切换「浅色」后页面仍为深色。
- 合成用量数据只在 `dev_feat_ent_dashboard` schema，`make wt-clean` 时随 schema 删除。
