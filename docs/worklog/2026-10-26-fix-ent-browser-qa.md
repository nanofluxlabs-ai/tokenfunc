# 企业模块 M2/M4/M9/M10/M11/M12/M13 浏览器验收与修复

- 日期：2026-10-26
- 分支：main（直接提交）
- PR：（无，用户选择直接在 main 上收尾）
- 关键 commit：cab2d2ec7（8 处修复）、本条（邮件链接）

## 背景

总方案 14 个模块（#47～#60）合入 main 后，M2 / M4 / M9 / M10 / M11 / M12 / M13 只有自动化测试、没开过浏览器。用户要求在 `make dev` 上逐个走一遍，发现的问题直接在 main 上修。

验收环境：主 checkout `make api`（:3000）+ 前端 dev（:5173），`localhost` 登录 acme（企业主），`127.0.0.1` 登录临时造的管理员 `qa-admin`（dev 库 root 密码与记忆不符，用 `common.HashAccountPassword` 生成哈希直接插入 `dev.users`，role=10，验收后可删）。

## 验收结果

| 模块 | 走过的路径 | 结论 |
|---|---|---|
| M2 团队页 | 团队列表联动 `?team_id=`、状态 / 登录筛选、成员行「发放密钥」「控制台登录 / 编辑 / 禁用 / 删除」、本月消耗深链到用量页 | 通过；文案「本月获得」错（见根因 2） |
| M4 周期限额 | 从成员行发 key 选「周期限额 · 每天 · $1」→ 成功态明文 + 交付文案 → 密钥页显示「$1 / 1 · 每天 · 10/27 00:00 重置」；行菜单「设置周期限额」、批量栏「周期限额」 | 下拉框显示为空（根因 1）；其余通过 |
| M9 账单 | 企业账单单列表、行操作「导出发票 / 导出 CSV」、详情页；财务中心同一账单详情 | 旧快照账单两侧口径不一致（根因 6） |
| M10 额度信用 | 管理端 Billing 抽屉「Billing Cycle → By quota」出现「Open next period automatically」开关与说明 | 通过 |
| M11 人工调账 | 「Adjust balance」-1 美元 + 备注 → 密码二次验证 → 成功，列表余额 200 → 199，流水多一行 Adjustment | 抽屉头部余额仍显示 200（根因 5） |
| M12 文档 | `/docs/enterprise-integration` 八节渲染、curl / JSON 示例、错误码表 | 示例与接口实际返回不符（根因 3、4）；错误码表表头沿用「参数 / 类型 / 默认」（根因 8） |
| M13 冻结件 | 财务中心 TF-202610-000001（已归档 2026-10-25）逐条明细，「Statement snapshot / Raw logs」切换 | 通过 |
| M7 员工自查 | 用新建的周期限额 key 调 `GET /v1/enterprise/employee/me` | `quota_policy` 与 `budget_state` 永远为 null（根因 3） |

## 变更

- 前端 `token-quota-policy-fields.tsx`：周期下拉改为直接把 `id / value / onChange` 交给 `NativeSelect`，去掉嵌套的原生 `<select>`。
- 前端成员表、密钥页「本月消耗」列改用已有键 `Spend this month`。
- 后端 `GET /v1/enterprise/employee/me`：`team.budget_state` 由新增的 `model.GetTeamBudgetState` 填（none / ok / warn / exceeded），`key.quota_policy` 由新增的 `model.GetTokenQuotaPolicy` 填（`reset_period / custom_seconds / period_quota / next_reset_at`）；`EnterpriseTokenProfile` 多带 `TeamId`。测试 `TestEnterpriseEmployeeMe` 新增子用例覆盖告警态与策略回显。
- 文档页：`EMPLOYEE_ME_SAMPLE` 的 `usage` 改为 `{requests, quota}` 结构、`quota_policy` 补 `next_reset_at`；`usage` 字段说明改为「请求数与消耗」；`ParamTable` 新增 `labels` 属性，错误码表表头改为「错误码 / HTTP 状态」。
- 管理端企业列表：列表刷新后把打开中的 `currentRow` 同步回 provider，Billing 抽屉的余额与调账对话框即时更新。
- 企业侧账单详情：旧快照（无 v2 财务块）且账期 logs 未清理时，`EnterpriseBill.WithLiveUsageSnapshot` 按当前 logs 现算 v2 块（不落库，`snapshot_source=live`），前端渲染同一套 `BillSnapshotSection` 并提示「按当前日志实时计算」；与财务中心对旧账单的实时口径一致。
- 用量页：从团队页深链带 `team_id / member_id` 时顶部显示「团队：x / 成员：y」筛选条与「清除筛选」；成员列表接口新增 `member_id` 精确筛选供取成员名。
- 团队预算通知邮件里的链接从已重定向的 `/enterprise/organization?team_id=` 改为 `/enterprise/teams?team_id=`（重定向会丢 `team_id`，设计文档回写时核对发现）。
- 文案：七语言新增 `Error code`、`HTTP status`、`Requests and quota consumed today and this month by this key.`、实时计算提示；删除旧键 `Quota consumed today and this month by this key.`。

