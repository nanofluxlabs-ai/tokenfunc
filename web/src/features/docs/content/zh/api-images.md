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
| 参数                 | 类型    | 必填 | 说明                                                                                                                                                            |
| -------------------- | ------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model`              | string  | 是   | 图片模型名                                                                                                                                                      |
| `prompt`             | string  | 是   | 画面描述，越具体效果越好                                                                                                                                        |
| `n`                  | integer | 否   | 生成张数，默认 1，按张计费。OpenAI 模型最多 10 张                                                                                                               |
| `size`               | string  | 否   | 尺寸，默认 `auto`。GPT 图片模型都支持 `1024x1024`、`1536x1024`、`1024x1536`；`gpt-image-2` 及更新的模型还能写任意 `宽x高`，宽高须是 16 的倍数，最大 `3840x2160` |
| `quality`            | string  | 否   | 画质：`auto`（默认）、`low`、`medium`、`high`；部分新模型还支持 `xhigh`、`max`                                                                                  |
| `background`         | string  | 否   | 背景：`auto`（默认）、`transparent` 透明、`opaque` 不透明。要透明背景时输出格式须是 `png` 或 `webp`                                                             |
| `output_format`      | string  | 否   | 输出格式：`png`（默认）、`jpeg`、`webp`                                                                                                                         |
| `output_compression` | integer | 否   | 压缩质量 0–100，默认 100，只对 `jpeg`、`webp` 生效                                                                                                              |
| `moderation`         | string  | 否   | 内容审核强度：`auto`（默认），或更宽松的 `low`                                                                                                                  |
| `stream`             | boolean | 否   | 为 `true` 时以 SSE 流式返回，默认 `false`，见下方「流式输出」                                                                                                   |
| `partial_images`     | integer | 否   | 流式时先推送几张中间预览图，0–3，默认 0                                                                                                                         |
| `response_format`    | string  | 否   | 已废弃。GPT 图片模型固定返回 `b64_json`，只有部分其他模型支持 `url`                                                                                             |
:::

表里只列常用参数，更多参数见 [OpenAI 官方文档](https://platform.openai.com/docs/api-reference/images/create)，大部分会原样转发给上游；`safety_identifier` 本站不转发，传了会被忽略。

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

:::params
| 字段                                                    | 说明                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `data[].b64_json`                                       | 图片的 Base64 内容，GPT 图片模型固定返回这个                        |
| `data[].url`                                            | 图片链接，只有部分其他模型返回，通常有时效，请及时下载保存          |
| `data[].revised_prompt`                                 | 模型改写后的提示词，只有部分模型返回                                |
| `background` / `output_format` / `size` / `quality`     | 本次实际使用的背景、格式、尺寸、画质（GPT 图片模型返回）            |
| `usage.input_tokens` / `output_tokens` / `total_tokens` | 输入 / 输出 / 合计 Token 数，按 Token 计费的模型以此计费            |
| `usage.input_tokens_details`                            | 输入 Token 里文字和参考图各占多少（`text_tokens` / `image_tokens`） |
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
