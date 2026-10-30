与 OpenAI 图片编辑接口兼容，请求可以用 `multipart/form-data` 上传图片文件，也可以用 JSON 传图片链接（见下方「JSON 请求」）。可用的图片模型见 [模型广场](/pricing)，例如 `{{model}}`。

:::endpoint{method="POST" path="/v1/images/edits" operation="image-edits"}
:::

:::request-example
@tab cURL

```bash
curl {{baseUrl}}/v1/images/edits \
  -H "Authorization: Bearer {{apiKey}}" \
  -F model="{{model}}" \
  -F image=@cat.png \
  -F prompt="给猫加一顶红色的小帽子"
```

@tab Python

```python
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")

resp = client.images.edit(
    model="{{model}}",
    image=open("cat.png", "rb"),
    prompt="给猫加一顶红色的小帽子",
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
  prompt: '给猫加一顶红色的小帽子',
})
```
:::

## 请求参数

:::schema{operation="images-edit" part="request"}
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

返回格式与 [图片生成](/docs/api-images) 相同，包括 `usage` 等字段；图片链接通常有时效，请及时下载保存。

## JSON 请求

不方便上传文件时，可以改用 JSON：原图放在 `images` 数组里，每项写 `{"image_url": "..."}`，值是图片网址或 Base64 data URL；`mask` 写法相同，其他参数与上表一致。

```bash
curl {{baseUrl}}/v1/images/edits \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "images": [{ "image_url": "https://example.com/cat.png" }],
    "prompt": "给猫加一顶红色的小帽子"
  }'
```

## 计费

计费方式与图片生成相同，价格以 [模型广场](/pricing) 为准。
