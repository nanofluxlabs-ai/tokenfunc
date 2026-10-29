与 OpenAI Responses API 兼容的接口，是 OpenAI 新一代的统一接口。Codex 等工具只支持这个接口。

```http
POST {{baseUrl}}/v1/responses
```

## 请求示例

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "instructions": "你是一个乐于助人的助手。",
    "input": "用一句话解释什么是 HTTP。"
  }'
```

@tab Python

```python
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")

resp = client.responses.create(
    model="{{model}}",
    instructions="你是一个乐于助人的助手。",
    input="用一句话解释什么是 HTTP。",
)
print(resp.output_text)
```

@tab Node.js

```javascript
import OpenAI from 'openai'

const client = new OpenAI({ baseURL: '{{baseUrl}}/v1', apiKey: '{{apiKey}}' })

const resp = await client.responses.create({
  model: '{{model}}',
  instructions: '你是一个乐于助人的助手。',
  input: '用一句话解释什么是 HTTP。',
})
console.log(resp.output_text)
```
:::

## 请求参数

| 参数                   | 类型           | 必填 | 说明                                                                                           |
| ---------------------- | -------------- | ---- | ---------------------------------------------------------------------------------------------- |
| `model`                | string         | 是   | 模型名，需支持 Responses 接口（见 [模型列表](/docs/api-models) 的 `supported_endpoint_types`） |
| `input`                | string / array | 是   | 输入，可以是一段文字，也可以是消息数组                                                         |
| `instructions`         | string         | 否   | 系统指令                                                                                       |
| `stream`               | boolean        | 否   | 是否流式返回                                                                                   |
| `max_output_tokens`    | integer        | 否   | 最多生成的 Token 数                                                                            |
| `temperature`          | number         | 否   | 随机性                                                                                         |
| `tools`                | array          | 否   | 工具定义                                                                                       |
| `reasoning`            | object         | 否   | 思考设置，如 `{"effort": "medium"}`                                                            |
| `previous_response_id` | string         | 否   | 接着上一次响应继续对话                                                                         |

## 响应示例

```json
{
  "id": "resp_abc123",
  "object": "response",
  "status": "completed",
  "model": "{{model}}",
  "output": [
    {
      "type": "message",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "HTTP 是浏览器和服务器之间传输网页等数据的通信协议。"
        }
      ]
    }
  ],
  "usage": { "input_tokens": 25, "output_tokens": 22, "total_tokens": 47 }
}
```

SDK 提供的 `output_text` 会把所有文字输出拼接好，直接读取即可。

## 流式输出

`stream: true` 时返回一系列事件，常用的有 `response.output_text.delta`（文字增量）和 `response.completed`（结束，含最终用量）。

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -N \
  -d '{"model": "{{model}}", "input": "写一首关于秋天的四行短诗", "stream": true}'
```

@tab Python

```python
stream = client.responses.create(model="{{model}}", input="写一首关于秋天的四行短诗", stream=True)
for event in stream:
    if event.type == "response.output_text.delta":
        print(event.delta, end="", flush=True)
```

@tab Node.js

```javascript
const stream = await client.responses.create({
  model: '{{model}}',
  input: '写一首关于秋天的四行短诗',
  stream: true,
})
for await (const event of stream) {
  if (event.type === 'response.output_text.delta')
    process.stdout.write(event.delta)
}
```
:::

## 调用示例

### 多轮对话

把完整的对话历史放进 `input` 数组即可，每条是 `role` + `content`：

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "input": [
      {"role": "user", "content": "Redis 和 Memcached 怎么选？"},
      {"role": "assistant", "content": "需要丰富数据结构或持久化选 Redis，只做简单缓存选 Memcached。"},
      {"role": "user", "content": "如果需要持久化呢？"}
    ]
  }'
```

@tab Python

```python
history = [{"role": "user", "content": "Redis 和 Memcached 怎么选？"}]
resp = client.responses.create(model="{{model}}", input=history)

history.append({"role": "assistant", "content": resp.output_text})
history.append({"role": "user", "content": "如果需要持久化呢？"})
resp = client.responses.create(model="{{model}}", input=history)
print(resp.output_text)
```
:::

### 思考强度

推理模型用 `reasoning.effort` 控制思考强度，取值 `minimal` / `low` / `medium` / `high`，越高越慢、输出 Token 越多：

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "input": "设计一个短链接服务的数据库表结构",
    "reasoning": {"effort": "low"}
  }'
```

@tab Python

```python
resp = client.responses.create(
    model="{{model}}",
    input="设计一个短链接服务的数据库表结构",
    reasoning={"effort": "low"},
)
print(resp.output_text)
```
:::

## 与 Chat Completions 怎么选

- 用 Codex 等只支持 Responses 的工具：只能用这个接口。
- 自己写代码：两者都可以。Chat Completions 支持的模型更多、生态更成熟，没有特别需求时优先用它。
