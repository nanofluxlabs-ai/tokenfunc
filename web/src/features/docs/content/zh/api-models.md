返回当前密钥可以调用的模型。列表已按密钥的分组、模型限制过滤，比 [模型广场](/pricing) 更能反映「这把密钥实际能用什么」。

:::endpoint{method="GET" path="/v1/models" operation="list-models"}
:::

:::request-example
@tab cURL

```bash
curl {{baseUrl}}/v1/models -H "Authorization: Bearer {{apiKey}}"
```

@tab Python

```python
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")
for model in client.models.list():
    print(model.id)
```

@tab Node.js

```javascript
import OpenAI from 'openai'

const client = new OpenAI({ baseURL: '{{baseUrl}}/v1', apiKey: '{{apiKey}}' })
for await (const model of client.models.list()) {
  console.log(model.id)
}
```
:::

:::response-example
@tab 200

```json
{
  "object": "list",
  "success": true,
  "data": [
    {
      "id": "{{model:gpt}}",
      "object": "model",
      "created": 1626777600,
      "owned_by": "openai",
      "supported_endpoint_types": ["openai", "openai-response"]
    },
    {
      "id": "{{model:claude}}",
      "object": "model",
      "created": 1626777600,
      "owned_by": "anthropic",
      "supported_endpoint_types": ["anthropic", "openai"]
    }
  ]
}
```
:::

## 响应字段

:::params
| 字段                              | 说明                                                                                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data[].id`                       | 模型名，调用时填到 `model` 参数                                                                                                                                                                                            |
| `data[].owned_by`                 | 模型所属厂商；本站未登记厂商的模型显示为 `custom`                                                                                                                                                                          |
| `data[].created`                  | 记录创建时间（Unix 秒），不代表模型发布时间                                                                                                                                                                                |
| `data[].supported_endpoint_types` | 该模型支持的接口格式，常见值：`openai`（Chat Completions）、`openai-response`（Responses）、`anthropic`（Messages）、`gemini`（Gemini 原生）、`image-generation`（图片生成）、`embeddings`（向量）、`openai-video`（视频） |
:::

## 其他格式

同一个地址会按请求头返回不同 SDK 需要的格式：

| 请求方式                                                          | 返回格式                                                                                                                      |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `Authorization: Bearer`                                           | OpenAI 格式（上面的示例）                                                                                                     |
| `x-api-key` + `anthropic-version` 两个请求头                      | Anthropic 格式：`{"data": [{"id", "display_name", "type": "model", "created_at"}], "first_id", "last_id", "has_more": false}` |
| `GET /v1beta/models`，或带 `x-goog-api-key` 请求头 / `?key=` 参数 | Gemini 格式：`{"models": [{"name", "displayName"}], "nextPageToken": null}`                                                   |
