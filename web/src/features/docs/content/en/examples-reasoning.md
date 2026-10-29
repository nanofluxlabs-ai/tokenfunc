Reasoning models think before they answer, which helps with math, coding and multi-step analysis. Reasoning consumes output tokens and is billed at the output price. This site controls reasoning the same way across vendors:

| Control                      | Form                                                             | Applies to                                 |
| ---------------------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| `reasoning_effort` parameter | `none` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max` | GPT, Claude, Gemini and others             |
| Model name suffix            | For example `-high`, `-thinking`                                 | Tools that only let you enter a model name |

When a model returns its reasoning, it is in the `reasoning_content` field, separate from the final `content`.

## DeepSeek

DeepSeek reasoning models return their reasoning automatically; read `reasoning_content`.

:::tabs
@tab Python

```python
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")

resp = client.chat.completions.create(
    model="{{model:deepseek}}",
    messages=[{"role": "user", "content": "Which is larger, 9.11 or 9.9?"}],
)
msg = resp.choices[0].message
print("Reasoning:", getattr(msg, "reasoning_content", None))
print("Answer:", msg.content)
```

@tab Python (streaming)

```python
stream = client.chat.completions.create(
    model="{{model:deepseek}}",
    messages=[{"role": "user", "content": "Which is larger, 9.11 or 9.9?"}],
    stream=True,
)
for chunk in stream:
    if not chunk.choices:
        continue
    delta = chunk.choices[0].delta
    reasoning = getattr(delta, "reasoning_content", None)
    if reasoning:
        print(reasoning, end="", flush=True)  # the reasoning comes first
    if delta.content:
        print(delta.content, end="", flush=True)  # then the answer
```
:::

`deepseek-flash` and the `deepseek-v4` family accept suffixes: `-none` turns reasoning off, `-low` / `-max` set the effort, for example `deepseek-v4-pro-none`.

:::warning
In multi-turn chats, **do not** send the previous `reasoning_content` back in `messages`. Send only `content`, or some models reject the request.
:::

## Claude

When calling Claude through Chat Completions, pass `reasoning_effort` to turn on thinking. The thinking also comes back in `reasoning_content`.

```python
resp = client.chat.completions.create(
    model="{{model:claude}}",
    messages=[{"role": "user", "content": "Prove that the square root of 2 is irrational"}],
    reasoning_effort="high",
    max_tokens=16000,
)
print(resp.choices[0].message.reasoning_content)
print(resp.choices[0].message.content)
```

- The thinking budget is a share of `max_tokens` (about 80% for `high`), so raise `max_tokens` when thinking is on. It defaults to 8192.
- In tools that only take a model name, use suffixes: `{{model:claude}}-thinking` turns thinking on, `{{model:claude}}-thinking-8000` sets an 8000-token budget, `{{model:claude}}-nothinking` turns it off.
- On the native Anthropic [Messages](/docs/api-messages) endpoint, pass Anthropic's own `thinking` parameter.

## GPT

GPT reasoning models take `reasoning_effort` to set how hard they think; higher is slower and uses more output tokens. OpenAI does not return the full reasoning.

```python
resp = client.chat.completions.create(
    model="{{model:gpt}}",
    messages=[{"role": "user", "content": "Design the database tables for a URL shortener"}],
    reasoning_effort="low",
)
print(resp.choices[0].message.content)
print("Reasoning used", resp.usage.completion_tokens_details.reasoning_tokens, "tokens")
```

Suffixes work too: `{{model:gpt}}-high`, `{{model:gpt}}-low`, `{{model:gpt}}-none` and so on, each equal to the matching `reasoning_effort`.

## Gemini

Gemini takes `reasoning_effort` for the effort. To receive the reasoning text, use the `reasoning` object with `exclude: false`:

```python
resp = client.chat.completions.create(
    model="{{model:gemini}}",
    messages=[{"role": "user", "content": "A basket has 5 apples. You take 2 and put 1 back. How many are left?"}],
    extra_body={"reasoning": {"effort": "medium", "exclude": False}},
)
print(resp.choices[0].message.reasoning_content)
print(resp.choices[0].message.content)
```

## Choosing the effort

- Simple Q&A and small talk: off or `low`, faster and cheaper.
- Coding, math, multi-step reasoning: `medium` or `high`.
- Reasoning tokens count as output. Usage Logs in the console shows the output tokens of every request.
