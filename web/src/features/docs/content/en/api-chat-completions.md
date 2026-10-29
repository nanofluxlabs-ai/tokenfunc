The chat endpoint compatible with OpenAI Chat Completions, and the most widely supported way to call models. Every text model on this site, Claude, Gemini and DeepSeek included, works in this format; just change `model` and this site converts automatically.

```http
POST {{baseUrl}}/v1/chat/completions
```

:::api-playground{operation="chat-completions"}
:::

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
# pip install openai
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
// npm install openai
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

| Parameter             | Type            | Required | Description                                                                                                                         |
| --------------------- | --------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `model`               | string          | Yes      | Model name, see [List models](/docs/api-models)                                                                                     |
| `messages`            | array           | Yes      | The conversation; each message has a `role` (`system` / `user` / `assistant` / `tool`) and `content`                                |
| `stream`              | boolean         | No       | Stream the reply as SSE when `true`. Default `false`                                                                                |
| `stream_options`      | object          | No       | Streaming options. This site returns usage at the end by default; pass `{"include_usage": false}` to turn it off                    |
| `max_tokens`          | integer         | No       | Maximum tokens to generate. Some newer models use `max_completion_tokens`                                                           |
| `temperature`         | number          | No       | Randomness, 0 to 2. Low (such as 0.2) for code and extraction, higher (such as 1) for creative work                                 |
| `top_p`               | number          | No       | Nucleus sampling, 0 to 1; usually tune this or `temperature`, not both                                                              |
| `stop`                | string / array  | No       | Stop generating at these strings                                                                                                    |
| `n`                   | integer         | No       | Number of candidate replies; billed on the total output                                                                             |
| `tools`               | array           | No       | Tools the model may call, see [Tool calling](#tool-calling) below                                                                   |
| `tool_choice`         | string / object | No       | `auto` / `none` / `required`, or a specific tool                                                                                    |
| `parallel_tool_calls` | boolean         | No       | Whether several tools may be called at once                                                                                         |
| `response_format`     | object          | No       | Structured output, see [Structured output](#structured-output) below                                                                |
| `reasoning_effort`    | string          | No       | Reasoning effort: `none` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max`, see [Reasoning models](#reasoning-models) below |
| `user`                | string          | No       | Your end-user identifier, useful for troubleshooting                                                                                |

Besides a string, `content` can be an array that mixes text and images, see [Vision](#vision) below.

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

## Streaming

With `stream: true` the reply arrives in small pieces, so users see the first words immediately and long replies are less likely to time out. Chat interfaces should almost always stream.

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -N \
  -d '{
    "model": "{{model}}",
    "messages": [{"role": "user", "content": "Write a four-line poem about autumn"}],
    "stream": true
  }'
```

@tab Python

```python
stream = client.chat.completions.create(
    model="{{model}}",
    messages=[{"role": "user", "content": "Write a four-line poem about autumn"}],
    stream=True,
)
for chunk in stream:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
    if chunk.usage:  # the last chunk carries the usage
        print(f"\n\ninput {chunk.usage.prompt_tokens} / output {chunk.usage.completion_tokens} tokens")
```

@tab Node.js

```javascript
const stream = await client.chat.completions.create({
  model: '{{model}}',
  messages: [{ role: 'user', content: 'Write a four-line poem about autumn' }],
  stream: true,
})
for await (const chunk of stream) {
  const text = chunk.choices[0]?.delta?.content
  if (text) process.stdout.write(text)
  if (chunk.usage) {
    // the last chunk carries the usage
    console.log(
      `\n\ninput ${chunk.usage.prompt_tokens} / output ${chunk.usage.completion_tokens} tokens`
    )
  }
}
```
:::

The response is `text/event-stream`, one `chat.completion.chunk` per line with the new content in `choices[0].delta`, ending with `data: [DONE]`:

```text
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"Hel"}}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"lo!"}}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[],"usage":{"prompt_tokens":20,"completion_tokens":9,"total_tokens":29}}

data: [DONE]
```

This site adds a final chunk with `usage` by default so you can count tokens; pass `"stream_options": {"include_usage": false}` if you do not want it.

## Examples

### Multi-turn chat

The model does not remember earlier requests, so **send the full conversation every time**: `system` sets the role and rules, `user` is what the user said, `assistant` holds earlier model replies.

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "messages": [
      {"role": "system", "content": "You are a concise technical advisor. Answer in at most three sentences."},
      {"role": "user", "content": "Redis or Memcached?"},
      {"role": "assistant", "content": "Pick Redis for rich data structures or persistence, Memcached for plain caching."},
      {"role": "user", "content": "What if I need persistence?"}
    ]
  }'
```

@tab Python

```python
messages = [
    {"role": "system", "content": "You are a concise technical advisor. Answer in at most three sentences."},
    {"role": "user", "content": "Redis or Memcached?"},
]
resp = client.chat.completions.create(model="{{model}}", messages=messages)
answer = resp.choices[0].message.content

# For a follow-up, add the previous reply to the history and send again
messages.append({"role": "assistant", "content": answer})
messages.append({"role": "user", "content": "What if I need persistence?"})
resp = client.chat.completions.create(model="{{model}}", messages=messages)
print(resp.choices[0].message.content)
```

@tab Node.js

```javascript
const messages = [
  {
    role: 'system',
    content:
      'You are a concise technical advisor. Answer in at most three sentences.',
  },
  { role: 'user', content: 'Redis or Memcached?' },
]
let resp = await client.chat.completions.create({
  model: '{{model}}',
  messages,
})

// For a follow-up, add the previous reply to the history and send again
messages.push({ role: 'assistant', content: resp.choices[0].message.content })
messages.push({ role: 'user', content: 'What if I need persistence?' })
resp = await client.chat.completions.create({ model: '{{model}}', messages })
console.log(resp.choices[0].message.content)
```
:::

Longer conversations resend more history and cost more input. After a number of turns, keep only the latest few or ask the model to summarize earlier ones.

### Reasoning models

Reasoning models think before they answer, which helps with math, coding and multi-step analysis. Reasoning is billed as output tokens. This site controls reasoning the same way across vendors:

| Control                      | Form                                                             | Applies to                                 |
| ---------------------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| `reasoning_effort` parameter | `none` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max` | GPT, Claude, Gemini and others             |
| Model name suffix            | For example `-high`, `-thinking`                                 | Tools that only let you enter a model name |

When a model returns its reasoning, it is in `reasoning_content`, separate from the final `content`; when streaming, in `delta.reasoning_content`.

**DeepSeek**: reasoning models return their reasoning automatically. `deepseek-flash` and the `deepseek-v4` family accept the suffixes `-none` (reasoning off) and `-low` / `-max` (effort), for example `deepseek-v4-pro-none`.

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model:deepseek}}",
    "messages": [{"role": "user", "content": "Which is larger, 9.11 or 9.9?"}]
  }'
