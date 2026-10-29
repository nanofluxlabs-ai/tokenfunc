Cursor lets you bring your own OpenAI key and override the API address, which is how you use this site's models in it. Everything happens in Cursor's settings screen.

- Protocol: OpenAI-compatible
- Base URL: `{{baseUrl}}/v1`
- Models: GPT, DeepSeek, Gemini and others, for example `{{model}}`

:::warning
Know these three limits first:

- **Only Chat and Agent use your models.** Tab completion and Apply keep using Cursor's built-in models.
- **Model names must not start with `claude-`.** Cursor picks the vendor key by model name, and `claude-` names look for an Anthropic key and fail. This site's Claude models therefore cannot be used in Cursor this way.
- With the base URL override on, requests for Cursor's own OpenAI models also go to this site. Turn the switch off when you want Cursor's built-in models back.
:::

:::steps
### Open the model settings

Open Cursor, go to **Cursor Settings → Models**, scroll to the bottom and expand **API Keys**.

![The bottom of the Models page in Cursor Settings with the API Keys section expanded](todo:tools/cursor-api-keys.png)

### Enter the key and address

1. Paste your key into **OpenAI API Key**: `{{apiKey}}`
2. Turn on **Use OpenAI API Key**.
3. Turn on **Override OpenAI Base URL** and enter: `{{baseUrl}}/v1`

![OpenAI API Key filled in, both switches on, and the base URL entered](todo:tools/cursor-override.png)

### Add the model

In the model list on the same page click **+ Add Model**, type a model name from this site such as `{{model}}`, press Enter and make sure it is checked.

The name must match the [Model Square](/pricing) exactly.

![The Add Model field in the model list with a model name from this site](todo:tools/cursor-add-model.png)

### Verify

Restart Cursor, start a new chat, choose the model you just added and send a message. A reply means it works.

The Verify button in settings only checks connectivity, not whether the model name exists, so trust the actual chat.
:::

## Troubleshooting

| Symptom                                      | Cause and fix                                                                                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model name is not valid / AI Model Not Found | The model name starts with `claude-`, or Use OpenAI API Key is off. Use another model and check both switches                                        |
| Spins forever, no reply                      | Cursor sends requests through its own servers first, so this site must be reachable from the public internet. Private or local addresses do not work |
| Monthly usage limit reached                  | On Cursor Team or Enterprise plans, bring-your-own-key usage still counts under Cursor's rules. Ask your team admin                                  |
| No API Keys section in settings              | Your enterprise admin disabled personal keys. Ask the admin                                                                                          |
| 401 / 403                                    | Wrong key, not enough quota, or the key cannot use the model. See [FAQ and troubleshooting](/docs/faq)                                               |
