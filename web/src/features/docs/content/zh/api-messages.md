与 Anthropic Messages API 兼容的对话接口。Claude Code 等基于 Anthropic SDK 的工具使用它。调用 Claude 时，思考、提示词缓存等能力在这个接口上最完整。

:::endpoint{method="POST" path="/v1/messages" operation="messages"}
:::

:::request-example
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
# pip install anthropic
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
// npm install @anthropic-ai/sdk
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

## 请求头

:::params
| 请求头              | 必填 | 说明                                                                                              |
| ------------------- | ---- | ------------------------------------------------------------------------------------------------- |
| `x-api-key`         | 是   | 本站密钥，也可以改用 `Authorization: Bearer`                                                      |
| `anthropic-version` | 否   | API 版本，不传时本站按 `2023-06-01` 转发。`2026-10-21` 起不再接受 `temperature`、`top_p`、`top_k` |
| `anthropic-beta`    | 否   | 开启测试功能，原样透传给上游，多个值用逗号分隔                                                    |
:::

## 请求参数

:::schema{operation="messages-create" part="request"}
:::

内容块类型包括 `text`、`image`、`document`（PDF 等文档）、`tool_use`、`tool_result`；开启思考后，工具调用的多轮对话要把返回的 `thinking` 块原样带回。在内容块上添加 `cache_control` 可以使用提示词缓存。

不要传 `temperature`、`top_p`、`top_k`：Claude 4.7 及之后的模型传非默认值会返回 400，`anthropic-version: 2026-10-21` 起任何模型带这三个参数都会返回 400。

:::response-example
@tab 200

```json
{
  "id": "msg_01ABC",
  "type": "message",
  "role": "assistant",
  "model": "{{model}}",
  "content": [{ "type": "text", "text": "你好！有什么可以帮你的吗？" }],
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 18,
    "output_tokens": 12,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0,
    "cache_creation": {
      "ephemeral_5m_input_tokens": 0,
      "ephemeral_1h_input_tokens": 0
    },
    "service_tier": "standard"
  }
}
```
:::

## 响应字段

:::schema{operation="messages-create" part="response"}
:::

`stop_reason` 的取值：

| 取值                            | 含义                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `end_turn`                      | 正常结束                                                                                  |
| `max_tokens`                    | 达到 `max_tokens` 或模型上限，回答被截断                                                  |
| `stop_sequence`                 | 遇到了 `stop_sequences` 里的字符串                                                        |
| `tool_use`                      | 需要调用工具                                                                              |
| `pause_turn`                    | 长时间运行的一轮被暂停。把这次返回的内容原样作为 `assistant` 消息再请求一次，模型会接着做 |
| `refusal`                       | 模型拒绝回答，原因见 `stop_details`                                                       |
| `model_context_window_exceeded` | 超出了模型的上下文窗口                                                                    |

## 流式输出

`stream: true` 时按 Anthropic 的事件格式返回：`message_start` → `content_block_start` → 若干 `content_block_delta` → `content_block_stop` → `message_delta`（含最终用量）→ `message_stop`。

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: {{apiKey}}" \
  -H "anthropic-version: 2023-06-01" \
  -N \
  -d '{
    "model": "{{model}}",
    "max_tokens": 1024,
    "stream": true,
    "messages": [{"role": "user", "content": "写一首关于秋天的四行短诗"}]
  }'