## Bug 根因

1. **周期下拉为空**：`NativeSelect` 组件本身渲染 `<select>`，M4 又在其中再套了一个原生 `<select>`，外层没有 option 所以显示空白，内层才是真正受控的那个。影响 M4 抽屉与批量 / 行内策略对话框，用户无法用鼠标选周期。
2. **「本月获得」**：`t('This month')` 命中上游键，上游中文是推广中心语境的「本月获得」。
3. **员工自查接口占位未接**：M7 先于 M4 / M14 落地，`quota_policy` 与 `budget_state` 写死 `nil` 并注释「合并前为 null」，后两个模块合入时没有回填。影响所有企业员工自查与接入文档的承诺。
4. **文档示例与实际不符**：`usage.today` 实际是 `{quota, requests}` 对象，示例写成数字；`quota_policy` 缺 `next_reset_at`。
5. **抽屉余额不刷新**：抽屉用的是打开时的列表行 `currentRow`，调账后只触发列表重新拉取，provider 里的行没更新。
6. **旧快照账单两侧口径**：企业侧只认 `snapshot_version>=2` 否则提示「无单价与按天明细」，财务中心对同一账单按实时 logs 现算，两侧不一致；只影响 M9 之前出的账单。
7. **用量页无筛选提示**：深链 `?member_id=` 生效但页面没有任何标识，用户看不出报表被过滤。
8. **错误码表表头**：复用 `ParamTable` 没有表头覆盖能力。

## 验证

- `go build ./...`、`go vet`、`gofmt -l` 无输出；`make test-db PKG=./controller/`：ok（63.6s；第一轮因 `setupCreditBillingPostgres` 夹具缺 `ent_token_quota_policies` 表失败，补表后通过）。
- `cd web && bun run typecheck` 通过；`bunx oxlint` 企业控制台 / 文档 / 企业管理三目录 0 error；`bunx vitest run src/features/enterprise-console src/features/docs src/features/enterprises src/i18n`：29 文件 129 用例通过。
- 接口复验：`make api` 重启后用周期限额 key 调 `/v1/enterprise/employee/me`，返回 `team.budget_state=none`、`key.quota_policy={reset_period:daily, period_quota:500000, next_reset_at:…}`。
- 浏览器复验：发放密钥抽屉周期下拉显示「每天」并可选；密钥页表头「本月消耗」；`/enterprise/usage?member_id=2` 顶部出现「成员: 王五」与「清除筛选」；`/enterprise/bills/1`（旧快照）显示「按当前日志实时计算」提示 + 按令牌分组 / 按天汇总表，与财务中心同一账单一致；文档页错误码表表头「错误码 / HTTP 状态」、`usage` 示例为 `{requests, quota}`；管理端 Billing 抽屉调账 +1 后头部余额 199 → 200 即时更新。

## 追加：用户手机验收反馈（2026-10-26 早）

- **密钥状态显示 `undefined`**：不是代码问题，是主 checkout 的 API 进程在合入「派生四态」分支后没重启，前端已读 `effective_status` 而旧进程不返回；`make api` 重启即恢复。
- **团队列表操作太挤**：团队行的编辑 / 设管理员 / 归档 / 删除四个图标按钮收进一个竖向三点菜单，放在团队名最右侧；`DataTableRowActionMenu` 新增 `icon='vertical'` 与 `size='icon-sm'` 两个可选属性，菜单项样式与密钥页行菜单一致；aria-label 用新键 `Team actions`（七语言）。
- **从成员行密钥数进密钥页时持有人筛选不回显**：`MemberPicker` 只在弹层打开后才搜索成员，深链只有 id 时没有标签可显示；现在 `value>0` 且调用方没给 `selectedLabel` 时按 `member_id` 回查一次成员名。
- 验证：`bun run typecheck`；`bunx vitest run src/features/enterprise-console src/i18n` 17 文件 64 用例通过；oxlint 改动文件 0 error；浏览器复验见下。

## 遗留

- 验收时在 dev 库造的 `qa-admin`（id 6）与 acme 下的 key `wangwu-daily`、-1 美元调账流水是测试数据，可保留给后续验收。
- 「导出发票」用新窗口 + `window.print()`，自动化浏览器会被打印对话框卡住，手工验收请手点。
- `/enterprise/usage` 面包屑式逐层下钻（团队 → 成员 → key → 日志）仍只做到筛选条，没有做层级面包屑。
