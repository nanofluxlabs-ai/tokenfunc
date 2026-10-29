DeepSeek Harness (command `dsh`) is DeepSeek's open-source agent runtime. It ships with a web UI where you can add a custom model provider pointing at this site.

- Protocol: OpenAI-compatible or Anthropic
- Base URL: `{{baseUrl}}/v1` for OpenAI-compatible, `{{baseUrl}}` for Anthropic
- Models: DeepSeek and others, for example `{{model}}`

:::warning
DeepSeek Harness is a developer preview; its UI and config format may change between releases. If the steps below differ from what you see, follow the [official repository](https://github.com/deepseek-ai/deepseek-harness).
:::

:::steps
### Start the web UI

Install [Node.js](https://nodejs.org) first, then run:

```bash
npx @deepseek-ai/dsh web
```

The first start downloads dependencies and can take about two minutes with no progress output. Then open `http://127.0.0.1:3080` in your browser.

### Add a model provider

Go to **Settings → Models → Add model provider**, switch the card to **Custom model API** and fill in:

| Field        | Value                                                            |
| ------------ | ---------------------------------------------------------------- |
| Provider ID  | `tokenfunc` (lowercase only; **cannot be changed** after saving) |
| Display name | `{{siteName}}`                                                   |
| Base URL     | `{{baseUrl}}/v1`                                                 |
| API protocol | OpenAI Chat Completions                                          |
| API key      | `{{apiKey}}`                                                     |

![The Add model provider card in DeepSeek Harness switched to Custom model API](todo:tools/dsh-provider.png)

A provider uses exactly one protocol. To also use Claude models over the Anthropic protocol, add a second provider with another ID (for example `tokenfunc-claude`), API protocol Anthropic Messages and base URL `{{baseUrl}}`.

### Add models

Under **Model catalog** click **Fetch available models** and tick the models you want. If the list cannot be fetched, type the model ID, for example `{{model}}`.

![The model checklist shown by Fetch available models](todo:tools/dsh-models.png)

### Verify

After saving, choose the new model in the chat model picker and send a message. A reply means you are connected.
:::

## Configuring with a file

You can also declare the provider in `~/.dsh/profiles/web/cordis.patch.yml` (or `~/.dsh/cordis.patch.yml` to apply it to every profile):

```yaml title="~/.dsh/profiles/web/cordis.patch.yml"
- id: llm-pi-ai
  config:
    providers:
      tokenfunc:
        apiKeyEnv: TOKENFUNC_API_KEY
        api: openai-completions
        baseURL: {{baseUrl}}/v1
        compat:
          supportsDeveloperRole: false
          maxTokensField: max_tokens
        models:
          - id: {{model}}
```

The key is read from the `TOKENFUNC_API_KEY` environment variable, which must be set **before** starting `dsh`:

```bash
export TOKENFUNC_API_KEY="{{apiKey}}"
```

## Troubleshooting

| Symptom                                                 | Cause and fix                                                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `MISSING_CREDENTIAL`                                    | No key saved, or the variable was set after dsh started                                                                  |
| `UNKNOWN_MODEL`                                         | The model is not added under this provider                                                                               |
| 401 when fetching models                                | Wrong key. Check it on [API Keys](/keys)                                                                                 |
| Address and key are right but every request is rejected | Add `supportsDeveloperRole: false` and `maxTokensField: max_tokens` under the provider's `compat` (see the config above) |
| Mistyped Provider ID                                    | It cannot be edited. Delete the provider and create it again                                                             |
