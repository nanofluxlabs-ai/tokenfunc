# 推广人「管理绑定」抽屉按 tokensolo 版式重排

- 日期：2026-10-25
- 分支：fix/promoter-bindings-sheet
- PR：
- 关键 commit：

## 背景

黑鹰验证 #33 后提出的细节调整：添加用户区要像 tokensolo 一样一行放下「搜索框 / 添加 / 批量绑定」，批量绑定默认收起；要在搜索框下用浅色字说明哪些用户不可绑定；名下用户表要有分组、操作人、本月消耗三列；列多时表格要能横向滚动而不是把内容挤扁。

## 变更

- 前端 `features/promoters/components/bindings-sheet.tsx`：
  - 添加区改为一行：`UserPicker`（占满剩余宽度）+「添加」+「批量绑定 ▾」；批量区用 `Collapsible` 包住，默认收起，按钮带 `aria-expanded`。
  - 两个入口共用一个「包含历史消耗」勾选框，放在提示行下面。
  - 提示行：「不可绑定：自己、管理员、已归属其他推广人的用户」，`text-muted-foreground text-xs`。tokensolo 原文里的「员工账号（请绑定其老板）」没有照搬：tokenfunc 企业员工没有登录账号（`EnterpriseEmployee` 不对应 `users` 行），搜索不到也绑不上，消耗天然落在主账号。
  - 名下用户表列顺序：用户 / 分组（`StatusBadge`）/ 来源 + 口径 / 绑定时间 / 操作人 / 本月消耗 / 解绑；表格加 `min-w-[760px]`，由 `Table` 外层的 `overflow-x-auto` 容器横向滚动。
- i18n：新增 3 个 key（提示语、「Month consumption」、搜索框占位），7 种语言手写；「本月消耗」不复用上游的 `This month`（中文译文是「本月获得」）。
- 测试 `__tests__/bindings-sheet.test.tsx`：新增「批量区默认收起、点按钮展开」「列头含分组 / 操作人 / 本月消耗且表格有保底宽度」；原批量用例改为先展开再输入，勾选框改按 role 定位。

## 验证

- `bunx vitest run src/features/promoters`：4 文件 10 用例通过。
- `bun run typecheck` 通过；`bunx oxlint src/features/promoters` 0 error；`bun run i18n:sync` 两次后 `_extras` 为空、上游 locale 无 diff。
- 本地 `make dev` 用管理员密钥调 `GET /api/admin/promoter/promoters/:id/bindings`，确认后端已下发 `group` / `bound_by_username` / `net_quota`（本次只改前端呈现）。

## 遗留

无。
