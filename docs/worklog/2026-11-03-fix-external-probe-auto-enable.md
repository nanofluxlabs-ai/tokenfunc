# 推理探测成功时恢复被自动禁用的外部渠道

- 日期：2026-11-03
- 分支：main
- PR：
- 关键 commit：

## 背景

上游「自动启用」只在定时测试（`testChannelForHealthCheck`）里执行；推理探测开启后定时测试跳过外部渠道。若开启上游「自动禁用」，外部渠道被硬禁用（status=自动禁用）后：定时测试不再测它，推理探测成功也只解除软暂停、不改 status，渠道只能人工启用。

## 变更

- `controller/channel_health_probe.go`：`probeChannelInference` 推理成功且 `ShouldEnableChannel`（自动启用开关开启、status 为自动禁用）时调用 `service.EnableChannel`，语义与上游定时测试一致；接口探测只证明接口可达，不据此启用。
- `controller/channel_test_internal_test.go`：补端到端用例，模拟上游返回正常推理结果，覆盖「自动启用关闭时只记健康态不改 status」与「开启时恢复为启用」。

## 验证

- 新用例在去掉启用逻辑时失败（status 仍为 3），恢复后通过。
- `make test-db PKG='-count=1 ./controller/ ./service/ ./model/'` 全部 ok；`GOWORK=off go build ./...` 通过。

## 遗留

无
