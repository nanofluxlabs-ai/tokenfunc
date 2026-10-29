支持视觉的模型可以读图：识别图片内容、提取文字、看懂图表和截图。把图片放进 `content` 数组即可，文字和图片可以混排、可以放多张。

模型是否支持看图，可以在 [模型广场](/pricing) 查看。用 Chat Completions 格式发送的图片，本站会自动转换给 Claude、Gemini 等模型。

## 用图片链接

图片链接必须能从公网直接访问（不需要登录、没有防盗链）。

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
            {"type": "text", "text": "这张图里有什么？用一句话描述。"},
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
        { type: 'text', text: '这张图里有什么？用一句话描述。' },
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
        {"type": "text", "text": "这张图里有什么？用一句话描述。"},
        {"type": "image_url", "image_url": {"url": "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png"}}
      ]
    }]
  }'
```
:::

## 用本地图片（Base64）

本地文件或内网图片，转成 Base64 后以 `data:` 开头的地址发送：

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
            {"type": "text", "text": "提取这张小票上的商家名称、日期和总金额，用 JSON 返回。"},
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
          text: '提取这张小票上的商家名称、日期和总金额，用 JSON 返回。',
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

`data:` 后面的类型要和图片实际格式一致：`image/jpeg`、`image/png`、`image/webp`、`image/gif`。

## 用 Anthropic 格式

调用 [Messages](/docs/api-messages) 接口时，图片使用 Anthropic 的 `image` 块：

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
            "data": "<Base64 内容>"
          }
        },
        { "type": "text", "text": "这张图里有什么？" }
      ]
    }
  ]
}
```

## 注意事项

- 图片按尺寸折算成输入 Token 计费，大图更贵。一般把长边缩到 1500 像素左右，既清晰又省钱。
- Base64 会让请求体变大，图片过大可能返回 `413`，请先压缩。
- 图片链接会由本站或模型服务商下载，链接打不开、需要登录或有防盗链时会报错，这种情况改用 Base64。
