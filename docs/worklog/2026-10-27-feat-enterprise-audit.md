# 企业审计视角、企业控制台审计补全、审计菜单与路由字段收口

- 日期：2026-10-27
- 分支：feat/enterprise-audit
- PR：
- 关键 commit：be8e39115（后端）

## 背景

黑鹰问审计日志的权限现状。梳理后的结论：

- 审计记录「谁操作就记在谁名下」。Root 能看全部；被授予 `audit:read` 的管理员能看普通用户和管理员的记录；其他人只能看自己的。
- 企业不是一个能看审计的层级。主账号和企业管理员看不到成员建 key、改角色、删团队这类操作，B 端客户的合规诉求无法满足。
- 企业控制台有几处写操作和敏感读取没有审计：成员的增删改与导入、查看完整 key、各类导出。
- 黑鹰另外提了两点：
  - 个人用户不需要审计菜单；
  - 请求的方法和路由属于平台内部信息，不应对外部用户展示。

拍板结果：

- 只有主账号和 enterprise_admin 能看「本企业」。
- 平台管理员对该企业的操作不给企业看。
- 缺失的审计一起补上。
- 审计菜单只给平台管理员和企业主账号 / 企业管理员。
- 外部用户的审计记录由后端置空方法和路由，访问令牌记录除外。

## 变更

- 后端：
  - 新增 `GET /api/enterprise/audit`（`RequireEnterpriseRole(enterprise_admin)`），与 `/api/audit` 共用 `GetAuditLogs`。
  - 过滤口径为三个条件同时满足：`action LIKE 'enterprise.%'`、`other.op.params.enterprise_id` 等于本企业、`actor_role` 为普通用户。这样可以排除平台管理员的操作和成员的个人记录。
  - 没有按成员 user_id 集合过滤，原因是成员可以绑定已有的个人账号，按 user_id 过滤会把绑定前后的个人记录带出来。代价是企业看不到成员的登录事件。
  - 外部视角（viewerRole < admin）置空 `method` 和 `route`，`category=access_token` 的记录保留这两个字段。
  - 补了 8 种审计 action：成员 create / import / update / delete、`token.reveal_key`，以及 bill / usage / finance_usage 三类导出。导出在附件头已经写出后才记录，参数带文件名。
  - 访问令牌 scope 用 `enterprise:read`。
- 前端：
  - 新增二开页面 `audit/tokenfunc-audit-page.tsx`。平台管理员看到「全部 / 仅我的」，企业主账号和企业管理员看到「本企业 / 仅我的」。非平台视角隐藏方法和路由列。
  - 菜单与路由守卫共用 `canSeeAuditMenu`。个人用户和团队角色看不到入口，直接访问 URL 会被转到使用日志。
  - 前端模板表补了企业控制台的 16 个 action（原先缺 token 类）。现有和新增的企业控制台模板一起补了 7 种语言的译文（原先在中文界面下显示英文），另外新增 `This enterprise` 的译文。
- **上游文件改动清单**（下次 `/upstream-sync` 对照用）：
  - `model/audit_log.go`：`AuditLogFilter.EnterpriseId` 字段，加上 `applyEnterpriseAuditScope` 和 `redactAuditForCustomer` 两行钩子。
  - `controller/access_token.go`：`applyTokenfuncAuditScope` 一行钩子。
  - `web/.../audit/api.ts`：`AuditScope` 类型和端点表。
  - `audit-log-viewer.tsx`：可选参数 `showUsername` / `hideRequestRoute`，403 降级判断改为 `!== 'self'`。
  - `audit-log-filter-bar.tsx`：用户名筛选的显示条件。
  - `audit-log-columns.tsx`：可选参数 `hideRequestRoute`。
  - `routes/_authenticated/usage-logs/audit.tsx`：component 换成二开页面，加 beforeLoad 守卫。
  - 上游的 `audit/index.tsx` 和 `use-sidebar-data.ts` 未改。

## 验证

- `go build ./... && go vet ./controller ./model ./router ./middleware`：通过。
- `make test-db PKG='-count=1 ./controller/ ./model/ ./router/ ./middleware/'`：四个包全部 ok（PG，schema `test_feat_enterprise_audit`）。
  - 新增 `controller/tokenfunc_enterprise_audit_test.go`。现有的 `enterprise_console_test.go` 跑在 SQLite 上，而企业审计依赖 PG 的 json 运算符，所以单独新建了这一个 PG 测试文件。
  - 用例覆盖：通过真实接口新增成员和查看完整 key 后，企业管理员和主账号都只看到这两条；别家企业、平台管理员带 enterprise_id 的操作、成员的个人安全事件都不出现；developer 访问返回 403；返回里没有 admin_info，也不含明文 key；外部视角路由为空，但访问令牌记录保留路由；平台管理员的「全部」视图保留路由。
- `bun run typecheck`：通过。
- `bunx vitest run src/features/usage-logs src/features/enterprise-console src/features/security src/hooks src/i18n`：63 个文件、647 个用例全部通过。新增的测试：
  - `audit/__tests__/tokenfunc-audit-page.test.tsx`：企业管理员默认进入「本企业」，请求打到 `/api/enterprise/audit`，没有路由列；developer 只有自己的记录；平台管理员看到「全部」且有路由列。
  - 侧边栏测试扩展了审计入口的可见性。
- 对改动文件跑 oxlint、`oxfmt --check`：无问题。`bun run i18n:sync` 后上游 locale 无 diff。

## 遗留

- `audit_logs` 上没有 `params.enterprise_id` 的表达式索引。量大以后，在二开迁移里加 PG 部分索引（`WHERE action LIKE 'enterprise.%'`）。
- 企业看不到成员的登录事件，这是有意的取舍。
- 平台侧的 `enterprise.*` 模板（create / credit / bill.payment 等）仍只有英文，这些只有平台管理员能看到，本次没有处理。
- 个人用户的审计菜单已经隐藏，但 `/api/audit/self` 保留，安全设置页的访问令牌卡片依赖它。将来如果需要，可以另做「最近登录」卡片。
