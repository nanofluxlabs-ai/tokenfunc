{{siteName}} 用一个地址、一把密钥接入 Claude、GPT、Gemini、DeepSeek 等模型。接口同时兼容 OpenAI 与 Anthropic 两种格式，绝大多数工具和 SDK 改一下地址和密钥就能用。

:::steps
### 拿到接口地址

所有请求都发往下面这个地址：

:::base-url
:::

不同工具对地址的写法要求不同，这是接入失败最常见的原因：

| 工具使用的协议                 | 填写方式             | 示例                              |
| ------------------------------ | -------------------- | --------------------------------- |
| OpenAI 兼容（大多数工具、SDK） | 地址 + `/v1`         | `{{baseUrl}}/v1`                  |
| Anthropic（Claude Code 等）    | 只填地址，不带 `/v1` | `{{baseUrl}}`                     |
| 要求填完整路径的工具           | 地址 + 完整接口路径  | `{{baseUrl}}/v1/chat/completions` |

工具会在你填的地址后面自动拼接路径，多写或少写 `/v1` 都会返回 404。每篇工具教程都写明了该怎么填。

### 创建密钥

登录后打开 [API 密钥](/keys)，点击「创建 API 密钥」。密钥以 `sk-` 开头，持有它的人可以消耗你的余额，请像密码一样保管。

- 建议每个工具或项目单独建一把，泄露时只需删除那一把。
- 密钥只在创建后完整显示一次，请立即复制保存；不要提交到代码仓库，也不要出现在截图、群聊里。
- 创建时选择的**分组**决定这把密钥能用哪些模型、按什么倍率计费，各分组的模型和价格可在 [模型广场](/pricing) 筛选查看。
- 可以给密钥设置额度上限、可用模型、IP 白名单和过期时间，不设则不限制。

![API 密钥页，「创建 API 密钥」按钮与创建后的复制弹窗](todo:quick-start/create-key.png)

:::tip
登录后，文档里的示例代码会自动填入你名为 `default` 的密钥（没有则用最近创建的一把），复制即可运行。
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

模型名可以换成 [模型广场](/pricing) 里的任意一个，但必须和本站的模型名**完全一致**，大小写和连字符都不能错；调用 [模型列表](/docs/api-models) 接口返回的就是这把密钥能用的模型。报错时按 [常见问题与排错](/docs/faq) 对照原因。
:::

## 接下来

- **用现成的工具**：Claude Code、Codex、Cursor、Cline、Trae 等，见 [工具接入概览](/docs/tools-overview)。
- **自己写代码**：多轮对话、流式、看图、工具调用等写法，见 [Chat Completions](/docs/api-chat-completions#调用示例)。
- **查接口细节**：参数和返回格式，见 [API 参考](/docs/api-authentication)。
