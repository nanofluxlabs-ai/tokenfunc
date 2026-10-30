The endpoint compatible with the native Google Gemini API format. Apps already built on the official Google SDKs (`google-genai`, `@google/genai`) only need a new address and key. If you just need chat, you can also call Gemini models through [Chat Completions](/docs/api-chat-completions).

:::endpoint{method="POST" path="/v1beta/models/{model}:generateContent" operation="gemini-generate"}
:::

:::request-example
@tab cURL

```bash
curl "{{baseUrl}}/v1beta/models/{{model}}:generateContent" \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: {{apiKey}}" \
  -d '{
    "contents": [{"role": "user", "parts": [{"text": "Hello!"}]}]
  }'
```

@tab Python

```python
# pip install google-genai
from google import genai
from google.genai import types

# base_url is just this site's address; the SDK appends /v1beta/models/...
client = genai.Client(
    api_key="{{apiKey}}",
    http_options=types.HttpOptions(base_url="{{baseUrl}}"),
)

resp = client.models.generate_content(model="{{model}}", contents="Hello!")
print(resp.text)
```

@tab Node.js

```javascript
// npm install @google/genai
import { GoogleGenAI } from '@google/genai'

// baseUrl is just this site's address; the SDK appends /v1beta/models/...
const ai = new GoogleGenAI({
  apiKey: '{{apiKey}}',
  httpOptions: { baseUrl: '{{baseUrl}}' },
})

const resp = await ai.models.generateContent({
  model: '{{model}}',
  contents: 'Hello!',
})
console.log(resp.text)
```
:::

## Authentication

Any of these works; the first is recommended:

| Form                                         | Example                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| `x-goog-api-key` header (Google SDK default) | `x-goog-api-key: {{apiKey}}`                                               |
| `key` URL parameter                          | `...:generateContent?key={{apiKey}}`; logs can capture it, not recommended |
| `Authorization` header                       | `Authorization: Bearer {{apiKey}}`                                         |

## Request parameters

