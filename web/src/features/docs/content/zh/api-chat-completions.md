与 OpenAI Chat Completions 接口兼容的对话接口，是最通用的调用方式。Claude、Gemini、DeepSeek 等模型也可以用这个格式调用，本站会自动转换。

```http
POST {{baseUrl}}/v1/chat/completions
```

## 请求示例

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "messages": [
      {"role": "system", "content": "你是一个乐于助人的助手。"},
      {"role": "user", "content": "你好！"}
    ]
  }'
```

@tab Python

```python
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")

resp = client.chat.completions.create(
    model="{{model}}",
    messages=[
        {"role": "system", "content": "你是一个乐于助人的助手。"},
        {"role": "user", "content": "你好！"},
    ],
)
print(resp.choices[0].message.content)
```

@tab Node.js

```javascript
import OpenAI from 'openai'

const client = new OpenAI({ baseURL: '{{baseUrl}}/v1', apiKey: '{{apiKey}}' })

const resp = await client.chat.completions.create({
  model: '{{model}}',
  messages: [
    { role: 'system', content: '你是一个乐于助人的助手。' },
    { role: 'user', content: '你好！' },
  ],
})
console.log(resp.choices[0].message.content)
```
:::

## 请求参数

| 参数                  | 类型            | 必填 | 说明                                                                                                                |
| --------------------- | --------------- | ---- | ------------------------------------------------------------------------------------------------------------------- |
| `model`               | string          | 是   | 模型名，见 [模型列表](/docs/api-models)                                                                             |
| `messages`            | array           | 是   | 对话消息，每条包含 `role`（`system` / `user` / `assistant` / `tool`）和 `content`                                   |
| `stream`              | boolean         | 否   | 为 `true` 时以 SSE 流式返回，默认 `false`                                                                           |
| `stream_options`      | object          | 否   | 流式选项。本站默认在结尾返回用量，传 `{"include_usage": false}` 可关闭                                              |
| `max_tokens`          | integer         | 否   | 最多生成的 Token 数。部分新模型使用 `max_completion_tokens`                                                         |
| `temperature`         | number          | 否   | 随机性，0～2                                                                                                        |
| `top_p`               | number          | 否   | 核采样，0～1，一般与 `temperature` 二选一调整                                                                       |
| `stop`                | string / array  | 否   | 遇到这些字符串时停止生成                                                                                            |
| `n`                   | integer         | 否   | 生成几个候选回复                                                                                                    |
| `tools`               | array           | 否   | 可供模型调用的工具，见 [工具调用](/docs/examples-tools)                                                             |
| `tool_choice`         | string / object | 否   | `auto` / `none` / `required` 或指定工具                                                                             |
| `parallel_tool_calls` | boolean         | 否   | 是否允许一次调用多个工具                                                                                            |
| `response_format`     | object          | 否   | 结构化输出，见 [结构化输出](/docs/examples-structured-output)                                                       |
| `reasoning_effort`    | string          | 否   | 思考强度：`none` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max`，见 [思考模型](/docs/examples-reasoning) |
| `user`                | string          | 否   | 你这边的终端用户标识，便于排查                                                                                      |

`content` 除了字符串，也可以是数组，用于混排文字和图片，见 [图片理解](/docs/examples-vision)。

## 响应示例

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1760000000,
  "model": "{{model}}",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "你好！有什么可以帮你的吗？"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 9,
    "total_tokens": 29,
    "prompt_tokens_details": { "cached_tokens": 0 }
  }
}
```

| 字段                                        | 说明                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| `choices[].message.content`                 | 模型的回答                                                                        |
| `choices[].message.reasoning_content`       | 思考内容（仅部分思考模型返回）                                                    |
| `choices[].message.tool_calls`              | 模型要调用的工具                                                                  |
| `choices[].finish_reason`                   | 结束原因：`stop` 正常结束，`length` 达到长度上限被截断，`tool_calls` 需要调用工具 |
| `usage.prompt_tokens` / `completion_tokens` | 输入 / 输出 Token 数，计费依据                                                    |
| `usage.prompt_tokens_details.cached_tokens` | 输入中命中缓存的 Token 数                                                         |

## 流式响应

`stream: true` 时返回 `text/event-stream`，每行一个数据块，增量内容在 `choices[0].delta` 中，最后以 `data: [DONE]` 结束：

```text
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"你"}}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"好！"}}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[],"usage":{"prompt_tokens":20,"completion_tokens":9,"total_tokens":29}}

data: [DONE]
```

完整的读取代码见 [对话与流式输出](/docs/examples-chat)。
