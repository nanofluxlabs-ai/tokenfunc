Trae is an AI code editor from ByteDance. Its settings let you add a custom model in either the OpenAI-compatible or the Anthropic format. The steps are the same in the China and international editions.

- Protocol: OpenAI-compatible or Anthropic
- Base URL: `{{baseUrl}}/v1` for OpenAI-compatible, `{{baseUrl}}` for Anthropic
- Models: any, for example `{{model}}`

:::tip
Update Trae to the latest version first. Older versions do not complete the endpoint path, and the values below would fail there.
:::

:::steps
### Open the Add Model dialog

In Trae open **Settings → Models** and click **Add Model**. You can also click "Add Model" at the bottom of the model list in the chat box.

![The Models page in Trae settings with the Add Model button](todo:tools/trae-models.png)

### Choose Custom Model and the API format

Choose **Custom Model** as the provider, then set **API Format**:

- **OpenAI Chat Completions**: for GPT, DeepSeek, GLM, Kimi, Gemini and similar models.
- **Anthropic Messages**: for Claude models.

### Enter the address, model and key

Make sure the **Full URL** switch is **off**, then fill in:

| Field              | OpenAI Chat Completions | Anthropic Messages |
| ------------------ | ----------------------- | ------------------ |
| Custom request URL | `{{baseUrl}}/v1`        | `{{baseUrl}}`      |
| Model ID           | `{{model}}`             | `{{model:claude}}` |
| API key            | `{{apiKey}}`            | `{{apiKey}}`       |

The display name is up to you.

If you turn **Full URL** on, enter the full path instead: `{{baseUrl}}/v1/chat/completions` for OpenAI or `{{baseUrl}}/v1/messages` for Anthropic.

![Trae's custom model form with API format, request URL, model ID and API key filled in and Full URL off](todo:tools/trae-custom-model.png)

### Adjust the advanced settings if needed

Expand **Advanced Settings** to set the context window, image input, thinking mode and so on to match the model. Keep the defaults if unsure.

### Add and verify

Click **Add Model**. Trae makes a real call to check the settings: on success the model joins the list; on failure it shows the error, which you can look up below.

Then choose the model in the chat box and send a message to confirm it replies.
:::

## Troubleshooting

| Symptom                                  | Cause and fix                                                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 404 when adding                          | The address does not match the Full URL switch. With it off, stop at `/v1` (or the bare address); with it on, enter the full path |
| 401 when adding                          | Wrong key or no quota left. Check it on [API Keys](/keys)                                                                         |
| Model not found / no available channel   | The model ID does not match this site. Copy it from the [Model Square](/pricing)                                                  |
| Added but not in the chat model list     | The model is disabled in the list. Enable it under Settings → Models                                                              |
| Can Claude models use the OpenAI format? | Yes, this site converts automatically, but the Anthropic format gives fuller reasoning and caching support                        |
