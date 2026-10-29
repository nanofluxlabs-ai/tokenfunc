This page shows the everyday chat patterns on the OpenAI-compatible [Chat Completions](/docs/api-chat-completions) endpoint. Every text model on this site, Claude, Gemini and DeepSeek included, can be called this way; just change `model`.

## Install the SDK

:::tabs
@tab Python

```bash
pip install openai
```

@tab Node.js

```bash
npm install openai
```
:::

## System prompt and multi-turn chat

`messages` holds the whole conversation in order: `system` sets the role and rules, `user` is what the user said, `assistant` holds earlier model replies. The model does not remember previous requests, so **send the full history every time**.

:::tabs
@tab Python

```python
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")

messages = [
    {"role": "system", "content": "You are a concise technical advisor. Answer in at most three sentences."},
    {"role": "user", "content": "Redis or Memcached?"},
]

resp = client.chat.completions.create(model="{{model}}", messages=messages)
answer = resp.choices[0].message.content
print(answer)

# For a follow-up, add the previous reply to the history and send again
messages.append({"role": "assistant", "content": answer})
messages.append({"role": "user", "content": "What if I need persistence?"})
resp = client.chat.completions.create(model="{{model}}", messages=messages)
print(resp.choices[0].message.content)
```

@tab Node.js

```javascript
import OpenAI from 'openai'

const client = new OpenAI({ baseURL: '{{baseUrl}}/v1', apiKey: '{{apiKey}}' })

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
const answer = resp.choices[0].message.content
console.log(answer)

// For a follow-up, add the previous reply to the history and send again
messages.push({ role: 'assistant', content: answer })
messages.push({ role: 'user', content: 'What if I need persistence?' })
resp = await client.chat.completions.create({ model: '{{model}}', messages })
console.log(resp.choices[0].message.content)
```

@tab cURL

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "messages": [
      {"role": "system", "content": "You are a concise technical advisor. Answer in at most three sentences."},
      {"role": "user", "content": "Redis or Memcached?"}
    ]
  }'
```
:::

## Streaming

With `stream: true` the reply arrives in small pieces, so users see the first words immediately and long replies are less likely to time out. Chat interfaces should almost always stream.

:::tabs
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
:::

A streamed response is a series of `data: {...}` lines, each a `chat.completion.chunk`, ending with `data: [DONE]`. This site adds a final chunk with `usage` by default so you can count tokens; pass `"stream_options": {"include_usage": false}` if you do not want it.

## Common parameters

| Parameter     | What it does                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `max_tokens`  | Caps the output per call so replies and costs stay bounded                                          |
| `temperature` | Randomness, 0 to 2. Low (such as 0.2) for code and extraction, higher (such as 1) for creative work |
| `stop`        | Stops output at the given string                                                                    |
| `n`           | Number of candidate replies; billed on the total output                                             |

All parameters: [Chat Completions](/docs/api-chat-completions).

## Keeping costs down

- Longer conversations resend more history and cost more input. After a number of turns, keep only the latest few or ask the model to summarize earlier ones.
- Put long, fixed system prompts first so they hit the [prompt cache](/docs/examples-prompt-caching) more often.
- Usage Logs in the console shows the tokens and cost of every request.
