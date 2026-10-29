The chat endpoint compatible with the Anthropic Messages API, used by Claude Code and other tools built on the Anthropic SDK. For Claude, reasoning and prompt caching are most complete here.

```http
POST {{baseUrl}}/v1/messages
```

## Request

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
    "system": "You are a helpful assistant.",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

@tab Python

```python
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

Content block types include `text`, `image` (see [Vision](/docs/examples-vision)), `tool_use` and `tool_result`. Add `cache_control` to a block to use [prompt caching](/docs/examples-prompt-caching).

## Response

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

| Field         | Description                                                              |
| ------------- | ------------------------------------------------------------------------ |
| `content[]`   | Answer blocks, usually `text`, `thinking` and `tool_use`                 |
| `stop_reason` | `end_turn` finished, `max_tokens` hit the limit, `tool_use` wants a tool |
| `usage`       | Input, output, cache write and cache read tokens                         |

## Streaming response

With `stream: true` events follow Anthropic's format: `message_start` → `content_block_start` → several `content_block_delta` → `content_block_stop` → `message_delta` (with the final usage) → `message_stop`. The official SDKs' `stream` helpers handle them.

## Messages vs Chat Completions

|                | Messages                           | Chat Completions                       |
| -------------- | ---------------------------------- | -------------------------------------- |
| Address        | `{{baseUrl}}/v1/messages`          | `{{baseUrl}}/v1/chat/completions`      |
| System prompt  | Top-level `system`                 | A `system` message in `messages`       |
| `max_tokens`   | Required                           | Optional                               |
| Prompt caching | `cache_control` supported          | No manual caching for Claude           |
| Best for       | Claude and Claude Code-style tools | Every model and OpenAI ecosystem tools |
