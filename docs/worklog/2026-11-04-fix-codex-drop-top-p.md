# Codex 渠道剥离 top_p，修复 chat→responses 转换后上游报 Unsupported parameter

- 日期：2026-11-04
- 分支：main
- PR：
- 关键 commit：

## 背景

生产开启 `global.chat_completions_to_responses_policy`（channel_types=[57]）后，游乐场对 gpt-6-luna 的 chat 请求经转换走 Codex 渠道，上游报 `400 Unsupported parameter: top_p`。Codex 适配器原本只剥离 temperature / frequency_penalty / presence_penalty，漏了 top_p；游乐场默认带 top_p=1。

## 变更

- `relay/channel/codex/adaptor.go`：`ConvertOpenAIResponsesRequest` 一并置空 `TopP`。
- `relay/channel/codex/adaptor_test.go`：既有用例补 top_p 断言。

## 验证

- `go test ./relay/channel/codex/` 通过；`GOWORK=off go build ./...` 通过。
- 生产临时用渠道参数覆盖 `delete top_p` 验证过该参数即是上游拒绝的原因（随后暴露的 SSE 识别问题见 2026-11-04-fix-codex-chat-via-responses-sse.md）。

## 遗留

无