```

@tab Python

```python
with client.messages.stream(
    model="{{model}}",
    max_tokens=1024,
    messages=[{"role": "user", "content": "写一首关于秋天的四行短诗"}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
```

@tab Node.js

```javascript
const stream = client.messages.stream({
  model: '{{model}}',
  max_tokens: 1024,
  messages: [{ role: 'user', content: '写一首关于秋天的四行短诗' }],
})
stream.on('text', (text) => process.stdout.write(text))
await stream.finalMessage()
```
:::

## 调用示例

### 思考

传 `"thinking": {"type": "adaptive"}` 开启思考，由模型根据问题决定想多深；想得多还是少用 `output_config.effort` 调，取值 `low` / `medium` / `high` / `xhigh` / `max`，不传按模型默认。返回的 `content` 里先是 `thinking` 块，再是 `text` 块。Claude 5 及之后的模型默认不返回思考原文，要看到需加 `"display": "summarized"`。

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: {{apiKey}}" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "{{model}}",
    "max_tokens": 16000,
    "thinking": {"type": "adaptive", "display": "summarized"},
    "output_config": {"effort": "high"},
    "messages": [{"role": "user", "content": "证明根号 2 是无理数"}]
  }'
```

@tab Python

```python
resp = client.messages.create(
    model="{{model}}",
    max_tokens=16000,
    thinking={"type": "adaptive", "display": "summarized"},
    output_config={"effort": "high"},
    messages=[{"role": "user", "content": "证明根号 2 是无理数"}],
)
for block in resp.content:
    if block.type == "thinking":
        print("思考过程：", block.thinking)
    elif block.type == "text":
        print("最终回答：", block.text)
```
:::

旧写法 `{"type": "enabled", "budget_tokens": 8000}` 只适用于 Claude 4.6 及更早的模型（4.6 上已弃用），Claude 4.7 及之后的模型会返回 400；反过来，Claude 4.5 及更早的模型不支持 `adaptive`，只能用旧写法，`budget_tokens` 至少 1024 且要小于 `max_tokens`。

只能填模型名的工具，也可以在模型名后加 `-thinking` 开启思考。

### 图片理解

图片使用 `image` 内容块，支持 Base64 和图片链接两种来源：

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
    "messages": [{
      "role": "user",
      "content": [
        {"type": "image", "source": {"type": "url", "url": "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png"}},
        {"type": "text", "text": "这张图里有什么？"}
      ]
    }]
  }'
```

@tab Python

```python
import base64

with open("receipt.jpg", "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

resp = client.messages.create(
    model="{{model}}",
    max_tokens=1024,
    messages=[{
        "role": "user",
        "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}},
            {"type": "text", "text": "提取这张小票上的商家名称、日期和总金额"},
        ],
    }],
)
print(resp.content[0].text)
```
:::

### 工具调用

工具定义使用 `name`、`description`、`input_schema`。模型需要调用工具时返回 `tool_use` 块（`stop_reason` 为 `tool_use`），你执行后用 `tool_result` 块把结果发回。

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
    "tools": [{
      "name": "get_weather",
      "description": "查询指定城市当前的天气",
      "input_schema": {
        "type": "object",
        "properties": {"city": {"type": "string"}},
        "required": ["city"]
      }
    }],
    "messages": [{"role": "user", "content": "北京今天天气怎么样？"}]
  }'
```

@tab Python

```python
tools = [{
    "name": "get_weather",
    "description": "查询指定城市当前的天气",
    "input_schema": {
        "type": "object",
        "properties": {"city": {"type": "string"}},
        "required": ["city"],
    },
}]
messages = [{"role": "user", "content": "北京今天天气怎么样？"}]

resp = client.messages.create(model="{{model}}", max_tokens=1024, tools=tools, messages=messages)
messages.append({"role": "assistant", "content": resp.content})

results = []
for block in resp.content:
    if block.type == "tool_use":
        weather = {"city": block.input["city"], "weather": "晴", "temperature": 23}
        results.append({"type": "tool_result", "tool_use_id": block.id, "content": str(weather)})
messages.append({"role": "user", "content": results})

final = client.messages.create(model="{{model}}", max_tokens=1024, tools=tools, messages=messages)
print(final.content[0].text)
```
:::

### 提示词缓存

很多请求的开头是一样的：同一份系统提示词、同一份长文档、同一组工具定义。在希望缓存到的那一块内容上加 `"cache_control": {"type": "ephemeral"}`，从开头到这一块的全部内容都会被缓存，下次命中时按更低的缓存价计费，首字也更快。

不想自己挑位置时，把 `"cache_control": {"type": "ephemeral"}` 写在请求顶层，会自动缓存到最后一个可缓存的内容块，多轮对话里随消息增长自动后移。

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
    "system": [
      {"type": "text", "text": "根据员工手册回答问题。"},
      {"type": "text", "text": "<很长的员工手册内容>", "cache_control": {"type": "ephemeral"}}
    ],
    "messages": [{"role": "user", "content": "年假有几天？"}]
  }'
```

@tab Python

```python
long_doc = open("handbook.md", encoding="utf-8").read()

resp = client.messages.create(
    model="{{model}}",
    max_tokens=1024,
    system=[
        {"type": "text", "text": "根据员工手册回答问题。"},
        {"type": "text", "text": long_doc, "cache_control": {"type": "ephemeral"}},
    ],
    messages=[{"role": "user", "content": "年假有几天？"}],
)
print(resp.usage)
```
:::

返回的 `usage` 中：

| 字段                          | 含义                                                     |
| ----------------------------- | -------------------------------------------------------- |
| `cache_creation_input_tokens` | 本次写入缓存的 Token，按缓存写入价计费（比普通输入略贵） |
| `cache_read_input_tokens`     | 本次命中缓存的 Token，按缓存读取价计费（远低于普通输入） |
| `input_tokens`                | 未缓存部分的普通输入                                     |
| `cache_creation`              | 缓存写入按 5 分钟 / 1 小时拆分的 Token 数                |

- 缓存按前缀匹配，从第一个字开始必须完全一样才能命中。把固定内容放在最前面，时间戳、用户名等变化的内容放到最后的用户消息里。
- 前缀太短不会被缓存，门槛随模型在 512～4096 个 Token 之间，不够时不报错，只是不缓存。
- 默认缓存约 5 分钟，每次命中会重新计时；需要更久时写 `"cache_control": {"type": "ephemeral", "ttl": "1h"}`，写入价更高。
- 各模型的缓存读写价格见 [模型广场](/pricing)，每次请求的缓存读写 Token 数可在控制台「使用日志」中查看。

:::warning
`cache_control` 只在本接口上生效。用 Chat Completions 格式调用 Claude 时，消息里的 `cache_control` 不会传给 Claude。
:::

## 与 Chat Completions 的区别

|              | Messages                   | Chat Completions                  |
| ------------ | -------------------------- | --------------------------------- |
| 地址         | `{{baseUrl}}/v1/messages`  | `{{baseUrl}}/v1/chat/completions` |
| 系统提示词   | 顶层 `system` 参数         | `messages` 里的 `system` 消息     |
| `max_tokens` | 必填                       | 可选                              |
| 提示词缓存   | 支持 `cache_control`       | Claude 不支持手动缓存             |
| 适合         | Claude、Claude Code 类工具 | 所有模型、OpenAI 生态工具         |
