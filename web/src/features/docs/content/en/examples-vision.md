Vision models can read images: describe them, extract text, and understand charts and screenshots. Put images in the `content` array; you can mix text and several images.

The [Model Square](/pricing) shows which models accept images. Images sent in the Chat Completions format are converted for Claude, Gemini and other models automatically.

## By image URL

The URL must be publicly reachable (no login, no hotlink protection).

:::tabs
@tab Python

```python
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")

resp = client.chat.completions.create(
    model="{{model}}",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "What is in this image? Answer in one sentence."},
            {"type": "image_url", "image_url": {"url": "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png"}},
        ],
    }],
)
print(resp.choices[0].message.content)
```

@tab Node.js

```javascript
import OpenAI from 'openai'

const client = new OpenAI({ baseURL: '{{baseUrl}}/v1', apiKey: '{{apiKey}}' })

const resp = await client.chat.completions.create({
  model: '{{model}}',
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'What is in this image? Answer in one sentence.',
        },
        {
          type: 'image_url',
          image_url: {
            url: 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png',
          },
        },
      ],
    },
  ],
})
console.log(resp.choices[0].message.content)
```

@tab cURL

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "What is in this image? Answer in one sentence."},
        {"type": "image_url", "image_url": {"url": "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png"}}
      ]
    }]
  }'
```
:::

## Local images (Base64)

For local files or images on a private network, encode them as Base64 and send a `data:` URL:

:::tabs
@tab Python

```python
import base64

with open("receipt.jpg", "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

resp = client.chat.completions.create(
    model="{{model}}",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "Extract the merchant, date and total from this receipt as JSON."},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
        ],
    }],
)
print(resp.choices[0].message.content)
```

@tab Node.js

```javascript
import { readFileSync } from 'node:fs'

const b64 = readFileSync('receipt.jpg').toString('base64')

const resp = await client.chat.completions.create({
  model: '{{model}}',
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Extract the merchant, date and total from this receipt as JSON.',
        },
        {
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${b64}` },
        },
      ],
    },
  ],
})
console.log(resp.choices[0].message.content)
```
:::

The type after `data:` must match the real format: `image/jpeg`, `image/png`, `image/webp` or `image/gif`.

## In the Anthropic format

On the [Messages](/docs/api-messages) endpoint, use Anthropic's `image` block:

```json
{
  "model": "{{model:claude}}",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": "<Base64 data>"
          }
        },
        { "type": "text", "text": "What is in this image?" }
      ]
    }
  ]
}
```

## Good to know

- Images are billed as input tokens based on their size, so large images cost more. Scaling the long side to about 1500 pixels keeps them sharp and cheap.
- Base64 makes the request body bigger; an oversized image may return `413`. Compress it first.
- Image URLs are downloaded by this site or the model provider, so a URL that is unreachable, behind a login or hotlink-protected fails. Use Base64 in that case.
