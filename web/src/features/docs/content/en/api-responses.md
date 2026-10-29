The endpoint compatible with the OpenAI Responses API, OpenAI's newer unified interface. Codex and some other tools only support this endpoint.

```http
POST {{baseUrl}}/v1/responses
```

## Request

:::tabs
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

## Response

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

The SDKs expose `output_text`, which joins all text output for you.

## Streaming response

With `stream: true` you receive a series of events; the common ones are `response.output_text.delta` (text increments) and `response.completed` (the end, with the final usage).

## Responses or Chat Completions?

- Tools that only support Responses, such as Codex: this endpoint is the only option.
- Your own code: either works. Chat Completions covers more models and has a more mature ecosystem, so prefer it unless you need Responses.
