Cline is an AI coding extension for VS Code that can read and write files and run commands. It supports several API providers; two of them work with this site:

| Provider                        | Base URL         | Models                                        | Best for                                     |
| ------------------------------- | ---------------- | --------------------------------------------- | -------------------------------------------- |
| OpenAI Compatible (recommended) | `{{baseUrl}}/v1` | Any model on this site, entered by name       | Most cases                                   |
| Anthropic                       | `{{baseUrl}}`    | Only Claude models from Cline's built-in list | Claude only, with full reasoning and caching |

Cline calls tools constantly, so pick a model with tool calling, for example `{{model}}`.

## Install

Search for **Cline** in the VS Code Extensions view and install it. A Cline icon appears in the activity bar.

## Option 1: OpenAI Compatible (recommended)

:::steps
### Open the API settings

Click the gear icon at the top right of the Cline panel, or the model name below the input box. Set **API Provider** to **OpenAI Compatible**.

### Enter the connection details

| Field    | Value            |
| -------- | ---------------- |
| Base URL | `{{baseUrl}}/v1` |
| API Key  | `{{apiKey}}`     |
| Model ID | `{{model}}`      |

Pick the Model ID from the dropdown (Cline fetches this site's model list) or type it.

![Cline's OpenAI Compatible form with Base URL, API Key and Model ID filled in](todo:tools/cline-openai-compatible.png)

### Set the model parameters

Expand **Model Configuration** and fill it in for the model you chose:

- **Context Window Size**: the model's context length, for example `200000` for flagship Claude and GPT models. Left empty, a small default applies and long tasks may be cut short.
- **Max Output Tokens**: the maximum output per call, for example `8192`.
- **Supports Images**: check it if the model can read images.

### Verify

Give Cline a small task such as "Read the README and summarize it in three sentences". If it reads the file and answers, you are set.
:::

## Option 2: Anthropic

:::steps
### Choose the provider

Set API Provider to **Anthropic** and enter `{{apiKey}}` as the **Anthropic API Key**.

### Override the base URL

Check **Use custom base URL** and enter `{{baseUrl}}` (**without** `/v1`).

![Cline's Anthropic settings with Use custom base URL checked and this site's address entered](todo:tools/cline-anthropic.png)

### Choose a model

Pick a Claude model from the Model dropdown. That list is built into Cline, and the name must match a model on this site; check it on the [Model Square](/pricing).
:::

## Tips

- Cline has a Plan mode and an Act mode with separate model settings. Configure both.
- To see what each task cost, check Usage Logs in the console.

## Troubleshooting

| Symptom                                          | Cause and fix                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| Invalid API Key                                  | Wrong key or no quota left. Check it on [API Keys](/keys)                       |
| Model Not Found                                  | The Model ID does not match a model on this site                                |
| Connection error / 404                           | OpenAI Compatible is missing `/v1`, or the Anthropic address has an extra `/v1` |
| Context length error halfway through a task      | Context Window Size is larger than the model's real limit. Use the actual value |
| Calls the same tool over and over, broken output | The model is not capable enough. Switch to a flagship model                     |
