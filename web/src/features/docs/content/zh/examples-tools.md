工具调用（Function Calling）让模型能「调用」你写的函数：你描述有哪些函数，模型决定什么时候调用、传什么参数；你在本地执行后把结果交回，模型再据此回答。查天气、查数据库、下单等都靠它实现。

用 Chat Completions 格式写的工具调用，本站会自动转换给 Claude、Gemini 等模型，代码不用改。

## 完整流程

```text
1. 你：发送问题 + 工具定义
2. 模型：返回 tool_calls（要调用哪个函数、参数是什么）
3. 你：在本地执行函数，把结果以 role=tool 的消息发回
4. 模型：根据结果给出最终回答
```

:::tabs
@tab Python

```python
import json
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")

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
    args = json.loads(call.function.arguments)
    result = get_weather(**args)
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
import OpenAI from 'openai'

const client = new OpenAI({ baseURL: '{{baseUrl}}/v1', apiKey: '{{apiKey}}' })

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

模型可能一次返回多个 `tool_calls`（比如同时查两个城市），所以要遍历全部执行，每个结果都带上对应的 `tool_call_id`。

## 控制调用行为

`tool_choice` 决定模型怎么用工具：

| 取值                                                        | 含义                   |
| ----------------------------------------------------------- | ---------------------- |
| `"auto"`（默认）                                            | 模型自己判断要不要调用 |
| `"none"`                                                    | 不调用工具，直接回答   |
| `"required"`                                                | 必须调用至少一个工具   |
| `{"type": "function", "function": {"name": "get_weather"}}` | 必须调用指定的工具     |

传 `"parallel_tool_calls": false` 可以要求模型一次只调用一个工具。

## 写好工具定义

- `description` 要写清楚「什么时候该用这个工具」，模型主要靠它判断。
- 参数尽量用 `enum` 限定取值，用 `required` 标出必填项，减少模型乱填。
- 工具结果尽量精简，只返回模型需要的字段，过长的结果会占用大量输入 Token。
- 不要直接执行模型给出的参数去做危险操作（删除数据、转账等），先校验再执行。

## 用 Anthropic 格式

调用 [Messages](/docs/api-messages) 接口时，工具定义使用 Anthropic 的格式（`name`、`description`、`input_schema`），模型返回 `tool_use` 块，你用 `tool_result` 块回传结果，流程与上面一致。
