Compatible with the OpenAI image generation endpoint: describe a picture in text and get an image back. Image models are listed on the [Model Square](/pricing), for example `{{model}}`. To change an existing image, see [Image edits](/docs/api-image-edits).

:::endpoint{method="POST" path="/v1/images/generations" operation="image-generations"}
:::

:::request-example
@tab cURL

```bash
curl {{baseUrl}}/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "prompt": "An orange cat wearing a scarf sitting on a windowsill, watercolor style",
    "size": "1024x1024",
    "n": 1
  }'
```

@tab Python

```python
import base64
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")

resp = client.images.generate(
    model="{{model}}",
    prompt="An orange cat wearing a scarf sitting on a windowsill, watercolor style",
    size="1024x1024",
)
image = resp.data[0]
if image.b64_json:
    with open("cat.png", "wb") as f:
        f.write(base64.b64decode(image.b64_json))
else:
    print(image.url)
```

@tab Node.js

```javascript
import { writeFileSync } from 'node:fs'

import OpenAI from 'openai'

const client = new OpenAI({ baseURL: '{{baseUrl}}/v1', apiKey: '{{apiKey}}' })

const resp = await client.images.generate({
  model: '{{model}}',
  prompt:
    'An orange cat wearing a scarf sitting on a windowsill, watercolor style',
  size: '1024x1024',
})
const image = resp.data[0]
if (image.b64_json)
  writeFileSync('cat.png', Buffer.from(image.b64_json, 'base64'))
else console.log(image.url)
```
:::

## Request parameters

:::schema{operation="images-generate" part="request"}
:::

:::response-example
@tab 200

```json
{
  "created": 1760000000,
  "data": [{ "b64_json": "iVBORw0KGgo..." }],
  "background": "opaque",
  "output_format": "png",
  "size": "1024x1024",
  "quality": "medium",
  "usage": {
    "total_tokens": 1102,
    "input_tokens": 46,
    "output_tokens": 1056,
    "input_tokens_details": { "text_tokens": 46, "image_tokens": 0 }
  }
}
```
:::

## Response fields

:::schema{operation="images-generate" part="response"}
:::

## Streaming

With `stream: true` the result comes back over SSE. If you set `partial_images`, you first get a few `image_generation.partial_image` events (in-progress previews); the final `image_generation.completed` event carries the finished image and `usage`:

```text
event: image_generation.partial_image
data: {"type":"image_generation.partial_image","b64_json":"...","partial_image_index":0}

event: image_generation.completed
data: {"type":"image_generation.completed","b64_json":"...","usage":{"total_tokens":1102,"input_tokens":46,"output_tokens":1056,"input_tokens_details":{"text_tokens":46,"image_tokens":0}}}
```

## Billing

Image models usually bill per image, with prices varying by size and quality; some bill per token. See the [Model Square](/pricing) for prices.
