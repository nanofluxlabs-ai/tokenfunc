# 文档中心新增「企业接入指南」（M12）

- 日期：2026-10-26
- 分支：feat/ent-docs
- PR：#56
- 关键 commit：3dc31b88c

## 背景

总方案批次 4 的 M12（`~/.claude/plans/company_mgr/M12-enterprise-docs.md`）：企业客户的技术负责人不用问客服就能完成员工 key 分发、额度查询、终端用户身份头、理解停服错误码与账单流程。对标 tokensolo 的 `customer-integration.md`，但放在产品内文档中心，不新增仓库 `docs/` 文件。

## 变更

- `web/src/features/docs`：`DocsGroupId` 加 `enterprise`；`registry.ts` 加第 4 组「Enterprise integration」与页面 `enterprise-integration`；`index.tsx` 懒加载 `content/enterprise-integration.tsx`。
- 页面八个章节（`DocSection id`）：`overview`（三层模型与 OpenAI / Anthropic 对应、控制台入口）、`employee-keys`（发放密钥、限制、团队预算拦截）、`credit-api`（三条额度接口 + curl + `billing_credit` 示例，403 / 404 说明）、`employee-me`（`/v1/enterprise/employee/me` 字段表 + 示例）、`end-user-header`（`X-User-Id` 与渠道亲和 `request_header` 规则）、`errors`（六个企业错误码表）、`billing`（账期 → 出账 → 付款 → 催款节奏 0/1/3/7/14 天 → 预警）、`contact`（站点名 + 商务二维码来自 `/api/status`）。复用 `DocSection / DocSteps / Note / P / EndpointHeader / ParamTable / BaseUrlCard / CodeBlock`，无新组件。
- M3 抽屉「复制交付文案」的文档链接改为 `/docs/enterprise-integration`。
- i18n：62 个新键，en / zh / zh-TW 手写，其余四语言由 `bun run i18n:sync` 回填英文（文档页按既有约定只保证中英）。

## 验证

- `bun run typecheck` 通过；`bunx oxlint src/features/docs` 0 error；`bunx vitest run src/features/docs` 7 文件 43 用例通过（新增 `enterprise-integration.test.tsx` 4 例：章节顺序、六个错误码与状态码、curl / JSON 示例含 `billing_credit` / `enterprise_employee` / `request_header`、站点名与二维码；`docs-nav-list` 改为四组；`registry` 补 slug 解析）；`src/i18n` locale-shape 通过；`i18n:sync` 两次无 diff。
- 浏览器未看（纯文档页，内容靠测试覆盖）。

## 遗留

- 周期限额（M4）与团队预算字段在员工自查示例里按 M4 / M14 契约写了 `quota_policy` / `budget_state`，M4 合并后若字段名不同需同步示例。
- 四种非中英语言为英文回填。
