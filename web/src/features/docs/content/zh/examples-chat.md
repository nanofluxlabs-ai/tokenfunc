本页用 OpenAI 兼容的 [Chat Completions](/docs/api-chat-completions) 接口演示最常用的对话写法。本站的所有文本模型（包括 Claude、Gemini、DeepSeek）都可以用这种格式调用，换个 `model` 即可。

## 安装 SDK

:::tabs
@tab Python

```bash
pip install openai
```

@tab Node.js

```bash
npm install openai
```
:::

## 系统提示词与多轮对话

`messages` 按顺序记录整段对话：`system` 设定角色和规则，`user` 是用户说的话，`assistant` 是模型之前的回复。模型本身不记得上一次请求，**每次都要把完整的历史发过去**。

:::tabs
@tab Python

```python
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")

messages = [
    {"role": "system", "content": "你是一名简洁的技术顾问，回答不超过三句话。"},
    {"role": "user", "content": "Redis 和 Memcached 怎么选？"},
]

resp = client.chat.completions.create(model="{{model}}", messages=messages)
answer = resp.choices[0].message.content
print(answer)

# 追问时，把上一轮回复加进历史再发
messages.append({"role": "assistant", "content": answer})
messages.append({"role": "user", "content": "如果需要持久化呢？"})
resp = client.chat.completions.create(model="{{model}}", messages=messages)
print(resp.choices[0].message.content)
```

@tab Node.js

```javascript
import OpenAI from 'openai'

const client = new OpenAI({ baseURL: '{{baseUrl}}/v1', apiKey: '{{apiKey}}' })

const messages = [
  { role: 'system', content: '你是一名简洁的技术顾问，回答不超过三句话。' },
  { role: 'user', content: 'Redis 和 Memcached 怎么选？' },
]

let resp = await client.chat.completions.create({
  model: '{{model}}',
  messages,
})
const answer = resp.choices[0].message.content
console.log(answer)

// 追问时，把上一轮回复加进历史再发
messages.push({ role: 'assistant', content: answer })
messages.push({ role: 'user', content: '如果需要持久化呢？' })
resp = await client.chat.completions.create({ model: '{{model}}', messages })
console.log(resp.choices[0].message.content)
```

@tab cURL

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "messages": [
      {"role": "system", "content": "你是一名简洁的技术顾问，回答不超过三句话。"},
      {"role": "user", "content": "Redis 和 Memcached 怎么选？"}
    ]
  }'
```
:::

## 流式输出

设置 `stream: true` 后，回复会一小段一小段地返回，用户能立刻看到第一个字，长回复也不容易超时。聊天界面基本都应该用流式。

:::tabs
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
:::

流式响应是一串 `data: {...}` 行，每行是一个 `chat.completion.chunk`，最后以 `data: [DONE]` 结束。本站默认会在结尾附带一个包含 `usage` 的数据块，用于统计 Token；不需要时传 `"stream_options": {"include_usage": false}`。

## 常用参数

| 参数          | 作用                                                             |
| ------------- | ---------------------------------------------------------------- |
| `max_tokens`  | 限制单次最多输出多少 Token，防止回复过长、费用失控               |
| `temperature` | 随机性，0～2。写代码、做提取用低值（如 0.2），创作用高值（如 1） |
| `stop`        | 遇到指定字符串就停止输出                                         |
| `n`           | 一次生成几个候选回复，按总输出计费                               |

完整参数见 [Chat Completions](/docs/api-chat-completions)。

## 控制费用的建议

- 对话越长，每次发送的历史越多，输入费用越高。超过一定轮数后，可以只保留最近几轮或先让模型总结前文。
- 长而固定的系统提示词放在最前面，能更好地命中 [提示词缓存](/docs/examples-prompt-caching)。
- 每次请求的 Token 数和费用都能在控制台「使用日志」里查到。
