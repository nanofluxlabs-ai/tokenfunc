# 渠道分组改名后模型广场与令牌分组接口仍显示旧名

- 日期：2026-11-20
- 分支：main
- PR：
- 关键 commit：

## 背景

黑鹰在后台把渠道分组改名后，已分配给用户分组的渠道分组在客户侧仍显示旧名称，只有把它从用户分组里删掉再加回才会更新。

## 变更

- `service/group.go` `GetUserUsableGroups`：返回前用渠道分组注册表的名称覆盖每个 key 的描述，注册表没有登记的 key（用户分组自身的占位、`auto`）保持原样。
- `service/tokenfunc_group_test.go`：新增回归测试，夹具里 `UserUsableGroups` 与 `+:` 差异存的都是旧名，断言描述跟注册表走。

## Bug 根因

保存用户分组定价时，`applyUserGroupPricing` 把渠道分组当时的名称写进了上游 option `group_ratio_setting.group_special_usable_group` 的 `+:key` 值里（上游用这个值当分组描述）。之后改注册表名称不会回写这份快照。模型广场 `GET /api/pricing` 的 `usable_group` 和令牌分组接口 `GET /api/user/self/groups` 的 `desc` 都经 `GetUserUsableGroups` 读这份快照，所以显示旧名；管理员分组定价页经 `GetUserGroupPricing` 读注册表，所以那里是对的。删掉重加会重新写快照，看起来像"修好"。影响：所有改过名的渠道分组，自 PR #76 起。

## 验证

- `go test ./service -run 'TestGetUserUsableGroupsDescFollowsChannelGroupRegistry|TestGetUserGroupPricingMatchesBillingAndVisibilityLookups|TestListUserSelectableChannelGroupsFollowsRegistryOrder|TestResolve' -count=1` 通过。
- `gofmt -l` 无输出。

## 遗留

- 存量快照值不刷，读取侧已不依赖它；以后若清理 `group_special_usable_group` 的值字段可一并把 `+:` 值置空。
