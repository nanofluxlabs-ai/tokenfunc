# 员工 key 周期限额：每日 / 每周 / 每月 / 自定义周期自动恢复到 X 美元（M4）

- 日期：2026-10-26
- 分支：feat/ent-token-quota-policy（worktree `agent-aeadf44ece2982ecd`，slot 2：API 3002 / 前端 5175 / schema `dev_agent_aeadf44ece2982ecd` / `test_agent_aeadf44ece2982ecd` / Redis db 4、5）
- PR：
- 关键 commit：9a7057960（后端）

## 背景

企业最常见的预算诉求是给员工 key 设「每天 / 每周 / 每月自动恢复到 X 美元」（tokensolo 的 `quota_reset_period`、OpenRouter 的 key 预算对标）。上游 tokens 只有一次性固定额度，用完要人工调高。方案见 `~/.claude/plans/company_mgr/M4-token-quota-policy.md`；本模块改写 `tokens.remain_quota`，实施前已完整阅读 `.agents/rules/billing.md`。

## 变更

### 后端

- 新表 `ent_token_quota_policies`（`model/enterprise_token_quota.go`，PG 专属）：`token_id` 主键、`enterprise_id`、`reset_period`（daily / weekly / monthly / custom）、`custom_seconds`（1 小时～366 天）、`period_quota`、`next_reset_at`、`updated_at`；登记 `model/main.go` AutoMigrate 与 `enterprise_test.go` 表清单。
- 边界 `NextTokenQuotaResetAt`：账期时区（上海）下 daily 次日 00:00、weekly 下周一 00:00（周一 0 点整算 7 天后）、monthly 下月 1 日 00:00、custom = now + 秒。
- 写入即施行 `SetTokenQuotaPolicies`（单条 / 批量共用，≤ 200，全成功或全失败）：先用 `listEnterpriseTokensInScope` 做范围校验（team 角色只能动本团队 key，混入范围外 id 整批 404），`never` 只删策略行；其余先 `invalidateTokensCache`（fence + DEL）再在事务里 `ON CONFLICT (token_id) DO UPDATE` + `UPDATE tokens SET remain_quota=period_quota, unlimited_quota=false, status=CASE WHEN 4 THEN 1 END`，更新行数不等于 key 数则回滚。
- 到期重置 `ResetDueTokenQuotaPolicies(now)` 挂在企业分钟任务 `runEnterpriseCreditTaskOnce`（已有 Redis 锁），在授信翻转之后、出账之前：`policies LEFT JOIN tokens` 取 `next_reset_at <= now` 前 500 条；key 已软删 → 删策略；否则 fence → 按 `(token_id, next_reset_at)` 乐观认领前移 `next_reset_at`（以 now 为基准，补跑不连跳、多副本只重置一次）→ 重置 `remain_quota`（不动 `used_quota`）+ 4 → 1，disabled 保持。
- 企业密钥页删除 / 批量删除同事务清策略；`CreateEnterpriseTokenWithPolicy` 新建 key 时同事务写策略且初始额度就是周期额度（`CreateEnterpriseToken` 委托给它）。
- 列表 `ListEnterpriseTokens` LEFT JOIN 策略表，透出 `reset_period / period_quota / next_reset_at`（无策略时为空 / 0）。
- 接口（`controller/enterprise_tokens.go`，均登记 `middleware/access_token_routes_enterprise.go` 的 `enterprise:write`）：
  - `PUT /api/enterprise/tokens/:id/quota-policy` `{reset_period, custom_seconds, period_quota}`
  - `POST /api/enterprise/tokens/batch-quota-policy` `{token_ids[], reset_period, custom_seconds, period_quota}`（与 M3 的 batch-status / batch-delete 同用 POST）
  - `POST /api/enterprise/tokens` 与 `PUT /tokens/:id` 接受可选 `quota_policy{...}`：省略不动现有策略、`never` 删策略、其余写入即施行。
  - 审计模板 `enterprise.token.quota_policy` / `enterprise.token.batch_quota_policy`；`ErrEnterpriseTokenQuotaPolicy` 走业务错误（400 文案）。

### 前端（`web/src/features/enterprise-console`）

