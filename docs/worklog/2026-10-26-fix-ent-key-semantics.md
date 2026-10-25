# 统一企业 key 四态口径（概览 / 密钥页共用派生谓词）+ 管理员可设企业 key 上限

- 日期：2026-10-26
- 分支：worktree-fix-ent-key-semantics
- PR：（不开 PR，主线直接合入）
- 关键 commit：见分支（任务 A、任务 B 各一个）

## 背景

- M6 概览把 key 的「耗尽 / 过期 / 即将过期」按余额与到期时间派生，而 M3 密钥页的 `?status=` 仍按 `tokens.status` 列过滤、`?expiring=true` 的窗口也不要求 key 仍在启用。Redis 模式下上游不回写 `tokens.status`，概览待办里的「N 把耗尽」点进密钥页筛不出来，行上的状态徽标也仍显示「启用」。
- `enterprises.max_tokens`（企业 key 总数上限，0 沿用站点每用户上限）只有字段与后端取值逻辑，没有管理界面，只能改库。

## 变更

### 任务 A：派生四态口径收口（fix）

- `model/enterprise_org.go`：新增 `enterpriseTokenEffectiveStatusSQL(now)`（CASE 表达式：过期 > 耗尽 > 停用 > 启用，停用的 key 即使到期 / 余额归零仍算停用）与 `enterpriseTokenExpiringSQL(now)`（仍在启用、`(now, now+7d]` 内到期）。只有常量与时间戳参与拼接。
- `ListEnterpriseTokens`：`status` 过滤改走派生表达式（`status=1` 自动排除派生出的过期 / 耗尽），`expiring` 与概览同一谓词；列表行新增 `effective_status` 字段，`status` 仍是列原值。
- `model/enterprise_overview.go`：`CountEnterpriseTokens` 改为按派生状态 `GROUP BY` 一次统计，四态与 `expiring_7d` 全部来自同一表达式，删掉原先手写的两套 FILTER 条件。
- 前端 `enterprise-console`：`EnterpriseToken.effective_status`；密钥页状态徽标与 `TokenQuotaCell` 的灰显改用派生状态，启停按钮仍按 `status` 原值（余额归零但列仍为启用的 key 显示「耗尽」徽标、动作仍是「停用」）。不改 `tokens.status` 列，不碰上游 `features/keys`。

### 任务 B：管理员侧 `max_tokens` 表单（feat）

- 后端：`enterpriseProfileRequest.max_tokens` → `Enterprise.MaxTokens`；`Normalize` 校验 `0 ≤ max_tokens ≤ EnterpriseMaxTokensLimit(10000)`；`UpdateEnterpriseProfile` 写入 `max_tokens`；审计模板 `enterprise.update` 带上 `max keys ${max_tokens}`。
- 前端 `features/enterprises`：表单 schema / 默认值 / 回填 / payload 加 `max_tokens`，编辑抽屉在「付款期限」下加数字输入与帮助文案「0 表示沿用站点的每用户上限」，列表加「密钥上限」列（0 显示「站点默认」）。
- i18n：七个 `web/src/i18n/locales/tokenfunc/*.json` 新增 5 个 key（fr / ru / ja / vi 直接给译文）。

## Bug 根因

- 概览与密钥页各自手写过滤条件：概览按余额 / 到期时间派生，密钥页按 `tokens.status` 列。上游只有在非 Redis 模式下校验 key 时才把耗尽 / 过期回写到列，生产用 Redis，列值长期停在 1，两边数字对不上；行上徽标读的也是列值。
- 触发条件：Redis 模式 + key 余额归零或已到期但从未在非 Redis 路径被校验过。影响：所有企业的密钥页筛选与状态展示，不影响鉴权与扣费（网关侧校验本来就按余额 / 到期时间判断）。

## 验证

- `gofmt -l model/ controller/` 无输出。
- `make test-db PKG='./model/ ./controller/ ./middleware/ ./router/ -count=1'`（PostgreSQL 17.11 容器 `tokenfunc-postgres`，schema `test_fix_ent_key_semantics`；控制台用例的夹具本身跑在 SQLite 内存库，派生表达式在两种库上都验过）：model ok 24.5s、controller ok 48.7s、middleware ok、router ok。
  - `TestEnterpriseConsoleOverview`：新增断言 `?status=1/2/3/4` 与 `?expiring=true` 的 `total` 分别等于概览 `keys.active / disabled / expired / exhausted / expiring_7d`。
  - `TestEnterpriseConsoleTokenManagement`：新增 status=1 但 `remain_quota=0`、status=1 已过期、status=1 一小时后到期三把 key，断言 `?status=4` / `?status=3` 只命中派生的那把且 `status` 仍为 1、`effective_status` 为 4 / 3，`?status=1` 排除两者，`?expiring=true` 只命中未过期的那把；管理员 `PUT /api/admin/enterprise/enterprises/:id` 传 `max_tokens=10001 / -1` 被拒、`5` 落库并覆盖站点上限。
  - `TestEnterpriseScopeIsolation`（真实 PG）：余额归零的 key `CountEnterpriseTokens` 计入 `Exhausted`，`EnterpriseTokenFilter{Status: 4}` 能筛出且 `EffectiveStatus=4`、`Status=1`（覆盖 PG 上 `GROUP BY` 别名的写法）。
- `cd web && bun run typecheck`：通过。
- `bunx oxlint <改动的 14 个文件>`：0 error（exit 0）。
- `bunx vitest run src/features/enterprise-console src/features/enterprises src/i18n`：22 files / 91 tests 全部通过（含新增：密钥页派生耗尽徽标 + 停用按钮、`max_tokens` 校验与 payload、列表「密钥上限」列、locale-shape）。
- 改动的前端文件已 `bunx oxfmt --write`。

## 遗留

- M6 worklog（`2026-10-26-feat-ent-overview.md`）记的「耗尽 / 过期按余额派生，密钥页 `?status=4` 仍按 `tokens.status`，待办数字可能多于筛选结果」已在本次收口：两边共用同一 SQL 表达式。
- 「即将过期」沿用概览原定义（仍在启用且 7 天内到期），余额已归零但仍在启用的 key 也会计入；是否要排除耗尽的 key 待产品确认。
- 企业客户详情抽屉（`enterprise-billing-drawer`）只展示账务，`max_tokens` 只在列表列与编辑抽屉展示。