```

@tab Python

```python
resp = client.chat.completions.create(
    model="{{model:deepseek}}",
    messages=[{"role": "user", "content": "Which is larger, 9.11 or 9.9?"}],
)
msg = resp.choices[0].message
print("Reasoning:", getattr(msg, "reasoning_content", None))
print("Answer:", msg.content)
```

@tab Node.js

```javascript
const resp = await client.chat.completions.create({
  model: '{{model:deepseek}}',
  messages: [{ role: 'user', content: 'Which is larger, 9.11 or 9.9?' }],
})
console.log('Reasoning:', resp.choices[0].message.reasoning_content)
console.log('Answer:', resp.choices[0].message.content)
```
:::

**Claude**: pass `reasoning_effort` to turn on thinking. The thinking budget is a share of `max_tokens` (about 80% for `high`), so raise `max_tokens` when thinking is on; it defaults to 8192. In tools that only take a model name, use suffixes: `{{model:claude}}-thinking` on, `{{model:claude}}-thinking-8000` for an 8000-token budget, `{{model:claude}}-nothinking` off.

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model:claude}}",
    "messages": [{"role": "user", "content": "Prove that the square root of 2 is irrational"}],
    "reasoning_effort": "high",
    "max_tokens": 16000
  }'
```

@tab Python

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
:::

