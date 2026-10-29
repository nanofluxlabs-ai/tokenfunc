很多请求的开头是一样的：同一份系统提示词、同一份长文档、同一组工具定义。提示词缓存会把这段相同的开头存起来，下次命中时按更低的缓存价计费，首字返回也更快。

| 模型                     | 是否需要改代码 | 怎么开启                                                                               |
| ------------------------ | -------------- | -------------------------------------------------------------------------------------- |
| GPT、DeepSeek、Gemini 等 | 不需要         | 自动缓存，相同前缀足够长时自动命中                                                     |
| Claude                   | 需要           | 用 Anthropic [Messages](/docs/api-messages) 接口，在要缓存的内容上标记 `cache_control` |

各模型的缓存读取价、写入价见 [模型广场](/pricing)。

## 让缓存更容易命中

缓存按「前缀」匹配，从第一个字开始必须完全一样才能命中。所以：

- 把**固定不变**的内容放在最前面：系统提示词 → 工具定义 → 参考文档 → 历史对话 → 本次问题。
- 不要在系统提示词里放时间戳、随机数、用户名这类每次都变的内容，放到最后的用户消息里。
- 前缀太短不会被缓存，一般要 1024 个 Token 以上，不同模型的门槛不同。

## 自动缓存：查看命中情况

GPT、DeepSeek、Gemini 等模型无需任何改动，从返回的 `usage` 里能看到本次有多少输入命中了缓存：

```python
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")

long_doc = open("handbook.md", encoding="utf-8").read()  # 一份很长的固定文档

for question in ["年假有几天？", "报销需要哪些材料？"]:
    resp = client.chat.completions.create(
        model="{{model:gpt}}",
        messages=[
            {"role": "system", "content": "根据员工手册回答问题：\n" + long_doc},
            {"role": "user", "content": question},
        ],
    )
    details = resp.usage.prompt_tokens_details
    print(question, "输入", resp.usage.prompt_tokens, "其中缓存命中", details.cached_tokens if details else 0)
```

第二次请求的 `cached_tokens` 通常会接近文档长度。

## Claude：标记要缓存的内容

Claude 需要显式标记缓存位置：在希望缓存到的那一块内容上加 `"cache_control": {"type": "ephemeral"}`，从开头到这一块的全部内容都会被缓存。

:::tabs
@tab Python

```python
import anthropic

client = anthropic.Anthropic(base_url="{{baseUrl}}", api_key="{{apiKey}}")

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
:::

返回的 `usage` 中：

| 字段                          | 含义                                                     |
| ----------------------------- | -------------------------------------------------------- |
| `cache_creation_input_tokens` | 本次写入缓存的 Token，按缓存写入价计费（比普通输入略贵） |
| `cache_read_input_tokens`     | 本次命中缓存的 Token，按缓存读取价计费（远低于普通输入） |
| `input_tokens`                | 未缓存部分的普通输入                                     |

默认缓存约 5 分钟，每次命中会重新计时。需要更久时写 `"cache_control": {"type": "ephemeral", "ttl": "1h"}`，缓存 1 小时，写入价更高。

:::warning
`cache_control` 只在 Anthropic Messages 接口上生效。用 Chat Completions 格式调用 Claude 时，消息里的 `cache_control` 不会传给 Claude，缓存不会生效。
:::

## 计费与核对

- 缓存命中部分按缓存读取价计费，写入部分按缓存写入价计费，具体价格见 [模型广场](/pricing)。
- 控制台「使用日志」里每条记录都显示了缓存读取和写入的 Token 数，可以据此核对命中率。
