# 企业组织模型改为团队 / 成员 / key 三层（M5 + M1）

- 日期：2026-10-25
- 分支：feat/ent-teams-members
- PR：
- 关键 commit：6bc4266f1（后端 + 迁移）、（前端）

## 背景

对照 tokensolo 与 OpenAI Projects / Anthropic Workspaces / OpenRouter 的企业组织设计后，黑鹰拍板：原「部门树 + 项目 + 员工 + 单主账号」过重，改为**团队（扁平，有 Default）/ 成员（不登录员工与登录角色一张表）/ key（必属团队、可选持有人）**；团队月度预算默认只告警、可勾「超限拦截」；生产无流量，走启动时一次性迁移。总方案见 `~/.claude/plans/tokensolo-tokensolo-tokenfunc-tokensolo-curious-twilight.md`，本分支对应批次 1 的 M5 + M1。

## 变更

- 后端（`6bc4266f1`）
  - `model/enterprise_org.go` 重写：`ent_teams`（`is_default`、预算三列）、`ent_members`（`team_id / user_id / role / provisioned`）、`ent_token_assignments(team_id, member_id)`；`EnterpriseScope` / `EnterpriseActor`（developer < team_admin < enterprise_admin < owner）；团队 CRUD / 归档、成员 CRUD / 导入（`team` 列，不存在则建，留空归 Default）、登录绑定 / 一键开通（随机密码只返回一次，`provisioned` 账号解绑即停用）/ 解绑 / 改角色；key 创建与改归属校验「持有人属于该团队」。
  - `model/enterprise_usage.go`：`ent_usage_daily` 主键加 `team_id / member_id`、指标加 `cache_tokens / cache_creation_tokens`；`group_by ∈ team|member|token|model|day`，filter `team_id / member_id` 随 scope 强制；导出 CSV 列同步；账单快照改 `by_team / by_member`。
  - `model/enterprise_org_migration.go`：AutoMigrate 前改名拍平（部门「父 / 子」、员工 → 成员、assignments 改列、旧聚合表移为 `_legacy`、删 `ent_projects`），AutoMigrate 后补 Default 团队、回填 `team_id`、给主账号自建 key 补 assignment、按新主键 GROUP BY 迁聚合数据；仅 PG，幂等。
  - `middleware/enterprise.go`：`EnterpriseAuth()` 泛化为主账号 + 已开通登录的成员；`RequireEnterpriseRole` / `RequireEnterpriseOwner`。`router/enterprise-router.go`：财务类路由 enterprise_admin+，团队写 enterprise_admin+，成员写 / 登录 / 角色 team_admin+；新增 `POST /tokens/:id/key`。`access_token_routes_enterprise.go` 规则同步。
  - `controller/enterprise_console.go` 重写；`GET /self` 返回 `{...enterprise, actor}`；概览对团队角色只回企业资料；审计模板补 `enterprise.*` 19 条。
- 前端
  - `types.ts / api.ts` 改为 teams / members / login / role / tokens（含 `fetchEnterpriseTokenKey`）；删除 departments / employees / projects。
  - 组织页 → 「团队」：左侧扁平团队列表（人数、归档态；企业主 / 企业管理员可新建 / 编辑含预算三项 / 归档 / 删除），右侧成员表（姓名、工号、团队、控制台登录 + 角色、密钥数深链到密钥页、状态），成员行「发放密钥」「控制台登录（绑定 / 一键开通 / 改角色 / 解绑，初始密码只显示一次）」「编辑」「删除」，CSV 导入列改 `team`（兼容旧 `department` 表头）。team_admin / developer 自动锁定本团队。
  - 密钥页：筛选团队 / 持有人 / 关键字进 URL（`search-schema.ts`），列改团队 / 持有人，创建与改归属改为团队 + 持有人（持有人按团队过滤），明文改走企业接口；「高级设置」链接仅企业主可见。
  - 用量面板：维度改团队 / 成员 / 模型 / 密钥 / 天，加缓存 Tokens 列与汇总，`filter` 透传（管理员侧 `getEnterpriseUsageSummary` 类型同步）。账单详情按团队 / 成员（兼容旧快照键）。
  - 侧边栏：去掉「项目」，「组织架构」→「团队」，「员工 API 密钥」→「企业 API 密钥」；企业分组对已开通登录的成员可见，账单项仅 owner / enterprise_admin。`/enterprise/projects` 旧路由重定向到团队页（避免本批重生成 routeTree）。
  - 审计模板 `TOKENFUNC_AUDIT_TEMPLATES` 补企业侧 19 条；i18n 七语言 +80 键、−50 旧键（部门 / 员工 / 项目，全库无引用）。
- 文档：`docs/tokenfunc/enterprise-design.md` 组织模型章节（D2 / D7、2.2–2.5、2.9、5.x、7.1、8）改写为三层模型。

## 验证

- 后端：`make test-db PKG='./model/ ./controller/ ./middleware/ ./router/ ./service/'`（PG）全部 ok；新增 `TestEnterpriseTeamsAndMembers`、`TestEnterpriseScopeIsolation`、`TestEnterpriseMemberLoginAndAccess`、`TestEnterpriseMemberImportIsAllOrNothing`、`TestEnterpriseUsageAggregationSnapshotsAttribution`、`TestEnterpriseOrgV2Migration`（旧表结构造数 → 迁移 → 团队名拍平 / Default 存在 / 聚合 SUM 不变 / `ent_projects` 不存在，再跑一次无副作用）；`go build ./...`、`gofmt` 通过。
- 前端：`bun run typecheck` 通过；改动文件 `oxlint` 0 error、`oxfmt` 已格式化；`vitest` enterprise-console（member-picker 3 例、parse-member-csv 5 例、invoice-html）、i18n locale-shape、enterprises、hooks、layout 全部通过。
- `src/features/usage-logs/components/__tests__/detail-preview.test.tsx` 的「task log prices use localized unit labels」单独重跑仍 20s 超时；该文件本分支未改（只改了同目录 `lib/tokenfunc-audit-templates.ts`），属既有慢测试，未处理。
- 未做：浏览器手工验收（dev 库两次启动确认迁移幂等、acme 走团队 → 成员 → 开通登录 → 该账号只见本团队 → 发 key 流程）；需合并前在 `make dev` 上过一遍。

## 遗留

- 团队页仍是改名适配版，M2 的「本月消耗列、深链、按团队发 key」与 M5 的趋势图 / 下钻 / URL 筛选在后续 PR 做；`/enterprise/projects` 路由文件保留为重定向，M2 改路由为 `/enterprise/teams` 时一并删除并重生成 routeTree。
- 团队预算只落库与展示，告警 / 拦截逻辑在 M14。
- 上游 `/keys` 对企业主 / 成员的隐藏在 M3；目前成员账号仍能看到上游「API 密钥」菜单（显示的是其个人账号下的空列表）。
- M7（PR #47）合并后需按其说明改 `GetEnterpriseTokenProfile` 为 JOIN `ent_teams / ent_members`、钱包 `isEnterpriseOwner` 改读 `actor.is_owner`。
- 落地页 `features/landing/content.ts` 的「Organization / Projects」营销文案未动。
