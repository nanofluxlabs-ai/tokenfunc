# 修复推广中心「用户下钻」Sheet 从未打开

- 日期：2026-10-25
- 分支：fix/promoter-user-sheet
- PR：#36
- 关键 commit：0d80093d7

## 背景

做 PR #35 归档清单页时发现确认弹窗点击无反应，追到 `SectionPageLayout`：它用 `Children.forEach` 只挑 Title / Actions / Content 三个槽位，其它子节点直接丢弃。#33 的推广中心页把 `UserUsageSheet` 写在 `SectionPageLayout` 内部槽位之外，于是「查看详情」按钮点了没有任何反应。

## 变更

- 前端：`promoter-center-page.tsx` 外层改为 Fragment，`UserUsageSheet` 放到 `SectionPageLayout` 之后（与 users feature 的弹窗写法一致）。
- 测试：`promoter-center-page.test.tsx` 新增回归用例「点击查看详情后出现 dialog 且含用户名与 id」；`admin-sidebar-groups.test.tsx` 的客户管理子项断言补上 #33 加的 `/promoters`（#33 漏改）。

## Bug 根因

`SectionPageLayout` 的槽位式子节点处理会静默丢掉非槽位子节点，没有运行时告警。触发条件：任何把 Dialog / Sheet 写在布局组件直接子节点里的页面。影响：#33 合并后推广中心「用户消耗」Tab 的下钻入口对所有用户失效；归档页在 #35 里已按正确写法实现。

## 验证

- 反向验证：换回 main 版本的页面文件，回归用例失败（5s 内找不到 dialog）；换回修复后通过。
- `bunx vitest run src/features/promoter-center src/hooks/__tests__/admin-sidebar-groups.test.tsx`：3 文件 11 用例通过。
- `bun run typecheck` 通过；oxlint 涉及文件 0 error。

## 遗留

- `SectionPageLayout` 丢弃非槽位子节点时没有任何提示，可考虑在开发模式下 console.warn；本次不改布局组件。
