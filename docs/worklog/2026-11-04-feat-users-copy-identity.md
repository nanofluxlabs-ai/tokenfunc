# 用户列表：用户名、邮箱旁加一键复制

- 日期：2026-11-04
- 分支：main
- PR：
- 关键 commit：

## 背景

黑鹰反馈后台用户列表里用户名和邮箱要手动选中才能复制，运营处理工单、核对账号时不方便。要求在两处旁边加复制图标，一键复制。

## 变更

- `web/src/features/users/components/users-columns.tsx`：用户名列与邮箱列各加一个共享 `CopyButton`（与模型列表、渠道列表的用法一致），悬浮提示与无障碍名称分别为「复制用户名」「复制邮箱」；邮箱为空时仍显示占位符，不渲染复制按钮。手机卡片视图复用同一列定义，自动带上。
- i18n：`Copy username` 已有；新增 `Copy email`，补齐 `web/src/i18n/locales/tokenfunc/` 7 个语言文件。
- 测试：新增 `__tests__/copy-identity.test.tsx`，覆盖点击复制用户名 / 邮箱写入剪贴板、复制后按钮进入已复制状态、无邮箱时无复制按钮。

## 验证

- `bunx vitest run src/features/users`：8 文件 34 用例通过（含新增 3 条）。
- `bun check -b` 无类型错误；改动文件 `bunx oxfmt --check`、`bunx oxlint` 通过。

## 遗留

无
