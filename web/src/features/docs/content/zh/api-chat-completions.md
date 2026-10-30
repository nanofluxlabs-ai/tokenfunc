与 OpenAI Chat Completions 接口兼容的对话接口，是最通用的调用方式。本站的所有文本模型（包括 Claude、Gemini、DeepSeek）都可以用这个格式调用，换个 `model` 即可，本站会自动转换。

:::endpoint{method="POST" path="/v1/chat/completions" operation="chat-completions"}
:::

:::request-example
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
# pip install openai
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
// npm install openai
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

:::schema{operation="chat-completions-create" part="request"}
:::

`content` 除了字符串，也可以是数组，用于混排文字和图片，见下方 [图片理解](#图片理解)。

:::response-example
@tab 200

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
:::

## 响应字段

:::schema{operation="chat-completions-create" part="response"}
:::

## 流式输出

设置 `stream: true` 后，回复会一小段一小段地返回，用户能立刻看到第一个字，长回复也不容易超时。聊天界面基本都应该用流式。

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -N \
  -d '{
    "model": "{{model}}",
    "messages": [{"role": "user", "content": "写一首关于秋天的四行短诗"}],
    "stream": true
  }'
```

@tab Python

```python
stream = client.chat.completions.create(
    model="{{model}}",
    messages=[{"role": "user", "content": "写一首关于秋天的四行短诗"}],
    stream=True,
)
for chunk in stream:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
    if chunk.usage:  # 最后一个数据块携带本次用量
        print(f"\n\n输入 {chunk.usage.prompt_tokens} / 输出 {chunk.usage.completion_tokens} Token")
```

@tab Node.js

```javascript
const stream = await client.chat.completions.create({
  model: '{{model}}',
  messages: [{ role: 'user', content: '写一首关于秋天的四行短诗' }],
  stream: true,
})
for await (const chunk of stream) {
  const text = chunk.choices[0]?.delta?.content
  if (text) process.stdout.write(text)
  if (chunk.usage) {
    // 最后一个数据块携带本次用量
    console.log(
      `\n\n输入 ${chunk.usage.prompt_tokens} / 输出 ${chunk.usage.completion_tokens} Token`
    )
  }
}
```
:::

返回的是 `text/event-stream`，每行一个 `chat.completion.chunk`，增量内容在 `choices[0].delta` 中，最后以 `data: [DONE]` 结束：

```text
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"你"}}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"好！"}}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[],"usage":{"prompt_tokens":20,"completion_tokens":9,"total_tokens":29}}

data: [DONE]
```

本站默认在结尾附带一个包含 `usage` 的数据块用于统计 Token；不需要时传 `"stream_options": {"include_usage": false}`。

## 调用示例

### 多轮对话

模型本身不记得上一次请求，**每次都要把完整的对话历史发过去**：`system` 设定角色和规则，`user` 是用户说的话，`assistant` 是模型之前的回复。

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "messages": [
      {"role": "system", "content": "你是一名简洁的技术顾问，回答不超过三句话。"},
      {"role": "user", "content": "Redis 和 Memcached 怎么选？"},
      {"role": "assistant", "content": "需要丰富数据结构或持久化选 Redis，只做简单缓存选 Memcached。"},
      {"role": "user", "content": "如果需要持久化呢？"}
    ]
  }'
```

@tab Python

```python
messages = [
    {"role": "system", "content": "你是一名简洁的技术顾问，回答不超过三句话。"},
    {"role": "user", "content": "Redis 和 Memcached 怎么选？"},
]
resp = client.chat.completions.create(model="{{model}}", messages=messages)
answer = resp.choices[0].message.content

# 追问时，把上一轮回复加进历史再发
messages.append({"role": "assistant", "content": answer})
messages.append({"role": "user", "content": "如果需要持久化呢？"})
resp = client.chat.completions.create(model="{{model}}", messages=messages)
print(resp.choices[0].message.content)
```

@tab Node.js

```javascript
const messages = [
  { role: 'system', content: '你是一名简洁的技术顾问，回答不超过三句话。' },
  { role: 'user', content: 'Redis 和 Memcached 怎么选？' },
]
let resp = await client.chat.completions.create({
  model: '{{model}}',
  messages,
})

// 追问时，把上一轮回复加进历史再发
messages.push({ role: 'assistant', content: resp.choices[0].message.content })
messages.push({ role: 'user', content: '如果需要持久化呢？' })
resp = await client.chat.completions.create({ model: '{{model}}', messages })
console.log(resp.choices[0].message.content)
```
:::

