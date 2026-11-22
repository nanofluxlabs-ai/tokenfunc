# 推广人管理列表：分成比例不显示、推广人列重复显示邮箱

- 日期：2026-11-22
- 分支：main
- PR：
- 关键 commit：

## 背景

用户反馈：推广人管理列表的「分成比例」一直显示「—」，编辑设定后仍不显示；「推广人」列同一邮箱出现 3 次。

## 变更

- 后端：`service.NewPromoterProfile` 统一由推广人记录生成档案，管理端列表（`controller/promoter.go`）与档案接口（`GetPromoterProfile`）共用。
- 测试：`controller/promoter_test.go` 测试路由注册列表接口，断言编辑后列表回显 `share_rate`。
- 前端 `features/promoters/components/promoters-columns.tsx`：推广人列只展示 用户名 #ID + 邮箱，去掉显示名；邮箱与用户名相同时不重复显示。
- 前端 `features/promoter-center/components/users-columns.tsx`：推广中心「用户消耗」用户列同样只展示 用户名 #ID + 邮箱（邮箱仍仅管理员视角可见）；推广人本人视角因此只显示用户名，不再显示显示名。

## Bug 根因

- 分成比例：`879cb3dd3` 新增 `ShareRate` 时，`PromoterProfile` 在两处手写拼装，只改了档案接口，管理端列表 `AdminListPromoters` 漏拼该字段，列表恒返回 0，前端按 0 显示「—」。数据库写入一直正常。
- 推广人列：第一行用户名、第二行「显示名 · 邮箱」；邮箱注册的用户三者都是邮箱，于是显示 3 次。

## 验证

- `make test-db PKG='-count=1 -run TestPromoter ./controller/ ./service/'`：ok；反向验证：回退修复后断言 expected 12.5 / actual 0 失败。
- `bun check -b`、oxlint、oxfmt 通过；`vitest run src/features/promoters` 5 个文件 11 个用例通过。
- 本地接口：`/api/admin/promoter/promoters` 返回 `share_rate: 12`；浏览器推广人管理页分成比例显示 12%，推广人列为 用户名 #ID + 邮箱。
- `vitest run src/features/promoter-center src/features/promoters` 26 个用例通过；浏览器推广中心「用户消耗」用户列为 用户名 #ID + 邮箱。

## 遗留

无