**GPT**: `reasoning_effort` sets how hard it thinks; higher is slower and uses more output tokens. OpenAI does not return the full reasoning; `usage.completion_tokens_details.reasoning_tokens` shows how many tokens it used. Suffixes such as `{{model:gpt}}-high` and `{{model:gpt}}-low` work too.

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model:gpt}}",
    "messages": [{"role": "user", "content": "Design the database tables for a URL shortener"}],
    "reasoning_effort": "low"
  }'
```

**Gemini**: `reasoning_effort` sets the effort. To receive the reasoning text, use the `reasoning` object with `exclude: false`.

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model:gemini}}",
    "messages": [{"role": "user", "content": "A basket has 5 apples. You take 2 and put 1 back. How many are left?"}],
    "reasoning": {"effort": "medium", "exclude": false}
  }'
```

:::warning
In multi-turn chats, **do not** send the previous `reasoning_content` back in `messages`. Send only `content`, or some models reject the request.
:::

### Vision

Vision models can read images: describe them, extract text, understand charts and screenshots. Put images in the `content` array; you can mix text and several images. The [Model Square](/pricing) shows which models accept images.

Image URLs must be publicly reachable (no login, no hotlink protection):

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "What is in this image? Answer in one sentence."},
        {"type": "image_url", "image_url": {"url": "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png"}}
      ]
    }]
  }'
```

@tab Python

```python
resp = client.chat.completions.create(
    model="{{model}}",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "What is in this image? Answer in one sentence."},
            {"type": "image_url", "image_url": {"url": "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png"}},
        ],
    }],
)
print(resp.choices[0].message.content)
```

@tab Node.js

```javascript
const resp = await client.chat.completions.create({
  model: '{{model}}',
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'What is in this image? Answer in one sentence.',
        },
        {
          type: 'image_url',
          image_url: {
            url: 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png',
          },
        },
      ],
    },
  ],
})
console.log(resp.choices[0].message.content)
```
:::

For local files or private-network images, send Base64 as a `data:` URL whose type matches the real format (`image/jpeg`, `image/png`, `image/webp`, `image/gif`):

:::tabs
@tab cURL

```bash
IMG=$(base64 < receipt.jpg | tr -d '\n')
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "Extract the merchant, date and total from this receipt"},
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,'"$IMG"'"}}
      ]
    }]
  }'
```

@tab Python

```python
import base64

with open("receipt.jpg", "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

resp = client.chat.completions.create(
    model="{{model}}",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "Extract the merchant, date and total from this receipt"},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
        ],
    }],
)
print(resp.choices[0].message.content)
```

@tab Node.js

```javascript
import { readFileSync } from 'node:fs'

