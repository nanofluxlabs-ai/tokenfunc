Any app, extension or SDK that lets you set a custom OpenAI address works with this site. Apps differ in how they want the address, so here are the general rules and the settings for common clients.

## General rules

| The app asks for                                              | Enter                             |
| ------------------------------------------------------------- | --------------------------------- |
| API address / API host / base URL (the app adds `/v1` itself) | `{{baseUrl}}`                     |
| Base URL (the app does not add `/v1`; most SDKs)              | `{{baseUrl}}/v1`                  |
| The full endpoint                                             | `{{baseUrl}}/v1/chat/completions` |

When unsure, try `{{baseUrl}}/v1` first and switch to `{{baseUrl}}` if you get 404. Many apps preview the final request URL in their settings; it should read `{{baseUrl}}/v1/chat/completions`.

## Cherry Studio

:::steps
### Add a provider

Open **Settings → Model Provider**, click **+ Add Provider** at the bottom of the list, and enter a name and the API key `{{apiKey}}`.

### Fill in the endpoint

Enter `{{baseUrl}}` in the **OpenAI** endpoint field. Cherry Studio adds `/v1` itself and previews the final request path below the field so you can check it. For the full Claude feature set, also enter `{{baseUrl}}` in the **Anthropic** field.

![Cherry Studio's Add Provider window with the endpoint and the request path preview](todo:tools/cherry-studio-provider.png)

### Add models and check

Click **Fetch model list** and add the models you want (or add `{{model}}` by hand). Then click **Check**, test a model, and turn on the provider switch at the top right.
:::

## Chatbox

:::steps
### Add a model provider

Open **Settings → Model Provider**, click **Add**, enter a name and set **API Mode** to **OpenAI API Compatible**.

### Enter the host and key

| Field    | Value         |
| -------- | ------------- |
| API Key  | `{{apiKey}}`  |
| API Host | `{{baseUrl}}` |
| API Path | Leave empty   |

With API Path empty, Chatbox appends `/v1/chat/completions`. If you fill in API Path, the host must include `/v1` itself.

In **Claude API Compatible** mode, the API host must be `{{baseUrl}}/v1`.

### Add models and check

In the models section click **Fetch** to load the list, or **New** to add `{{model}}` by hand, then save and click **Check**.
:::

## In your own code

Every OpenAI SDK accepts a custom base URL, with `/v1`:

:::tabs
@tab Python

```python
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")
```

@tab Node.js

```javascript
import OpenAI from 'openai'

const client = new OpenAI({ baseURL: '{{baseUrl}}/v1', apiKey: '{{apiKey}}' })
```

@tab Environment variables

```bash
# Most tools built on the OpenAI SDK read these two variables
export OPENAI_BASE_URL="{{baseUrl}}/v1"
export OPENAI_API_KEY="{{apiKey}}"
```
:::

The OpenAI components in LangChain, LlamaIndex and similar frameworks take the same `base_url` and `api_key`. More patterns are in [Examples](/docs/examples-chat).

## Troubleshooting

| Symptom                         | Cause and fix                                               |
| ------------------------------- | ----------------------------------------------------------- |
| 404                             | One `/v1` too many or too few. Adjust using the rules above |
| The fetched model list is empty | The key's group has no models, or the key limits its models |
| 401                             | Wrong key or no quota left. Check it on [API Keys](/keys)   |
