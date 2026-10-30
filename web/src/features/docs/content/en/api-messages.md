The chat endpoint compatible with the Anthropic Messages API, used by Claude Code and other tools built on the Anthropic SDK. For Claude, reasoning and prompt caching are most complete here.

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
    "system": "You are a helpful assistant.",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

@tab Python

```python
# pip install anthropic
import anthropic

# base_url without /v1; the SDK appends /v1/messages
client = anthropic.Anthropic(base_url="{{baseUrl}}", api_key="{{apiKey}}")

resp = client.messages.create(
    model="{{model}}",
    max_tokens=1024,
    system="You are a helpful assistant.",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.content[0].text)
```

@tab Node.js

```javascript
// npm install @anthropic-ai/sdk
import Anthropic from '@anthropic-ai/sdk'

// baseURL without /v1; the SDK appends /v1/messages
const client = new Anthropic({ baseURL: '{{baseUrl}}', apiKey: '{{apiKey}}' })

const resp = await client.messages.create({
  model: '{{model}}',
  max_tokens: 1024,
  system: 'You are a helpful assistant.',
  messages: [{ role: 'user', content: 'Hello!' }],
})
console.log(resp.content[0].text)
```
:::

Authenticate with `x-api-key` or `Authorization: Bearer`, see [Authentication](/docs/api-authentication).

## Request parameters

:::params
| Parameter        | Type           | Required | Description                                                                                            |
| ---------------- | -------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `model`          | string         | Yes      | Model name                                                                                             |
| `messages`       | array          | Yes      | The conversation; `role` is `user` or `assistant`, `content` is a string or an array of content blocks |
| `max_tokens`     | integer        | Yes      | Maximum tokens to generate                                                                             |
| `system`         | string / array | No       | System prompt; as an array of blocks it can carry `cache_control`                                      |
| `stream`         | boolean        | No       | Stream the reply                                                                                       |
| `temperature`    | number         | No       | Randomness, 0 to 1                                                                                     |
| `stop_sequences` | array          | No       | Stop at these strings                                                                                  |
| `tools`          | array          | No       | Tool definitions (`name`, `description`, `input_schema`)                                               |
| `tool_choice`    | object         | No       | Tool use policy                                                                                        |
| `thinking`       | object         | No       | Turn on thinking, for example `{"type": "enabled", "budget_tokens": 8000}`                             |
:::

Content block types include `text`, `image`, `tool_use` and `tool_result`; add `cache_control` to a block to use prompt caching.

:::response-example
@tab 200

```json
{
  "id": "msg_01ABC",
  "type": "message",
  "role": "assistant",
  "model": "{{model}}",
  "content": [{ "type": "text", "text": "Hello! How can I help you today?" }],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 18,
    "output_tokens": 12,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0
  }
}
```
:::

## Response fields

:::params
| Field         | Description                                                              |
| ------------- | ------------------------------------------------------------------------ |
| `content[]`   | Answer blocks, usually `text`, `thinking` and `tool_use`                 |
| `stop_reason` | `end_turn` finished, `max_tokens` hit the limit, `tool_use` wants a tool |
| `usage`       | Input, output, cache write and cache read tokens                         |
:::

## Streaming

With `stream: true` events follow Anthropic's format: `message_start` → `content_block_start` → several `content_block_delta` → `content_block_stop` → `message_delta` (with the final usage) → `message_stop`.

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
    "messages": [{"role": "user", "content": "Write a four-line poem about autumn"}]
  }'