const b64 = readFileSync('receipt.jpg').toString('base64')
const resp = await client.chat.completions.create({
  model: '{{model}}',
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Extract the merchant, date and total from this receipt',
        },
        {
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${b64}` },
        },
      ],
    },
  ],
})
console.log(resp.choices[0].message.content)
```
:::

- Images are billed as input tokens based on their size. Scaling the long side to about 1500 pixels keeps them sharp and cheap.
- Base64 makes the request body bigger; an oversized image may return `413`. Compress it first.
- Image URLs are downloaded by this site or the model provider, so a URL that is unreachable, behind a login or hotlink-protected fails. Use Base64 in that case.

### Tool calling

Tool calling (function calling) lets the model "call" functions you write: you describe the functions, the model decides when to call one and with which arguments, you run it and send the result back, and the model answers with it. This works the same for Claude, Gemini and other models.

```text
1. You: send the question + tool definitions
2. Model: returns tool_calls (which function, which arguments)
3. You: run the function locally and send the result as a role=tool message
4. Model: answers using the result
```

:::tabs
@tab cURL

```bash
# Step 1: send the question and the tool definitions; the model returns tool_calls
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "messages": [{"role": "user", "content": "What is the weather in Paris today? Good for a run?"}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get the current weather for a city",
        "parameters": {
          "type": "object",
          "properties": {"city": {"type": "string", "description": "City name, e.g. Paris"}},
          "required": ["city"]
        }
      }
    }]
  }'
```

@tab Python

```python
import json

def get_weather(city: str) -> dict:
    # In a real project, call a weather API here
    return {"city": city, "weather": "sunny", "temperature": 23}

tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Get the current weather for a city",
        "parameters": {
            "type": "object",
            "properties": {"city": {"type": "string", "description": "City name, e.g. Paris"}},
            "required": ["city"],
        },
    },
}]
messages = [{"role": "user", "content": "What is the weather in Paris today? Good for a run?"}]

# Step 1: the model decides whether to call a tool
resp = client.chat.completions.create(model="{{model}}", messages=messages, tools=tools)
msg = resp.choices[0].message
messages.append(msg)  # keep the model's reply (with tool_calls) in the history

# Step 2: run every call the model asked for and send the results back
for call in msg.tool_calls or []:
    result = get_weather(**json.loads(call.function.arguments))
    messages.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result)})

# Step 3: the model answers with the tool results
final = client.chat.completions.create(model="{{model}}", messages=messages, tools=tools)
print(final.choices[0].message.content)
```

@tab Node.js

```javascript
function getWeather({ city }) {
  // In a real project, call a weather API here
  return { city, weather: 'sunny', temperature: 23 }
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get the current weather for a city',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name, e.g. Paris' },
        },
        required: ['city'],
      },
    },
  },
]
const messages = [
  {
    role: 'user',
    content: 'What is the weather in Paris today? Good for a run?',
  },
]

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

The model may return several `tool_calls` at once; run them all and attach the matching `tool_call_id` to each result. `tool_choice` controls tool use:

| Value                                                       | Meaning                           |
| ----------------------------------------------------------- | --------------------------------- |
| `"auto"` (default)                                          | The model decides whether to call |
| `"none"`                                                    | No tool calls, answer directly    |
| `"required"`                                                | Must call at least one tool       |
| `{"type": "function", "function": {"name": "get_weather"}}` | Must call that tool               |

- Say in `description` when the tool should be used; that is what the model goes by.
- Constrain arguments with `enum`, mark mandatory ones in `required`, and keep tool results short.
- Never run dangerous actions (deleting data, moving money) straight from model arguments. Validate first.

### Structured output

When a program consumes the output, have the model return strict JSON.

| Approach    | Form                                              | Result                                                             |
| ----------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| JSON mode   | `"response_format": {"type": "json_object"}`      | Valid JSON; the prompt describes the shape and must mention "JSON" |
| JSON Schema | `"response_format": {"type": "json_schema", ...}` | Output strictly matches your schema                                |

:::warning
`response_format` works with GPT, Gemini and OpenAI-compatible models that support it. **It has no effect when calling Claude on this endpoint.** For Claude, use [tool calling](#tool-calling) to force a tool whose parameters are the JSON you want, and read the tool arguments.
:::

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "messages": [{"role": "user", "content": "What is the sentiment of this review? \"Shipping was slow, but the quality is great\""}],
    "response_format": {
      "type": "json_schema",
      "json_schema": {
        "name": "sentiment",
        "strict": true,
        "schema": {
          "type": "object",
          "properties": {
            "sentiment": {"type": "string", "enum": ["positive", "negative", "mixed"]},
            "reasons": {"type": "array", "items": {"type": "string"}}
          },
          "required": ["sentiment", "reasons"],
          "additionalProperties": false
        }
      }
    }
  }'
```

@tab Python

```python
from pydantic import BaseModel

class Sentiment(BaseModel):
    sentiment: str
    reasons: list[str]

# The SDK turns the Pydantic class into a JSON Schema and parses the result back
resp = client.beta.chat.completions.parse(
    model="{{model}}",
    messages=[{"role": "user", "content": "What is the sentiment of this review? \"Shipping was slow, but the quality is great\""}],
    response_format=Sentiment,
)
print(resp.choices[0].message.parsed)
```
:::

Even in JSON mode, handle parse failures in code, for example output cut off because `max_tokens` was too low.

### Checking cache hits

GPT, DeepSeek, Gemini and similar models cache long identical prefixes automatically (usually 1024 tokens or more) and bill hits at the lower cache price, with no code changes. `usage.prompt_tokens_details.cached_tokens` is the input served from the cache.

- Put unchanging content first: system prompt → tool definitions → reference documents → history → the current question.
- Keep timestamps and random values out of the system prompt.
- Claude needs explicit cache markers, which only work on the [Anthropic Messages](/docs/api-messages) endpoint; see "Prompt caching" there.
