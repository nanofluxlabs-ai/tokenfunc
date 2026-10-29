When a request fails, the API returns the matching HTTP status code and a JSON error body.

## Error format

Most errors use the OpenAI format:

```json
{
  "error": {
    "message": "Invalid token (request id: 2026102912000012345)",
    "type": "new_api_error",
    "code": ""
  }
}
```

On `/v1/messages`, errors that happen once the request reaches the model use the Anthropic format:

```json
{
  "type": "error",
  "error": { "type": "invalid_request_error", "message": "..." }
}
```

The `request id` at the end of `message` identifies the request; include it when you contact support.

## Status codes

| Status | Usual cause                                                                                                              | Retry?                        |
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
