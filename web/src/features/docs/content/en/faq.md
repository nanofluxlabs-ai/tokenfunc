First make sure the key and address work on their own, then look at the tool's settings. If the command below returns a model list, the key is valid and the site is reachable, and the problem is in the tool configuration.

:::tabs
@tab cURL

```bash
curl {{baseUrl}}/v1/models -H "Authorization: Bearer {{apiKey}}"
```

@tab PowerShell

```powershell
Invoke-RestMethod -Uri "{{baseUrl}}/v1/models" -Headers @{ Authorization = "Bearer {{apiKey}}" }
```
:::

## Find the cause from the error

| Error                                          | Usual cause                                                                          | What to do                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `401` invalid token                            | Key copied incompletely or with spaces; key deleted, expired or out of its own quota | Check the key's status and remaining quota on [API Keys](/keys) and copy it again |
| `403` token has no access to the model         | The key limits its models, or its group does not include the model                   | Allow the model in the key settings, or use a key from another group              |
| `403` insufficient user quota                  | Account balance is too low                                                           | Top up under Wallet; requests work again right away                               |
| `404` Not Found                                | One `/v1` too many or too few in the base URL                                        | Check the address against the tool guide, see [Core concepts](/docs/concepts)     |
| `503` no available channel / `model_not_found` | Wrong model name, or the model is temporarily unavailable                            | Copy the name from the [Model Square](/pricing); try another model                |
| `429`                                          | Too many requests                                                                    | Lower concurrency and retry later                                                 |
| `413`                                          | Request body too large (usually a big image or file)                                 | Compress the image or send an image URL instead                                   |
| Timeout or no response                         | Very long output or an unstable network                                              | Turn on streaming; check your proxy settings                                      |

More status codes and retry advice are on [Errors](/docs/api-errors).

## FAQ

### Does the base URL include /v1 or not?

It depends on the protocol the tool uses: OpenAI-compatible tools want `/v1`, Anthropic-protocol tools such as Claude Code do not. Every tool guide says which; when in doubt, see the table on [Choose a tool](/docs/tools-overview).

### The model is on the Model Square, so why does the call say I have no access?

The Model Square lists every model on the site. Which models a key can use depends on its group and on any model limits set on the key. [List models](/docs/api-models) returns what your key can actually use.

### Where do I see usage and charges?

Usage Logs in the console lists every request with its model, token counts and cost.

### My balance is fine, why does it say the quota is insufficient?

A key can have its own quota limit, and requests are rejected once it is used up. Check the key's remaining quota on [API Keys](/keys) and raise it or set it to unlimited.

### Calls fail after moving to another network or server?

If the key has an IP allowlist, requests from a new outbound IP are rejected. Update the allowlist in the key settings.

### The tool shows a "relay service risk" warning or similar?

Some tools, WorkBuddy for example, warn when they detect a non-official address. That is the tool's own notice; confirm the address is `{{baseUrl}}` and continue.
