思考模型会先「想一想」再回答，适合数学、编程、复杂分析等任务。思考过程同样消耗输出 Token，按输出价格计费。本站用统一的方式控制各家模型的思考：

| 控制方式                | 写法                                                             | 适用                                 |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------ |
| `reasoning_effort` 参数 | `none` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max` | GPT、Claude、Gemini 等               |
| 模型名后缀              | 如 `-high`、`-thinking`                                          | 工具里只能填模型名、改不了参数时使用 |

思考内容（如果模型返回）放在回复的 `reasoning_content` 字段里，和正式回答 `content` 分开。

## DeepSeek

DeepSeek 的思考模型会自动返回思考过程，读取 `reasoning_content` 即可。

:::tabs
@tab Python

```python
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")

resp = client.chat.completions.create(
    model="{{model:deepseek}}",
    messages=[{"role": "user", "content": "9.11 和 9.9 哪个大？"}],
)
msg = resp.choices[0].message
print("思考过程：", getattr(msg, "reasoning_content", None))
print("最终回答：", msg.content)
```

@tab Python（流式）

```python
stream = client.chat.completions.create(
    model="{{model:deepseek}}",
    messages=[{"role": "user", "content": "9.11 和 9.9 哪个大？"}],
    stream=True,
)
for chunk in stream:
    if not chunk.choices:
        continue
    delta = chunk.choices[0].delta
    reasoning = getattr(delta, "reasoning_content", None)
    if reasoning:
        print(reasoning, end="", flush=True)  # 先输出思考过程
    if delta.content:
        print(delta.content, end="", flush=True)  # 再输出正式回答
```
:::

`deepseek-flash` 和 `deepseek-v4` 系列支持用后缀控制思考：`-none` 关闭思考，`-low` / `-max` 调整思考强度，例如 `deepseek-v4-pro-none`。

:::warning
多轮对话时，**不要**把上一轮的 `reasoning_content` 放回 `messages`，只回传 `content`，否则部分模型会报错。
:::

## Claude

用 Chat Completions 格式调用 Claude 时，传 `reasoning_effort` 即可开启思考，思考内容同样在 `reasoning_content` 中返回。

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

- 思考预算按 `max_tokens` 的比例分配（`high` 约 80%），所以开启思考时要把 `max_tokens` 设大一些；不传时默认 8192。
- 在只能填模型名的工具里，可以用后缀：`{{model:claude}}-thinking` 开启思考，`{{model:claude}}-thinking-8000` 指定思考预算为 8000 Token，`{{model:claude}}-nothinking` 关闭思考。
- 用 Anthropic 原生的 [Messages](/docs/api-messages) 接口时，直接传 Anthropic 的 `thinking` 参数即可。

## GPT

GPT 推理模型用 `reasoning_effort` 控制思考强度，强度越高越慢、输出 Token 越多。OpenAI 不返回完整的思考过程。

```python
resp = client.chat.completions.create(
    model="{{model:gpt}}",
    messages=[{"role": "user", "content": "设计一个短链接服务的数据库表结构"}],
    reasoning_effort="low",
)
print(resp.choices[0].message.content)
print("其中思考用了", resp.usage.completion_tokens_details.reasoning_tokens, "Token")
```

也可以用后缀：`{{model:gpt}}-high`、`{{model:gpt}}-low`、`{{model:gpt}}-none` 等，效果等同于对应的 `reasoning_effort`。

## Gemini

Gemini 用 `reasoning_effort` 控制思考强度。想拿到思考内容，需要用 `reasoning` 对象并设置 `exclude: false`：

```python
resp = client.chat.completions.create(
    model="{{model:gemini}}",
    messages=[{"role": "user", "content": "一个篮子里有 5 个苹果，拿走 2 个又放回 1 个，还剩几个？"}],
    extra_body={"reasoning": {"effort": "medium", "exclude": False}},
)
print(resp.choices[0].message.reasoning_content)
print(resp.choices[0].message.content)
```

## 怎么选强度

- 简单问答、闲聊：关闭思考或 `low`，更快更省。
- 编程、数学、多步推理：`medium` 或 `high`。
- 思考 Token 计入输出费用，在控制台「使用日志」里可以看到每次请求的输出 Token 数。
