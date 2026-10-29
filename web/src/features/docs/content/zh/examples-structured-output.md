需要把模型的输出交给程序处理时（提取字段、分类、生成配置），可以让它严格按 JSON 返回，省去解析自然语言的麻烦。

| 方式        | 写法                                              | 效果                                  |
| ----------- | ------------------------------------------------- | ------------------------------------- |
| JSON 模式   | `"response_format": {"type": "json_object"}`      | 保证输出是合法 JSON，结构由提示词描述 |
| JSON Schema | `"response_format": {"type": "json_schema", ...}` | 输出严格符合你给的结构                |

:::warning
`response_format` 适用于 GPT、Gemini 以及支持该参数的 OpenAI 兼容模型（如 DeepSeek 的 JSON 模式）。**用 Chat Completions 格式调用 Claude 时该参数不生效**，Claude 请改用文末的工具调用方法。
:::

## JSON 模式

使用 JSON 模式时，提示词里必须出现「JSON」字样，并说明需要哪些字段：

:::tabs
@tab Python

```python
import json
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")

resp = client.chat.completions.create(
    model="{{model}}",
    messages=[
        {"role": "system", "content": "从用户的话里提取信息，以 JSON 返回，字段为 name、phone、city。缺失的字段填 null。"},
        {"role": "user", "content": "我叫王小明，电话 13800001234，下周去上海出差"},
    ],
    response_format={"type": "json_object"},
)
data = json.loads(resp.choices[0].message.content)
print(data)
```

@tab cURL

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "messages": [
      {"role": "system", "content": "从用户的话里提取信息，以 JSON 返回，字段为 name、phone、city。缺失的字段填 null。"},
      {"role": "user", "content": "我叫王小明，电话 13800001234，下周去上海出差"}
    ],
    "response_format": {"type": "json_object"}
  }'
```
:::

## JSON Schema

给出完整的结构定义，模型的输出会严格匹配，字段不会多也不会少：

```python
resp = client.chat.completions.create(
    model="{{model}}",
    messages=[{"role": "user", "content": "这条评价是什么情绪？「物流太慢了，但东西质量不错」"}],
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "sentiment",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                    "sentiment": {"type": "string", "enum": ["positive", "negative", "mixed"]},
                    "reasons": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["sentiment", "reasons"],
                "additionalProperties": False,
            },
        },
    },
)
print(resp.choices[0].message.content)
```

Python 的 OpenAI SDK 也可以直接传 Pydantic 类，写法更简洁：

```python
from pydantic import BaseModel

class Sentiment(BaseModel):
    sentiment: str
    reasons: list[str]

resp = client.beta.chat.completions.parse(
    model="{{model}}",
    messages=[{"role": "user", "content": "这条评价是什么情绪？「物流太慢了，但东西质量不错」"}],
    response_format=Sentiment,
)
print(resp.choices[0].message.parsed)
```

## Claude 怎么做

Claude 可以借助 [工具调用](/docs/examples-tools) 拿到结构化结果：定义一个参数结构就是目标 JSON 的工具，并用 `tool_choice` 强制调用它，然后读取工具参数。

```python
resp = client.chat.completions.create(
    model="{{model:claude}}",
    messages=[{"role": "user", "content": "这条评价是什么情绪？「物流太慢了，但东西质量不错」"}],
    tools=[{
        "type": "function",
        "function": {
            "name": "record_sentiment",
            "description": "记录评价的情绪分析结果",
            "parameters": {
                "type": "object",
                "properties": {
                    "sentiment": {"type": "string", "enum": ["positive", "negative", "mixed"]},
                    "reasons": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["sentiment", "reasons"],
            },
        },
    }],
    tool_choice={"type": "function", "function": {"name": "record_sentiment"}},
)
print(resp.choices[0].message.tool_calls[0].function.arguments)
```

## 小贴士

- 即使用了 JSON 模式，也要在代码里做好解析失败的处理，例如输出因 `max_tokens` 不足被截断。
- 字段含义写进 `description` 或提示词，比只给字段名效果好得多。
