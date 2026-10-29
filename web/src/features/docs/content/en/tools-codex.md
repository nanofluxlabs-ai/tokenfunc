Codex is OpenAI's official command-line coding agent and only speaks the OpenAI **Responses** protocol. Connect it by adding a custom model provider to its config file.

- Protocol: OpenAI Responses (`/v1/responses`)
- Base URL: `{{baseUrl}}/v1` (**with** `/v1`)
- Models: the GPT family, for example `{{model}}`

## Option 1: one-click import with CC Switch (recommended)

With [CC Switch](https://github.com/farion1231/cc-switch) installed, click the button below, make sure Codex is selected in the dialog and pick a model.

:::cc-switch{app="codex"}
:::

Enable the imported provider in CC Switch, then skip to the verify step below.

## Option 2: manual setup

:::steps
### Install Codex

:::tabs
@tab macOS / Linux

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

@tab Windows

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
```

@tab npm

```bash
npm install -g @openai/codex
```
:::

### Write the config file

Add the content below to the Codex config file. If the file already has content, note that the `model` and `model_provider` lines **must come first**, before any `[...]` section; otherwise they are read as fields of the section above them and ignored.

:::tabs
@tab macOS / Linux

```toml title="~/.codex/config.toml"
model = "{{model}}"
model_provider = "tokenfunc"

[model_providers.tokenfunc]
name = "{{siteName}}"
base_url = "{{baseUrl}}/v1"
env_key = "TOKENFUNC_API_KEY"
wire_api = "responses"
requires_openai_auth = false
```

@tab Windows

```toml title="%USERPROFILE%.codex\\config.toml"
model = "{{model}}"
model_provider = "tokenfunc"

[model_providers.tokenfunc]
name = "{{siteName}}"
base_url = "{{baseUrl}}/v1"
env_key = "TOKENFUNC_API_KEY"
wire_api = "responses"
requires_openai_auth = false
```
:::

- `env_key` tells Codex to read the key from the `TOKENFUNC_API_KEY` environment variable, which you set next.
- You can rename the provider (`tokenfunc`), but `openai`, `ollama` and `lmstudio` are reserved.

### Set the key as an environment variable

Codex recommends keeping the key out of the config file and in an environment variable.

:::tabs
@tab macOS / Linux

```bash
# Save it in your shell profile so new terminals get it too (bash users: ~/.bashrc instead of ~/.zshrc)
echo 'export TOKENFUNC_API_KEY="{{apiKey}}"' >> ~/.zshrc
source ~/.zshrc
```

@tab Windows

```powershell
# Saved permanently; open a new terminal afterwards
setx TOKENFUNC_API_KEY "{{apiKey}}"
```
:::

### Start and verify

Open a new terminal, run `codex` and type `/status`. Check that the provider is `tokenfunc` and the model is the one you set. Then send "Reply with exactly: ok"; a reply means you are connected.

![The /status output in Codex showing the tokenfunc provider and the current model](todo:tools/codex-status.png)
:::

## Choosing and switching models

- The default model comes from `model` in the config file.
- To switch once, run `codex -m {{model}}`, or type `/model` in a session.
- Codex relies on the Responses endpoint and tool calling. Some non-OpenAI models may not fully support them; if something looks wrong, switch back to a GPT model first.

## Troubleshooting

| Symptom                                    | Cause and fix                                                                                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wire_api = "chat" is no longer supported` | Current Codex removed the chat protocol. Use `wire_api = "responses"`                                                                                                        |
| 401 / missing key                          | The variable did not reach Codex. Open a new terminal after setting it; the Codex desktop app does not see variables exported in a terminal, so use the permanent form above |
| 404                                        | `base_url` is missing `/v1`                                                                                                                                                  |
| Settings ignored, still talks to OpenAI    | `model_provider` sits under a `[...]` section. Move it to the top of the file                                                                                                |
| Streaming stalls or stops halfway          | A proxy is buffering the stream. Check the proxy or switch networks                                                                                                          |

Other errors: see [FAQ and troubleshooting](/docs/faq).
