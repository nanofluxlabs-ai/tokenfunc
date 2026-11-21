# 创建 API 密钥时分组下拉的「自动分组」固定排第一

- 日期：2026-11-21
- 分支：main
- PR：
- 关键 commit：见本文件所在 commit

## 背景

创建 / 编辑 API 密钥抽屉里，分组下拉按后台渠道分组排序返回，「自动分组」混在中间。企业控制台的令牌表单早已把自动分组放在第一个，两处不一致。

## 变更

- 前端 `features/keys/components/api-keys-mutate-drawer.tsx`：分组选项先把 `auto` 提到最前，其余保持后台排序。
- 使用日志筛选等其他复用 `useSelfChannelGroupOptions` 的地方不受影响。

## Bug 根因

`/api/tokenfunc/groups/user` 按后台排序返回，`auto` 的位置取决于 order 配置，密钥抽屉直接照搬这个顺序，没有像企业令牌表单那样单独置顶。

## 验证

- `api-keys-mutate-drawer.test.tsx` 新增断言：fixture 里 auto 排在最后，下拉选项顺序为 `auto, default, vip`；去掉排序后该用例失败（`['default','vip','auto']`），恢复后通过。
- `bunx vitest run src/features/keys`：73 通过；`bun run typecheck` 通过。

## 遗留

无。
