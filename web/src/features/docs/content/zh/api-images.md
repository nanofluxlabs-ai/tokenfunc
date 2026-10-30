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

:::params
| 参数              | 类型    | 必填 | 说明                                                |
| ----------------- | ------- | ---- | --------------------------------------------------- |
| `model`           | string  | 是   | 图片模型名                                          |
| `prompt`          | string  | 是   | 画面描述，越具体效果越好                            |
| `n`               | integer | 否   | 生成张数，默认 1，按张计费                          |
| `size`            | string  | 否   | 尺寸，如 `1024x1024`、`1536x1024`，可选值取决于模型 |
| `quality`         | string  | 否   | 画质，如 `low` / `medium` / `high`，取决于模型      |
| `response_format` | string  | 否   | `url` 或 `b64_json`。部分模型只返回 `b64_json`      |
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

返回的图片链接通常有时效，请及时下载保存。

## 计费

图片模型通常按张计费，不同尺寸、画质价格不同；部分模型按 Token 计费。价格以 [模型广场](/pricing) 为准。
