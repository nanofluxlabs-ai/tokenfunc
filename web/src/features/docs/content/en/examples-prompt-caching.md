Many requests start the same way: the same system prompt, the same long document, the same tool definitions. Prompt caching stores that shared beginning, bills later hits at the lower cache price, and returns the first token sooner.

| Models                           | Code changes | How to enable                                                                                   |
| -------------------------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| GPT, DeepSeek, Gemini and others | None         | Automatic; long enough identical prefixes hit the cache                                         |
| Claude                           | Needed       | Use the Anthropic [Messages](/docs/api-messages) endpoint and mark content with `cache_control` |

Cache read and write prices for each model are on the [Model Square](/pricing).

## Getting more cache hits

The cache matches a prefix: everything from the first character must be identical. So:

- Put **unchanging** content first: system prompt → tool definitions → reference documents → history → the current question.
- Keep timestamps, random values and user names out of the system prompt; put them in the last user message.
- Short prefixes are not cached. Most models need about 1024 tokens or more, and thresholds vary by model.

## Automatic caching: checking hits

GPT, DeepSeek, Gemini and similar models need no changes. The returned `usage` shows how much input came from the cache:

```python
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")

long_doc = open("handbook.md", encoding="utf-8").read()  # a long, fixed document

for question in ["How many vacation days do I get?", "What do I need for an expense claim?"]:
    resp = client.chat.completions.create(
        model="{{model:gpt}}",
        messages=[
            {"role": "system", "content": "Answer from the employee handbook:\n" + long_doc},
            {"role": "user", "content": question},
        ],
    )
    details = resp.usage.prompt_tokens_details
    print(question, "input", resp.usage.prompt_tokens, "cached", details.cached_tokens if details else 0)
```

On the second request `cached_tokens` is usually close to the document length.

## Claude: marking what to cache

Claude needs an explicit marker: add `"cache_control": {"type": "ephemeral"}` to the block where the cache should end. Everything from the start up to that block is cached.

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
        {"type": "text", "text": "Answer from the employee handbook."},
        {"type": "text", "text": long_doc, "cache_control": {"type": "ephemeral"}},
    ],
    messages=[{"role": "user", "content": "How many vacation days do I get?"}],
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
      {"type": "text", "text": "Answer from the employee handbook."},
      {"type": "text", "text": "<the long handbook text>", "cache_control": {"type": "ephemeral"}}
    ],
    "messages": [{"role": "user", "content": "How many vacation days do I get?"}]
  }'
```
:::

In the returned `usage`:

| Field                         | Meaning                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `cache_creation_input_tokens` | Tokens written to the cache this time, billed at the cache write price (a bit above normal input) |
| `cache_read_input_tokens`     | Tokens served from the cache, billed at the cache read price (well below normal input)            |
| `input_tokens`                | Regular, uncached input                                                                           |

The cache lasts about 5 minutes by default and every hit resets the timer. For longer, use `"cache_control": {"type": "ephemeral", "ttl": "1h"}` to cache for an hour at a higher write price.

:::warning
`cache_control` only works on the Anthropic Messages endpoint. When you call Claude through Chat Completions, `cache_control` in the messages is not passed to Claude and nothing is cached.
:::

## Billing and checking

- Cache hits are billed at the cache read price and writes at the cache write price; see the [Model Square](/pricing).
- Every entry in Usage Logs shows the cache read and write tokens, so you can check your hit rate.
