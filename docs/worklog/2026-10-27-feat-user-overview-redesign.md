# 普通用户概览页重设计：余额可用天数 + 同期环比 KPI + 按模型 / 密钥 / 时段的用量图表

- 日期：2026-10-27
- 分支：worktree-feat-user-overview-redesign
- PR：#66
- 关键 commit：4c8f85672（共享组件）、c166f7e31（概览页）

## 背景

旧版 `/dashboard/overview` 给普通用户看的只有新手引导、3 张 SVG 迷你图 KPI，外加 API 信息、公告、FAQ、Uptime 几个面板，没有一张真正的图表。用户最关心的几件事它都回答不了：钱还够用几天、今天比昨天用得多还是少、钱花在哪些模型和密钥上、什么时段在用。
本次参考 tokensolo 的概览页，借鉴了其中的 Hero 余额区、KPI + 迷你图、趋势图和每日汇总表，有两处没有照搬：
- tokensolo 拿今天（还没过完）和昨天全天比，所以早上必然显示 ↓100%。
- tokensolo 的退款 / 净消耗曲线几乎一直是 0，没有信息量。

已确认的决策：
- 只在前端聚合，不改后端。
- 第 4 张 KPI 放「本月消耗」。
- 附加三个模块：每日汇总表、时段热力图、密钥排行。
- 旧模块只保留新手引导。

## 变更

**新目录 `web/src/features/dashboard/components/personal/`**
- Hero：问候语，可用余额，按「今天之前 7 个完整日」日均估算的可用天数（含健康点），累计消耗与累计请求，以及充值 / 使用日志 / API 密钥三个入口。
- 4 张 KPI 卡：今日消耗、今日请求、今日 Token、本月消耗。
  - 今日三项对比「昨日同一整点」，本月对比「上月同期」。上月更短时截到上月末。
- 一个区间开关（7 天 / 30 天），控制下面所有区间图表：
  - 用量趋势：按天、按模型堆叠，可切消耗 / Token / 请求。
  - 模型占比：环形图加带色点的明细。
  - 密钥消耗排行。
  - 每日消耗汇总表。
- 时段热力图固定显示近 7 天 × 24 小时，按本地时区分格，用 CSS 网格绘制。
- `/api/status` 的 `enable_data_export=false` 时显示空状态，不发用量请求。

**数据与聚合**
- 数据来源：
  - `/api/data/self`（quota_data，小时 × 模型）：取数范围是 min(上月 1 日, 今天往前 29 天) 到现在，一次取完。
  - `/api/data/flow/self`：密钥排行。
  - `/api/user/self`：余额与累计值。
- 纯函数集中在 `features/dashboard/lib/personal-overview.ts`。
- 参与图表的模型固定按近 30 天消耗取 Top 5，颜色按这个顺序分配，所以切换 7 / 30 天时同一模型颜色不变。
- 分类色板放在 `components/charts/categorical-palette.ts`：品牌绿开头的 5 色，亮色和暗色各一套，已用 dataviz 的 `validate_palette` 校验明度带、色觉障碍区分度和相邻色差。「其他」固定用中性灰。

**复用与兼容扩展**
- `ChangePill` 原在企业概览里，提到 `components/change-pill.tsx`；`changePercent` 提到 `lib/change-percent.ts`。这是第 2 处用到。
- `DailyTrendChart`：
  - 系列支持可选 `color`。
  - 图例色块改用系列实色。原先取的是面积的半透明渐变，颜色发白，企业侧堆叠 Token 图也一并受益。
- 企业 `UsageDonutChart` 支持可选 `colors`。`UsageRankChart` 的数值轴留 20% 余量，最长的条的金额标签不再被挤进条内描边显示。
- 企业 `UsageMetricTabs` 直接复用。

**上游文件**
- `overview-dashboard.tsx` 只把 `<SummaryCards/>` 和内容面板那一段换成 `<PersonalOverview/>`。
- 旧面板组件文件不删，避免和上游出现 modify/delete 冲突。
- 管理员概览页上的 PerformanceHealthPanel 也随之移除。
- `setup-guide.test.tsx` 把用量看板 mock 成占位，标题断言同步修改。

**i18n**：新增 35 个 key，写进 `locales/tokenfunc/` 的 7 个语言文件，`bun run i18n:sync` 无孤立 key。

