# 外部渠道 relay 成功不清零失败计数，导致偶发 5xx 累积暂停派发

- 日期：2026-11-03
- 分支：main
- PR：
- 关键 commit：

## 背景

生产渠道 #8（Sub2API GLM）22:08 与 22:18 各收到一次上游 500（内容安全 1301、并发限流），中间有 58 次成功请求，计数却没清零，第二次 500 即触发暂停派发；生产未开快探 / 慢探，暂停后无自动恢复路径，直到手动测试才恢复。

## 根因

`controller/relay.go` 的 `getChannel` 在首次尝试（`info.ChannelMeta == nil`，分发中间件已选好渠道）时返回只有 Id / Type / Name 的精简 Channel，`IsExternal` 为 nil。`RecordExternalChannelRelaySuccess` 用它判断「非外部渠道」直接返回；而失败路径 `ProcessChannelError` 走 `CacheGetChannel` 拿完整渠道，照常计数。生产 RetryTimes=0，所有请求都是首次尝试，于是「成功清零」从未执行：任意两次 5xx（无论相隔多久）都会暂停。

另外原先「需要清零的渠道」只记在进程内 `sync.Map`，重启或多实例下会漏掉库里已有的失败计数。

## 变更

- `service/channel_health.go`：新增 `resolveExternalChannel`，channel 不带 `IsExternal` 时按 Id 从渠道缓存取完整渠道；relay 成功 / 失败钩子都走它。去掉进程内 `externalInferenceFailing`。
- `model/channel_health_state.go`：新增推理待清除集合 `channelInferencePending`（推理失败计数 > 0 或 failed），与暂停集合一起在 `SaveChannelHealthState` 时同步、在 `ReloadChannelHealthStates` 时从库重建；relay 成功热路径只查内存集合，命中才写库。
- `service/channel_health_test.go`：补「失败（完整渠道）→ 成功（精简渠道）→ 失败」不暂停、以及从库重建后成功仍能清零的回归用例。

## 验证

- 新用例在旧代码上失败（计数 2、已暂停，与生产一致），修复后通过。
- `make test-db PKG='-count=1 ./service/ ./model/ ./controller/'` 全部 ok；`GOWORK=off go build ./...` 通过。

## 遗留

- 生产未开启外部渠道慢探：暂停后仍只能靠手动测试恢复，需在系统设置里开启慢探（运维配置，不在本次代码改动内）。
- 上游把内容安全拦截、并发限流包成 500 时仍会计入健康失败，待单独评估错误分类（P1）。
