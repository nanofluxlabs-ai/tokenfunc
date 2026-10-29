Returns the models the current key can call. The list is already filtered by the key's group and model limits, so it reflects what this key can actually use better than the [Model Square](/pricing).

```http
GET {{baseUrl}}/v1/models
```

## Request

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/models -H "Authorization: Bearer {{apiKey}}"
```

@tab Python

```python
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")
for model in client.models.list():
    print(model.id)
```

@tab Node.js

```javascript
import OpenAI from 'openai'

const client = new OpenAI({ baseURL: '{{baseUrl}}/v1', apiKey: '{{apiKey}}' })
for await (const model of client.models.list()) {
  console.log(model.id)
}
```
:::

## Response

```json
{
  "object": "list",
  "success": true,
  "data": [
    {
      "id": "{{model:gpt}}",
      "object": "model",
      "created": 1626777600,
      "owned_by": "openai",
      "supported_endpoint_types": ["openai", "openai-response"]
    },
    {
      "id": "{{model:claude}}",
      "object": "model",
      "created": 1626777600,
      "owned_by": "anthropic",
      "supported_endpoint_types": ["anthropic", "openai"]
    }
  ]
}
```

| Field                             | Description                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `data[].id`                       | The model name to pass as `model`                                                                                               |
| `data[].owned_by`                 | The vendor of the model                                                                                                         |
| `data[].created`                  | When the record was created (Unix seconds), not the model's release date                                                        |
| `data[].supported_endpoint_types` | Endpoint formats the model supports, such as `openai` (Chat Completions), `openai-response` (Responses), `anthropic` (Messages) |

## Other formats

The same address answers in the format each SDK expects, based on the headers:

| Request                                          | Response format                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `Authorization: Bearer`                          | OpenAI format (above)                                                                      |
| Both `x-api-key` and `anthropic-version` headers | Anthropic format: `{"data": [{"id", "display_name", "type": "model"}], "has_more": false}` |
| `GET /v1beta/models`, or with `x-goog-api-key`   | Gemini format: `{"models": [{"name", "displayName"}]}`                                     |
