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

:::params
| Parameter            | Type    | Required | Description                                                                                                                                                                                                 |
| -------------------- | ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model`              | string  | Yes      | Image model name                                                                                                                                                                                            |
| `prompt`             | string  | Yes      | What to draw; more detail gives better results                                                                                                                                                              |
| `n`                  | integer | No       | Number of images, default 1, billed per image. OpenAI models allow up to 10                                                                                                                                 |
| `size`               | string  | No       | Size, default `auto`. All GPT image models support `1024x1024`, `1536x1024` and `1024x1536`; `gpt-image-2` and newer also accept any `WIDTHxHEIGHT` where both sides are multiples of 16, up to `3840x2160` |
| `quality`            | string  | No       | Quality: `auto` (default), `low`, `medium`, `high`; some newer models also support `xhigh` and `max`                                                                                                        |
| `background`         | string  | No       | Background: `auto` (default), `transparent` or `opaque`. A transparent background needs `png` or `webp` output                                                                                              |
| `output_format`      | string  | No       | Output format: `png` (default), `jpeg` or `webp`                                                                                                                                                            |
| `output_compression` | integer | No       | Compression quality 0–100, default 100; only applies to `jpeg` and `webp`                                                                                                                                   |
| `moderation`         | string  | No       | Moderation level: `auto` (default), or the less strict `low`                                                                                                                                                |
| `stream`             | boolean | No       | `true` streams the result over SSE, default `false`; see "Streaming" below                                                                                                                                  |
| `partial_images`     | integer | No       | How many in-progress preview images to stream first, 0–3, default 0                                                                                                                                         |
| `response_format`    | string  | No       | Deprecated. GPT image models always return `b64_json`; only some other models support `url`                                                                                                                 |
:::

Only common parameters are listed. See the [OpenAI API reference](https://platform.openai.com/docs/api-reference/images/create) for the rest; most are forwarded upstream as is. This site does not forward `safety_identifier`; they are ignored if sent.

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

:::params
| Field                                                   | Description                                                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `data[].b64_json`                                       | The image as Base64; GPT image models always return this                                      |
| `data[].url`                                            | Image URL, returned only by some other models; it usually expires, so download it promptly    |
| `data[].revised_prompt`                                 | The prompt as rewritten by the model, returned only by some models                            |
| `background` / `output_format` / `size` / `quality`     | The background, format, size and quality actually used (returned by GPT image models)         |
| `usage.input_tokens` / `output_tokens` / `total_tokens` | Input / output / total tokens; models billed per token are billed on these                    |
| `usage.input_tokens_details`                            | How the input tokens split between text and reference images (`text_tokens` / `image_tokens`) |
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