## 验证

- `bunx vitest run src/features/dashboard/lib/__tests__/personal-overview.test.ts`，覆盖：
  - 昨日同一整点截断
  - 上月同期
  - 3/31 对 2 月的截断
  - 可用天数的日均与回退
  - 3/1 的取数起点
  - Top 5 + 其他
  - 7 / 30 天模型顺序一致
  - 区间过滤
  - 趋势行
  - 热力图分格
  - 密钥汇总
- `bunx vitest run src/features/dashboard/components/personal`，覆盖：
  - 数据导出关闭时显示空状态，且不发请求
  - 昨日为 0 时不显示环比
  - 切换 30 天后趋势图收到 30 天数据
- `bunx vitest run src/features/dashboard src/features/enterprise-console`：27 个文件、155 个用例全部通过。
- 全量 `bunx vitest run`：两次各有 1~2 个无关用例失败，单独跑均通过（60/60），属于高负载下的超时抖动：
  - `task-plugins/marketplace-install-dialog`
  - `system-settings/visual-billing-editor`
- `bun run typecheck` 通过；对涉及文件跑 `oxlint -c .oxlintrc.json`，无 error。
- worktree 环境（API :3003、前端 :5176、schema `dev_feat_user_overview_redesign`）手工验证：
  - 初始化 root，新建普通用户 demo，用 `.tmp/seed-overview.sql` 写入 60 天 × 7 模型 × 3 密钥的 quota_data。
  - 用 Playwright 截图检查亮色、暗色、390px 移动端和 30 天视图，截图在 `.tmp/shots/`。
  - 截图中发现并修复了：图例发白、条形图标签挤进条内、移动端 KPI 单列过长、切换区间后模型颜色漂移。

## 遗留

- Token 不拆分输入和输出。quota_data 只有总 token，要拆分得新增后端接口扫 logs，这次按决策不做。
- 管理员关闭数据导出时图表区整体不可用。数据有最多 5 分钟延迟，Hero 上已注明。
- 企业用量报表环图的「已改」部分见下方「追加：企业环图配色」。改完后还剩一处：企业页面没有准备 enterprise 测试数据，所以没有做截图核对。
- StatCard 的 accent-2 / accent-3 在 tokenfunc 预设下映射为黑色和灰色（品牌中性色），迷你图是黑 / 灰线。沿用现状，没有单独改。

## 追加：企业环图配色（2026-10-27，同一 PR）

**问题**：企业用量报表的环形图（按模型 / 密钥 / 团队）和明细表色点，由 `readUsagePalette` 依次取 `--chart-1/4/5/2/3` 加一个写死的紫色。tokenfunc 品牌预设里 `--chart-2` / `--chart-3` 是中性色，导致：
- 亮色模式：第 4 片是近黑 `#121212`，第 5 片是灰 `#878787`，后者和「其他」`#71717a` 的 OKLab 色差只有 7.3（正常视力可分辨的底线是 15），明细表里两个灰点分不清。
- 暗色模式：第 4 片是纯白 `#ffffff`，最刺眼，视觉上压过第 1 名。
- dataviz 校验器对亮暗两套都判了「明度越界」和「彩度过低」两项 FAIL。

**改动**：
- `usage-chart-palette.ts` 改为基于共享的 `categorical-palette.ts`：`usagePalette(dark)` / `usageOthersColor(dark)`，环图与明细表都按当前主题取色。
- `USAGE_DONUT_TOP` 从 6 改成 5（等于色板槽位数），与个人概览一致。
- 新增 `lib/__tests__/usage-chart-palette.test.ts`，覆盖亮暗两种模式：具名切片互不相同且都不是灰色；「其他」是灰色，且不与任何具名切片同色。

**验证**：`bun run typecheck` 通过；对涉及文件跑 oxlint 无问题；`bunx vitest run src/features/enterprise-console src/features/dashboard` 159 个用例全部通过。个人概览的环图使用同一套颜色，已截图确认；企业页面本身未截图（见「遗留」）。

## 追加：图表动效与 hover 数据预览（2026-10-27，同一 PR）

**反馈**：验收时发现打开页面很生硬；KPI 迷你图（今日消耗 / 今日请求等）悬停时没有交互，看不到数据。

