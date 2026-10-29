The chat endpoint compatible with OpenAI Chat Completions, and the most widely supported way to call models. Claude, Gemini, DeepSeek and others work in this format too; this site converts automatically.

```http
POST {{baseUrl}}/v1/chat/completions
```

## Request

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

@tab Python

```python
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")

resp = client.chat.completions.create(
    model="{{model}}",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"},
    ],
)
print(resp.choices[0].message.content)
```

@tab Node.js

```javascript
import OpenAI from 'openai'

const client = new OpenAI({ baseURL: '{{baseUrl}}/v1', apiKey: '{{apiKey}}' })

const resp = await client.chat.completions.create({
  model: '{{model}}',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' },
  ],
})
console.log(resp.choices[0].message.content)
```
:::

## Request parameters

| Parameter             | Type            | Required | Description                                                                                                                          |
| --------------------- | --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `model`               | string          | Yes      | Model name, see [List models](/docs/api-models)                                                                                      |
| `messages`            | array           | Yes      | The conversation; each message has a `role` (`system` / `user` / `assistant` / `tool`) and `content`                                 |
| `stream`              | boolean         | No       | Stream the reply as SSE when `true`. Default `false`                                                                                 |
| `stream_options`      | object          | No       | Streaming options. This site returns usage at the end by default; pass `{"include_usage": false}` to turn it off                     |
| `max_tokens`          | integer         | No       | Maximum tokens to generate. Some newer models use `max_completion_tokens`                                                            |
| `temperature`         | number          | No       | Randomness, 0 to 2                                                                                                                   |
| `top_p`               | number          | No       | Nucleus sampling, 0 to 1; usually tune this or `temperature`, not both                                                               |
| `stop`                | string / array  | No       | Stop generating at these strings                                                                                                     |
| `n`                   | integer         | No       | Number of candidate replies                                                                                                          |
| `tools`               | array           | No       | Tools the model may call, see [Tool calling](/docs/examples-tools)                                                                   |
| `tool_choice`         | string / object | No       | `auto` / `none` / `required`, or a specific tool                                                                                     |
| `parallel_tool_calls` | boolean         | No       | Whether several tools may be called at once                                                                                          |
| `response_format`     | object          | No       | Structured output, see [Structured output](/docs/examples-structured-output)                                                         |
| `reasoning_effort`    | string          | No       | Reasoning effort: `none` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max`, see [Reasoning models](/docs/examples-reasoning) |
| `user`                | string          | No       | Your end-user identifier, useful for troubleshooting                                                                                 |

Besides a string, `content` can be an array that mixes text and images, see [Vision](/docs/examples-vision).

## Response

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1760000000,
  "model": "{{model}}",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 9,
    "total_tokens": 29,
    "prompt_tokens_details": { "cached_tokens": 0 }
  }
}
```

| Field                                       | Description                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `choices[].message.content`                 | The model's answer                                                                                |
| `choices[].message.reasoning_content`       | Reasoning text (only some reasoning models)                                                       |
| `choices[].message.tool_calls`              | Tools the model wants to call                                                                     |
| `choices[].finish_reason`                   | Why it stopped: `stop` finished normally, `length` hit the token limit, `tool_calls` wants a tool |
| `usage.prompt_tokens` / `completion_tokens` | Input / output tokens, the basis for billing                                                      |
| `usage.prompt_tokens_details.cached_tokens` | Input tokens served from the cache                                                                |

## Streaming response

With `stream: true` the response is `text/event-stream`, one chunk per line, with the new content in `choices[0].delta`, ending with `data: [DONE]`:

```text
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"Hel"}}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"lo!"}}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[],"usage":{"prompt_tokens":20,"completion_tokens":9,"total_tokens":29}}

data: [DONE]
```

Full reading code is in [Chat and streaming](/docs/examples-chat).
