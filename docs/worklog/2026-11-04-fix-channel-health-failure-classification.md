# 外部渠道健康失败分类：只有渠道真正不可用才影响调度

- 日期：2026-11-04
- 分支：main
- PR：
- 关键 commit：

## 背景

外部渠道健康机制把所有 5xx 一律计入推理失败：生产 #8 因「内容安全拦截（1301）」与「并发限流」两个被包成 500 的错误被暂停派发；而 401 密钥失效、余额耗尽这类永久故障反而不计入（只看 5xx）。接口探测把 404 / 429 也算失败，且推理探测会跳过接口探测失败的渠道，误判后没有纠正路径。黑鹰定的标准：只有渠道真正临时或永久不可用才暂停或禁用调度。

## 变更

- 新增 `service/channel_health_classify.go`：统一分类器，relay / 推理探测 / 接口探测共用。
  - 忽略（不影响调度）：内容安全拦截、限流 / 并发（关键词匹配，覆盖被包成 500 的情况）、429、网关自身错误（`new_api_error` 类型）、真实流量的其他 4xx。
  - 临时故障（计数，达阈值暂停）：传输失败、408、5xx；探测请求的 4xx（测试模型由运营控制，失败即渠道配置不可用）。
  - 永久故障（立即暂停）：渠道级错误（`channel:` 前缀）、401、命中上游「自动禁用关键词」（余额耗尽、账号被禁、无权限）。
  - 接口探测：5xx / 403 / 408 临时，401 永久，404 / 429 / 其他 4xx 忽略。
- `service/channel_health.go`：状态机接收分类结果；`immediate` 对失败也生效（永久故障一次即 failed）；relay 失败钩子改传 `*types.NewAPIError`。
- `service/relay_error.go`：按分类器决定是否写入，不再只看 5xx。
- `controller/channel_health_probe.go`：快探返回分类结果；慢探的本地错误（不支持测试、未定价等）按网关问题忽略并记系统日志；慢探不再跳过接口探测失败的渠道。
- 设置页快探 / 慢探说明文案按新规则改写（7 个语言文件 + `channel-health-section.tsx`）。

## 验证

- `service/channel_health_test.go` 新增表驱动用例 `TestClassifyChannelHealthFailure`（17 个 relay / 探测场景 + 接口探测状态码表）与 `TestChannelHealthPermanentFailurePausesImmediatelyAndIgnoredLeavesStateUntouched`；既有用例随签名调整。
- `controller/channel_test_internal_test.go` 的接口探测用例改为断言分类结果（404 忽略、401 永久、502 临时）。
- `make test-db PKG='-count=1 ./service/ ./model/ ./controller/ ./setting/...'` 全部 ok；`GOWORK=off go build ./...` 通过；前端改动文件 `oxfmt --check` 与 `tsc --noEmit` 通过。

## 遗留

- 忽略关键词目前写在代码里（`channelHealthIgnoredKeywords`），遇到新的上游错误格式需要改代码补充；如后续频繁变动再做成设置项。
