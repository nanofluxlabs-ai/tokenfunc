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
| Parameter           | Type   | Required | Description                                                                                                  |
| ------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------ |
| `model` (path)      | string | Yes      | Model name in the URL, for example `{{model}}`                                                               |
| `contents`          | array  | Yes      | The conversation; each item has a `role` (`user` or `model`) and `parts`                                     |
| `systemInstruction` | object | No       | System instruction, for example `{"parts": [{"text": "You are a translator"}]}`                              |
| `generationConfig`  | object | No       | Generation settings: `temperature`, `maxOutputTokens`, `topP`, `responseMimeType`, `thinkingConfig` and more |
| `tools`             | array  | No       | Tool definitions (`functionDeclarations`)                                                                    |
:::

Besides `text`, `parts` can hold images: `{"inline_data": {"mime_type": "image/jpeg", "data": "<Base64>"}}`.

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
:::

## Streaming

Change the action to `streamGenerateContent` and add `?alt=sse` to receive an SSE event stream. In the SDKs, use `generate_content_stream` (Python) or `generateContentStream` (Node.js).

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
