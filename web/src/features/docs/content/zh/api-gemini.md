与 Google Gemini API 原生格式兼容的接口。已经在用 Google 官方 SDK（`google-genai`、`@google/genai`）的应用，改一下地址和密钥就能接入本站。只需要通用对话能力时，也可以直接用 [Chat Completions](/docs/api-chat-completions) 调用 Gemini 模型。

:::endpoint{method="POST" path="/v1beta/models/{model}:generateContent" operation="gemini-generate"}
:::

:::request-example
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

:::params
| 参数                | 类型   | 必填 | 说明                                                                                                                                            |
| ------------------- | ------ | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `model`（路径）     | string | 是   | 模型名，写在网址里，例如 `{{model}}`                                                                                                            |
| `contents`          | array  | 是   | 对话内容，每项包含 `role`（`user` 或 `model`）和 `parts`                                                                                        |
| `systemInstruction` | object | 否   | 系统指令，如 `{"parts": [{"text": "你是一名翻译"}]}`                                                                                            |
| `generationConfig`  | object | 否   | 生成参数，常用字段见下表                                                                                                                        |
| `tools`             | array  | 否   | 函数声明（`functionDeclarations`）或内置工具（`googleSearch`、`codeExecution`、`urlContext`）                                                   |
| `toolConfig`        | object | 否   | 工具调用策略：`functionCallingConfig.mode` 为 `AUTO`（默认）、`ANY`（必须调用）或 `NONE`（不调用），可用 `allowedFunctionNames` 限定范围        |
| `safetySettings`    | array  | 否   | 安全过滤阈值，每项包含 `category`（如 `HARM_CATEGORY_HARASSMENT`）和 `threshold`（如 `BLOCK_ONLY_HIGH`、`BLOCK_NONE`）                          |
| `cachedContent`     | string | 否   | 已创建的缓存名，如 `cachedContents/xxx`。本站不提供创建缓存的接口，一般用不上；重复的前缀 Gemini 会自动缓存，命中量见 `cachedContentTokenCount` |
:::

`generationConfig` 常用字段：

:::params
| 参数                                    | 类型    | 必填 | 说明                                                                                                                                                      |
| --------------------------------------- | ------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `temperature`                           | number  | 否   | 随机性，0～2                                                                                                                                              |
| `topP` / `topK`                         | number  | 否   | 采样范围，一般不用调                                                                                                                                      |
| `maxOutputTokens`                       | integer | 否   | 最多生成的 Token 数                                                                                                                                       |
| `stopSequences`                         | array   | 否   | 遇到这些字符串时停止                                                                                                                                      |
| `candidateCount`                        | integer | 否   | 生成几个候选回答，按总输出计费                                                                                                                            |
| `seed`                                  | integer | 否   | 随机种子，固定后结果更稳定                                                                                                                                |
| `responseMimeType`                      | string  | 否   | 输出格式，`application/json` 让模型只返回 JSON                                                                                                            |
| `responseJsonSchema` / `responseSchema` | object  | 否   | 结构化输出：配合 `responseMimeType: "application/json"`，让 JSON 符合给定结构。前者是标准 JSON Schema，后者是 OpenAPI 子集                                |
| `responseModalities`                    | array   | 否   | 输出类型，如图片模型传 `["TEXT", "IMAGE"]`                                                                                                                |
| `thinkingConfig`                        | object  | 否   | 思考设置：`thinkingLevel`（如 `low`、`high`，各模型支持的档位不同）或旧模型的 `thinkingBudget`（思考 Token 上限）；`includeThoughts: true` 时返回思考摘要 |
| `mediaResolution`                       | string  | 否   | 输入图片、视频的解析精度：`MEDIA_RESOLUTION_LOW` / `MEDIA_RESOLUTION_MEDIUM` / `MEDIA_RESOLUTION_HIGH`，越低越省 Token                                    |
:::

`parts` 里除了 `text`，也可以放图片：`{"inline_data": {"mime_type": "image/jpeg", "data": "<Base64>"}}`。

表里只列常用参数，更多参数见 [Gemini 官方文档](https://ai.google.dev/api/generate-content)，大部分会原样转发给上游；`serviceTier`、`store`、`labels`、`continuationToken` 本站不转发，传了会被忽略。

:::response-example
@tab 200

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [{ "text": "你好！有什么可以帮你的吗？" }]
      },
      "finishReason": "STOP",
      "index": 0
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 3,
    "candidatesTokenCount": 9,
    "thoughtsTokenCount": 0,
    "totalTokenCount": 12
  },
  "modelVersion": "{{model}}",
  "responseId": "abc123"
}
```
:::

## 响应字段

:::params
| 字段                                    | 说明                                                                                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `candidates[].content.parts`            | 回答内容；`includeThoughts` 打开时，思考摘要所在的 part 带 `"thought": true`                                                                                     |
| `candidates[].finishReason`             | 结束原因：`STOP` 正常结束，`MAX_TOKENS` 达到上限被截断，`SAFETY` 被安全策略拦截，`RECITATION` 疑似照搬已有内容被拦截，`MALFORMED_FUNCTION_CALL` 函数调用格式有误 |
| `promptFeedback.blockReason`            | 输入本身被拦截时返回，此时没有 `candidates`，常见 `SAFETY`、`BLOCKLIST`、`PROHIBITED_CONTENT`                                                                    |
| `usageMetadata.promptTokenCount`        | 输入 Token 数，含命中缓存的部分                                                                                                                                  |
| `usageMetadata.cachedContentTokenCount` | 输入中命中缓存的 Token 数                                                                                                                                        |
| `usageMetadata.candidatesTokenCount`    | 输出 Token 数，不含思考                                                                                                                                          |
| `usageMetadata.thoughtsTokenCount`      | 思考 Token 数，按输出价计费                                                                                                                                      |
| `usageMetadata.toolUsePromptTokenCount` | 工具使用带入的提示词 Token 数                                                                                                                                    |
| `usageMetadata.totalTokenCount`         | 以上合计                                                                                                                                                         |
| `modelVersion`                          | 实际响应的模型版本                                                                                                                                               |
| `responseId`                            | 本次响应的 ID                                                                                                                                                    |
:::

## 流式输出

把动作换成 `streamGenerateContent` 并加上 `?alt=sse`，回复会以 SSE 事件流返回。本站一律返回 SSE，不带 `?alt=sse` 也一样（官方不带时返回 JSON 数组）。SDK 中使用 `generate_content_stream`（Python）或 `generateContentStream`（Node.js）。

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
