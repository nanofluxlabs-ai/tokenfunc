# 分组定价页：保存后新分组消失（多副本读到旧内存）、新增按钮挪到右上角

- 日期：2026-11-21
- 分支：main
- PR：
- 关键 commit：

## 背景

黑鹰在生产系统设置 › 分组定价新建渠道分组，保存成功后新分组从界面消失，刷新页面才出现。同页另两个体验问题一起处理：渠道分组超过 20 个时「新增渠道分组」在卡片顶部，滚到底部后要滚回去才能新增；用户分组配置可见渠道分组只能一个一个加。

## Bug 根因

生产 3 个副本。`PUT /api/tokenfunc/groups/settings` 在副本 A 事务写库并刷新 A 的内存，前端保存成功后立刻 `invalidateQueries` 重拉 `GET /api/option/` 与分组列表 / 定价接口，这些接口读的都是**本副本内存**（`controller.GetOptions` 遍历 `common.OptionMap`，`setting.ListChannelGroups` 等读注册表内存）。重拉请求被负载均衡打到副本 B，B 要等节点同步任务轮询（`service/node_sync.go` 每 3 秒）才 `LoadOptionsFromDatabase`，所以有 2/3 概率拿到旧值；`ratio-settings-card.tsx` 用旧值 `groupForm.reset`，编辑器按签名比对发现不同就重建行，新分组消失。单副本本地复现不出来。

## 变更

- `middleware/tokenfunc_fresh_options.go`：新增 `FreshOptions()`，进 handler 前调 `model.LoadOptionsFromDatabase()` 把本副本 option 内存刷成库里的值（与 3 秒同步任务同一个函数，option 表很小），失败只记日志退回内存值。
- 挂到分组定价页用到的 4 个管理员读接口：`GET /api/option/`（`router/api-router.go`）、`GET /api/tokenfunc/groups/channel`、`/user`、`/user/:key/pricing`（`router/tokenfunc-group-router.go`）。用户侧 `/groups/self` 等高频接口不挂。
- 前端 `channel-groups-editor.tsx`：去掉卡片内的「新增渠道分组」按钮，通过 `ref`（`ChannelGroupsEditorHandle.addRow`）暴露动作；`channel-groups-form.tsx` 在页面右上角操作区 portal 里渲染该按钮（outline），放「保存定价」左侧。

## 验证

- `make test-db PKG='-count=1 -v -run TestFreshOptions ./middleware/'`：`TestFreshOptionsServesOptionWrittenByAnotherReplica` 在真实 PG 上 PASS（先直写库模拟别的副本、本副本内存置旧值，不挂中间件读到旧值、挂中间件读到库值）；`./router/` 既有权限 scope 测试通过。
- `gofmt -l`、`GOWORK=off go build ./...`、`go vet ./middleware/ ./router/` 无输出。
- 前端 `bun run test -- src/features/system-settings/models/channel-groups` 34 通过（新增用例：新增按钮在操作区、位于保存左侧、点击追加一行）；`bun check -b` 无类型错误；oxlint 三个改动文件无 error / warning。

## 遗留

- 其它管理页保存后立刻重拉的接口理论上有同样的 3 秒窗口（如系统设置其它 Tab 的 `GET /api/option/` 已一并覆盖；渠道、用户列表读库不受影响）。
- 用户分组可见渠道分组批量多选见本条后续更新。
