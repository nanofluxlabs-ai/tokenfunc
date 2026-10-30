The endpoint compatible with the OpenAI Responses API, OpenAI's newer unified interface. Codex and some other tools only support this endpoint.

:::endpoint{method="POST" path="/v1/responses" operation="responses"}
:::

:::request-example
@tab cURL

```bash
curl {{baseUrl}}/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "instructions": "You are a helpful assistant.",
    "input": "Explain HTTP in one sentence."
  }'
```

@tab Python

```python
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")

resp = client.responses.create(
    model="{{model}}",
    instructions="You are a helpful assistant.",
    input="Explain HTTP in one sentence.",
)
print(resp.output_text)
```

@tab Node.js

```javascript
import OpenAI from 'openai'

const client = new OpenAI({ baseURL: '{{baseUrl}}/v1', apiKey: '{{apiKey}}' })

const resp = await client.responses.create({
  model: '{{model}}',
  instructions: 'You are a helpful assistant.',
  input: 'Explain HTTP in one sentence.',
})
console.log(resp.output_text)
```
:::

## Request parameters

:::params
| Parameter              | Type           | Required | Description                                                                                               |
| ---------------------- | -------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `model`                | string         | Yes      | Model name; it must support Responses (see `supported_endpoint_types` in [List models](/docs/api-models)) |
| `input`                | string / array | Yes      | The input, either text or an array of messages                                                            |
| `instructions`         | string         | No       | System instructions                                                                                       |
| `stream`               | boolean        | No       | Stream the reply                                                                                          |
| `max_output_tokens`    | integer        | No       | Maximum tokens to generate                                                                                |
| `temperature`          | number         | No       | Randomness                                                                                                |
| `tools`                | array          | No       | Tool definitions                                                                                          |
| `reasoning`            | object         | No       | Reasoning settings, for example `{"effort": "medium"}`                                                    |
| `previous_response_id` | string         | No       | Continue from an earlier response                                                                         |
:::

:::response-example
@tab 200

```json
{
  "id": "resp_abc123",
  "object": "response",
  "status": "completed",
  "model": "{{model}}",
  "output": [
    {
      "type": "message",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "HTTP is the protocol browsers and servers use to exchange web pages and other data."
        }
      ]
    }
  ],
  "usage": { "input_tokens": 25, "output_tokens": 22, "total_tokens": 47 }
}
```
:::

The SDKs expose `output_text`, which joins all text output for you.

## Streaming

With `stream: true` you receive a series of events; the common ones are `response.output_text.delta` (text increments) and `response.completed` (the end, with the final usage).

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -N \
  -d '{"model": "{{model}}", "input": "Write a four-line poem about autumn", "stream": true}'
```

@tab Python

```python
stream = client.responses.create(model="{{model}}", input="Write a four-line poem about autumn", stream=True)
for event in stream:
    if event.type == "response.output_text.delta":
        print(event.delta, end="", flush=True)
```

@tab Node.js

```javascript
const stream = await client.responses.create({
  model: '{{model}}',
  input: 'Write a four-line poem about autumn',
  stream: true,
})
for await (const event of stream) {
  if (event.type === 'response.output_text.delta')
    process.stdout.write(event.delta)
}
```
:::

## Examples

### Multi-turn chat

Put the whole conversation in the `input` array, each item a `role` + `content`:

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "input": [
      {"role": "user", "content": "Redis or Memcached?"},
      {"role": "assistant", "content": "Pick Redis for rich data structures or persistence, Memcached for plain caching."},
      {"role": "user", "content": "What if I need persistence?"}
    ]
  }'
```

@tab Python

```python
history = [{"role": "user", "content": "Redis or Memcached?"}]
resp = client.responses.create(model="{{model}}", input=history)

history.append({"role": "assistant", "content": resp.output_text})
history.append({"role": "user", "content": "What if I need persistence?"})
resp = client.responses.create(model="{{model}}", input=history)
print(resp.output_text)
```
:::

### Reasoning effort

Reasoning models take `reasoning.effort` (`minimal` / `low` / `medium` / `high`); higher is slower and uses more output tokens:

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "input": "Design the database tables for a URL shortener",
    "reasoning": {"effort": "low"}
  }'
```

@tab Python

```python
resp = client.responses.create(
    model="{{model}}",
    input="Design the database tables for a URL shortener",
    reasoning={"effort": "low"},
)
print(resp.output_text)
```
:::

## Responses or Chat Completions?

- Tools that only support Responses, such as Codex: this endpoint is the only option.
- Your own code: either works. Chat Completions covers more models and has a more mature ecosystem, so prefer it unless you need Responses.
