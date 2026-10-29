Hermes Agent is an open-source command-line assistant from Nous Research. Connect it to this site as a custom endpoint.

- Protocol: OpenAI-compatible (Chat Completions)
- Base URL: `{{baseUrl}}/v1`
- Models: models with 64K+ context, for example `{{model}}`

:::warning
Current Hermes no longer reads the `OPENAI_BASE_URL` environment variable for custom endpoints (older guides that rely on it no longer work). Use the wizard or the config file below.
:::

:::steps
### Install Hermes

:::tabs
@tab macOS / Linux

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

@tab Windows

```powershell
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```
:::

### Run the setup wizard

```bash
hermes model
```

Choose **Custom endpoint** and answer the prompts:

| Prompt         | Value                                            |
| -------------- | ------------------------------------------------ |
| Base URL       | `{{baseUrl}}/v1`                                 |
| API key        | `{{apiKey}}`                                     |
| Model          | `{{model}}`                                      |
| API mode       | `chat_completions`                               |
| Context length | The model's context length, for example `200000` |

Hermes requires at least 64K of context. This site does not report context length, so enter it yourself.

![The Custom endpoint screen of the hermes model wizard](todo:tools/hermes-wizard.png)

### Verify

```bash
hermes chat -q "reply ok" --oneshot
```

A reply means you are connected. `hermes doctor` also checks the configuration.
:::

## Configuring with a file

Instead of the wizard you can edit the config file and keep the key in a `.env` file next to it:

:::tabs
@tab macOS / Linux

```yaml title="~/.hermes/config.yaml"
model:
  default: {{model}}
  provider: custom
  base_url: {{baseUrl}}/v1
  key_env: TOKENFUNC_API_KEY
```

```bash title="~/.hermes/.env"
TOKENFUNC_API_KEY={{apiKey}}
```

@tab Windows

```yaml title="%LOCALAPPDATA%\\hermes\\config.yaml"
model:
  default: {{model}}
  provider: custom
  base_url: {{baseUrl}}/v1
  key_env: TOKENFUNC_API_KEY
```

```bash title="%LOCALAPPDATA%\\hermes.env"
TOKENFUNC_API_KEY={{apiKey}}
```
:::

## Switching models

In a session type `/model custom:<model name>`, for example `/model custom:{{model}}`. To add another endpoint, leave the session and run `hermes model` again.

## Troubleshooting

| Symptom                                  | Cause and fix                                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_BASE_URL` is set but ignored     | It now only applies to the official OpenAI provider. Use the wizard or config.yaml                                   |
| Not enough context at startup            | The model has less than 64K context. Pick a longer-context model or enter the right length in the wizard             |
| Connects but replies are garbled or fail | Wrong address or model name. Make sure the address ends with `/v1` and the name matches the [Model Square](/pricing) |
| 401                                      | Wrong key or no quota left. Check it on [API Keys](/keys)                                                            |
