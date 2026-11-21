# 渠道新建测试被后台探测 goroutine 拖垮（controller 包 panic）

- 日期：2026-11-21
- 分支：main
- PR：
- 关键 commit：

## 背景

发版 v2026.11.21.2 的 P1 预检里 `make test-db PKG='./controller/'` 连续三次 panic：`runtime error: invalid memory address or nil pointer dereference`，栈在 `runPostCreateChannelChecks` 起的 goroutine → `model.GetChannelById` → gorm `(*DB).Limit`，紧跟在 `TestAddChannelReturnsCreatedIDs` 之后。上午 v2026.11.21.1 的预检同一套用例是过的，纯时序问题。

## Bug 根因

`AddChannel` 成功后 `go runPostCreateChannelChecks(createdIds)` 异步探测新渠道（TokenFunc 二开）。`setupChannelCreateTest` 用独立 SQLite 初始化 `model.DB`，`t.Cleanup` 把它换回测试进程原来的 `nil`；探测 goroutine 不受测试生命周期约束，清理之后才跑到 `GetChannelById`，对 `nil` 的 `*gorm.DB` 调方法直接空指针，整个 controller 包失败。生产里 `model.DB` 不会为 nil，不受影响。

## 变更

- `controller/channel_health_probe.go`：`startPostCreateChannelChecks` 变量包一层 `go runPostCreateChannelChecks`，`channel.go` 的 `AddChannel` 改调它；行为不变。
- `controller/channel_create_test.go`、`controller/channel_task_plugin_bind_test.go`：两个走 `AddChannel` 的夹具都把 `startPostCreateChannelChecks` 桩成空函数，清理时还原。探测逻辑本身由 `channel_health_probe` 的用例覆盖。

## 验证

- `make test-db PKG='-count=2 ./controller/'`：两轮全部通过（修复前 `-count=1` 连续三次 panic）。
- `gofmt -l controller/` 无输出；`GOWORK=off go build ./...` 通过。

## 遗留

- 无。
