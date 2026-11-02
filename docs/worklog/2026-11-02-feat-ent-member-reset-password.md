# 企业控制台成员「重置密码」入口

- 日期：2026-11-02
- 分支：feat-ent-member-reset-password
- PR：（未建）
- 关键 commit：79c965bdf

## 背景

上线前测试观察项 8：成员登录弹窗只有「移除登录 / 改角色」，成员忘密码只能 owner 走「移除登录→重新开通」，代价是账号停用一轮 + 个人余额清零 + 团队绑定重置。企业成员均为开发者场景时密码找回成本高。补一个轻量「重置密码」动作。

## 变更

- 后端 model（`model/enterprise_org.go`）：`ResetEnterpriseMemberLoginPassword` —— 随机新密码（16 位，哈希落库，明文只在响应出现一次）；`auth_version+1` 顶掉成员的旧会话与访问令牌（与自改密码同口径）；不动账号状态、余额与成员绑定。**仅限 `provisioned` 账号**：绑定的自有账号是成员个人财产，企业管理员重置其密码等于接管个人账号，返回新错误 `ErrEnterpriseLoginNotProvisioned`。
- 后端 controller（`controller/enterprise_console.go`）：`ResetEnterpriseMemberLogin`，权限与解绑同口径（`canAssignRole`：须能授予该成员当前角色，团队管理员对企业管理员成员被拒）；审计 `enterprise.member.login_password_reset`（密码不入审计）；尽力发安全通知邮件（缺失或失败不阻塞）。
- 路由：`POST /api/enterprise/members/:id/login/reset`（`RequireEnterpriseRole(team_admin)` + PAT 规则表登记 `enterprise:write`）。
- 前端（`member-login-dialog.tsx`）：已绑定且 `provisioned` 的成员显示「重置密码」，确认弹窗说明会话与令牌全部失效，成功后复用一次性凭据面板（标题「密码已重置」/ 标签「新密码」，与开通的「初始密码」区分）；绑定的自有账号不显示入口，提示成员走登录页自行重置。

## 安全口径

- 边界：重置仅作用于企业开通的账号；绑定账号的密码主权在成员本人（登录页找回）。
- 影响面：重置使该成员所有活跃会话与访问令牌（含企业 PAT）立即失效——与自改密码行为一致；成员的 API key（tokens）不受影响。
- 权限：owner / 企业管理员可重置可管理角色范围内的成员；团队管理员只能重置本团队开发者。

## 验证

- 失败用例先行：model `TestResetEnterpriseMemberLoginPassword`（未实现时编译失败）、controller `TestEnterpriseConsoleMemberPasswordReset`、前端 `member-login-dialog.test.tsx`（无重置入口时两条用例失败）。
- model：新密码可用旧密码作废、auth_version+1、状态/余额/角色/绑定不变、未开通与绑定账号拒绝、跨企业 404。
- controller：owner 重置成功且返回的密码可用、审计留痕 1 条、绑定账号业务错误、未开通（角色 none）先被角色守卫 403（与解绑同序）、团队管理员越权 403、本团队开发者可重置。
- 前端：企业控制台 + enterprises 全量 34 文件 187 用例通过；`bunx tsc -b`、oxlint 干净；i18n 三条新键补齐 tokenfunc 7 语言，sync 后无 untranslated。
- `make test-db PKG='./controller ./model ./middleware'` 全绿。

## 遗留

- 重置后未强制成员首登改密（开通流程同样不强制）；如需要可后续在登录侧加「初始密码首登必改」标记，涉及登录链路，单独评估。
