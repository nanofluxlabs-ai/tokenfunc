Compatible with the OpenAI image edit endpoint. Send image files as `multipart/form-data`, or pass image URLs as JSON (see "JSON requests" below). Image models are listed on the [Model Square](/pricing), for example `{{model}}`.

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
| Parameter            | Type    | Required | Description                                                                                                                                                  |
| -------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `model`              | string  | Yes      | Image model name                                                                                                                                             |
| `image`              | file    | Yes      | The source image, `png`, `webp` or `jpg`, under 50MB each. For several images use the field name `image[]`, up to 16                                         |
| `prompt`             | string  | Yes      | What to change                                                                                                                                               |
| `mask`               | file    | No       | Mask whose fully transparent areas mark what to change. Must be a PNG under 4MB with the same size as the image; with several images it applies to the first |
| `input_fidelity`     | string  | No       | How closely to keep the source's style and details such as faces: `low` (default) or `high`. Leave it out for `gpt-image-2`                                  |
| `n`                  | integer | No       | Number of images, default 1, billed per image. OpenAI models allow up to 10                                                                                  |
| `size`               | string  | No       | Size, default `auto`; same rules as [Image generation](/docs/api-images)                                                                                     |
| `quality`            | string  | No       | Quality, default `auto`; same values as image generation                                                                                                     |
| `background`         | string  | No       | Background: `auto` (default), `transparent` or `opaque`. A transparent background needs `png` or `webp` output                                               |
| `output_format`      | string  | No       | Output format: `png` (default), `jpeg` or `webp`                                                                                                             |
| `output_compression` | integer | No       | Compression quality 0–100, default 100; only applies to `jpeg` and `webp`                                                                                    |
| `stream`             | boolean | No       | `true` streams the result over SSE, with `image_edit.partial_image` and `image_edit.completed` events                                                        |
| `partial_images`     | integer | No       | How many in-progress preview images to stream first, 0–3, default 0                                                                                          |
| `response_format`    | string  | No       | Deprecated. GPT image models always return `b64_json`; only some other models support `url`                                                                  |
:::

Only common parameters are listed. See the [OpenAI API reference](https://platform.openai.com/docs/api-reference/images/createEdit) for the rest; most are forwarded upstream as is. This site does not forward `markup` and `safety_identifier`; they are ignored if sent.

:::response-example
@tab 200

```json
{
  "created": 1760000000,
  "data": [{ "b64_json": "iVBORw0KGgo..." }]
}
```
:::

The response has the same shape as [Image generation](/docs/api-images), including `usage` and the other fields. Image URLs usually expire, so download them promptly.

## JSON requests

If uploading files is inconvenient, send JSON instead: put the source images in an `images` array, each item `{"image_url": "..."}` holding an image URL or a Base64 data URL. `mask` takes the same form, and the other parameters match the table above.

```bash
curl {{baseUrl}}/v1/images/edits \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "images": [{ "image_url": "https://example.com/cat.png" }],
    "prompt": "Give the cat a small red hat"
  }'
```

## Billing

Billed the same way as image generation. See the [Model Square](/pricing) for prices.
