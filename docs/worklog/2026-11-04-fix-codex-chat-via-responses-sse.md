# chat→responses 转换走 Codex 渠道时识别不出 SSE，报 invalid character 'e'

- 日期：2026-11-04
- 分支：main
- PR：
- 关键 commit：

## 背景

生产开启 `global.chat_completions_to_responses_policy`（channel_types=[57]）后，游乐场对 gpt-6-luna 的 chat 请求经转换走 Codex 渠道 #1，报 `status_code=500, invalid character 'e' looking for beginning of value`；非流式请求则被上游拒绝 `Stream must be set to true`。原生 `/v1/responses` 流式正常。

## 根因

在生产机复刻网关对 `chatgpt.com/backend-api/codex/responses` 的请求，确认 Codex 后端返回 SSE 时**不带 `Content-Type`**（只有 `Transfer-Encoding: chunked`）。`relay/chat_completions_via_responses.go` 的 `relayResponsesRequest` 只凭 `Content-Type: text/event-stream` 判断上游是否流式，判不出来就走非流式处理器把整个事件流当 JSON 解析，首字符 `event:` 的 `e` 即报错。原生 Responses 路径按请求的 `stream` 选处理器，所以不受影响。Codex 后端另外只接受 `stream=true`。

## 变更

- `relay/chat_completions_via_responses.go`
  - 上游 200 且响应头判不出 SSE 时，预读 body 首字节（`event:` / `data:`）再判一次，读过的字节原样放回（`sniffResponsesEventStream`）。
  - 渠道类型为 Codex 时强制上游 `stream=true`；非流式客户端由既有的 `OaiResponsesToChatBufferedStreamHandler` 攒成一个 JSON 返回。
- `relay/chat_completions_via_responses_test.go`：新增端到端用例，模拟不带 Content-Type 的 SSE 上游，覆盖流式客户端（收到 chat chunk）与非流式客户端（上游收到 stream=true、客户端收到单个 JSON）。

渠道参数覆盖解决不了这个问题（覆盖只改请求，故障在响应识别），所以必须改代码。

## 验证

- 新用例在撤掉修复后复现线上同样的 `bad_response_body: invalid character 'e'`，恢复后通过。
- `GOWORK=off go build ./...` 通过；`go test ./relay/ ./relay/channel/openai/ ./relay/channel/codex/ ./relay/helper/` 全部 ok。
- 待发版后用生产游乐场与 `/v1/chat/completions`（stream true / false）对 gpt-6-luna 复测。

## 遗留

- `relay/channel/codex/adaptor.go` 剥离 `top_p` 的改动由另一会话完成，与本次一起发版。
- 原生 `/v1/responses` 非流式走 Codex 仍会被上游拒绝（`Stream must be set to true`），本次只处理 chat→responses 转换路径。
