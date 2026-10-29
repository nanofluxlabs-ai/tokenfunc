与 OpenAI 图片接口兼容，用于文字生成图片和编辑已有图片。可用的图片模型见 [模型广场](/pricing)，例如 `{{model}}`。

## 生成图片

```http
POST {{baseUrl}}/v1/images/generations
```

:::tabs
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

| 参数              | 类型    | 必填 | 说明                                                |
| ----------------- | ------- | ---- | --------------------------------------------------- |
| `model`           | string  | 是   | 图片模型名                                          |
| `prompt`          | string  | 是   | 画面描述，越具体效果越好                            |
| `n`               | integer | 否   | 生成张数，默认 1，按张计费                          |
| `size`            | string  | 否   | 尺寸，如 `1024x1024`、`1536x1024`，可选值取决于模型 |
| `quality`         | string  | 否   | 画质，如 `low` / `medium` / `high`，取决于模型      |
| `response_format` | string  | 否   | `url` 或 `b64_json`。部分模型只返回 `b64_json`      |

响应示例：

```json
{
  "created": 1760000000,
  "data": [{ "b64_json": "iVBORw0KGgo..." }]
}
```

返回的图片链接通常有时效，请及时下载保存。

## 编辑图片

```http
POST {{baseUrl}}/v1/images/edits
```

以 `multipart/form-data` 上传原图和修改要求：

:::tabs
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
resp = client.images.edit(
    model="{{model}}",
    image=open("cat.png", "rb"),
    prompt="给猫加一顶红色的小帽子",
)
```
:::

| 参数     | 说明                           |
| -------- | ------------------------------ |
| `image`  | 原图文件，部分模型支持传多张   |
| `prompt` | 修改要求                       |
| `mask`   | 可选，透明区域表示要修改的部分 |

## 计费

图片模型通常按张计费，不同尺寸、画质价格不同；部分模型按 Token 计费。价格以 [模型广场](/pricing) 为准。
