Every model endpoint needs your key in a request header. Create keys on [API Keys](/keys).

## Bearer token (recommended)

Works on every endpoint:

```http
Authorization: Bearer {{apiKey}}
```

The `sk-` prefix is optional.

## Other forms

For compatibility with vendor SDKs, some endpoints also accept:

| Header / parameter           | Endpoints                                        | Notes                                                                |
| ---------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| `x-api-key: {{apiKey}}`      | `/v1/messages`, `/v1/models`                     | The Anthropic SDK form, usually with `anthropic-version: 2023-06-01` |
| `x-goog-api-key: {{apiKey}}` | Gemini native `/v1beta/models/...`, `/v1/models` | The Google SDK form                                                  |
| `?key={{apiKey}}`            | Gemini native `/v1beta/models/...`, `/v1/models` | In the URL, where logs can capture it; not recommended               |

```bash
# Anthropic format
curl {{baseUrl}}/v1/messages \
  -H "x-api-key: {{apiKey}}" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model": "{{model:claude}}", "max_tokens": 256, "messages": [{"role": "user", "content": "Hello"}]}'
```

## Key limits

When you create or edit a key you can set these limits; requests beyond them are rejected:

| Limit          | When exceeded                         |
| -------------- | ------------------------------------- |
| Quota cap      | `401` once the key's quota is used up |
| Allowed models | `403` for models the key may not use  |
| IP allowlist   | `403` for requests from other IPs     |
| Expiry         | `401` after expiry                    |
| Group          | Only the group's models are available |

## Security advice

- A key is a payment credential: whoever holds it can spend your balance.
- Use one key per tool or project and give it a quota cap when it makes sense.
- Never put keys in frontend code, commit them, or paste them in chats. Call the API from the browser only through your own backend.
- If a key may have leaked, delete or disable it on [API Keys](/keys) right away.