对话越长，每次发送的历史越多，输入费用越高。超过一定轮数后，可以只保留最近几轮，或先让模型总结前文。

### 思考模型

思考模型会先「想一想」再回答，适合数学、编程、复杂分析。思考过程按输出 Token 计费。本站用统一的方式控制各家模型的思考：

| 控制方式                | 写法                                                             | 适用                                 |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------ |
| `reasoning_effort` 参数 | `none` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max` | GPT、Claude、Gemini 等               |
| 模型名后缀              | 如 `-high`、`-thinking`                                          | 工具里只能填模型名、改不了参数时使用 |

思考内容（如果模型返回）放在 `reasoning_content` 字段里，和正式回答 `content` 分开；流式时在 `delta.reasoning_content` 中。

**DeepSeek**：思考模型会自动返回思考过程。`deepseek-flash` 和 `deepseek-v4` 系列支持后缀 `-none` 关闭思考、`-low` / `-max` 调整强度，例如 `deepseek-v4-pro-none`。

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model:deepseek}}",
    "messages": [{"role": "user", "content": "9.11 和 9.9 哪个大？"}]
  }'
```

@tab Python

```python
resp = client.chat.completions.create(
    model="{{model:deepseek}}",
    messages=[{"role": "user", "content": "9.11 和 9.9 哪个大？"}],
)
msg = resp.choices[0].message
print("思考过程：", getattr(msg, "reasoning_content", None))
print("最终回答：", msg.content)
```

@tab Node.js

```javascript
const resp = await client.chat.completions.create({
  model: '{{model:deepseek}}',
  messages: [{ role: 'user', content: '9.11 和 9.9 哪个大？' }],
})
console.log('思考过程：', resp.choices[0].message.reasoning_content)
console.log('最终回答：', resp.choices[0].message.content)
```
:::

**Claude**：传 `reasoning_effort` 开启思考。思考预算按 `max_tokens` 的比例分配（`high` 约 80%），开启思考时要把 `max_tokens` 设大一些，不传时默认 8192。只能填模型名的工具可以用后缀：`{{model:claude}}-thinking` 开启、`{{model:claude}}-thinking-8000` 指定预算、`{{model:claude}}-nothinking` 关闭。

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model:claude}}",
    "messages": [{"role": "user", "content": "证明根号 2 是无理数"}],
    "reasoning_effort": "high",
    "max_tokens": 16000
  }'
```

@tab Python

```python
resp = client.chat.completions.create(
    model="{{model:claude}}",
    messages=[{"role": "user", "content": "证明根号 2 是无理数"}],
    reasoning_effort="high",
    max_tokens=16000,
)
print(resp.choices[0].message.reasoning_content)
print(resp.choices[0].message.content)
```
:::

**GPT**：`reasoning_effort` 控制思考强度，越高越慢、输出 Token 越多。OpenAI 不返回完整思考过程，`usage.completion_tokens_details.reasoning_tokens` 是思考消耗的 Token 数。也可以用后缀 `{{model:gpt}}-high`、`{{model:gpt}}-low` 等。

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model:gpt}}",
    "messages": [{"role": "user", "content": "设计一个短链接服务的数据库表结构"}],
    "reasoning_effort": "low"
  }'
```

**Gemini**：`reasoning_effort` 控制强度。想拿到思考内容，要用 `reasoning` 对象并设置 `exclude: false`。

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model:gemini}}",
    "messages": [{"role": "user", "content": "篮子里有 5 个苹果，拿走 2 个又放回 1 个，还剩几个？"}],
    "reasoning": {"effort": "medium", "exclude": false}
  }'
```

:::warning
多轮对话时，**不要**把上一轮的 `reasoning_content` 放回 `messages`，只回传 `content`，否则部分模型会报错。
:::

### 图片理解

支持视觉的模型可以读图：识别内容、提取文字、看懂图表和截图。把图片放进 `content` 数组，文字和图片可以混排、可以放多张。模型是否支持看图，可以在 [模型广场](/pricing) 查看。

用图片链接时，链接必须能从公网直接访问（不需要登录、没有防盗链）：

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "这张图里有什么？用一句话描述。"},
        {"type": "image_url", "image_url": {"url": "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png"}}
      ]
    }]
  }'
```

