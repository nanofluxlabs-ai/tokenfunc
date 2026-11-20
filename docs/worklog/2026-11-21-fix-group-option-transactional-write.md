# 分组 option 改为事务内锁行读改写，消掉多副本并发保存的覆盖窗口

- 日期：2026-11-21
- 分支：main
- PR：
- 关键 commit：

## 背景

`2026-11-21-fix-group-option-reload-before-writeback.md` 只是写前重读一次数据库，重读到写回之间仍有毫秒级窗口：两个副本同时保存不同用户分组，后提交的仍会用自己读到的整表覆盖先提交的改动。

## 变更

- `model/option.go`：删掉 `ReloadOptions`，新增 `MutateOptionsInTransaction(keys, mutate)`：事务里 `SELECT … FOR UPDATE`（`lockForUpdate`，SQLite 跳过）读给定 key，交给 `mutate` 算新值，校验后同一事务写回，提交后用读到和写入的值刷新本进程内存并 `BumpSyncTopic`。
- `service/tokenfunc_group.go`：新增 `mutateGroupOptions`，以数据库里的最新值覆盖内存快照（`applyStoredGroupOption`，多一个用户分组注册表的解析）再交给调用方修改；`SaveUserGroupPricing` / `SaveGroupSettings` / `CreateUserGroup` / `UpdateUserGroup` / `DeleteUserGroup` / `ReorderUserGroups` 全部改走它。`writeGroupOptions` 只剩启动迁移在用。

## Bug 根因

同 `2026-11-21-fix-group-option-reload-before-writeback.md`：6 个分组 option 都是整坨 JSON，写哪个用户分组都得写整坨；多副本各自以本地内存为准，并发保存互相覆盖。行锁让并发保存串行化，后来的事务等前一个提交后才读到并写回。

## 验证

- `make test-db PKG='-count=1 ./service/ ./setting/ ./model/ ./controller/'`：通过。
- 新增 `TestMutateGroupOptionsSerializesConcurrentSaves`：副本 A 在事务内停住，副本 B 的保存在 A 提交前不会完成（300ms 内未返回），A 提交后 B 读到 A 的改动并一并写回，数据库与内存里两边切片都在。
- 昨天的 `TestSaveUserGroupPricingReloadsOtherReplicaWritesBeforeWriteback` 保留，仍通过。
- 只在 PostgreSQL 上验证；`lockForUpdate` 是上游既有的跨方言 helper，本次没有新增方言分支。

## 遗留

- `service/tokenfunc_group_migrate.go` 的启动迁移仍整表写回，只在启动时跑一次，未改。
- 两个事务同时首次插入同一个尚不存在的 option 行会撞唯一键，其中一个报错需重试；生产所有分组 option 都已存在，不会触发。