- `lib/token-quota-policy.ts`：周期常量、草稿类型、zod 校验（`tokenQuotaPolicyIssues` 供抽屉按模式复用）、草稿 → 请求体、与后端同口径的「下次重置」预览（Intl 取上海日历日，上海无夏令时按 +8 计算 00:00）、`formatResetTime`。
- `components/token-quota-policy-fields.tsx`：周期 `NativeSelect` + 自定义小时数 + 周期额度 + 下次重置预览的受控字段，抽屉与对话框共用。
- `components/token-mutate-sheet.tsx`：额度段改为三选一 RadioGroup（不限 / 固定额度 / 周期限额）；周期模式提交 `quota_policy` 且 `remain_quota = period_quota`；其它模式显式传 `never` 清旧策略；编辑有策略的 key 预选周期模式。
- `components/token-quota-policy-dialog.tsx`：行菜单单把 / 批量条多把共用，`tokenIds` 一把走单条接口、多把走批量接口，可选「不设周期限额」。
- `components/token-quota-cell.tsx`：无策略复用上游 `ApiKeyQuotaCell`；有策略显示 `剩余 / 周期额度 · 每月` + 进度条 + 「MM-DD HH:mm 重置」（上游单元格「总额 = 已用 + 剩余」的口径对周期 key 不成立，所以包了一层而不是改上游文件）。
- `components/keys-page.tsx`：额度列换成 `TokenQuotaCell`；行「更多」菜单与批量条加「设置周期限额」；对话框放在 `SectionPageLayout` 外，保存后通过 `selectionVersion` 清掉表格已选。M14 的「Blocked by budget」徽标保持不动。
- 文案：七个 `web/src/i18n/locales/tokenfunc/*.json` 各加 17 个键（Daily / Weekly / Monthly / Custom / Never 复用上游已有键）。

## 验证

- `make test-db PKG='./model/ -run TestEnterpriseTokenQuotaPolicy -count=1'` → `ok`（PG 实库）：六组边界（含周一 0 点整与月末）、Validate 五种拒绝、team 范围 404、>200 拒绝且不留行、写入即施行（耗尽 4 → 1、used_quota 不动、disabled 保持）、列表透出、到期任务（未到期不动 / 到期重置 / 同分钟二次执行 no-op）、新建带策略、never 删行保留额度、企业页删除清策略、绕过企业页软删由任务清理、`BatchUpdateEnabled=true` 下写入正常。
- `go test ./controller/ -run 'TestEnterpriseConsoleTokenManagement|TestEnterpriseConsoleAccessTokenScopes' -count=1` → `ok`（sqlite 夹具）：team 管理员给本团队 key 设每日 $1 → `remain_quota=500000`、`unlimited_quota=false`、列表 `reset_period=daily`；custom 60 秒拒绝；创建带 `quota_policy` 初始额度 = 周期额度；批量混入 QA 团队的 key 对 Research 管理员 404；批量 `never` 删行且额度保留。
- `go test ./middleware/ -run TestAccessTokenRouteRules -count=1` → `ok`（新路由已登记）。
- 前端：`bunx oxlint -c .oxlintrc.json src/features/enterprise-console` 无 error；`bun run typecheck` 通过；`bunx vitest run src/features/enterprise-console src/i18n` → 14 个文件 52 个用例通过（新增 `token-quota-policy-dialog.test.tsx` 5 例、`token-quota-cell.test.tsx` 3 例，`token-mutate-sheet.test.tsx` 加 2 例，`locale-shape` 守卫通过）。
- 本地演练（`make api`，slot 2，Redis 开启，`BATCH_UPDATE_ENABLED=true`）：`/api/setup` 建 root → 管理员新建企业 `M4 Acme` → 企业主创建 key → `PUT /tokens/1/quota-policy {daily, 500000}` → 列表立即 `remain_quota=500000, unlimited_quota=false, status=1, next_reset_at=1793030400（2026-10-27 00:00 CST）` → psql 把 `remain_quota=0, status=4`、`next_reset_at` 改到 60 秒前 → 15 秒后分钟任务恢复 `500000 / status 1 / next_reset_at=1793030400`，API 日志 `enterprise token periodic quotas reset: 1`。
- 数据库：PostgreSQL 16（docker `tokenfunc-postgres`），schema `test_agent_aeadf44ece2982ecd` / `dev_agent_aeadf44ece2982ecd`；二开代码不做 SQLite / MySQL 兼容。

## 与方案的偏差

- 批量接口用 `POST /tokens/batch-quota-policy` 而不是方案写的 `PUT`，与 M3 的 `batch-status` / `batch-delete` 保持一致。
- 编辑接口里 `quota_policy` 在 `token.Update()` 之后单独一个事务写入（字段先落库、策略随后施行），不是同一事务；新建接口是同事务。
- 方案「daily 在 2026-10-25T16:00Z 的下次重置 = 1761408000」有误：1761408000 是 2025 年的时间戳，且 16:00Z 本身就是上海 00:00。测试改为 2026-10-25 23:59:59 CST → 2026-10-26 00:00 CST（1792944000），以及 00:00 整点再推一天 / 一周。
- 范围校验在事务外（复用 `listEnterpriseTokensInScope`），事务内靠 `UPDATE ... WHERE id IN ? AND deleted_at IS NULL` 的行数校验兜底。

## 遗留

- `BatchUpdateEnabled` 下，重置前排在队列里的扣费增量会在稍后以 `remain_quota + delta` 落库，造成秒级漂移（方案已接受）。
- 上游 `/api/token/:id` 删除企业 key 不会同步清策略，由分钟任务在下次到期时顺手清理。
- 前端预览与后端都按上海时区切分周期，暂不跟随企业所在时区。
- 浏览器端没有截图（本次用接口 + psql 演练），前端交互靠 vitest 覆盖。
