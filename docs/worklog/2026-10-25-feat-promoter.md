# 推广人模块：推广人管理 + 推广中心（移植自 tokensolo，按 tokenfunc 重做）

- 日期：2026-10-25
- 分支：feat/promoter（base = feat/log-daily-rollup，PR #32）
- PR：#33
- 关键 commit：c5c1edabd（后端）、6226246e3（前端）

## 背景

黑鹰要把 tokensolo 的「推广人管理 / 推广中心」搬进 tokenfunc。调研后不能直接复制：前端栈不同（Semi jsx → React 19 + Base UI + TanStack）、tokensolo 统计依赖团队家庭展开与它自己的 `log_dim_daily_rollups`，tokenfunc 都没有。于是只搬业务规则与交互，代码按本项目模式重写，并先在 PR #32 落了预聚合表让推广统计不扫 logs 全区间。

已拍板的设计：口径默认「绑定当天起」，管理员手动绑定可勾选「包含历史消耗」= 全历史，推广链接注册自动绑定按全历史；身份与绑定用独立表不动上游 `users`；推广人自助视图不下发邮箱 / 分组；不做进程内缓存（多副本不一致）；钱包页「推荐计划」卡保留并作为「我的推广」入口，推广人多一行摘要，推广中心页只在标题旁留复制链接按钮；90 天 logs 保留 + 归档到 COS 另立 PR-3。

## 变更

- 迁移：`tf_promoters`（user_id 部分唯一 `WHERE removed_at IS NULL`）、`tf_promoter_bindings`（user_id 部分唯一 `WHERE unbound_at IS NULL`，`(promoter_user_id, unbound_at)` 索引，`usage_since` 0 = 全历史，`source` register|admin）。软移除 / 软解绑保留历史行。
- 后端 model：`model/tokenfunc_promoter.go`（身份 / 绑定 CRUD、含软删用户的简要信息、企业主账号判定、按用户名或 ID 找绑定目标）；`BindPromoterOnRegister` 挂在 `model/user.go` 的 `finishInsert` / `FinalizeOAuthUserCreation`，放在支付合规判断之外。核对发现上游从不写 `users.inviter_id`，钩子直接用 inviterId 参数，不改上游 Insert。
- 后端 service：`service/promoter.go`（设 / 撤推广人、批量绑定 ≤200 条逐条校验返回 `{bound, failed[{input, reason_key, reason_params}]}`、解绑；业务错误全部是 `common.NewMessage` key）；`service/promoter_center.go`（读 `ReadLogDailyUsage` 后按每条绑定的 `usage_since` 所在上海日截断，再折叠出总览 / 每日补零 / 名下用户（含 0 消耗、企业标、已注销标、最后消耗日）/ 模型占比 / 单用户下钻 / 管理端本月归并）。
- 后端 controller / router / middleware：`/api/promoter/self`（非推广人 `data=null`）、`/api/promoter/center/{overview,users,models,users/:user_id/usage}`（`PromoterAuth` 403）、`/api/admin/promoter/promoters`（列表 / 新增 / 改备注 / 移除、`:id/bindings` 列表 / 批量绑定 / 解绑、`:id/center/*` 与自助共用 handler，`PromoterFromParam` 404）。缺省区间本月 1 日 → 今天，显式 `start/end` 或 `ts_*` 走财务中心同一套解析。审计 action `promoter.create|remove|bind|unbind` 登记在 `controller/audit.go`。
- 前端 `features/promoter-center`：自助与管理员视角同一页（scope 判别联合切前缀），标题旁 `CopyButton` 复制推广链接（链接用钱包页同一个 `generateAffiliateLink`），财务中心的 `DatePresetButtons` / `DayRangeControls` / `useFinanceDateRange` / `MetricCard` / `ShareBar` / `SectionBlock` 直接复用，三个 Tab（每日 VChart 柱图 + 表、用户本地分页排序、模型占比）与用户下钻 Sheet；`PromoterGuard` 守卫；`PromoterSummaryRow` 挂进钱包「推荐计划」卡（非推广人 null，上游卡片其余不动）。
- 前端 `features/promoters`：管理页（服务端分页表：推广人 / 备注 / 绑定数 / 本月消耗 / 加入时间 / 操作）、新增 `UserPicker`（能力缺口：仓库没有搜索已有用户的选择器，企业抽屉是手填 ID；照 `employee-picker` 的 Combobox + useDebounce + useQuery 实现，管理员与已绑定项置灰）、添加推广人弹窗、绑定管理 Sheet（单个添加 / 多行批量 / 包含历史勾选 / 逐条结果 / 已绑定列表 / 解绑确认）、移除确认（文案含解绑人数）。
- 侧边栏：新分组 `promoter`（推广中心）按 `usePromoterSelf()` 显隐；管理员「客户管理」下加「推广人管理」。审计前端模板放 `usage-logs/lib/tokenfunc-audit-templates.ts` 并入上游表。
- i18n：69 个新 key 写进 `locales/tokenfunc/{en,zh,zh-TW,fr,ja,ru,vi}.json`（en/zh 手写，其余暂填英文），含后端 `NewMessage` key 与审计模板。

