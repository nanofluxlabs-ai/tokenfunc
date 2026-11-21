# OpenAI 渠道 gpt-6.2-sol / gpt-6.2-astra 仍发 max_tokens 被上游 400 拒绝

- 日期：2026-11-21
- 分支：main
- PR：
- 关键 commit：2348b04bd（cherry-pick 上游 3546e9382，#8375）

## 背景

生产环境 OpenAI 官方类型渠道测试 `gpt-6.2-sol` 连通性，上游返回 400：`Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.`。

## Bug 根因

`relaykit/dto/openai_request.go` 的 `GetOpenAIChatCapabilities` 是按型号显式维护的白名单（上游设计：新一代 GPT 不自动继承旧规则），只覆盖 gpt-5.x、gpt-6-sol/luna/astra、gpt-6.1-sol/terra，缺 gpt-6.2 系列。于是 `relay/channel/openai/adaptor.go` 不会把 `max_tokens` 改写成 `max_completion_tokens`，也不会按规则丢弃 temperature / top_p / logprobs。

影响范围：不只渠道测试，所有带 `max_tokens`（或采样参数）的真实 Chat Completions 请求打到 gpt-6.2-sol / gpt-6.2-astra 都会被 OpenAI 400 拒绝。

## 变更

- `git cherry-pick -x` 上游 `3546e9382`（new-api #8375，2026-11-18，尚未进入 rc tag；我方已同步到 rc.51）：
  - `relaykit/dto/openai_request.go`：新增 `isGPT62`（gpt-6.2-astra / gpt-6.2-sol 及其日期快照）并入白名单，规则同 gpt-6-astra、gpt-6.1-sol：使用 `max_completion_tokens` + developer 角色，不支持 temperature / top_p / logprobs。
  - `controller/channel_test_request_test.go`：补两条表驱动用例。
- 不自行扩写为 gpt-6.x 通配：保持与上游一致，避免下次合 rc 冲突。

## 验证

- `cd relaykit && GOWORK=off go build ./...` 通过；`GOWORK=off go test ./dto/` 通过。
- `go test ./controller/ -run 'TestChannelTestOpenAIChatCompatibility|TestOpenAIChatSamplingCompatibility'` 通过（含新增 gpt-6.2 两条用例）。
- `go test ./relay/channel/openai/` 通过；`go build ./...` 通过。
- 待发版后在生产渠道页对 `gpt-6.2-sol` 重新点「测试」确认 200。

## 遗留

- 下次同步 rc.52+ 时该提交与上游重合，commit 里的 `(cherry picked from commit 3546e9382...)` 行便于识别跳过。
