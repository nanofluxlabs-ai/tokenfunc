# 企业 API 密钥页重做：企业 key 的唯一入口（M3）

- 日期：2026-10-25
- 分支：feat/ent-keys-page
- PR：#51
- 关键 commit：b716caae4（后端）、177724c33（前端）

## 背景

总方案（`~/.claude/plans/company_mgr/M3-enterprise-keys-page.md`）与同机会话 tokenfunc-dd 转述的四项收口：企业的 key 只在 `/enterprise/keys` 管，菜单合一、去掉跳上游 `/keys` 的「高级设置」、编辑 / 删除 / 启停 / 批量在同一张表与同一个抽屉完成、成员表密钥数深链。M1（#49）合并后团队 / 成员 / scope 已就绪，本模块在其上补齐 key 的全部操作。

## 变更

- 后端
  - `model/enterprise_org.go`：`ListEnterpriseTokens` 返回分组、模型白名单、IP 白名单、团队状态，并按 `ent_usage_daily` 回填本月 / 上月消耗（`enterpriseMonthRange`）；filter 加 `Expiring`（7 天内到期）。新增 `GetEnterpriseToken`（范围校验）、`DeleteEnterpriseToken`（软删 + 删归属）、`BatchUpdateEnterpriseTokenStatus`（启用时跳过过期 / 耗尽的 key 并返回 skipped）、`BatchDeleteEnterpriseTokens`；批量里任一 id 不在范围内整批 404。
  - `model/enterprise.go`：`enterprises.max_tokens`（0 = 沿用站点上限，取大）。
  - `controller/enterprise_tokens.go`（从 `enterprise_console.go` 拆出）：`validateEnterpriseTokenRequest` 校验名称 / 额度 / 过期 / 分组（`service.IsUserSelectableGroup`，不支持 auto）/ IP 或 CIDR ≤ 50 行 / 模型必须在所选分组（未选则主账号分组）启用；接口 `GET /tokens/options`、`PUT /tokens/:id`、`PUT /tokens/:id/status`、`DELETE /tokens/:id`、`POST /tokens/batch-status`、`POST /tokens/batch-delete`；审计模板 `enterprise.token.*` 六条；访问令牌规则同步。
- 前端
  - `token-mutate-sheet.tsx`：新建 / 编辑共用抽屉（基本：名称 / 团队 / 持有人 / 过期预设；额度；访问限制：分组下拉复用上游 `ApiKeyGroupCombobox`、模型多选、IP 文本域；成功态：明文 + 交付文案一键复制）。从成员行「发放密钥」进入时固定团队与持有人。替代 `token-create-dialog` / `token-assign-dialog`。
  - `keys-page.tsx`：筛选团队 / 持有人 / 状态四态 / 即将过期 / 关键字全部进 URL；列 = 名称 + 掩码、团队 · 持有人（归档标注）、额度（复用上游 `ApiKeyQuotaCell`）、本月消耗（环比）、限制（分组 · N 模型 · N IP）、状态、最近使用、操作（启停 / 编辑 / 复制 key / 复制接入信息 / 删除）；多选 + 批量启用 / 停用 / 删除；总数达上限九成时顶部提示；页头角色徽标。去掉跳上游 `/keys` 的链接。
  - 菜单收口：企业分组「企业 API 密钥」改回上游 key `API Keys`；企业主与企业开通的账号不再看到常规分组的 `/keys`（绑定已有账号的成员保留）。
  - i18n 七语言 +30 键，删除无引用的 `Enterprise API Keys`、`Advanced key settings`。

## 验证

- 后端：`make test-db PKG='./controller/ -run TestEnterpriseConsole -count=1'` ok；新增 `TestEnterpriseConsoleTokenManagement`（非法 CIDR / 越权分组 / 模型不在分组 / 持有人不属团队 → 400；创建落白名单与 CIDR；本月消耗回填；编辑改名 + 挪团队 + 清白名单；耗尽 key 不能启用；团队管理员对别的团队 404；成员取明文 200；批量混入范围外 id 404；批量启用跳过耗尽；删除清归属；站点上限 1 → 企业上限 5 覆盖）。五包全量回归见下。
- 前端：`bun run typecheck` 通过；改动文件 `oxlint` 0 error；`vitest run src/features/enterprise-console src/i18n src/hooks src/components/layout src/features/wallet` → 18 文件 67 用例通过（新增 `keys-page.test.tsx` 4 例、`token-mutate-sheet.test.tsx` 2 例、`key-handover.test.ts` 2 例）。
- 五包回归：`make test-db PKG='./model/ ./service/ ./controller/ ./middleware/ ./router/ -count=1'`（PG）全部 ok（model 43.7s / service 8.0s / controller 73.8s / middleware 0.8s / router 0.8s）。
- 浏览器冒烟（worktree `make dev`，API 3007 / 前端 5180，schema 克隆主 dev 旧数据后首启迁移 6 条日志）：acme 登录后常规分组已无「API 密钥」、企业分组显示「API Keys」+ Owner 徽标；新建抽屉选 gpt-4o 白名单 + 两行 IP/CIDR → 成功态显示明文与交付文案 → 表格限制列「Follow enterprise group · 1 models · 2 IPs」、`?q=smoke` 筛选生效 → 编辑抽屉预填名称 / 团队 / 持有人 / 模型芯片 → 停用后状态 Disabled → 菜单删除确认后列表为空；库里 tokens 软删、归属行 0 条、`model_limits = gpt-4o`、`allow_ips` 两行；审计 `enterprise.token.create / status / delete` 三条。发现创建审计的 `team_id` 记成 0（未解析默认团队），已改为记录解析后的归属。

## 遗留

- `enterprises.max_tokens` 只有列与读取，管理员企业编辑表单未加输入框（需要时后台 SQL 或后续小 PR）。
- 周期限额（M4）、团队预算拦截提示（M14）在本页的列与抽屉段位后续补入；「复制交付文案」的文档链接暂指 `/docs`，M12 做企业接入指南后改为专页。
- 浏览器未点的：批量启停 / 删除、持有人下拉、成员行「发放密钥」入口（均有 vitest / Go 用例覆盖）。
