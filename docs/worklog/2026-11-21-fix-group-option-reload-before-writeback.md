# 分组定价保存前从数据库重读 option，避免多副本整表互相覆盖

- 日期：2026-11-21
- 分支：main
- PR：
- 关键 commit：

## 背景

2026-11-20 在生产改号池 label 时，连续两次 `PUT /api/tokenfunc/groups/settings` 落在不同副本上，第二次用它内存里的旧整表把第一次写进 `group_special_usable_group` 的快照覆盖掉了（`docs/tokenfunc/channel-groups.md` 5.10）。

## 变更

- `model/option.go`：新增 `ReloadOptions(keys ...string)`，只从数据库重读给定 key 并走 `updateOptionMap` 刷新本进程内存。
- `service/tokenfunc_group.go`：`SaveUserGroupPricing` / `SaveGroupSettings` / `CreateUserGroup` / `UpdateUserGroup` / `DeleteUserGroup` / `ReorderUserGroups` 写前先 `reloadGroupOptions()` 对齐 `GroupRatio` / `UserUsableGroups` / `GroupGroupRatio` / `group_special_usable_group` / 两张注册表。
- `service/tokenfunc_group_test.go`：新增回归测试，直接改库模拟另一副本的写入，断言本副本保存不覆盖它。

## Bug 根因

分组定价的几个 option 都是「读整表 → 改一个用户分组的切片 → 写整表」，读的是本副本内存。生产 TKE 三副本，option 靠 `SyncOptions` 每 `SYNC_FREQUENCY`（60s）从数据库对齐一次，期间本副本内存落后数据库；两次保存落在不同副本且间隔小于一个周期，后一次就把前一次的改动覆盖掉。后台连续保存两个用户分组即可触发；影响 PR #76 以来所有分组定价与用户分组的写操作。

## 验证

- `make test-db PKG=./service/`：全部通过（PostgreSQL 16，`TEST_POSTGRES_DSN` 由 makefile 注入）。
- 临时把 `ReloadOptions` 短路后，`TestSaveUserGroupPricingReloadsOtherReplicaWritesBeforeWriteback` 失败于"另一副本给 lonely 开放的 ent_pool 没被覆盖"，恢复后通过。
- `gofmt -l`、`go build ./...` 无输出。
- 只在 PostgreSQL 上验证：`ReloadOptions` 用 GORM map 条件生成 `IN` 查询，由方言负责列名引号，不含方言分支；未在 SQLite / MySQL 上跑过。

## 遗留

- 重读与写回之间仍有毫秒级窗口，两个管理员同时点保存仍可能互相覆盖；要彻底解决需改为只写本用户分组切片或数据库级行锁，本次不做。
- `service/tokenfunc_group_migrate.go` 的启动迁移同样整表写回，但只在启动时跑一次，未改。