@tab Python

```python
resp = client.chat.completions.create(
    model="{{model}}",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "这张图里有什么？用一句话描述。"},
            {"type": "image_url", "image_url": {"url": "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png"}},
        ],
    }],
)
print(resp.choices[0].message.content)
```

@tab Node.js

```javascript
const resp = await client.chat.completions.create({
  model: '{{model}}',
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: '这张图里有什么？用一句话描述。' },
        {
          type: 'image_url',
          image_url: {
            url: 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png',
          },
        },
      ],
    },
  ],
})
console.log(resp.choices[0].message.content)
```
:::

本地文件或内网图片，转成 Base64 后以 `data:` 开头的地址发送，类型要和图片实际格式一致（`image/jpeg`、`image/png`、`image/webp`、`image/gif`）：

:::tabs
@tab cURL

```bash
IMG=$(base64 < receipt.jpg | tr -d '\n')
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "提取这张小票上的商家名称、日期和总金额"},
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,'"$IMG"'"}}
      ]
    }]
  }'
```

@tab Python

```python
import base64

with open("receipt.jpg", "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

resp = client.chat.completions.create(
    model="{{model}}",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "提取这张小票上的商家名称、日期和总金额"},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
        ],
    }],
)
print(resp.choices[0].message.content)
```

@tab Node.js

```javascript
import { readFileSync } from 'node:fs'

const b64 = readFileSync('receipt.jpg').toString('base64')
const resp = await client.chat.completions.create({
  model: '{{model}}',
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: '提取这张小票上的商家名称、日期和总金额' },
        {
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${b64}` },
        },
      ],
    },
  ],
})
console.log(resp.choices[0].message.content)
```
:::

- 图片按尺寸折算成输入 Token 计费，大图更贵。一般把长边缩到 1500 像素左右，既清晰又省钱。
- Base64 会让请求体变大，图片过大可能返回 `413`，请先压缩。
- 图片链接由本站或模型服务商下载，链接打不开、需要登录或有防盗链时会报错，这种情况改用 Base64。

### 工具调用

工具调用（Function Calling）让模型能「调用」你写的函数：你描述有哪些函数，模型决定什么时候调用、传什么参数；你在本地执行后把结果交回，模型再据此回答。这种写法对 Claude、Gemini 等模型同样有效。

```text
1. 你：发送问题 + 工具定义
2. 模型：返回 tool_calls（要调用哪个函数、参数是什么）
3. 你：在本地执行函数，把结果以 role=tool 的消息发回
4. 模型：根据结果给出最终回答
```

:::tabs
@tab cURL

```bash
# 第 1 步：发送问题和工具定义，模型会返回 tool_calls
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "messages": [{"role": "user", "content": "北京今天天气怎么样？适合跑步吗？"}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "查询指定城市当前的天气",
        "parameters": {
          "type": "object",
          "properties": {"city": {"type": "string", "description": "城市名，如 北京"}},
          "required": ["city"]
        }
      }
    }]
  }'
```

@tab Python

```python
import json

def get_weather(city: str) -> dict:
    # 实际项目里这里调用真实的天气接口
    return {"city": city, "weather": "晴", "temperature": 23}

tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "查询指定城市当前的天气",
        "parameters": {
            "type": "object",
            "properties": {"city": {"type": "string", "description": "城市名，如 北京"}},
            "required": ["city"],
        },
    },
}]
messages = [{"role": "user", "content": "北京今天天气怎么样？适合跑步吗？"}]

# 第 1 步：模型决定是否调用工具
resp = client.chat.completions.create(model="{{model}}", messages=messages, tools=tools)
msg = resp.choices[0].message
messages.append(msg)  # 把模型的这条回复（含 tool_calls）加入历史

# 第 2 步：执行模型要求的每一个调用，并把结果发回
for call in msg.tool_calls or []:
    result = get_weather(**json.loads(call.function.arguments))
    messages.append({
        "role": "tool",
        "tool_call_id": call.id,
        "content": json.dumps(result, ensure_ascii=False),
    })

