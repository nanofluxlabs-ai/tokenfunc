Compatible with the OpenAI image edit endpoint. Requests are sent as `multipart/form-data`. Image models are listed on the [Model Square](/pricing), for example `{{model}}`.

:::endpoint{method="POST" path="/v1/images/edits" operation="image-edits"}
:::

:::request-example
@tab cURL

```bash
curl {{baseUrl}}/v1/images/edits \
  -H "Authorization: Bearer {{apiKey}}" \
  -F model="{{model}}" \
  -F image=@cat.png \
  -F prompt="Give the cat a small red hat"
```

@tab Python

```python
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")

resp = client.images.edit(
    model="{{model}}",
    image=open("cat.png", "rb"),
    prompt="Give the cat a small red hat",
)
```

@tab Node.js

```javascript
import { createReadStream } from 'node:fs'

import OpenAI from 'openai'

const client = new OpenAI({ baseURL: '{{baseUrl}}/v1', apiKey: '{{apiKey}}' })

const resp = await client.images.edit({
  model: '{{model}}',
  image: createReadStream('cat.png'),
  prompt: 'Give the cat a small red hat',
})
```
:::

## Request parameters

:::params
| Parameter | Type   | Required | Description                                  |
| --------- | ------ | -------- | -------------------------------------------- |
| `model`   | string | Yes      | Image model name                             |
| `image`   | file   | Yes      | The source image; some models accept several |
| `prompt`  | string | Yes      | What to change                               |
| `mask`    | file   | No       | Transparent areas mark what to change        |
:::

:::response-example
@tab 200

```json
{
  "created": 1760000000,
  "data": [{ "b64_json": "iVBORw0KGgo..." }]
}
```
:::

The response has the same shape as [Image generation](/docs/api-images). Image URLs usually expire, so download them promptly.

## Billing

Billed the same way as image generation. See the [Model Square](/pricing) for prices.
