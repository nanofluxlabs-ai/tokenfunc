{{siteName}} gives you Claude, GPT, Gemini, DeepSeek and more behind one address and one key. The API speaks both the OpenAI and the Anthropic formats, so most tools and SDKs only need a new base URL and key.

:::steps
### Get the base URL

Every request goes to the address below. Some tools want it with `/v1`, some without; each tool guide says which.

:::base-url
:::

### Create a key

Sign in, open [API Keys](/keys) and click "Create API Key". Create one key per tool so you can revoke one without touching the others.

- The full key is shown only once after creation. Copy it right away.
- You can limit a key by quota, models, IP allowlist and expiry. Leave them empty for no limit.

![The API Keys page: the Create API Key button and the copy dialog shown after creation](todo:quick-start/create-key.png)

:::tip
Once signed in, the samples are filled with your key named `default` (or your most recently created key), so they run as copied.
:::

### Send your first request

Paste the command below into a terminal. If the model answers, you are all set.

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "messages": [{"role": "user", "content": "Hi, introduce yourself in one sentence."}]
  }'
```

@tab PowerShell

```powershell
$body = @{
  model    = "{{model}}"
  messages = @(@{ role = "user"; content = "Hi, introduce yourself in one sentence." })
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
    messages=[{"role": "user", "content": "Hi, introduce yourself in one sentence."}],
)
print(resp.choices[0].message.content)
```

@tab Node.js

```javascript
import OpenAI from 'openai'

const client = new OpenAI({ baseURL: '{{baseUrl}}/v1', apiKey: '{{apiKey}}' })

const resp = await client.chat.completions.create({
  model: '{{model}}',
  messages: [
    { role: 'user', content: 'Hi, introduce yourself in one sentence.' },
  ],
})
console.log(resp.choices[0].message.content)
```
:::

Any model from the [Model Square](/pricing) works in place of the one above. If you get an error, look it up in [FAQ and troubleshooting](/docs/faq).
:::

## Next steps

- **Use a ready-made tool**: Claude Code, Codex, Cursor, Cline, Trae and more, see [Choose a tool](/docs/tools-overview).
- **Write your own code**: multi-turn chat, streaming, vision, tool calling, see [Chat Completions](/docs/api-chat-completions#examples).
- **Look up the API**: parameters and response formats, see [API reference](/docs/api-authentication).
