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

:::params
| 参数                 | 类型    | 必填 | 说明                                                                                                    |
| -------------------- | ------- | ---- | ------------------------------------------------------------------------------------------------------- |
| `model`              | string  | 是   | 图片模型名                                                                                              |
| `image`              | file    | 是   | 原图，`png`、`webp` 或 `jpg`，单张小于 50MB。传多张时字段名用 `image[]`，最多 16 张                     |
| `prompt`             | string  | 是   | 修改要求                                                                                                |
| `mask`               | file    | 否   | 蒙版，完全透明的区域表示要修改的部分。须是小于 4MB 的 PNG，尺寸与原图相同；传了多张原图时只作用于第一张 |
| `input_fidelity`     | string  | 否   | 对原图风格、人脸等细节的还原程度：`low`（默认）或 `high`。用 `gpt-image-2` 时不要传                     |
| `n`                  | integer | 否   | 生成张数，默认 1，按张计费。OpenAI 模型最多 10 张                                                       |
| `size`               | string  | 否   | 尺寸，默认 `auto`，规则同 [图片生成](/docs/api-images)                                                  |
| `quality`            | string  | 否   | 画质，默认 `auto`，取值同图片生成                                                                       |
| `background`         | string  | 否   | 背景：`auto`（默认）、`transparent` 透明、`opaque` 不透明。要透明背景时输出格式须是 `png` 或 `webp`     |
| `output_format`      | string  | 否   | 输出格式：`png`（默认）、`jpeg`、`webp`                                                                 |
| `output_compression` | integer | 否   | 压缩质量 0–100，默认 100，只对 `jpeg`、`webp` 生效                                                      |
| `stream`             | boolean | 否   | 为 `true` 时以 SSE 流式返回，事件为 `image_edit.partial_image` 和 `image_edit.completed`                |
| `partial_images`     | integer | 否   | 流式时先推送几张中间预览图，0–3，默认 0                                                                 |
| `response_format`    | string  | 否   | 已废弃。GPT 图片模型固定返回 `b64_json`，只有部分其他模型支持 `url`                                     |
:::

表里只列常用参数，更多参数见 [OpenAI 官方文档](https://platform.openai.com/docs/api-reference/images/createEdit)，大部分会原样转发给上游；`markup`、`safety_identifier` 本站不转发，传了会被忽略。

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