:::params
| Parameter           | Type   | Required | Description                                                                                                                                                                                                   |
| ------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model` (path)      | string | Yes      | Model name in the URL, for example `{{model}}`                                                                                                                                                                |
| `contents`          | array  | Yes      | The conversation; each item has a `role` (`user` or `model`) and `parts`                                                                                                                                      |
| `systemInstruction` | object | No       | System instruction, for example `{"parts": [{"text": "You are a translator"}]}`                                                                                                                               |
| `generationConfig`  | object | No       | Generation settings; common fields are in the table below                                                                                                                                                     |
| `tools`             | array  | No       | Function declarations (`functionDeclarations`) or built-in tools (`googleSearch`, `codeExecution`, `urlContext`)                                                                                              |
| `toolConfig`        | object | No       | Tool use policy: `functionCallingConfig.mode` is `AUTO` (default), `ANY` (must call) or `NONE` (no calls); limit the choice with `allowedFunctionNames`                                                       |
| `safetySettings`    | array  | No       | Safety filter thresholds; each item has a `category` (such as `HARM_CATEGORY_HARASSMENT`) and a `threshold` (such as `BLOCK_ONLY_HIGH` or `BLOCK_NONE`)                                                       |
| `cachedContent`     | string | No       | Name of a cache you created, such as `cachedContents/xxx`. This site has no endpoint for creating caches, so you rarely need it; Gemini caches repeated prefixes automatically, see `cachedContentTokenCount` |
:::

Common `generationConfig` fields:

:::params
| Parameter                               | Type    | Required | Description                                                                                                                                                                                                |
| --------------------------------------- | ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `temperature`                           | number  | No       | Randomness, 0 to 2                                                                                                                                                                                         |
| `topP` / `topK`                         | number  | No       | Sampling range; usually left alone                                                                                                                                                                         |
| `maxOutputTokens`                       | integer | No       | Maximum tokens to generate                                                                                                                                                                                 |
| `stopSequences`                         | array   | No       | Stop at these strings                                                                                                                                                                                      |
| `candidateCount`                        | integer | No       | How many candidate answers to generate; billed on total output                                                                                                                                             |
| `seed`                                  | integer | No       | Random seed; fixing it makes results more repeatable                                                                                                                                                       |
| `responseMimeType`                      | string  | No       | Output format; `application/json` makes the model return JSON only                                                                                                                                         |
| `responseJsonSchema` / `responseSchema` | object  | No       | Structured output: with `responseMimeType: "application/json"`, the JSON follows the given shape. The first takes standard JSON Schema, the second an OpenAPI subset                                       |
| `responseModalities`                    | array   | No       | Output types, for example `["TEXT", "IMAGE"]` for image models                                                                                                                                             |
| `thinkingConfig`                        | object  | No       | Thinking settings: `thinkingLevel` (such as `low` or `high`; supported levels vary by model) or `thinkingBudget` (a thinking token cap) on older models; `includeThoughts: true` returns thought summaries |
| `mediaResolution`                       | string  | No       | Detail level for input images and video: `MEDIA_RESOLUTION_LOW` / `MEDIA_RESOLUTION_MEDIUM` / `MEDIA_RESOLUTION_HIGH`; lower uses fewer tokens                                                             |
:::

Besides `text`, `parts` can hold images: `{"inline_data": {"mime_type": "image/jpeg", "data": "<Base64>"}}`.

Only common parameters are listed. See the [Gemini API reference](https://ai.google.dev/api/generate-content) for the rest; most are forwarded upstream as is. This site does not forward `serviceTier`, `store`, `labels` and `continuationToken`; they are ignored if sent.

:::response-example
@tab 200

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [{ "text": "Hello! How can I help you today?" }]
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

## Response fields

:::params
| Field                                   | Description                                                                                                                                                                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `candidates[].content.parts`            | The answer; with `includeThoughts` on, parts holding thought summaries carry `"thought": true`                                                                                                                                     |
| `candidates[].finishReason`             | Why it ended: `STOP` finished, `MAX_TOKENS` hit the limit and was cut off, `SAFETY` blocked by safety filters, `RECITATION` blocked as likely reciting existing content, `MALFORMED_FUNCTION_CALL` the function call was malformed |
| `promptFeedback.blockReason`            | Returned when the input itself was blocked, with no `candidates`; usually `SAFETY`, `BLOCKLIST` or `PROHIBITED_CONTENT`                                                                                                            |
| `usageMetadata.promptTokenCount`        | Input tokens, cached ones included                                                                                                                                                                                                 |
| `usageMetadata.cachedContentTokenCount` | Input tokens served from the cache                                                                                                                                                                                                 |
| `usageMetadata.candidatesTokenCount`    | Output tokens, thinking excluded                                                                                                                                                                                                   |
| `usageMetadata.thoughtsTokenCount`      | Thinking tokens, billed at the output price                                                                                                                                                                                        |
| `usageMetadata.toolUsePromptTokenCount` | Prompt tokens brought in by tool use                                                                                                                                                                                               |
| `usageMetadata.totalTokenCount`         | Total of the above                                                                                                                                                                                                                 |
| `modelVersion`                          | The model version that answered                                                                                                                                                                                                    |
| `responseId`                            | ID of this response                                                                                                                                                                                                                |
:::

## Streaming

Change the action to `streamGenerateContent` and add `?alt=sse` to receive an SSE event stream. This site always answers with SSE, even without `?alt=sse` (Google returns a JSON array in that case). In the SDKs, use `generate_content_stream` (Python) or `generateContentStream` (Node.js).

:::tabs
@tab cURL

```bash
curl -N "{{baseUrl}}/v1beta/models/{{model}}:streamGenerateContent?alt=sse" \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: {{apiKey}}" \
  -d '{"contents": [{"role": "user", "parts": [{"text": "Write a four-line poem about autumn"}]}]}'
```

@tab Python

```python
for chunk in client.models.generate_content_stream(model="{{model}}", contents="Write a four-line poem about autumn"):
    print(chunk.text, end="", flush=True)
```

@tab Node.js

```javascript
const stream = await ai.models.generateContentStream({
  model: '{{model}}',
  contents: 'Write a four-line poem about autumn',
})
for await (const chunk of stream) process.stdout.write(chunk.text ?? '')
```
:::

## List models

`GET {{baseUrl}}/v1beta/models` returns the models your key can use, in Gemini format:

```bash
curl "{{baseUrl}}/v1beta/models" -H "x-goog-api-key: {{apiKey}}"
```

## Good to know

- This endpoint is meant for Gemini models. For other vendors, use [Chat Completions](/docs/api-chat-completions) or [Anthropic Messages](/docs/api-messages).
- `countTokens` is not supported and returns 404.
- Error formats and status codes are on [Errors](/docs/api-errors).
