与 OpenAI 图片生成接口兼容，根据文字描述生成图片。可用的图片模型见 [模型广场](/pricing)，例如 `{{model}}`。要修改已有图片，见 [图片编辑](/docs/api-image-edits)。

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
    "prompt": "一只戴着围巾的橘猫坐在窗台上，水彩风格",
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
    prompt="一只戴着围巾的橘猫坐在窗台上，水彩风格",
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
  prompt: '一只戴着围巾的橘猫坐在窗台上，水彩风格',
  size: '1024x1024',
})
const image = resp.data[0]
if (image.b64_json)
  writeFileSync('cat.png', Buffer.from(image.b64_json, 'base64'))
else console.log(image.url)
```
:::

## 请求参数

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

## 响应字段

:::schema{operation="images-generate" part="response"}
:::

## 流式输出

设置 `stream: true` 后以 SSE 返回。设置了 `partial_images` 会先收到几条 `image_generation.partial_image` 事件（中间预览图），最后一条 `image_generation.completed` 事件带最终图片和 `usage`：

```text
event: image_generation.partial_image
data: {"type":"image_generation.partial_image","b64_json":"...","partial_image_index":0}

event: image_generation.completed
data: {"type":"image_generation.completed","b64_json":"...","usage":{"total_tokens":1102,"input_tokens":46,"output_tokens":1056,"input_tokens_details":{"text_tokens":46,"image_tokens":0}}}
```

## 计费

图片模型通常按张计费，不同尺寸、画质价格不同；部分模型按 Token 计费。价格以 [模型广场](/pricing) 为准。
