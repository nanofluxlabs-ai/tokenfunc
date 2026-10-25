# 用户管理（个人用户）列表在用户名右侧展示邮箱

- 日期：2026-10-25
- 分支：feat/user-list-email
- PR：
- 关键 commit：36787a7

## 背景

客户管理 → 用户管理 → 个人用户页签，管理员排查问题时只能看到用户名，需要点进详情才能看到邮箱。要求在用户名右侧直接展示邮箱。

## 变更

- 前端 `web/src/features/users/components/users-columns.tsx`：用户名单元格在用户名链接右侧新增邮箱（弱化小字，超长截断），邮箱为空时不渲染；用户名列默认宽度 220 → 300。
- 后端用户列表接口本来就返回 `email` 字段，无需改动。

## 验证

- `bun run vitest run src/features/users/components/__tests__/username-link.test.tsx`：3 条通过（新增“有邮箱时在用户名同一行右侧展示”“无邮箱时不渲染”两条）。
- `bun run typecheck`：通过。
- `oxlint` / `oxfmt` 对两处改动文件：无 error、格式无改动。

## 遗留

无。
