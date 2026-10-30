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
| Parameter              | Type            | Required | Description                                                                                                                                                                                                                          |
| ---------------------- | --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `model`                | string          | Yes      | Model name; it must support Responses (see `supported_endpoint_types` in [List models](/docs/api-models))                                                                                                                            |
| `input`                | string / array  | Yes      | The input, either text or an array of messages                                                                                                                                                                                       |
| `instructions`         | string          | No       | System instructions                                                                                                                                                                                                                  |
| `stream`               | boolean         | No       | Stream the reply                                                                                                                                                                                                                     |
| `max_output_tokens`    | integer         | No       | Maximum tokens to generate, reasoning tokens included                                                                                                                                                                                |
| `temperature`          | number          | No       | Randomness, 0 to 2; usually tune this or `top_p`, not both                                                                                                                                                                           |
| `top_p`                | number          | No       | Nucleus sampling, 0 to 1                                                                                                                                                                                                             |
| `tools`                | array           | No       | Tool definitions                                                                                                                                                                                                                     |
| `tool_choice`          | string / object | No       | `auto` / `none` / `required`, or a specific tool                                                                                                                                                                                     |
| `parallel_tool_calls`  | boolean         | No       | Whether several tools may be called at once                                                                                                                                                                                          |
| `max_tool_calls`       | integer         | No       | Maximum total calls to built-in tools in this response                                                                                                                                                                               |
| `reasoning`            | object          | No       | Reasoning settings, for example `{"effort": "medium"}`; values in [Reasoning effort](#reasoning-effort) below                                                                                                                        |
| `reasoning.summary`    | string          | No       | Return a reasoning summary: `auto` / `concise` / `detailed`; OpenAI does not return the full reasoning                                                                                                                               |
| `text`                 | object          | No       | Output settings: `format` for structured output (such as `{"type": "json_schema", ...}`), `verbosity` for length (`low` / `medium` / `high`)                                                                                         |
| `include`              | array           | No       | Extra data to return, such as `reasoning.encrypted_content` (to pass reasoning back across turns without storage)                                                                                                                    |
| `previous_response_id` | string          | No       | Continue from an earlier response. OpenAI models only; Claude / Gemini return an error. With several channels, send the same `prompt_cache_key`, otherwise send the history yourself as in [Multi-turn chat](#multi-turn-chat) below |
| `store`                | boolean         | No       | Whether the upstream keeps this response; OpenAI defaults to `true`, and `previous_response_id` depends on it                                                                                                                        |
| `prompt_cache_key`     | string          | No       | Cache grouping key; send the same value within a conversation to raise the cache hit rate and keep it on one channel                                                                                                                 |
| `metadata`             | object          | No       | Your own key-value tags, returned with the response                                                                                                                                                                                  |
:::

Only common parameters are listed. See the [OpenAI API reference](https://platform.openai.com/docs/api-reference/responses/create) for the rest; most are forwarded upstream as is. This site does not forward `service_tier`, `safety_identifier`, `background`, `access_programs` and `stream_options.include_obfuscation`; they are ignored if sent.

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

## Response fields

:::params
| Field                                                   | Description                                                                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `status`                                                | Response status: `completed` finished, `incomplete` cut short (see `incomplete_details`), `failed` failed               |
| `incomplete_details.reason`                             | Why it is incomplete, such as `max_output_tokens` hit the token limit or `content_filter` blocked by content moderation |
| `output[].type`                                         | Output item type: `message` the answer, `reasoning` reasoning (summary), `function_call` wants a tool                   |
| `output[].content[].text`                               | Answer text (in content items whose `type` is `output_text`)                                                            |
| `usage.input_tokens` / `output_tokens` / `total_tokens` | Input / output / total tokens, the basis for billing                                                                    |
| `usage.input_tokens_details.cached_tokens`              | Input tokens served from the cache                                                                                      |
| `usage.output_tokens_details.reasoning_tokens`          | Tokens spent on reasoning, already counted in `output_tokens`                                                           |
:::

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

Reasoning models take `reasoning.effort` (`none` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max`; supported values vary by model); higher is slower and uses more output tokens:

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
