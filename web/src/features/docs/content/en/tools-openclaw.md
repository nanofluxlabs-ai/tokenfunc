OpenClaw is an open-source personal AI assistant that runs on your own machine and connects to chat apps. It accepts custom model providers in both the OpenAI-compatible and the Anthropic format.

- Protocol: OpenAI-compatible or Anthropic
- Base URL: `{{baseUrl}}/v1` for OpenAI-compatible, `{{baseUrl}}` for Anthropic
- Models: any, for example `{{model}}`

## Option 1: setup wizard

:::steps
### Run the wizard

```bash
openclaw onboard
```

Choose **More… → Custom Provider**.

![The Custom Provider option in openclaw onboard](todo:tools/openclaw-onboard.png)

### Enter the provider details

| Prompt        | OpenAI-compatible | Anthropic            |
| ------------- | ----------------- | -------------------- |
| Base URL      | `{{baseUrl}}/v1`  | `{{baseUrl}}`        |
| API key       | `{{apiKey}}`      | `{{apiKey}}`         |
| Compatibility | OpenAI-compatible | Anthropic-compatible |
| Model ID      | `{{model}}`       | `{{model:claude}}`   |

With OpenAI-compatible the wizard fetches this site's model list for you to pick from; with Anthropic you type the model ID. Before saving, the wizard makes a real call to confirm it gets a reply.

### Verify

```bash
openclaw models list --provider tokenfunc
```

If it lists this site's models, you are set. The wizard names the provider `custom-` plus the host by default; replace `tokenfunc` in the command with the actual name.
:::

## Option 2: one command

```bash
openclaw onboard --non-interactive --auth-choice custom-api-key \
  --custom-provider-id tokenfunc \
  --custom-base-url "{{baseUrl}}/v1" \
  --custom-model-id "{{model}}" \
  --custom-api-key "{{apiKey}}" \
  --custom-compatibility openai
```

## Option 3: edit the config file

The config file is `~/.openclaw/openclaw.json` (JSON5, comments allowed). Changes apply automatically:

```json5 title="~/.openclaw/openclaw.json"
{
  agents: { defaults: { model: { primary: 'tokenfunc/{{model}}' } } },
  models: {
    mode: 'merge',
    providers: {
      tokenfunc: {
        baseUrl: '{{baseUrl}}/v1',
        apiKey: '{{apiKey}}',
        api: 'openai-completions',
        models: [
          {
            id: '{{model}}',
            name: '{{model}}',
            contextWindow: 200000,
            maxTokens: 8192,
          },
        ],
      },
    },
  },
}
```

- For the Anthropic format, set `baseUrl` to `{{baseUrl}}` and `api` to `"anthropic-messages"`.
- For image input, add `input: ["text", "image"]` to the model.
- To change the default model: `openclaw models set tokenfunc/{{model}}`.

## Troubleshooting

| Symptom                                           | Cause and fix                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Model unavailable / not allowed by modelPolicy    | The model is only listed under `agents.defaults`. It must also be in `providers.tokenfunc.models` |
| "returned no token usage"                         | Add `compat: { supportsUsageInStreaming: true }` to the model                                     |
| Upstream rejects reasoning_effort                 | Add `compat: { supportsReasoningEffort: false }` to the model                                     |
| 404                                               | The OpenAI-compatible `baseUrl` is missing `/v1`                                                  |
| Changes made with `openclaw configure` do nothing | Providers are changed through `openclaw onboard` or the config file                               |
