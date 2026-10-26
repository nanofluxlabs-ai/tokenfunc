# 企业计费抽屉移除「资金流水」，删除管理员企业流水接口

- 日期：2026-10-26
- 分支：main（直接提交）
- PR：
- 关键 commit：见本 worklog 所在提交

## 背景

黑鹰认为管理员企业计费抽屉里的「资金流水」价值不大，要求移除，并连同管理员接口一起删。流水只记录充值 / 账单收款 / 人工调账三类低频手工事件，抽屉里只列最近 20 条、不可筛选翻页；这三类在订单中心、财务中心账单、审计日志里都能查到。

## 变更

- 后端：删除 `GET /api/admin/enterprise/enterprises/:id/ledger`（路由、`AdminListEnterpriseLedger`、`access_token_routes_enterprise.go` 作用域登记）；`writeEnterpriseLedger` 只剩企业侧一个调用方，内联进 `ListEnterpriseLedgerSelf`。企业侧 `/api/enterprise/ledger` 与 `ent_ledger` 写入不变。
- 前端：`enterprise-billing-drawer` 删除流水区块与查询，`enterprises/api.ts` 删除 `listEnterpriseLedger`；`LedgerTable` 仍由企业控制台对账页使用；七个 tokenfunc locale 删除已无引用的 `Ledger` 键。
- 设计文档：管理员接口清单与抽屉组件描述同步。

## 验证

- `go build ./...`、`go vet ./controller/ ./router/ ./middleware/`、`gofmt -l` 无输出；`make test-db PKG="-count=1 ./controller/... ./router/... ./middleware/..."` 全 ok（含路由与作用域登记一致性检查）。
- `bun run typecheck` 无错误；`bunx oxlint src/features/enterprises` 无 error；`bunx vitest run src/features/enterprises src/features/enterprise-console src/features/users` 37 文件 198 条通过。

## 遗留

- 管理员侧不再有「按企业看资金流水」的视图，客户询问余额变动时需到审计日志按时间查；如频繁出现，再在财务中心加按企业筛选、可翻页的流水页。
