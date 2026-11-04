# 管理员可为个人用户与企业主重置密码，随机生成只展示一次

- 日期：2026-11-04
- 分支：main
- PR：
- 关键 commit：d50e5a071、3bbc60632

## 背景

黑鹰原以为个人用户行菜单里有「重置密码」，核对后发现只有「重置 Passkey / 重置 2FA」；管理员要改个人用户密码得进编辑抽屉手输，而企业主账号在个人用户列表里被过滤掉，管理员没有任何途径改它的密码。企业是付费客户，企业主忘记密码是常见支持场景，这是真实缺口。

决定给个人用户与企业用户加同一套「重置密码」：仅管理员可用，服务端随机生成，只展示一次，与现有「重置 Passkey」同级的安全操作（二次验证、审计、踢下线、安全邮件）。企业成员在管理员侧抽屉是只读设计，本次不加。

## 变更

后端（二开文件 + 少量接线）：

- `model/tokenfunc_user_password.go`：`ResetUserPasswordRandom`，事务内行锁、递增 `AuthVersion`、写入 16 位随机密码的哈希，返回用户名与明文（仅本次响应使用）。
- `controller/tokenfunc_user_password_reset.go`：`AdminResetUserPassword`。角色校验（不能重置同级或更高角色）→ 管理员二次验证 proof（scope `admin.user.password.reset`）→ 重置 → 吊销全部会话 → 审计 `user.reset_password`（不含明文）→ 有邮箱则发账号安全变更邮件。
- `service/security_verification.go` 新增 scope 并登记到 context 校验列表；`service/access_token_scope.go` 映射到 `user:write`；`router/api-router.go` 挂 `POST /api/user/:id/reset_password`；`middleware/access_token_routes.go` 登记访问令牌作用域。

前端：

- `web/src/features/users/components/reset-password-dialog.tsx`：确认弹窗 → 二次验证 → 调接口 → 凭据弹窗（用户名 / 新密码各带复制按钮，提示只展示一次、会话已全部下线）。个人用户与企业主共用。
- 个人用户行菜单加「Reset password」（root 禁用）；企业列表 `enterprise-row-actions.tsx` 改为与个人用户一致的布局：只露出编辑、充值两个图标，账单 / 成员 / 重置密码收进「更多」菜单（3bbc60632，响应黑鹰「按钮太多占宽度」的反馈）。
- 二次验证 scope union、API 封装 `resetUserPassword`、企业弹窗类型 `reset-password`。
- i18n：新增 5 个 key，补齐 `locales/tokenfunc/` 7 个语言文件。

安全要点（OWASP ASVS 认证 / 会话管理章节对照）：密码由服务端 CSPRNG 生成并哈希存储，不接受管理员自选；敏感操作强制管理员重新验证且 proof 一次性；重置后吊销目标用户全部会话与访问令牌；审计记录不含密码；目标用户收到邮件通知。

## 验证

- `GOWORK=off go build ./...` 通过。
- `make test-db PKG='-count=1 ./controller/ ./middleware/ ./router/ ./service/'` 全部 ok。新增 `controller/tokenfunc_user_password_reset_test.go`：无 proof 返回 403 `SECURITY_PROOF_REQUIRED`；带 proof 成功后密码 16 位、旧密码失效、`AuthVersion` +1、审计不含明文、proof 二次使用返回 `SECURITY_PROOF_CONSUMED`；管理员不能重置同级账号。
- `bunx tsc -b` 通过；`bunx vitest run src/features/users src/features/enterprises src/features/auth` 208 用例通过（含新增 `reset-password-dialog.test.tsx` 与企业行菜单用例）。
- 本地浏览器：个人用户与企业列表各走一遍，到二次验证弹窗、重置成功后展示凭据；企业行只剩两个图标按钮加更多菜单。

## 遗留

- 企业成员的密码重置仍走企业控制台自己的实现（`model/enterprise_org.go`），后续可改为复用 `ResetUserPasswordRandom`。
