与 OpenAI 图片编辑接口兼容，请求以 `multipart/form-data` 发送。可用的图片模型见 [模型广场](/pricing)，例如 `{{model}}`。

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

:::params
| 参数     | 类型   | 必填 | 说明                           |
| -------- | ------ | ---- | ------------------------------ |
| `model`  | string | 是   | 图片模型名                     |
| `image`  | file   | 是   | 原图文件，部分模型支持传多张   |
| `prompt` | string | 是   | 修改要求                       |
| `mask`   | file   | 否   | 透明区域表示要修改的部分       |
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

返回格式与 [图片生成](/docs/api-images) 相同，图片链接通常有时效，请及时下载保存。

## 计费

计费方式与图片生成相同，价格以 [模型广场](/pricing) 为准。
