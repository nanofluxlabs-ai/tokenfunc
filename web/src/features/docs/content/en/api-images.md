Compatible with the OpenAI image endpoints, for generating images from text and editing existing ones. Image models are listed on the [Model Square](/pricing), for example `{{model}}`.

## Generate images

```http
POST {{baseUrl}}/v1/images/generations
```

:::api-playground{operation="image-generations"}
:::

:::tabs
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

| Parameter         | Type    | Required | Description                                                          |
| ----------------- | ------- | -------- | -------------------------------------------------------------------- |
| `model`           | string  | Yes      | Image model name                                                     |
| `prompt`          | string  | Yes      | What to draw; more detail gives better results                       |
| `n`               | integer | No       | Number of images, default 1, billed per image                        |
| `size`            | string  | No       | Size such as `1024x1024` or `1536x1024`; options depend on the model |
| `quality`         | string  | No       | Quality such as `low` / `medium` / `high`, depending on the model    |
| `response_format` | string  | No       | `url` or `b64_json`. Some models only return `b64_json`              |

Response:

```json
{
  "created": 1760000000,
  "data": [{ "b64_json": "iVBORw0KGgo..." }]
}
```

Returned image URLs usually expire, so download them promptly.

## Edit images

```http
POST {{baseUrl}}/v1/images/edits
```

:::api-playground{operation="image-edits"}
:::

Upload the source image and the instruction as `multipart/form-data`:

:::tabs
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
resp = client.images.edit(
    model="{{model}}",
    image=open("cat.png", "rb"),
    prompt="Give the cat a small red hat",
)
```
:::

| Parameter | Description                                     |
| --------- | ----------------------------------------------- |
| `image`   | The source image; some models accept several    |
| `prompt`  | What to change                                  |
| `mask`    | Optional; transparent areas mark what to change |

## Billing

Image models usually bill per image, with prices varying by size and quality; some bill per token. See the [Model Square](/pricing) for prices.
