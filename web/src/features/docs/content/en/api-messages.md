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

## Request headers

:::params
| Header              | Required | Description                                                                                                                 |
| ------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `x-api-key`         | Yes      | Your key on this site; `Authorization: Bearer` also works                                                                   |
| `anthropic-version` | No       | API version. Without it this site sends `2023-06-01`. From `2026-10-21` on, `temperature`, `top_p` and `top_k` are rejected |
| `anthropic-beta`    | No       | Turns on beta features and is passed upstream as is; separate several values with commas                                    |
:::

## Request parameters

:::params
| Parameter        | Type           | Required | Description                                                                                                                                                                                                             |
| ---------------- | -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model`          | string         | Yes      | Model name                                                                                                                                                                                                              |
| `messages`       | array          | Yes      | The conversation; `role` is `user` or `assistant`, `content` is a string or an array of content blocks                                                                                                                  |
| `max_tokens`     | integer        | Yes      | Maximum tokens to generate                                                                                                                                                                                              |
| `system`         | string / array | No       | System prompt; as an array of blocks it can carry `cache_control`                                                                                                                                                       |
| `stream`         | boolean        | No       | Stream the reply                                                                                                                                                                                                        |
| `stop_sequences` | array          | No       | Stop at these strings                                                                                                                                                                                                   |
| `tools`          | array          | No       | Tool definitions (`name`, `description`, `input_schema`)                                                                                                                                                                |
| `tool_choice`    | object         | No       | Tool use policy: `auto` lets the model decide (default), `any` must call some tool, `tool` calls the tool named in `name`, `none` calls no tool. Add `"disable_parallel_tool_use": true` to allow at most one tool call |
| `thinking`       | object         | No       | Thinking settings. `{"type": "adaptive"}` is recommended and lets the model decide how deeply to think, see [Thinking](#thinking) below                                                                                 |
| `output_config`  | object         | No       | Output settings: `effort` sets how much work goes in (`low` / `medium` / `high` / `xhigh` / `max`); `format` takes `{"type": "json_schema", "schema": {...}}` to make the answer match a JSON Schema                    |
| `cache_control`  | object         | No       | At the top level it caches up to the last cacheable block automatically, see [Prompt caching](#prompt-caching)                                                                                                          |
| `metadata`       | object         | No       | Request metadata; put an anonymous end-user ID in `user_id`, never a name, email or phone number                                                                                                                        |
:::

Content block types include `text`, `image`, `document` (PDFs and other documents), `tool_use` and `tool_result`. With thinking on, send the returned `thinking` blocks back unchanged in multi-turn tool use. Add `cache_control` to a block to use prompt caching.

Do not send `temperature`, `top_p` or `top_k`: Claude 4.7 and later models return 400 for non-default values, and from `anthropic-version: 2026-10-21` on, any model returns 400 when a request includes any of the three.

Only common parameters are listed. See the [Anthropic API reference](https://platform.claude.com/docs/en/api/messages) for the rest; most are forwarded upstream as is. This site does not forward `service_tier`, `inference_geo`, `speed` and `diagnostics`; they are ignored if sent.

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

## Response fields

:::params
| Field                                                           | Description                                                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `content[]`                                                     | Answer blocks, usually `text`, `thinking` and `tool_use`                                                                             |
| `stop_reason`                                                   | Why the answer ended, see the table below                                                                                            |
| `stop_sequence`                                                 | The stop sequence that was hit; set only when `stop_reason` is `stop_sequence`, otherwise `null`                                     |
| `stop_details`                                                  | Extra detail on why it stopped, currently only for `refusal`, with `category` (such as `cyber` or `bio`) and `explanation`           |
| `usage.input_tokens`                                            | Regular input tokens that did not hit the cache                                                                                      |
| `usage.output_tokens`                                           | Output tokens, thinking included; this is what is billed                                                                             |
| `usage.cache_creation_input_tokens` / `cache_read_input_tokens` | Tokens written to / served from the cache                                                                                            |
| `usage.cache_creation`                                          | Cache writes split by lifetime: `ephemeral_5m_input_tokens` (5 minutes) and `ephemeral_1h_input_tokens` (1 hour), priced differently |
| `usage.output_tokens_details.thinking_tokens`                   | Output tokens spent on thinking, already included in `output_tokens`                                                                 |
| `usage.server_tool_use`                                         | Server tool calls: `web_search_requests` and `web_fetch_requests`                                                                    |
| `usage.service_tier`                                            | The service tier used: `standard`, `priority` or `batch`                                                                             |
:::

Values of `stop_reason`:

| Value                           | Meaning                                                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `end_turn`                      | Finished normally                                                                                                                      |
| `max_tokens`                    | Hit `max_tokens` or the model limit; the answer is cut off                                                                             |
| `stop_sequence`                 | Hit a string from `stop_sequences`                                                                                                     |
| `tool_use`                      | Wants to call a tool                                                                                                                   |
| `pause_turn`                    | A long-running turn was paused. Send this response back unchanged as the `assistant` message in a new request and the model carries on |
| `refusal`                       | The model declined to answer; see `stop_details`                                                                                       |
| `model_context_window_exceeded` | The model's context window was exceeded                                                                                                |

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

Pass `"thinking": {"type": "adaptive"}` to turn on thinking and let the model decide how deeply to think based on the question. Tune how much it does with `output_config.effort`: `low` / `medium` / `high` / `xhigh` / `max`, or leave it out for the model's default. The returned `content` holds a `thinking` block first, then the `text` block. Claude 5 and later models hide the thinking text by default; add `"display": "summarized"` to see it.

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
    "messages": [{"role": "user", "content": "Prove that the square root of 2 is irrational"}]
  }'
```

@tab Python

```python
resp = client.messages.create(
    model="{{model}}",
    max_tokens=16000,
    thinking={"type": "adaptive", "display": "summarized"},
    output_config={"effort": "high"},
    messages=[{"role": "user", "content": "Prove that the square root of 2 is irrational"}],
)
for block in resp.content:
    if block.type == "thinking":
        print("Thinking:", block.thinking)
    elif block.type == "text":
        print("Answer:", block.text)
```
:::

The older form `{"type": "enabled", "budget_tokens": 8000}` only works on Claude 4.6 and earlier models (deprecated on 4.6); Claude 4.7 and later models return 400. The other way round, Claude 4.5 and earlier models do not support `adaptive` and need the older form, where `budget_tokens` is at least 1024 and below `max_tokens`.

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

If you would rather not pick the spot, put `"cache_control": {"type": "ephemeral"}` at the top level of the request. It caches up to the last cacheable block and moves forward as the conversation grows.

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
| `cache_creation`              | Cache write tokens split into 5-minute and 1-hour entries                               |

- The cache matches a prefix that must be identical from the first character. Put fixed content first and keep timestamps or user names in the last user message.
- Short prefixes are not cached; the minimum is 512 to 4096 tokens depending on the model. Below it there is no error, the prompt is just not cached.
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
