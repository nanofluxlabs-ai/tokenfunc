WorkBuddy is Tencent's desktop assistant for office work and coding. Add this site as a custom model; it **only supports the OpenAI-compatible format**.

- Protocol: OpenAI-compatible (Chat Completions)
- Base URL: `{{baseUrl}}/v1`
- Models: any, for example `{{model}}`

:::tip
Update to the latest version first. Configuring custom models in the UI needs 4.8.0 or later, and older versions have since-fixed bugs such as empty replies. Download: [workbuddy.cn](https://workbuddy.cn)
:::

:::steps
### Open the model settings

Click your avatar at the bottom left, go to **Settings → Models** and click **Add Model**.

![The Models page in WorkBuddy settings with the Add Model button](todo:tools/workbuddy-models.png)

### Choose the custom provider and fill it in

Choose **Custom** as the provider and fill in:

| Field      | Value            |
| ---------- | ---------------- |
| URL        | `{{baseUrl}}/v1` |
| API Key    | `{{apiKey}}`     |
| Model name | `{{model}}`      |

WorkBuddy appends `/chat/completions` itself, so stop at `/v1` here.

![The custom model dialog with URL, API Key and model name filled in](todo:tools/workbuddy-custom.png)

### Set the model capabilities if needed

Under **Advanced**, tick "Supports tool calls", "Supports images" and so on to match the model. Keep the defaults if unsure.

If you turn on the **Custom protocol** switch in the advanced settings, the URL must be the full path: `{{baseUrl}}/v1/chat/completions`.

### Save and verify

After saving, open the model picker in the chat box, find the custom model group, select the new model and send a message.

On first use WorkBuddy may show a relay service risk warning. That is its notice for non-official addresses; confirm the address is `{{baseUrl}}` and continue.
:::

## Adding many models with the config file

To add several models at once, edit `~/.codebuddy/models.json` (Windows: `%USERPROFILE%\.codebuddy\models.json`). Changes apply without a restart. Note that `url` here must be the **full path**:

```json title="~/.codebuddy/models.json"
{
  "models": [
    {
      "id": "{{model}}",
      "name": "{{siteName}} {{model}}",
      "vendor": "OpenAI",
      "apiKey": "{{apiKey}}",
      "url": "{{baseUrl}}/v1/chat/completions",
      "maxInputTokens": 200000,
      "maxOutputTokens": 8192,
      "supportsToolCall": true,
      "supportsImages": false
    }
  ]
}
```

Save the file as UTF-8 without a BOM, or it may fail to load.

## Troubleshooting

| Symptom                             | Cause and fix                                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 404                                 | The URL in the UI is missing `/v1`; or Custom protocol is on without the full path; or `url` in models.json stops at `/v1` |
| 401                                 | Wrong key or no quota left. Check it on [API Keys](/keys)                                                                  |
| No Custom provider                  | Your enterprise admin disabled custom models. Ask the admin                                                                |
| Model does not show up after adding | The model ID clashes with a built-in model. Use another name or update to the latest version                               |
| 400 when sending an image           | The model cannot read images, or "Supports images" is not ticked                                                           |