**改动**：
- 新增共享组件 `components/animated-number.tsx`：数字从 0（或旧值）滚动到目标值，时长 0.8 秒。每帧用调用方传入的格式化函数输出，所以终态与原来的格式化结果完全一致。文本直接写 DOM，不触发重渲染。
- 新增共享组件 `components/charts/interactive-sparkline.tsx`：
  - 折线入场描线、面积淡入；柱状逐根长出。
  - 指针悬停时吸附到最近的数据点，显示参考线、高亮点和「日期 · 数值」提示框；靠近两端时提示框改为左 / 右对齐。
  - 可聚焦后用方向键切换数据点；放在整卡链接内时不可聚焦。
- `StatCard`（上游文件）只做兼容扩展：新增可选的 `visualization`；`value` 放宽为 ReactNode。
- 个人概览：
  - 区块按 Hero → KPI → 图表行 → 汇总表的顺序错峰淡入上移，复用 `StaggerContainer` 和 `CARD_ITEM_VARIANTS`。
  - Hero 余额和 KPI 数值滚动；KPI 迷你图改为可交互，卡片 hover 时轻微上浮。
  - 迷你图在数据就绪后才挂载，入场描线作用在真实数据上。
  - 热力图：去掉原生 title，改为单个浮层提示；悬停格子加描边，对应的日期与小时标签加粗；格子按列错峰淡入。
  - 汇总表占比条从 0 生长，切换区间时在新旧值之间过渡。模型明细行加 hover 背景。
- 企业概览：4 张 KPI 卡同样改用数字滚动和可交互迷你图，整卡链接行为不变，卡片 hover 上浮。
- 图表库：`DailyTrendChart`、`UsageDonutChart`、`UsageRankChart` 的入场改为 800ms cubicOut；hover 提示框原本就有。
- 系统开启「减少动态效果」时：上述动效全部关闭（motion 的 `useReducedMotion`、VChart `animation:false`、`motion-reduce:` 类），直接显示终态。
- i18n：新增 2 个 key（`{{value}} requests`、`{{title}}, last 7 days`），删除热力图原生 title 的旧 key。

**验证**：
- `bun run typecheck` 通过；对涉及文件跑 `bunx oxlint -c .oxlintrc.json`，无 error。
- `bunx vitest run src/components src/features/dashboard src/features/enterprise-console src/i18n`：60 个文件、288 个用例全部通过。新增：
  - `animated-number.test.tsx`：减少动效时直接显示终值；改值后显示新值；允许动效时从 0 滚动并精确落到格式化终值。
  - `interactive-sparkline.test.tsx`：折线和柱状悬停选点；离开后提示框隐藏；方向键切换；链接内不可聚焦；空数据和单点。
- 用 Playwright（`.tmp/shot-motion.py`）截图检查：
  - 入场约 350ms 的中间帧：数字在滚动，折线在描线，环图在展开，趋势图在生长。
  - KPI 折线和柱状悬停提示、热力图悬停提示。
  - `reduced_motion=reduce` 下首帧即终态。

**修复（同日）**：用企业账号目测时发现迷你图折线没有画完，停在倒数第二个点附近，后面只剩面积。原因是 motion 的 `pathLength` 用虚线实现描线，和 `vector-effect: non-scaling-stroke` 在 `preserveAspectRatio="none"` 横向拉伸时，按屏幕像素计算的虚线长度与路径长度对不上。描线动画改为整张 SVG 用 `clip-path: inset()` 从左到右展开。截图确认折线完整，`src/components`、dashboard 和 enterprise 组件测试共 190 个用例全部通过。本地还用 admin 接口建了企业「Acme 科技」（主账号 acme），写入 60 天 `ent_usage_daily`（`.tmp/seed-enterprise.sql`）用于目测。

**补充（同日）**：企业「用量报表」页（`usage-panel.tsx`，管理员用户页的企业计费抽屉也用它）的 4 张指标卡同样改成数字滚动和可交互迷你图。缓存命中率按一位小数滚动，卡片 hover 时上浮。迷你图以日期区间作为 key，换区间后重新挂载，入场动画重播。新增 i18n key `{{title}}, by day`。验证：企业、i18n、用户相关测试共 131 个用例全部通过；截图确认入场中间帧（数字在滚动、线在描、柱在长）和悬停提示正常。
