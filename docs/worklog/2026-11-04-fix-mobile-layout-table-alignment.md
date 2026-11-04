# 手机端布局修复与财务 / 渠道表格对齐

- 日期：2026-11-04
- 分支：main
- PR：
- 关键 commit：12c5e8bbe、bd43c9251、bfff80f63、732ab584f、6f28f6658、0c7495942

## 背景

黑鹰在手机上巡检后台，反馈渠道列表布局乱、财务对账指标卡单列堆叠、财务中心数值乱；随后在 PC 上又指出渠道消耗表列头与数值没对齐、企业账单详情 5 张卡排成 4+1、「时间范围」应叫「账期范围」。逐项核查后都是真实问题，一并修复。

## 变更

- 渠道类型 tab（`channels/components/channel-type-tabs.tsx`，渠道列表与渠道消耗共用）：换行后不再溢出压住下方内容；渠道消耗筛选区手机端一行一个控件。
- 财务对账（`reconciliation/components/usage-tab.tsx`、`topup-tab.tsx`）：手机端 2+1，金额卡整行在上、另两张并排；桌面端 3 列不变。
- 财务中心用户消耗 / 模型消费：数值列只在 `sm` 以上右对齐，手机卡片视图与标签一起左对齐；份额条与指标提示同样处理。
- 账单详情汇总卡（`finance/components/bill-detail/bill-detail-metrics.tsx`）：宽屏列数按卡片张数决定，1 到 5 张各占一行，6 张 3×2，更多 4 列；「时间范围」卡改名「账期范围」（新 key `Billing period`，7 语言）。
- 渠道消耗 / 模型消费表头：数值列表头抵消可排序按钮的内边距，与右对齐数值齐平；渠道消耗 ID 表头补上与单元格展开箭头等宽的缩进。

## Bug 根因

- tab 溢出：上游 `TabsTrigger` 带 `h-[calc(100%-1px)] flex-1`，父级 `h-auto` 换行时触发器高度按容器算、被拉伸到列表外。用后代选择器覆盖为固定高度与 `flex-none`。
- 数值乱：DataTablePage 在 `max-width: 640px` 切卡片视图，列定义里的 `text-right` / `justify-end` 原样生效，数值贴右、标签贴左。卡片视图阈值与 Tailwind `sm` 一致，右对齐全部加 `sm:` 前缀即可。
- 表头错位：`DataTableColumnHeader` 可排序按钮自带 `-ms-3` 与内边距，右对齐时表头文字比数值靠左约 12px；ID 单元格固定留 20px 展开箭头位（无子行时隐藏但占位），表头没留。
- 账单卡 4+1：容器固定 `xl:grid-cols-4`，5 张卡必然多出一张。
- 影响范围：仅后台管理页面的展示，不涉及数据与计费。

## 验证

- `bunx tsc -b` 通过；`bunx vitest run src/features/channels src/features/finance src/features/reconciliation src/features/channel-usage` 493 用例通过。
- 浏览器实测：窗口无法缩到手机宽度，改在页面内注入 380px 同源 iframe 测量。渠道 tab 两行时所有触发器都在列表框内、下方元素 top 不小于列表 bottom；财务对账金额卡占满两列；用户消耗 / 模型消费卡片内数值左缘与标签一致。PC 端渠道消耗三个数值表头右边缘与数值右边缘差 1px 以内，ID 表头与数字左缘一致；月结单 5 张卡一行、授信账单 8 张 4×2；账单详情显示「账期范围」。

## 遗留

无
