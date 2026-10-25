# 用户管理（个人用户）列表新增邮箱列

- 日期：2026-10-25
- 分支：feat/user-list-email
- PR：
- 关键 commit：36787a7

## 背景

客户管理 → 用户管理 → 个人用户页签，管理员排查问题时只能看到用户名，需要点进详情才能看到邮箱。要求在列表中直接展示邮箱。第一版放在用户名右侧，用户随后改为单独一列。

## 变更

- 前端 `web/src/features/users/components/users-columns.tsx`：用户名列之后新增独立“邮箱”列（`email`），超长截断，邮箱为空显示“—”；不参与排序（后端排序白名单无 email）；移动端卡片排序位于 ID 与角色之间。表头复用已有 i18n 键 `Email`。
- 后端用户列表接口本来就返回 `email` 字段，无需改动。

## 验证

- `bun run vitest run src/features/users/components/__tests__/username-link.test.tsx`：3 条通过（新增“邮箱列展示邮箱”“无邮箱显示占位符”两条）。
- `bun run typecheck`：通过。
- `oxlint` / `oxfmt` 对两处改动文件：无 error、格式无改动。

## 遗留

无。
