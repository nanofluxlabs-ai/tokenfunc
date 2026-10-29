与 Anthropic Messages API 兼容的对话接口。Claude Code 等基于 Anthropic SDK 的工具使用它。调用 Claude 时，思考、提示词缓存等能力在这个接口上最完整。

```http
POST {{baseUrl}}/v1/messages
```

## 请求示例

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: {{apiKey}}" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "{{model}}",
    "max_tokens": 1024,
    "system": "你是一个乐于助人的助手。",
    "messages": [{"role": "user", "content": "你好！"}]
  }'
```

@tab Python

```python
import anthropic

# base_url 不带 /v1，SDK 会自动拼接 /v1/messages
client = anthropic.Anthropic(base_url="{{baseUrl}}", api_key="{{apiKey}}")

resp = client.messages.create(
    model="{{model}}",
    max_tokens=1024,
    system="你是一个乐于助人的助手。",
    messages=[{"role": "user", "content": "你好！"}],
)
print(resp.content[0].text)
```

@tab Node.js

```javascript
import Anthropic from '@anthropic-ai/sdk'

// baseURL 不带 /v1，SDK 会自动拼接 /v1/messages
const client = new Anthropic({ baseURL: '{{baseUrl}}', apiKey: '{{apiKey}}' })

const resp = await client.messages.create({
  model: '{{model}}',
  max_tokens: 1024,
  system: '你是一个乐于助人的助手。',
  messages: [{ role: 'user', content: '你好！' }],
})
console.log(resp.content[0].text)
```
:::

鉴权可以用 `x-api-key`，也可以用 `Authorization: Bearer`，见 [鉴权](/docs/api-authentication)。

## 请求参数

| 参数             | 类型           | 必填 | 说明                                                                          |
| ---------------- | -------------- | ---- | ----------------------------------------------------------------------------- |
| `model`          | string         | 是   | 模型名                                                                        |
| `messages`       | array          | 是   | 对话消息，`role` 为 `user` 或 `assistant`，`content` 可以是字符串或内容块数组 |
| `max_tokens`     | integer        | 是   | 最多生成的 Token 数                                                           |
| `system`         | string / array | 否   | 系统提示词；写成内容块数组时可以加 `cache_control`                            |
| `stream`         | boolean        | 否   | 是否流式返回                                                                  |
| `temperature`    | number         | 否   | 随机性，0～1                                                                  |
| `stop_sequences` | array          | 否   | 遇到这些字符串时停止                                                          |
| `tools`          | array          | 否   | 工具定义（`name`、`description`、`input_schema`）                             |
| `tool_choice`    | object         | 否   | 工具调用策略                                                                  |
| `thinking`       | object         | 否   | 开启思考，如 `{"type": "enabled", "budget_tokens": 8000}`                     |

内容块类型包括 `text`、`image`（图片，见 [图片理解](/docs/examples-vision)）、`tool_use`、`tool_result`。在内容块上添加 `cache_control` 可以使用 [提示词缓存](/docs/examples-prompt-caching)。

## 响应示例

```json
{
  "id": "msg_01ABC",
  "type": "message",
  "role": "assistant",
  "model": "{{model}}",
  "content": [{ "type": "text", "text": "你好！有什么可以帮你的吗？" }],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 18,
    "output_tokens": 12,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0
  }
}
```

| 字段          | 说明                                                                |
| ------------- | ------------------------------------------------------------------- |
| `content[]`   | 回答内容块，常见 `text`、`thinking`（思考）、`tool_use`（工具调用） |
| `stop_reason` | `end_turn` 正常结束，`max_tokens` 达到上限，`tool_use` 需要调用工具 |
| `usage`       | 输入、输出、缓存写入、缓存读取的 Token 数                           |

## 流式响应

`stream: true` 时按 Anthropic 的事件格式返回：`message_start` → `content_block_start` → 若干 `content_block_delta` → `content_block_stop` → `message_delta`（含最终用量）→ `message_stop`。官方 SDK 的 `stream` 方法可以直接处理。

## 与 Chat Completions 的区别

|              | Messages                   | Chat Completions                  |
| ------------ | -------------------------- | --------------------------------- |
| 地址         | `{{baseUrl}}/v1/messages`  | `{{baseUrl}}/v1/chat/completions` |
| 系统提示词   | 顶层 `system` 参数         | `messages` 里的 `system` 消息     |
| `max_tokens` | 必填                       | 可选                              |
| 提示词缓存   | 支持 `cache_control`       | Claude 不支持手动缓存             |
| 适合         | Claude、Claude Code 类工具 | 所有模型、OpenAI 生态工具         |
