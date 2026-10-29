Spend two minutes on these five ideas before integrating and you will avoid most common mistakes.

## Base URL

The base URL is the common prefix of every request:

:::base-url
:::

Tools differ in how they want this address, and this is the most common reason an integration fails:

| Protocol the tool uses                  | What to enter           | Example                           |
| --------------------------------------- | ----------------------- | --------------------------------- |
| OpenAI-compatible (most tools and SDKs) | Base URL + `/v1`        | `{{baseUrl}}/v1`                  |
| Anthropic (Claude Code and similar)     | Base URL only, no `/v1` | `{{baseUrl}}`                     |
| Tools that ask for the full endpoint    | Base URL + full path    | `{{baseUrl}}/v1/chat/completions` |

Tools append their own path to whatever you enter. One `/v1` too many or too few turns the final path into `/v1/v1/...` or drops a segment, and the request fails with 404.

## API key

Keys start with `sk-` and stand for your account. Anyone holding a key can spend your balance, so treat it like a password:

- Create one key per tool or project, so a leak only costs you that one key.
- Never commit keys to a repository or show them in screenshots or group chats.
- On [API Keys](/keys) you can limit a key by quota, models, IP and expiry.

Send the key in a request header. The usual form is `Authorization: Bearer {{apiKey}}`; the alternatives are on [Authentication](/docs/api-authentication).

## Groups

A group decides which models a key can use and at what rate it is billed. You choose the group when creating a key; filter by group on the [Model Square](/pricing) to see each group's models and prices.

If a model shows on the Model Square but calls say the key has no access, the key's group usually does not include that model.

## Model names

The `model` field must match the model name on this site **exactly**, including case and hyphens. To get the names:

- Copy them from the [Model Square](/pricing).
- Call [List models](/docs/api-models); it returns the models your key can use.

Some models accept a suffix that controls reasoning effort, such as `-thinking` or `-high`. See [reasoning models in Chat Completions](/docs/api-chat-completions#reasoning-models).

## Billing

Usage is charged to your balance as you go. Most text models bill per token, with separate input and output prices; some bill per call. Prices are on the [Model Square](/pricing).

- Every request and its charge is listed under Usage Logs in the console.
- Input served from the prompt cache is billed at the lower cache price, see [prompt caching in Anthropic Messages](/docs/api-messages#prompt-caching).
- Requests are rejected when the balance runs out and work again right after a top-up.