# 第 3 步：模型根据工具结果回答
final = client.chat.completions.create(model="{{model}}", messages=messages, tools=tools)
print(final.choices[0].message.content)
```

@tab Node.js

```javascript
function getWeather({ city }) {
  // 实际项目里这里调用真实的天气接口
  return { city, weather: '晴', temperature: 23 }
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '查询指定城市当前的天气',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名，如 北京' },
        },
        required: ['city'],
      },
    },
  },
]
const messages = [{ role: 'user', content: '北京今天天气怎么样？适合跑步吗？' }]

const resp = await client.chat.completions.create({
  model: '{{model}}',
  messages,
  tools,
})
const msg = resp.choices[0].message
messages.push(msg)

for (const call of msg.tool_calls ?? []) {
  const result = getWeather(JSON.parse(call.function.arguments))
  messages.push({
    role: 'tool',
    tool_call_id: call.id,
    content: JSON.stringify(result),
  })
}

const final = await client.chat.completions.create({
  model: '{{model}}',
  messages,
  tools,
})
console.log(final.choices[0].message.content)
```
:::

模型可能一次返回多个 `tool_calls`，要全部执行，每个结果都带上对应的 `tool_call_id`。`tool_choice` 控制调用行为：

| 取值                                                        | 含义                   |
| ----------------------------------------------------------- | ---------------------- |
| `"auto"`（默认）                                            | 模型自己判断要不要调用 |
| `"none"`                                                    | 不调用工具，直接回答   |
| `"required"`                                                | 必须调用至少一个工具   |
| `{"type": "function", "function": {"name": "get_weather"}}` | 必须调用指定的工具     |

- `description` 要写清楚「什么时候该用这个工具」，模型主要靠它判断。
- 参数尽量用 `enum` 限定取值、用 `required` 标出必填项；工具结果尽量精简。
- 不要直接执行模型给出的参数去做危险操作（删除数据、转账等），先校验再执行。

### 结构化输出

需要把输出交给程序处理时，可以让模型严格按 JSON 返回。

| 方式        | 写法                                              | 效果                                                            |
| ----------- | ------------------------------------------------- | --------------------------------------------------------------- |
| JSON 模式   | `"response_format": {"type": "json_object"}`      | 保证输出是合法 JSON，结构由提示词描述，提示词里必须出现「JSON」 |
| JSON Schema | `"response_format": {"type": "json_schema", ...}` | 输出严格符合你给的结构                                          |

:::warning
`response_format` 适用于 GPT、Gemini 以及支持该参数的 OpenAI 兼容模型。**用这个接口调用 Claude 时该参数不生效**，Claude 请用 [工具调用](#工具调用) 强制调用一个参数结构就是目标 JSON 的工具，再读取工具参数。
:::

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "messages": [{"role": "user", "content": "这条评价是什么情绪？「物流太慢了，但东西质量不错」"}],
    "response_format": {
      "type": "json_schema",
      "json_schema": {
        "name": "sentiment",
        "strict": true,
        "schema": {
          "type": "object",
          "properties": {
            "sentiment": {"type": "string", "enum": ["positive", "negative", "mixed"]},
            "reasons": {"type": "array", "items": {"type": "string"}}
          },
          "required": ["sentiment", "reasons"],
          "additionalProperties": false
        }
      }
    }
  }'
```

@tab Python

```python
from pydantic import BaseModel

class Sentiment(BaseModel):
    sentiment: str
    reasons: list[str]

# SDK 会把 Pydantic 类转成 JSON Schema，并把结果解析回对象
resp = client.beta.chat.completions.parse(
    model="{{model}}",
    messages=[{"role": "user", "content": "这条评价是什么情绪？「物流太慢了，但东西质量不错」"}],
    response_format=Sentiment,
)
print(resp.choices[0].message.parsed)
```
:::

即使用了 JSON 模式，也要在代码里处理解析失败，例如输出因 `max_tokens` 不足被截断。

### 查看缓存命中

GPT、DeepSeek、Gemini 等模型会自动缓存相同的长前缀（一般 1024 个 Token 以上），命中部分按更低的缓存价计费，无需改代码。`usage.prompt_tokens_details.cached_tokens` 就是本次命中缓存的输入 Token 数。

- 把固定不变的内容放在最前面：系统提示词 → 工具定义 → 参考文档 → 历史对话 → 本次问题。
- 不要在系统提示词里放时间戳、随机数这类每次都变的内容。
- Claude 需要显式标记缓存位置，且只在 [Anthropic Messages](/docs/api-messages) 接口上生效，见该页的「提示词缓存」。