```

@tab Python

```python
with client.messages.stream(
    model="{{model}}",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Write a four-line poem about autumn"}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
```

@tab Node.js

```javascript
const stream = client.messages.stream({
  model: '{{model}}',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Write a four-line poem about autumn' }],
})
stream.on('text', (text) => process.stdout.write(text))
await stream.finalMessage()
```
:::

## Examples

### Thinking

Pass `thinking` to turn on thinking; `budget_tokens` caps the tokens it may use and must be below `max_tokens`. The returned `content` holds a `thinking` block first, then the `text` block.

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
    "thinking": {"type": "enabled", "budget_tokens": 8000},
    "messages": [{"role": "user", "content": "Prove that the square root of 2 is irrational"}]
  }'
```

@tab Python

```python
resp = client.messages.create(
    model="{{model}}",
    max_tokens=16000,
    thinking={"type": "enabled", "budget_tokens": 8000},
    messages=[{"role": "user", "content": "Prove that the square root of 2 is irrational"}],
)
for block in resp.content:
    if block.type == "thinking":
        print("Thinking:", block.thinking)
    elif block.type == "text":
        print("Answer:", block.text)
```
:::

Tools that only take a model name can append `-thinking` to the model name instead.

### Vision

Images use the `image` content block, with either a Base64 or a URL source:

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
        {"type": "text", "text": "What is in this image?"}
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
            {"type": "text", "text": "Extract the merchant, date and total from this receipt"},
        ],
    }],
)
print(resp.content[0].text)
```
:::

### Tool use

Define tools with `name`, `description` and `input_schema`. When the model wants a tool it returns a `tool_use` block (`stop_reason` is `tool_use`); run it and send the result back in a `tool_result` block.

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
      "description": "Get the current weather for a city",
      "input_schema": {
        "type": "object",
        "properties": {"city": {"type": "string"}},
        "required": ["city"]
      }
    }],
    "messages": [{"role": "user", "content": "What is the weather in Paris today?"}]
  }'
```

@tab Python

```python
tools = [{
    "name": "get_weather",
    "description": "Get the current weather for a city",
    "input_schema": {
        "type": "object",
        "properties": {"city": {"type": "string"}},
        "required": ["city"],
    },
}]
messages = [{"role": "user", "content": "What is the weather in Paris today?"}]

resp = client.messages.create(model="{{model}}", max_tokens=1024, tools=tools, messages=messages)
messages.append({"role": "assistant", "content": resp.content})

results = []
for block in resp.content:
    if block.type == "tool_use":
        weather = {"city": block.input["city"], "weather": "sunny", "temperature": 23}
        results.append({"type": "tool_result", "tool_use_id": block.id, "content": str(weather)})
messages.append({"role": "user", "content": results})

final = client.messages.create(model="{{model}}", max_tokens=1024, tools=tools, messages=messages)
print(final.content[0].text)
```
:::

### Prompt caching

Many requests start the same way: the same system prompt, the same long document, the same tools. Add `"cache_control": {"type": "ephemeral"}` to the block where the cache should end; everything from the start up to that block is cached, later hits are billed at the lower cache price, and the first token arrives sooner.

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
      {"type": "text", "text": "Answer from the employee handbook."},
      {"type": "text", "text": "<the long handbook text>", "cache_control": {"type": "ephemeral"}}
    ],
    "messages": [{"role": "user", "content": "How many vacation days do I get?"}]
  }'
```

@tab Python

```python
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
:::

In the returned `usage`:

| Field                         | Meaning                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `cache_creation_input_tokens` | Tokens written to the cache, billed at the cache write price (a bit above normal input) |
| `cache_read_input_tokens`     | Tokens served from the cache, billed at the cache read price (well below normal input)  |
| `input_tokens`                | Regular, uncached input                                                                 |

- The cache matches a prefix that must be identical from the first character. Put fixed content first and keep timestamps or user names in the last user message.
- Short prefixes are not cached; most models need about 1024 tokens or more, and thresholds vary.
- The cache lasts about 5 minutes and every hit resets the timer; use `"cache_control": {"type": "ephemeral", "ttl": "1h"}` for an hour at a higher write price.
- Cache prices are on the [Model Square](/pricing); Usage Logs in the console shows the cache read and write tokens of every request.

:::warning
`cache_control` only works on this endpoint. When you call Claude through Chat Completions, `cache_control` in the messages is not passed to Claude.
:::

## Messages vs Chat Completions

|                | Messages                           | Chat Completions                       |
| -------------- | ---------------------------------- | -------------------------------------- |
| Address        | `{{baseUrl}}/v1/messages`          | `{{baseUrl}}/v1/chat/completions`      |
| System prompt  | Top-level `system`                 | A `system` message in `messages`       |
| `max_tokens`   | Required                           | Optional                               |
| Prompt caching | `cache_control` supported          | No manual caching for Claude           |
| Best for       | Claude and Claude Code-style tools | Every model and OpenAI ecosystem tools |