## 验证

- 后端：`GOWORK=off go build ./... && go vet ./service/ ./middleware/ ./controller/ ./router/` 通过；`make test-db PKG='-count=1 ./model/ ./service/ ./controller/'`：model ok 16.2s、service ok 3.9s、controller ok 43.958s。新增用例：`service/promoter_test.go`（规则表驱动、usage_since 取值、解绑后可再绑且历史行保留、移除级联、注册钩子经 `User.Insert` 真路径且不依赖合规开关、中心统计含 usage_since 截断 / 企业标 / 0 消耗 / 下钻归属 / 管理端归并）、`controller/promoter_test.go`（非推广人 403、不存在 id 404、绑定响应 bound/failed、业务错误带 `message_key`）。
- 迁移幂等：`make api TF_API_PORT=3003` → `make api-stop` → `DEBUG=true make api TF_API_PORT=3003`，第二次 `grep -c 'ALTER TABLE' .tmp/logs/api.out` = 0（SQL 行 1367 > 0，panic 0）；dev 库 `pg_indexes` 确认两个部分唯一索引 `WHERE removed_at IS NULL` / `WHERE unbound_at IS NULL` 已建。
- 前端：`bun run typecheck` 通过；`oxlint` 对新改文件无 error；`bunx vitest run src/features/promoters src/features/promoter-center` 5 文件 14 用例通过（批量解析、选择器禁用项与选中、绑定 Sheet 请求体 `include_history` 与逐条结果、页面 admin/self 前缀与空态与 tab 写 URL、钱包摘要行显隐）；全量 `bun run test` 仅 `usage-logs/.../detail-preview.test.tsx` 的 20s 超时用例失败，该用例在 main 上同样超时，非本次引入；`bun run i18n:sync` 两次后上游 locale 无 diff、`_extras` 为空。
- 接口冒烟：本地无可输入的管理员凭据（dev 库 root 密码已变、acme 密码不入仓），控制台接口的 403 / 404 / 绑定契约 / 月度口径由 controller 与 service 的 PG 测试覆盖；浏览器核对清单交黑鹰。

## 遗留

- 浏览器核对（黑鹰）：管理员添加推广人 → 管理绑定（单个 + 批量 + 勾选历史）→ 推广中心三个 Tab 与下钻 → 移除；推广人账号登录看到「推广中心」菜单与钱包卡摘要行，非推广人直达 `/promoter-center` 看到空态；暗色主题与手机宽度。
- zh-TW / fr / ja / ru / vi 的新 key 暂为英文。
- `PUT /api/admin/promoter/promoters/:id` 改备注只有接口没有 UI。
- 预聚合只到天：同一天内绑定前的消耗也计入；「最后消耗」只能给到日期。
- PR-3：logs 90 天保留 + 归档到腾讯云 COS（`.env` 已有 `LOG_ARCHIVE_S3_*`），未开始。
