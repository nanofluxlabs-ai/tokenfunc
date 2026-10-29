{{siteName}} 用一个地址、一把密钥接入 Claude、GPT、Gemini、DeepSeek 等模型。接口同时兼容 OpenAI 与 Anthropic 两种格式，绝大多数工具和 SDK 改一下地址和密钥就能用。

:::steps
### 拿到接口地址

所有请求都发往下面这个地址。在工具里填写时，有的要带 `/v1`，有的不带，每篇工具教程都会写清楚。

:::base-url
:::

### 创建密钥

登录后打开 [API 密钥](/keys)，点击「创建 API 密钥」。建议每个工具单独建一把，泄露或停用时互不影响。

- 密钥只在创建后完整显示一次，请立即复制保存。
- 可以给密钥设置额度上限、可用模型、IP 白名单和过期时间，不设则不限制。

![API 密钥页，「创建 API 密钥」按钮与创建后的复制弹窗](todo:quick-start/create-key.png)

:::tip
登录后，文档里的示例代码会自动填入你名为 `default` 的密钥（没有则用最近创建的一把），复制即可运行；也可以在页面顶部的「示例密钥」里换一把。
:::

### 发出第一个请求

把下面的命令粘贴到终端运行。看到模型的回复，说明一切就绪。

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "messages": [{"role": "user", "content": "你好，请用一句话介绍你自己"}]
  }'
```

@tab PowerShell

```powershell
$body = @{
  model    = "{{model}}"
  messages = @(@{ role = "user"; content = "你好，请用一句话介绍你自己" })
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "{{baseUrl}}/v1/chat/completions" -Method Post `
  -Headers @{ Authorization = "Bearer {{apiKey}}" } `
  -ContentType "application/json; charset=utf-8" -Body $body
```

@tab Python

```python
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")

resp = client.chat.completions.create(
    model="{{model}}",
    messages=[{"role": "user", "content": "你好，请用一句话介绍你自己"}],
)
print(resp.choices[0].message.content)
```

@tab Node.js

```javascript
import OpenAI from 'openai'

const client = new OpenAI({ baseURL: '{{baseUrl}}/v1', apiKey: '{{apiKey}}' })

const resp = await client.chat.completions.create({
  model: '{{model}}',
  messages: [{ role: 'user', content: '你好，请用一句话介绍你自己' }],
})
console.log(resp.choices[0].message.content)
```
:::

模型名可以换成 [模型广场](/pricing) 里的任意一个。报错时按 [常见问题与排错](/docs/faq) 对照原因。
:::

## 接下来

- **用现成的工具**：Claude Code、Codex、Cursor、Cline、Trae 等，见 [选择接入方式](/docs/tools-overview)。
- **自己写代码**：多轮对话、流式、看图、工具调用等写法，见 [Chat Completions](/docs/api-chat-completions#调用示例)。
- **查接口细节**：参数和返回格式，见 [API 参考](/docs/api-authentication)。
