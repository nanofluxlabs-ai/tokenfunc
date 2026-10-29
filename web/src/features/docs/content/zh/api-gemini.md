与 Google Gemini API 原生格式兼容的接口。已经在用 Google 官方 SDK（`google-genai`、`@google/genai`）的应用，改一下地址和密钥就能接入本站。只需要通用对话能力时，也可以直接用 [Chat Completions](/docs/api-chat-completions) 调用 Gemini 模型。

```http
POST {{baseUrl}}/v1beta/models/{model}:generateContent
```

:::api-playground{operation="gemini-generate"}
:::

## 请求示例

:::tabs
@tab cURL

```bash
curl "{{baseUrl}}/v1beta/models/{{model}}:generateContent" \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: {{apiKey}}" \
  -d '{
    "contents": [{"role": "user", "parts": [{"text": "你好！"}]}]
  }'
```

@tab Python

```python
# pip install google-genai
from google import genai
from google.genai import types

# base_url 只填本站地址，SDK 会自动拼接 /v1beta/models/...
client = genai.Client(
    api_key="{{apiKey}}",
    http_options=types.HttpOptions(base_url="{{baseUrl}}"),
)

resp = client.models.generate_content(model="{{model}}", contents="你好！")
print(resp.text)
```

@tab Node.js

```javascript
// npm install @google/genai
import { GoogleGenAI } from '@google/genai'

// baseUrl 只填本站地址，SDK 会自动拼接 /v1beta/models/...
const ai = new GoogleGenAI({
  apiKey: '{{apiKey}}',
  httpOptions: { baseUrl: '{{baseUrl}}' },
})

const resp = await ai.models.generateContent({
  model: '{{model}}',
  contents: '你好！',
})
console.log(resp.text)
```
:::

## 鉴权

以下三种写法都可以，推荐第一种：

| 写法                                       | 示例                                                         |
| ------------------------------------------ | ------------------------------------------------------------ |
| 请求头 `x-goog-api-key`（Google SDK 默认） | `x-goog-api-key: {{apiKey}}`                                 |
| 网址参数 `key`                             | `...:generateContent?key={{apiKey}}`，容易被日志记录，不推荐 |
| 请求头 `Authorization`                     | `Authorization: Bearer {{apiKey}}`                           |

## 请求参数

| 参数                | 类型   | 必填 | 说明                                                                                        |
| ------------------- | ------ | ---- | ------------------------------------------------------------------------------------------- |
| `model`（路径）     | string | 是   | 模型名，写在网址里，例如 `{{model}}`                                                        |
| `contents`          | array  | 是   | 对话内容，每项包含 `role`（`user` 或 `model`）和 `parts`                                    |
| `systemInstruction` | object | 否   | 系统指令，如 `{"parts": [{"text": "你是一名翻译"}]}`                                        |
| `generationConfig`  | object | 否   | 生成参数：`temperature`、`maxOutputTokens`、`topP`、`responseMimeType`、`thinkingConfig` 等 |
| `tools`             | array  | 否   | 工具定义（`functionDeclarations`）                                                          |

`parts` 里除了 `text`，也可以放图片：`{"inline_data": {"mime_type": "image/jpeg", "data": "<Base64>"}}`。

## 响应示例

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [{ "text": "你好！有什么可以帮你的吗？" }]
      },
      "finishReason": "STOP"
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 3,
    "candidatesTokenCount": 9,
    "totalTokenCount": 12
  }
}
```

## 流式输出

把动作换成 `streamGenerateContent` 并加上 `?alt=sse`，回复会以 SSE 事件流返回。SDK 中使用 `generate_content_stream`（Python）或 `generateContentStream`（Node.js）。

:::tabs
@tab cURL

```bash
curl -N "{{baseUrl}}/v1beta/models/{{model}}:streamGenerateContent?alt=sse" \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: {{apiKey}}" \
  -d '{"contents": [{"role": "user", "parts": [{"text": "写一首关于秋天的四行短诗"}]}]}'
```

@tab Python

```python
for chunk in client.models.generate_content_stream(model="{{model}}", contents="写一首关于秋天的四行短诗"):
    print(chunk.text, end="", flush=True)
```

@tab Node.js

```javascript
const stream = await ai.models.generateContentStream({
  model: '{{model}}',
  contents: '写一首关于秋天的四行短诗',
})
for await (const chunk of stream) process.stdout.write(chunk.text ?? '')
```
:::

## 模型列表

`GET {{baseUrl}}/v1beta/models` 按 Gemini 格式返回这把密钥可用的模型：

```bash
curl "{{baseUrl}}/v1beta/models" -H "x-goog-api-key: {{apiKey}}"
```

## 注意事项

- 这个接口面向 Gemini 系列模型。其他厂商的模型请用 [Chat Completions](/docs/api-chat-completions) 或 [Anthropic Messages](/docs/api-messages)。
- 暂不支持 `countTokens`，调用会返回 404。
- 错误格式与状态码见 [错误码](/docs/api-errors)。
