# 二开页面移动端响应式适配

- 日期：2026-10-27
- 分支：worktree-feat-mobile-responsive（worktree）
- PR：（创建后补）
- 关键 commit：8d80526b5 … 见 PR 提交列表

## 背景

黑鹰要求审查 tokenfunc 在 new-api 上新增的所有界面（相对上游 v1.0.0-rc.45），做一次移动端响应式适配，重点是信息结构与布局，交互简洁、信息清晰；并反馈登录页手机首屏全是品牌信息、登录表单被挤到屏幕底部。

拍板项（计划批准即确认）：
- 分层标准：A 对外（认证页、首页、文档、关于页）与 B 客户（企业控制台 6 页、推广中心、个人对账）调整组件顺序、取舍、卡片化；C 内部后台（财务中心、报价单、日志归档、渠道用量、推广人、企业线索、用户管理企业页签）只保证不破版、可用。
- 手机上日期 / 筛选控件统一收进「筛选」底部抽屉，并随内容滚动（不再常驻页头）。
- 企业概览手机顺序：账户 → 待办 → KPI → 快捷入口 → 趋势 → 模型 Top5。
- 账单详情多条说明合并为一条可展开摘要；宽表手机隐藏次要列（token 拆分、缓存、单价、倍率）。
- 团队管理手机用团队切换替代左侧团队列表（实施时改为弹出完整 TeamPanel，见下）。

## 变更

适配手段优先复用上游：DataTablePage 的移动卡片（列 meta mobileTitle / mobileBadge / mobileHidden / label）、StatCard compactMobile、Sheet / Popover / Collapsible 原语、Tailwind sm 断点（640px，与 DataTablePage 一致）。

- A 对外
  - 认证页 `auth-layout.tsx`：lg 以下只留 Logo 栏，营销区 / 指标 / 版权放到 lg 以上，表单从顶部开始；桌面两栏不变。
  - 首页：首屏间距与按钮手机等宽、模型价格表手机三列（厂商挪到模型名下）、企业示例表去最小宽度、能力区手机只留两个交互演示、分段按钮组手机一行横滑（根节点限宽）、二级标题手机 24px。
  - 文档：参数表手机隐藏类型 / 默认值（挪到参数名下）；四张表的说明改用 `DocsTableText`（text 属性），不再被 StaticDataTable 截成单行；手机目录入口吸顶并显示当前页标题。
  - 关于页：只改二开的 BrandAbout 内边距；上游 URL / HTML 分支不动。
- B 客户（共用）
  - 列表卡片 meta：企业密钥、团队成员、企业账单（财务中心共用）、资金流水、个人对账充值明细；推广中心三张表与个人对账金额列补 label。
  - 新增 `components/mobile-filter-sheet.tsx`（桌面原样内联，手机收成「筛选」按钮 + 底部抽屉，显示已生效筛选数或当前区间）与 `finance/components/period-filter.tsx`（企业对账、个人对账、推广中心共用的账期筛选）；用量报表两个 240px 日期框换成 DateRangePicker；DateRangePicker 手机只显示一个月。
  - 宽明细表手机只留 3 列：用量明细列（概览 Top5 + 报表三张表）、财务 token 分组汇总 / 按日汇总（跨列摘要随之不渲染，colSpan 不错位）、账单详情分组表、推广按日表、充值来源表、授信账期表。
- B 客户（逐页）
  - 概览：快捷入口手机前置；KPI 与报表合计卡手机两列紧凑；账户卡大金额可换行；卡头页签窄卡片换到标题下（`lib/card-layout.ts` 的 CARD_ACTION_STACKED，按卡头容器宽度）；排行图标签手机收窄。
  - 团队：新增 `team-switcher-sheet.tsx`，手机顶部显示当前团队，点开从底部弹出完整 TeamPanel（团队管理菜单照样可用），选中即收起。
  - 账单详情：新增 `bill-notices.tsx`，手机只露第一条说明；指标卡两列、账期卡独占一行；MetricCard 手机 text-xl 可断行。
  - 推广中心：页签横滑、指标卡两列、用户用量抽屉金额卡单列、结算展开按钮加大。
  - 密钥：复制按钮手机 32px、启停 / 编辑 36px，批量操作栏可换行。
- C 后台
  - 日志归档、企业成员抽屉、企业线索补卡片 meta。
  - MetricTooltip 触屏（hover: none）改为点按 Popover；「悬停查看」文案改为「悬停或点按」（七语言）。
  - 渠道用量展开明细 sticky 钉在视口内；报价单配置页签可换行、预览手机内边距 12px。
- i18n：新增 `Switch team`、`{{count}} more notes`、`Hide notes`，七个 tokenfunc locale 同步。

与计划的偏差：
- 团队管理计划写「团队下拉」，实施时发现每个团队行带管理菜单（改名 / 归档 / 删除），普通下拉会丢功能，改为底部抽屉里复用 TeamPanel，信息结构一致、功能不丢。
- 上游 DataTableMobileFilterPanel 默认展开、只服务数据表工具栏，接不了日期区间，所以新增 MobileFilterSheet（Sheet 原语组合，独立文件，不改上游）。

## 验证

- 每组改动 `bun run typecheck`、改动文件 `bunx oxlint`、受影响目录 `bunx vitest run` 均通过；新增测试：`mobile-filter-sheet.test.tsx`（4）、`bill-notices.test.tsx`（3）、`metric-tooltip.test.tsx`（2）、`auth-layout` 窄屏结构、`param-table` 说明不截断 / 手机列、`teams-page` 手机团队切换、`docs-layout` 吸顶目录按钮。
- 浏览器（worktree 5175 / 3002，dev schema 克隆主 dev；Chrome 390×844 模拟 + 1280×800 对照）：
  - 登录页表单落在首屏（表单 193～615px）；首页四个指标回到首屏、首页 / 文档 / 关于页无溢出。
  - 企业控制台：概览 KPI 2×2、快捷入口前置；用量报表与对账消费账单所有表格溢出 0（原 393 / 389 / 241 / 457 / 80px）；密钥 / 成员筛选收成一行，抽屉内下拉弹层层级正常、选中后 URL 写入 status=1；团队切换按钮；账单详情首屏看到金额与账期。
  - 推广中心、个人对账、财务中心、渠道用量、报价单、企业线索、推广人、用户管理企业页签：整页横向溢出 0（宽表仅表内横滑）。
  - 桌面 1280：个人对账页头仍为快捷档 + 区间 + 查询 / 重置，明细表列完整。
- 改前 / 改后截图：`.tmp/mobile-audit/before|after/`（本地，不入库）。

## 遗留

- 日志归档只有 root 可见，本地 qa-admin 为 403，靠代码改动与卡片 meta 覆盖，未实机看。
- C 类按计划保留表内横滑：财务概览按日表、渠道用量宽表、推广人绑定抽屉表。
- 上游页面（用户管理列表本身、渠道列表等）不在本次范围。
