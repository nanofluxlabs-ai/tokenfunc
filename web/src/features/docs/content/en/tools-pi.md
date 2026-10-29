Pi is a lightweight command-line coding agent. Connect it by adding a custom provider in `models.json`.

- Protocol: OpenAI-compatible (Chat Completions)
- Base URL: `{{baseUrl}}/v1`
- Models: any, for example `{{model}}`

:::note
Pi has moved to [earendil-works/pi](https://github.com/earendil-works/pi) and the npm package is now `@earendil-works/pi-coding-agent`. The old `@mariozechner/pi-coding-agent` package is no longer updated.
:::

:::steps
### Install Pi

:::tabs
@tab macOS / Linux

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

@tab Windows

```powershell
powershell -c "irm https://pi.dev/install.ps1 | iex"
```

@tab npm

```bash
# Requires Node.js 22.19 or later
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```
:::

Run `pi --version` to confirm. On Windows, install [Git for Windows](https://git-scm.com/download/win) first.

### Add a custom provider

Put the following into Pi's model config file, creating it if needed:

```json title="~/.pi/agent/models.json"
{
  "$schema": "https://pi.dev/schemas/models.schema.json",
  "providers": {
    "tokenfunc": {
      "baseUrl": "{{baseUrl}}/v1",
      "api": "openai-completions",
      "apiKey": "{{apiKey}}",
      "models": [
        { "id": "{{model}}", "contextWindow": 200000, "maxTokens": 32000 }
      ]
    }
  }
}
```

- Set `contextWindow` and `maxTokens` to the model's real limits.
- Add more entries to `models` to use several models.
- `apiKey` can also be `"$TOKENFUNC_API_KEY"` to read it from an environment variable and keep it out of the file.

### Choose a model and verify

```bash
# List the models under this site's provider
pi --list-models tokenfunc

# Send a test message
pi --model tokenfunc/{{model}} -p "reply ok"
```

A reply means you are connected. Day to day, type `/model` in Pi to pick a model and press `Ctrl+S` to make it the default.
:::

## Troubleshooting

| Symptom                                      | Cause and fix                                                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| This site's models are missing from `/model` | The outer `providers` key is missing, or `apiKey` names an environment variable that is not set                 |
| 404                                          | `baseUrl` is missing `/v1`                                                                                      |
| 401                                          | Wrong key or no quota left. Check it on [API Keys](/keys)                                                       |
| An older guide's config does nothing         | Older guides put the provider at the root and used `context`; both are obsolete. Rewrite it in the format above |
