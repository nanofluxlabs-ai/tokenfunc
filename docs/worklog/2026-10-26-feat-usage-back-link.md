# 用量报表「返回企业概览」移到标题行右上角

- 日期：2026-10-26
- 分支：main（直接提交）
- PR：
- 关键 commit：见本 worklog 所在提交

## 背景

黑鹰反馈：从企业概览下钻到用量报表后，「返回企业概览」单独占一行，占用空间大，要求放到右上角。

## 变更

- `enterprise-console/components/usage-page.tsx`：返回链接改放 `SectionPageLayout.Actions`（标题行右侧，outline 小按钮），仍只在 `source=overview` 时出现；报表上方的筛选条恢复为只显示团队 / 成员筛选与「清除筛选」，没有筛选时不占行。

## 验证

- `bunx vitest run src/features/enterprise-console`：21 文件 91 条通过（`usage-page.test.tsx` 覆盖下钻显示、侧边栏进入不显示、清除筛选保留区间）。
- `bun run typecheck` 无错误；`bunx oxlint src/features/enterprise-console` 无 error。
- 未做浏览器验证：本地 5173 是黑鹰自己的会话，登录会互相顶掉。

## 遗留

无。
