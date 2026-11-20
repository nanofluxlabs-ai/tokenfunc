# 注册页密码强度不再展示「密码要求」与「让密码更强」清单

- 日期：2026-11-21
- 分支：main
- PR：
- 关键 commit：

## 背景

黑鹰反馈注册页密码框下方的两个清单（8–128 个字符；15 个字符以上 / 大小写 / 数字 / 符号）信息过多，只保留强度条与状态行即可。

## 变更

- `web/src/components/password-strength.tsx`：新增 `hideHints` prop，为真时不渲染两个清单，强度条、强度文案、「已满足密码要求」状态行与无障碍播报不变。
- `web/src/features/auth/sign-up/components/sign-up-form.tsx`：注册页传 `hideHints`。修改密码、管理员建用户、安装向导等其它调用点不变。

## 验证

- `bun run test -- src/components/__tests__/password-strength.test.tsx src/features/auth`：150 用例通过，新增用例断言 `hideHints` 下清单不出现、meter 与状态行仍在。
- `bun run typecheck` 无错；改动文件 oxlint 无 error。

## 遗留

无。
