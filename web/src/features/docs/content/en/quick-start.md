{{siteName}} gives you Claude, GPT, Gemini, DeepSeek and more behind one address and one key. The API speaks both the OpenAI and the Anthropic formats, so most tools and SDKs only need a new base URL and key.

:::steps
### Get the base URL

Every request goes to the address below:

:::base-url
:::

Tools differ in how they want this address, and this is the most common reason an integration fails:

| Protocol the tool uses                  | What to enter           | Example                           |
| --------------------------------------- | ----------------------- | --------------------------------- |
| OpenAI-compatible (most tools and SDKs) | Base URL + `/v1`        | `{{baseUrl}}/v1`                  |
| Anthropic (Claude Code and similar)     | Base URL only, no `/v1` | `{{baseUrl}}`                     |
| Tools that ask for the full endpoint    | Base URL + full path    | `{{baseUrl}}/v1/chat/completions` |

Tools append their own path to whatever you enter, so one `/v1` too many or too few fails with 404. Each tool guide says which form to use.

### Create a key

Sign in, open [API Keys](/keys) and click "Create API Key". Keys start with `sk-`, and anyone holding one can spend your balance, so treat it like a password.

- Create one key per tool or project, so a leak only costs you that one key.
- The full key is shown only once after creation. Copy it right away, and never commit it to a repository or show it in screenshots or group chats.
- The **group** you pick decides which models the key can use and at what rate; filter by group on the [Model Square](/pricing) to compare models and prices.
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

Any model from the [Model Square](/pricing) works in place of the one above, but the name must match this site's model name **exactly**, including case and hyphens; the [List models](/docs/api-models) endpoint returns the models this key can use. If you get an error, look it up in [FAQ and troubleshooting](/docs/faq).
:::

## Next steps

- **Use a ready-made tool**: Claude Code, Codex, Cursor, Cline, Trae and more, see [Tool integration overview](/docs/tools-overview).
- **Write your own code**: multi-turn chat, streaming, vision, tool calling, see [Chat Completions](/docs/api-chat-completions#examples).
- **Look up the API**: parameters and response formats, see [API reference](/docs/api-authentication).
