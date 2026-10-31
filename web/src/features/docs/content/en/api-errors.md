When a request fails, the API returns the matching HTTP status code and a JSON error body.

## Error format

Most errors use the OpenAI format. Errors raised as the request comes in, before any model is called (such as an invalid key), look like this, and `code` may be empty:

```json
{
  "error": {
    "message": "Invalid token (request id: 2026102912000012345)",
    "type": "new_api_error",
    "code": ""
  }
}
```

Errors raised once the request reaches the model also carry a `param` field, and `code` holds a specific error code:

```json
{
  "error": {
    "message": "Insufficient user quota, remaining quota: ... (request id: 2026102912000012345)",
    "type": "new_api_error",
    "param": "",
    "code": "insufficient_user_quota"
  }
}
```

Errors returned by the model provider usually keep the provider's `type`, `param` and `code`.

On `/v1/messages`, errors that happen once the request reaches the model use the Anthropic format:

```json
{
  "type": "error",
  "error": { "type": "invalid_request_error", "message": "..." }
}
```

The `request id` at the end of `message` identifies the request; include it when you contact support.

## Status codes

| Status | Meaning                                                                                                                  | Retry?                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| `400`  | Malformed request: invalid JSON, a missing required field, a bad value                                                   | No, fix the request           |
| `401`  | Invalid key: missing, unknown, expired, or the key's own quota is used up                                                | No, check the key             |
| `403`  | Not allowed: the key cannot use the model, the balance is too low, the IP is not allowlisted, or the account is disabled | No, change settings or top up |
| `404`  | Wrong endpoint address, usually one `/v1` too many or too few                                                            | No, check the address         |
| `413`  | Request body too large, typically a big image or file                                                                    | No, shrink the content        |
| `429`  | Too many requests                                                                                                        | Yes, after waiting            |
| `500`  | Internal error                                                                                                           | Yes                           |
| `503`  | No available channel for the model (`model_not_found`), or a misspelled model name                                       | Yes, or try another model     |
| Other  | An error from the model provider, passed through with its status and message                                             | Depends on the message        |

How to fix each one: [FAQ and troubleshooting](/docs/faq).

## Common error codes

In code, check `code` to tell errors apart; the `message` wording may change:

| `code`                           | Status | Meaning                                                                             |
| -------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `model_not_found`                | `503`  | No available channel for the model in the current group, or a misspelled model name |
| `insufficient_user_quota`        | `403`  | Not enough account balance (or enterprise credit or subscription quota)             |
| `pre_consume_token_quota_failed` | `403`  | The key's remaining quota cannot cover this request's pre-charge                    |
| `access_denied`                  | `403`  | The request IP is not on the key's allowlist                                        |
| `invalid_request`                | `400`  | Invalid request parameters, such as an image count out of range                     |

## Errors during streaming

An error that happens after streaming has started cannot change the HTTP status (200 was already sent). It arrives as a chunk in the stream instead, so check chunks for an `error` field while reading.

## Retry advice

- Retry only `429`, `500`, `503` and network timeouts. Other 4xx errors are deterministic and will fail again.
- Use exponential backoff with jitter, such as waiting 1, 2 and 4 seconds, for at most 3 to 5 attempts.
- The official OpenAI and Anthropic SDKs retry for you; set `max_retries`.

```python
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}", max_retries=3)
```
