# 渠道列表分组列改竖排；企业密钥 / 成员表单的团队下拉去掉重复的「默认团队」

- 日期：2026-11-07
- 分支：main（直接提交）
- PR：
- 关键 commit：e9152d6eb

## 背景

黑鹰在生产反馈两处：

1. 渠道列表「分组」列横排只放得下 2 个，超过就折叠成 +N，看不全渠道到底挂了哪些分组。
2. 企业控制台创建 API 密钥时「所属团队」下拉里有两个默认：`EntitySelect` 固定渲染的值 0「默认团队」，和库里每个企业都有的 `is_default` 团队（名字固定 `Default`）。后端对 team_id=0 的解析就是落到默认团队，两项是同一个东西。

## 变更

- `features/channels/components/channel-group-cell.tsx`：分组徽章改为竖排、一行一个、全部展示，不再走 `BadgeListCell` 的折叠；弹层编辑不变。
- `features/enterprise-console/components/entity-select.tsx`：`noneLabel` 改为可选，不传就没有值 0 的「无」项。持有人、团队筛选等仍传 `noneLabel`，行为不变。
- `features/enterprise-console/hooks/use-team-options.ts`：`is_default` 团队显示译文「默认团队」而不是库里的 `Default`；新增 `useDefaultTeamId()`。
- `token-mutate-sheet.tsx` / `member-dialog.tsx`：团队下拉不再传 `noneLabel`；表单初始 team_id 为 0 时落到默认团队 id，与后端解析一致。
- 两个测试的 hook mock 补 `useDefaultTeamId`。

## 验证

- `bun check -b` 无类型错误；`oxfmt --check` 改动文件通过；`oxlint` 改动目录只剩上游文件既有的 2 条。
- `bunx vitest run src/features/enterprise-console src/features/channels`：见提交记录（`priority-order.test.tsx` 两条拖拽用例在全量并发下偶发 21s 超时，单跑 32/32 通过，与本次无关）。
- 未做浏览器验收，发版后在生产看渠道列表与企业密钥抽屉。

## 遗留

无。
