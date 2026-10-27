# 登录页协议复选框移到登录按钮上方

- 日期：2026-10-27
- 分支：main
- PR：（直接在 main 提交）
- 关键 commit：见本文件所在 commit

## 背景

登录页的「我已阅读并同意 用户协议和隐私政策」复选框原来放在登录按钮（和 Turnstile）下方。用户填完账号密码后，要越过按钮往下找复选框，勾选后再回头点登录，操作顺序是倒的。改成「用户名 → 密码 → 勾选协议 → 登录」的自然顺序。

## 变更

- 前端 `web/src/features/auth/sign-in/components/user-auth-form.tsx`（上游文件）：把 `LegalConsent` 提成局部变量。开启密码登录时，渲染在登录按钮上方；未开启密码登录时，保持原位置（在表单末尾），继续约束 Passkey / OAuth / 微信登录。
- 注册页本来就在提交按钮上方，未改。

## 验证

- `cd web && bun run typecheck`：通过。
- `bunx oxlint` 与 `bunx oxfmt --check`（改动文件）：均无报错。
- 浏览器打开本地 5173 `/sign-in`（本地已开启协议与隐私政策），复选框位于密码框和 Sign in 按钮之间。截图：`.tmp/signin-consent.png`。

## 遗留

上游同步时 `user-auth-form.tsx` 可能有小冲突，只需保留「`legalConsent` 在 Submit Button 之前」这一处位置。
